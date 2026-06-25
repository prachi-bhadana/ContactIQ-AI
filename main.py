from fastapi import FastAPI
from pydantic import BaseModel
app = FastAPI()

class ContactInput(BaseModel):
    text: str

@app.get("/")
def home ():
    return {
        "message":"welcome to ContactIQ AI"
        }

@app.post("/extract")
def extract_contact(data: ContactInput):
    return {"received_text": data.text,
            "status":"successfully received!"}
