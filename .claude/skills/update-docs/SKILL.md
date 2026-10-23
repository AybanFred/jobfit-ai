---
name: update-docs
description: Update the README, changelog, API docs and phase notes to match recent changes, using the docs-writer subagent.
argument-hint: "[optional: what to document]"
disable-model-invocation: true
---

Use the `docs-writer` subagent to update the project documentation.
Focus (may be empty, meaning "everything that changed recently"): $ARGUMENTS

The subagent should look at `git diff`, `git log -10 --oneline`, and the changed code,
then update only what is affected:
- `docs/CHANGELOG.md`
- `docs/API.md` (if endpoints changed)
- `README.md` (if setup, features, or stack changed)
- `docs/phases/phase-N.md` for the current phase
- The roadmap checklist in `CLAUDE.md` if a phase was completed

Report which files changed with a one-line summary each.
