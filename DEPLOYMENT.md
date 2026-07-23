# Deployment Guide — ContactIQ AI

## 1. Prerequisites

- Python 3.9+ (no explicit minimum is pinned anywhere — `requirements.txt` is present but empty)
- An OpenRouter API key (`main.py` hardcodes `base_url="https://openrouter.ai/api/v1"`, model `poolside/laguna-xs-2.1:free`)
- `input_files/` — a folder in the app's working directory, read by both `POST /process-folder` (`main.py`) and `folder_monitor.py`

## 2. Clone the repository

```bash
git clone <your-repo-url>
cd <repo-folder>
```

## 3. Create a virtual environment

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
```

## 4. Install dependencies

`requirements.txt` is present in the repository but is **empty (0 bytes)** — nothing is pinned. The following list is reconstructed directly from the imports actually present in `main.py`, `file_reader.py`, `ocr_reader.py`, and `folder_monitor.py`:

```bash
pip install fastapi uvicorn pydantic python-dotenv openai sqlalchemy jinja2 \
            pymupdf python-docx openpyxl easyocr textract watchdog
```

Notes:
- `pymupdf` provides the `fitz` module used by `read_pdf()`.
- `easyocr` will download its English-language model weights on first use (`easyocr.Reader(['en'])` runs at **module import time** in `ocr_reader.py`) — expect a slower first startup and an internet connection the first time the app (or `folder_monitor.py`) is run.
- `textract` (used by `read_doc()`) has its own system-level dependencies depending on OS/legacy `.doc` support — not something this codebase configures for you.
- Consider generating a real `requirements.txt` immediately with `pip freeze > requirements.txt` once your environment is working, since none currently exists.

## 5. Configure `.env`

```bash
cp .env.example .env
```
Edit `.env`:
```
OPENROUTER_API_KEY=your_own_key_here
```
This is the only environment variable read anywhere in the code (`main.py`, line 20, `os.getenv("OPENROUTER_API_KEY")`). `.gitignore` already excludes `.env` — keep it that way.

> ⚠️ A real, live-looking key was found in this repository's `.env` during review. Rotate it in the OpenRouter dashboard rather than reusing it, since it's no longer private.

## 6. Prepare `input_files/`

```bash
mkdir -p input_files
```
Both `POST /process-folder` and `folder_monitor.py` read this path relative to wherever the process is started — make sure you run both from the same working directory (the project root), or they'll be watching/reading two different folders.

## 7. Initialize the database

No separate init script exists. `main.py` calls:
```python
Base.metadata.create_all(bind=engine)
```
automatically at import time (this line appears twice — redundant, but harmless). `database.py` points at `sqlite:///contacts.db`, a relative path, so `contacts.db` will be created in the working directory the app is started from if it doesn't already exist. The repository already includes a `contacts.db` with the `contacts` table and one existing row — back this up before development if you want to preserve it, or delete it to start fresh (it will be recreated automatically, empty, on next startup).

## 8. Run the FastAPI server

Development:
```bash
uvicorn main:app --reload
```

`main.py` mounts static files and templates relative to the working directory:
```python
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")
```
So `static/` (containing `script.js`, plus a `style.css` referenced by `dashboard.html` — not part of the files reviewed here, confirm it exists in your copy of the repo) and `templates/` (containing `dashboard.html`) must sit alongside wherever you run `uvicorn` from.

Production (example only — no process manager or container config exists in the repository):
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```
Pair with a reverse proxy (nginx/Caddy) for TLS, and a process supervisor (systemd/supervisord) — neither is configured in this codebase today.

**Multiple workers caution:** `processing_logs` and `processed_files` are plain in-memory Python objects, not shared across processes. Running `uvicorn main:app --workers 4` would give each worker its own inconsistent copy of this state, so the Processing Queue/Recent Activity views would show different data depending on which worker served a given request. Stick to a single worker unless this is addressed.

## 9. (Optional) Run the folder watcher

If you want files to be processed automatically as they're dropped into `input_files/`, rather than only when someone clicks "Run Processing":

```bash
python folder_monitor.py
```

This is a **separate, long-running process** from `uvicorn main:app` — it imports `process_single_file` directly from `main.py` (which re-executes all of `main.py`'s module-level setup, including a second `Base.metadata.create_all()` and a second unused `FastAPI()` app object that this process never actually serves). Run it alongside the API server if you want both processing paths available.

Be aware (see [PROJECT_ARCHITECTURE.md](./PROJECT_ARCHITECTURE.md)): files processed this way are saved to the database but **do not** appear in the dashboard's Processing Queue, OCR Logs, or Recent Activity, since only `POST /process-folder`'s code path writes to `processing_logs`.

## 10. Access the dashboard

```
http://<host>:8000/dashboard
```

`GET /` returns a static JSON welcome message, not the dashboard. Auto-generated interactive API docs (standard FastAPI behavior) are at:
```
http://<host>:8000/docs
```
`script.js`'s "docs" button links to this exact path.

## 11. Post-deployment checklist

- [ ] `.env` is present, correct, and not committed.
- [ ] The OpenRouter key has been rotated (a real one was exposed during this review — see Security Notes in README.md).
- [ ] `input_files/` exists and is readable/writable by whichever process(es) you run.
- [ ] `static/style.css` exists in your copy of the repo (referenced by `dashboard.html`, not reviewed here) — without it, the dashboard loads unstyled.
- [ ] You've decided whether `folder_monitor.py` runs alongside the API, and accepted that its processed files won't show up in the dashboard's Processing Queue/Logs.
- [ ] You're running a single `uvicorn` worker, or have addressed the in-memory state issue above.
- [ ] No authentication exists on any endpoint — do not expose this to the public internet as-is.
