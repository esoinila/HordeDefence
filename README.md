# 🏰 Horde Defence

A calm, browser-based tower-defense game where you build defenses during an **Entrenchment Phase** and then sit back to watch the battle play out on its own — no reflexes required.

Play from here: https://esoinila.github.io/HordeDefence/

> **"Build your defenses, launch the horde, and enjoy the chaos."**

---

## 🎮 What is this?

Horde Defence is a **single-page strategy game** built on an HTML5 canvas. You spend supplies to place defenses on a 20×20 grid around your central Castle Keep. Once you launch the wave, the game plays itself: enemies path-find their way toward the castle, get slowed by wire, eaten by moats, and shredded by Maxim guns — all without any input from you.

The gameplay loop is deliberately calm and satisfying to watch. Think of it as a **puzzle game** where the fun is in designing the layout, not in fast reactions.

### Current Defense Arsenal

| Defense | Cost | Effect |
|---|---|---|
| 🟫 Trench | 20 | Blocks pathing, forces horde to attack it |
| ➰ Wire | 30 | Slows the horde; electrifiable by a Generator |
| 🔫 Maxim Gun | 150 | Auto-targeting turret, piercing bullets |
| 🐊 Moat | 80 | Consumes 5 horde members before becoming a bridge |
| 🛢️ Oil | 30 | Makes horde slip and spin; ignitable by bullets |
| ⚡ Generator | 80 | Electrifies adjacent Wire |
| 🎯 Decoy | 150 | Lures horde attention away from the Keep |
| 💥 Claymore | 60 | Directional mine; detonates on mass movement + smoke |

---

## 🛠️ Current Tech Stack

The game is currently served as an **ASP.NET Core (.NET 10) Razor Pages** application. The server does nothing except deliver the static HTML/JS — all game logic runs in the browser.

- **Frontend**: Vanilla JavaScript + HTML5 Canvas
- **Styling**: Bootstrap 5.3 + custom CSS
- **Backend**: ASP.NET Core (purely a static file server today)

---

## 📖 Documentation

| Document | Description |
|---|---|
| [Vision & Philosophy](docs/VISION.md) | Why the game was built, the calm auto-play concept, and AI-assisted development |
| [Roadmap](docs/ROADMAP.md) | Planned migration to GitHub Pages, open-source hosting, and local highscores |

---

## 🚀 Running Locally

```bash
dotnet run
```

Then open `https://localhost:5001` (or the port shown in the terminal).

---

## 🤝 Contributing

This project is designed to be tinkered with. The entire game lives in one file — [`wwwroot/js/game.js`](wwwroot/js/game.js) — making it easy to extend with AI coding tools. See the [Vision document](docs/VISION.md) for the spirit of how this project is meant to grow.
