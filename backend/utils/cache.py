"""
Cross-node attendance cooldown state, backed by Supabase.

`attendance` is the single source of truth. Each process keeps a small
in-memory mirror — (classroom_id, student_id) -> last checked-in timestamp —
kept in sync via Supabase Realtime so every node/worker agrees on who was
just marked, without a DB round-trip per frame and without a separate
Redis/pubsub layer.
"""

import asyncio
from datetime import datetime, timezone, timedelta, time
import numpy as np
from scipy.spatial.distance import cosine
from dateutil.parser import parse as parse_dt
from zoneinfo import ZoneInfo

MADAGASCAR_OFFSET = timedelta(hours=3)
TZ = ZoneInfo("Indian/Antananarivo")

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
        ts = parse_dt(checked_iso)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        ts -= MADAGASCAR_OFFSET
        if key not in self._cache or ts > self._cache[key]:
            self._cache[key] = ts

    # ── query surface used by the websocket handler ─────────────────────
    def is_on_cooldown(self, classroom_id: str, student_id: str) -> bool:
        last = self._cache.get((classroom_id, student_id))
        return last is not None and (
            datetime.now(timezone.utc) - last
        ).total_seconds() < self._cooldown * 60

    def mark_locally(self, classroom_id: str, student_id: str, checked_iso: str | None = None):
        """Call right after a successful insert on THIS node. Pass the `checked`
        value Postgres actually assigned (from the insert response), so every
        node's cooldown clock is anchored to Postgres's clock — not this node's
        local wall clock, which can drift from Postgres's and from other nodes'."""
        if checked_iso is not None:
            self._update(classroom_id, student_id, checked_iso)
        else:
            # fallback only if the insert response somehow didn't include it
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
        self._cache: dict[str, dict[str, tuple[str, np.ndarray]]] = {}
        self._loaded_on: dict[str, str] = {}
        # classroom_id -> {(student_id, session)}; session None = whole day
        self._blocked: dict[str, set[tuple[str, str | None]]] = {}
        self._afternoon_start: dict[str, time] = {}   # classroom_id -> start_afternoon
        self._channel = None

    @staticmethod
    def _today() -> str:
        return datetime.now(TZ).date().isoformat()

    @staticmethod
    def _record(payload: dict) -> dict:
        return (
            payload.get("data", {}).get("record")
            or payload.get("record")
            or payload.get("new")
            or {}
        )

    def _current_session(self, classroom_id: str) -> str:
        start = self._afternoon_start.get(classroom_id, time(12, 0))  # fallback
        return "morning" if datetime.now(TZ).time() < start else "afternoon"

    def blocked_now(self, classroom_id: str) -> int:
        session = self._current_session(classroom_id)
        return sum(
            1 for _, s in self._blocked.get(classroom_id, ()) if s in (session, None)
        )

    async def start(self):
        self._channel = self._supabase.channel("face-embedding-sync")
        self._channel.on_postgres_changes(
            "UPDATE", schema="public", table="student", callback=self._on_change,
        )
        self._channel.on_postgres_changes(
            "INSERT", schema="public", table="penalty", callback=self._on_penalty,
        )
        await self._channel.subscribe()

    async def stop(self):
        if self._channel is not None:
            await self._supabase.remove_channel(self._channel)
            self._channel = None

    async def ensure_loaded(self, classroom_id: str, force: bool = False):
        today = self._today()
        if not force and self._loaded_on.get(classroom_id) == today:
            return

        students = await (
            self._supabase.table("student")
            .select("id, fullname, embedding")
            .eq("classroom_id", classroom_id)
            .execute()
        )
        penalties = await (
            self._supabase.table("penalty")
            .select("student_id, session")
            .eq("classroom_id", classroom_id)
            .eq("penalty_date", today)
            .execute()
        )
        classroom = await (
            self._supabase.table("classroom")
            .select("start_afternoon")
            .eq("id", classroom_id)
            .single()
            .execute()
        )

        if classroom.data and classroom.data.get("start_afternoon"):
            self._afternoon_start[classroom_id] = time.fromisoformat(
                classroom.data["start_afternoon"]
            )

        # everyone with a face stays in the cache; blocking happens in match()
        self._cache[classroom_id] = {
            r["id"]: (r["fullname"], np.array(r["embedding"], dtype=np.float32))
            for r in (students.data or [])
            if r.get("embedding")
        }
        self._blocked[classroom_id] = {
            (p["student_id"], p["session"]) for p in (penalties.data or [])
        }
        self._loaded_on[classroom_id] = today

    def _on_change(self, payload: dict):
        record = self._record(payload)
        classroom_id, student_id = record.get("classroom_id"), record.get("id")
        fullname, embedding = record.get("fullname"), record.get("embedding")
        if not (classroom_id and student_id and fullname and embedding):
            return
        self._cache.setdefault(classroom_id, {})[student_id] = (
            fullname, np.array(embedding, dtype=np.float32)
        )

    def _on_penalty(self, payload: dict):
        record = self._record(payload)
        classroom_id, student_id = record.get("classroom_id"), record.get("student_id")
        if not (classroom_id and student_id):
            return
        if record.get("penalty_date") != self._today():
            return
        self._blocked.setdefault(classroom_id, set()).add(
            (student_id, record.get("session"))
        )

    async def upsert(self, classroom_id, student_id, fullname, embedding):
        if not embedding:
            return
        self._cache.setdefault(classroom_id, {})[student_id] = (
            fullname, np.array(embedding, dtype=np.float32)
        )

    def match(self, classroom_id: str, embedding: np.ndarray) -> tuple[str, str] | None:
        embedding = embedding / (np.linalg.norm(embedding) or 1)
        session = self._current_session(classroom_id)
        blocked = self._blocked.get(classroom_id, set())

        best, best_dist = None, float("inf")
        for student_id, (fullname, known) in self._cache.get(classroom_id, {}).items():
            if (student_id, session) in blocked or (student_id, None) in blocked:
                continue
            dist = cosine(embedding, known)
            if dist < self._threshold and dist < best_dist:
                best, best_dist = (student_id, fullname), dist
        return best