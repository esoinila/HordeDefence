# 🗺️ Roadmap

[← Back to README](../README.md) | [Vision →](VISION.md)

---

## Current Status

The game runs as an **ASP.NET Core (.NET 10)** web application. The server does nothing beyond serving static files. All game logic is in [`wwwroot/js/game.js`](../wwwroot/js/game.js).

A standalone **`index.html`** also lives at the repo root, making the game playable directly from GitHub Pages with no server required.

---

## Phase 1 — GitHub Pages Migration (Static Frontend) ✅

**Status**: Implemented.

A self-contained [`index.html`](../index.html) at the repo root combines the layout and game page into a single static file with relative paths to `wwwroot/css/site.css` and `wwwroot/js/game.js`. No build step or server is required.

A GitHub Actions workflow ([`.github/workflows/pages.yml`](../.github/workflows/pages.yml)) automatically deploys to GitHub Pages on every push to `main`. The workflow:
1. Checks out the repo
2. Copies `index.html`, `wwwroot/css/`, `wwwroot/js/`, and `favicon.ico` into a clean `_site/` staging directory
3. Uploads and deploys to the `github-pages` environment

**To enable hosting**: go to the repository **Settings → Pages**, set the source to **GitHub Actions**.

### Result

Anyone can play the game at `https://<username>.github.io/HordeDefence/` with no server, no cost, and no account required.

---

## Phase 2 — Local Highscores with Checksum ✅

**Status**: Implemented.

Scores are saved to **`localStorage`** under the key `hordeDefenceScores` at the end of every wave (win or loss). Each entry contains:

```json
{
  "victory": true,
  "maxHorde": 60,
  "kills": 60,
  "suppliesLeft": 812,
  "timestamp": "2026-04-09T17:00:00.000Z",
  "checksum": "a3f9..."
}
```

The **checksum** is a SHA-256 hash (via `crypto.subtle.digest`) of the score fields plus a fixed application token embedded in `game.js`. This deters lazy manual editing of the JSON in DevTools without knowing the algorithm.

A **🏆 Highscores** panel in the sidebar shows the top 10 scores, sorted by victories first, then wave difficulty (`maxHorde`), then kills. An **Export 📤** button saves scores as a `horde-defence-scores.json` file that can be shared alongside a scenario export.

Since players own the code, the social contract is:
> *"You can cheat if you want to — but why would you? The fun is in the design, not the score."*

---

## Phase 3 — Community Scenarios

**Goal**: Make it easy to share interesting defense layouts.

- The Export/Import feature already exists. The next step is a simple **gallery page** (static HTML) where community members can submit scenario JSON files via pull request.
- Each scenario in the gallery shows: a screenshot, the wave size it was tested against, and the result (victory/defeat).

---

## Ideas Backlog

These are unplanned but worth capturing:

- **Replay system**: Record the random seed and horde spawn sequence so a run can be exactly replayed or shared
- **Sandbox/editor mode**: Place terrain features manually, not just defenses
- **Wave customization**: Sliders for wave size, horde speed, spawn rate before launching
- **Mobile support**: Touch events for the canvas interactions
- **Sound effects**: Simple procedural audio (Web Audio API, no assets needed)
- **New defense types**: Ideas welcome via issues/PRs

---

[← Back to README](../README.md) | [Vision →](VISION.md)
