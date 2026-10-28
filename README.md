# Rabbit Hole

A Wikipedia speedrunning browser game. Race from one article to another using only links inside Wikipedia articles.

**Created and primarily coded by [Mochaslatte](https://github.com/Mochaslatte).**

## Play

[Play Rabbit Hole](https://mochaslatte.github.io/wikidash/)

## Features

- Choose a start and target article, or generate a random route.
- Track elapsed time, clicks, and personal bests.
- Challenge friends with shareable routes and peer-to-peer party races.
- Request a suggested short route after finishing or giving up.
- Switch between light, dark, and system appearance.

## Project structure

```text
index.html          Page structure
css/style.css       Layout and component styling
css/themes.css      Appearance themes
js/settings.js      Theme preference handling
js/game.js          Game logic, Wikipedia integration, multiplayer, route solver
assets/favicon.png  Pixel-art icon
```

## Development

Open `index.html` in a browser, or run a local static server (for example `python -m http.server 8000`) and visit the local address. An internet connection is needed for Wikipedia and PeerJS.

## Publishing updates

Upload **the contents of this folder** (not the outer folder itself) to the root of your GitHub repository. In **Settings → Pages**, deploy from the `main` branch and `/ (root)`. Keep the relative paths unchanged.

## Credits

- Created and primarily coded by **Mochaslatte**.
- Wikipedia article content from Wikipedia contributors; article text is available under applicable [CC BY-SA](https://creativecommons.org/licenses/by-sa/4.0/) terms.
- Multiplayer uses [PeerJS](https://peerjs.com/).
- New favicon designed with AI assistance.

Rabbit Hole is independent and not affiliated with or endorsed by Wikimedia.

## License

See [LICENSE](LICENSE) for the project's source-code license. Wikipedia article content and third-party dependencies retain their own licenses.
