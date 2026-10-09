# Deploying Praabhaav (free)

This puts the app online at a public `https://` address **for ₹0 and without a card**, using three free services:

| Service | What it does | Free plan |
|---|---|---|
| **Neon** | Stores all the data (Postgres database) | Free forever, no card. 0.5–1 GB, enough for years of campaigns |
| **Render** | Runs the app | Free web service. It sleeps after 15 min without visitors |
| **cron-job.org** | Keeps the app awake, and runs the scheduled jobs (reel checks, 8:30 views refresh, 9:30 summary) | Free |

Free plans change their rules from time to time, so check each site's current limits. When Praabhaav is ready to pay, see [Upgrading later](#upgrading-later); it takes 2 minutes and nothing is lost.

**Time:** about 25 minutes. A laptop is easier than a phone for this.

---

## Step 1: create the database on Neon (5 min)

1. Go to **neon.tech** → **Sign up** (GitHub or Google is fine).
2. Create a project:
   - **Project name:** `praabhaav`
   - **Region:** **AWS Asia Pacific (Singapore)**, the same region the app uses on Render
   - Leave the Postgres version as it is → **Create project**.
3. On the project dashboard click **Connect**.
4. Turn **Connection pooling ON**. The host name then contains `-pooler`.
5. Copy the connection string. It looks like:
   ```
   postgresql://neondb_owner:xxxxxxxx@ep-something-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```
   This is your **`DATABASE_URL`**. It contains the database password, so keep it private: don't paste it in chats or commit it to GitHub.

The app creates its own tables the first time it starts. You don't need to run anything on Neon.

## Step 2: optional keys (10 min, can be added later)

| Key | Where to get it | Turns on |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Telegram → message **@BotFather** → `/newbot` → copy the token | Alerts and daily summary |
| `TELEGRAM_CHAT_ID` | Send your new bot "hi", then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy the number after `"chat":{"id":` | Where alerts go |
| `APIFY_TOKEN` | apify.com → **Settings → API & Integrations** | Reel checks, live views, follower counts |
| `ANTHROPIC_API_KEY` | console.anthropic.com → **API keys** | Claude answers questions (otherwise keyword rules) |

## Step 3: create the app on Render (5 min plus the build)

1. render.com → sign in with GitHub, and give Render access to the **Claude** repository.
2. Dashboard → **＋ New** (top bar) → **Blueprint**.
   On a phone, if you can't find it, use Chrome's **⋮ → Desktop site**.
3. Pick the **Claude** repo → **Connect**.
   - **Blueprint name:** `praabhaav`
   - **Branch:** your default branch (`main` if you renamed it, otherwise `claude/scroll-craft-plugin-install-v5oq2e`)
4. Render reads [`render.yaml`](../render.yaml) and shows **one free web service: `praabhaav`**.
5. Fill in the values it asks for:
   - **`DATABASE_URL`:** the Neon string from Step 1 (**required**)
   - The optional keys from Step 2, or leave them blank
6. Click **Apply**.
   Render occasionally asks for a card even on the free plan, as an anti-fraud check. That's Render's decision; the free plan itself doesn't charge.
7. Open the **praabhaav** service → **Logs**. The first build takes **3–6 minutes**. When it's done, the status says **Live** and your URL appears at the top, like `https://praabhaav-xxxx.onrender.com`.

<details>
<summary><strong>If the Blueprint gives an error: set it up by hand instead</strong></summary>

`render.yaml` couldn't be checked against Render's live docs when it was written. If Render rejects it, use **＋ New → Web Service** → pick **Claude**, then:

| Setting | Value |
|---|---|
| Name | `praabhaav` |
| Language | **Docker** |
| Branch | your default branch |
| Region | **Singapore** |
| Dockerfile Path | `praabhaav/Dockerfile` |
| Docker Build Context Directory | `praabhaav` |
| Instance Type | **Free** |
| Health Check Path (Advanced) | `/healthz` |

**Environment variables** (Advanced → Add Environment Variable):

| Key | Value |
|---|---|
| `DATABASE_URL` | your Neon string |
| `REQUIRE_DATABASE_URL` | `1` |
| `ENABLE_SCHEDULER` | `0` |
| `CRON_SECRET` | a long random string (letters and numbers) |
| `ADMIN_USER` | `admin` |
| `ADMIN_PASSWORD` | a long random password |
| `SECRET_KEY` | another long random string |
| Optional keys from Step 2 | as available |

</details>

## Step 4: set up cron-job.org (5 min)

The free app falls asleep after 15 minutes without visitors, and it can't run timed jobs while asleep. cron-job.org fixes both.

