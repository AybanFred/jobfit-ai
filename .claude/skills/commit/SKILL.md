---
name: commit
description: Safely commit the current changes with clean Conventional Commit messages, using the git-committer subagent. Never pushes.
argument-hint: "[optional note about the changes]"
disable-model-invocation: true
---

Use the `git-committer` subagent to commit the current changes.
Extra context from the developer (may be empty): $ARGUMENTS

Requirements for the subagent:
- Run the safety check first (no `.env`, no secrets, tests not failing).
- Group changes into logical commits with Conventional Commit messages.
- Commit locally only. Do not push.

When it finishes, show the developer the list of commits and tell them they can run
`git push` in the terminal when they are ready (or ask you to push).
