# 🤝 Contributing to Horde Defence

Thanks for your interest in contributing! This project is designed to be tinkered with — whether you're a seasoned developer or someone experimenting with AI coding tools for the first time.

---

## 🍴 The Recommended Way: Fork It

The best way to contribute — or just have fun — is to **fork this repo and make it your own**.

1. Click **Fork** on the GitHub repo page
2. Enable **GitHub Pages** in your fork: Settings → Pages → Source: **GitHub Actions**
3. Your game is live at `https://<your-username>.github.io/HordeDefence/`
4. Edit [`wwwroot/js/game.js`](wwwroot/js/game.js) — the entire game lives in this single file
5. Push your changes and watch them go live automatically

### AI-Assisted "Vibe Coding"

The single-file game engine (~1,900 lines of plain JavaScript) fits inside a single AI context window. You can paste the file into your favorite AI coding assistant and ask it to:

- Add a new defense type
- Rebalance wave difficulty
- Reskin the game with a different theme
- Add sound effects or new mechanics

See the [Vision document](docs/VISION.md) for more on this workflow.

---

## 🔄 Contributing Back (Pull Requests)

If you've built something you think would improve the base game, pull requests are welcome! Here's how:

1. Fork the repository
2. Create a feature branch (`git checkout -b my-new-defense`)
3. Make your changes
4. Test locally — open `index.html` in a browser or run `dotnet run`
5. Push to your fork and open a Pull Request

### Guidelines

- **Don't break the game** — make sure the game loads and plays correctly after your changes
- **Keep it simple** — the single-file structure is intentional; avoid adding build tools, frameworks, or npm dependencies
- **Be kind** — follow the [Code of Conduct](CODE_OF_CONDUCT.md)

---

## 🐛 Reporting Bugs

Found something broken? Open an [issue](../../issues) with:

- What you expected to happen
- What actually happened
- Browser and OS you're using
- A screenshot if it helps

---

## 💡 Suggesting Features

Have an idea? Open an [issue](../../issues) and tag it as a feature request. Even better, try building it in your fork first — you might surprise yourself!

---

## 📜 License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
