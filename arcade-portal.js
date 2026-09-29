import * as THREE from "./vendor/three/three.module.min.js";

// These views consume the original game states. Collision, input, scoring and
// restart logic remain in script.js, and its canvas is the WebGL fallback.
export function createArcadePortal(canvas, kind) {
  const builders = { asteroids: buildAsteroids, invaders: buildInvaders, brick: buildBrick, snake: buildSnake };
  if (!builders[kind]) throw new Error(`Unknown arcade scene: ${kind}`);
  const panel = canvas.parentElement;
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(1);
  renderer.setSize(160, 240, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "arcade-webgl";
  renderer.domElement.setAttribute("aria-hidden", "true");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(kind === "snake" ? 0x061510 : 0x070b1b);
  // An open scene behind the flat frame, with no visible recess walls.
  // Both modes use the same centred camera and object scale.
  const camera = new THREE.PerspectiveCamera(36, 2 / 3, 50, 2400);
  scene.add(new THREE.HemisphereLight(0xd5e7ff, 0x283048, 2));
  const light = new THREE.DirectionalLight(0xffead1, 3);
  light.position.set(-250, 400, 600); scene.add(light);
  const fill = new THREE.DirectionalLight(0x537bff, 1.2);
  fill.position.set(300, -100, 250); scene.add(fill);

  const geometries = new Set();
  const materials = new Set();
  const geometry = (value) => { geometries.add(value); return value; };
  const material = (value) => { materials.add(value); return value; };
  const cube = geometry(new THREE.BoxGeometry(1, 1, 1));
  const paint = (color) => material(new THREE.MeshLambertMaterial({ color, flatShading: true }));
  const unlit = (color) => material(new THREE.MeshBasicMaterial({ color }));
  const scratch = new THREE.Object3D();
  function box(parent, size, position, mat) {
    const mesh = new THREE.Mesh(cube, mat);
    mesh.scale.set(...size); mesh.position.set(...position); parent.add(mesh);
    return mesh;
  }
  function place(mesh, x, y, z = 12) { mesh.position.set(x - 200, 300 - y, z); }
  function instances(mat, capacity) {
    const mesh = new THREE.InstancedMesh(cube, mat, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  }
  function stamp(mesh, index, x, y, z, width, height, depth, angle = 0) {
    scratch.position.set(x - 200, 300 - y, z);
    scratch.scale.set(width, height, depth);
    scratch.rotation.set(0, 0, angle);
    scratch.updateMatrix(); mesh.setMatrixAt(index, scratch.matrix);
  }
  function finish(mesh, count) { mesh.count = count; mesh.instanceMatrix.needsUpdate = true; }

  function voxelSprite(rows, palette, unit = 2) {
    const group = new THREE.Group();
    Object.entries(palette).forEach(([symbol, mat]) => {
      const pixels = [];
      rows.forEach((row, y) => [...row].forEach((pixel, x) => {
        if (pixel === symbol) pixels.push([(x - (row.length - 1) / 2) * unit, ((rows.length - 1) / 2 - y) * unit]);
      }));
      const mesh = new THREE.InstancedMesh(cube, mat, pixels.length);
      pixels.forEach(([x, y], i) => {
        scratch.position.set(x, y, 0); scratch.rotation.set(0, 0, 0);
        scratch.scale.set(unit, unit, unit * 2.5); scratch.updateMatrix();
        mesh.setMatrixAt(i, scratch.matrix);
      });
      group.add(mesh);
    });
    return group;
  }

  const white = paint(0xb8dafa), blue = paint(0x2478c7), dark = paint(0x111d39);
  const cyan = unlit(0x69e8ff);
  function ship() {
    const group = voxelSprite([
      ".....W.....", ".....W.....", "....WWW....", "....WBW....",
      "....WBW....", "...WWBWW...", "..WWWBWWW..", ".WWWWBWWWW.",
      "WWDWWBWWDWW", "WWDWWBWWDWW", "...C...C...", "...C...C..."
    ], { W: white, B: blue, D: dark, C: cyan });
    return group;
  }

  // A seeded, layered star field stays stable between frames and restarts.
  function stars() {
    const mesh = instances(unlit(0xffffff), 125);
    const colors = [0x3b547a, 0x5389ac, 0x94d4ed, 0xf5cebf];
    let seed = 7421;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 125; i++) {
      const size = i % 17 === 0 ? 3 : 1.5;
      stamp(mesh, i, random() * 540 - 70, random() * 780 - 90, -80 - random() * 180, size, size, size);
      mesh.setColorAt(i, new THREE.Color(colors[i % colors.length]));
    }
    finish(mesh, 125);
    return mesh;
  }

  function board(color, gridColor, cell) {
    box(scene, [400, 600, 4], [0, 0, -6], paint(color));
    const grid = unlit(gridColor);
    // At 160px wide, thinner geometry falls between pixels and looks broken.
    for (let x = 0; x <= 400; x += cell) box(scene, [3, 600, 0.5], [x - 200, 0, -3.5], grid);
    for (let y = 0; y <= 600; y += cell) box(scene, [400, 3, 0.5], [0, y - 300, -3.5], grid);
    const edge = unlit(kind === "snake" ? 0x326c50 : 0x3b5275);
    for (const x of [-200, 200]) box(scene, [3, 600, 1], [x, 0, -3], edge);
    for (const y of [-300, 300]) box(scene, [400, 3, 1], [0, y, -3], edge);
  }

  function buildAsteroids() {
    stars();
    const player = ship(); scene.add(player);
    const rockGeo = geometry(new THREE.IcosahedronGeometry(1, 0));
    const rockPaint = [paint(0x705963), paint(0x4b5779), paint(0x847066)];
    // Filtering a destroyed rock must not change the surviving rocks' paint
    // or rotation phase, even when they move into different pooled meshes.
    const rockStyles = new WeakMap();
    let nextRockStyle = 0;
    const rocks = Array.from({ length: 8 }, (_, i) => {
      const mesh = new THREE.Mesh(rockGeo, rockPaint[i % rockPaint.length]); scene.add(mesh); return mesh;
    });
    const shots = instances(cyan, 12);
    const demoRocks = [
      { x: 77, y: 164, r: 33 }, { x: 320, y: 126, r: 25 }, { x: 302, y: 307, r: 43 },
      { x: 80, y: 347, r: 38 }, { x: 308, y: 515, r: 30 }, { x: 70, y: 535, r: 28 }
    ];
    const demoShots = [180, 265, 342].map(y => ({ x: 200, y, angle: -Math.PI / 2 }));
    return (state, preview, time) => {
      place(player, preview ? 200 : state.shipX, preview ? 453 : state.shipY);
      player.rotation.z = preview ? 0 : -state.angle - Math.PI / 2;
      player.scale.setScalar(state.shipScale ?? 2.1);
      const items = preview ? demoRocks : state.rocks;
      rocks.forEach((mesh, i) => {
        const rock = items[i]; mesh.visible = Boolean(rock);
        if (!rock) return;
        if (!rockStyles.has(rock)) rockStyles.set(rock, nextRockStyle++);
        const style = rockStyles.get(rock);
        mesh.material = rockPaint[style % rockPaint.length];
        place(mesh, rock.x, rock.y, 4);
        mesh.scale.setScalar(rock.r);
        mesh.rotation.set(style * 0.7 + time * 0.08, style * 0.3 + time * 0.05, style);
      });
      const bullets = preview ? demoShots : state.bullets;
      bullets.slice(0, 12).forEach((bullet, i) => stamp(shots, i, bullet.x, bullet.y, 12, 4, 12, 2.5, -bullet.angle - Math.PI / 2));
      finish(shots, Math.min(bullets.length, 12));
    };
  }

  function buildInvaders() {
    stars();
    const player = ship(); scene.add(player);
    const patterns = [
      ["..X.....X..", "...X...X...", "..XXXXXXX..", ".XX.XXX.XX.", "XXXXXXXXXXX", "X.XXXXXXX.X", "X.X.....X.X", "...XX.XX..."],
      ["...XXXXX...", ".XXXXXXXXX.", "XXXXXXXXXXX", "XXX..X..XXX", "XXXXXXXXXXX", "..XX...XX..", ".XX.XXX.XX.", "X.........X"]
    ];
    const rowPaint = [0xf45861, 0xffc83d, 0x6de349, 0x8570fa].map(paint);
    // All cubes of a sprite share geometry/material; model pools are reused.
    const aliens = Array.from({ length: 20 }, (_, i) => {
      const group = voxelSprite(patterns[Math.floor(i / 5) % 2], { X: rowPaint[Math.floor(i / 5)] });
      scene.add(group); return group;
    });
    const shots = instances(cyan, 12);
    const demoShots = [{ x: 200, y: 364 }, { x: 200, y: 434 }];
    return (state, preview, time) => {
      place(player, preview ? 200 : state.shipX, preview ? 535 : state.shipY);
      player.scale.setScalar(state.shipScale ?? 1.8);
      aliens.forEach((mesh, i) => {
        const alien = state.aliens[i];
        // Gameplay shares the original illustrated formation and sprite size.
        const row = Math.floor(i / 5), col = i % 5;
        mesh.visible = preview || Boolean(alien?.alive);
        if (!mesh.visible) return;
        place(mesh, preview ? 70 + col * 65 + Math.sin(time * 0.5) * 5 : alien.x,
          preview ? 152 + row * 51 : alien.y);
        mesh.scale.setScalar(state.alienScale ?? 1.65);
      });
      const bullets = preview ? demoShots : state.bullets.filter(bullet => !bullet.dead);
      bullets.slice(0, 12).forEach((bullet, i) => stamp(shots, i, bullet.x, bullet.y, 12, 4, 12, 2.5));
      finish(shots, Math.min(bullets.length, 12));
    };
  }

  function buildBrick() {
    board(0x10172b, 0x1c2942, 40);
    const palette = [0xf14563, 0xff9d32, 0xe5d348, 0x45c49b, 0x697cf4].map(paint);
    const blocks = Array.from({ length: 45 }, (_, i) => {
      const group = new THREE.Group();
      box(group, [32, 20, 10], [0, 0, 0], palette[Math.floor(i / 9)]);
      box(group, [27, 2, 1], [0, 7, 5.6], unlit([0xffa1a5, 0xffd28a, 0xfff3a0, 0x9ef2bf, 0xbcb8ff][Math.floor(i / 9)]));
      scene.add(group); return group;
    });
    const paddle = new THREE.Group();
    box(paddle, [80, 12, 12], [0, 0, 0], white);
    box(paddle, [8, 12, 13], [-36, 0, 0], cyan);
    box(paddle, [8, 12, 13], [36, 0, 0], cyan);
    scene.add(paddle);
    const ball = new THREE.Mesh(geometry(new THREE.IcosahedronGeometry(7, 1)), white); scene.add(ball);
    const shadow = box(scene, [12, 10, 0.5], [0, 0, -2], unlit(0x050817));
    return (state, preview, time) => {
      blocks.forEach((mesh, i) => {
        const block = state.bricks[i]; mesh.visible = preview || Boolean(block?.alive);
        if (!mesh.visible) return;
        // These centers/sizes match the original brick collision boxes.
        place(mesh, preview ? 38 + i % 9 * 40 : block.x + 10,
          preview ? 145 + Math.floor(i / 9) * 30 : block.y - 8, 6);
      });
      place(paddle, preview ? 200 : state.paddleX + 40, 554, 8);
      const x = preview ? 235 + Math.sin(time * 0.6) * 28 : state.ballX;
      const y = preview ? 397 + Math.cos(time * 0.6) * 24 : state.ballY;
      place(ball, x, y, 14); place(shadow, x + 4, y + 5, -2);
    };
  }

  function buildSnake() {
    board(0x081d18, 0x12392a, 20);
    const segments = instances(paint(0x56dc4a), 600);
    const head = new THREE.Group();
    box(head, [18, 18, 14], [0, 0, 0], paint(0x9aef51));
    for (const y of [-5, 5]) {
      box(head, [5, 4, 1], [4, y, 7.6], white);
      box(head, [2, 3, 1], [5.5, y, 8.3], dark);
    }
    scene.add(head);
    const food = new THREE.Group();
    box(food, [14, 14, 12], [0, 0, 0], paint(0xee4357));
    box(food, [4, 4, 1], [-3, 3, 6.5], unlit(0xffa47e));
    box(food, [3, 5, 3], [1, 8, 3], paint(0x8acc67)); scene.add(food);
    const demo = [
      [8, 22], [8, 21], [8, 20], [8, 19], [9, 19], [10, 19], [11, 19],
      [12, 19], [12, 18], [12, 17], [12, 16], [12, 15], [11, 15], [10, 15],
      [9, 15], [8, 15], [7, 15], [7, 14], [7, 13], [7, 12], [8, 12], [9, 12]
    ].map(([x, y]) => ({ x, y }));
    return (state, preview, time) => {
      const body = preview ? demo : state.body;
      body.slice(1, 600).forEach((part, i) => {
        stamp(segments, i, part.x * 20 + 10, part.y * 20 + 10, 6, 18, 18, 12);
        segments.setColorAt(i, new THREE.Color(i % 2 ? 0xa6e78b : 0xffffff));
      });
      finish(segments, Math.max(0, Math.min(body.length - 1, 599)));
      if (segments.instanceColor) segments.instanceColor.needsUpdate = true;
      head.visible = body.length > 0;
      if (body.length) place(head, body[0].x * 20 + 10, body[0].y * 20 + 10, 8);
      head.rotation.z = preview ? -Math.PI / 2 : Math.atan2(-state.dirY, state.dirX);
      const target = preview ? { x: 13, y: 9 } : state.food;
      food.visible = Boolean(target);
      if (target) place(food, target.x * 20 + 10, target.y * 20 + 10, preview ? 9 + Math.sin(time * 1.5) * 2 : 9);
    };
  }

  const updateScene = builders[kind]();
  const hud = document.createElement("div"); hud.className = "arcade-hud";
  const score = document.createElement("div"), best = document.createElement("div");
  hud.append(score, best); panel.append(renderer.domElement, hud);
  canvas.classList.add("arcade-fallback");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let available = true, inView = true, lastState, lastOptions;
  let needsRedraw = true, wasPaused = false, sceneTime = 0;
  const pointer = new THREE.Vector2(), viewpoint = new THREE.Vector2();
  let lastTime = performance.now();

  function resetPointer() { pointer.set(0, 0); }
  function followPointer(event) {
    if (event.pointerType !== "mouse" || event.buttons || reducedMotion.matches ||
        !lastOptions?.preview || !panel.classList.contains("active")) { resetPointer(); return; }
    const rect = panel.getBoundingClientRect();
    pointer.set(THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1),
      THREE.MathUtils.clamp(1 - (event.clientY - rect.top) / rect.height * 2, -1, 1));
  }
  function redraw() { needsRedraw = true; if (lastState) render(lastState, lastOptions); }
  function visibilityChanged() { if (!document.hidden) redraw(); }
  function motionChanged() { resetPointer(); redraw(); }
  function contextLost(event) {
    event.preventDefault(); available = false; panel.classList.remove("has-arcade-portal");
    // Inactive previews are not in the animation loop, so redraw their fallback too.
    lastOptions?.onUnavailable?.();
  }
  function contextRestored() { available = true; redraw(); }
  panel.addEventListener("pointermove", followPointer, { passive: true });
  panel.addEventListener("pointerleave", resetPointer);
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  renderer.domElement.addEventListener("webglcontextrestored", contextRestored);
  reducedMotion.addEventListener("change", motionChanged);
  document.addEventListener("visibilitychange", visibilityChanged);
  const visibility = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; if (inView) redraw(); });
  visibility.observe(panel);

  function render(state, options = {}) {
    lastState = state; lastOptions = options;
    if (!available) return false;
    if (!inView || document.hidden) return true;
    const paused = !options.preview && Boolean(options.paused);
    if (paused && wasPaused && !needsRedraw) return true;
    const now = performance.now();
    const ease = 1 - Math.exp(-9 * Math.min((now - lastTime) / 1000, 0.1)); lastTime = now;
    if (options.preview && panel.classList.contains("active") && !reducedMotion.matches) viewpoint.lerp(pointer, ease);
    else { resetPointer(); viewpoint.set(0, 0); }
    camera.position.set(viewpoint.x * 31, viewpoint.y * 15.5, 1050);
    camera.lookAt(0, 0, 0);
    if (!paused) sceneTime = reducedMotion.matches ? 0 : options.time || 0;
    updateScene(state, Boolean(options.preview), sceneTime);
    const scoreText = `[ SCORE ${String(Math.floor(state.score)).padStart(5, "0")} ]`;
    const bestText = `[ BEST  ${String(Math.floor(state.high)).padStart(5, "0")} ]`;
    if (score.textContent !== scoreText) score.textContent = scoreText;
    if (best.textContent !== bestText) best.textContent = bestText;
    renderer.render(scene, camera);
    // A restored context may not draw until the tab is foregrounded. Keep
    // showing its 2D fallback until the first replacement frame is ready.
    panel.classList.add("has-arcade-portal");
    wasPaused = paused; needsRedraw = false;
    return true;
  }

  function dispose() {
    visibility.disconnect();
    panel.removeEventListener("pointermove", followPointer);
    panel.removeEventListener("pointerleave", resetPointer);
    reducedMotion.removeEventListener("change", motionChanged);
    document.removeEventListener("visibilitychange", visibilityChanged);
    renderer.domElement.removeEventListener("webglcontextlost", contextLost);
    renderer.domElement.removeEventListener("webglcontextrestored", contextRestored);
    scene.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    renderer.dispose(); renderer.domElement.remove(); hud.remove();
    panel.classList.remove("has-arcade-portal"); canvas.classList.remove("arcade-fallback");
    available = false;
  }
  return { render, dispose, get visible() { return inView; }, get available() { return available; } };
}
