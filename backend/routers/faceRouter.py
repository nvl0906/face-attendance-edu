import numpy as np
import time
import json
import cv2
from PIL import Image
from urllib.parse import urlparse
from scipy.spatial.distance import cosine
import httpx
from datetime import datetime, timezone
from websockets.exceptions import ConnectionClosedOK, ConnectionClosedError
from fastapi import APIRouter, Depends, Query, WebSocket, File, UploadFile, HTTPException
from supabase import AsyncClient
from dependencies import get_current_user, get_supabase, verify_token, get_face_app

router = APIRouter()

# ── Per-class cooldown tracker ─────────────────────────────────────────────
# Structure: { class_name: { student_name: datetime_last_marked } }
_marked: dict[str, dict[str, datetime]] = {}
_COOLDOWN_MINUTES = 1


def _is_on_cooldown(class_name: str, student_name: str) -> bool:
    now    = datetime.now(timezone.utc)
    marked = _marked.get(class_name, {})
    last   = marked.get(student_name)
    return last is not None and (now - last).total_seconds() < _COOLDOWN_MINUTES * 60


def _mark_student(class_name: str, student_name: str):
    if class_name not in _marked:
        _marked[class_name] = {}
    _marked[class_name][student_name] = datetime.now(timezone.utc)


def _clear_expired(class_name: str):
    """Remove entries older than the cooldown window."""
    now     = datetime.now(timezone.utc)
    bucket  = _marked.get(class_name, {})
    expired = [
        name for name, ts in bucket.items()
        if (now - ts).total_seconds() >= _COOLDOWN_MINUTES * 60
    ]
    for name in expired:
        del bucket[name]

def create_dynamic_var(name: str, value):
    if name in globals():
        del globals()[name]
    globals()[name] = value


