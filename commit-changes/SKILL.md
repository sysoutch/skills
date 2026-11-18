---
name: commit
description: Review repository changes and create a professional Git commit with a detailed message.
---

# Commit

## Purpose

Use this skill whenever the user asks to:

- commit
- commit changes
- create a commit
- save changes
- git commit

Your goal is to create a clean, professional Git commit that accurately documents the work performed.

Do **not** push to the remote.

## Workflow

1. Review all staged and unstaged changes.
2. Read the complete diff.
3. Understand every change before committing.
4. Ensure unrelated changes are not combined.
5. Check for:
   - debug code
   - commented-out code
   - merge conflict markers
   - secrets or credentials
   - temporary files
   - accidental formatting-only changes
6. When practical, ensure the project builds and tests pass.

## Commit Message

The subject should:

- Use the imperative mood.
- Clearly describe the primary change.
- Prefer under 72 characters.
- Never be generic.

Good examples:

- Refactor authentication service
- Extract shared validation logic
- Improve configuration loading
- Reduce duplication in API handlers

Bad examples:

- update
- fixes
- misc
- cleanup
- final
- work
- stuff

## Commit Body

Always include a detailed body explaining:

### What changed

Describe the implementation.

### Why

Explain the motivation.

### How

Describe the implementation approach.

### Impact

Mention any behavioral or architectural effects.

## Report

After committing, report:

- Branch
- Commit hash
- Commit title

Do not push the commit.