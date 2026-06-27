from google import genai
import os
import json
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
    prompt = f"""
You are an AI CRM Contact Extraction Assistant.

Extract the contact information from the given text.

Return ONLY valid JSON.

If any information is missing, return null.

Extract these fields:

{{
  "FullName": "",
  "Email": "",
  "PhoneNumber": "",
  "AlternatePhone": "",
  "Company": "",
  "Designation": "",
  "City": "",
  "State": "",
  "Country": "",
  "Skills": [],
  "Notes": ""
}}

Resume Text:

{text}
"""
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt
    )

    cleaned_response = response.text.replace("```json", "").replace("```", "").strip()

    data = json.loads(cleaned_response)

    return data

   


 


 