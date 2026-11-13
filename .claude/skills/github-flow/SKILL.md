---
name: github-flow
description: "Orchestrate GitHub delivery of feature_list.json features on top of feature-flow, strictly one feature at a time: issue, git worktree, one Remote Control Claude Code session, local acceptance, push and PR, then wait for the developer's merge before the next feature. Uses the project's GitHub MCP server (issues/PRs). Use when the user asks to plan, execute, or publish feature ids in a GitHub repository, or to reuse or create issues, branches, worktrees, or PRs for features. Modes: plan (planificar, read-only), execute (ejecutar), publish (publicar). Never merges."
---

# GitHub Flow

Deliver `feature_list.json` features to a GitHub repository **sequentially**: exactly one feature is in flight at any time. This skill owns repository topology: issues, branches, worktrees, sessions, pushes, and PRs. It delegates each feature's planner/implementer/validator loop to `../feature-flow/SKILL.md` inside an isolated worktree session and never implements product code itself.

Why sequential: parallel worktrees all branched from the same base and touched the same shared files (`feature_list.json`, `PROGRESS.md`, `compose.yaml`, `init.sh`, `.env.example`, `packages/shared-types`, `app.module.ts`, `pnpm-lock.yaml`, docs). Every batch then needed manual merge-conflict resolution. One feature at a time, always branched from the freshly merged base, avoids that.

## Tooling (project adaptation)

This repository forbids the `gh` CLI and any global git credentials (see `CLAUDE.md`). Use only:

- **GitHub remote state**: the `github` MCP server declared in `.mcp.json` (`mcp__github__*` tools). Load tool schemas with ToolSearch (`select:mcp__github__<name>`) before calling them. Call `get_me` first.
- **Git**: local `git` in this checkout. `git fetch` / `git push` authenticate only through the repository-local credential helper backed by the `BRICOMISSION_GITHUB_PAT` environment variable. Run network git commands with `GIT_TERMINAL_PROMPT=0` so a missing token fails instead of prompting.
- **Sessions**: one interactive Claude Code session with Remote Control per feature (`claude --remote-control <feature-id>`), started from the feature's worktree, so the developer can follow or steer it from claude.ai/code or the mobile app. Headless `claude -p` is the fallback only when the developer asks for it (it cannot use Remote Control).

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

1. `feature_ids`: one or more feature ids from `feature_list.json`, processed as an ordered queue. With no ids, use the dependency-ready features in `feature_list.json` order.
2. `repository`: GitHub slug (`owner/repo`) or a local checkout path. Resolve the slug from `git remote get-url origin` and confirm it.
3. `base_branch`: branch that all work is based on and that PRs target.
4. `mode`: `plan` | `execute` | `publish` (aliases: planificar | ejecutar | publicar).

## Hard Rules

- **One feature in flight.** Never run two feature sessions, worktrees under construction, or unmerged feature PRs from this flow at the same time. The next feature starts only after the previous feature's PR has been merged by the developer.
- **Fresh base per feature.** Before each feature, fetch `base_branch` and branch the worktree from the current `origin/<base_branch>`, which already contains every previously merged feature. Never branch from a stale SHA or from another feature branch (no stacked PRs).
- Plan mode is read-only. It must not mutate git, GitHub, or files: no fetch, push, commit, checkout, stash, or worktree add; no MCP write tool (`issue_write`, `add_issue_comment`, `create_pull_request`, `update_pull_request`, `create_branch`); no file writes.
- Without acceptance there is no publish. `publish` requires the feature's status to be `accepted` in `feature_list.json` (independent validator `accept`). `passing` is not accepted.
- Without explicit push permission there is no push. Push permission is granted per run by the user; the default is denied.
- Merge is always out of scope. Never merge a PR and never enable auto-merge. Wait for the developer to say the PR is merged.
- If a request repeats, reuse the existing issue, worktree, and PR. Never duplicate them. Never force push or close issues/PRs. Worktree and local branch cleanup happens only after the PR is merged and only when the developer asks.
- One feature per session. Never two features in the same session.
- A blocked feature is reported with its blocking dependency ids. Never silently skip it and never substitute a later feature.
- `feature-flow` owns the role loop and acceptance inside the worktree session; its commit and validation rules still apply there.
- UI-gate features (notes mention the OpenPencil design gate) need the developer at the keyboard with OpenPencil open. Announce them and start them only when the developer confirms they are available.

