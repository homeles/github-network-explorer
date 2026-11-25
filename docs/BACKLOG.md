# GitHub Network Explorer: review and backlog

Snapshot date: 2026-11-25 (`main` at `5790205`). This document records a full code review of the server and client and a scan of GitHub platform changes from 2024 to 2026. Use it to plan bug fixes, security work and new features. Each item has an ID so issues and PRs can refer to it.

## What the tool is

GitHub Network Explorer (GNE) is a self-hosted alternative to GitHub's built-in **Network graph** and **Insights** pages. An Express server holds a GitHub OAuth token in a server-side session and proxies GitHub GraphQL and REST calls. A React single-page app draws the data.

| View | Data source | Notes |
|---|---|---|
| Commit graph | GraphQL `Commit.history` per selected branch, 50 per page | Lane layout like `git log --graph` (`client/src/lib/dag.ts`) |
| Network | GraphQL history for the default branch and every other branch | GitHub-style horizontal lanes. It rebuilds deleted branches from merge commits (`client/src/lib/network-dag.ts`). |
| Commit detail | GraphQL `object(expression:)` | Files, additions/deletions, linked PRs, `statusCheckRollup` |
| Branches | GraphQL refs (`first: 50`) plus one REST `compare` call per branch | Ahead/behind counts and the `branchProtectionRule` badge |
| Pull requests | GraphQL `pullRequests`, **every page** | CI contexts, reviews and review requests. Filtering happens on the client. |
| Code frequency | REST `GET /commits` list, then **one REST `GET /commits/{sha}` per commit** | Streamed to the client over SSE. Includes a time series, a directory treemap, top files and contributors. |

Stack: React 19, Vite 6, TanStack Query 5, d3 7, React Router 7, Express 4, Octokit (`@octokit/graphql` 8 and `@octokit/rest` 21), node-cache and express-session (MemoryStore). Packages are managed with pnpm workspaces.

## Fixed in the CVE-patch PR

| ID | Item |
|---|---|
| S-01 | **Stored XSS** in the graph, network, treemap and contributor tooltips. Commit messages, author names, branch names and file paths were interpolated into `innerHTML` or d3 `.html()` without escaping. Anyone who could push a commit to a repo a user then viewed could run JavaScript in GNE's origin and call `/api/*` with that user's session. |
| S-02 | **OAuth `state` check bypass.** A callback with no `state` parameter matched a session that also had none (`undefined !== undefined` is false). That allowed login CSRF. The fix rejects a missing or non-string `state`, compares in constant time and makes the value single-use. |
| D-01 | Dependency CVEs and dead dependencies. See the PR description. |

## Security and correctness backlog

