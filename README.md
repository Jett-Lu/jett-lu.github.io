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

On `experinmentalm`, all five games have pixel-art Three.js scenes filling flat carousel frames. Score displays share the portfolio's Arial font. Portfolio sections retain their 2D layout.

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

`racing-portal.js` owns the racing view and `arcade-portal.js` owns the other four views; `script.js` owns gameplay and controls. Reusable model pools and instanced voxel geometry limit allocation and draw calls. Three.js 0.186.1 and its MIT license are in `vendor/three/`. The JavaScript files are jsDelivr's Terser-minified copies of the versioned npm build; the core is stored as `three.core.js` to match the module's relative import. Their bytes were compared against the recorded CDN URLs, and the license against npm's integrity-verified archive. `vendor/three/provenance.json` records the sources and SHA-256 checksums. All scene models and textures are generated locally; no external model assets are required.

## Verification

Use Node.js 24 or newer for the development checks (no package installation required):

```sh
node scripts/verify.mjs
node --test tests/*.test.mjs
git diff --check
```

The static verifier checks JavaScript syntax, HTML IDs, local links/assets, ARIA references, module imports, and vendored dependency integrity. The regression suite covers GitHub loading failures and validation, game input and physics, scores, and renderer lifecycle/colour identity. Renderer unit tests use real scene geometry with a fake graphics driver; browser checks are still required for actual WebGL output.

There is no TypeScript compiler, linter configuration, package install, or generated production bundle. The HTML/CSS/JavaScript served locally are the production files. After editing, run the checks above and use the local HTTP server to check:

- All five games: select, Help, Play, controls, pause after scrolling/leaving the tab, retry and Back.
- Keyboard focus, Help dismissal, section links, mobile menu, and project refresh.
- Desktop, tablet, narrow phones and landscape; console errors and failed requests.
- Reduced-motion and WebGL-disabled/context-loss fallback when changing renderers.

## Deployment and external services

Publish the desired branch's repository root with GitHub Pages and enable HTTPS in the repository's Pages settings. The experimental branch is not automatically the published branch. No environment variables, secrets, API keys or backend are needed. Keep `vendor/three/`, the icons and `Resume_JettLu.pdf` with the root files. Update the HTML/module version query strings when changing cached CSS or JavaScript.

Projects use GitHub's public REST API, with request timeouts and optional session caching. API failures or rate limits show a useful fallback; a failed refresh retains existing cards. High scores use optional local storage and remain usable if storage is blocked. Never add a GitHub token to the browser code.

The page's meta Content Security Policy restricts scripts and API connections. The `frame-ancestors` directive requires an HTTP response header and cannot be enforced by a meta tag; use a host/proxy with configurable response headers if embedding protection is required. See [MDN's frame-ancestors reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors).

## Goals and Design Philosophy

- Keep the site simple, fast, and easy to maintain
- Avoid unnecessary frameworks or build tooling
- Prioritize accessibility, readability, and clean structure
- Serve as a clear entry point to projects and technical work

## License

This project is licensed under the MIT License.