def normalize(vec: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(vec)
    if norm == 0:
        return vec
    return vec / norm


def match_face(embedding: np.ndarray, class_name: str, threshold: float = 0.59999):
    known_faces   = globals().get(class_name, {})
    embedding     = normalize(embedding)
    best_match    = None
    best_distance = float("inf")

    for name, known_emb in known_faces.items():
        if embedding.shape != known_emb.shape:
            continue
        dist = cosine(embedding, known_emb)
        if dist < threshold and dist < best_distance:
            best_match    = name
            best_distance = dist

    return best_match

def get_student_id_by_fullname(fullname: str, class_id_key: str) -> str | None:
    student_ids = globals().get(class_id_key, {})
    return student_ids.get(fullname)

@router.post("/setup-profile")
async def setup_profile(
    file: UploadFile  = File(...),
    db: AsyncClient   = Depends(get_supabase),
    user              = Depends(get_current_user),
    face_app          = Depends(get_face_app),
):

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    np_img = np.frombuffer(contents, np.uint8)
    img_bgr = cv2.imdecode(np_img, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise HTTPException(status_code=422, detail="Could not read image file")

    faces = face_app.get(img_bgr)

    if not faces:
        raise HTTPException(
            status_code=422,
            detail="No face detected — please use a clear, front-facing photo",
        )
    if len(faces) > 1:
        raise HTTPException(
            status_code=422,
            detail="Multiple faces detected — please use a solo photo",
        )

    existing = await db.table("student").select("profile").eq("id", user.userid).execute()

    if existing.data and existing.data[0].get("profile"):
        old_url = existing.data[0]["profile"]
        parsed  = urlparse(old_url)
        bucket_prefix = "/storage/v1/object/public/student-assets/"
        if bucket_prefix in parsed.path:
            old_path = parsed.path.split(bucket_prefix, 1)[1]
            try:
                await db.storage.from_("student-assets").remove([old_path])
            except Exception:
                pass

    ext  = (file.filename or "photo.jpg").rsplit(".", 1)[-1].lower()
    ext  = ext if ext in {"jpg", "jpeg", "png", "webp"} else "jpg"
    path = f"profiles/{user.userid}_{int(time.time())}.{ext}"

    try:
        await db.storage.from_("student-assets").upload(
            path,
            contents,
            file_options={
                "content-type": file.content_type or f"image/{ext}",
                "upsert": "false",
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {str(e)}")

    profile_url = await db.storage.from_("student-assets").get_public_url(path)

    result = await (
        db.table("student")
        .update({"profile": profile_url})
        .eq("id", user.userid)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Student not found")

    return {"message": "Profile set up successfully", "profile_url": profile_url}


@router.post("/embeddings")
async def get_embeddings(
    data: dict,
    db: AsyncClient = Depends(get_supabase),
    user            = Depends(get_current_user),
    face_app        = Depends(get_face_app),
):
    class_id   = data.get("class_id")
    class_name = data.get("class_name")

    if not class_id or not class_name:
        raise HTTPException(status_code=422, detail="class_id and class_name are required")

    response = await (
        db.table("student")
        .select("id, fullname, profile")
        .eq("classroom_id", class_id)
        .execute()
    )

    if not response.data:
        return {"status": "error", "message": "Aucun étudiant trouvé pour cette salle"}

    known_faces = {}
    student_ids = {}
    skipped     = []

    async with httpx.AsyncClient() as client:
        for student in response.data:
            fullname    = student["fullname"]
            student_id  = student["id"]
            profile_url = student.get("profile")

            student_ids[fullname] = student_id

            if not profile_url:
                skipped.append(fullname)
                continue

            # 2. Download image
            try:
                resp = await client.get(profile_url, timeout=10.0)
                resp.raise_for_status()
                img_bytes = resp.content
            except Exception as e:
                skipped.append(fullname)
                continue

            # 3. Decode image → BGR numpy array (same as WebSocket flow)
            np_img = np.frombuffer(img_bytes, np.uint8)
            img    = cv2.imdecode(np_img, cv2.IMREAD_COLOR)

            if img is None:
                skipped.append(fullname)
                continue

            # 4. Run InsightFace
            faces = face_app.get(img)

            if not faces:
                skipped.append(fullname)
                continue

            embedding = faces[0].embedding

            if embedding.shape[0] != 512:
                skipped.append(fullname)
                continue

            known_faces[fullname] = normalize(embedding)

    if not known_faces:
        return {
            "status":  "error",
            "message": "No valid face encodings could be built",
            "skipped": skipped,
        }

    create_dynamic_var(f"{user.username}_{class_name}_id", student_ids)
    create_dynamic_var(f"{user.username}_{class_name}", known_faces)

    return {
        "status":  "success",
        "message": "Embeddings récupérés avec succès",
        "loaded":  len(known_faces),
        "skipped": skipped,
    }


@router.websocket("/recognize")
async def ws_recognize(ws: WebSocket, token: str = Query(...)):
    user = await verify_token(token)
    if not user:
        await ws.close(code=403)
        return

    await ws.accept()

    face_app        = ws.app.state.face_app
    db: AsyncClient = ws.app.state.supabase

    try:
        while True:
            # ── 1. Receive metadata ──────────────────────────────────────
            try:
                message = await ws.receive_text()
            except (ConnectionClosedOK, ConnectionClosedError) as e:
                print(f"[WS] Client disconnected during receive_text: {e}")
                break

            try:
                data         = json.loads(message)
                class_name   = data.get("class")
                class_id_key = data.get("class_id")
                classroom_id = data.get("classroom_id")
            except Exception as e:
                print(f"[WS] Bad metadata: {e}")
                # Consume the image bytes to keep protocol in sync, then continue
                try:
                    await ws.receive_bytes()
                except Exception:
                    break
                continue

            if not classroom_id or not class_name or not class_id_key:
                await ws.send_json({"status": "error", "message": "class, class_id, classroom_id are required"})
                try:
                    await ws.receive_bytes()
                except Exception:
                    break
                continue

            # ── 2. Receive image ─────────────────────────────────────────
            try:
                img_data = await ws.receive_bytes()
            except (ConnectionClosedOK, ConnectionClosedError) as e:
                print(f"[WS] Client disconnected during receive_bytes: {e}")
                break

            if not img_data:
                await ws.send_json({"status": "error", "message": "Image non défini!"})
                continue

            # ── 3. Process frame — fully isolated, never crashes the loop ─
            try:
                np_img = np.frombuffer(img_data, np.uint8)
                img    = cv2.imdecode(np_img, cv2.IMREAD_COLOR)

                if img is None:
                    await ws.send_json({"status": "error", "message": "Image invalide"})
                    continue

                faces   = face_app.get(img)
                matches = set()

                _clear_expired(class_name)

                for face in faces:
                    name = match_face(face.embedding.flatten(), class_name)
                    if not name:
                        continue

                    matches.add(name)

                    if _is_on_cooldown(class_name, name):
                        continue

                    student_id = get_student_id_by_fullname(name, class_id_key)
                    if not student_id:
                        print(f"[WS] Student not in cache: {name}")
                        continue

                    await (
                        db.table("attendance")
                        .insert({
                            "student_id":   student_id,
                            "classroom_id": classroom_id,
                        })
                        .execute()
                    )

                    _mark_student(class_name, name)
                    print(f"[WS] Attendance marked: {name}")

                await ws.send_json({
                    "status": "success",
                    "users":  list(matches),
                })

            except (ConnectionClosedOK, ConnectionClosedError) as e:
                print(f"[WS] Client disconnected during processing: {e}")
                break

            except Exception as e:
                # Frame processing error — log it, try to reply, keep loop alive
                print(f"[Error] Processing frame: {e}")
                try:
                    await ws.send_json({"status": "error", "message": str(e)})
                except Exception:
                    # Socket is gone — exit cleanly
                    break

    except Exception as e:
        print(f"[WS] Outer error: {e}")