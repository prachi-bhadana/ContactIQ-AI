import os
import json
from file_reader import read_pdf, read_docx

from google import genai
from dotenv import load_dotenv
from fastapi import FastAPI
from pydantic import BaseModel
from database import engine, Base, SessionLocal
from models import Contact

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")

client = genai.Client(api_key=api_key)

app = FastAPI()
Base.metadata.create_all(bind=engine)
crm_contacts = []


class ContactInput(BaseModel):
    text: str


class CompareInput(BaseModel):
    contact1: dict
    contact2: dict


@app.get("/")
def home():
    return {
        "message": "welcome to ContactIQ AI"
    }
@app.get("/contacts")
def get_contacts():
    db = SessionLocal()
    contacts =db.query(contact).all()
    return contacts
 

@app.post("/extract")
def extract(data: ContactInput):

    new_contact = process_text(data.text)
    db = SessionLocal()

    for existing_contact in crm_contacts:

        result = compare_contacts(new_contact, existing_contact)

        if result.get("SamePerson"):

            return {
                "message": "Duplicate Contact Found",
                "matched_contact": existing_contact,
                "comparison": result
            }

    contact = Contact(
        full_name=new_contact.get("FullName"),
        email=new_contact.get("Email"),
        phone=new_contact.get("PhoneNumber"),
        organization=new_contact.get("Company")
    )

    db.add(contact)
    db.commit()
    db.refresh(contact)

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

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt
        )

    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

    try:
        cleaned_response = (
            response.text
            .replace("```json", "")
            .replace("```", "")
            .strip()
        )

        data = json.loads(cleaned_response)
        return data

    except json.JSONDecodeError:
        return {
            "status": "error",
            "message": "Invalid JSON returned by Gemini.",
            "raw_response": response.text
        }


def compare_contacts(contact1, contact2):

    prompt = f"""
You are an AI Entity Resolution Assistant for a CRM system.

Your job is to determine whether two contacts represent the SAME PERSON.

Rules:

1. If Email matches exactly → SamePerson = true

2. If Phone Number matches exactly → SamePerson = true

3. If LinkedIn matches → SamePerson = true

4. If Full Name is slightly different
(example:
Prachi Bhadana
Prachi Bhadanawala)

AND Company OR Phone OR Email also match,
then SamePerson = true.

5. Ignore differences in capitalization.

6. Be conservative.
If information is insufficient, return SamePerson = false.

Return ONLY valid JSON:

{{
"SamePerson": true,
"Confidence": 98,
"Reason": ""
}}

Contact 1:

{contact1}

Contact 2:

{contact2}
"""

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt
        )

    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

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


folder = "input_files"

for file in os.listdir(folder):
    file_path = os.path.join(folder, file)

    if file.endswith(".pdf"):
        print(f"\nReading PDF: {file}")
        text = read_pdf(file_path)

        contact = process_text(text)
        print(contact)

    elif file.endswith(".docx"):
        print(f"\nReading DOCX: {file}")
        text = read_docx(file_path)

        contact = process_text(text)
        print(contact)