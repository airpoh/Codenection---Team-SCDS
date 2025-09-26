from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel, EmailStr, Field
from jose import jwt, JWTError
import httpx
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from typing import Optional, Literal, List
from config import (
    SUPABASE_URL, ANON_KEY, SERVICE_KEY, JWT_SECRET,
    ALLOWED_EMAIL_DOMAIN, FRONTEND_RESET_URL
)

router = APIRouter(prefix="", tags=["core"])

# fall back to UTC if a bad/unknown tz is passed
def get_tz(tzname: str):
    try:
        return ZoneInfo(tzname)
    except ZoneInfoNotFoundError:
        try:
            import tzdata  # ensure package is present
            return ZoneInfo(tzname)
        except Exception:
            return ZoneInfo("UTC")

# --- Schemas matching your UI ---
class SignUpIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    email: EmailStr
    password: str = Field(min_length=8)
    confirm_password: str = Field(min_length=8)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

# --- Helpers ---
def _require_bearer(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    return authorization.split(" ", 1)[1]
    
def verify_supabase_jwt(token: str):
    from jose import jwt, JWTError
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},   # <-- add this
            # OR: audience="authenticated",
        )
        uid = payload.get("sub")
        email = payload.get("email")
        if not uid:
            raise HTTPException(401, "Invalid token: missing sub")
        return {"id": uid, "email": email, "claims": payload}
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

async def _supabase_admin_create_user(name: str, email: str, password: str):
    url = f"{SUPABASE_URL}/auth/v1/admin/users"
    headers = {
        "Authorization": f"Bearer {SERVICE_KEY}",
        "apikey": SERVICE_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "email": email,
        "password": password,
        "email_confirm": True,  # for hackathon speed; set False if you want email verify
        "user_metadata": {"name": name},
    }
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(url, headers=headers, json=payload)
        if r.status_code >= 400:
            # forward friendly error
            raise HTTPException(status_code=400, detail=r.text)
        return r.json()

async def _supabase_sign_in(email: str, password: str):
    url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    headers = {"apikey": ANON_KEY, "Content-Type": "application/json"}
    payload = {"email": email, "password": password}
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(url, headers=headers, json=payload)
        if r.status_code >= 400:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        return r.json()  # { access_token, refresh_token, user, ... }

