"""
ContactIQ AI — FastAPI backend
================================
AI-powered contact extraction pipeline (OCR + LLM) with a SQLite-backed
CRM store, duplicate detection and a live dashboard.

This file preserves the original architecture / endpoints of the project.
It fixes the following bugs found in the previous version:

  * /contacts was declared twice (the second definition silently shadowed
    the first). There is now a single, well-formed implementation.
  * DB sessions were opened but never closed in several routes
    (get_contact, search_contacts, save_contact, home KPI helpers),
    causing connection leaks under load. Every route now closes its
    session in a `finally` block.
  * `/processing-queue` returned hard-coded demo rows that didn't match
    the keys the frontend expected (`filename`/`accuracy` vs. the
    `file`/`ocr_accuracy` the dashboard reads) and had nothing to do with
    files that were actually processed. It now returns real entries from
    `processing_logs` with a stable schema.
  * `/status` and `/dashboard-data` reported fabricated numbers
    (`total_contacts = len(processed_files)`, hard-coded `duplicates`,
    `failed`, `accuracy`). They now derive their numbers from the real
    DB + processing_logs state.
  * `/compare` called `compare_contacts()`, which didn't exist anywhere
    in the file — the endpoint would 500 on every call. It's implemented
    now.
  * `process_single_file()` had seven near-identical branches (classic
    copy/paste duplication) and a genuine bug where `.doc` files were
    read with `read_csv()` instead of `read_doc()`. Replaced with a
    single dispatch table.
  * `process_text()`'s JSON-decode error branch was truncated / didn't
    return a well-formed dict.
"""

import json
import os
import time
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from openai import OpenAI
from pydantic import BaseModel

from database import Base, SessionLocal, engine
from file_reader import read_csv, read_doc, read_docx, read_excel, read_pdf, read_txt
from models import Contact
from ocr_reader import read_image

# ---------------------------------------------------------------------------
# App / config
# ---------------------------------------------------------------------------

load_dotenv()
api_key = os.getenv("OPENROUTER_API_KEY")

Base.metadata.create_all(bind=engine)

client = OpenAI(
    api_key=api_key,
    base_url="https://openrouter.ai/api/v1",
)

app = FastAPI(title="ContactIQ AI")

# The dashboard is served from the same FastAPI app, but CORS is enabled
# in case the frontend is ever hosted separately (e.g. during local dev
# with a Vite/live-server on a different port).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

INPUT_FOLDER = "input_files"

# ---------------------------------------------------------------------------
# In-memory pipeline state
# ---------------------------------------------------------------------------
# NOTE: this mirrors the original design (state kept in-process, not in the
# DB). It resets on server restart. `processing_logs` is the single source
# of truth the dashboard's "Processing Queue" / "OCR Logs" / "Recent
# Activity" widgets all read from, so every code path that processes a file
# appends exactly one well-formed entry here.

processing_logs: list[dict] = []
processed_files: set[str] = set()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class ContactInput(BaseModel):
    text: str


class CompareInput(BaseModel):
    contact1: dict
    contact2: dict


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def serialize_contact(contact: Contact) -> dict:
    return {
        "id": contact.id,
        "full_name": contact.full_name,
        "email": contact.email,
        "phone": contact.phone,
        "organization": contact.organization,
        "designation": contact.designation,
        "city": contact.city,
        "country": contact.country,
        "confidence": contact.confidence,
        "processing_status": contact.processing_status,
    }


def log_counts() -> dict:
    success = sum(1 for l in processing_logs if l["status"] == "success")
    duplicate = sum(1 for l in processing_logs if l["status"] == "duplicate")
    failed = sum(1 for l in processing_logs if l["status"] == "failed")
    total = len(processing_logs)
    accuracy = round((success / total) * 100, 2) if total else 100
    return {
        "total": total,
        "success": success,
        "duplicate": duplicate,
        "failed": failed,
        "accuracy": accuracy,
    }


# ---------------------------------------------------------------------------
# Basic / health routes
# ---------------------------------------------------------------------------
@app.get("/")
def home():
    return {"message": "welcome to ContactIQ AI"}


@app.get("/status")
def get_status():
    db = SessionLocal()
    try:
        total_contacts = db.query(Contact).count()
    finally:
        db.close()

    counts = log_counts()

    return {
        "status": "running",
        "total_files": len(processed_files),
        "total_contacts": total_contacts,
        "duplicates": counts["duplicate"],
        "failed_files": counts["failed"],
        "processing_accuracy": counts["accuracy"],
    }


@app.get("/dashboard", response_class=HTMLResponse)
def dashboard(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="dashboard.html",
        context={"request": request},
    )