## Preconditions

Checked before `execute` mutates anything. `plan` runs the same checks read-only. The feature to execute must pass all five:

1. Dependencies accepted: every id in `depends_on` has status `accepted` in `feature_list.json` on `origin/<base_branch>`.
2. Nothing in flight: no other feature from this flow has an open PR, a running session, or an unpublished accepted commit.
3. Clean base: the base checkout has no staged, modified, or deleted tracked files (`git status --porcelain` has no tracked entries; untracked files are allowed and reported), no merge/rebase in progress, and `base_branch` resolves. The daily conversation log `docs/<yyyy-mm-dd>_conversacion_completa.md` is rewritten by the conversation hooks on every turn; report it but do not treat it as a blocker.
4. Permissions: `get_me` succeeds, the repository lookup reports `permissions.push: true`, `BRICOMISSION_GITHUB_PAT` is set (check its length only, never print it), and the user explicitly granted push permission.
5. Isolated environment: the worktree runs its own Docker Compose project (`COMPOSE_PROJECT_NAME=<feature-id>`) on host ports that do not clash with the base checkout's running stack. Shared fixed-name model volumes (`bricomission_*`) are reused, never deleted.

If any precondition fails, report it and stop before mutating anything.

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

The session runs interactively with Remote Control. Without tmux on the host, wrap it in a pseudo-terminal with `script` and keep stdin open, so it keeps running in the background. If the orchestrator's own process lacks the `docker` group (it was started before the group was added), launch through `newgrp docker`.

```bash
# run-<feature-id>.sh (kept in the orchestrator's scratchpad, not in the repo)
cd <worktrees-root>/<feature-id>
export COMPOSE_PROJECT_NAME=<feature-id> POSTGRES_PORT=... API_PORT=... KEYCLOAK_PORT=...   # non-clashing ports
export PATH="$HOME/.local/bin:$PATH" COREPACK_ENABLE_DOWNLOAD_PROMPT=0
unset BRICOMISSION_GITHUB_PAT   # the session never pushes
sleep infinity | script -qfec "claude --remote-control <feature-id> --permission-mode auto \
  --settings '{\"disableAllHooks\": true}' '<prompt>'" <scratchpad>/<feature-id>.typescript
```

Launch it in the background (`printf 'bash run-<feature-id>.sh\n' | newgrp docker` when needed) and read the Remote Control URL (`https://claude.ai/code/session_...`) from the typescript file to give it to the developer.

The prompt states:

- `Use feature-flow for <feature-id> only, until accepted.` Reuse an existing spec if a previous run was interrupted.
- The worktree, branch, and base SHA; work only there.
- The exported Compose project and ports; every new published port must be env-overridable with a default.
- Shared model volumes are never deleted or re-downloaded. Every command that loads a model on the GPU runs under `flock /tmp/bricomission-gpu.lock`, and GPU services are stopped right after.
- Never run sudo. If a human action is needed (sudo, OpenPencil approval, credentials, developer-only files), stop and report a block with exact steps.
- On validator accept, commit locally on `feature/<feature-id>` as feature-flow prescribes. Do not push and do not touch GitHub.
- End with a short report: verdict, commit, evidence, how to try it, blocks.

Notes:

- `--permission-mode auto` lets the session run its role loop without prompts; the developer can still answer anything from Remote Control.
- `disableAllHooks` stops the conversation-export hooks from writing log files inside feature branches (the log belongs to the base checkout only).
- The session does not need the GitHub MCP: everything inside a worktree is local git work.
- An interactive session does not exit when done. Watch the worktree (feature status in `feature_list.json`, new `feat: complete <feature-id>` commit, session process alive) with a Monitor, and close the session (`pkill -TERM -f "claude --remote-control <feature-id>"`) after the accepted commit exists and the tree is clean.
- If the plan's usage limit stops the session, relaunch the same command after the reset; it resumes from the existing spec and state.

