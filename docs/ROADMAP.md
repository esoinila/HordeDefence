# 🗺️ Roadmap

[← Back to README](../README.md) | [Vision →](VISION.md)

---

## Current Status

The game runs as an **ASP.NET Core (.NET 10)** web application. The server does nothing beyond serving static files. All game logic is in [`wwwroot/js/game.js`](../wwwroot/js/game.js).

---

## Phase 1 — GitHub Pages Migration (Static Frontend)

**Goal**: Make the game hostable for free on GitHub Pages so it can be shared without any server infrastructure.

### What needs to change

The current HTML entry point is a Razor Page (`Pages/Index.cshtml`) rendered by ASP.NET Core. To host on GitHub Pages, the game needs to be a plain static HTML file.

**Steps**:
1. Create a `gh-pages` branch (or configure GitHub Pages to serve from `docs/` or a dedicated `static/` folder on `main`).
2. Extract the game HTML from `Pages/Index.cshtml` into a standalone `index.html` file, replacing Razor-specific syntax (e.g. `asp-append-version`, `@section Scripts`) with plain HTML equivalents.
3. Copy all assets from `wwwroot/` into the same folder as `index.html` (or adjust relative paths).
4. Add a GitHub Actions workflow that automatically builds and publishes to GitHub Pages on every push to `main`.

### What stays the same

- `wwwroot/js/game.js` — the entire game engine, unchanged
- `wwwroot/css/site.css` — styling, unchanged
- Bootstrap is already loaded from CDN, so no bundling needed

### Result

Anyone can play the game at `https://<username>.github.io/HordeDefence/` with no server, no cost, and no account required.

---

## Phase 2 — Local Highscores with Checksum

**Goal**: Give players a lightweight score-tracking system that lives on their own machine, without requiring a server.

### Design

Scores are saved as a **JSON file** in the browser using the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) or `localStorage` as a fallback.

Each score entry contains:

```json
{
  "wave": 5,
  "maxHorde": 202,
  "kills": 202,
  "supplies": 1437,
  "timestamp": "2026-04-09T17:00:00Z",
  "checksum": "a3f9..."
}
```

The **checksum** is a hash (e.g. SHA-256) computed from the score fields and a fixed application secret embedded in the game's JavaScript. This is not cryptographically strong security — anyone who reads the source code can compute a valid checksum — but it deters **lazy cheating** (manually editing the JSON file without knowing the algorithm).

Since players own the code, the social contract is:
> *"You can cheat if you want to — but why would you? The fun is in the design, not the score."*

### Export / Import

The existing Export/Import feature (already in the game for scenarios) can be extended to cover highscores. Players can share their score files as proof-of-run alongside their scenario JSON.

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
