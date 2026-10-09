# StudyFlow

**Turn your syllabus into a study plan that adapts, quizzes you, and tells you the truth about your progress.**

🔗 **Live demo:** _add your Render URL here_ · 📲 Installable on phone & desktop · 🔐 Accounts with private data

Paste your syllabus (or upload the PDF), set your exam date and daily hours, and StudyFlow builds a day-by-day plan with spaced revision. When you miss a day, it re-plans automatically. When you finish a topic, Claude writes a 10-question quiz checked against the web. Every week, it gives you a blunt review built from your real numbers.

![Today view](docs/screenshots/05-today.png)

---

## Features

| | |
|---|---|
| **Syllabus → structure** | Paste text or upload a PDF. Claude splits it into subjects → units → topics with difficulty and time estimates. Edit anything before you commit. Scanned PDFs are read directly by Claude. |
| **Adaptive scheduler** | Day-by-day plan to the exam. Weighted by topic difficulty and how weak you are in each subject. Spaced-repetition revisions at +1, +3 and +7 days, a buffer day every week, and final-revision days before the exam. |
| **Auto re-plan** | Miss a day and the next time you open the app, missed sessions are marked and everything left is rescheduled from today. Finish a topic early and the rest of the plan rebalances. |
| **Topic quizzes** | 10 MCQs per topic (4 easy, 4 medium, 2 hard), researched with Claude's web search tool, with explanations and sources after you submit. |
| **Performance tracker** | Syllabus completion, streak, quiz accuracy per subject and difficulty, planned-vs-actual study time, and an auto-generated weak-topic list. |
| **Blunt weekly review** | *"You skipped 3 of 5 DBMS sessions and scored 40% on Joins. Fix this first."* Specific findings from your real stats plus exactly 3 actions for the week. |
| **Accounts** | Sign up / log in. Each student's plans, quizzes and reviews are private. Delete your account and all data at any time. |
| **Install as an app** | It's a PWA: "Install" in Chrome/Edge, "Add to Home Screen" on iPhone. Opens full-screen with its own icon. |
| **Fair-use AI limit** | Each user gets a daily number of AI requests (default 15), so a public deployment can't run up your API bill. |
| **Design** | Dark/light mode, mobile-first layout, animated progress rings, self-drawing checkmarks, smooth page transitions. Respects `prefers-reduced-motion`. |

## Screenshots

| | |
|---|---|
| ![Sign up](docs/screenshots/00-signup.png) | ![Account menu](docs/screenshots/16-account-menu.png) |
| *Sign up / log in* | *Account menu, AI usage, install* |
| ![Syllabus input](docs/screenshots/01-syllabus.png) | ![Topic review](docs/screenshots/02-topics.png) |
| *Paste or upload a syllabus* | *Review and edit the parsed structure* |
| ![Quiz](docs/screenshots/07-quiz.png) | ![Quiz results](docs/screenshots/08-quiz-results.png) |
| *Topic quiz* | *Results with explanations* |
| ![Calendar](docs/screenshots/09-calendar.png) | ![Dashboard](docs/screenshots/10-dashboard.png) |
| *Calendar* | *Progress dashboard* |
| ![Review (dark)](docs/screenshots/12-review-dark.png) | ![Dashboard (dark)](docs/screenshots/13-dashboard-dark.png) |
| *Weekly review (dark mode)* | *Dashboard (dark mode)* |

<p>
  <img src="docs/screenshots/14-mobile-today.png" width="240" alt="Mobile today view" />
  <img src="docs/screenshots/15-mobile-dashboard.png" width="240" alt="Mobile dashboard" />
  <img src="docs/screenshots/18-mobile-signup.png" width="240" alt="Mobile sign up" />
</p>

> 📸 **Placeholder:** add a GIF of the check-off animation here → `docs/screenshots/demo.gif`

---

## Quick start

**Requirements:** Python 3.10+ and Node.js 18+.

