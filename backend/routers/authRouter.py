from fastapi import APIRouter, Depends
from supabase import AsyncClient
from utils.passwordhash import PasswordHasher
from schemas.authSchema import LoginSchema, RegisterSchema
from dependencies import create_access_token, get_supabase

router = APIRouter()

@router.post("/login")
async def login(data: LoginSchema, db: AsyncClient = Depends(get_supabase)):
    response = await db.table("department").select("*").eq("login", data.username).execute()
    response2 = await db.table("student").select("*").eq("username", data.username).execute()
    if response.data:
        user = response.data[0]
        if not PasswordHasher.verify_password(data.password, user['hashed_password']):
            return {"status": "error", "message": "Mot de passe incorrect"}
        token_data = {
            "userid": user['id'],
            "username": user['login'],
            "fullname": user['name'],
            "hasProfile": False,
            "is_institution": True
        }
        token = await create_access_token(token_data)
        return {"status": "success", "message": "Login institution réussi", "token": token}
        
    elif response2.data:
        user = response2.data[0]
        hasProfile = False
        if user['profile']:
            hasProfile = True
        if not PasswordHasher.verify_password(data.password, user['hashed_password']):
            return {"status": "error", "message": "Mot de passe incorrect"}
        token_data = {
            "userid": user['id'],
            "username": user['username'],
            "fullname": user['fullname'],
            "hasProfile": hasProfile,
            "is_institution": False
        }
        token = await create_access_token(token_data)
        return {"status": "success", "message": "Login étudiant réussi", "token": token}

    return {"status": "error", "message": "Utilisateur non trouvé"}

@router.post("/register")
async def register(data: RegisterSchema, db : AsyncClient = Depends(get_supabase)):
    response = await db.table("department").select("*").eq("login", data.username).execute()
    response2 = await db.table("student").select("*").eq("username", data.username).execute()
    if data.registertype == "institution":
        if response.data:
            return {"status": "error", "message": "Institution déjà existante"}
        response = await db.table("department").insert({
            "name": data.fullname,
            "login": data.username,
            "hashed_password": PasswordHasher.hash_password(data.password),
        }).execute()
    elif data.registertype == "student":
        if response2.data:
            return {"status": "error", "message": "Étudiant déjà existant"}
        response = await db.table("student").insert({
            "fullname": data.fullname,
            "username": data.username,
            "hashed_password": PasswordHasher.hash_password(data.password),
        }).execute()

    return {"status": "success", "message": f"Inscription réussie de {data.fullname}"}