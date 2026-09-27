# Jett Lu

Personal portfolio website showcasing projects, technical interests, and background in software engineering.  
Built with HTML, CSS, and JavaScript, and hosted via GitHub Pages.

Live site: https://jett-lu.github.io

## Overview

This site serves as a central hub for presenting my work, experience, and technical focus areas.  
It uses HTML, CSS, and vanilla JavaScript, emphasizing clarity, accessibility, and maintainability. The experimental arcade games use locally bundled Three.js renderers.

## Features

- Responsive, mobile-friendly single-page layout
- Interactive JavaScript-based arcade games demonstrating frontend logic
- Direct links to resume, GitHub, and contact information
- Clean, minimal design focused on readability and usability
- Deployed using GitHub Pages for simplicity and reliability

## Tech Stack

- HTML5
- CSS3
- Vanilla JavaScript and Three.js (experimental arcade)
- GitHub Pages (hosting)

## Local Development

Serve the repository over HTTP so the arcade's JavaScript modules can load:

```sh
python -m http.server 8765 --bind 127.0.0.1
```

Open http://127.0.0.1:8765. There is no build step or runtime CDN dependency.

## Experimental 3D Pixel Arcade

On `experinmentalm`, all five games have pixel-art Three.js scenes filling flat carousel frames, with ASCII-style score displays. Portfolio sections retain their 2D layout.

- **Asteroids:** a voxel ship, layered stars, and rotating faceted rocks.
- **Space Invaders:** four colourful rows of voxel aliens and a pixel ship.
- **Racing:** a sunset skyline, palm-lined three-lane road, and solid cars.
- **Brick Breaker:** raised rainbow bricks, a faceted ball, and a cyan-tipped paddle.
- **Snake:** a gridded green board, blocky snake, and red pixel fruit.

- Press **Play**, then use left/right arrow keys or the two sides of the game. Racing changes lanes, Asteroids rotates, Invaders and Brick Breaker move horizontally, and Snake turns relative to its current direction. **Help** describes each game.
- Press an arrow key or tap the game after game over to restart. **Back** returns to the carousel.
- The existing score storage, Help, and scroll-to-pause behavior are preserved.
- Moving the mouse over the selected preview gently shifts perspective, like looking into a small diorama. The camera returns to centre on mouse leave and stays fixed during gameplay. Touch input and reduced-motion preferences disable this effect.
- Only the selected preview animates, at up to 30 fps; offscreen and reduced-motion previews stay still. Each scene renders at a fixed 160 × 240 resolution with crisp pixel scaling, including on high-DPI screens. Attract screens illustrate the games without advancing their simulations.
- If WebGL cannot initialize or its context is lost, the original 2D renderer remains available.

`racing-portal.js` owns the racing view and `arcade-portal.js` owns the other four views; `script.js` owns gameplay and controls. Reusable model pools and instanced voxel geometry limit allocation and draw calls. Three.js 0.186.1 and its MIT license are in `vendor/three/`. The upstream minified core is stored as `three.core.js` to match the module's relative import. All scene models and textures are generated locally; no external model assets are required.

## Goals and Design Philosophy

- Keep the site simple, fast, and easy to maintain
- Avoid unnecessary frameworks or build tooling
- Prioritize accessibility, readability, and clean structure
- Serve as a clear entry point to projects and technical work

## License

This project is licensed under the MIT License.
