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
