# 11 - Glossary

| Item | Detail |
|---|---|
| Document | Glossary |
| Version | 1.0 draft |
| Date | 24 October 2026 |
| Status | Draft for review |
| Audience | Everyone |

**Purpose:** To explain, in plain words, the terms used in the JobFit AI documentation. Terms are listed in alphabetical order.

---

| Term | Meaning |
|---|---|
| **Access token** | A short-lived digital pass (see JWT) that the app sends to the backend to prove who you are. |
| **Activity log** | A list of actions saved by the backend, such as "Resume parsed". The Home screen shows the last five. |
| **Anon key (publishable key)** | A public Supabase key that the app may contain. It is safe because database rules (RLS) limit what it can do. |
| **Anti-invention guard** | The server check that removes anything the AI returned that cannot be found in your resume text. |
| **API** | Application Programming Interface. A set of web addresses the app uses to ask the server to do work. |
| **Application tracker** | Planned (Phase 5) screen to follow job applications from saved to offer. Not built yet. |
| **ATS** | Applicant Tracking System. Software employers use to receive and filter resumes. "ATS-friendly" means a simple layout that such software can read. Generation of ATS-friendly resumes is planned (Phase 3). |
| **Authentication** | Proving who you are, here by email and password through Supabase. |
| **Backend** | The server part of JobFit AI (FastAPI). It handles files, AI calls and secret keys. |
| **Bearer token** | The way the app sends the access token: in an `Authorization: Bearer ...` header. |
| **Bucket (storage bucket)** | A named container for files in Supabase Storage. JobFit AI uses `documents` and `avatars`. |
| **Capacitor** | A tool that wraps a web app so it can run as an Android (or iOS) app. |
| **Cascade delete** | When a user is deleted, their rows in other tables are deleted automatically. |
| **Changelog** | A list of what changed in each version. See [CHANGELOG.md](CHANGELOG.md). |
| **CORS** | A browser safety rule. The backend must list which web addresses (origins) may call it. |
| **Custom skill** | A skill you add yourself because it is not in the shared skills bank. |
| **daisyUI** | A colour-theme library used to give the app its 35 themes. |
| **DOCX** | The Word document format (`.docx`). Supported for resume import. |
| **Draft (import draft)** | The result of reading a resume, shown for review. Nothing is saved until you confirm. |
| **Duplicate detection** | Spotting that an imported item is already in your profile, so it is not saved twice. |
| **Environment variable** | A named setting (for example a key or an address) kept outside the code, in a `.env` file or server settings. |
| **FastAPI** | The Python framework used for the backend. |
| **Gaps list** | Planned. Skills a job asks for that you do not have. They are listed, never added to your resume. |
| **Groq, Google Gemini, OpenAI** | The three AI companies whose models can read a resume in the current version. |
| **Ionic** | A toolkit of mobile-style screens and buttons used to build the app. |
| **JD (job description)** | The text of a job advert. Parsing JDs is planned (Phase 3). |
| **JSON** | A simple text format for structured data, used between the app and the server. |
| **JWT** | JSON Web Token. The format of the access token. It carries your account id and an expiry time and is signed by Supabase. |
| **JWKS** | The public list of keys a server uses to check that a JWT is genuine. |
| **Master Profile** | Your single, trusted record of personal info, experience, projects, education and skills. |
| **Migration** | A numbered database change file (for example `0002_profile_avatars.sql`) run in order. |
| **Model (AI model)** | The particular AI system used to read your resume, for example "GPT-OSS 120B". |
| **OCR** | Optical Character Recognition: turning a picture of text into real text. Not built, so scanned resumes cannot be read. |
| **pgvector** | A Postgres add-on for storing meaning-based number lists. Enabled for future skill matching; unused today. |
| **Pinia** | The library the app uses to share data between screens. |
| **Prompt** | The instructions and text sent to an AI model. |
| **Prompt injection** | An attempt to trick an AI with instructions hidden in the text it reads (for example inside a resume). JobFit AI treats resume text as data only. |
| **Rate limit** | A cap on how many requests a service accepts in a short time. Free AI plans have low limits, which causes "busy" messages. |
| **RLS (Row Level Security)** | A database rule that lets each user see and change only their own rows. |
| **Service key (secret key)** | A powerful Supabase key that bypasses RLS. It exists only on the server and never in the app. |
| **Signed URL** | A temporary web address, valid for a short time (1 hour here), that lets the app show a private file such as your photo. |
| **Skills bank** | The shared list of skills everyone can search. Custom skills are added to it. |
| **Supabase** | The hosted service that provides login, the Postgres database and file storage. |
| **Tab bar** | The row of buttons at the bottom of the app: Home, Profile, Jobs, Tracker. |
| **Theme** | A set of colours for the app. There are 35, from light to dark. |
| **UAT** | User Acceptance Testing: a client or tester checks that the app does what was agreed. See [10-testing-and-quality.md](10-testing-and-quality.md). |
| **Venv (virtual environment)** | A private folder of Python packages for the backend, so they do not clash with other projects. |
| **Vite** | The tool that runs and builds the web app during development. |
| **Vue** | The JavaScript framework used for the app's screens. |
