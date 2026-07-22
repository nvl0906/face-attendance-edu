from pydantic import BaseModel
from datetime import time
import uuid

class AddClassroomSchema(BaseModel):
    name: str
    start_morning: time
    end_morning: time
    start_afternoon: time
    end_afternoon: time

class DownloadExcelSchema(BaseModel):
    classroom_id: uuid.UUID
    classroom_name: str

