"""Praabhaav creator payments: submissions, creator and host logins, query agent,
reel verification, payment planner, campaign tracker and admin.

Run locally:
    ADMIN_PASSWORD=change-me uvicorn app.main:create_app --factory --reload
"""

import asyncio
import os
import secrets
from contextlib import asynccontextmanager
from urllib.parse import quote

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from . import routes_admin, routes_creator, routes_tracker
from .agent import QueryAgent
from .auth import SessionSigner
from .db import Database, database_target_from_env
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
    if (not db_path and os.environ.get("REQUIRE_DATABASE_URL") == "1"
            and not os.environ.get("DATABASE_URL")):
        # On free hosting the local disk is wiped on every restart: never fall back to it.
        raise RuntimeError("DATABASE_URL is not set. Add your Neon connection string "
                           "under Environment (see DEPLOY.md).")
    ctx = Ctx(
        db=Database(db_path or database_target_from_env()),
        agent=agent or QueryAgent.from_env(),
        notifier=notifier or Notifier.from_env(),
        fetcher=fetcher or ApifyReelFetcher.from_env(),
        signer=SessionSigner.from_env(),
    )
    # One scheduler for both the in-app loop and /cron/run, so they share state and a lock.
    ctx.scheduler = Scheduler(ctx.db, ctx.fetcher, ctx.notifier, configured_base_url())

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        task = None
        if os.environ.get("ENABLE_SCHEDULER") == "1":
            task = asyncio.create_task(ctx.scheduler.run_forever())
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

    @app.api_route("/cron/run", methods=["GET", "POST"])
    def cron_run(background_tasks: BackgroundTasks, key: str = ""):
        """Called by an outside cron (cron-job.org) every 30 min on free hosting.
        Answers at once and runs the jobs after the response, since an Apify refresh
        can take longer than the cron service waits."""
        expected = os.environ.get("CRON_SECRET", "")
        if not expected or not secrets.compare_digest(key.encode(), expected.encode()):
            raise HTTPException(404)
        background_tasks.add_task(ctx.scheduler.run_tick)
        return {"ok": True}

    routes_creator.register(app, ctx)
    routes_admin.register(app, ctx)
    routes_tracker.register(app, ctx)
    app.state.ctx = ctx
    return app