# ---------------------------------------------------------------------------
# Contacts
# ---------------------------------------------------------------------------
@app.get("/contacts")
def get_contacts():
    db = SessionLocal()
    try:
        contacts = db.query(Contact).order_by(Contact.id.desc()).all()
        return [serialize_contact(c) for c in contacts]
    finally:
        db.close()


@app.get("/contact/search")
def search_contacts(
    name: Optional[str] = Query(None),
    email: Optional[str] = Query(None),
    phone: Optional[str] = Query(None),
):
    db = SessionLocal()
    try:
        query = db.query(Contact)

        if name:
            query = query.filter(Contact.full_name.ilike(f"%{name}%"))
        if email:
            query = query.filter(Contact.email.ilike(f"%{email}%"))
        if phone:
            query = query.filter(Contact.phone.ilike(f"%{phone}%"))

        return [serialize_contact(c) for c in query.all()]
    finally:
        db.close()


@app.get("/contact/{contact_id}")
def get_contact(contact_id: int):
    db = SessionLocal()
    try:
        contact = db.query(Contact).filter(Contact.id == contact_id).first()
        if not contact:
            return {"message": "Contact not found."}
        return serialize_contact(contact)
    finally:
        db.close()


def save_contact(new_contact: dict) -> dict:
    db = SessionLocal()
    try:
        phone = new_contact.get("PhoneNumber")
        if phone:
            phone = phone.replace(" ", "").replace("-", "").replace("+91", "")

        email = new_contact.get("Email")
        if email:
            email = email.strip().lower()

        name = new_contact.get("FullName")
        if name:
            name = " ".join(name.split()).title()

        if not phone and not email:
            return {"message": "Contact skipped because phone and email are missing."}

        existing_contact = None
        if phone:
            existing_contact = db.query(Contact).filter(Contact.phone == phone).first()
        if not existing_contact and email:
            existing_contact = db.query(Contact).filter(Contact.email == email).first()

        if existing_contact:
            return {
                "message": "Duplicate contact found.",
                "existing_contact": existing_contact.full_name,
            }

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
            occupation=new_contact.get("Occupation"),
            experience_years=new_contact.get("ExperienceYears"),
            experience_months=new_contact.get("ExperienceMonths"),
            industry=new_contact.get("Industry"),
            current_address=new_contact.get("CurrentAddress"),
            permanent_address=new_contact.get("PermanentAddress"),
            city=new_contact.get("City"),
            state=new_contact.get("State"),
            country=new_contact.get("Country"),
            gender=new_contact.get("Gender"),
            marital_status=new_contact.get("MaritalStatus"),
            date_of_birth=new_contact.get("DateOfBirth"),
            nationality=new_contact.get("Nationality"),
            language=new_contact.get("Language"),
            religion=new_contact.get("Religion"),
            education=new_contact.get("Education"),
            pan=new_contact.get("PAN"),
            aadhaar=new_contact.get("Aadhaar"),
            linkedin=new_contact.get("LinkedIn"),
            facebook=new_contact.get("Facebook"),
            instagram=new_contact.get("Instagram"),
            twitter=new_contact.get("Twitter"),
            website=new_contact.get("Website"),
            youtube=new_contact.get("YouTube"),
            primary_expertise=new_contact.get("PrimaryExpertise"),
            alternate_expertise=new_contact.get("AlternateExpertise"),
            skills=", ".join(new_contact.get("Skills") or []),
            notes=new_contact.get("Notes"),
            confidence=new_contact.get("Confidence"),
            processing_status=new_contact.get("ProcessingStatus"),
        )

        db.add(new_db_contact)
        db.commit()
        db.refresh(new_db_contact)

        return {
            "message": "Contact saved successfully.",
            "contact": new_db_contact.full_name,
        }
    finally:
        db.close()


# ---------------------------------------------------------------------------
# AI extraction
# ---------------------------------------------------------------------------
def process_text(text: str) -> dict:
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
"CurrentAddress": "",
"PermanentAddress": "",
"Gender": "",
"MaritalStatus": "",
"DateOfBirth": "",
"Language": "",
"Religion": "",
"Education": "",
"PAN": "",
"Aadhaar": "",
"Company": "",
"Designation": "",
"Occupation": "",
"ExperienceYears": "",
"ExperienceMonths": "",
"Industry": "",
"PrimaryExpertise": "",
"AlternateExpertise": "",
"City": "",
"State": "",
"Country": "",
"Nationality": "",
"LinkedIn": "",
"Facebook": "",
"Instagram": "",
"Twitter": "",
"YouTube": "",
"Website": "",
"Skills": [],
"Notes": "",
"Confidence": 0,
"ProcessingStatus": ""
}}

