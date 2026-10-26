# 12 - Installation and Operations

| Item | Detail |
|---|---|
| Document | Installation and operations guide |
| Version | 1.0 draft |
| Date | 24 October 2026 |
| Status | Draft for review |
| Audience | Technical staff (developers, administrators) |

**Purpose:** To explain how to set up JobFit AI on a Windows PC, configure it, run it, build the Android app, and fix common problems. Commands are for Windows PowerShell. Only variable *names* are shown; never paste real keys into documents, chat or Git.

---

## 1. Prerequisites

| Tool | Version | Check with |
|---|---|---|
| Git | any recent | `git --version` |
| Node.js | 20 LTS or newer | `node -v` |
| Python | 3.12 (project notes); the Phase 1 README says 3.11 or newer | `python --version` |
| Android Studio | latest (only for Android builds) | open Android Studio |
| A Supabase project | free tier is enough | Supabase dashboard |
| At least one AI key | Groq, Google Gemini or OpenAI (only for resume import) | provider dashboard |

If PowerShell blocks the Python virtual environment script, run once:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## 2. Database setup (Supabase)

Run the migrations **in order**. Never edit a migration after it has been run; add a new numbered file instead.

1. Open the Supabase dashboard, then **SQL Editor**, **New query**.
2. Paste the full contents of `supabase/migrations/0001_init.sql` and press **Run**.
3. Create another new query, paste `supabase/migrations/0002_profile_avatars.sql` and press **Run**.

**How to check it worked:**

- **Table Editor** shows `profiles`, `experiences`, `projects`, `education`, `skills` (25 rows), `user_skills`, `job_posts`, `match_results`, `generated_docs`, `applications`, `activity_logs`.
- `profiles` has the column `avatar_path`.
- **Storage** shows two private buckets: `documents` and `avatars`.

Authentication: keep **Email** sign-in enabled. For faster testing you may turn **Confirm email** off, and turn it on again before real users arrive.

Collect from **Project Settings**: the project address, the publishable (anon) key, and the secret (service) key. The legacy JWT secret is needed only if your project still signs tokens with HS256.

## 3. Backend setup

```powershell
cd C:\Projects\jobfit-ai\backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Open `backend\.env` in an editor and fill in the values (see section 5). Do not share this file.

Run the tests, then start the server:

```powershell
.venv\Scripts\python -m pytest -q
.venv\Scripts\python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**How to check it worked:**

- Tests end with a line like `101 passed`.
- Open `http://localhost:8000/api/v1/health`. You should see `"status": "ok"`, `"supabase_configured": true` and, if an AI key is set, `"ai_configured": true`.
- Open `http://localhost:8000/docs` for the interactive API documentation.

`--host 0.0.0.0` lets other devices on your network (a phone) reach the server. Windows Firewall may ask for permission.

## 4. Frontend setup

The example environment file for the frontend is kept in `frontend-files\.env.example` (there is no `.env.example` inside `frontend`).

```powershell
cd C:\Projects\jobfit-ai\frontend
npm install
Copy-Item ..\frontend-files\.env.example .env
```

Open `frontend\.env` and fill in the three `VITE_` values (see section 5). Then:

```powershell
npm run dev
```

**How to check it worked:** the terminal prints a local address (Vite normally uses `http://localhost:5173`; read the exact address from the terminal output). Open it: you should see the login screen. Sign up, log in, and check that Home shows "Everything is working." under System status.

Other commands:

```powershell
npm run build            # type check and production build into dist
npm run test:unit -- --run
```

## 5. Configuration (variable names only)

### 5.1 Backend `backend\.env`

| Variable | What to put | Notes |
|---|---|---|
| `APP_ENV` | `development` | Reported by `/health` |
| `SUPABASE_URL` | Your project address | Same project as the frontend |
| `SUPABASE_SERVICE_KEY` | The secret (service) key | Server only. Never in the frontend |
| `SUPABASE_JWT_SECRET` | Leave empty unless the project uses legacy HS256 | Without it, HS256 tokens return 401 |
| `CORS_ORIGINS` | Comma-separated list of app origins | The example allows `http://localhost:8100`, `http://localhost:5173`, `capacitor://localhost`, `http://localhost`. Add your deployed address later |
| `ANTHROPIC_API_KEY` | Leave empty | Reserved for Phase 3; unused |
| `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY` | Your provider key(s) | Empty means the provider is hidden/"not set up" |
| `GROQ_MODELS`, `GEMINI_MODELS`, `OPENAI_MODELS` | Comma-separated model names | See section 6 |

### 5.2 Frontend `frontend\.env`

| Variable | What to put | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Your project address | |
| `VITE_SUPABASE_ANON_KEY` | The publishable (anon) key only | Never the service key |
| `VITE_API_URL` | Backend address ending in `/api/v1` | For example `http://localhost:8000/api/v1` |

**Important:** `VITE_` values are fixed into the app when it is built. After changing them, restart `npm run dev` or rebuild for Android.

## 6. Configuring AI keys and models

1. Create a key in the provider's dashboard (Groq, Google AI Studio for Gemini, or OpenAI). Free tiers have limits.
2. Put the key in `backend\.env` as `GROQ_API_KEY`, `GEMINI_API_KEY` or `OPENAI_API_KEY`. Do not wrap it in extra quotes or spaces.
3. **Restart the backend.** Settings are read once at start-up.
4. Check `http://localhost:8000/api/v1/health` shows `"ai_configured": true`.
5. In the app, open Import from resume: the model list shows your provider's models as available.

