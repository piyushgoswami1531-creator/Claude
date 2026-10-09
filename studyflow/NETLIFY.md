# Host StudyFlow on Netlify

This is the **standalone** version of StudyFlow: a static website that runs entirely in the browser. You don't need a server, a database or a GitHub account.

| | |
|---|---|
| **Cost** | Free (Netlify's free plan) |
| **Works on** | Android, iPhone, Windows, Mac, Linux: any modern browser |
| **Installable** | Yes, from Chrome, Edge and Safari (it's a PWA) |
| **Works offline** | Yes, after the first visit. Only AI features need internet |
| **Data** | Saved on each person's own device. Use **Export backup** to move it or keep it safe |
| **AI** | Optional. Each person pastes their **own** Claude API key in Settings, so you never pay for other people. Without a key it runs in demo mode |

---

## Option A: Netlify Drop (drag and drop, about 3 minutes)

### 1. Get the site folder
Unzip **`studyflow-netlify-site.zip`**. You'll get a folder named `studyflow-netlify-site` with these files inside:

```
_headers   _redirects   index.html   assets/   sw.js   manifest.webmanifest   (icons…)
```

> If you have the source code instead, build the folder yourself:
> `cd studyflow/frontend && npm install && npm run build:netlify` → the folder is `frontend/dist-netlify/`.

### 2. Drop it on Netlify
1. Open **https://app.netlify.com/drop** on a computer.
2. Drag the **whole `studyflow-netlify-site` folder** onto the page. Drag the folder itself, not the files inside it and not the zip.
3. Wait about 10 seconds. Netlify shows a link like `https://glittering-unicorn-12ab34.netlify.app`.

### 3. Keep it online (important)
Sites dropped without an account are **deleted after about an hour**. To keep yours:
1. Click **"Sign up"** (or "Claim your site") on the page Netlify shows after the upload. Email or Google is fine; you don't need GitHub.
2. Once signed in, the site stays online permanently on the free plan.

### 4. Give it a nicer name (optional)
**Site configuration → Change site name** → e.g. `studyflow-asha` → your link becomes `https://studyflow-asha.netlify.app`.

### 5. Update it later
**Deploys** tab → drag the new folder onto **"Need to update your site? Drag and drop your site output folder here"**. Installed copies update themselves the next time they're opened.

---

## Option B: Deploy from Git (auto-updates on every push)

The repo includes `studyflow/netlify.toml`, so Netlify knows how to build it.

1. Netlify → **Add new site → Import an existing project** → pick your Git provider and repo.
2. **Base directory:** `studyflow`. Netlify then reads `netlify.toml` (build command `npm ci && npm run build:netlify`, publish folder `dist-netlify`).
3. Click **Deploy**. Every push to that branch redeploys the site.

---

## Install it like an app

Open your Netlify link once, then:

| Device | Steps |
|---|---|
| **Android (Chrome)** | ⋮ menu → **Install app** (or "Add to Home screen") |
| **iPhone / iPad (Safari)** | **Share** button → **Add to Home Screen** |
| **Windows / Mac / Linux (Chrome, Edge)** | Install icon at the right end of the address bar → **Install** |
| **Inside the app** | Account menu (your initial) → **Install app** when available |

After that it opens from its own icon in its own window, and works without internet.

## Turn on real AI (optional, per person)

1. Get a key at **https://console.anthropic.com/settings/keys** (Claude API, pay-as-you-go).
2. In StudyFlow: tap your **initial** (account menu) → **Settings & API key** → paste the key → **Save**.
3. Pick a model: **Opus 5.5** (best), **Sonnet 5.5** (about half the cost) or **Haiku 5.5** (cheapest).

That turns on: syllabus and **PDF** reading, **web-researched** quizzes with sources, and the AI-written weekly review.

> The key is stored only in that browser and sent only to Anthropic. Anyone using that device can use it, so don't save it on a shared computer. The AI features need internet; everything else works offline.

## Back up your data

Everything is stored on the device you're using, so:
- **Account menu → Export backup** saves a `.json` file. Do this now and then.
- **Account menu → Import backup** restores it on any device, for example moving from your laptop to your phone.
- Clearing the browser's site data, or uninstalling the app, erases what's on that device.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Page not found" when opening `/calendar` directly | The `_redirects` file didn't upload. Drag the **folder**, and make sure `_redirects` is inside it. Some file managers hide files that start with `_` or `.`. |
| The site disappeared | It was a drop without an account. Re-upload and **claim the site** (step 3). |
| No "Install" option | Open the `https://` Netlify link (not a local file), reload once, and don't use a private/incognito window. |
| "Your Claude API key was rejected" | Re-copy the key from the Anthropic console into Settings. Check it starts with `sk-ant-`. |
| "You're offline" on a quiz | AI needs internet. Planning, ticking and the calendar still work offline. |
| An update doesn't show | Close and reopen the app (or reload the page). The new version loads in the background. |

## Which StudyFlow version is this?

| Version | Where it runs | Logins | Data | AI paid by |
|---|---|---|---|---|
| **Standalone (this guide)** | Netlify / any static host | None | On each device | Each user's own key |
| Full-stack | Render / Railway / Docker (`README.md`) | Yes | Server database | Your server key |
| Phone (Claude) | Inside claude.ai | Claude account | Your Claude account | Your Claude plan |
