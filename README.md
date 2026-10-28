<div align="center">

# RABBIT HOLE

### The Wikipedia Speedrun Game

**One starting article. One destination. How fast can you get there?**

[![Play Rabbit-hole](https://img.shields.io/badge/PLAY-RABBIT-HOLE-3366cc?style=for-the-badge)](https://mochaslatte.github.io/rabbit-hole/)
[![GitHub Pages](https://img.shields.io/badge/Hosted_on-GitHub_Pages-222222?style=for-the-badge&logo=github)](https://mochaslatte.github.io/wikidash/)
[![Vanilla JavaScript](https://img.shields.io/badge/Built_with-Vanilla_JavaScript-315ea8?style=for-the-badge)](#tech-stack)

[Play the game](https://mochaslatte.github.io/wikidash/) · [How to play](#how-to-play) · [Features](#features) · [Credits](#credits)

---

</div>

## ABOUT

**Rabbit-hole** is a browser-based Wikipedia speedrunning game. Start on one Wikipedia article and navigate to a target article using only the links inside the articles. Try to finish with the **fewest clicks** and the **fastest time**.

No installation is needed to play: open the site in your browser and start a run.

## HOW TO PLAY

1. Enter a **start article** and a **target article**, or choose **Random route**.
2. Select **Start the clock**.
3. Navigate by clicking the available links within Wikipedia articles.
4. Reach the target and compare your time and number of clicks.
5. Challenge friends to try the same route.

> **Tip:** The game timer pauses while articles load, so the run measures navigation time rather than network delays.

## FEATURES

| Feature | Description |
| :-- | :-- |
| Wikipedia navigation | Move between real Wikipedia articles through in-article links. |
| Speedrun timer | Track completion time with centisecond display. |
| Click counter and log | See how many links you've followed and the route you've taken. |
| Random routes | Generate a new start and target from a curated pool. |
| Personal bests | Save your best time for each route in your browser. |
| Multiplayer parties | Create or join peer-to-peer parties to race friends. |
| Challenge links | Share the same start and target with someone else. |
| Route finder | After a run, search for a short route between articles. |
| Appearance settings | Choose a light or dark interface, where supported by the current build. |


## RUN LOCALLY

This is a static web project. To view it locally:

1. Download or clone the repository.
2. Keep the folders and filenames in the structure shown above.
3. Open `index.html` in a browser, or serve the folder with a local web server.

For example, with Python installed:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

> An internet connection is required for Wikipedia content and the external service used by multiplayer parties.

## TECH STACK

- **HTML5** — page structure
- **CSS3** — styling and responsive layout
- **JavaScript** — gameplay, navigation, and browser storage
- **Wikipedia / MediaWiki API** — article search and content
- **PeerJS** — peer-to-peer multiplayer connections
- **GitHub Pages** — static site hosting

## CREDITS

**Created and primarily coded by [Mochaslatte](https://github.com/Mochaslatte).**

Original game concept, design, and development.

Rabbit-hole uses content from **Wikipedia**, available under the applicable Creative Commons Attribution-ShareAlike terms, and **PeerJS** for multiplayer connectivity. Rabbit-hole is an independent project and is not affiliated with or endorsed by the Wikimedia Foundation.

## LINKS

**Play:** https://mochaslatte.github.io/rabbit-hole/  
**Source:** https://github.com/Mochaslatte/rabbit-hole

---

<div align="center">


</div>