Model names change over time. If a provider renames or removes a model, users see "could not find this model". Edit the matching `*_MODELS` list in `backend\.env` (comma-separated, exact names from the provider), then restart. Only names in these lists can ever be used. Friendly labels exist for some names (for example GPT-OSS 120B); others show their raw name.

The default order is Groq, then Gemini, then OpenAI: the first available model in that order is preselected.

## 7. Android (Capacitor)

Prepare `frontend\.env` for the device:

| Where the app runs | `VITE_API_URL` |
|---|---|
| Android emulator | `http://10.0.2.2:8000/api/v1` (the emulator's name for your PC) |
| Real phone on the same Wi-Fi | `http://<YOUR-PC-LAN-IP>:8000/api/v1` (find the address with `ipconfig`) |

Then, from the frontend folder:

```powershell
cd C:\Projects\jobfit-ai\frontend
npm run build
npx cap sync android
npx cap open android
```

In Android Studio, choose an emulator or a connected phone and press **Run**.

**How to check it worked:** the login screen appears on the device, and after login Home shows "Everything is working."

Notes:

- Rebuild (`npm run build`, then `npx cap sync android`) after **every** change to `frontend\.env` or to the code.
- The Android project allows plain `http://` (`usesCleartextTraffic`) for development. Remove this for a release that uses HTTPS.
- `capacitor.config.ts` still has the starter `appId` (`io.ionic.starter`) and `appName` (`frontend`). Change them before any release.
- The manifest declares only the internet permission. If "Take a photo" does not work on a device, a camera permission may need to be added (**to be confirmed**).
- Make sure `CORS_ORIGINS` includes `capacitor://localhost` and `http://localhost`.
- iOS is not set up.

## 8. Operations tips

| Topic | Tip |
|---|---|
| Restart after changes | Restart uvicorn after any `backend\.env` change (the `--reload` option reloads on code changes, not reliably on settings). Restart `npm run dev` after any `frontend\.env` change |
| Health check | `GET /api/v1/health` is public and shows configuration flags only |
| Logs | The server prints short messages to its console, such as the provider name and status code of a failed AI call. They never contain resume text or keys |
| Activity | The `activity_logs` table shows `auth.me_checked`, `skill.created` and `resume.parsed` rows |
| Secrets | Before every commit run `git status` and make sure no `.env` file is listed. `.env` files are ignored by Git; `.env.example` files are not |
| Migrations | Add a new numbered file for each database change; never edit one that has been run |
| Quota | Free AI tiers run out. Add keys for a second provider so users can switch |
| Backups | Not defined in the repository: **to be defined** |

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Home shows "The backend is not reachable. Make sure it is running, then retry." or the browser console shows "Failed to fetch" | Backend not running, wrong `VITE_API_URL`, or your app's address is missing from `CORS_ORIGINS` | Start uvicorn; check `VITE_API_URL`; add the origin to `CORS_ORIGINS`; restart the backend |
| API calls go to the wrong path (404) | `VITE_API_URL` does not end with `/api/v1` | Set it to `.../api/v1` and restart the frontend |
| 401 "Invalid token" | `SUPABASE_URL` differs from the app's project, or the project uses legacy HS256 and `SUPABASE_JWT_SECRET` is empty | Use the same project in both `.env` files; set the JWT secret if needed; restart |
| Changes to `.env` have no effect | The app or server reads settings only at start/build | Restart the backend; restart `npm run dev`; rebuild for Android |
| Profile status "We could not find your profile yet." | Migration 0001 not run, or the account was created before it | Run `0001_init.sql`; sign up with a new email |
| "Photo upload is not set up yet - run the database update." | Migration 0002 not run | Run `0002_profile_avatars.sql`, then tap the photo again |
| Import says "No AI provider is set up on the server yet." | No AI key, or the backend was not restarted after adding it | Add a key, restart, check `/health` |
| Import says "(Provider) key was rejected" | Wrong, expired or restricted key | Create a new key and update `.env` |
| Import says "could not find this model" | The provider renamed the model | Update the `*_MODELS` list; restart |
| Emulator cannot reach the backend | `localhost` means the emulator itself | Use `http://10.0.2.2:8000/api/v1`; run uvicorn with `--host 0.0.0.0`; rebuild and sync |
| Real phone cannot reach the backend | Wrong address, different network, or firewall | Use the PC's LAN address; same Wi-Fi; allow port 8000 in the firewall |
| Login says "Email not confirmed" | Supabase requires email confirmation | Click the email link, or turn **Confirm email** off during development |
| `Activate.ps1` is blocked | PowerShell policy | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `pip install` fails | Wrong Python or venv not active | Activate `.venv`; check `python --version` |
| Frontend test run shows one failure in `example.spec.ts` | Known stale starter test | Rewrite or remove it; see [10-testing-and-quality.md](10-testing-and-quality.md) |

Related: [05-architecture.md](05-architecture.md), [08-api-reference.md](08-api-reference.md), [07-security-and-privacy.md](07-security-and-privacy.md).
