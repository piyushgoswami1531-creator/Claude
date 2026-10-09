import logging
import mimetypes

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from .config import PROJECT_DIR, get_settings
from .db import Base, engine
from .routers import auth, plan, quiz, stats, syllabus
from .services.ai.client import AIError

mimetypes.add_type("application/manifest+json", ".webmanifest")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

settings = get_settings()


def migrate() -> None:
    """Create tables; add columns that older (v1, single-user) databases are missing."""
    Base.metadata.create_all(engine)
    cols = {c["name"] for c in inspect(engine).get_columns("plans")}
    if "user_id" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE plans ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE"))


migrate()

app = FastAPI(title="StudyFlow", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AIError)
async def ai_error_handler(_: Request, exc: AIError):
    return JSONResponse(status_code=exc.status, content={"detail": exc.message})


@app.get("/api/health")
def health():
    return {"ok": True, "ai_mode": "live" if settings.ai_live else "demo", "model": settings.claude_model,
            "daily_ai_limit": settings.daily_ai_limit if settings.ai_live else None}


for r in (auth.router, syllabus.router, plan.router, quiz.router, stats.router):
    app.include_router(r)

# Production: serve the built frontend from the same port (`npm run build` first).
DIST = PROJECT_DIR / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404, "Not found.")
        file = (DIST / path).resolve()
        if path and file.is_file() and DIST.resolve() in file.parents:
            # The service worker must never be cached, or app updates would never reach users.
            headers = {"Cache-Control": "no-cache"} if path in ("sw.js", "registerSW.js", "manifest.webmanifest") else None
            return FileResponse(file, headers=headers)
        return FileResponse(DIST / "index.html", headers={"Cache-Control": "no-cache"})
