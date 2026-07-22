import os
from datetime import datetime
from dateutil.parser import parse
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from insightface.app import FaceAnalysis
from supabase import acreate_client
from  routers import authRouter, faceRouter, gestionRouter

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        url = os.getenv("FAE_SUPABASE_URL")
        key = os.getenv("FAE_SUPABASE_KEY")
        
        # Only load detection + recognition — skip landmark, age/gender, gaze
        face_app = FaceAnalysis(
            name="buffalo_l",
            root="/app",
            allowed_modules=['detection', 'recognition'],
            providers=[
                (
                    'CUDAExecutionProvider', {
                        'device_id':                0,
                        'arena_extend_strategy':    'kNextPowerOfTwo',
                        'gpu_mem_limit':            2 * 1024 * 1024 * 1024,  # 2GB cap
                        'cudnn_conv_algo_search':   'EXHAUSTIVE',  # finds fastest conv algo
                        'do_copy_in_default_stream': True,
                    }
                ),
                'CPUExecutionProvider',  # fallback if CUDA op isn't supported
            ]
        )
        face_app.prepare(ctx_id=0, det_size=(320, 320))
        
        supabase_client = await acreate_client(url, key)
        
        app.state.supabase = supabase_client
        app.state.face_app = face_app
        
    except Exception as e:
        raise 

    try:
        yield
    finally:
        del app.state.face_app 
        await app.state.supabase.aclose()

app = FastAPI(default_response_class=ORJSONResponse, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)  

app.include_router(authRouter.router)
app.include_router(gestionRouter.router)
app.include_router(faceRouter.router)  

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    first_error = exc.errors()[0]
    raw_msg = first_error["msg"]
    
    clean_msg = raw_msg.replace("Value error, ", "")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"message": clean_msg, "field": first_error["loc"][-1]},
    )


