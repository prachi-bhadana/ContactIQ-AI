import os
import json
from file_reader import read_pdf, read_docx

from openai import OpenAI
from dotenv import load_dotenv
from fastapi import FastAPI , Query
from pydantic import BaseModel
from database import engine, Base, SessionLocal
from models import Contact

load_dotenv()
api_key = os.getenv("OPENROUTER_API_KEY")

client = OpenAI(
    api_key=api_key,
    base_url="https://openrouter.ai/api/v1"
)

app = FastAPI()
Base.metadata.create_all(bind=engine)
crm_contacts = []

processing_logs= []
processed_files = set()

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
    contacts =db.query(Contact).all()
    return contacts

@app.get ("/contact/search")
def search_contacts(
    name: str = Query(None)
):
    db= SessionLocal()
    
    contacts= db.query(Contact).filter(
        Contact.full_name ==name 
    ).all()
    
    return contacts

def save_contact(new_contact):
    db = SessionLocal()
    phone = new_contact.get("PhoneNumber")
    if phone:
        phone = phone.replace(" ", "")
        phone = phone.replace("-", "")
        phone = phone.replace("+91", "")
        
    
    email = new_contact.get("Email")
    if email :
        email = email.strip().lower()
    
    name = new_contact.get("FullName")
    if name:
        name = " ".join(name.split()).title()
    
    

    existing_contact = None

    if phone:
        existing_contact = db.query(Contact).filter(
            Contact.phone == phone
        ).first()

    if not existing_contact and email:
        existing_contact = db.query(Contact).filter(
            Contact.email == email
        ).first()

    if not phone and not email:
        return {
            "message": "Contact skipped because phone and email are missing."
        }

    if existing_contact:
        return {
            "message": "Duplicate contact found.",
            "existing_contact": existing_contact.full_name
        }
    print(new_contact)
    new_db_contact = Contact(
        full_name=name,
    first_name=new_contact.get("FirstName"),
        last_name=new_contact.get("LastName"),
        email=email,
        
    alternate_email=new_contact.get("AlternateEmail"),
        phone=phone,
        
        
    alternate_phone=new_contact.get("AlternatePhone"),
    
    organization=new_contact.get("Company"),
    
    designation=new_contact.get("Designation"),
    
    experience_years=new_contact.get("ExperienceYears"),
    
    experience_months=new_contact.get("ExperienceMonths"),
        industry=new_contact.get("Industry"),
        city=new_contact.get("City"),
        state=new_contact.get("State"),
        country=new_contact.get("Country"),
    nationality=new_contact.get("Nationality"),
        linkedin=new_contact.get("LinkedIn"),
        website=new_contact.get("Website"),
        skills=", ".join(new_contact.get("Skills", [])),
        notes=new_contact.get("Notes"),
    confidence=new_contact.get("Confidence")
)  

    db.add(new_db_contact)
    db.commit()
    db.refresh(new_db_contact)
    
    

    return {
        "message": "Contact saved successfully.",
        "contact": new_db_contact.full_name
    }
    

    
@app.post("/extract")
def extract(data: ContactInput):

    new_contact = process_text(data.text)
    if new_contact.get("status")=="error":
        return new_contact
    
    return save_contact(new_contact)
    
    
    
    

@app.post("/compare")
def compare(data: CompareInput):
    return compare_contacts(
        data.contact1,
        data.contact2
    )

def process_single_file(file_path):
    
    file = os.path.basename(file_path)
    
    if file.endswith(".pdf"):
                print("PDF Found")

                text = read_pdf(file_path)
                print("PDF Read Successfully")
                
                contact = process_text(text)
                print(contact)

                
                if contact.get("status") == "error":
                    return {
                        "message ": "Processing Failed"
                    }
                    
                result = save_contact(contact)
                print(result["message"])
                
                return result
                
              
    elif file.endswith(".docx"):
                print("DOCX Found")

                text = read_docx(file_path)
                print("DOCX Read Successfully")

                contact = process_text(text)

                if contact.get("status") == "error":
                    return {
                        "message ": "Processing Failed"
                    }

                result = save_contact(contact)
                print(result["message"])
                
                return result
            
    return {
                "message":"unsupported file type"
            }
            
                
                
    

@app.post("/process-folder")
def process_folder():
    
    print(processed_files)
    print(processing_logs)
    
    total_files = 0
    processed =0
    failed = 0
    duplicates = 0
    contacts_saved = 0
    folder = "input_files"
    

    for file in os.listdir(folder):
        total_files +=1
        if file in processed_files:
            print(f"skipping{file}")
            
            processing_logs.append({
                "file": file ,
                "status":"skipped"
            })
            continue
        
        try :
            file_path = os.path.join(folder,file)
        
            print(file)
            
            if not os.path.isfile(file_path):
                continue

            result = process_single_file(file_path)
            if result["message"] == "Contact saved successfully.":
                    processed += 1
                    contacts_saved += 1
                    processed_files.add(file)

                    processing_logs.append({
                        "file": file,
                        "status": "success"
                    })

            elif result["message"] == "Duplicate contact found.":
                    duplicates += 1
                    processed_files.add(file)

                    processing_logs.append({
                        "file": file,
                        "status": "duplicate"
                    })

            elif result["message"] == "Contact skipped because phone and email are missing.":
                    failed += 1

                    processing_logs.append({
                        "file": file,
                        "status": "failed"
                    }) 
                    
            elif result["message"] == "processing failed.":
                    failed += 1

                    processing_logs.append({
                        "file": file,
                        "status": "failed"
                    })     
                                
                                
            
        except Exception as e :
            print("ERROR:",e)
            failed+=1
            processing_logs.append({
                "file":file , 
                "status": "failed",
                "error": str(e)
        })
            
    success_rate =0
    
    if total_files>0:
        success_rate = round((processed / total_files)    * 100 ,2 )

    return {
                "message": "Folder processed successfully",
                "summary":{
                "total_files" : total_files ,
                "processed" : processed,
                "contacts_saved" : contacts_saved ,
                "duplicates" : duplicates,
                "failed": failed,
                "success_rate": f"{success_rate}%"
                },
                
                "processing_logs" :processing_logs
    }
    
@app.get("/logs")
def get_logs():
    return processing_logs
    
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
"Notes": "",
"Confidence" : 0
}}

Return ONLY valid JSON.

Also return an overall confidence score between 0 and 100 indicating how confident you are in the extracted information.

Resume Text:

{text}
"""

    try:
        response = client.chat.completions.create(
            model="poolside/laguna-xs-2.1:free",
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )

    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

    try:
        cleaned_response = (
            response.choices[0].message.content
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
        response = client.chat.completions.create(
            model="poolside/laguna-xs-2.1:free",
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )

    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

    try:
        cleaned_response = (
            response.choices[0].message.content
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


"""folder = "input_files"

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
        print(contact)"""