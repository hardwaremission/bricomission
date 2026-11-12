---
name: github-flow
description: "Orchestrate multi-feature GitHub delivery on top of feature-flow using git worktrees, the project's GitHub MCP server (issues/PRs) and independent headless Claude Code sessions. Use when the user asks to plan, execute, or publish feature ids in a GitHub repository, to run features in parallel isolated worktrees with independent sessions, to reuse or create issues, branches, worktrees, or PRs for features, or to publish accepted features as PRs. Modes: plan (planificar, read-only), execute (ejecutar), publish (publicar). Never merges."
---

# GitHub Flow

Coordinate one or more `feature_list.json` features across a GitHub repository. This skill owns repository topology: issues, branches, worktrees, sessions, pushes, and PRs. It delegates each feature's planner/implementer/validator loop to `../feature-flow/SKILL.md` inside an isolated worktree session and never implements product code itself.

## Tooling (project adaptation)

This repository forbids the `gh` CLI and any global git credentials (see `CLAUDE.md`). Use only:

- **GitHub remote state**: the `github` MCP server declared in `.mcp.json` (`mcp__github__*` tools). Load tool schemas with ToolSearch (`select:mcp__github__<name>`) before calling them. Call `get_me` first.
- **Git**: local `git` in this checkout. `git fetch` / `git push` authenticate only through the repository-local credential helper backed by the `BRICOMISSION_GITHUB_PAT` environment variable. Run network git commands with `GIT_TERMINAL_PROMPT=0` so a missing token fails instead of prompting.
- **Sessions**: independent headless Claude Code processes (`claude -p`), one per worktree, started from the worktree directory.

MCP tool map:

| Need | MCP tool |
| --- | --- |
| Identity / permissions | `get_me`; `search_repositories` with `query: "repo:<owner>/<repo>"`, `minimal_output: false` (read `permissions.push`) |
| Issue lookup | `search_issues` with `query: "repo:<owner>/<repo> is:issue in:title \"[<feature-id>]\""` |
| Issue create / update | `issue_write` (`method: "create"` / `"update"`) |
| Issue comment | `add_issue_comment` |
| PR lookup | `list_pull_requests` with `head: "<owner>:feature/<feature-id>"`, `base: <base_branch>`, `state: "all"` |
| PR create | `create_pull_request` (`head: "feature/<feature-id>"`, `base: <base_branch>`) |
| PR update | `update_pull_request` |
| PR template | `get_file_contents` for `.github/pull_request_template.md` or `.github/PULL_REQUEST_TEMPLATE/` before creating a PR |

Never call `merge_pull_request`, `delete_file`, `delete_repository`, `push_files`, or `create_or_update_file`: commits travel only through local git.

## Inputs

All four inputs are required. If any is missing, ask before doing anything.

1. `feature_ids`: one or more feature ids from `feature_list.json`.
2. `repository`: GitHub slug (`owner/repo`) or a local checkout path. Resolve the slug from `git remote get-url origin` and confirm it.
3. `base_branch`: branch that all work is based on and that PRs target.
4. `mode`: `plan` | `execute` | `publish` (aliases: planificar | ejecutar | publicar).

## Hard Rules

- Plan mode is read-only. It must not mutate git, GitHub, or files: no fetch, push, commit, checkout, stash, or worktree add; no MCP write tool (`issue_write`, `add_issue_comment`, `create_pull_request`, `update_pull_request`, `create_branch`); no file writes.
- Without acceptance there is no publish. `publish` requires each feature's status to be `accepted` in `feature_list.json` (independent validator `accept`). `passing` is not accepted.
- Without explicit push permission there is no push. Push permission is granted per run by the user; the default is denied. `execute` keeps commits local; `publish` pushes and opens PRs only with that permission.
- Merge is always out of scope. Never merge a PR and never enable auto-merge.
- If a request repeats, reuse the existing issue, worktree, and PR. Never duplicate them. Never delete or rewrite existing work: no worktree removal, branch deletion, force push, or issue/PR closing.
- One feature per session. Never two features in the same session. One independent `claude -p` session per worktree.
- All worktrees branch from one common base SHA fixed at the start of `execute`.
- A blocked feature is reported with its blocking dependency ids. Never silently skip it and never substitute a later feature.
- `feature-flow` owns the role loop and acceptance inside a worktree session; its commit and validation rules still apply there.

## Preconditions

Checked before `execute` is allowed to mutate anything. `plan` runs the same checks read-only. Every feature to execute must pass all four:

1. Dependencies accepted: every id in `depends_on` has status `accepted` in `feature_list.json`.
2. Clean base: the base checkout has no staged, modified, or deleted tracked files (`git status --porcelain` has no tracked entries; untracked files are allowed and reported), no merge/rebase in progress, and `base_branch` resolves. The daily conversation log `docs/<yyyy-mm-dd>_conversacion_completa.md` is rewritten by the Stop hook on every turn; report it but do not treat it as a blocker.
3. Permissions: `get_me` succeeds, the repository lookup reports `permissions.push: true`, `BRICOMISSION_GITHUB_PAT` is set (check its length only, never print it), and the user explicitly granted push permission (otherwise work stays local and `publish` cannot push or open PRs).
4. Independent environments: one worktree per feature outside the base checkout, one session per worktree, no shared mutable state between features (each worktree runs its own `./init.sh` with a distinct Docker Compose project, `COMPOSE_PROJECT_NAME=<feature-id>`, so containers, volumes and databases are not shared).

