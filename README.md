# JobFit AI — Phase 1: Setup and Installation

AI-powered job hunting app: paste a job description and get a tailored resume and cover letter, with skill matching and application logs.

**Stack:** Ionic + Vue 3 + Capacitor (Android/iOS/web) · Python FastAPI · Supabase (Postgres, Auth, Storage)

**Goal of Phase 1:** by the end, you can sign up in the app, a profile row is created automatically in Supabase, and the app successfully calls a protected FastAPI endpoint. Everything after this builds on that foundation.

---

## Project structure

```
jobfit-ai/
├── README.md                     ← you are here
├── supabase/
│   └── migrations/0001_init.sql  ← full database schema, RLS, storage, seed skills
├── backend/                      ← FastAPI (Python)
│   ├── app/
│   │   ├── main.py
│   │   ├── api/routes.py         ← /health and /me
│   │   ├── core/config.py        ← settings from .env
│   │   ├── core/auth.py          ← verifies Supabase login tokens
│   │   └── db/supabase_client.py ← server client + activity logging
│   ├── tests/test_api.py
│   ├── requirements.txt
│   └── .env.example
└── frontend-files/               ← files to copy into your Ionic project
    ├── .env.example
    └── src/ (main.ts, router, stores, services, views)
```

---

## Step 0 — Install the tools (one time)

| Tool | Version | Check with |
|---|---|---|
| Node.js | 20 LTS or newer | `node -v` |
| Python | 3.11 or newer | `python --version` |
| Git | any | `git --version` |
| Ionic CLI | latest | `ionic -v` |
| VS Code | latest | — |
| Android Studio | latest (for Android builds) | — |
| Xcode | macOS only (for iOS builds) | — |

Install the Ionic CLI:

```bash
npm install -g @ionic/cli
```

Recommended VS Code extensions: **Vue - Official**, **Ionic**, **Python**, **Pylance**.

---

## Step 1 — Create the Supabase project

1. Go to https://supabase.com → **New project**.
   - Name: `jobfit-ai`
   - Region: choose the closest one (e.g., **Southeast Asia (Singapore)**).
   - Save the database password somewhere safe.
2. Open **SQL Editor → New query**, paste the full contents of `supabase/migrations/0001_init.sql`, and click **Run**. It should finish with "Success. No rows returned."
3. Check that it worked:
   - **Table Editor**: you should see `profiles`, `experiences`, `projects`, `education`, `skills` (25 rows), `user_skills`, `job_posts`, `match_results`, `generated_docs`, `applications`, `activity_logs`.
   - **Storage**: a private bucket called `documents`.
4. **Authentication → Sign In / Providers → Email**: keep it enabled. For faster testing during development, you may turn off **Confirm email**, then turn it back on before release.
5. Collect your keys from **Project Settings → API Keys** (and **Data API** for the URL):

| Value | Goes into | Notes |
|---|---|---|
| Project URL | backend + frontend `.env` | `https://xxxx.supabase.co` |
| Publishable key (or legacy `anon` key) | frontend `.env` only | Safe for the app |
| Secret key (or legacy `service_role` key) | backend `.env` only | **Never** put this in the app or on GitHub |
| JWT secret (legacy only) | backend `.env` | Only if your project still uses legacy HS256 JWT signing. New projects use signing keys and this can stay empty. |

---

## Step 2 — Set up the FastAPI backend

```bash
cd jobfit-ai/backend

# Create and activate a virtual environment
python -m venv .venv
# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# macOS / Linux:
source .venv/bin/activate

pip install -r requirements.txt

# Create your .env
copy .env.example .env      # Windows
cp .env.example .env        # macOS / Linux
```

Open `backend/.env` and fill in `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (plus `SUPABASE_JWT_SECRET` only if your project uses legacy JWT).

Run the tests, then start the server:

```bash
python -m pytest -q
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Check it:

- http://localhost:8000/api/v1/health → `{"status": "ok", "supabase_configured": true, ...}`
- http://localhost:8000/docs → interactive API documentation (Swagger)

> If PowerShell blocks `Activate.ps1`, run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

---

## Step 3 — Create the Ionic + Vue app

From the `jobfit-ai` folder:

```bash
ionic start frontend blank --type=vue --capacitor
cd frontend
npm install @supabase/supabase-js pinia
```

When asked to create a free Ionic account, you can skip it.

Now copy the prepared files from `frontend-files/` into `frontend/`, replacing the existing ones:

