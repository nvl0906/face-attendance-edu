"""
Cross-node attendance cooldown state, backed by Supabase.

`attendance` is the single source of truth. Each process keeps a small
in-memory mirror — (classroom_id, student_id) -> last checked-in timestamp —
kept in sync via Supabase Realtime so every node/worker agrees on who was
just marked, without a DB round-trip per frame and without a separate
Redis/pubsub layer.
"""

import asyncio
from datetime import datetime, timezone
import numpy as np
from scipy.spatial.distance import cosine


class CooldownStore:
    def __init__(self, supabase, cooldown_minutes: int = 1):
        self._supabase = supabase
        self._cooldown = cooldown_minutes
        self._cache: dict[tuple[str, str], datetime] = {}
        self._channel = None
        self._prune_task: asyncio.Task | None = None

    # ── lifecycle ──────────────────────────────────────────────────────
    async def start(self):
        await self._seed_from_db()

        self._channel = self._supabase.channel("attendance-cooldown")
        self._channel.on_postgres_changes(
            "INSERT",
            schema="public",
            table="attendance",
            callback=self._on_insert,
        )

        subscribed = asyncio.get_event_loop().create_future()

        def _on_status(status, err):
            if err:
                print(f"[CooldownStore] subscribe error: {err}")
            if not subscribed.done():
                subscribed.set_result(status)

        await self._channel.subscribe(_on_status)
        await subscribed  # don't start serving frames until we know we're live

        self._prune_task = asyncio.create_task(self._prune_loop())

    async def stop(self):
        if self._prune_task:
            self._prune_task.cancel()
        if self._channel is not None:
            await self._supabase.remove_channel(self._channel)
            self._channel = None

    # ── seeding (covers restarts: don't re-fire for people just marked) ──
    async def _seed_from_db(self):
        cutoff = datetime.now(timezone.utc).timestamp() - self._cooldown * 60
        cutoff_iso = datetime.fromtimestamp(cutoff, tz=timezone.utc).isoformat()

        resp = await (
            self._supabase.table("attendance")
            .select("student_id, classroom_id, checked")
            .gte("checked", cutoff_iso)
            .execute()
        )
        for row in resp.data or []:
            self._update(row["classroom_id"], row["student_id"], row["checked"])

    # ── realtime callback (sync — payload shape can vary by client version,
    #    so probe a couple of common shapes) ─────────────────────────────
    def _on_insert(self, payload: dict):
        record = (
            payload.get("data", {}).get("record")
            or payload.get("record")
            or payload.get("new")
            or {}
        )
        classroom_id = record.get("classroom_id")
        student_id = record.get("student_id")
        checked = record.get("checked")
        if classroom_id and student_id and checked:
            self._update(classroom_id, student_id, checked)

    def _update(self, classroom_id: str, student_id: str, checked_iso: str):
        key = (classroom_id, student_id)
        ts = datetime.fromisoformat(checked_iso)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if key not in self._cache or ts > self._cache[key]:
            self._cache[key] = ts

    # ── query surface used by the websocket handler ─────────────────────
    def is_on_cooldown(self, classroom_id: str, student_id: str) -> bool:
        last = self._cache.get((classroom_id, student_id))
        return last is not None and (
            datetime.now(timezone.utc) - last
        ).total_seconds() < self._cooldown * 60

    def mark_locally(self, classroom_id: str, student_id: str):
        """Call right after a successful insert on THIS node, so it doesn't
        double-fire on the next frame while the realtime event is in flight."""
        self._cache[(classroom_id, student_id)] = datetime.now(timezone.utc)

    # ── keep the dict from growing forever over a long-running process ──
    async def _prune_loop(self):
        while True:
            await asyncio.sleep(60)
            cutoff = datetime.now(timezone.utc)
            stale = [
                k for k, ts in self._cache.items()
                if (cutoff - ts).total_seconds() >= self._cooldown * 60
            ]
            for k in stale:
                del self._cache[k]


class EmbeddingStore:
    def __init__(self, supabase, threshold: float = 0.59999):
        self._supabase = supabase
        self._threshold = threshold
        # classroom_id -> { student_id: (fullname, embedding) }
        self._cache: dict[str, dict[str, tuple[str, np.ndarray]]] = {}
        self._loaded_classrooms: set[str] = set()
        self._channel = None

    async def start(self):
        self._channel = self._supabase.channel("face-embedding-sync")
        self._channel.on_postgres_changes(
            "INSERT", schema="public", table="face_embedding", callback=self._on_change,
        )
        self._channel.on_postgres_changes(
            "UPDATE", schema="public", table="face_embedding", callback=self._on_change,
        )
        await self._channel.subscribe()

    async def stop(self):
        if self._channel is not None:
            await self._supabase.remove_channel(self._channel)
            self._channel = None

    # ── lazy per-classroom load — don't pull every classroom on boot ────
    async def ensure_loaded(self, classroom_id: str):
        if classroom_id in self._loaded_classrooms:
            return
        resp = await (
            self._supabase.table("face_embedding")
            .select("student_id, fullname, embedding")
            .eq("classroom_id", classroom_id)
            .execute()
        )
        bucket = self._cache.setdefault(classroom_id, {})
        for row in resp.data or []:
            bucket[row["student_id"]] = (row["fullname"], np.array(row["embedding"], dtype=np.float32))
        self._loaded_classrooms.add(classroom_id)

    # ── realtime callback keeps every node's cache current ─────────────
    def _on_change(self, payload: dict):
        record = (
            payload.get("data", {}).get("record")
            or payload.get("record")
            or payload.get("new")
            or {}
        )
        classroom_id = record.get("classroom_id")
        student_id = record.get("student_id")
        fullname = record.get("fullname")
        embedding = record.get("embedding")
        if not (classroom_id and student_id and fullname and embedding):
            return
        bucket = self._cache.setdefault(classroom_id, {})
        bucket[student_id] = (fullname, np.array(embedding, dtype=np.float32))
        self._loaded_classrooms.add(classroom_id)  # in case an insert arrives before ensure_loaded ever ran

    # ── write path — called from /embeddings after computing a face ────
    async def upsert(self, classroom_id: str, student_id: str, fullname: str, embedding: np.ndarray):
        await (
            self._supabase.table("face_embedding")
            .upsert({
                "classroom_id": classroom_id,
                "student_id":   student_id,
                "fullname":     fullname,
                "embedding":    embedding.tolist(),
            })
            .execute()
        )
        # optimistic local update — same reasoning as CooldownStore.mark_locally
        self._cache.setdefault(classroom_id, {})[student_id] = (fullname, embedding)

    # ── match — same cosine logic as before, just reading the new cache ─
    def match(self, classroom_id: str, embedding: np.ndarray) -> tuple[str, str] | None:
        embedding = embedding / (np.linalg.norm(embedding) or 1)
        best, best_dist = None, float("inf")
        for student_id, (fullname, known) in self._cache.get(classroom_id, {}).items():
            if embedding.shape != known.shape:
                continue
            dist = cosine(embedding, known)
            if dist < self._threshold and dist < best_dist:
                best, best_dist = (student_id, fullname), dist
        return best