| ID | Pri | Item | Where |
|---|---|---|---|
| S-03 | P1 | **Hardcoded session secret fallback** (`dev-secret-change-in-production`). Fail at startup in production when `SESSION_SECRET` is missing or shorter than 32 characters. | `server/src/index.ts` |
| S-04 | P1 | **Cache entries shared across users.** The keys for overview, commits, branches, PRs, tags and code frequency contain no user. Private-repo data cached for user A is served to user B, and data archived PRs hide by role (see P-11) leaks the same way. The user-scoped keys use `token.slice(-8)`, which can collide and also puts token material into cache keys. Prefix every key with an HMAC of the token. | `server/src/routes/*.ts` |
| S-05 | P1 | **Session fixation.** The session ID isn't regenerated after login, and logout doesn't clear the cookie. | `auth.routes.ts` |
| S-06 | P1 | **No rate limiting.** One user, or a forged session, can use up the GitHub token's 5000/h budget. Code frequency costs one REST call per commit with no upper limit. | `repo.routes.ts`, `github.service.ts` |
| S-07 | P2 | **Unvalidated inputs.** The PR `state` value goes into GraphQL unchecked. `page`, `per_page`, `maxCommits` and `tzOffset` have no bounds. Owner and repo names aren't encoded on the client, so `%2E%2E` can reach other API routes. | routes, `client/src/lib/api.ts` |
| S-08 | P2 | **No content security policy, and the cookie is never `secure`.** Turn CSP back on (`script-src 'self'`) and add an opt-in `COOKIE_SECURE` plus `trust proxy` setting. | `server/src/index.ts` |
| S-09 | P2 | **MemoryStore sessions.** Sessions leak memory, live in a single process and disappear on restart. Add an optional Redis or SQLite store. | `server/src/index.ts` |
| S-10 | P3 | **Unchecked URLs.** `href`s come from CI `detailsUrl`/`targetUrl` without an `https:` check, and `window.open` runs without `noopener`. | `PullRequestsPage.tsx`, `DirectoryTreemap.tsx` |
| B-01 | P1 | **401 and 403/429 errors are swallowed.** The client throws away the HTTP status, nothing sends the user back to login on 401, and the server turns GitHub's 403/429 into a generic 500. SSE can't see the status at all. | `client/src/lib/api.ts`, routes |
| B-02 | P1 | **Unbounded fetching.** "All time" downloads every page of every selected branch. Code frequency never sends `maxCommits`. Each treemap drill-down restarts the full analysis on the server. | `useCommits.ts`, `CodeFrequencyPage.tsx` |
| B-03 | P1 | **`useMultiBranchCommits` refetches page 1** of branches that have no next page on every later page. Results are deduplicated, so this is invisible but multiplies API calls. | `client/src/hooks/useCommits.ts` |
| B-04 | P1 | **Race conditions in the NetworkPage branch loader.** In-flight loads aren't cancelled when the repo or date range changes, an index drifts when the selection changes, branches only get their first page and errors are dropped silently. Replace it with `useQueries`. | `client/src/pages/NetworkPage.tsx` |
| B-05 | P2 | **Branches beyond 50 are missing.** `getBranches` doesn't paginate, and it makes N REST compare calls. Batch the counts with GraphQL `Ref.compare` (see P-12). | `github.service.ts` |
| B-06 | P2 | **Deep links lose state.** The `branches` parameter is cleared on mount, and BranchesPage links with `?branch=`, which no page reads. | `GraphPage.tsx`, `NetworkPage.tsx`, `BranchesPage.tsx` |
| B-07 | P2 | **A bad date in the URL crashes the app**, and there is no error boundary to catch it. | `DateRangeContext.tsx` |
| B-08 | P2 | **The DAG layout leaks lanes** when two children share a parent or a parent falls outside the loaded window, so the graph keeps getting wider. | `client/src/lib/dag.ts` |
| B-09 | P3 | **PR sort labels don't match the sort.** "Most reviews" sorts by comments, and "Most commits" sorts by reviews. | `PullRequestsPage.tsx` |
| B-10 | P3 | **Settings shows the wrong version and link.** It says `0.1.0` and links to `homeles/gne`. | `SettingsPage.tsx` |
| B-11 | P3 | **Unwired or missing pieces.** The settings `defaultPageSize` and `showMergeCommits` don't do anything, and `favicon.svg` doesn't exist. | client |
| Q-01 | P2 | **No tests, ESLint or CI checks.** `dag.ts` and `network-dag.ts` are pure functions and easy to test with vitest. The `react-hooks/exhaustive-deps` disables are never actually checked. Add `pnpm audit` and type-checking to CI. | repo |
| Q-02 | P2 | **Rendering performance.** Every click or page tears down and rebuilds the full SVG, nothing is virtualized, and the view jumps back to the fit position while pages auto-load. | `GraphVisualization.tsx`, `NetworkGraphVisualization.tsx` |
| Q-03 | P3 | **Accessibility.** SVG nodes aren't focusable, there is no keyboard navigation, dropdowns have no ARIA, and focus outlines are removed. | client |
| Q-04 | P3 | **Duplication.** Lane colors, tooltip builders, `timeAgo` and dropdown logic are each written several times. Tailwind is installed, but all styles are inline. | client |

