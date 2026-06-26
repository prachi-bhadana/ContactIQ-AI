from google import genai
import os
from dotenv import load_dotenv
from fastapi import FastAPI
from pydantic import BaseModel
load_dotenv()
api_key= os.getenv("GEMINI_API_KEY")

client= genai.Client(api_key=api_key)

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
       result =process_text(data.text)
       return {
            "received_text":result,
            "status" : "successfully received!"
       }
def process_text(text):
    response = client.models.generate_content(
     model="gemini-2.5-flash",
     contents=text
    )
    return response.text


 


 