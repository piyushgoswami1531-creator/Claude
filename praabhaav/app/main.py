"""Praabhaav creator payments: submission form, status page and admin tracker.

Run locally:
    ADMIN_PASSWORD=change-me uvicorn app.main:create_app --factory --reload
"""

import csv
import io
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, Form, HTTPException, Request, status
from fastapi.responses import RedirectResponse, Response
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from . import validation
from .db import STATUSES, Database, DuplicateSubmission, is_overdue

BASE_DIR = Path(__file__).resolve().parent
IST = timezone(timedelta(hours=5, minutes=30))

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


def create_app(db_path: str | None = None) -> FastAPI:
    db = Database(db_path or os.environ.get("PRAABHAAV_DB", "praabhaav.db"))
    app = FastAPI(title="Praabhaav Creator Payments")
    app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

    templates = Jinja2Templates(directory=BASE_DIR / "templates")
    templates.env.filters["ist"] = format_ist
    templates.env.globals["is_overdue"] = is_overdue
    templates.env.globals["STATUS_MESSAGES"] = STATUS_MESSAGES

    security = HTTPBasic()

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
            {"results": db.find_for_creator(handle, phone), "errors": [], "ig_handle": handle},
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
                "base_url": str(request.base_url).rstrip("/"),
            },
        )

    @app.post("/admin/campaigns")
    def create_campaign(
        name: str = Form(...),
        song: str = Form(""),
        client: str = Form(""),
        default_amount: int = Form(0),
        _: str = Depends(require_admin),
    ):
        if not name.strip() or default_amount < 0:
            raise HTTPException(400, "Campaign needs a name and a non-negative amount.")
        db.create_campaign(name.strip(), song.strip(), client.strip(), default_amount)
        return RedirectResponse("/admin", status_code=303)

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
        next_url: str = Form("/admin"),
        _: str = Depends(require_admin),
    ):
        if new_status not in STATUSES or amount < 0:
            raise HTTPException(400, "Invalid status or amount.")
        if db.get_submission(submission_id) is None:
            raise HTTPException(404)
        db.update_submission(submission_id, new_status, amount, note.strip())
        # Only redirect within the admin area.
        if not next_url.startswith("/admin") or next_url.startswith("//"):
            next_url = "/admin"
        return RedirectResponse(next_url, status_code=303)

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