async def _insert_profile(user_id: str, name: str, email: str):
    url = f"{SUPABASE_URL}/rest/v1/profiles"
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    now = datetime.now(timezone.utc)
    payload = {
        "id": user_id,
        "name": name,
        "email": email,
        "campus_verified": email.endswith(".edu.my"),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(url, headers=headers, json=payload)
        # ignore duplicate inserts if re-run
        if r.status_code >= 400 and "duplicate key" not in r.text.lower():
            raise HTTPException(status_code=400, detail=r.text)
        return r.json()

async def _get_profile(user_id: str, access_token: str):
    url = f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{user_id}&select=*"
    headers = {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {access_token}",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(url, headers=headers)
        if r.status_code >= 400:
            raise HTTPException(status_code=400, detail=r.text)
        data = r.json()
        return data[0] if data else None

# --- Routes ---
@router.get("/health")
async def health():
    return {"ok": True}

@router.post("/auth/sign-up")
async def sign_up(body: SignUpIn):
    # 1) basic checks that match your Sign Up screen
    if body.password != body.confirm_password:
        raise HTTPException(400, "Passwords do not match")
    email = body.email.lower().strip()

    # Only allow Malaysian educational institutions (.edu.my)
    if not email.endswith(".edu.my"):
        raise HTTPException(400, "Only Malaysian educational institution emails (.edu.my) are allowed")

    # 2) create user in Supabase Auth (server-side)
    user = await _supabase_admin_create_user(body.name.strip(), email, body.password)
    uid = user.get("id")

    # 3) create the profile row
    await _insert_profile(uid, body.name.strip(), email)

    # 4) auto-create smart account for new user
    try:
        from services.biconomy_client import get_biconomy_client
        from services.supabase_client import get_supabase_service
        import secrets
        
        # Generate a private key for the user's smart account
        private_key = "0x" + secrets.token_hex(32)
        
        # Create smart account via Biconomy
        biconomy_client = get_biconomy_client()
        smart_account_result = await biconomy_client.create_smart_account(private_key)
        
        if smart_account_result.get("success"):
            # Store smart account info in database
            supabase_service = get_supabase_service()
            await supabase_service.store_user_smart_account(
                user_id=uid,
                smart_account_address=smart_account_result.get("smartAccountAddress"),
                signer_address=smart_account_result.get("signerAddress"),
                private_key=private_key  # Store encrypted private key
            )
            logger.info(f"Auto-created smart account for new user {uid}: {smart_account_result.get('smartAccountAddress')}")
        else:
            logger.warning(f"Failed to auto-create smart account for user {uid}: {smart_account_result}")
            
    except Exception as e:
        logger.warning(f"Failed to auto-create smart account for user {uid}: {e}")
        # Don't fail registration if smart account creation fails

    # 5) optional: auto-login so app goes straight to Home/Island
    session = await _supabase_sign_in(email, body.password)
    return {
        "user_id": uid,
        "access_token": session.get("access_token"),
        "refresh_token": session.get("refresh_token"),
        "token_type": session.get("token_type", "bearer"),
        "expires_in": session.get("expires_in"),
    }

@router.post("/auth/login")
async def login(body: LoginIn):
    email = body.email.lower().strip()
    session = await _supabase_sign_in(email, body.password)
    return {
        "access_token": session.get("access_token"),
        "refresh_token": session.get("refresh_token"),
        "token_type": session.get("token_type", "bearer"),
        "expires_in": session.get("expires_in"),
        "user": session.get("user"),
    }

@router.post("/auth/forgot-password")
async def forgot_password(body: LoginIn):
    # accepts just { "email": "..." }
    url = f"{SUPABASE_URL}/auth/v1/recover"
    headers = {"apikey": ANON_KEY, "Content-Type": "application/json"}
    payload = {"email": body.email.lower().strip(), "redirect_to": FRONTEND_RESET_URL}
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(url, headers=headers, json=payload)
        if r.status_code >= 400:
            raise HTTPException(400, r.text)
    return {"ok": True}

@router.get("/me")
async def me(token: str = Depends(_require_bearer)):
    claims = verify_supabase_jwt(token)
    profile = await _get_profile(claims["id"], token)
    
    # Return user info compatible with frontend expectations
    return {
        "user_id": claims["id"], 
        "email": claims["email"], 
        "profile": profile,
        "user": {
            "id": claims["id"],
            "email": claims["email"],
            "name": profile.get("name", "") if profile else "",
            "avatar_url": profile.get("avatar_url") if profile else None,
            "created_at": profile.get("created_at") if profile else None,
            "updated_at": profile.get("updated_at") if profile else None
        }
    }

# Defaults used when remind_minutes_before is not provided
DEFAULT_REMIND = {
    'assignment': 24*60,   # 24h before
    'exam':       120,     # 2h
    'club':       30,
    'meeting':    30,
    'medicine':   0,       # at time
    'study':      10,
    'other':      15,
}
DEFAULT_DURATION_MIN = 30  # when ends_at missing for reminders

# Request models
Category = Literal['assignment','exam','club','meeting','medicine','study','other']
Kind = Literal['event','reminder']

class TaskCreate(BaseModel):
    title: str
    category: Category
    kind: Kind = 'event'
    starts_at: datetime                 # ISO 8601 WITH timezone (e.g. 2025-09-02T15:00:00+08:00)
    ends_at: Optional[datetime] = None
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=24*60)
    remind_minutes_before: Optional[int] = Field(default=None, ge=0)
    location: Optional[str] = None
    notes: Optional[str] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[Category] = None
    kind: Optional[Kind] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=24*60)
    remind_minutes_before: Optional[int] = Field(default=None, ge=0)
    location: Optional[str] = None
    notes: Optional[str] = None

# Helpers
def _ensure_end(body: TaskCreate | TaskUpdate):
    """If ends_at is missing but we have duration OR it's a reminder, compute ends_at."""
    if getattr(body, "ends_at", None) is None and getattr(body, "starts_at", None):
        dur = getattr(body, "duration_minutes", None)
        if dur is None:
            # if creating a reminder without duration, use default 30 min
            kind = getattr(body, "kind", None)
            dur = DEFAULT_DURATION_MIN if kind == 'reminder' else None
        if dur:
            body.ends_at = body.starts_at + timedelta(minutes=dur)
    return body

def _choose_remind(category: str, value: Optional[int]) -> int:
    return DEFAULT_REMIND.get(category, 15) if value is None else value

def _utc_range_for_day(date_local: datetime, tzname: str):
    """Given any local datetime (or date at midnight), return that day's [start,end) in UTC."""
    tz = ZoneInfo(tzname)
    start_local = datetime(date_local.year, date_local.month, date_local.day, 0, 0, 0, tzinfo=tz)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)

