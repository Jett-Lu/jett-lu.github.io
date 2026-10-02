import * as THREE from "./vendor/three/three.module.min.js";

// A self-contained 3D view. The existing arcade controller owns input, score,
// collisions and pause/restart; this module only renders that game state.
export function createRacingPortal(canvas) {
  const panel = canvas.parentElement;
  // Render a small, fixed pixel grid, then enlarge it with nearest-neighbour
  // scaling. High-DPI screens must not smooth away the pixel-art treatment.
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(1);
  renderer.setSize(160, 240, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.className = "racing-webgl";
  renderer.domElement.setAttribute("aria-hidden", "true");

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x9a3264, 48, 160);
  const camera = new THREE.PerspectiveCamera(56, 2 / 3, 0.1, 300);
  camera.position.set(0, 6.5, 19);
  camera.lookAt(0, 1.7, -18);

  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const geometry = (g) => { geometries.add(g); return g; };
  const material = (m) => { materials.add(m); return m; };
  const texture = (t) => {
    textures.add(t);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.NearestFilter;
    t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    return t;
  };
  const cube = geometry(new THREE.BoxGeometry(1, 1, 1));
  const plane = geometry(new THREE.PlaneGeometry(1, 1));
  const paint = (color, extra = {}) => material(new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }));
  const unlit = (color, extra = {}) => material(new THREE.MeshBasicMaterial({ color, ...extra }));

  function box(parent, dimensions, position, mat) {
    const mesh = new THREE.Mesh(cube, mat);
    mesh.scale.set(...dimensions);
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  }

  function canvasTexture(width, height, draw) {
    const image = document.createElement("canvas");
    image.width = width; image.height = height;
    draw(image.getContext("2d"), width, height);
    return texture(new THREE.CanvasTexture(image));
  }

  // The sky stays behind actual geometry, so the road, traffic and skyline
  // all retain perspective and occlude each other correctly.
  scene.background = canvasTexture(160, 240, (ctx, w, h) => {
    const colors = ["#090c20", "#14122e", "#231639", "#3b204b", "#672953", "#a83b61", "#e96570", "#ff9c7d", "#64304e", "#272139"];
    const bandHeight = h / colors.length;
    for (let y = 0; y < h; y++) {
      const band = Math.floor(y / bandHeight);
      ctx.fillStyle = colors[band]; ctx.fillRect(0, y, w, 1);
      // A short checkerboard transition evokes a restricted arcade palette.
      if (band > 0 && y % bandHeight < 5) {
        ctx.fillStyle = colors[band - 1];
        for (let x = y % 2; x < w; x += 2) ctx.fillRect(x, y, 1, 1);
      }
    }
  });
  const sunMap = canvasTexture(32, 32, (ctx) => {
    const colors = ["#fff19b", "#ffd56e", "#ffad57", "#ff795f", "#ed506e"];
    for (let y = 1; y < 31; y++) {
      if (y >= 18 && y % 4 === 0) continue;
      const halfWidth = Math.floor(Math.sqrt(15 * 15 - (y - 15.5) ** 2));
      ctx.fillStyle = colors[Math.min(colors.length - 1, Math.floor(y / 6))];
      ctx.fillRect(16 - halfWidth, y, halfWidth * 2, 1);
    }
  });
  const sun = new THREE.Mesh(plane, unlit(0xffffff, { map: sunMap, transparent: true, fog: false, toneMapped: false, depthWrite: false }));
  sun.scale.set(38, 38, 1); sun.position.set(0, 20, -155); scene.add(sun);

  scene.add(new THREE.HemisphereLight(0xb6bdff, 0x592137, 1.5));
  const keyLight = new THREE.DirectionalLight(0xffba89, 1.8);
  keyLight.position.set(-12, 18, -30); scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x669cff, 1.1);
  rimLight.position.set(9, 6, 15); scene.add(rimLight);

  const asphalt = paint(0x111323);
  const pavement = paint(0x38334d);
  const concrete = paint(0x383249);
  const lanePaint = unlit(0xffe8d0);
  const railGlow = unlit(0xff797b, { toneMapped: false });
  const glass = paint(0x101d39);
  const rubber = paint(0x090c16);
  const alloy = paint(0x9da1b1);
  const rearLamp = unlit(0xff393d, { toneMapped: false });
  const frontLamp = unlit(0xc7eeff, { toneMapped: false });

  box(scene, [200, 0.3, 240], [0, -0.43, -95], paint(0x211a32));
  box(scene, [9, 0.12, 210], [0, -0.08, -88], asphalt);
  for (const side of [-1, 1]) {
    box(scene, [2.6, 0.25, 205], [side * 5.8, 0, -88], pavement);
    box(scene, [0.14, 0.04, 205], [side * 4.4, 0.025, -88], lanePaint);
    box(scene, [0.25, 0.65, 205], [side * 7, 0.35, -88], concrete);
    box(scene, [0.28, 0.035, 205], [side * 7, 0.7, -88], railGlow);
  }
  const laneMarkers = new THREE.Group(); scene.add(laneMarkers);
  for (let i = 0; i < 32; i++) {
    for (const x of [-1.5, 1.5]) box(laneMarkers, [0.14, 0.025, 2.6], [x, 0.012, 15 - i * 6], lanePaint);
  }

  // Stepped, dithered light pools suit the pixels better than blurred bloom.
  const glowMap = canvasTexture(16, 16, (ctx) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const distance = Math.hypot(x - 7.5, y - 7.5) / 8;
        if (distance >= 1 || (distance > 0.5 && (x + y) % 2)) continue;
        const alpha = distance < 0.3 ? 0.6 : distance < 0.6 ? 0.3 : 0.12;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`; ctx.fillRect(x, y, 1, 1);
      }
    }
  });
  function pool(parent, color, x, z, width, length, opacity = 1, y = 0.03) {
    const mat = unlit(color, { map: glowMap, transparent: true, depthWrite: false, opacity });
    const mesh = new THREE.Mesh(plane, mat);
    mesh.rotation.x = -Math.PI / 2; mesh.scale.set(width, length, 1); mesh.position.set(x, y, z);
    parent.add(mesh); return mesh;
  }

  const wheelGeo = geometry(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 10));
  const hubGeo = geometry(new THREE.CylinderGeometry(0.17, 0.17, 0.22, 8));
  function makeCar(color, isPlayer = false) {
    const car = new THREE.Group();
    const body = paint(color);
    car.userData.bodyMaterial = body;
    box(car, [1.72, 0.4, 3.2], [0, 0.5, 0], body);
    box(car, [1.62, 0.18, 1.1], [0, 0.72, -0.95], body);
    box(car, [1.35, 0.52, 1.35], [0, 0.91, 0.14], glass);
    box(car, [1.36, 0.095, 0.96], [0, 1.2, 0.18], body);
    box(car, [1.7, 0.15, 0.7], [0, 0.75, 1.23], body);
    box(car, [1.55, 0.13, 0.12], [0, 0.34, 1.63], rubber);
    box(car, [0.6, 0.16, 0.02], [0, 0.5, 1.612], rubber);
    for (const side of [-1, 1]) {
      box(car, [0.48, 0.105, 0.055], [side * 0.54, 0.66, 1.62], rearLamp);
      box(car, [0.45, 0.08, 0.04], [side * 0.55, 0.58, -1.62], frontLamp);
      box(car, [0.2, 0.12, 0.24], [side * 0.86, 0.89, -0.36], body);
      for (const z of [-0.99, 1.02]) {
        const wheel = new THREE.Mesh(wheelGeo, rubber); wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side * 0.85, 0.34, z); car.add(wheel);
        const hub = new THREE.Mesh(hubGeo, alloy); hub.rotation.z = Math.PI / 2;
        hub.position.set(side * 0.88, 0.34, z); car.add(hub);
      }
    }
    if (isPlayer) {
      for (const x of [-0.6, 0.6]) box(car, [0.06, 0.25, 0.12], [x, 0.91, 1.36], rubber);
      box(car, [1.85, 0.075, 0.28], [0, 1.05, 1.36], body);
    }
    pool(car, 0x000000, 0, 0, 2.7, 4.2, 0.9, 0.015);
    pool(car, 0xff244d, 0, 2.05, 2.4, 3.8, 0.55);
    pool(car, 0x668dff, 0, -0.1, 2.6, 3.6, 0.27, 0.022);
    scene.add(car); return car;
  }
  const player = makeCar(0xd91d45, true); player.position.set(0, 0, 4);
  const traffic = [];
  const trafficColors = [0x6b44d5, 0xf1aa39, 0x247dba, 0xe65252, 0x769493];
  // Bind paint to the obstacle, not its current slot in the reusable mesh pool.
  const trafficPaint = new WeakMap();
  let nextTrafficColor = 0;
  const previewTraffic = [
    { lane: 0, y: 365 }, { lane: 2, y: 255 }, { lane: 1, y: 85 }, { lane: 0, y: -80 }
  ];
  // Reuse a bounded pool rather than creating GPU resources during play.
  for (let i = 0; i < 16; i++) { const car = makeCar(trafficColors[i % trafficColors.length]); car.visible = false; traffic.push(car); }

  // Seeded city detail keeps the composition stable across reloads.
  let seed = 37;
  function random() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  const cityMats = [0x25213e, 0x322449, 0x252f4b, 0x482844].map(c => paint(c));
  const windowMats = [0xff916e, 0xf25195, 0x799ed0].map(c => unlit(c));
  const windowData = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 26; i++) {
      const depth = 4 + random() * 5;
      const width = 3 + random() * 5;
      const height = 5 + random() * 23;
      const x = side * (10 + random() * 19);
      const z = -12 - i * 5.3;
      box(scene, [width, height, depth], [x, height / 2, z], cityMats[i % cityMats.length]);
      if (i % 3 === 0) box(scene, [0.06, height * 0.18, 0.06], [x, height * 1.09, z], cityMats[0]);
      for (let y = 1.1; y < height - 0.5; y += 1.3) {
        for (let dx = -width / 2 + 0.55; dx < width / 2 - 0.3; dx += 0.9) {
          if (random() > 0.53) windowData.push({ x: x + dx, y, z: z + depth / 2 + 0.02, color: i % 3 });
        }
      }
    }
  }
  const dummy = new THREE.Object3D();
  for (let color = 0; color < windowMats.length; color++) {
    const windows = windowData.filter(w => w.color === color);
    const mesh = new THREE.InstancedMesh(cube, windowMats[color], windows.length);
    windows.forEach((w, i) => {
      dummy.position.set(w.x, w.y, w.z); dummy.scale.set(0.3, 0.55, 0.035); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    });
    scene.add(mesh);
  }

  const roadside = new THREE.Group(); scene.add(roadside);
  const pole = paint(0x302a40);
  const lamp = unlit(0xffdf9a, { toneMapped: false });
  const leaves = paint(0x102b2c, { side: THREE.DoubleSide });
  const trunkMat = paint(0x39283e);
  const trunkGeo = geometry(new THREE.CylinderGeometry(0.11, 0.21, 6, 6));
  const leafGeo = geometry(new THREE.BufferGeometry());
  leafGeo.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, 0, 0.8, 0.42, 0.45, 1.6, 0.18, 0,
    0, 0, 0, 1.6, 0.18, 0, 0.8, 0.42, -0.45,
    0.8, 0.42, 0.45, 2.65, -0.85, 0, 1.6, 0.18, 0,
    0.8, 0.42, -0.45, 1.6, 0.18, 0, 2.65, -0.85, 0
  ], 3));
  leafGeo.computeVertexNormals();
  for (let i = 0; i < 10; i++) {
    for (const side of [-1, 1]) {
      const z = 7 - i * 15;
      box(roadside, [0.09, 3.8, 0.09], [side * 5.4, 1.9, z], pole);
      box(roadside, [0.8, 0.07, 0.1], [side * 5.05, 3.8, z], pole);
      box(roadside, [0.38, 0.15, 0.2], [side * 4.75, 3.72, z], lamp);
      pool(roadside, 0xff9955, side * 4.7, z, 3.6, 5, 0.35);
      const palm = new THREE.Group(); palm.position.set(side * 6.2, 0, z - 6);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.position.y = 3; trunk.rotation.z = side * -0.09; palm.add(trunk);
      for (let j = 0; j < 7; j++) {
        const leaf = new THREE.Mesh(leafGeo, leaves); leaf.position.set(side * 0.5, 5.9, 0); leaf.rotation.y = j * Math.PI * 2 / 7; palm.add(leaf);
      }
      roadside.add(palm);
    }
  }

  const hud = document.createElement("div"); hud.className = "racing-hud";
  const scoreLabel = document.createElement("div");
  const highLabel = document.createElement("div");
  hud.append(scoreLabel, highLabel);
  panel.append(renderer.domElement, hud);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let available = true;
  let disposed = false;
  let lastState = null;
  let lastFrame = "";
  let inView = true;
  const pointer = { x: 0, y: 0 };
  const viewpoint = { x: 0, y: 0 };
  let lastViewTime = performance.now();

  function resetPointer() {
    pointer.x = 0;
    pointer.y = 0;
  }

  function followPointer(event) {
    // Mouse-only preview motion: touching or dragging the carousel retains
    // its existing controls, and gameplay always uses the fixed camera.
    if (event.pointerType !== "mouse" || event.buttons || reducedMotion.matches ||
        !lastState?.preview || !panel.classList.contains("active")) {
      resetPointer();
      return;
    }
    const bounds = panel.getBoundingClientRect();
    pointer.x = THREE.MathUtils.clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, -1, 1);
    pointer.y = THREE.MathUtils.clamp(1 - (event.clientY - bounds.top) / bounds.height * 2, -1, 1);
  }

  function updateMotionPreference() {
    resetPointer();
    lastFrame = "";
    if (lastState) render(lastState);
  }

  function visibilityChanged() {
    if (!document.hidden && lastState) { lastFrame = ""; render(lastState); }
  }

  function contextLost(event) {
    event.preventDefault(); available = false; panel.classList.remove("has-racing-portal");
    lastState?.onUnavailable?.();
  }

  function contextRestored() {
    if (disposed) return;
    available = true; lastFrame = "";
    if (lastState) render(lastState);
  }

  panel.addEventListener("pointermove", followPointer, { passive: true });
  panel.addEventListener("pointerleave", resetPointer);
  reducedMotion.addEventListener("change", updateMotionPreference);
  document.addEventListener("visibilitychange", visibilityChanged);
  const visibility = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView && lastState) { lastFrame = ""; render(lastState); }
  });
  visibility.observe(panel);

  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  renderer.domElement.addEventListener("webglcontextrestored", contextRestored);

  function render(state) {
    lastState = state;
    if (!available) return false;
    if (!inView || document.hidden) return true;
    const now = performance.now();
    const ease = 1 - Math.exp(-9 * Math.min((now - lastViewTime) / 1000, 0.1));
    lastViewTime = now;
    if (state.preview && panel.classList.contains("active") && !reducedMotion.matches) {
      viewpoint.x += (pointer.x * 1.1 - viewpoint.x) * ease;
      viewpoint.y += (pointer.y * 0.55 - viewpoint.y) * ease;
    } else {
      resetPointer();
      viewpoint.x = 0;
      viewpoint.y = 0;
    }
    const frameKey = [state.distance, state.lane, state.steer, state.score, state.highScore,
      state.preview, viewpoint.x, viewpoint.y, reducedMotion.matches].join(":");
    if (frameKey === lastFrame) return true;
    lastFrame = frameKey;
    const distance = state.distance;
    laneMarkers.position.z = distance % 6;
    roadside.position.z = distance % 15;
    player.position.x = (state.lane - 1) * 3;
    player.rotation.z = reducedMotion.matches ? 0 : state.steer * -0.065;
    player.rotation.y = reducedMotion.matches ? 0 : state.steer * -0.12;
    camera.position.set(viewpoint.x, 6.5 + viewpoint.y, 19);
    camera.lookAt(0, 1.7, -18);
    const cars = state.preview ? previewTraffic : state.obstacles;
    traffic.forEach((car, i) => {
      const obstacle = cars[i]; car.visible = Boolean(obstacle);
      if (!obstacle) return;
      if (!trafficPaint.has(obstacle)) {
        trafficPaint.set(obstacle, trafficColors[nextTrafficColor++ % trafficColors.length]);
      }
      car.userData.bodyMaterial.color.setHex(trafficPaint.get(obstacle));
      car.position.set((obstacle.lane - 1) * 3, 0, 4 + (obstacle.y - 500) * 0.16);
    });
    scoreLabel.textContent = `[ SCORE ${String(Math.floor(state.score)).padStart(5, "0")} ]`;
    highLabel.textContent = `[ BEST  ${String(Math.floor(state.highScore)).padStart(5, "0")} ]`;
    renderer.render(scene, camera);
    panel.classList.add("has-racing-portal");
    return true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true; available = false;
    visibility.disconnect();
    panel.removeEventListener("pointermove", followPointer);
    panel.removeEventListener("pointerleave", resetPointer);
    reducedMotion.removeEventListener("change", updateMotionPreference);
    document.removeEventListener("visibilitychange", visibilityChanged);
    renderer.domElement.removeEventListener("webglcontextlost", contextLost);
    renderer.domElement.removeEventListener("webglcontextrestored", contextRestored);
    scene.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    renderer.dispose(); renderer.domElement.remove(); hud.remove(); panel.classList.remove("has-racing-portal");
  }
  return { render, dispose, get visible() { return inView; }, get available() { return available; } };
}

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
