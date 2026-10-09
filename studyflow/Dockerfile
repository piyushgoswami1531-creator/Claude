# Production image: builds the React app, then serves it + the API from one port.

# ---- 1. Build the frontend ----------------------------------------------------
FROM node:22-slim AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- 2. Python runtime ---------------------------------------------------------
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt
COPY backend/app backend/app
COPY --from=web /app/frontend/dist frontend/dist

# Don't run as root.
RUN useradd --create-home --uid 10001 studyflow && chown -R studyflow /app
USER studyflow
WORKDIR /app/backend

EXPOSE 8000
# Hosts like Render/Railway inject $PORT. --proxy-headers so HTTPS is detected behind their proxy.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
