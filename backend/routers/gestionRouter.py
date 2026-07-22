import os
from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import FileResponse
from fastapi.encoders import jsonable_encoder
from starlette.background import BackgroundTask
from supabase import AsyncClient
from dependencies import get_current_user, get_supabase
from utils.dataanalytics import Dataanalytics
from schemas.gestionSchema import AddClassroomSchema, DownloadExcelSchema

router = APIRouter()

@router.post("/addclassroom")
async def add_classroom(data: AddClassroomSchema, db: AsyncClient = Depends(get_supabase), user = Depends(get_current_user)):
    if not user.is_institution:
        return {"status": "error", "message": "Unauthorized"}

    insert_data = jsonable_encoder({
        "name": data.name,
        "start_morning": data.start_morning,
        "end_morning": data.end_morning,
        "start_afternoon": data.start_afternoon,
        "end_afternoon": data.end_afternoon,
        "department_id": user.userid
    })
    
    try:
        # In newer versions, execute() returns the data directly or a response object
        response = await db.table("classroom").insert(insert_data).execute()
        
        # Check if insertion was successful (response.data contains the new row)
        if response.data:
            return {"status": "success", "message": f"Classe {data.name} ajoutée avec succès"}
        else:
            return {"status": "error", "message": "No data returned from database"}

    except Exception as e:
        # This catches database constraints, connection issues, etc.
        return {"status": "error", "message": str(e)}
    
@router.get("/getclassrooms")
async def get_classrooms(db: AsyncClient = Depends(get_supabase), user = Depends(get_current_user)):
    if not user.is_institution:
        return {"status": "error", "message": "Unauthorized"}

    try:
        response = await db.table("classroom").select("*").eq("department_id", user.userid).execute()
        return {"status": "success", "classrooms": response.data}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.get("/deleteclassroom")
