import hashlib
import hmac
import os
import secrets
import smtplib
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from contextlib import contextmanager
from email.message import EmailMessage
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = os.environ.get("DATABASE_PATH", "/data/nuanyan.sqlite3")
SESSION_COOKIE = "ny_session"
SESSION_HOURS = 12
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() == "true"
APP_SECRET = os.environ.get("APP_SECRET_KEY", "")
ALLOWED_EMAIL_DOMAINS = {d.strip().lower() for d in os.environ.get("ALLOWED_EMAIL_DOMAINS", "").split(",") if d.strip()}
DEPARTMENTS = {
    "综合办公室", "人事部", "运行管理部", "经营管理部", "电子档案管理中心", "综合服务中心"
}
STATUSES = {
    "PENDING_ACCEPTANCE", "ACCEPTED", "VERIFYING", "PROCESSING",
    "WAITING_EMPLOYEE", "WAITING_REVIEW", "REPLIED", "CLOSED",
    "REJECTED", "REOPENED"
}
TERMINAL = {"CLOSED", "REJECTED"}

app = FastAPI(title="暖言小站 API", docs_url=None, redoc_url=None)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connect():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def hash_password(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return salt.hex(), digest.hex()


def verify_password(password, salt_hex, hash_hex):
    try:
        _, actual = hash_password(password, bytes.fromhex(salt_hex))
        return hmac.compare_digest(actual, hash_hex)
    except (ValueError, TypeError):
        return False


def token_digest(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def init_db():
    if len(APP_SECRET) < 32:
        raise RuntimeError("Set APP_SECRET_KEY to a random secret of at least 32 characters.")
    if not os.environ.get("SMTP_HOST") or not os.environ.get("SMTP_FROM"):
        raise RuntimeError("Set SMTP_HOST and SMTP_FROM before starting the production service.")
    if not ALLOWED_EMAIL_DOMAINS or "*" in ALLOWED_EMAIL_DOMAINS:
        raise RuntimeError("Set ALLOWED_EMAIL_DOMAINS to the organization's approved email domains.")
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY,
          username TEXT NOT NULL UNIQUE COLLATE NOCASE,
          email TEXT NOT NULL UNIQUE COLLATE NOCASE,
          display_name TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('EMPLOYEE','ADMIN')),
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS feedbacks (
          id INTEGER PRIMARY KEY,
          public_id TEXT NOT NULL UNIQUE,
          user_id INTEGER NOT NULL REFERENCES users(id),
          department TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY,
          feedback_id INTEGER NOT NULL REFERENCES feedbacks(id) ON DELETE CASCADE,
          sender_type TEXT NOT NULL CHECK(sender_type IN ('EMPLOYEE','ADMIN')),
          content TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS reset_codes (
          email TEXT PRIMARY KEY COLLATE NOCASE,
          code_hash TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS email_codes (
          email TEXT PRIMARY KEY COLLATE NOCASE,
          username TEXT NOT NULL COLLATE NOCASE,
          code_hash TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS rate_limits (
          bucket TEXT NOT NULL,
          created_at REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedbacks(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedbacks(status, created_at);
        CREATE INDEX IF NOT EXISTS idx_messages_feedback ON messages(feedback_id, created_at);
        """)
        username = os.environ.get("ADMIN_USERNAME", "").strip()
        password = os.environ.get("ADMIN_PASSWORD", "")
        email = os.environ.get("ADMIN_EMAIL", "").strip()
        if not username or len(password) < 14 or not email:
            raise RuntimeError("Set ADMIN_USERNAME, ADMIN_EMAIL, and an ADMIN_PASSWORD of at least 14 characters.")
        row = db.execute("SELECT id FROM users WHERE username=? COLLATE NOCASE", (username,)).fetchone()
        if row is None:
            salt, digest = hash_password(password)
            db.execute(
                "INSERT INTO users(username,email,display_name,password_salt,password_hash,role,created_at) VALUES(?,?,?,?,?,'ADMIN',?)",
                (username, email, "管理员", salt, digest, now_iso()),
            )


@app.on_event("startup")
def startup():
    init_db()


class Credentials(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class Registration(BaseModel):
    username: str = Field(min_length=4, max_length=32, pattern=r"^[A-Za-z][A-Za-z0-9_]{3,31}$")
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=12, max_length=256)
    verification_code: str = Field(pattern=r"^\d{6}$")
    display_name: Optional[str] = Field(default=None, max_length=80)


class ResetRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    email: str = Field(min_length=5, max_length=254)


class ResetConfirm(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    email: str = Field(min_length=5, max_length=254)
    code: str = Field(pattern=r"^\d{6}$")
    password: str = Field(min_length=12, max_length=256)


class FeedbackInput(BaseModel):
    department: str = Field(min_length=1, max_length=40)
    content: str = Field(min_length=10, max_length=500)


class MessageInput(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class StatusInput(BaseModel):
    status: str


def client_key(request, suffix):
    host = request.client.host if request.client else "unknown"
    raw = (host + ":" + suffix).encode("utf-8")
    return hmac.new(APP_SECRET.encode("utf-8"), raw, hashlib.sha256).hexdigest()

def reset_code_digest(code):
    return hmac.new(APP_SECRET.encode("utf-8"), code.encode("ascii"), hashlib.sha256).hexdigest()


def enforce_rate_limit(db, key, limit=10, window=900):
    cutoff = time.time() - window
    db.execute("DELETE FROM rate_limits WHERE created_at < ?", (cutoff,))
    count = db.execute("SELECT COUNT(*) FROM rate_limits WHERE bucket=? AND created_at>=?", (key, cutoff)).fetchone()[0]
    if count >= limit:
        raise HTTPException(429, "操作过于频繁，请稍后再试")
    db.execute("INSERT INTO rate_limits(bucket,created_at) VALUES(?,?)", (key, time.time()))


def issue_session(db, response, user_id):
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS)
    db.execute("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)", (token_digest(token), user_id, expires.isoformat()))
    response.set_cookie(
        SESSION_COOKIE, token, max_age=SESSION_HOURS * 3600, httponly=True,
        secure=COOKIE_SECURE, samesite="strict", path="/"
    )


def current_user(request: Request):
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(401, "请先登录")
    with connect() as db:
        row = db.execute(
            """SELECT u.id,u.username,u.email,u.display_name,u.role,s.expires_at
               FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?""",
            (token_digest(token),),
        ).fetchone()
        if not row or row["expires_at"] <= now_iso():
            db.execute("DELETE FROM sessions WHERE token_hash=?", (token_digest(token),))
            raise HTTPException(401, "登录已过期，请重新登录")
        return dict(row)


def employee(request: Request):
    user = current_user(request)
    if user["role"] != "EMPLOYEE":
        raise HTTPException(403, "此操作仅限员工账号")
    return user


def admin(request: Request):
    user = current_user(request)
    if user["role"] != "ADMIN":
        raise HTTPException(403, "无管理权限")
    return user


def login_user(db, username, password, role, request, response):
    enforce_rate_limit(db, client_key(request, "login:" + username.strip().lower()))
    user = db.execute(
        "SELECT * FROM users WHERE username=? COLLATE NOCASE AND role=?",
        (username.strip(), role),
    ).fetchone()
    if not user or not verify_password(password, user["password_salt"], user["password_hash"]):
        return None
    issue_session(db, response, user["id"])
    return {"username": user["username"], "name": user["display_name"], "role": user["role"]}


def user_view(user):
    return {"username": user["username"], "name": user["display_name"], "role": user["role"]}


@app.get("/")
def home():
    return FileResponse(ROOT / "index.html")


@app.get("/admin")
@app.get("/admin/")
def admin_page():
    return FileResponse(ROOT / "admin.html")


@app.get("/static/{filename}")
def static_file(filename: str):
    allowed = {"index.css", "index.js", "admin.css", "admin.js"}
    if filename not in allowed:
        raise HTTPException(404, "Not found")
    return FileResponse(ROOT / filename)


@app.get("/healthz")
def healthz():
    with connect() as db:
        db.execute("SELECT 1")
    return {"status": "ok"}


@app.post("/api/v1/auth/email-verification/request")
def request_email_verification(payload: ResetRequest, request: Request):
    email = payload.email.strip().lower()
    username = payload.username.strip()
    domain = email.rsplit("@", 1)[-1]
    if domain not in ALLOWED_EMAIL_DOMAINS:
        raise HTTPException(422, "请使用单位认可的邮箱注册")
    with connect() as db:
        enforce_rate_limit(db, client_key(request, "email-verification:" + email), limit=4, window=3600)
        if db.execute("SELECT id FROM users WHERE email=? COLLATE NOCASE OR username=? COLLATE NOCASE", (email, username)).fetchone():
            return {"message": "如果邮箱可用于注册，验证码将发送到该邮箱"}
        code = f"{secrets.randbelow(1000000):06d}"
        expires = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
        db.execute("INSERT OR REPLACE INTO email_codes(email,username,code_hash,expires_at,attempts) VALUES(?,?,?,?,0)",
                   (email, username, reset_code_digest(code), expires))
    msg = EmailMessage()
    msg["Subject"] = "暖言小站注册验证码"
    msg["From"] = os.environ["SMTP_FROM"]
    msg["To"] = email
    msg.set_content(f"你的注册验证码是 {code}，10 分钟内有效。如非本人操作，请忽略此邮件。")
    with smtplib.SMTP(os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", "587")), timeout=15) as server:
        server.starttls()
        if os.environ.get("SMTP_USER"):
            server.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASSWORD", ""))
        server.send_message(msg)
    return {"message": "如果邮箱可用于注册，验证码将发送到该邮箱"}


@app.post("/api/v1/auth/register")
def register(payload: Registration, request: Request, response: Response):
    email = payload.email.strip().lower()
    if "@" not in email or "." not in email.rsplit("@", 1)[-1]:
        raise HTTPException(422, "邮箱格式不正确")
    if email.rsplit("@", 1)[-1] not in ALLOWED_EMAIL_DOMAINS:
        raise HTTPException(422, "请使用单位认可的邮箱注册")
    if not (any(c.islower() for c in payload.password) and any(c.isupper() for c in payload.password) and any(c.isdigit() for c in payload.password) and any(not c.isalnum() for c in payload.password)):
        raise HTTPException(422, "密码需包含大小写字母、数字和符号")
    salt, digest = hash_password(payload.password)
    with connect() as db:
        enforce_rate_limit(db, client_key(request, "register:" + email), limit=5)
        code_record = db.execute("SELECT * FROM email_codes WHERE email=? COLLATE NOCASE", (email,)).fetchone()
        code_ok = bool(code_record and code_record["username"].lower() == payload.username.strip().lower()
                        and code_record["expires_at"] > now_iso() and code_record["attempts"] < 5
                        and hmac.compare_digest(code_record["code_hash"], reset_code_digest(payload.verification_code)))
        if not code_ok:
            if code_record:
                db.execute("UPDATE email_codes SET attempts=attempts+1 WHERE email=?", (email,))
        else:
            display_name = (payload.display_name or "").strip() or payload.username.strip()
            try:
                cur = db.execute(
                    """INSERT INTO users(username,email,display_name,password_salt,password_hash,role,created_at)
                       VALUES(?,?,?,?,?,'EMPLOYEE',?)""",
                    (payload.username.strip(), email, display_name, salt, digest, now_iso()),
                )
            except sqlite3.IntegrityError:
                raise HTTPException(409, "账号或邮箱已注册")
            db.execute("DELETE FROM email_codes WHERE email=?", (email,))
            issue_session(db, response, cur.lastrowid)
    if not code_ok:
        raise HTTPException(400, "验证码无效或已过期")
    return {"user": {"username": payload.username, "name": display_name, "role": "EMPLOYEE"}}


@app.post("/api/v1/auth/login")
def employee_login(payload: Credentials, request: Request, response: Response):
    with connect() as db:
        user = login_user(db, payload.username, payload.password, "EMPLOYEE", request, response)
    if not user:
        raise HTTPException(401, "账号或密码不正确")
    return {"user": user}


@app.post("/api/v1/auth/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        with connect() as db:
            db.execute("DELETE FROM sessions WHERE token_hash=?", (token_digest(token),))
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@app.get("/api/v1/auth/me")
def employee_me(request: Request):
    user = employee(request)
    return {"user": user_view(user)}


@app.post("/api/v1/auth/password-reset/request")
def request_password_reset(payload: ResetRequest, request: Request):
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_from = os.environ.get("SMTP_FROM")
    if not smtp_host or not smtp_from:
        raise HTTPException(503, "邮件服务尚未配置，请联系管理员")
    email = payload.email.strip().lower()
    with connect() as db:
        enforce_rate_limit(db, client_key(request, "password-reset:" + email), limit=3, window=3600)
        user = db.execute(
            "SELECT id FROM users WHERE username=? COLLATE NOCASE AND email=? COLLATE NOCASE AND role='EMPLOYEE'",
            (payload.username.strip(), email),
        ).fetchone()
        if user:
            code = f"{secrets.randbelow(1000000):06d}"
            expires = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
            db.execute(
                "INSERT OR REPLACE INTO reset_codes(email,code_hash,expires_at,attempts) VALUES(?,?,?,0)",
                (email, reset_code_digest(code), expires),
            )
            msg = EmailMessage()
            msg["Subject"] = "暖言小站账号验证码"
            msg["From"] = smtp_from
            msg["To"] = email
            msg.set_content(f"你的验证码是 {code}，10 分钟内有效。如非本人操作，请忽略此邮件。")
            with smtplib.SMTP(smtp_host, int(os.environ.get("SMTP_PORT", "587")), timeout=15) as server:
                server.starttls()
                if os.environ.get("SMTP_USER"):
                    server.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASSWORD", ""))
                server.send_message(msg)
    return {"message": "如果账号与邮箱匹配，验证码已发送"}


@app.post("/api/v1/auth/password-reset/confirm")
def confirm_password_reset(payload: ResetConfirm, request: Request):
    email = payload.email.strip().lower()
    valid = False
    with connect() as db:
        enforce_rate_limit(db, client_key(request, "password-reset-confirm:" + email), limit=8)
        record = db.execute("SELECT * FROM reset_codes WHERE email=? COLLATE NOCASE", (email,)).fetchone()
        user = db.execute(
            "SELECT id FROM users WHERE username=? COLLATE NOCASE AND email=? COLLATE NOCASE AND role='EMPLOYEE'",
            (payload.username.strip(), email),
        ).fetchone()
        valid = bool(record and user and record["expires_at"] > now_iso() and record["attempts"] < 5 and hmac.compare_digest(record["code_hash"], reset_code_digest(payload.code)))
        if valid:
            if not (any(c.islower() for c in payload.password) and any(c.isupper() for c in payload.password) and any(c.isdigit() for c in payload.password) and any(not c.isalnum() for c in payload.password)):
                raise HTTPException(422, "密码需包含大小写字母、数字和符号")
            salt, digest = hash_password(payload.password)
            db.execute("UPDATE users SET password_salt=?,password_hash=? WHERE id=?", (salt, digest, user["id"]))
            db.execute("DELETE FROM sessions WHERE user_id=?", (user["id"],))
            db.execute("DELETE FROM reset_codes WHERE email=?", (email,))
        elif record:
            db.execute("UPDATE reset_codes SET attempts=attempts+1 WHERE email=?", (email,))
    if not valid:
        raise HTTPException(400, "验证码无效或已过期")
    return {"ok": True}


@app.post("/api/v1/feedbacks")
def submit_feedback(payload: FeedbackInput, request: Request, user=Depends(employee)):
    if payload.department not in DEPARTMENTS:
        raise HTTPException(422, "请选择有效的承办部门")
    content = payload.content.strip()
    if len(content) < 10:
        raise HTTPException(422, "建议内容至少需要 10 个字")
    public_id = "NY-" + datetime.now().strftime("%Y%m%d") + "-" + secrets.token_hex(3).upper()
    title = content[:22] + ("…" if len(content) > 22 else "")
    with connect() as db:
        enforce_rate_limit(db, client_key(request, "submit:" + str(user["id"])), limit=20, window=3600)
        cur = db.execute(
            """INSERT INTO feedbacks(public_id,user_id,department,title,description,status,created_at,updated_at)
               VALUES(?,?,?,?,?,'PENDING_ACCEPTANCE',?,?)""",
            (public_id, user["id"], payload.department, title, content, now_iso(), now_iso()),
        )
        return {"id": cur.lastrowid, "public_id": public_id, "status": "PENDING_ACCEPTANCE", "department": payload.department, "created_at": now_iso()}


@app.get("/api/v1/feedbacks/mine")
def my_feedback(request: Request, user=Depends(employee)):
    with connect() as db:
        rows = db.execute(
            """SELECT id,public_id,department,title,description,status,created_at,updated_at
               FROM feedbacks WHERE user_id=? ORDER BY created_at DESC LIMIT 100""",
            (user["id"],),
        ).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            item["messages"] = [dict(message) for message in db.execute(
                "SELECT sender_type,content,created_at FROM messages WHERE feedback_id=? ORDER BY created_at",
                (row["id"],),
            ).fetchall()]
            item.pop("id", None)
            result.append(item)
        return result


@app.get("/api/v1/public/stats")
def public_stats():
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    with connect() as db:
        total = db.execute("SELECT COUNT(*) FROM feedbacks WHERE substr(created_at,1,7)=?", (month,)).fetchone()[0]
        replied = db.execute("SELECT COUNT(*) FROM feedbacks WHERE substr(created_at,1,7)=? AND status IN ('REPLIED','CLOSED')", (month,)).fetchone()[0]
        elapsed = db.execute(
            """SELECT AVG((julianday(updated_at)-julianday(created_at))*24) FROM feedbacks
               WHERE substr(created_at,1,7)=? AND status IN ('REPLIED','CLOSED')""", (month,)
        ).fetchone()[0]
    return {"total": total, "reply_rate": round(replied / total * 100) if total else 0, "avg_days": round(elapsed / 24, 1) if elapsed else 0, "is_demo": False}


@app.post("/api/v1/admin/auth/login")
def admin_login(payload: Credentials, request: Request, response: Response):
    with connect() as db:
        user = login_user(db, payload.username, payload.password, "ADMIN", request, response)
    if not user:
        raise HTTPException(401, "账号或密码不正确")
    return {"user": user}


@app.post("/api/v1/admin/auth/logout")
def admin_logout(request: Request, response: Response):
    return logout(request, response)


@app.get("/api/v1/admin/auth/me")
def admin_me(request: Request):
    return user_view(admin(request))


@app.get("/api/v1/admin/dashboard/summary")
def dashboard_summary(user=Depends(admin)):
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    start = (datetime.now(timezone.utc) - timedelta(days=13)).date().isoformat()
    with connect() as db:
        total = db.execute("SELECT COUNT(*) FROM feedbacks").fetchone()[0]
        pending = db.execute("SELECT COUNT(*) FROM feedbacks WHERE status IN ('PENDING_ACCEPTANCE','ACCEPTED')").fetchone()[0]
        processing = db.execute("SELECT COUNT(*) FROM feedbacks WHERE status IN ('VERIFYING','PROCESSING','WAITING_EMPLOYEE','WAITING_REVIEW','REOPENED')").fetchone()[0]
        due = db.execute("SELECT COUNT(*) FROM feedbacks WHERE status NOT IN ('CLOSED','REJECTED') AND created_at<=?", ((datetime.now(timezone.utc)-timedelta(days=5)).isoformat(),)).fetchone()[0]
        overdue = db.execute("SELECT COUNT(*) FROM feedbacks WHERE status NOT IN ('CLOSED','REJECTED') AND created_at<=?", ((datetime.now(timezone.utc)-timedelta(days=10)).isoformat(),)).fetchone()[0]
        closed = db.execute("SELECT COUNT(*) FROM feedbacks WHERE substr(updated_at,1,7)=? AND status IN ('CLOSED','REPLIED')", (month,)).fetchone()[0]
        trend_rows = db.execute("SELECT substr(created_at,1,10) AS date,COUNT(*) AS value FROM feedbacks WHERE substr(created_at,1,10)>=? GROUP BY date ORDER BY date", (start,)).fetchall()
        cats = db.execute("SELECT department AS name,COUNT(*) AS value FROM feedbacks GROUP BY department ORDER BY value DESC").fetchall()
    trend = {row["date"]: row["value"] for row in trend_rows}
    days = [(datetime.now(timezone.utc).date()-timedelta(days=i)).isoformat() for i in range(13,-1,-1)]
    return {"total": total, "pending": pending, "processing": processing, "due_soon": due, "overdue": overdue, "closed_month": closed,
            "recent_trend": [{"date": d, "value": trend.get(d,0)} for d in days], "by_category": [dict(r) for r in cats]}


@app.get("/api/v1/admin/feedbacks")
def admin_feedback_list(request: Request, limit: int=100, status: Optional[str]=None, q: Optional[str]=None, user=Depends(admin)):
    limit = min(max(limit,1),100)
    query = "SELECT id,public_id,title,department AS category,status,created_at FROM feedbacks WHERE 1=1"
    params = []
    if status:
        if status not in STATUSES: raise HTTPException(422, "无效状态")
        query += " AND status=?"; params.append(status)
    if q:
        query += " AND (public_id LIKE ? OR title LIKE ? OR description LIKE ?)"
        term = "%" + q[:100] + "%"
        params.extend([term,term,term])
    query += " ORDER BY created_at DESC LIMIT ?"; params.append(limit)
    with connect() as db:
        return [dict(row) for row in db.execute(query,params).fetchall()]


@app.get("/api/v1/admin/feedbacks/{feedback_id}")
def admin_feedback_detail(feedback_id: int, user=Depends(admin)):
    with connect() as db:
        f = db.execute("SELECT id,public_id,title,description,department AS responsible_department_name,status,created_at,updated_at FROM feedbacks WHERE id=?", (feedback_id,)).fetchone()
        if not f: raise HTTPException(404,"未找到该建议")
        result = dict(f)
        result["category"] = result["responsible_department_name"]
        result["messages"] = [dict(m) for m in db.execute("SELECT sender_type,content,created_at FROM messages WHERE feedback_id=? ORDER BY created_at", (feedback_id,)).fetchall()]
        return result


@app.post("/api/v1/admin/feedbacks/{feedback_id}/messages")
def admin_reply(feedback_id: int, payload: MessageInput, user=Depends(admin)):
    content = payload.content.strip()
    if not content: raise HTTPException(422,"回复内容不能为空")
    with connect() as db:
        f = db.execute("SELECT id FROM feedbacks WHERE id=?", (feedback_id,)).fetchone()
        if not f: raise HTTPException(404,"未找到该建议")
        db.execute("INSERT INTO messages(feedback_id,sender_type,content,created_at) VALUES(?,'ADMIN',?,?)", (feedback_id,content,now_iso()))
        db.execute("UPDATE feedbacks SET status='REPLIED',updated_at=? WHERE id=?", (now_iso(),feedback_id))
    return {"ok":True}


@app.post("/api/v1/admin/feedbacks/{feedback_id}/status")
def admin_set_status(feedback_id: int, payload: StatusInput, user=Depends(admin)):
    if payload.status not in STATUSES: raise HTTPException(422,"无效处理状态")
    with connect() as db:
        f = db.execute("SELECT id FROM feedbacks WHERE id=?", (feedback_id,)).fetchone()
        if not f: raise HTTPException(404,"未找到该建议")
        db.execute("UPDATE feedbacks SET status=?,updated_at=? WHERE id=?", (payload.status,now_iso(),feedback_id))
    return {"ok":True}


@app.exception_handler(Exception)
async def safe_error_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=exc.headers)
    return JSONResponse(status_code=500, content={"detail": "服务器暂时无法处理请求"})
