FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt     && groupadd --system app     && useradd --system --gid app --home-dir /app app     && mkdir -p /data     && chown app:app /data

COPY --chown=app:app . .
USER app

EXPOSE 8080
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--no-access-log"]
