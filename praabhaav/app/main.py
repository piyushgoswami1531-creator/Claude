"""Praabhaav creator payments: submissions, creator and host logins, query agent,
reel verification, payment planner, campaign tracker and admin.

Run locally:
    ADMIN_PASSWORD=change-me uvicorn app.main:create_app --factory --reload
"""

import asyncio
import os
from contextlib import asynccontextmanager
from urllib.parse import quote

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from . import routes_admin, routes_creator, routes_tracker
from .agent import QueryAgent
from .auth import SessionSigner
from .db import Database
from .notify import Notifier, configured_base_url
from .reels import ApifyReelFetcher
from .scheduler import Scheduler
from .web import BASE_DIR, Ctx, LoginRequired


def create_app(
    db_path: str | None = None,
    agent: QueryAgent | None = None,
    notifier: Notifier | None = None,
    fetcher=None,
) -> FastAPI:
    """``fetcher`` talks to Apify (``ApifyReelFetcher``); None reads APIFY_TOKEN."""
    ctx = Ctx(
        db=Database(db_path or os.environ.get("PRAABHAAV_DB", "praabhaav.db")),
        agent=agent or QueryAgent.from_env(),
        notifier=notifier or Notifier.from_env(),
        fetcher=fetcher or ApifyReelFetcher.from_env(),
        signer=SessionSigner.from_env(),
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        task = None
        if os.environ.get("ENABLE_SCHEDULER") == "1":
            task = asyncio.create_task(
                Scheduler(ctx.db, ctx.fetcher, ctx.notifier, configured_base_url()).run_forever()
            )
        yield
        if task:
            task.cancel()

    app = FastAPI(title="Praabhaav", lifespan=lifespan)
    app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

    @app.exception_handler(LoginRequired)
    def login_required(request: Request, exc: LoginRequired):
        if request.url.path.startswith("/admin/api/") or request.method != "GET":
            return JSONResponse({"error": "Please log in again."}, status_code=401)
        target = request.url.path + (f"?{request.url.query}" if request.url.query else "")
        return RedirectResponse(f"/login?next={quote(target)}", status_code=303)

    routes_creator.register(app, ctx)
    routes_admin.register(app, ctx)
    routes_tracker.register(app, ctx)
    app.state.ctx = ctx
    return app
