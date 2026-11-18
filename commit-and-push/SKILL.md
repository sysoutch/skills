---
name: commit-and-push
description: Create a professional Git commit using the commit-changes skill, then push it to the current branch.
---

# Commit and Push

## Purpose

Use this skill whenever the user asks to:

- commit and push
- push changes
- publish changes

This skill extends the `commit-changes` skill (`../commit-changes/SKILL.md`).

Follow the `commit-changes` skill (`../commit-changes/SKILL.md`) first for reviewing changes, validating quality, creating the commit, and reporting the commit details.

## Additional Steps

### Push

After the commit has completed successfully:

1. Verify the current branch and its tracked remote branch.
2. Push the commit to the current tracked remote branch.
3. If the push fails, report the error clearly instead of hiding or bypassing it.

Do not force-push unless the user explicitly requests it.

## Final Report

In addition to the report required by the `commit-changes` skill (`../commit-changes/SKILL.md`), report:

- Whether the changes were pushed successfully.
- The remote branch that received the commit.
