"""Praabhaav creator payments: submissions, status page, query agent, reel
verification, payment planner and admin.

Run locally:
    ADMIN_PASSWORD=change-me uvicorn app.main:create_app --factory --reload
"""

import asyncio
import csv
import io
import os
import secrets
import tempfile
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, Form, HTTPException, Request, status
from fastapi.responses import RedirectResponse, Response
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from . import validation
from .agent import QueryAgent
from .db import IST, STATUSES, inr, TICKET_STATUSES, Database, DuplicateSubmission, is_overdue
from .digest import build_digest
from .notify import Notifier, configured_base_url, ticket_alert
from .planner import current_plan, expected_dates, group_by_day, today_ist
from .reels import ApifyReelFetcher, verify_pending
from .scheduler import Scheduler

BASE_DIR = Path(__file__).resolve().parent

STATUS_MESSAGES = {
    "submitted": "We've received your reel. Our team will verify it shortly.",
    "approved": "Your reel is approved and your payment is in the queue.",
    "scheduled": "Your payment is scheduled and will be sent soon.",
    "paid": "Paid! Please check your UPI app.",
    "issue": "There's a problem with this submission. See the note below, "
             "or message us on WhatsApp.",
}


def format_ist(value: str | None) -> str:
    if not value:
        return ""
    return datetime.fromisoformat(value).astimezone(IST).strftime("%d %b %Y, %I:%M %p")