If any precondition fails, report the failing features and stop before mutating anything.

## Deterministic Identities (reuse keys)

- Branch: `feature/<feature-id>`.
- Worktree: `<worktrees-root>/<feature-id>` where `<worktrees-root>` is `../<base-checkout-dirname>-worktrees`, outside the base checkout.
- Issue title: `[<feature-id>] <feature title from feature_list.json>`.
- PR: head `feature/<feature-id>` into `base_branch`, title `[<feature-id>] <feature title>`, body containing `Closes #<issue-number>`.

Reuse lookup before any creation (read-only):

- Issue: `search_issues` (see tool map, include closed issues); reuse the issue whose title starts with `[<feature-id>]`; create only if none exists.
- Worktree and branch: `git worktree list` and `git branch --list "feature/<feature-id>"`; reuse when present; `git worktree add` only if absent.
- PR: `list_pull_requests` (see tool map); reuse when present; create only in `publish` and only if absent.

## Session command

Run from the worktree directory (bash):

```bash
(cd <worktrees-root>/<feature-id> && \
  COMPOSE_PROJECT_NAME=<feature-id> claude -p "Use feature-flow for <feature-id> only, until accepted." \
    --permission-mode auto --settings '{"disableAllHooks": true}')
```

- `--permission-mode auto` lets the headless session run its role loop without interactive prompts; if the developer prefers another mode, use theirs.
- `disableAllHooks` stops the conversation-export Stop hook from writing log files inside feature branches (the log belongs to the base checkout only).
- Sessions do not need the GitHub MCP: everything inside a worktree is local git work.

## Mode: plan (planificar)

Read-only. Produce the plan report only.

1. Resolve inputs; read `feature_list.json`, `PROGRESS.md`, git state (`git status --porcelain`, `git rev-parse <base_branch>`, `git worktree list`, `git branch --list`) and GitHub state through the MCP (`get_me`, repository permissions, issue and PR lookups). Never `git fetch`.
2. Evaluate the four preconditions per feature. For blocked features, report the missing `accepted` dependency ids.
3. Planned base SHA = current `git rev-parse <base_branch>`.
4. For each ready feature, resolve reuse targets (issue, worktree, branch, PR) and the planned session command (see Session command).
5. Emit the output report with status `planned` and `pr: none`. Nothing is created.

## Mode: execute (ejecutar)

1. Run the precondition gate. Split the request into ready and blocked features and report both lists; continue with ready features only.
2. Fix the common base SHA: `GIT_TERMINAL_PROMPT=0 git fetch origin <base_branch>` then `base_sha=$(git rev-parse origin/<base_branch>)`. Every worktree branches from this exact SHA.
3. Record whether the user granted push permission. Without it, do not push anything.
4. For each ready feature, independently:
   1. Reuse or create the issue (lookup first; create with `issue_write`).
   2. Reuse or create the worktree and branch from `base_sha`: `git worktree add <worktrees-root>/<feature-id> -b feature/<feature-id> <base_sha>`.
   3. Launch exactly one session (see Session command). Never two features in one session. Different features use different worktrees and different sessions; they may run concurrently (separate background processes) because the environments are independent.
   4. Collect the `feature-flow` outcome (validator `accept` / `revise` / `block`) and the local commit created on accept.
   5. Keep the issue updated with status and evidence via `issue_write` (`method: "update"`) or `add_issue_comment` (GitHub writes are allowed here; push is still gated).
5. Emit the output report.

## Mode: publish (publicar)

1. Acceptance gate: every feature must be `accepted` in `feature_list.json`. If any is not, refuse that feature: without acceptance there is no publish. `passing` does not qualify.
2. Push gate: if push permission was not explicitly granted, refuse: without permission there is no push, and therefore no PR.
3. Push with local git: `GIT_TERMINAL_PROMPT=0 git push -u origin feature/<feature-id>`. Then reuse or create the PR into `base_branch` with `create_pull_request`, acceptance evidence and `Closes #<issue-number>` in the body (respect a repository PR template if one exists).
4. Never merge. Report the PR URL per published feature.

## Output Report

Header: mode, repository, base branch, base SHA, push permission (granted/denied), reused vs created artifacts.

Per feature, one row/block with exactly these fields:

- `feature`: feature id.
- `session`: the `claude -p` session command with its worktree, or `none` in plan mode.
- `branch`: `feature/<id> @ <base_sha>`.
- `status`: gate verdict or feature status: `blocked`, `planned`, `in_progress`, `passing`, `accepted`, `published`, `refused`.
- `commit`: hash and subject, or `none`.
- `evidence`: verification or acceptance summary.
- `pr`: PR URL when a PR exists or was published, otherwise `none`.
