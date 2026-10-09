import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import PROJECT_DIR, get_settings
from .db import Base, engine
from .routers import plan, quiz, stats, syllabus
from .services.ai.client import AIError

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

settings = get_settings()
Base.metadata.create_all(engine)

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
    return {"ok": True, "ai_mode": "live" if settings.ai_live else "demo", "model": settings.claude_model}


for r in (syllabus.router, plan.router, quiz.router, stats.router):
    app.include_router(r)

# Production: serve the built frontend from the same port (`npm run build` first).
DIST = PROJECT_DIR / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        file = (DIST / path).resolve()
        if path and file.is_file() and DIST.resolve() in file.parents:
            return FileResponse(file)
        return FileResponse(DIST / "index.html")
