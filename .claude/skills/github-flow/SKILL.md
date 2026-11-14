---
name: github-flow
description: "Orchestrate GitHub delivery of feature_list.json features on top of feature-flow, strictly one feature at a time: issue, feature branch checked out in the main checkout (no worktrees), local acceptance, push and PR, then wait for the developer's merge, return to the base branch and pull before the next feature. Uses the project's GitHub MCP server (issues/PRs). Use when the user asks to plan, execute, or publish feature ids in a GitHub repository, or to reuse or create issues, branches, or PRs for features. Modes: plan (planificar, read-only), execute (ejecutar), publish (publicar). Never merges."
---

# GitHub Flow

Deliver `feature_list.json` features to a GitHub repository **sequentially**: exactly one feature is in flight at any time. This skill owns repository topology: issues, branches, pushes, and PRs. It delegates each feature's planner/implementer/validator loop to `../feature-flow/SKILL.md`, run from the orchestrator's own session on the feature branch, and never implements product code itself.

Why sequential: parallel features all branched from the same base and touched the same shared files (`feature_list.json`, `PROGRESS.md`, `compose.yaml`, `init.sh`, `.env.example`, `packages/shared-types`, `app.module.ts`, `pnpm-lock.yaml`, docs). Every batch then needed manual merge-conflict resolution. One feature at a time, always branched from the freshly merged base, avoids that. For the same reason there are no worktrees: one checkout, one branch at a time, one Compose stack on the default ports.

## Tooling (project adaptation)

This repository forbids the `gh` CLI and any global git credentials (see `CLAUDE.md`). Use only:

- **GitHub remote state**: the `github` MCP server declared in `.mcp.json` (`mcp__github__*` tools). Load tool schemas with ToolSearch (`select:mcp__github__<name>`) before calling them. Call `get_me` first.
- **Git**: local `git` in this checkout. `git fetch` / `git push` authenticate only through the repository-local credential helper backed by the `BRICOMISSION_GITHUB_PAT` environment variable. Run network git commands with `GIT_TERMINAL_PROMPT=0` so a missing token fails instead of prompting.
- **Subagents**: the feature's planner, implementer and validator run as subagents of this session (see `feature-flow`), with the repository root as their working directory, on the feature branch. No separate Claude Code sessions and no Remote Control.

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
3. `base_branch`: branch that all work is based on and that PRs target (`main`).
4. `mode`: `plan` | `execute` | `publish` (aliases: planificar | ejecutar | publicar).

## Hard Rules

- **One feature in flight.** Never work on two features, or leave an unmerged feature PR open from this flow, while starting another. The next feature starts only after the previous feature's PR has been merged by the developer.
- **Fresh base per feature.** Before each feature, check out `base_branch`, `git pull --ff-only origin <base_branch>`, then create the feature branch from it, so it already contains every previously merged feature. Never branch from a stale SHA or from another feature branch (no stacked PRs).
- **The working checkout is the feature's.** While a feature is in flight the checkout sits on `feature/<feature-id>`. It returns to `base_branch` only after the developer confirms the merge.
- Plan mode is read-only. It must not mutate git, GitHub, or files: no fetch, push, commit, checkout, stash, or branch creation; no MCP write tool (`issue_write`, `add_issue_comment`, `create_pull_request`, `update_pull_request`, `create_branch`); no file writes.
- Without acceptance there is no publish. `publish` requires the feature's status to be `accepted` in `feature_list.json` (independent validator `accept`). `passing` is not accepted.
- Without explicit push permission there is no push. Push permission is granted by the user per run; the default is denied. Never assume it from an earlier run or from a plan the user approved. Ask.
- Merge is always out of scope. Never merge a PR and never enable auto-merge. Wait for the developer to say the PR is merged.
- If a request repeats, reuse the existing issue, branch, and PR. Never duplicate them. Never force push or close issues/PRs. Local and remote branch deletion happens only after the PR is merged (see After the merge).
- One feature per run of `feature-flow`. Never two features in the same loop.
- A blocked feature is reported with its blocking dependency ids. Never silently skip it and never substitute a later feature.
- `feature-flow` owns the role loop and acceptance; its commit and validation rules still apply.
- UI-gate features (notes mention the OpenPencil design gate) need the developer at the keyboard with OpenPencil open and the matching `.fig` loaded from this checkout. Announce them and start the design step only when the developer confirms they are available. Pass `page_id` to every OpenPencil `render` call; do not rely on `switch_page`. The OpenPencil MCP only writes inside this checkout.

