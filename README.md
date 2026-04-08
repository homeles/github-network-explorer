# GitHub Network Explorer — Demo

Live demo of [GitHub Network Explorer](https://github.com/homeles/github-network-explorer) using the public GitHub API.

**🌐 [View Demo](https://homeles.github.io/github-network-explorer/)**

## About

This is a standalone static site that showcases the app using live data from the `homeles/github-network-explorer` repository. No authentication required — it calls GitHub's public REST API directly from the browser.

### Features
- **Commit Graph** — Interactive DAG visualization with branch selector
- **Network Graph** — Multi-branch network view
- **Branches** — Sortable/filterable branch list with ahead/behind counts
- **Code Frequency** — Time series chart + contributor breakdown

### Limitations
- Public API rate limit: 60 requests/hour per IP
- Data is live but limited to this repo only
- No directory treemap or top files (would burn through rate limits)

## Development

```bash
pnpm install
pnpm dev
```

## How it stays in sync

This branch is automatically updated by a workflow on `main` whenever changes are pushed. The workflow copies updated components from `main:client/src/` and rebuilds the demo.
