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
from dependencies import get_current_user, get_supabase, verify_token, get_face_app, get_embedding_store

router = APIRouter()

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
    face_app        = Depends(get_face_app),
    embedding_store: EmbeddingStore = Depends(get_embedding_store),  # from app.state
):
    class_id = data.get("class_id")  # this is classroom_id
    if not class_id:
        raise HTTPException(status_code=422, detail="class_id is required")

    response = await (
        db.table("student").select("id, fullname, profile").eq("classroom_id", class_id).execute()
    )
    if not response.data:
        return {"status": "error", "message": "Aucun étudiant trouvé pour cette salle"}

    loaded, skipped = 0, []
    async with httpx.AsyncClient() as client:
        for student in response.data:
            fullname, student_id, profile_url = student["fullname"], student["id"], student.get("profile")
            if not profile_url:
                skipped.append(fullname); continue
            try:
                resp = await client.get(profile_url, timeout=10.0)
                resp.raise_for_status()
                img_bytes = resp.content
            except Exception:
                skipped.append(fullname); continue

            np_img = np.frombuffer(img_bytes, np.uint8)
            img = cv2.imdecode(np_img, cv2.IMREAD_COLOR)
            if img is None:
                skipped.append(fullname); continue

            faces = face_app.get(img)
            if not faces or faces[0].embedding.shape[0] != 512:
                skipped.append(fullname); continue

            embedding = normalize(faces[0].embedding)
            await embedding_store.upsert(class_id, student_id, fullname, embedding)
            loaded += 1

    return {"status": "success", "message": "Embeddings récupérés avec succès", "loaded": loaded, "skipped": skipped}

@router.websocket("/recognize")
async def ws_recognize(ws: WebSocket, token: str = Query(...)):
    user = await verify_token(token)
    if not user:
        await ws.close(code=403)
        return

    await ws.accept()

    face_app        = ws.app.state.face_app
    db: AsyncClient = ws.app.state.supabase
    cooldown        = ws.app.state.cooldown_store
    embedding_store = ws.app.state.embedding_store 

    try:
        while True:
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

            try:
                img_data = await ws.receive_bytes()
            except (ConnectionClosedOK, ConnectionClosedError) as e:
                print(f"[WS] Client disconnected during receive_bytes: {e}")
                break

            if not img_data:
                await ws.send_json({"status": "error", "message": "Image non défini!"})
                continue

            try:
                np_img = np.frombuffer(img_data, np.uint8)
                img    = cv2.imdecode(np_img, cv2.IMREAD_COLOR)

                if img is None:
                    await ws.send_json({"status": "error", "message": "Image invalide"})
                    continue

                faces   = face_app.get(img)
                matches = set()
                await embedding_store.ensure_loaded(classroom_id)

                for face in faces:
                    result = embedding_store.match(classroom_id, face.embedding.flatten())
                    if not result:
                        continue
                    student_id, name = result
                    matches.add(name)

                    student_id = get_student_id_by_fullname(name, class_id_key)
                    if not student_id:
                        print(f"[WS] Student not in cache: {name}")
                        continue

                    if cooldown.is_on_cooldown(classroom_id, student_id):   # <-- was _is_on_cooldown(class_name, name)
                        continue

                    await (
                        db.table("attendance")
                        .insert({
                            "student_id":   student_id,
                            "classroom_id": classroom_id,
                        })
                        .execute()
                    )

                    cooldown.mark_locally(classroom_id, student_id)         # <-- was _mark_student(class_name, name)
                    print(f"[WS] Attendance marked: {name}")

                await ws.send_json({
                    "status": "success",
                    "users":  list(matches),
                })

            except (ConnectionClosedOK, ConnectionClosedError) as e:
                print(f"[WS] Client disconnected during processing: {e}")
                break

            except Exception as e:
                print(f"[Error] Processing frame: {e}")
                try:
                    await ws.send_json({"status": "error", "message": str(e)})
                except Exception:
                    break

    except Exception as e:
        print(f"[WS] Outer error: {e}")