## Preconditions

Checked before `execute` mutates anything. `plan` runs the same checks read-only. The feature to execute must pass all four:

1. Dependencies accepted: every id in `depends_on` has status `accepted` in `feature_list.json` on `origin/<base_branch>`.
2. Nothing in flight: no other feature from this flow has an open PR, a feature branch with unpublished or unmerged accepted work, or a running subagent.
3. Clean checkout: no staged, modified, or deleted tracked files (`git status --porcelain` has no tracked entries; untracked files are allowed and reported), no merge/rebase in progress, and `base_branch` resolves. The daily conversation log `docs/<yyyy-mm-dd>_conversacion_completa.md` is rewritten by the conversation hooks on every turn; report it but do not treat it as a blocker. It travels with the checkout when switching branches; if a checkout or pull would overwrite it, stash only those log files.
4. Permissions: `get_me` succeeds, the repository lookup reports `permissions.push: true`, `BRICOMISSION_GITHUB_PAT` is set (check its length only, never print it), and the user explicitly granted push permission for this run.

If any precondition fails, report it and stop before mutating anything.

## Deterministic Identities (reuse keys)

- Branch: `feature/<feature-id>`.
- Issue title: `[<feature-id>] <feature title from feature_list.json>`.
- PR: head `feature/<feature-id>` into `base_branch`, title `[<feature-id>] <feature title>`, body containing `Closes #<issue-number>`.

Reuse lookup before any creation (read-only):

- Issue: `search_issues` (see tool map, include closed issues); reuse the issue whose title starts with `[<feature-id>]`; create only if none exists.
- Branch: `git branch --list "feature/<feature-id>"` and `git ls-remote --heads origin feature/<feature-id>`; reuse (check it out) when present; create only if absent.
- PR: `list_pull_requests` (see tool map); reuse when present; create only in `publish` and only if absent.

## Running the feature loop

The loop runs in this session: the orchestrator calls the `planner`, `implementer` and `validator` subagents one after another, as `feature-flow` prescribes, always on `feature/<feature-id>` in the repository root. Brief each subagent with:

- The feature id, the spec path, and the branch. Work only in this checkout.
- Compose uses the default project name and ports. This is the only stack, because only one feature is in flight; stop other stacks of the repo first if the ports clash.
- Every command that loads a model on the GPU runs under `flock /tmp/bricomission-gpu.lock`, and GPU services are stopped right after. Shared `bricomission_*` model volumes are never deleted or re-downloaded.
- Never run sudo. If a human action is needed (sudo, OpenPencil approval, credentials, developer-only files), stop and report a block with exact steps.
- Subagents never commit and never touch GitHub. Only the orchestrator commits, after the validator's `accept`, as `feature-flow` prescribes. Add attribution lines only as the current system reminder asks.
- End with a short report: verdict, evidence, how to try it, blocks.

If the plan's usage limit stops a subagent, resume it with `SendMessage` after the reset; it continues from the existing spec and state.

## Mode: plan (planificar)

Read-only. Produce the plan report only.

1. Resolve inputs; read `feature_list.json`, `PROGRESS.md`, git state (`git status --porcelain`, `git branch --show-current`, `git rev-parse <base_branch>`, `git branch --list`) and GitHub state through the MCP (`get_me`, repository permissions, issue and PR lookups). Never `git fetch`.
2. Evaluate the preconditions. For blocked features, report the missing `accepted` dependency ids; report any feature already in flight.
3. Order the queue: the requested ids (or the dependency-ready features) in `feature_list.json` order, UI-gate features flagged.
4. For the first feature only, resolve reuse targets (issue, branch, PR) and the planned base (`origin/<base_branch>` at execution time). Later features are listed as `queued`: their base is the base branch after the previous PR is merged.
5. Emit the output report with status `planned` / `queued` and `pr: none`. Nothing is created.

