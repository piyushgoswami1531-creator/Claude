"""Host pages for campaigns and the per-campaign creator tracker (the 'sheet')."""

import secrets

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, RedirectResponse, Response

from . import tracker, validation
from .web import Ctx


def register(app: FastAPI, ctx: Ctx) -> None:
    db = ctx.db
    host = Depends(ctx.require_host)

    def campaign_or_404(campaign_id: int):
        campaign = db.get_campaign(campaign_id)
        if campaign is None:
            raise HTTPException(404, "Campaign not found")
        return campaign

    def row_or_404(row_id: int):
        row = db.get_roster_row(row_id)
        if row is None:
            raise HTTPException(404, "Row not found")
        return row

    def fragments(campaign_id: int, row_id: int | None = None) -> dict:
        """Re-rendered pieces of the tracker page, so the browser can swap them in."""
        rows = db.list_roster(campaign_id)
        totals = tracker.totals(rows)
        env = ctx.templates.env
        out = {"totals_html": env.get_template("_roster_totals.html").render(totals=totals)}
        if row_id is not None:
            row = next((r for r in rows if r["id"] == row_id), None)
            if row is not None:
                out["row_html"] = env.get_template("_roster_row.html").render(
                    r=row, max_views=totals["max_views"], cpm=tracker.row_cpm(row))
        return out

    # --- campaigns list --------------------------------------------------------

    @app.get("/admin/campaigns")
    def campaigns(request: Request, user: str = host):
        cards = []
        for c in db.list_campaigns():
            cards.append({"c": c, "t": tracker.totals(db.list_roster(c["id"]))})
        return ctx.render(request, "admin_campaigns.html", {
            "stats": db.stats(), "cards": cards, "base_url": ctx.public_url(request),
        })

    @app.post("/admin/campaigns")
    def create_campaign(
        name: str = Form(...),
        song: str = Form(""),
        client: str = Form(""),
        default_amount: int = Form(0),
        audio_link: str = Form(""),
        user: str = host,
    ):
        if not name.strip() or default_amount < 0:
            raise HTTPException(400, "Campaign needs a name and a non-negative amount.")
        try:
            audio_id = validation.clean_audio(audio_link)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        new_id = db.create_campaign(name.strip(), song.strip(), client.strip(),
                                    default_amount, audio_id)
        return RedirectResponse(f"/admin/campaigns/{new_id}", status_code=303)

    @app.post("/admin/campaigns/{campaign_id}/toggle")
    def toggle_campaign(campaign_id: int, user: str = host):
        campaign = campaign_or_404(campaign_id)
        db.set_campaign_active(campaign_id, not campaign["active"])
        return RedirectResponse("/admin/campaigns", status_code=303)

    # --- one campaign's tracker ------------------------------------------------

    @app.get("/admin/campaigns/{campaign_id}")
    def campaign_page(request: Request, campaign_id: int, user: str = host):
        campaign = campaign_or_404(campaign_id)
        rows = db.list_roster(campaign_id)
        totals = tracker.totals(rows)
        return ctx.render(request, "admin_campaign.html", {
            "stats": db.stats(), "campaign": campaign, "rows": rows, "totals": totals,
            "cpms": {r["id"]: tracker.row_cpm(r) for r in rows},
            "series": tracker.views_series(db, campaign_id),
            "apify_on": ctx.fetcher is not None,
            "job": ctx.jobs.get(campaign_id),
            "submit_link": f"{ctx.public_url(request)}/submit?campaign={campaign_id}",
            "report_link": (f"{ctx.public_url(request)}/r/{campaign['report_token']}"
                            if campaign["report_token"] else ""),
            "report_saved": request.query_params.get("report"),
            "imported": request.query_params.get("imported"),
            "import_problems": request.query_params.getlist("problem"),
        })

    @app.post("/admin/campaigns/{campaign_id}/report")
    def manage_report_link(campaign_id: int, action: str = Form(...), user: str = host):
        """Turn the client report link on, replace it (old link stops working), or off."""
        campaign_or_404(campaign_id)
        if action in ("enable", "regenerate"):
            db.set_report_token(campaign_id, secrets.token_urlsafe(18))
        elif action == "disable":
            db.set_report_token(campaign_id, "")
        else:
            raise HTTPException(400, "Unknown action")
        return RedirectResponse(f"/admin/campaigns/{campaign_id}?report={action}", status_code=303)

    # --- public client report (secret link, no login) ----------------------------

    REPORT_HEADERS = {"X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer",
                      "Cache-Control": "private, no-store"}

    def report_or_404(token: str):
        campaign = db.get_campaign_by_report_token(token)
        if campaign is None:
            raise HTTPException(404, "This report link isn't active. Ask Praabhaav for a new one.")
        return campaign

    @app.get("/r/{token}")
    def client_report_page(request: Request, token: str):
        campaign = report_or_404(token)
        report = tracker.client_report(db.list_roster(campaign["id"]))
        response = ctx.render(request, "report.html", {
            "campaign": campaign, "report": report, "token": token,
            "series": tracker.views_series(db, campaign["id"]),
        })
        response.headers.update(REPORT_HEADERS)
        return response

    @app.get("/r/{token}/report.csv")
    def client_report_csv(token: str):
        campaign = report_or_404(token)
        report = tracker.client_report(db.list_roster(campaign["id"]))
        slug = "".join(ch if ch.isalnum() else "-" for ch in campaign["name"].lower()).strip("-")
        return Response(tracker.report_csv(report), media_type="text/csv", headers={
            **REPORT_HEADERS,
            "Content-Disposition": f'attachment; filename="{slug or "campaign"}-report.csv"',
        })

    @app.get("/admin/campaigns/{campaign_id}/export.csv")
    def export_tracker(campaign_id: int, user: str = host):
        campaign = campaign_or_404(campaign_id)
        slug = "".join(ch if ch.isalnum() else "-" for ch in campaign["name"].lower()).strip("-")
        return Response(tracker.to_csv(db.list_roster(campaign_id)), media_type="text/csv",
                        headers={"Content-Disposition":
                                 f'attachment; filename="{slug or "campaign"}-tracker.csv"'})

    @app.post("/admin/campaigns/{campaign_id}/import")
    async def import_tracker(campaign_id: int, file: UploadFile = File(...), user: str = host):
        campaign_or_404(campaign_id)
        raw = await file.read()
        if len(raw) > 2_000_000:
            raise HTTPException(400, "File too large (max 2 MB).")
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = raw.decode("latin-1")
        rows, problems = tracker.parse_csv(text)
        for row in rows:
            db.add_roster_row(campaign_id, **row)
        query = f"imported={len(rows)}" + "".join(f"&problem={p[:120]}" for p in problems[:10])
        return RedirectResponse(f"/admin/campaigns/{campaign_id}?{query}", status_code=303)

    # --- JSON API used by the interactive table ----------------------------------

    def bad(message: str, code: int = 400):
        return JSONResponse({"error": message}, status_code=code)

    @app.post("/admin/api/campaigns/{campaign_id}/rows")
    async def api_add_row(request: Request, campaign_id: int, user: str = host):
        campaign_or_404(campaign_id)
        data = await request.json()
        try:
            row = tracker.clean_row({k: data.get(k, "") for k in tracker.EDITABLE_FIELDS})
        except ValueError as exc:
            return bad(str(exc))
        row_id = db.add_roster_row(campaign_id, **row)
        return {"id": row_id, **fragments(campaign_id, row_id)}

    @app.patch("/admin/api/rows/{row_id}")
    async def api_edit_row(request: Request, row_id: int, user: str = host):
        row = row_or_404(row_id)
        data = await request.json()
        data = {k: v for k, v in data.items() if k in tracker.EDITABLE_FIELDS}
        if "handle" in data:  # editing the creator cell means a new profile
            data["profile_url"] = data.pop("handle")
        try:
            fields = tracker.clean_row(data)
        except ValueError as exc:
            return bad(str(exc))
        db.update_roster_row(row_id, **fields)
        return fragments(row["campaign_id"], row_id)

    @app.delete("/admin/api/rows/{row_id}")
    def api_delete_row(row_id: int, user: str = host):
        row = row_or_404(row_id)
        db.delete_roster_row(row_id)
        return fragments(row["campaign_id"])

    @app.post("/admin/api/campaigns/{campaign_id}/refresh")
    def api_refresh(campaign_id: int, background_tasks: BackgroundTasks, kind: str = "views",
                    user: str = host):
        campaign_or_404(campaign_id)
        if ctx.fetcher is None:
            return bad("Live stats are off: set APIFY_TOKEN on the server.")
        if kind not in ("views", "followers"):
            return bad("Unknown refresh type.")
        if not ctx.jobs.start(campaign_id, kind):
            return bad("A refresh is already running for this campaign.", 409)
        fn = tracker.refresh_views if kind == "views" else tracker.refresh_followers
        background_tasks.add_task(tracker.run_job, ctx.jobs, campaign_id, fn, db,
                                  db.list_roster(campaign_id), ctx.fetcher)
        return JSONResponse({"state": "running"}, status_code=202)

    @app.get("/admin/api/campaigns/{campaign_id}/job")
    def api_job(request: Request, campaign_id: int, user: str = host):
        campaign_or_404(campaign_id)
        job = ctx.jobs.get(campaign_id)
        if job["state"] in ("done", "error"):
            rows = db.list_roster(campaign_id)
            totals = tracker.totals(rows)
            body = ctx.templates.env.get_template("_roster_body.html").render(
                rows=rows, max_views=totals["max_views"],
                cpms={r["id"]: tracker.row_cpm(r) for r in rows})
            chart = ctx.templates.env.get_template("_views_chart.html").render(
                series=tracker.views_series(db, campaign_id))
            job = {**job, "body_html": body, "chart_html": chart, **fragments(campaign_id)}
        return job