## GitHub platform changes (2024 to 2026) that affect GNE

Sources are GitHub changelog posts and docs pages. They were fetched on 2026-11-25.

| ID | Pri | Change | What GNE should do |
|---|---|---|---|
| P-01 | P1 | **REST API version `2026-03-10`** ([changelog](https://github.blog/changelog/2026-03-12-rest-api-version-2026-03-10-is-now-available/)) is the first calendar version with breaking changes. It removes `rate` from `/rate_limit` and `merge_commit_sha` from PR objects. `2022-11-28` stays the default and is supported until at least March 2028. | Send `X-GitHub-Api-Version: 2022-11-28` explicitly now. Then move the rate-limit indicator to `resources.core` and `resources.graphql` and adopt the new version. |
| P-02 | P1 | **OAuth apps can use expiring tokens** ([changelog](https://github.blog/changelog/2026-08-14-multiple-redirect-uris-and-token-refresh-for-oauth-apps/)). **They are on by default for new apps**: 8-hour access tokens with 6-month refresh tokens. | Store the `refresh_token` and refresh on expiry or a 401. Without this, new installs log users out every 8 hours. |
| P-03 | P1 | **PKCE is supported and recommended** for OAuth and GitHub App sign-in ([changelog](https://github.blog/changelog/2025-07-14-pkce-support-for-oauth-and-github-app-authentication/)). | Add `code_challenge` with S256 and `code_verifier`. |
| P-04 | P1 | **Actions retention now covers checks and statuses** ([changelog](https://github.blog/changelog/2026-10-01-actions-retention-now-covers-checks-runs-and-statuses/)), with a 90-day default. | Show "CI data expired" separately from "no CI" for older commits. |
| P-05 | P1 | **Rulesets are replacing branch protection.** There is now a one-click conversion ([changelog](https://github.blog/changelog/2026-08-11-automatically-migrate-branch-protection-rules-to-repository-rulesets/)). `branchProtectionRule` doesn't see rulesets. | Query `Ref.rules` and merge it into the protection badge with chips for each rule type. Treat unknown rule types as "other". |
| P-06 | P1 | **GraphQL resource limits** ([changelog](https://github.blog/changelog/2025-09-01-graphql-api-resource-limits/)). Heavy queries now return partial `data` together with `errors`. | Treat partial results as partial: retry with smaller pages, split the nested history/PR/CI query, and log `rateLimit { cost }`. |
| P-07 | P1 | **Secondary rate limits and conditional requests** ([docs](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)). A 304 doesn't count against the primary limit. | Throttle the per-commit REST calls for code frequency, back off on `retry-after`, use ETags, and drive the indicator from response headers. |
| P-08 | P1 | **Stacked pull requests are generally available** ([changelog](https://github.blog/changelog/2026-10-06-stacked-pull-requests-generally-available/)). GraphQL now has `PullRequest.stack` and `stackEntry`. | Draw stacks as linked branch chains and group them in the PR feed. Nothing else announced in this period fits a branch-DAG tool as well. |
| P-09 | P1 | **GitHub's own Insights stop computing statistics for repos with 10k+ commits** ([changelog](https://github.blog/changelog/2023-11-29-upcoming-changes-to-repository-insights/)). | GNE computes code frequency itself, which is a selling point. Make it cheaper: build the time series from GraphQL `Commit.additions` and `deletions`, and fetch per-commit file lists only for the treemap and top files, lazily, with SHA-keyed caching. |
| P-10 | P1 | **GraphQL deprecations.** `ReviewRequest.requestedBy` is gone, `databaseId` is replaced by `fullDatabaseId`, and the `RequestedReviewer` union now includes `Bot`, `Mannequin` and `EnterpriseTeam` ([breaking changes](https://docs.github.com/en/graphql/overview/breaking-changes)). | Check the queries and render every reviewer type. Add a CI step that validates queries against the public schema. |
| P-11 | P1 | **Archived PRs** are hidden from users below the triage role ([changelog](https://github.blog/changelog/2026-10-08-triage-role-users-or-higher-can-now-archive-pull-requests/)). | This is another reason for S-04: PR lists now differ by user. |
| P-12 | P2 | `Ref.compare` returns `aheadBy` and `behindBy` in GraphQL. | Replace the N REST compare calls with batched GraphQL aliases. |
| P-13 | P2 | Merge queue data: `PullRequest.isInMergeQueue` and `mergeQueueEntry`. | Add an "In merge queue" badge with the PR's position. |
| P-14 | P2 | The Copilot coding agent opens PRs on a user's behalf, and `author:` searches now include those PRs ([changelog](https://github.blog/changelog/2026-06-18-copilot-authored-pull-requests-now-included-in-author-searches/)). | Label these "Copilot on behalf of @user" and add a toggle to hide bot PRs. |
| P-15 | P2 | Copilot code review now has attribution fields and comment severity ([changelog](https://github.blog/changelog/2026-11-06-copilot-code-review-api-management-and-review-overview-updates/)). | List Copilot reviews separately from human reviews, with severity counts. |
| P-16 | P2 | Commit signatures stay verified after the key changes ([changelog](https://github.blog/changelog/2024-12-10-persistent-commit-signature-verification-is-generally-available/)). | Add a "Verified" mark on graph nodes using `Commit.signature`. |
| P-17 | P2 | GitHub's own Network graph only shows the 100 most recently pushed branches ([docs](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/understanding-connections-between-repositories)). | Lead with this: GNE has no 100-branch cap. Add branch search and filters, and optionally fork branches. |
| P-18 | P2 | GHE.com data residency and GHES use different API hosts. | Make the OAuth, REST and GraphQL base URLs configurable, and turn features off per server type. |
| P-19 | P2 | GitHub Apps offer fine-grained, read-only permissions and expiring tokens ([changelog](https://github.blog/changelog/2026-10-13-github-app-improvements-for-least-privilege-and-management/)). The OAuth `repo` scope grants **write** access to every private repo. | Offer a read-only GitHub App login and keep OAuth as the fallback. |
| P-20 | P3 | `Commit.deployments` and the built-in "deployed" repository properties. | Add environment badges on commits. |
| P-21 | P3 | GitHub Insights added a table view and CSV/PNG export ([changelog](https://github.blog/changelog/2025-09-10-github-ruleset-exemptions-and-repository-insights-updates/)). | Add the same export to the code frequency views. |
| P-22 | P3 | Force-push activity in the new PR overview ([changelog](https://github.blog/changelog/2026-11-19-improvements-on-the-pull-request-overview-in-public-preview/)). | Show rewritten commits as ghost nodes on the graph. |

No 2024–2026 announcement retires or redesigns GitHub's own Network graph, Code frequency or Contributors pages.

## Feature ideas from the review

- **Open any public repo** by typing `owner/name`, plus server-side repo search. Today only repos you own and your orgs' repos are listed.
- **Fork network view.** The fork count is shown but forks aren't drawn.
- **Graph navigation:** search by SHA, message or author; a `?sha=` deep link; j/k keyboard navigation; a minimap; tag labels drawn on nodes.
- **Export:** SVG or PNG of the graphs; CSV or JSON of the analytics.
- **Large-repo mode:** a commit cap with progress and cancel, a Web Worker for layout, and canvas or virtualized rendering.
- **Compare view and stale-branch report** on the Branches page.

## Suggested order

1. **Hardening:** S-03 to S-07, B-01, P-01, P-02, P-03 and P-10. PR #31 already covers most of S-03 to S-08. Rebase it on this PR and fix its lockfile (see the PR description).
2. **Correctness and cost:** B-02 to B-05, P-06, P-07, P-09 and P-12, plus tests (Q-01).
3. **Features:** P-05 rulesets, P-08 stacks, P-17 branch scale, then the P2 and P3 items.