def create_app(
    db_path: str | None = None,
    agent: QueryAgent | None = None,
    notifier: Notifier | None = None,
    fetcher=None,
) -> FastAPI:
    """``fetcher`` fetches reel data (``ApifyReelFetcher``); None reads APIFY_TOKEN."""
    db = Database(db_path or os.environ.get("PRAABHAAV_DB", "praabhaav.db"))
    agent = agent or QueryAgent.from_env()
    notifier = notifier or Notifier.from_env()
    fetcher = fetcher or ApifyReelFetcher.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        task = None
        if os.environ.get("ENABLE_SCHEDULER") == "1":
            task = asyncio.create_task(
                Scheduler(db, fetcher, notifier, configured_base_url()).run_forever()
            )
        yield
        if task:
            task.cancel()

    app = FastAPI(title="Praabhaav Creator Payments", lifespan=lifespan)
    app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

    templates = Jinja2Templates(directory=BASE_DIR / "templates")
    templates.env.filters["ist"] = format_ist
    templates.env.filters["inr"] = inr
    templates.env.globals["is_overdue"] = is_overdue
    templates.env.globals["STATUS_MESSAGES"] = STATUS_MESSAGES

    security = HTTPBasic()

    def public_url(request: Request) -> str:
        return configured_base_url() or str(request.base_url).rstrip("/")

    def require_admin(credentials: HTTPBasicCredentials = Depends(security)) -> str:
        password = os.environ.get("ADMIN_PASSWORD")
        if not password:
            raise HTTPException(503, "Admin is disabled: set ADMIN_PASSWORD.")
        username = os.environ.get("ADMIN_USER", "admin")
        ok_user = secrets.compare_digest(credentials.username.encode(), username.encode())
        ok_pass = secrets.compare_digest(credentials.password.encode(), password.encode())
        if not (ok_user and ok_pass):
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "Wrong username or password",
                headers={"WWW-Authenticate": "Basic"},
            )
        return credentials.username

    # --- creator pages -----------------------------------------------------

    @app.get("/healthz")
    def healthz():
        db.get_setting("daily_limit")  # fails loudly if the database is unreachable
        return {"ok": True}

    @app.get("/")
    def home():
        return RedirectResponse("/submit")

    @app.get("/submit")
    def submit_form(request: Request, campaign: int | None = None):
        return templates.TemplateResponse(
            request,
            "submit.html",
            {"campaigns": db.list_campaigns(active_only=True), "values": {"campaign_id": campaign},
             "errors": []},
        )

    @app.post("/submit")
    def submit(
        request: Request,
        campaign_id: int = Form(...),
        ig_handle: str = Form(...),
        whatsapp: str = Form(...),
        upi_id: str = Form(...),
        upi_confirm: str = Form(...),
        reel_url: str = Form(...),
    ):
        values = {
            "campaign_id": campaign_id, "ig_handle": ig_handle, "whatsapp": whatsapp,
            "upi_id": upi_id, "upi_confirm": upi_confirm, "reel_url": reel_url,
        }
        errors: list[str] = []
        cleaned: dict = {}

        campaign = db.get_campaign(campaign_id)
        if campaign is None or not campaign["active"]:
            errors.append("Please choose a campaign.")

        checks = [
            ("ig_handle", lambda: validation.clean_ig_handle(ig_handle)),
            ("whatsapp", lambda: validation.clean_whatsapp(whatsapp)),
            ("upi_id", lambda: validation.clean_upi(upi_id, upi_confirm)),
            ("reel_url", lambda: validation.clean_reel_url(reel_url)),
        ]
        for field, check in checks:
            try:
                cleaned[field] = check()
            except ValueError as exc:
                errors.append(str(exc))

        if not errors:
            try:
                db.add_submission(campaign_id, **cleaned)
            except DuplicateSubmission:
                errors.append(
                    "You've already submitted a reel for this campaign. "
                    "Use 'Check payment status' to track it."
                )

        if errors:
            return templates.TemplateResponse(
                request,
                "submit.html",
                {"campaigns": db.list_campaigns(active_only=True), "values": values,
                 "errors": errors},
                status_code=400,
            )
        return templates.TemplateResponse(
            request, "submitted.html", {"campaign": campaign, "ig_handle": cleaned["ig_handle"]}
        )

    @app.get("/status")
    def status_form(request: Request):
        return templates.TemplateResponse(request, "status.html", {"results": None, "errors": []})

    # POST so the phone number never ends up in URLs or server logs.
    @app.post("/status")
    def status_lookup(request: Request, ig_handle: str = Form(...), whatsapp: str = Form(...)):
        try:
            handle = validation.clean_ig_handle(ig_handle)
            phone = validation.clean_whatsapp(whatsapp)
        except ValueError as exc:
            return templates.TemplateResponse(
                request, "status.html", {"results": None, "errors": [str(exc)]}, status_code=400
            )
        return templates.TemplateResponse(
            request,
            "status.html",
            {"results": db.find_for_creator(handle, phone),
             "expected": expected_dates(db),
             "tickets": db.find_tickets_for_creator(handle, phone),
             "errors": [], "ig_handle": handle},
        )

    # --- queries -----------------------------------------------------------

    @app.get("/query")
    def query_form(request: Request, role: str = "creator"):
        return templates.TemplateResponse(
            request,
            "query.html",
            {"campaigns": db.list_campaigns(active_only=True),
             "values": {"role": role if role in ("creator", "client") else "creator"},
             "errors": []},
        )

    @app.post("/query")
    def submit_query(
        request: Request,
        background_tasks: BackgroundTasks,
        role: str = Form(...),
        name: str = Form(...),
        whatsapp: str = Form(...),
        campaign_id: str = Form(""),
        message: str = Form(...),
    ):
        values = {"role": role, "name": name, "whatsapp": whatsapp,
                  "campaign_id": int(campaign_id) if campaign_id.isdigit() else None,
                  "message": message}
        errors: list[str] = []
        if role not in ("creator", "client"):
            errors.append("Choose whether you are a creator or a client.")
        try:
            if role == "creator":
                name = validation.clean_ig_handle(name)
            else:
                name = validation.clean_name(name)
        except ValueError as exc:
            errors.append(str(exc))
        try:
            phone = validation.clean_whatsapp(whatsapp)
        except ValueError as exc:
            errors.append(str(exc))
        try:
            message = validation.clean_message(message)
        except ValueError as exc:
            errors.append(str(exc))
        campaign = db.get_campaign(values["campaign_id"]) if values["campaign_id"] else None

        if errors:
            return templates.TemplateResponse(
                request, "query.html",
                {"campaigns": db.list_campaigns(active_only=True), "values": values,
                 "errors": errors},
                status_code=400,
            )

        records = db.find_for_creator(name, phone) if role == "creator" else []
        # Clients only get the campaign's name and song, never creator data.
        campaign_info = (
            {"name": campaign["name"], "song": campaign["song"]} if campaign else None
        )
        decision = agent.handle(
            role=role, name=name, message=message, records=records,
            campaign_info=campaign_info,
            expected=expected_dates(db) if role == "creator" else None,
        )
        ticket_id = db.add_ticket(
            access_token=secrets.token_urlsafe(16), role=role, name=name, contact=phone,
            campaign_id=campaign["id"] if campaign else None, message=message,
            category=decision.category, priority=decision.priority,
            ai_reply=decision.reply, team_summary=decision.team_summary,
            handled_by=decision.handled_by, escalated=decision.escalate,
        )
        ticket = db.get_ticket(ticket_id)
        if decision.escalate:
            background_tasks.add_task(notifier.send, ticket_alert(ticket, public_url(request)))
        return templates.TemplateResponse(
            request, "ticket.html",
            {"ticket": ticket, "just_created": True,
             "ticket_url": f"/tickets/{ticket_id}?token={ticket['access_token']}"},
        )

    @app.get("/tickets/{ticket_id}")
    def view_ticket(request: Request, ticket_id: int, token: str = ""):
        ticket = db.get_ticket(ticket_id)
        if ticket is None or not secrets.compare_digest(
            ticket["access_token"].encode(), token.encode()
        ):
            raise HTTPException(404, "Query not found")
        return templates.TemplateResponse(
            request, "ticket.html", {"ticket": ticket, "just_created": False, "ticket_url": None}
        )

    # --- admin -------------------------------------------------------------

    @app.get("/admin")
    def admin(
        request: Request,
        status_filter: str | None = None,
        campaign: int | None = None,
        _: str = Depends(require_admin),
    ):
        if status_filter not in STATUSES:
            status_filter = None
        return templates.TemplateResponse(
            request,
            "admin.html",
            {
                "stats": db.stats(),
                "campaigns": db.list_campaigns(),
                "submissions": db.list_submissions(status_filter, campaign),
                "statuses": STATUSES,
                "status_filter": status_filter,
                "campaign_filter": campaign,
                "base_url": public_url(request),
                "verify_on": fetcher is not None,
                "verifying": request.query_params.get("verifying") == "1",
            },
        )

    @app.post("/admin/campaigns")
    def create_campaign(
        name: str = Form(...),
        song: str = Form(""),
        client: str = Form(""),
        default_amount: int = Form(0),
        audio_link: str = Form(""),
        _: str = Depends(require_admin),
    ):
        if not name.strip() or default_amount < 0:
            raise HTTPException(400, "Campaign needs a name and a non-negative amount.")
        try:
            audio_id = validation.clean_audio(audio_link)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        db.create_campaign(name.strip(), song.strip(), client.strip(), default_amount, audio_id)
        return RedirectResponse("/admin", status_code=303)

    @app.post("/admin/verify")
    def verify_reels(background_tasks: BackgroundTasks, _: str = Depends(require_admin)):
        if fetcher is None:
            raise HTTPException(400, "Reel checks are off: set APIFY_TOKEN.")
        # An Apify run takes ~20-60s, so run it after the response is sent.
        background_tasks.add_task(verify_pending, db, fetcher, notifier)
        return RedirectResponse("/admin?verifying=1", status_code=303)

    # --- payouts -----------------------------------------------------------

    @app.get("/admin/payouts")
    def payouts(request: Request, _: str = Depends(require_admin)):
        plan = current_plan(db)
        today = today_ist()
        start_of_today = datetime(today.year, today.month, today.day, tzinfo=IST)
        return templates.TemplateResponse(
            request,
            "admin_payouts.html",
            {
                "stats": db.stats(),
                "daily_limit": db.get_daily_limit(),
                "paid_today": db.paid_since(start_of_today),
                "today": today,
                "todays": [p for p in plan if p.pay_date == today],
                "days": [d for d in group_by_day(plan) if d[0] != today],
                "over_limit": [p for p in plan if p.over_limit],
            },
        )

    @app.post("/admin/payouts/limit")
    def set_limit(daily_limit: int = Form(...), _: str = Depends(require_admin)):
        if daily_limit <= 0:
            raise HTTPException(400, "Daily limit must be more than ₹0.")
        db.set_daily_limit(daily_limit)
        return RedirectResponse("/admin/payouts", status_code=303)

    @app.post("/admin/payouts/mark-paid")
    def mark_paid(submission_ids: list[int] = Form([]), _: str = Depends(require_admin)):
        db.mark_paid(submission_ids)
        return RedirectResponse("/admin/payouts", status_code=303)

    @app.get("/admin/payouts/today.csv")
    def todays_batch_csv(_: str = Depends(require_admin)):
        today = today_ist()
        rows = [p.submission for p in current_plan(db) if p.pay_date == today]
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["id", "ig_handle", "upi_id", "amount", "campaign", "whatsapp"])
        for r in rows:
            writer.writerow([_csv_safe(v) for v in (
                r["id"], r["ig_handle"], r["upi_id"], r["amount"], r["campaign_name"],
                r["whatsapp"],
            )])
        return Response(
            buf.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="payouts-{today}.csv"'},
        )

    @app.post("/admin/campaigns/{campaign_id}/toggle")
    def toggle_campaign(campaign_id: int, _: str = Depends(require_admin)):
        campaign = db.get_campaign(campaign_id)
        if campaign is None:
            raise HTTPException(404)
        db.set_campaign_active(campaign_id, not campaign["active"])
        return RedirectResponse("/admin", status_code=303)

    @app.post("/admin/submissions/{submission_id}")
    def update_submission(
        submission_id: int,
        new_status: str = Form(...),
        amount: int = Form(...),
        note: str = Form(""),
        upi_id: str = Form(""),
        next_url: str = Form("/admin"),
        _: str = Depends(require_admin),
    ):
        if new_status not in STATUSES or amount < 0:
            raise HTTPException(400, "Invalid status or amount.")
        if db.get_submission(submission_id) is None:
            raise HTTPException(404)
        new_upi = None
        if upi_id.strip():
            try:
                new_upi = validation.clean_upi(upi_id, upi_id)
            except ValueError as exc:
                raise HTTPException(400, str(exc)) from exc
        db.update_submission(submission_id, new_status, amount, note.strip(), new_upi)
        # Only redirect within the admin area.
        if not next_url.startswith("/admin") or next_url.startswith("//"):
            next_url = "/admin"
        return RedirectResponse(next_url, status_code=303)

    @app.get("/admin/tickets")
    def admin_tickets(
        request: Request,
        status_filter: str | None = "escalated",
        _: str = Depends(require_admin),
    ):
        if status_filter not in TICKET_STATUSES:
            status_filter = None
        return templates.TemplateResponse(
            request,
            "admin_tickets.html",
            {"tickets": db.list_tickets(status_filter), "statuses": TICKET_STATUSES,
             "status_filter": status_filter, "stats": db.stats(),
             "agent_mode": "Claude" if agent.uses_claude else "keyword rules (no API key)",
             "telegram_on": notifier.configured},
        )

    @app.post("/admin/tickets/{ticket_id}")
    def update_ticket(
        ticket_id: int,
        new_status: str = Form(...),
        team_reply: str = Form(""),
        _: str = Depends(require_admin),
    ):
        if new_status not in TICKET_STATUSES:
            raise HTTPException(400, "Invalid status.")
        if db.get_ticket(ticket_id) is None:
            raise HTTPException(404)
        db.update_ticket(ticket_id, new_status, team_reply.strip())
        return RedirectResponse("/admin/tickets", status_code=303)

    @app.post("/admin/digest")
    def send_digest(request: Request, _: str = Depends(require_admin)):
        text = build_digest(db, public_url(request))
        sent = notifier.send(text)
        return Response(
            ("Sent to Telegram.\n\n" if sent else "Telegram not configured. Digest:\n\n") + text,
            media_type="text/plain; charset=utf-8",
        )

    @app.get("/admin/backup")
    def backup(_: str = Depends(require_admin)):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "backup.db")
            db.backup_to(path)
            with open(path, "rb") as f:
                data = f.read()
        name = f"praabhaav-backup-{today_ist()}.db"
        return Response(
            data,
            media_type="application/vnd.sqlite3",
            headers={"Content-Disposition": f'attachment; filename="{name}"'},
        )

    @app.get("/admin/export.csv")
    def export_csv(
        status_filter: str | None = None,
        campaign: int | None = None,
        _: str = Depends(require_admin),
    ):
        if status_filter not in STATUSES:
            status_filter = None
        rows = db.list_submissions(status_filter, campaign)
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "id", "campaign", "ig_handle", "whatsapp", "upi_id", "amount", "status",
            "reel_url", "submitted_at_ist", "paid_at_ist", "note",
        ])
        for r in rows:
            writer.writerow([_csv_safe(v) for v in (
                r["id"], r["campaign_name"], r["ig_handle"], r["whatsapp"], r["upi_id"],
                r["amount"], r["status"], r["reel_url"], format_ist(r["submitted_at"]),
                format_ist(r["paid_at"]), r["note"],
            )])
        name = f"payments-{status_filter or 'all'}.csv"
        return Response(
            buf.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{name}"'},
        )

    return app


def _csv_safe(value):
    """Stop spreadsheet apps from running text like '=HYPERLINK(...)' as a formula."""
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@"):
        return "'" + value
    return value