| Copy from `frontend-files/` | To `frontend/` | Action |
|---|---|---|
| `.env.example` | `.env` | new (rename) |
| `src/main.ts` | `src/main.ts` | replace |
| `src/router/index.ts` | `src/router/index.ts` | replace |
| `src/views/HomePage.vue` | `src/views/HomePage.vue` | replace |
| `src/views/LoginPage.vue` | `src/views/LoginPage.vue` | new |
| `src/stores/auth.ts` | `src/stores/auth.ts` | new |
| `src/services/supabase.ts` | `src/services/supabase.ts` | new |
| `src/services/api.ts` | `src/services/api.ts` | new |

Quick way (macOS/Linux/Git Bash), from the `jobfit-ai` folder:

```bash
cp -r frontend-files/src/. frontend/src/
cp frontend-files/.env.example frontend/.env
```

Open `frontend/.env` and fill in `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable key), and `VITE_API_URL`.

Run it in the browser:

```bash
ionic serve
```

It opens at http://localhost:8100.

---

## Step 4 — Test the full connection

With the backend running (Step 2) and `ionic serve` running (Step 3):

1. Open http://localhost:8100 → you are redirected to **Login**.
2. Choose **Sign up**, enter your name, email, and password.
3. Confirm your email (unless you turned confirmation off), then **Log in**.
4. The Home page shows three checks. All should be **OK**:
   - **Supabase login** — Auth works.
   - **Profile row in database** — the signup trigger and Row Level Security work.
   - **FastAPI backend** — the backend accepts the app's login token.
5. In Supabase **Table Editor → activity_logs**, you should see an `auth.me_checked` row. This is the start of your logs and data layer.

If all three are OK, **Phase 1 is complete.**

---

## Step 5 — Run on Android (and iOS)

```bash
cd frontend
ionic build
npx cap add android
npx cap sync android
npx cap open android      # opens Android Studio → press Run ▶
```

Important: inside the Android emulator, `localhost` means the emulator itself. Update `frontend/.env`:

- Android emulator: `VITE_API_URL=http://10.0.2.2:8000/api/v1`
- Real phone on the same Wi-Fi: `VITE_API_URL=http://YOUR-PC-LAN-IP:8000/api/v1` (find it with `ipconfig` on Windows)

Then rebuild: `ionic build && npx cap sync android`.

Android blocks plain `http://` by default. For local development only, add this inside the `<application>` tag of `android/app/src/main/AndroidManifest.xml`:

```xml
android:usesCleartextTraffic="true"
```

Remove it when the backend is deployed with HTTPS.

**iOS** (macOS with Xcode only): `npx cap add ios && npx cap sync ios && npx cap open ios`.

---

## Step 6 — Git and GitHub

The root `.gitignore` in this project already excludes `.env`, `.venv`, `node_modules`, and build folders. Then:

```bash
cd jobfit-ai
git init
git add .
git commit -m "Phase 1: project setup, Supabase schema, FastAPI and Ionic skeleton"
git branch -M main
git remote add origin https://github.com/<your-username>/jobfit-ai.git
git push -u origin main
```

Before pushing, run `git status` and confirm **no `.env` file** is listed.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| FastAPI check shows **Failed: TypeError / Failed to fetch** | Backend not running, wrong `VITE_API_URL`, or the app's origin is missing from `CORS_ORIGINS` in `backend/.env`. |
| **API 401: Invalid token** | `SUPABASE_URL` in backend `.env` doesn't match the app's project, or your project uses legacy JWT and `SUPABASE_JWT_SECRET` is missing. |
| **Profile row** stays "Checking…" | The SQL migration didn't run fully. Re-run `0001_init.sql` (it is safe to run again). For users created before the migration, sign up with a new email. |
| Login says **Email not confirmed** | Confirm via the email link, or turn off **Confirm email** during development. |
| Android app can't reach backend | Use `10.0.2.2` (emulator) or your LAN IP (phone), add `usesCleartextTraffic`, and start uvicorn with `--host 0.0.0.0`. |
| `ionic: command not found` | Re-run `npm install -g @ionic/cli` and reopen the terminal. |

---

## Phase 1 checklist

- [ ] Tools installed (Node, Python, Ionic CLI, Android Studio)
- [ ] Supabase project created and `0001_init.sql` executed
- [ ] Backend `.env` filled, tests pass, `/health` returns OK
- [ ] Ionic app created, files copied, frontend `.env` filled
- [ ] Sign up and login work; all three Home checks show OK
- [ ] App runs on Android emulator or phone
- [ ] Pushed to GitHub without any `.env` files

**Next: Phase 2 — Master Profile** (profile, experience, projects, education, skills screens, and "import my existing resume").