## Mode: execute (ejecutar)

Process the queue one feature at a time. For each feature:

1. Run the precondition gate for this feature. If it fails, report and stop the queue.
2. Fix the base: `git checkout <base_branch>`, `GIT_TERMINAL_PROMPT=0 git pull --ff-only origin <base_branch>`, `base_sha=$(git rev-parse HEAD)`.
3. Reuse or create the issue (lookup first; create with `issue_write`).
4. Reuse or create the branch from the base and move onto it: `git checkout -b feature/<feature-id>` (or `git checkout feature/<feature-id>` when it already exists).
5. Run the feature loop (see Running the feature loop) on this branch. For a UI-gate feature, do the OpenPencil design step with the developer first.
6. Collect the `feature-flow` outcome (validator `accept` / `revise` / `block`) and the local commit created on accept. On `block`, report it, stay on the branch, and stop the queue.
7. Keep the issue updated with status and evidence via `add_issue_comment` or `issue_write` (`method: "update"`).
8. On accept, continue directly with `publish` for this feature if push permission was granted for this run.
9. **Wait for the merge.** Report the PR and stop. When the developer says the PR is merged, run After the merge, then resume with the next queued feature.

## Mode: publish (publicar)

1. Acceptance gate: the feature must be `accepted` in `feature_list.json`. If it is not, refuse: without acceptance there is no publish. `passing` does not qualify.
2. Push gate: if push permission was not explicitly granted for this run, refuse and ask: without permission there is no push, and therefore no PR.
3. Freshness check: if `origin/<base_branch>` moved since the branch was created (it should not, because only one feature is in flight), merge it into the feature branch, re-run `./init.sh`, and record the result before pushing.
4. Push with local git: `GIT_TERMINAL_PROMPT=0 git push -u origin feature/<feature-id>`. Then reuse or create the PR into `base_branch` with `create_pull_request`, acceptance evidence and `Closes #<issue-number>` in the body (respect a repository PR template if one exists). Comment the PR number on the issue.
5. Never merge. Report the PR URL and ask the developer to merge it before the next feature starts.

## After the merge

Runs when the developer confirms the PR is merged (no extra confirmation needed for the steps below; the developer asked for them in the same breath):

1. `GIT_TERMINAL_PROMPT=0 git fetch origin --prune`; verify `feature/<feature-id>` is an ancestor of `origin/<base_branch>`. If it is not, stop and report.
2. `git checkout <base_branch>` and `GIT_TERMINAL_PROMPT=0 git pull --ff-only origin <base_branch>` (stash only the conversation logs if they block it).
3. Delete the merged local branch with `git branch -d feature/<feature-id>`.
4. Delete the merged remote branch with `GIT_TERMINAL_PROMPT=0 git push origin --delete feature/<feature-id>`, and any other remote `feature/*` branch that is already an ancestor of `origin/<base_branch>`. Never delete an unmerged branch.
5. Leave the Compose stack and its volumes alone: they are the default project and are reused by the next feature. Never remove the shared `bricomission_*` volumes.
6. Report the new base SHA and the next ready feature.

## Output Report

Header: mode, repository, base branch, base SHA, push permission (granted/denied), reused vs created artifacts, queue position (`n of m`).

Per feature, one row/block with exactly these fields:

- `feature`: feature id.
- `branch`: `feature/<id> @ <base_sha>`.
- `status`: gate verdict or feature status: `blocked`, `planned`, `queued`, `in_progress`, `passing`, `accepted`, `published`, `refused`.
- `commit`: hash and subject, or `none`.
- `evidence`: verification or acceptance summary.
- `pr`: PR URL when a PR exists or was published, otherwise `none`.
