---
name: commit-message
description: Creates commit messages for this repository. The agent must load this skill before it writes a commit message or creates a Git commit.
---

# Commit message

1. Create a commit only when the user explicitly requests it.
2. Inspect the status, staged diff, and unstaged diff.
3. If the changes do not form one clear change with one primary scope, ask the user what to include and whether to create separate commits.
4. If the intent is unclear, ask the user to explain what happened in the session.
5. Do not stage unrelated changes. Stage only the changes that the user approves.
6. Write the subject as `scope: present-tense imperative description`.
7. Check the message against the final staged diff and the user's explanation.

Use these rules:

- write all commit-message text in lowercase, including the scope, body, and footers
- always use the present tense
- use concise Simplified Technical English with American spelling
- use an application, package, subsystem, or domain as the scope
- do not use a Conventional Commits type such as `feat`, `fix`, or `chore`
- do not use an issue number as the scope
- do not put a period at the end of the subject
- add a body only when it gives necessary context
- add `Refs: SO-1234` in the footer for a related issue
- use `Fixes: SO-1234` only when the commit fully resolves that issue

Example:

```text
checkout: preserve the basket after a payment failure

Refs: SO-1234
```