1. In Render → your service → **Environment**, reveal and copy **`CRON_SECRET`**.
2. Go to **cron-job.org** → **Sign up** (free) → confirm your email.
3. **Settings** → set your **time zone** to **Asia/Kolkata**.
4. **Create cronjob #1: keep awake**
   - **Title:** `Praabhaav keep awake`
   - **URL:** `https://<your-app>.onrender.com/healthz`
   - **Schedule:** every **10 minutes** → **Create**
   This doesn't touch the database, so Neon stays asleep and saves its free compute.
5. **Create cronjob #2: scheduled jobs**
   - **Title:** `Praabhaav jobs`
   - **URL:** `https://<your-app>.onrender.com/cron/run?key=<CRON_SECRET>`
   - **Schedule:** every **30 minutes** → **Create**
   This runs the reel checks, the 8:30 AM views refresh and the 9:30 AM daily summary.
6. Open cronjob #2 → **History** after its first run. It should show **200 OK**. A **404** means the key in the URL doesn't match `CRON_SECRET`.

**Why two jobs:** the keep-awake ping is cheap and doesn't touch the database. The jobs run only every 30 minutes, so Neon sleeps in between and the database stays within its free monthly compute. Don't make job #2 more frequent.

## Step 5: log in and check everything (10 min)

1. Render → **Environment** → reveal **`ADMIN_PASSWORD`** and save it in a password manager.
2. `https://<your-app>/healthz?deep=1` should show `{"ok":true}`, which confirms the app can reach Neon.
3. `https://<your-app>/login` → username **`admin`** and that password.
4. **Team:** add an account for each team member, so nobody shares the owner password.
5. **Campaigns:** create a test campaign, pasting the song's **Instagram audio link**.
6. Click **Copy creator submit link**, open it on your phone, and submit a reel **from your own Instagram** with a PIN.
7. **My payments** (`/me`): log in with that handle, number and PIN. You should see only your reel.
8. **Ask a question:** "wrong UPI entered". With Telegram set up, an alert arrives within seconds.
9. **Submissions → Check pending reels.** Refresh after a minute to see *passed* or *failed*.
10. **Payouts:** set your real daily UPI limit.
11. On the campaign page, add a creator, click **Refresh live views**, then **Create client report link**.
12. **Submissions → Backup** downloads a `.db` file.

Before sharing with creators, edit `praabhaav/app/knowledge/faq.md` on GitHub so it states your real payment policy. Merging the change redeploys automatically.

---

## What to expect on the free setup

- **Speed:** normally as fast as the paid version. If the keep-awake job ever stops, the first visit after a quiet spell takes **up to a minute** while the app wakes.
- **Render's free hours:** 750 a month, enough for one app awake all month. Don't run a second free Render service on the same account, because the hours are shared.
- **Data:** lives in Neon and survives every restart and deploy. Still download **Submissions → Backup** weekly and keep the files in Google Drive.
- **Updates:** every merge to your default branch redeploys automatically.

## Upgrading later

When Praabhaav wants it always-on with no free-plan limits:

- **Easiest (keep Neon):** Render → service → **Settings → Instance Type → Starter** (~$7/month). Nothing else changes; the data stays in Neon. You can then delete cronjob #1 (keep-awake).
- **Move everything onto Render's disk instead:** use [`deploy/render.paid.yaml`](deploy/render.paid.yaml) (Starter plus a 1 GB disk) and copy the data across, as below.

**Copying data between databases** (moving to Neon, or restoring a backup into an empty database):

```bash
cd praabhaav
pip install -r requirements.txt
python -m app.copydb praabhaav-backup-2026-10-09.db "postgresql://...neon.tech/neondb?sslmode=require"
```

The destination must be empty; the tool refuses to merge or overwrite.

## Troubleshooting

| What you see | Fix |
|---|---|
| Deploy fails, logs say **"DATABASE_URL is not set"** | Add the Neon string under **Environment**. This guard stops the app from running on Render's temporary disk, where data would be lost |
| Logs show a **connection error to neon.tech** | Re-copy the string from Neon with **pooling on**; check it ends with `?sslmode=require…` |
| cron-job.org history shows **404** for job #2 | The `key=` in the URL doesn't match `CRON_SECRET` |
| App is slow to open the first time | The keep-awake job (#1) isn't running. Check its history on cron-job.org |
| Login page says "No host accounts exist yet" | `ADMIN_PASSWORD` is missing under **Environment** |
| Everyone gets logged out after a deploy | `SECRET_KEY` is missing under **Environment** |
| No Telegram alerts | Check both Telegram keys, and that you messaged the bot first |
| "Reel checks off (set APIFY_TOKEN)" | Add `APIFY_TOKEN` under **Environment** |
| Neon says the free compute is used up | Make sure job #2 runs every 30 min, not more often, and that `ENABLE_SCHEDULER` is `0` |
| Anything else | Render → **Logs**: copy the last 30 lines and ask for help |