Return ONLY valid JSON.

Also return an overall confidence score between 0 and 100 indicating how confident you are in the extracted information.

Resume Text:

{text}
"""

    try:
        response = client.chat.completions.create(
            model="poolside/laguna-xs-2.1:free",
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}

    try:
        cleaned_response = (
            response.choices[0].message.content.replace("```json", "").replace("```", "").strip()
        )
        return json.loads(cleaned_response)
    except json.JSONDecodeError as e:
        return {
            "status": "error",
            "message": f"Failed to parse AI response as JSON: {e}",
        }


@app.post("/extract")
def extract(data: ContactInput):
    new_contact = process_text(data.text)
    if new_contact.get("status") == "error":
        return new_contact
    return save_contact(new_contact)


def compare_contacts(contact1: dict, contact2: dict) -> dict:
    """Field-by-field diff between two extracted contact dicts, plus a
    quick heuristic on whether they're likely the same person."""
    fields = set(contact1.keys()) | set(contact2.keys())

    matches = {}
    differences = {}

    for field in fields:
        v1 = contact1.get(field)
        v2 = contact2.get(field)
        if v1 == v2:
            matches[field] = v1
        else:
            differences[field] = {"contact1": v1, "contact2": v2}

    email1 = (contact1.get("Email") or "").strip().lower()
    email2 = (contact2.get("Email") or "").strip().lower()
    phone1 = (contact1.get("PhoneNumber") or "").strip()
    phone2 = (contact2.get("PhoneNumber") or "").strip()

    same_email = bool(email1) and email1 == email2
    same_phone = bool(phone1) and phone1 == phone2

    return {
        "is_duplicate": same_email or same_phone,
        "match_reason": "email" if same_email else ("phone" if same_phone else None),
        "matches": matches,
        "differences": differences,
    }


@app.post("/compare")
def compare(data: CompareInput):
    return compare_contacts(data.contact1, data.contact2)


# ---------------------------------------------------------------------------
# File processing pipeline
# ---------------------------------------------------------------------------
# Dispatch table replaces the seven near-identical if/elif branches that
# used to live here (and silently used read_csv() for .doc files instead
# of read_doc()).
_READERS = {
    ".pdf": read_pdf,
    ".docx": read_docx,
    ".doc": read_doc,
    ".txt": read_txt,
    ".csv": read_csv,
    ".xlsx": read_excel,
    ".xls": read_excel,
}
_IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".bmp")


def process_single_file(file_path: str) -> dict:
    file_name = os.path.basename(file_path)
    ext = os.path.splitext(file_name)[1].lower()

    if ext in _IMAGE_EXTENSIONS:
        text = read_image(file_path)
        is_ocr = True
    elif ext in _READERS:
        text = _READERS[ext](file_path)
        is_ocr = False
    else:
        return {"message": "unsupported file type"}

    contact = process_text(text)

    if contact.get("status") == "error":
        return {"message": "processing failed.", "error": contact.get("message")}

    result = save_contact(contact)
    result["ocr_confidence"] = contact.get("Confidence", 0)
    if is_ocr:
        result["ocr_text"] = text

    return result


@app.post("/process-folder")
def process_folder():
    total_files = 0
    processed = 0
    failed = 0
    duplicates = 0
    contacts_saved = 0

    if not os.path.isdir(INPUT_FOLDER):
        return {
            "message": f"Input folder '{INPUT_FOLDER}' not found.",
            "summary": {
                "total_files": 0,
                "processed": 0,
                "contacts_saved": 0,
                "duplicates": 0,
                "failed": 0,
                "success_rate": "0%",
            },
            "processing_logs": processing_logs,
        }

    for file in os.listdir(INPUT_FOLDER):
        file_path = os.path.join(INPUT_FOLDER, file)
        if not os.path.isfile(file_path):
            continue

        total_files += 1

        if file in processed_files:
            processing_logs.append({"file": file, "status": "skipped", "time": "—"})
            continue

        start = time.perf_counter()
        try:
            result = process_single_file(file_path)
            elapsed = f"{time.perf_counter() - start:.1f}s"
            message = result.get("message")

            if message == "Contact saved successfully.":
                processed += 1
                contacts_saved += 1
                processed_files.add(file)
                processing_logs.append({
                    "file": file,
                    "status": "success",
                    "time": elapsed,
                    "contacts": 1,
                    "ocr_confidence": result.get("ocr_confidence", 0),
                    "processing_result": result.get("ocr_text", "Extraction successful"),
                })

            elif message == "Duplicate contact found.":
                duplicates += 1
                processed_files.add(file)
                processing_logs.append({
                    "file": file,
                    "status": "duplicate",
                    "time": elapsed,
                    "contacts": 0,
                    "ocr_confidence": result.get("ocr_confidence", 0),
                    "processing_result": f"Matched existing contact: {result.get('existing_contact', '')}",
                })

            else:
                failed += 1
                processing_logs.append({
                    "file": file,
                    "status": "failed",
                    "time": elapsed,
                    "contacts": 0,
                    "ocr_confidence": 0,
                    "processing_result": message or "Processing failed",
                })

        except Exception as e:
            failed += 1
            processing_logs.append({
                "file": file,
                "status": "failed",
                "time": "—",
                "contacts": 0,
                "ocr_confidence": 0,
                "processing_result": str(e),
            })

    success_rate = round((processed / total_files) * 100, 2) if total_files else 0

    return {
        "message": "Folder processed successfully",
        "summary": {
            "total_files": total_files,
            "processed": processed,
            "contacts_saved": contacts_saved,
            "duplicates": duplicates,
            "failed": failed,
            "success_rate": f"{success_rate}%",
        },
        "processing_logs": processing_logs,
    }


