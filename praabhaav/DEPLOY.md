# Deploying Praabhaav

This puts the app online at a public `https://` address on [Render](https://render.com), in the Singapore region (the closest to India).

**Cost:** about **$7.25/month (≈ ₹620)**: an always-on Starter instance (~$7) plus a 1 GB disk (~$0.25/GB). Check Render's pricing page for current rates. The free instance type **can't be used**: it has no persistent disk, so every restart would wipe all payment records.

**Time:** about 15 minutes.

---

## Step 0: Get the code onto `main`

Render deploys from your repository's main branch. Merge the `ccr-6929894c-abgvvq` branch into `main` on GitHub: open a pull request from it, then click **Merge**.

## Step 1: Collect your keys (optional, can be added later)

Each feature switches itself off if its key is missing, so you can deploy first and add keys later.

| Key | Where to get it | What it turns on |
|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys | Claude answers queries (otherwise keyword rules) |
| `TELEGRAM_BOT_TOKEN` | Telegram → message @BotFather → `/newbot` | Alerts and daily summary |
| `TELEGRAM_CHAT_ID` | Message your new bot once, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `"chat":{"id": ...}` | Where alerts go (you, or a team group) |
| `APIFY_TOKEN` | apify.com → Settings → API & Integrations | Automatic reel checks |

## Step 2: Create the service on Render

1. Sign up at render.com **with GitHub**, and allow access to the `claude` repository.
2. Click **New → Blueprint**, then pick the `claude` repository. Render reads [`render.yaml`](../render.yaml) from the repository root.
3. It asks for `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` and `APIFY_TOKEN`. Paste the ones you have and leave the rest blank.
4. Click **Apply**. Render asks for a card (Starter is a paid plan), builds the app (~3 minutes) and gives you a URL like `https://praabhaav-xxxx.onrender.com`.

> `render.yaml` couldn't be checked against Render's live docs when it was written. If Render reports an error in it, use the manual setup below instead; it creates exactly the same thing.

<details>
<summary><strong>Manual setup (if the Blueprint is rejected)</strong></summary>

**New → Web Service** → pick the `claude` repo, then:

| Setting | Value |
|---|---|
| Language / Runtime | Docker |
| Branch | `main` |
| Region | Singapore |
| Dockerfile Path | `praabhaav/Dockerfile` |
| Docker Build Context Directory | `praabhaav` |
| Instance Type | Starter |
| Health Check Path | `/healthz` |
| Disk (Advanced) | Mount path `/data`, size 1 GB |

Environment variables:

| Key | Value |
|---|---|
| `PRAABHAAV_DB` | `/data/praabhaav.db` (**must** be under `/data`, or data is lost on restart) |
| `ENABLE_SCHEDULER` | `1` |
| `ADMIN_USER` | `admin` |
| `ADMIN_PASSWORD` | a long random password (e.g. from a password manager) |
| `SECRET_KEY` | another long random string (signs logins; changing it logs everyone out) |
| `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `APIFY_TOKEN` | from Step 1 |

</details>

## Step 3: Log in

Find the generated owner password in Render: your service → **Environment** → `ADMIN_PASSWORD` → reveal. Open `https://<your-url>/login`, then log in as `admin` with that password. Save it in a password manager.

Then open **Team** and add an account for each team member, so nobody shares the owner password.

## Step 4: Check that everything works

- [ ] `https://<your-url>/healthz` shows `{"ok":true}`
- [ ] `/login` works, and **Team** lets you add a member who can then log in
- [ ] Create a test campaign **with the song's Instagram audio link**
- [ ] Open its creator link and submit a reel **from your own Instagram account**
- [ ] **My payments** (`/me`) shows it after logging in with that handle, number and PIN
- [ ] Create a campaign tracker row, edit a cell, and click **Refresh live views**
- [ ] `/query`: ask "wrong UPI entered". A Telegram alert should arrive within seconds
- [ ] **Submissions → Check pending reels now**, then refresh after a minute. Your reel shows *passed* or *failed* with a reason
- [ ] **Payouts:** set your real daily UPI limit
- [ ] **Download backup** gives you a `.db` file

> The first time the app starts after 9:30 IST, it sends the daily summary straight away. After that it sends one summary a day at 9:30.

Delete the test campaign's data afterwards (or keep it as a demo), and **edit `app/knowledge/faq.md`** so it states your real payment policy. The agent repeats whatever is in that file.

## Step 5: Share the links

| Link | Where |
|---|---|
| `https://<your-url>/submit?campaign=<id>` (copy from admin) | WhatsApp, when a creator agrees to a campaign |
| `https://<your-url>/me` (creator login: "My payments") | Instagram bio, WhatsApp auto-reply |
| `https://<your-url>/query` | Instagram bio, WhatsApp auto-reply |

## Day-to-day

- **Updates:** every push to `main` redeploys automatically. Because the app has a disk, a deploy causes a short downtime (well under a minute).
- **Backups:** click **Download backup** in admin **at least weekly**, and keep the files in Google Drive. The disk is the only copy of your data.
- **One instance only:** don't scale above 1 instance. The database lives on that instance's disk, and the scheduler must run once.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Login page says "No host accounts exist yet" | `ADMIN_PASSWORD` isn't set. Add it under Environment |
| Everyone gets logged out after each deploy | `SECRET_KEY` isn't set. Add it under Environment |
| A creator forgot their PIN | Submissions → **Reset PIN** under their name (check it's really them first) |
| Data gone after a deploy | `PRAABHAAV_DB` isn't under `/data`, or no disk is attached |
| No Telegram alerts | Check both Telegram variables; the bot must have received a message from that chat first |
| "Automatic reel checks are off" | `APIFY_TOKEN` is missing |
| Queries answered by "rules" instead of Claude | `ANTHROPIC_API_KEY` is missing or invalid; see Logs |
| Anything else | Render → your service → **Logs** |

## Other hosts

The [`Dockerfile`](Dockerfile) works on any Docker host (Railway, Fly.io, or a VPS). Requirements: mount a persistent volume at `/data`, set the environment variables above, and run **one** instance. For example, on a VPS:

```bash
docker build -t praabhaav ./praabhaav
docker run -d --restart unless-stopped -p 8000:8000 -v praabhaav-data:/data \
  -e PRAABHAAV_DB=/data/praabhaav.db -e ENABLE_SCHEDULER=1 \
  -e ADMIN_PASSWORD=... -e SECRET_KEY=... -e PUBLIC_BASE_URL=https://your-domain \
  praabhaav
```

On a VPS, put a reverse proxy with HTTPS in front of it (e.g. Caddy). Creator UPI IDs and phone numbers must never travel over plain HTTP.
