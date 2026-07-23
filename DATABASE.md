# Database Documentation — ContactIQ AI

Everything below is confirmed directly from `database.py`, `models.py`, and by inspecting the actual `contacts.db` SQLite file's schema (`PRAGMA table_info`) — not inferred.

## Engine & session setup (`database.py`)

```python
DATABASE_URL = "sqlite:///contacts.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()
```

- **Database:** SQLite, stored in a single file, `contacts.db`, in the working directory the app is run from (relative path — no absolute path or `DATABASE_URL` environment variable is used).
- **No `connect_args={"check_same_thread": False}`** is set. FastAPI runs synchronous `def` route handlers (all routes in `main.py` are sync, not `async def`) in a thread pool, so multiple requests can execute on different worker threads. Each request creates its own `SessionLocal()` (its own connection), so this hasn't caused an observed problem in the current single-file-per-session pattern — but it's worth knowing if the session-handling pattern changes later (e.g. moving to a shared/module-level session).
- **No connection pooling configuration, no Alembic, no migrations tooling** anywhere in the codebase.
- **`Base.metadata.create_all(bind=engine)` runs twice** in `main.py` (once right after the OpenAI client is built, again a few lines later) — harmless duplication, not a bug that affects data, but dead redundancy worth cleaning up.

## Tables

Exactly **one** table exists, confirmed both in `models.py` and by inspecting the live `contacts.db` file directly:

### `contacts`

| # | Column | SQL type (from live DB) | SQLAlchemy type (`models.py`) | Nullable | Notes |
|---|---|---|---|---|---|
| 1 | `id` | INTEGER | `Integer`, `primary_key=True, index=True` | No (PK) | **Primary key** |
| 2 | `full_name` | VARCHAR | `String` | Yes | Built in `save_contact()` by title-casing whitespace-collapsed `FullName` |
| 3 | `first_name` | VARCHAR | `String` | Yes | |
| 4 | `last_name` | VARCHAR | `String` | Yes | |
| 5 | `email` | VARCHAR | `String` | Yes | Lower-cased + stripped before save; used for dedupe lookups and `.ilike()` search |
| 6 | `alternate_email` | VARCHAR | `String` | Yes | |
| 7 | `phone` | VARCHAR | `String` | Yes | Stripped of spaces, `-`, and a hardcoded `+91` prefix before save; used for dedupe lookups and `.ilike()` search |
| 8 | `alternate_phone` | VARCHAR | `String` | Yes | |
| 9 | `organization` | VARCHAR | `String` | Yes | Populated from the LLM's `Company` field |
| 10 | `designation` | VARCHAR | `String` | Yes | |
| 11 | `occupation` | VARCHAR | `String` | Yes | |
| 12 | `experience_years` | VARCHAR | `String` | Yes | Stored as text, not a number |
| 13 | `experience_months` | VARCHAR | `String` | Yes | Stored as text, not a number |
| 14 | `industry` | VARCHAR | `String` | Yes | |
| 15 | `current_address` | VARCHAR | `String` | Yes | |
| 16 | `permanent_address` | VARCHAR | `String` | Yes | |
| 17 | `city` | VARCHAR | `String` | Yes | |
| 18 | `state` | VARCHAR | `String` | Yes | |
| 19 | `country` | VARCHAR | `String` | Yes | |
| 20 | `nationality` | VARCHAR | `String` | Yes | |
| 21 | `linkedin` | VARCHAR | `String` | Yes | |
| 22 | `website` | VARCHAR | `String` | Yes | |
| 23 | `facebook` | VARCHAR | `String` | Yes | |
| 24 | `instagram` | VARCHAR | `String` | Yes | |
| 25 | `twitter` | VARCHAR | `String` | Yes | |
| 26 | `youtube` | VARCHAR | `String` | Yes | |
| 27 | `gender` | VARCHAR | `String` | Yes | |
| 28 | `marital_status` | VARCHAR | `String` | Yes | |
| 29 | `date_of_birth` | VARCHAR | `String` | Yes | Stored as text, not a `Date` type |
| 30 | `language` | VARCHAR | `String` | Yes | |
| 31 | `religion` | VARCHAR | `String` | Yes | |
| 32 | `education` | VARCHAR | `String` | Yes | |
| 33 | `pan` | VARCHAR | `String` | Yes | Government ID (India) — stored as **plaintext**, no encryption/masking |
| 34 | `aadhaar` | VARCHAR | `String` | Yes | Government ID (India) — stored as **plaintext**, no encryption/masking |
| 35 | `primary_expertise` | VARCHAR | `String` | Yes | |
| 36 | `alternate_expertise` | VARCHAR | `String` | Yes | |
| 37 | `skills` | VARCHAR | `String` | Yes | Stored as a single comma-joined string (`", ".join(skills_list)`), not a normalized list/table |
| 38 | `notes` | VARCHAR | `String` | Yes | |
| 39 | `confidence` | INTEGER | `Integer` | Yes | LLM-reported confidence score (0–100 per the prompt, not enforced at the DB level) |
| 40 | `processing_status` | VARCHAR | `String` | Yes | Set from the LLM's `ProcessingStatus` field — not the same thing as the in-memory `processing_logs` status used by the dashboard |