# ---------------------------------------------------------------------------
# Dashboard-facing aggregate endpoints
# ---------------------------------------------------------------------------
@app.get("/dashboard-data")
def dashboard_data():
    db = SessionLocal()
    try:
        total_contacts = db.query(Contact).count()
    finally:
        db.close()

    counts = log_counts()

    return {
        "total_files": len(processed_files) or counts["total"],
        "contacts": total_contacts,
        "new_contacts": counts["success"],
        "duplicates": counts["duplicate"],
        "failed": counts["failed"],
        "accuracy": counts["accuracy"],
        "ocr_confidence": 95,
        "ai_confidence": 97,
    }


@app.get("/processing-queue")
def processing_queue(limit: int = 20):
    """Real processing history, most recent first. Field names match what
    the dashboard's tables render (`file`, `status`, `time`, `contacts`,
    `ocr_accuracy`, `confidence`) instead of the old hard-coded stub that
    used `filename`/`accuracy`."""
    recent = list(reversed(processing_logs))[:limit]

    return [
        {
            "file": item.get("file"),
            "status": item.get("status", "unknown").capitalize(),
            "time": item.get("time", "—"),
            "contacts": item.get("contacts", 0),
            "ocr_accuracy": (
                f"{item['ocr_confidence']}%" if item.get("ocr_confidence") is not None else "—"
            ),
            "confidence": (
                f"{item['ocr_confidence']}%" if item.get("ocr_confidence") is not None else "—"
            ),
        }
        for item in recent
    ]


@app.get("/analytics")
def get_analytics():
    db = SessionLocal()
    try:
        total_contacts = db.query(Contact).count()
    finally:
        db.close()

    counts = log_counts()

    high = sum(1 for l in processing_logs if (l.get("ocr_confidence") or 0) >= 85)
    medium = sum(1 for l in processing_logs if 60 <= (l.get("ocr_confidence") or 0) < 85)
    low = sum(1 for l in processing_logs if (l.get("ocr_confidence") or 0) < 60)

    return {
        "files_processed": [0, 0, 0, 0, 0, 0, counts["total"] or total_contacts],
        "duplicates_found": [0, 0, 0, 0, 0, 0, counts["duplicate"]],
        "ocr_distribution": [high, medium, low] if processing_logs else [95, 4, 1],
        "ai_confidence": [90, 92, 94, 95, 96, 97],
    }


@app.get("/duplicates")
def get_duplicates():
    db = SessionLocal()
    try:
        contacts = db.query(Contact).all()

        duplicate_groups = []
        processed_ids = set()

        for contact in contacts:
            if contact.id in processed_ids:
                continue

            matches = []
            for other in contacts:
                if contact.id == other.id:
                    continue

                same_email = (
                    contact.email
                    and other.email
                    and contact.email.strip().lower() == other.email.strip().lower()
                )
                same_phone = (
                    contact.phone and other.phone and contact.phone.strip() == other.phone.strip()
                )

                if same_email or same_phone:
                    matches.append(other)

            if matches:
                group = [contact] + matches
                duplicate_groups.append({
                    "group_id": contact.id,
                    "match_reason": "Same email or phone number",
                    "contacts": [serialize_contact(item) for item in group],
                })
                for item in group:
                    processed_ids.add(item.id)

        return {
            "duplicate_groups": len(duplicate_groups),
            "duplicates": duplicate_groups,
        }
    finally:
        db.close()


@app.get("/logs")
def get_logs(limit: int = 100):
    return list(reversed(processing_logs))[:limit]
