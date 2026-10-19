import importlib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def service(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_SECRET_KEY", "test-secret-key-that-is-at-least-32-bytes")
    monkeypatch.setenv("SMTP_HOST", "smtp.example.test")
    monkeypatch.setenv("SMTP_FROM", "nuanyan@example.test")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("ADMIN_USERNAME", "admin-test")
    monkeypatch.setenv("ADMIN_EMAIL", "admin@example.test")
    monkeypatch.setenv("ADMIN_PASSWORD", "Strong-Admin-Password-123!")
    monkeypatch.setenv("ALLOWED_EMAIL_DOMAINS", "example.test")
    monkeypatch.setenv("COOKIE_SECURE", "false")
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "nuanyan.sqlite3"))

    import backend.app as module
    module = importlib.reload(module)
    with TestClient(module.app) as client:
        yield module, client


def test_registration_feedback_and_admin_privacy(service, monkeypatch):
    module, employee_client = service

    class FakeSMTP:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def starttls(self):
            pass

        def send_message(self, message):
            self.message = message
            FakeSMTP.latest_message = message

    monkeypatch.setattr(module.smtplib, "SMTP", lambda *_args, **_kwargs: FakeSMTP())
    response = employee_client.post("/api/v1/auth/email-verification/request", json={
        "username": "worker1", "email": "worker@example.test"
    })
    assert response.status_code == 200
    code = re.search(r"\b(\d{6})\b", FakeSMTP.latest_message.get_content()).group(1)

    response = employee_client.post("/api/v1/auth/register", json={
        "username": "worker1", "email": "worker@example.test", "password": "Strong-Worker-123!",
        "verification_code": code, "display_name": "测试员工"
    })
    assert response.status_code == 200
    assert response.json()["user"]["username"] == "worker1"
    assert employee_client.get("/api/v1/auth/me").status_code == 200

    response = employee_client.post("/api/v1/feedbacks", json={
        "department": "人事部", "content": "希望增加员工心理健康支持服务。"
    })
    assert response.status_code == 200
    feedback_id = response.json()["id"]

    with TestClient(module.app) as admin_client:
        login = admin_client.post("/api/v1/admin/auth/login", json={
            "username": "admin-test", "password": "Strong-Admin-Password-123!"
        })
        assert login.status_code == 200
        rows = admin_client.get("/api/v1/admin/feedbacks").json()
        assert rows and rows[0]["id"] == feedback_id
        assert "email" not in rows[0] and "user_id" not in rows[0]

        reply = admin_client.post(f"/api/v1/admin/feedbacks/{feedback_id}/messages", json={
            "content": "已收到建议，我们会纳入下一季度服务评估。"
        })
        assert reply.status_code == 200
        mine = employee_client.get("/api/v1/feedbacks/mine").json()
        assert mine[0]["messages"][0]["sender_type"] == "ADMIN"
        assert mine[0]["status"] == "REPLIED"


def test_security_headers_and_auth_boundary(service):
    _module, client = service
    response = client.get("/")
    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert client.get("/api/v1/admin/feedbacks").status_code == 401
    assert client.post("/api/v1/feedbacks", json={"department": "人事部", "content": "一条测试建议文本"}).status_code == 401