def _utc_range_for_month(year: int, month: int, tzname: str):
    tz = ZoneInfo(tzname)
    start_local = datetime(year, month, 1, 0, 0, 0, tzinfo=tz)
    # first day of next month
    if month == 12:
        end_local = datetime(year+1, 1, 1, 0, 0, 0, tzinfo=tz)
    else:
        end_local = datetime(year, month+1, 1, 0, 0, 0, tzinfo=tz)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)

def _decorate(rows: list):
    """Add derived fields used by the app (duration & notify_at)."""
    out = []
    for r in rows:
        starts = datetime.fromisoformat(r["starts_at"].replace("Z","+00:00"))
        ends = datetime.fromisoformat(r["ends_at"].replace("Z","+00:00")) if r.get("ends_at") else None
        mins = int(r["remind_minutes_before"]) if r.get("remind_minutes_before") is not None else 0
        notify = (starts - timedelta(minutes=mins)).isoformat()
        duration = int((ends - starts).total_seconds() // 60) if ends else None
        r2 = {**r, "duration_minutes": duration, "notify_at": notify}
        out.append(r2)
    return out

# CRUD + list endpoints
# Create a task/reminder
@router.post("/tasks")
async def create_task(body: TaskCreate, token: str = Depends(_require_bearer)):
    body = _ensure_end(body)
    remind = _choose_remind(body.category, body.remind_minutes_before)

    url = f"{SUPABASE_URL}/rest/v1/tasks"
    headers = {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    uid = verify_supabase_jwt(token)["id"]
    payload = {
        "user_id": uid,
        "title": body.title.strip(),
        "category": body.category,
        "kind": body.kind,
        "starts_at": body.starts_at.isoformat(),
        "ends_at": body.ends_at.isoformat() if body.ends_at else None,
        "remind_minutes_before": remind,
        "location": body.location,
        "notes": body.notes,
    }
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(url, headers=headers, json=payload)
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return _decorate(r.json())[0]

# Update
@router.patch("/tasks/{task_id}")
async def update_task(task_id: str, body: TaskUpdate, token: str = Depends(_require_bearer)):
    body = _ensure_end(body)
    fields = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    if "category" in fields and "remind_minutes_before" not in fields:
        fields["remind_minutes_before"] = DEFAULT_REMIND.get(fields["category"], 15)

    url = f"{SUPABASE_URL}/rest/v1/tasks?id=eq.{task_id}"
    headers = {
        "apikey": ANON_KEY, "Authorization": f"Bearer {token}",
        "Content-Type": "application/json", "Prefer": "return=representation",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.patch(url, headers=headers, json=fields)
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        rows = r.json()
        return _decorate(rows)[0] if rows else {}

# Delete
@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, token: str = Depends(_require_bearer)):
    url = f"{SUPABASE_URL}/rest/v1/tasks?id=eq.{task_id}"
    headers = {"apikey": ANON_KEY, "Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.delete(url, headers=headers)
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return {"ok": True}

# List within an arbitrary range (used by calendar)
@router.get("/tasks/range")
async def list_range(start: datetime, end: datetime, token: str = Depends(_require_bearer)):
    headers = {"apikey": ANON_KEY, "Authorization": f"Bearer {token}"}
    params = [
        ("select", "*"),
        ("starts_at", f"gte.{start.isoformat()}"),
        ("starts_at", f"lt.{end.isoformat()}"),
        ("order", "starts_at.asc"),
    ]
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/tasks", headers=headers, params=params)
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return _decorate(r.json())

# Reminder Endpoint
# Today summary: current date/time, remaining count, today's tasks
@router.get("/reminders/today")
async def today_summary(tz: str = "Asia/Kuala_Lumpur", token: str = Depends(_require_bearer)):
    now_local = datetime.now(ZoneInfo(tz))
    start_utc, end_utc = _utc_range_for_day(now_local, tz)

    headers = {"apikey": ANON_KEY, "Authorization": f"Bearer {token}"}
    params = [
        ("select", "*"),
        ("starts_at", f"gte.{start_utc.isoformat()}"),
        ("starts_at", f"lt.{end_utc.isoformat()}"),
        ("order", "starts_at.asc"),
    ]
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/tasks", headers=headers, params=params)
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        rows = _decorate(r.json())

    now_utc = now_local.astimezone(timezone.utc)
    remaining = sum(
        1 for t in rows
        if (t.get("ends_at") and datetime.fromisoformat(t["ends_at"].replace("Z","+00:00")) > now_utc)
        or datetime.fromisoformat(t["starts_at"].replace("Z","+00:00")) >= now_utc
    )
    return {
        "date": now_local.strftime("%A, %d %b %Y"),
        "time": now_local.strftime("%I:%M %p"),
        "remaining_tasks": remaining,
        "tasks": rows
    }

# Create a reminder (shortcut for your Add UI)
@router.post("/reminders")
async def create_reminder(
    title: str,
    date: str,              # YYYY-MM-DD in local tz
    start_time: str,        # HH:MM (24h) in local tz
    end_time: Optional[str] = None,
    category: Category = "other",
    tz: str = "Asia/Kuala_Lumpur",
    token: str = Depends(_require_bearer)
):
    tzinfo = get_tz(tz)
    y, m, d = map(int, date.split("-"))
    hh, mm = map(int, start_time.split(":"))
    starts_local = datetime(y, m, d, hh, mm, tzinfo=tzinfo)

    ends_local = None
    if end_time:
        eh, em = map(int, end_time.split(":"))
        ends_local = datetime(y, m, d, eh, em, tzinfo=tzinfo)
    else:
        ends_local = starts_local + timedelta(minutes=DEFAULT_DURATION_MIN)

    body = TaskCreate(
        title=title, category=category, kind="reminder",
        starts_at=starts_local.astimezone(timezone.utc),
        ends_at=ends_local.astimezone(timezone.utc),
        remind_minutes_before=DEFAULT_REMIND.get(category, 15),
    )
    return await create_task(body, token)  # reuse create_task

# calendar tab endpoints
# # Month view: return tasks grouped by day for scrolling UI
@router.get("/calendar/month")
async def calendar_month(
    year: int, month: int, tz: str = "Asia/Kuala_Lumpur",
    token: str = Depends(_require_bearer)
):
    start_utc, end_utc = _utc_range_for_month(year, month, tz)
    rows = await list_range(start_utc, end_utc, token)  # reuses list_range

    # group by local day
    tzinfo = get_tz(tz)
    days: dict[str, list] = {}
    for r in rows:
        starts = datetime.fromisoformat(r["starts_at"].replace("Z","+00:00")).astimezone(tzinfo)
        key = starts.strftime("%Y-%m-%d")
        days.setdefault(key, []).append(r)

    # make ordered list
    result = []
    cur_local = start_utc.astimezone(tzinfo)
    end_local = end_utc.astimezone(tzinfo)
    while cur_local < end_local:
        key = cur_local.strftime("%Y-%m-%d")
        result.append({"date": key, "weekday": cur_local.strftime("%A"), "items": days.get(key, [])})
        cur_local += timedelta(days=1)

    return {"year": year, "month": month, "days": result}

# Day detail (when you tap a date)
@router.get("/calendar/day")
async def calendar_day(date: str, tz: str = "Asia/Kuala_Lumpur", token: str = Depends(_require_bearer)):
    y, m, d = map(int, date.split("-"))
    start_utc, end_utc = _utc_range_for_day(datetime(y, m, d, 0, 0), tz)
    rows = await list_range(start_utc, end_utc, token)
    return {"date": date, "items": rows}

# --- SQLAlchemy Models for Core Tables ---
from sqlalchemy import create_engine, Column, String, BigInteger, Text, DateTime, Boolean, Integer, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, relationship, Session
from config import settings
import logging

# Setup logging
logger = logging.getLogger("unimate-core")

# Database setup using Supabase URL
if not settings.SUPABASE_DB_URL:
    raise RuntimeError("Set SUPABASE_DB_URL in .env")

core_engine = create_engine(settings.SUPABASE_DB_URL, echo=False, future=True)
CoreBase = declarative_base()
CoreSessionLocal = sessionmaker(bind=core_engine, autoflush=False, autocommit=False)

class Profile(CoreBase):
    __tablename__ = "profiles"
    id = Column(String, primary_key=True)  # UUID from Supabase auth
    name = Column(String(60), nullable=False)
    email = Column(String(255), nullable=False)
    campus_verified = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False)

    # Relationship to tasks
    tasks = relationship("Task", back_populates="owner")

class Task(CoreBase):
    __tablename__ = "tasks"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("profiles.id"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    category = Column(String(50), nullable=False)  # study, work, personal, health, social
    kind = Column(String(20), nullable=False)      # event, reminder
    starts_at = Column(DateTime(timezone=True), nullable=False)
    ends_at = Column(DateTime(timezone=True), nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    remind_minutes_before = Column(Integer, nullable=True)
    is_completed = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False)

    # Relationship to profile
    owner = relationship("Profile", back_populates="tasks")

def get_core_db():
    """Dependency to get a SQLAlchemy session with proper cleanup"""
    db = CoreSessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_core_database():
    """Initialize core database tables"""
    try:
        CoreBase.metadata.create_all(bind=core_engine)
        logger.info("Core database tables initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize core database: {e}")
        raise

# Initialize core database on startup
init_core_database()