## Mode: plan (planificar)

Read-only. Produce the plan report only.

1. Resolve inputs; read `feature_list.json`, `PROGRESS.md`, git state (`git status --porcelain`, `git rev-parse <base_branch>`, `git worktree list`, `git branch --list`) and GitHub state through the MCP (`get_me`, repository permissions, issue and PR lookups). Never `git fetch`.
2. Evaluate the preconditions. For blocked features, report the missing `accepted` dependency ids; report any feature already in flight.
3. Order the queue: the requested ids (or the dependency-ready features) in `feature_list.json` order, UI-gate features flagged.
4. For the first feature only, resolve reuse targets (issue, worktree, branch, PR), the planned base (`origin/<base_branch>` at execution time) and the session command. Later features are listed as `queued`: their base is the base branch after the previous PR is merged.
5. Emit the output report with status `planned` / `queued` and `pr: none`. Nothing is created.

## Mode: execute (ejecutar)

Process the queue one feature at a time. For each feature:

1. Run the precondition gate for this feature. If it fails, report and stop the queue.
2. Fetch and fix the base: `GIT_TERMINAL_PROMPT=0 git fetch origin <base_branch>`, `base_sha=$(git rev-parse origin/<base_branch>)`; fast-forward the base checkout (`git pull --ff-only origin <base_branch>`).
3. Reuse or create the issue (lookup first; create with `issue_write`).
4. Reuse or create the worktree and branch from `base_sha`: `git worktree add <worktrees-root>/<feature-id> -b feature/<feature-id> <base_sha>`.
5. Launch exactly one session (see Session command), give the developer its Remote Control URL, and watch it.
6. Collect the `feature-flow` outcome (validator `accept` / `revise` / `block`) and the local commit created on accept. On `block`, report it, keep the worktree, and stop the queue.
7. Keep the issue updated with status and evidence via `add_issue_comment` or `issue_write` (`method: "update"`).
8. On accept, continue directly with `publish` for this feature if push permission was granted.
9. **Wait for the merge.** Report the PR and stop. Resume with the next queued feature only when the developer says the PR is merged; then fetch `base_branch` again (step 2) before starting it.

## Mode: publish (publicar)

1. Acceptance gate: the feature must be `accepted` in `feature_list.json`. If it is not, refuse: without acceptance there is no publish. `passing` does not qualify.
2. Push gate: if push permission was not explicitly granted, refuse: without permission there is no push, and therefore no PR.
3. Freshness check: if `origin/<base_branch>` moved since the worktree was created (it should not, because only one feature is in flight), merge it into the feature branch, re-run `./init.sh` in the worktree, and record the result before pushing.
4. Push with local git: `GIT_TERMINAL_PROMPT=0 git push -u origin feature/<feature-id>`. Then reuse or create the PR into `base_branch` with `create_pull_request`, acceptance evidence and `Closes #<issue-number>` in the body (respect a repository PR template if one exists). Comment the PR number on the issue.
5. Never merge. Report the PR URL and ask the developer to merge it before the next feature starts.

## After the merge (on request)

When the developer confirms the merge and asks for cleanup: verify `feature/<feature-id>` is an ancestor of `origin/<base_branch>`, bring the worktree's Compose project down without `-v`, remove only the volumes prefixed `<feature-id>_` and the image `<feature-id>-api`, then `git worktree remove` and `git branch -d feature/<feature-id>`. Never touch the shared `bricomission_*` volumes or remote branches.

## Output Report

Header: mode, repository, base branch, base SHA, push permission (granted/denied), reused vs created artifacts, queue position (`n of m`).

Per feature, one row/block with exactly these fields:

- `feature`: feature id.
- `session`: the Remote Control URL and worktree, or `none` in plan mode.
- `branch`: `feature/<id> @ <base_sha>`.
- `status`: gate verdict or feature status: `blocked`, `planned`, `queued`, `in_progress`, `passing`, `accepted`, `published`, `refused`.
- `commit`: hash and subject, or `none`.
- `evidence`: verification or acceptance summary.
- `pr`: PR URL when a PR exists or was published, otherwise `none`.
