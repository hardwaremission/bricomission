# github-flow evals

Contract evals for `../SKILL.md`. Every run uses mode `plan` (planificar) and must finish with zero side effects: no git mutations, no GitHub mutations, no file writes. Publish gating in Eval 4 is exercised through the same read-only gate evaluation.

Common inputs for all evals:

- `repository`: this checkout; resolve the slug from `git remote get-url origin`.
- `base_branch`: the branch where `bootstrap-seed` is `accepted` (for example `main`).
- Feature source: `feature_list.json` as it stands at eval time.
- Allowed reads only: `feature_list.json`, `PROGRESS.md`, `git status --porcelain`, `git rev-parse <base_branch>`, `git branch --show-current`, `git branch --list`, GitHub MCP read tools only (`get_me`, `search_repositories`, `search_issues`, `list_pull_requests`).

Record per eval: verdict `pass`/`fail` and the observed report lines that prove it.

## Eval 1 — blocked feature: missing accepted dependency

- Input: mode `plan`, `feature_ids = ["product-detail"]`.
- State: `product-detail` depends_on `["catalog-list"]`; `catalog-list` status is `not_started`.
- Expected: blocked — missing accepted dependency `catalog-list`. No issue, branch, or PR is planned. Zero side effects.
- Pass criteria: the report names `product-detail` and `catalog-list` and states the dependency is not `accepted`; planned artifact count is zero.

## Eval 2 — two ready features, one base SHA, sequential queue

- Input: mode `plan`, `feature_ids = ["ai-provider-config", "catalog-list"]`.
- State: `ai-provider-config` depends_on `["bootstrap-stack"]` (`accepted`); `catalog-list` depends_on `["bootstrap-seed"]` (`accepted`).
- Expected: both features available in `feature_list.json` order; only the first is `planned` against the current base, the second is `queued` (its base is `main` after the first PR is merged); never two features in flight and no worktree or extra session is planned. Per feature the report includes branch, status, commit, evidence, and PR URL.
- Pass criteria: first feature `planned`, second `queued`; no worktree is planned; zero side effects.

## Eval 3 — repeated request is idempotent

- Input: the exact same request as Eval 2, issued a second time.
- Expected: same plan — same base SHA, branches, and issue and PR reuse targets — and nothing new to create: the delta against the first run is empty. No duplicate artifacts and no deletions are planned.
- Pass criteria: run 2 identity set equals run 1 identity set; run 2 plans zero additional artifacts relative to run 1; zero side effects.

## Eval 4 — publish without acceptance is refused

- Input: mode `publish`, `feature_ids = ["catalog-list"]` (status `not_started`), evaluated without effects.
- Expected: refused — without acceptance there is no publish. No push, no PR, no issue, branch, or file changes.
- Pass criteria: verdict `refused` citing that the status is not `accepted`; zero side effects.

## Running

Run each eval through the skill in `plan` mode against the live read-only state listed above. Never run these evals in `execute` or `publish` mode for real: Eval 4 checks the refusal verdict only.