async def delete_classroom(classroom_id: int, db: AsyncClient = Depends(get_supabase), user = Depends(get_current_user)):
    if not user.is_institution:
        return {"status": "error", "message": "Unauthorized"}

    try:
        response = await db.table("classroom").delete().eq("id", classroom_id).eq("department_id", user.userid).execute()
        if response.data:
            return {"status": "success", "message": f"Classe {classroom_id} supprimée avec succès"}
        else:
            return {"status": "error", "message": "Classe non trouvée ou non autorisée"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.get("/getprofile")
async def get_profile(db: AsyncClient = Depends(get_supabase), user = Depends(get_current_user)):
    if user.is_institution:
        return {"status": "error", "message": "Unauthorized"}

    try:
        response = await db.table("student").select("profile").eq("id", user.userid).execute()
        if response.data and len(response.data) > 0:
            return {"status": "success", "profile": response.data[0]['profile']}
        else:
            return {"status": "error", "message": "Profile non trouvé"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.get("/search")
async def search_student(
    q: str = Query(..., min_length=1),
    db: AsyncClient = Depends(get_supabase),
):
    """
    Search by username or fullname (case-insensitive, partial match).
    Returns matching students that are not yet assigned to a classroom.
    """
    result = (
        await db.table("student")
        .select("id, fullname, username, profile, classroom_id")
        .or_(f"username.ilike.%{q}%,fullname.ilike.%{q}%")
        .is_("classroom_id", "null")
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Auncun étudiant trouvé")

    return result.data  # list of matches


@router.patch("/{student_id}/assign-classroom")
async def assign_classroom(
    student_id: str,
    classroom_id: str,
    db: AsyncClient = Depends(get_supabase),
):
    """Assign a student to a classroom."""
    result = (
        await db.table("student")
        .update({"classroom_id": classroom_id})
        .eq("id", student_id)
        .is_("classroom_id", "null")   # only assign if not already in a class
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=409,
            detail="L'étudiant est déjà assigné à une classe ou n'existe pas",
        )

    return {"message": "Étudiant assigné à la classe avec succès"}


@router.get("/classroom/{classroom_id}")
async def get_classroom_students(
    classroom_id: str,
    db: AsyncClient = Depends(get_supabase),
):
    """Return all students belonging to a classroom."""
    result = (
        await db.table("student")
        .select("id, fullname, username, profile")
        .eq("classroom_id", classroom_id)
        .order("fullname")
        .execute()
    )

    return result.data  # empty list is fine

# Delete classroom
@router.delete("/deleteclassroom/{classroom_id}")
async def delete_classroom(
    classroom_id: str,
    db: AsyncClient = Depends(get_supabase),
):
    result = await db.table("classroom").delete().eq("id", classroom_id).execute()

    if not result.data:
        return {"status": "error", "message": "Classe non trouvée ou déjà supprimée"}

    return {"status": "success", "message": "Classe supprimée avec succès"}

# Unassign student from classroom
@router.delete("/unassign-student/{student_id}")
async def unassign_student(
    student_id: str,
    db: AsyncClient = Depends(get_supabase),
):
    result = (
        await db.table("student")
        .update({"classroom_id": None})
        .eq("id", student_id)
        .execute()
    )

    if not result.data:
       return {"status": "error", "message": "Étudiant non trouvé ou déjà désassigné"}

    # Delete attendance records for this student
    await db.table("attendance").delete().eq("student_id", student_id).execute()

    return {"status": "success", "message": "Étudiant désassigné de la classe avec succès"}

# Get student attendance records
@router.get("/getstudentattendance")
async def get_student_attendance(db: AsyncClient = Depends(get_supabase), user = Depends(get_current_user)):
    if user.is_institution:
        return {"status": "error", "message": "Unauthorized"}

    try:
        response = await db.table("daily_presence_report") \
            .select(
                "attendance_date,"
                "total_hours,"
                "expected_total_hours,"
                "total_attendance_rate,"
                "total_late_minutes"
            ) \
            .eq("student_id", user.userid) \
            .order("attendance_date", desc=True) \
            .execute()

        return {"status": "success", "attendance": response.data}

    except Exception as e:
        return {"status": "error", "message": str(e)}

# Get student's assigned classroom with department name
@router.get("/getstudentclassroom")
async def get_student_classroom(db: AsyncClient = Depends(get_supabase), user = Depends(get_current_user)):
    if user.is_institution:
        return {"status": "error", "message": "Unauthorized"}

    try:
        # Fetch student's classroom_id first
        student_res = await db.table("student") \
            .select("classroom_id") \
            .eq("id", user.userid) \
            .single() \
            .execute()

        if not student_res.data:
            return {"status": "error", "message": "Étudiant non trouvé"}

        classroom_id = student_res.data.get("classroom_id")

        if not classroom_id:
            return {"status": "success", "classroom": None}

        # Fetch classroom + department name via foreign key join
        classroom_res = await db.table("classroom") \
            .select(
                "id,"
                "name,"
                "start_morning,"
                "end_morning,"
                "start_afternoon,"
                "end_afternoon,"
                "department:department_id (name)"
            ) \
            .eq("id", classroom_id) \
            .single() \
            .execute()

        if not classroom_res.data:
            return {"status": "error", "message": "Classe non trouvée"}

        # Flatten department name into the classroom object
        classroom = classroom_res.data
        classroom["department_name"] = classroom.pop("department", {}).get("name")

        return {"status": "success", "classroom": classroom}

    except Exception as e:
        return {"status": "error", "message": str(e)}

# Download Excel report for a classroom
OUTPUT_DIR = "/tmp/presence_exports"


@router.post("/download")
async def download_excel(
    data: DownloadExcelSchema,
    db: AsyncClient = Depends(get_supabase),
    user=Depends(get_current_user),
):
    try:
        os.makedirs(OUTPUT_DIR, exist_ok=True)

        today = datetime.today().strftime("%Y-%m-%d")
        safe_name = data.classroom_name.replace(" ", "_")
        filename = f"{safe_name}_presence_{today}.xlsx"
        file_path = os.path.join(OUTPUT_DIR, filename)

        response = (
            await db.table("daily_presence_report")
            .select("*")
            .eq("classroom_id", data.classroom_id)
            .execute()
        )
        rows = response.data or []

        if not rows:
            raise HTTPException(
                status_code=404,
                detail="Aucune donnée de présence pour cette classe",
            )

        Dataanalytics.get_excel(rows, file_path)

        if not os.path.exists(file_path):
            raise HTTPException(status_code=500, detail="Fichier non généré")

        # delete the temp file once the response has been streamed
        cleanup = BackgroundTask(os.remove, file_path)

        return FileResponse(
            path=file_path,
            filename=filename,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            background=cleanup,
        )

    except HTTPException:
        raise
    except Exception as e:
        print("[Error in /download]", e)
        raise HTTPException(status_code=500, detail="Erreur interne serveur")