**Primary key:** `id` (auto-incrementing integer, indexed).
**Foreign keys:** none. There is exactly one table; no `relationship()`, no `ForeignKey`, no join anywhere in the code.
**Unique constraints:** none at the database level. `email` and `phone` are *not* declared `unique=True` in `models.py`, and the live schema confirms no unique index exists on either column.

## Deduplication is application-level, not database-level

`save_contact()` in `main.py` performs the only duplicate check in the system, and it happens **before** insert, in Python:

1. Normalize `phone` (strip spaces, `-`, `+91`) and `email` (lowercase, strip).
2. If `phone` is present, look for an existing row with `Contact.phone == phone`.
3. If nothing found and `email` is present, look for an existing row with `Contact.email == email`.
4. If a match is found, skip the insert and return `"Duplicate contact found."` instead of writing a new row.
5. If neither `phone` nor `email` is present, skip the insert entirely and return `"Contact skipped because phone and email are missing."`

Separately, `GET /duplicates` performs an **independent, on-demand** O(n²) scan across every stored contact (comparing every contact to every other contact by exact case-insensitive email or exact phone match) — this is not the same mechanism as the save-time check, and can surface duplicate groups that predate the current dedupe logic (e.g. rows inserted before this check existed, or rows where phone/email formatting differs enough that the save-time check missed them, since `/duplicates` compares `.strip().lower()`/`.strip()` while `save_contact` normalizes further, e.g. stripping `+91`).

## Known issue: session/connection leaks

`SessionLocal()` is opened 7 times across `main.py` but `db.close()` is only called 5 times. The following **never close their session**:

- `save_contact()` — called on **every** file/text processed, meaning every successful save (and every duplicate/skip check) leaks one connection.
- `GET /contact/{contact_id}`
- `GET /contact/search`

For SQLite this is less catastrophic than it would be for a networked database (no connection pool to exhaust in the same way), but it is still a real resource leak that will accumulate open file handles/connections over a long-running process, and should be fixed (e.g. wrap each in `try/finally: db.close()`, or move to a `Depends()`-based session per FastAPI's standard pattern).

## Initialization process

```python
Base.metadata.create_all(bind=engine)
```

Runs automatically at import time (twice, redundantly) when `main.py` is loaded — by `uvicorn main:app`, or indirectly by `folder_monitor.py` (which does `from main import process_single_file`, which executes all of `main.py`'s module-level code, including this line, and stands up a second, separate `FastAPI()` app object that never actually serves anything in that process). There is no separate `init_db.py` or CLI migration command. If `contacts.db` doesn't exist yet, it is created automatically with the `contacts` table on first run.

## Current data snapshot

At the time of this review, the provided `contacts.db` contains **1 row** in `contacts`.
