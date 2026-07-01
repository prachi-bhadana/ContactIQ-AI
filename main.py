import os
import json

from google import genai
from dotenv import load_dotenv
from fastapi import FastAPI
from pydantic import BaseModel
load_dotenv()
api_key= os.getenv("GEMINI_API_KEY")

client= genai.Client(api_key=api_key)

app = FastAPI()
crm_contacts  =[]

class ContactInput(BaseModel):
    text: str

class CompareInput(BaseModel):
     contact1: dict
     contact2: dict

@app.get("/")
def home ():
    return {
        "message":"welcome to ContactIQ AI"
        }

@app.post("/extract")
def extract(data: ContactInput):

    new_contact = process_text(data.text)

    for existing_contact in crm_contacts:

        result = compare_contacts(new_contact, existing_contact)

        if result.get("SamePerson"):

            return {
                "message": "Duplicate Contact Found",
                "matched_contact": existing_contact,
                "comparison": result
            }

    crm_contacts.append(new_contact)

    return {
        "message": "New Contact Added Successfully",
        "contact": new_contact
    }

@app.post("/compare")
def compare(data: CompareInput):
    return compare_contacts(
        data.contact1,
        data.contact2
    )

def process_text(text):

    prompt = f"""
You are an AI CRM Contact Extraction Assistant.

Extract all available CRM contact information from the given resume text.

Return ONLY valid JSON.

If a field is missing, return null.

Do not guess missing information.

Extract Skills as a JSON array.

Extract FirstName and LastName separately whenever possible.

Return this exact JSON structure:

{{
    "FullName": "",
    "FirstName": "",
    "LastName": "",
    "Email": "",
    "AlternateEmail": "",
    "PhoneNumber": "",
    "AlternatePhone": "",
    "Company": "",
    "Designation": "",
    "ExperienceYears": "",
    "ExperienceMonths": "",
    "Industry": "",
    "City": "",
    "State": "",
    "Country": "",
    "Nationality": "",
    "LinkedIn": "",
    "Website": "",
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

    try:
        cleaned_response = (
            response.text
            .replace("```json", "")
            .replace("```", "")
            .strip()
        )

        data = json.loads(cleaned_response)

    except json.JSONDecodeError:

        return {
            "status": "error",
            "message": "Invalid JSON returned by Gemini.",
            "raw_response": response.text
        }


        return data
    
def compare_contacts(contact1, contact2):

    prompt = f"""
You are an AI Entity Resolution Assistant.

Compare the following two CRM contacts.

Determine whether they refer to the same person.

Consider:
- Full Name
- Email
- Phone Number
- Company
- Designation
- LinkedIn
- Other available information

Return ONLY valid JSON in this format:

{{
    "SamePerson": true,
    "Confidence": 95,
    "Reason": "Phone number and email match."
}}

Contact 1:

{contact1}

Contact 2:

{contact2}
"""

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt
    )

    try:
        cleaned_response = (
            response.text
            .replace("```json", "")
            .replace("```", "")
            .strip()
        )

        return json.loads(cleaned_response)

    
    except json.JSONDecodeError:

        return {
            "status": "error",
            "message": "LLM returned invalid JSON.",
            "raw_response": response.text
        }