```bash
cd studyflow
npm run setup     # one time: creates the Python venv, installs everything, creates .env
npm run dev       # starts backend + frontend together
```

Open **http://localhost:5173**, create an account (it's stored in your local database), and paste a syllabus. The API docs are at http://localhost:8000/docs.

### Add your Claude API key (optional)

The app runs fully **without a key** in *Demo AI* mode: a heuristic syllabus parser, template quizzes and a rule-based review. For the real AI features:

1. Get a key at [console.anthropic.com](https://console.anthropic.com/).
2. Put it in `studyflow/.env`:
   ```env
   ANTHROPIC_API_KEY=sk-ant-...
   ```
3. Restart `npm run dev`. The orange **Demo AI** badge disappears.

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | *(empty)* | Your key. Never commit it. `.env` is git-ignored. |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Use `claude-sonnet-5-5` or `claude-haiku-5-5` to cut cost. |
| `DAILY_AI_LIMIT` | `15` | AI requests per user per day (`0` = unlimited). |
| `AI_MOCK` | `false` | Force demo mode even when a key is set. |
| `AI_FALLBACKS` | `true` | Server-side refusal fallback (Claude API only). |
| `DATABASE_URL` | `backend/studyflow.db` | SQLite locally; a `postgresql://` URL in production. |
| `SECRET_KEY` | auto (local) | Signs login sessions. **Set a long random value in production.** |
| `COOKIE_SECURE` | `false` | `true` in production (HTTPS-only session cookie). |

### Other commands

```bash
npm test          # backend test suite (54 tests, no API key or network needed)
npm run build     # production build of the frontend
npm start         # serve the built app + API on one port: http://localhost:8000
```

---

## Architecture

```
┌──────────────────────── Browser ────────────────────────┐
│ React 19 + Vite + Tailwind v4 + Framer Motion + Recharts│
│ TanStack Query for server state · React Router          │
└──────────────────────────┬──────────────────────────────┘
                           │ JSON /api  (Vite proxy in dev)
┌──────────────────────────▼──────────────────────────────┐
│ FastAPI                                                 │
│  routers/   auth · syllabus · plan · quiz · stats       │
│  services/                                              │
│   ├ scheduler.py  pure, deterministic planning algorithm│
│   ├ planning.py   DB side: create plan, re-plan, ticks  │
│   ├ stats.py      every dashboard / review number       │
│   └ ai/  client · schemas · syllabus · quiz · review    │
│          · mock (offline demo)                          │
│  SQLAlchemy 2 → SQLite (local) · PostgreSQL (production)│
└──────────────────────────┬──────────────────────────────┘
                           │ Anthropic Python SDK
                       Claude API (key from .env)
```

### Design decisions

- **The scheduler is not AI.** Planning is a deterministic algorithm in `backend/app/services/scheduler.py`. It's free, instant, explainable and unit-tested. Claude handles what needs language understanding: parsing, quiz writing and the review.
- **AI output is never trusted blindly.** Every response is validated against a Pydantic contract (`services/ai/schemas.py`): exactly 10 questions with a 4/4/2 difficulty mix, 4 distinct options, a valid answer index, and exactly 3 review actions. If validation fails, the error is sent back to Claude for **one repair attempt** with structured outputs enforced. If that also fails, the user gets a clean error message rather than corrupted data.
- **Structured outputs + web search.** Syllabus parsing and reviews use JSON-schema structured outputs. Quizzes use the web search tool, so their JSON is validated afterwards.
- **Demo mode.** Without a key, the AI services fall back to offline implementations, so the app always runs and the tests never spend money.

### Scheduling algorithm

1. **Calendar:** today → the day before the exam. The last ~10% of days are final revision. Every 7th day is a buffer.
2. **Weighting:** `minutes = estimate × difficulty factor (0.8–1.4) × strength factor (weak 1.4 / okay 1.0 / strong 0.75)`.
3. **Packing:** each day fills revisions due first, then new topics, interleaved round-robin across subjects with weak subjects leading. Long topics split across days (no chunks under 15 min).
4. **Spaced repetition:** when a topic's last chunk lands on day D, revisions are queued for D+1, D+3 and D+7.
5. **Overload:** if the work doesn't fit, sessions shrink proportionally and the UI shows the daily time you'd actually need.
6. **Re-plan:** past pending sessions → `missed`. Future pending sessions are rebuilt from today using progress so far, and minutes already studied today count against today's capacity. Re-planning is idempotent.

### Database schema

```
users          id, email (unique), name, password_hash, created_at
ai_usage       id, user_id→, day, count                      (unique per user+day)
plans          id, user_id→, exam_date, daily_minutes, is_active, version, required_daily_minutes
subjects       id, plan_id→, name, strength(weak|neutral|strong), color, position
units          id, subject_id→, name, position
topics         id, unit_id→, name, difficulty(1-5), est_minutes, status(pending|done), completed_at
schedule_items id, plan_id→, date, topic_id→, kind(learn|revise|buffer|final_revision),
               rev_interval, minutes, status(pending|done|missed), plan_version, completed_at
quizzes        id, topic_id→, score, total, sources(JSON), created_at, submitted_at
questions      id, quiz_id→, position, difficulty, stem, options(JSON), correct_index,
               explanation, chosen_index
reviews        id, plan_id→, week_start, stats(JSON), verdict, findings(JSON), actions(JSON)
```

Streak, completion %, planned-vs-actual and weak topics are all derived from `schedule_items` and `questions`, so there are no duplicated counters to drift out of sync.

### Project structure

```
studyflow/
├── Dockerfile              production image (frontend build + API on one port)
├── package.json            npm run setup | dev | test | build | start
├── .env.example
├── scripts/                cross-platform runners (Windows/macOS/Linux)
├── backend/
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py  config.py  db.py  models.py  schemas.py  serializers.py  deps.py
│   │   ├── routers/        auth.py  syllabus.py  plan.py  quiz.py  stats.py
│   │   └── services/       scheduler.py  planning.py  stats.py  pdf.py  auth.py  usage.py
│   │       └── ai/         client.py  schemas.py  syllabus.py  quiz.py  review.py  mock.py
│   └── tests/              scheduler · API flows · AI validation · live-path (stub server)
├── frontend/
│   └── src/
│       ├── components/     Layout  AccountMenu  ProgressRing  CheckButton  ui
│       ├── pages/          Auth  Setup  Today  Calendar  Quiz  Dashboard  Review
│       └── lib/            api.ts  format.ts  install.ts  session.ts
└── docs/screenshots/
```

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/signup` · `/login` · `/logout` | Accounts (sets / clears the session cookie) |
| `GET` / `DELETE` | `/api/auth/me` | Current user + AI usage / delete account and all data |
| `POST` | `/api/syllabus/parse` | Text → subjects/units/topics (preview, not saved) |
| `POST` | `/api/syllabus/parse-pdf` | PDF upload → same |
| `POST` | `/api/plans` | Save the structure + exam date + hours → builds the schedule |
| `GET` | `/api/plans/active` | Current plan |
| `POST` | `/api/plans/active/replan` | Rebuild from today |
| `GET` | `/api/schedule/today` | Today + tomorrow (auto re-plans missed days first) |
| `GET` | `/api/schedule?from=&to=` | Calendar range |
| `PATCH` | `/api/schedule/{id}` | Mark a session done / undone |
| `POST` | `/api/topics/{id}/complete` | Finish a topic early → re-plan |
| `POST` | `/api/quizzes` | Generate a quiz for a topic (answers hidden) |
| `POST` | `/api/quizzes/{id}/submit` | Grade it → score, explanations, sources |
| `GET` | `/api/stats` | Everything on the dashboard |
| `POST` / `GET` | `/api/reviews` | Generate / list weekly reviews |

Interactive docs: http://localhost:8000/docs

## Testing

```bash
npm test
```

- `test_auth.py`: sign up / log in / log out, throttling, forged cookies, **data isolation between users**, account deletion, the daily AI limit.
- `test_scheduler.py`: capacity limits, interleaving, revision intervals, buffer and final days, overload handling.
- `test_api.py`: the full user flow including a simulated missed day, re-plan idempotency, quiz flow and review.
- `test_ai_validation.py`: the AI output contract rejects bad quizzes and reviews. Also covers the demo parser.
- `test_ai_live_path.py`: runs the **real Anthropic SDK** against a local stub server to check the request shapes (structured output, web search tool, refusal handling, the `pause_turn` resume, validate → retry).

## Host it on Netlify (static, works offline)

Netlify can't run the Python server, so StudyFlow has a **standalone build** that runs entirely in the browser: data on each device, AI with each user's own key, installable and offline-capable. `npm run build:netlify` → drag `frontend/dist-netlify/` onto [app.netlify.com/drop](https://app.netlify.com/drop). **Full step-by-step guide: [NETLIFY.md](NETLIFY.md).**

## Deploy it (free) and make it installable

The repo includes a **Dockerfile** and a **Render Blueprint** (`render.yaml` at the repo root). The Blueprint creates the web app and a Postgres database together.

### 1. Deploy on Render (~10 minutes)

1. Push this repo to GitHub.
2. Sign up at [render.com](https://render.com) with your GitHub account.
3. **New → Blueprint** → select this repository (and the branch you want to deploy).
4. Render reads `render.yaml` and shows a **studyflow** web service + **studyflow-db** database. It asks for one value:
   - `ANTHROPIC_API_KEY`: your key from [console.anthropic.com](https://console.anthropic.com/). Leave it empty to launch in demo mode.
5. Click **Apply**. The first build takes ~5 minutes. Your app is live at `https://studyflow-xxxx.onrender.com`.

`SECRET_KEY` is generated for you, `COOKIE_SECURE` is on, and the database URL is wired in automatically.

> **Free-tier notes:** the free web service sleeps after 15 min idle, so the first visit takes ~30-50 s to wake. Render's free Postgres expires after 30 days. For a database that stays up, create a free one at [neon.tech](https://neon.tech) and paste its connection string into the service's `DATABASE_URL` setting.

### 2. Install it like an app

Open your live URL:

| Device | How |
|---|---|
| **Chrome / Edge (Windows, Mac, Linux, Android)** | Click the install icon in the address bar, or the account menu → **Install app** |
| **iPhone / iPad (Safari)** | Share button → **Add to Home Screen** (the account menu shows this hint) |
| **Android (Chrome)** | ⋮ menu → **Install app** |

The app opens in its own window with the StudyFlow icon. The app shell is cached by a service worker, so it opens instantly. Your data always comes live from the server.

### Other hosts

The Docker image runs anywhere: Railway, Fly.io, Google Cloud Run, a VPS.

```bash
docker build -t studyflow .
docker run -p 8000:8000 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/studyflow \
  -e SECRET_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(48))") \
  -e COOKIE_SECURE=true \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  studyflow
```

The container reads `$PORT` when the host provides it, runs as a non-root user, and creates its tables on first start.

## Security

- Passwords are hashed with **scrypt** (salted, memory-hard). They are never stored or logged in plain text.
- Sessions are signed JWTs in an **httpOnly, SameSite=Lax, Secure** cookie: JavaScript can't read them, and other sites can't use them.
- Every query is scoped to the logged-in user. A test checks that one user can't read or change another's sessions, topics or quizzes.
- Login is throttled after repeated failures. Error messages don't reveal which emails are registered.
- The daily AI limit uses an atomic database update, so parallel requests can't bypass it.
- The API key lives only in server environment variables and is never sent to the browser.

## Roadmap

- [ ] Password reset by email
- [ ] Export plan to Google Calendar (.ics)
- [ ] Pomodoro timer inside a session
- [ ] Re-weight topics automatically from quiz accuracy

## License

MIT
