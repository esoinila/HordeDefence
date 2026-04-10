# 🎯 Vision & Philosophy

[← Back to README](../README.md) | [Roadmap →](ROADMAP.md)

---

## The Core Idea: Calm Auto-Play

Horde Defence is deliberately designed to be **played without any action during the battle phase**. You think, you build, you click "Launch Horde" — then you watch.

This makes the game something you can:
- Share a screenshot of your layout and say *"guess how many survive"*
- Run in the background while doing something else
- Play in a relaxed state, like a puzzle you solve before the timer starts

The fun is entirely in the **Entrenchment Phase**: deciding where to put trenches to funnel the horde, where to position Maxim guns so their fields of fire cover the lanes, and which combination of defenses synergizes best (e.g. Generator + Wire for electrified fences, or Oil + Maxim bullets for a fire trap).

---

## AI-Assisted Development: The Other Game

There is a **second game** hidden inside this project — the game of improving the game itself.

The developer found that using AI coding assistants (such as **Google Gemini** and other AI tools with long-context reasoning) to iteratively extend and rebalance the game was *more fun than playing the finished product alone*. The feedback loop of:

1. Noticing something that would be cool
2. Describing it to an AI
3. Watching it appear in the game in minutes
4. Immediately playtesting it

...is genuinely entertaining in its own right. The single-file structure of the game ([`wwwroot/js/game.js`](../wwwroot/js/game.js), ~1,800 lines of plain JavaScript) was no accident — it keeps the entire game within a single AI context window, making AI-assisted iteration fast and reliable.

The vision is that **anyone with access to an AI coding tool should be able to fork this repo and make it their own** — reskinning it, adding new defense types, rebalancing waves, or adding entirely new mechanics — without needing deep programming expertise.

---

## Why Open Source?

This kind of game is more fun when it's a **community object**. Different people will make different creative choices — some will go for historical accuracy (WWI trench warfare aesthetic is already baked in), others will add sci-fi towers or fantasy creatures. The code is permissive enough to support all of these.

The single-file game engine also makes the codebase **approachable for beginners**. There are no build pipelines, no npm, no frameworks — just a JavaScript file you can open and read from top to bottom.

---

## What the Backend Was For

Currently the project runs as an ASP.NET Core application. The server's only real job is serving static files. This was the starting point for the project (a default Razor Pages template), but it was never used for any meaningful server-side logic.

The one thing a backend *could* provide is **score tracking** — persisting high scores somewhere players can't easily tamper with. However, given that:

- Players own the code (it's open source)
- There's no competitive matchmaking
- The spirit is casual and creative, not competitive

...a lightweight solution like **local JSON storage with a hash checksum** is probably good enough to deter casual cheating while keeping the project fully serverless. See the [Roadmap](ROADMAP.md) for details.

---

[← Back to README](../README.md) | [Roadmap →](ROADMAP.md)
