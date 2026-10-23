# Security rules (always apply)

- Never read, print, copy, or commit any `.env` file. Use `.env.example` to learn variable names.
- Never put the Supabase secret/service key, the Anthropic API key, or any password in
  frontend code, docs, commit messages, logs, or test files.
- Resumes are personal data: keep the Storage bucket private and use signed URLs.
- Validate and limit user input on the backend (length limits on pasted job descriptions).
- Before any commit, check that no secrets or `.env` files are staged.
