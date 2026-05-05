const PROJECTS_CACHE_KEY = "jl_projects_cache_v1";
const PROJECTS_CACHE_TTL_MS = 1000 * 60 * 30;
const PROJECTS_QUEUE_KEY = "jl_projects_queue_v1";
const PROJECT_LIMIT = 3;
const FEATURED_TOPIC = "featured";
const GITHUB_REPOS_URL = "https://api.github.com/users/Jett-Lu/repos?per_page=100&sort=updated&type=owner";
const GITHUB_API_HEADERS = { Accept: "application/vnd.github+json" };
const GITHUB_PROFILE_URL = "https://github.com/Jett-Lu?tab=repositories";

function readProjectsCache() {
  try {
    const raw = sessionStorage.getItem(PROJECTS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.t !== "number" || !Array.isArray(parsed.repos)) return null;
    if (Date.now() - parsed.t > PROJECTS_CACHE_TTL_MS) return null;
    return parsed.repos;
  } catch {
    return null;
  }
}

function writeProjectsCache(repos) {
  try {
    sessionStorage.setItem(PROJECTS_CACHE_KEY, JSON.stringify({ t: Date.now(), repos }));
  } catch {
    // ignore
  }
}

function shuffleList(values) {
  const shuffled = [...values];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function readProjectsQueue() {
  try {
    const raw = sessionStorage.getItem(PROJECTS_QUEUE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.poolKey !== "string" || !Array.isArray(parsed.remainingIds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeProjectsQueue(poolKey, remainingIds) {
  try {
    sessionStorage.setItem(PROJECTS_QUEUE_KEY, JSON.stringify({ poolKey, remainingIds }));
  } catch {
    // ignore
  }
}

function selectProjectWindow(repos) {
  if (repos.length === 0) return [];

  const repoIds = repos.map((repo) => repo.id);
  const poolKey = repoIds.join(",");
  const savedQueue = readProjectsQueue();
  let remainingIds =
    savedQueue && savedQueue.poolKey === poolKey
      ? savedQueue.remainingIds.filter((id) => repoIds.includes(id))
      : [];

  const selectedIds = [];
  const targetSize = Math.min(PROJECT_LIMIT, repos.length);

  while (selectedIds.length < targetSize) {
    if (!remainingIds.length) {
      remainingIds = shuffleList(repoIds);
    }

    const nextId = remainingIds.shift();
    if (!selectedIds.includes(nextId)) {
      selectedIds.push(nextId);
    }
  }

  writeProjectsQueue(poolKey, remainingIds);

  return selectedIds
    .map((id) => repos.find((repo) => repo.id === id))
    .filter(Boolean);
}

function sanitizeRepoUrl(value) {
  try {
    const url = new URL(String(value));
    const path = url.pathname.toLowerCase();
    if (url.protocol === "https:" && url.hostname === "github.com" && path.startsWith("/jett-lu/")) {
      return url.toString();
    }
  } catch {
    // ignore
  }
  return GITHUB_PROFILE_URL;
}

function sanitizeLanguagesUrl(value) {
  try {
    const url = new URL(String(value));
    const path = url.pathname.toLowerCase();
    if (url.protocol === "https:" && url.hostname === "api.github.com" && path.startsWith("/repos/jett-lu/")) {
      return url.toString();
    }
  } catch {
    // ignore
  }
  return null;
}

function hasFeaturedTopic(repo) {
  return Array.isArray(repo.topics) && repo.topics.some((topic) => String(topic).toLowerCase() === FEATURED_TOPIC);
}

function hasProjectSummary(repo) {
  return Boolean(repo.description || repo.homepage);
}

function compareRepos(a, b) {
  const archivedDiff = Number(a.archived) - Number(b.archived);
  if (archivedDiff !== 0) return archivedDiff;

  const summaryDiff = Number(hasProjectSummary(b)) - Number(hasProjectSummary(a));
  if (summaryDiff !== 0) return summaryDiff;

  const updatedDiff = new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  if (updatedDiff !== 0) return updatedDiff;

  const starsDiff = (b.stargazers_count || 0) - (a.stargazers_count || 0);
  if (starsDiff !== 0) return starsDiff;

  return a.name.localeCompare(b.name);
}

function createProjectCard(repo, langList) {
  const card = document.createElement("article");
  card.className = "project-card";

  const title = document.createElement("h3");
  title.textContent = repo.name;

  const description = document.createElement("p");
  description.textContent = repo.description || "No description provided.";

  const languages = document.createElement("p");
  const languagesLabel = document.createElement("strong");
  languagesLabel.textContent = "Languages:";
  languages.append(languagesLabel, ` ${langList}`);

  const link = document.createElement("a");
  link.href = sanitizeRepoUrl(repo.html_url);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "View on GitHub →";

  card.append(title, description, languages, link);
  return card;
}

function renderProjectFallback(container, message) {
  const text = document.createElement("p");
  text.textContent = `${message} `;

  const link = document.createElement("a");
  link.className = "text-link";
  link.href = GITHUB_PROFILE_URL;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Browse all repositories on GitHub.";

  text.appendChild(link);
  container.replaceChildren(text);
}

async function loadProjects(container, opts = { force: false }) {
  if (!container) return;

  const loading = document.createElement("p");
  loading.textContent = "Loading featured projects...";
  container.replaceChildren(loading);

  try {
    let allRepos = null;

    if (!opts.force) {
      const cached = readProjectsCache();
      if (cached) allRepos = cached;
    }

    if (!allRepos) {
      const res = await fetch(GITHUB_REPOS_URL, { headers: GITHUB_API_HEADERS });
      if (!res.ok) throw new Error(`GitHub API request failed with status ${res.status}`);
      allRepos = await res.json();
      if (!Array.isArray(allRepos)) throw new Error("GitHub API returned an unexpected response.");
      writeProjectsCache(allRepos);
    }

    const repos = allRepos.filter((repo) => repo && !repo.fork);
    const featuredRepos = repos.filter(hasFeaturedTopic).sort(compareRepos);
    const fallbackRepos = repos.filter((repo) => !hasFeaturedTopic(repo)).sort(compareRepos);
    const repoPool = featuredRepos.length ? featuredRepos : fallbackRepos;
    const selected = selectProjectWindow(repoPool);

    container.replaceChildren();

    for (const repo of selected) {
      let langList = "N/A";

      try {
        const langCacheKey = `jl_lang_${repo.name}`;
        const cachedLang = sessionStorage.getItem(langCacheKey);
        if (cachedLang) {
          langList = cachedLang;
        } else {
          const languagesUrl = sanitizeLanguagesUrl(repo.languages_url);
          if (!languagesUrl) throw new Error("Repository languages URL is not trusted.");
          const langRes = await fetch(languagesUrl, { headers: GITHUB_API_HEADERS });
          if (!langRes.ok) throw new Error(`GitHub API request failed with status ${langRes.status}`);
          const langs = await langRes.json();
          langList = Object.keys(langs || {}).join(", ") || "N/A";
          sessionStorage.setItem(langCacheKey, langList);
        }
      } catch {
        langList = "N/A";
      }

      container.appendChild(createProjectCard(repo, langList));
    }

    if (!selected.length) {
      renderProjectFallback(container, "No featured projects found.");
    }
  } catch {
    renderProjectFallback(container, "Failed to load featured projects.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const HIGH_SCORE_KEYS = {
    asteroids: "jl_highscore_asteroids",
    car: "jl_highscore_car",
    invaders: "jl_highscore_invaders",
    brick: "jl_highscore_brick",
    snake: "jl_highscore_snake"
  };
  const GAME_INDEX = {
    asteroids: 0,
    invaders: 1,
    car: 2,
    brick: 3,
    snake: 4
  };

  const hamburger = document.getElementById("hamburger");
  const navLinks = document.getElementById("nav-links");
  const navItems = navLinks ? Array.from(navLinks.querySelectorAll("a")) : [];
  const fadeEls = document.querySelectorAll(".fade-in-section");
  const projectContainer = document.getElementById("project-container");
  const refreshBtn = document.getElementById("refresh-projects");
  const gameContainer = document.getElementById("game-container");
  const floatingTitle = document.getElementById("fixed-name-title");
  const viewport = document.getElementById("game-carousel-viewport");
  const carousel = document.getElementById("game-carousel");
  const panels = Array.from(document.querySelectorAll(".game-panel"));
  const playBtn = document.getElementById("game-play");
  const helpBtn = document.getElementById("game-help");
  const leftArrow = document.getElementById("carousel-left");
  const rightArrow = document.getElementById("carousel-right");
  const overlay = document.getElementById("game-over");
  const overlayText = document.getElementById("game-over-text");
  const helpOverlay = document.getElementById("game-help-overlay");
  const helpText = document.getElementById("game-help-text");
  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

  const astCanvas = document.getElementById("asteroidsCanvas");
  const astCtx = astCanvas ? astCanvas.getContext("2d") : null;
  const carCanvas = document.getElementById("gameCanvas");
  const carCtx = carCanvas ? carCanvas.getContext("2d") : null;
  const invCanvas = document.getElementById("invadersCanvas");
  const invCtx = invCanvas ? invCanvas.getContext("2d") : null;
  const brickCanvas = document.getElementById("brickCanvas");
  const brickCtx = brickCanvas ? brickCanvas.getContext("2d") : null;
  const snakeCanvas = document.getElementById("snakeCanvas");
  const snakeCtx = snakeCanvas ? snakeCanvas.getContext("2d") : null;

  if (astCanvas) astCanvas.style.touchAction = "none";
  if (carCanvas) carCanvas.style.touchAction = "none";
  if (invCanvas) invCanvas.style.touchAction = "none";
  if (brickCanvas) brickCanvas.style.touchAction = "none";
  if (snakeCanvas) snakeCanvas.style.touchAction = "none";

  let titleRaf = 0;
  let holdLeft = false;
  let holdRight = false;
  let lastTouchStartMs = 0;
  let currentIndex = Math.min(GAME_INDEX.car, Math.max(0, panels.length - 1));
  let isDragging = false;
  let dragStartX = 0;
  let dragMoved = false;
  let pendingPanelIndex = null;
  let suppressPanelClickUntil = 0;
  let lastCarFrame = null;
  let helpOpen = false;
  let carouselAnimating = false;
  let carouselAnimationTimer = 0;
  let carouselAnimationRaf = 0;
  let queuedDragX = 0;
  let dragRaf = 0;
  let dragMinX = 0;
  let dragMaxX = 0;
  let dragStartTranslateX = 0;

  const CAROUSEL_BASE_DURATION = 160;

  const laneCount = 3;
  const playerCarArt = "[=]";
  const obstacleArt = "[#]";

  const storedScores = {
    asteroids: readStoredNumber(HIGH_SCORE_KEYS.asteroids),
    car: readStoredNumber(HIGH_SCORE_KEYS.car),
    invaders: readStoredNumber(HIGH_SCORE_KEYS.invaders),
    brick: readStoredNumber(HIGH_SCORE_KEYS.brick),
    snake: readStoredNumber(HIGH_SCORE_KEYS.snake)
  };

  const ast = {
    shipX: 200,
    shipY: 300,
    angle: -Math.PI / 2,
    vx: 0,
    vy: 0,
    bullets: [],
    rocks: [],
    score: 0,
    high: storedScores.asteroids,
    gameOver: false,
    lastShot: 0,
    shotMs: 280,
    elapsed: 0
  };

  let carSpeed = 5;
  const carAcceleration = 0.2;
  let carScore = 0;
  let carHighScore = storedScores.car;
  let lastObstacleSpawn = Date.now();
  let playerCar = { y: 500, lane: 1 };
  let obstacles = [];
  let carPaused = false;
  let carGameOver = false;

  const inv = {
    shipX: 190,
    shipY: 540,
    bullets: [],
    aliens: [],
    dir: 1,
    speedX: 0.9,
    stepDown: 18,
    lastShot: 0,
    shotMs: 220,
    score: 0,
    high: storedScores.invaders,
    gameOver: false
  };

  const brick = {
    score: 0,
    high: storedScores.brick,
    gameOver: false,
    paddleX: 156,
    ballX: 200,
    ballY: 360,
    ballDX: 2.6,
    ballDY: -2.8,
    bricks: []
  };

  const snake = {
    cell: 20,
    cols: 20,
    rows: 30,
    body: [],
    dirX: 1,
    dirY: 0,
    pendingTurns: [],
    food: { x: 14, y: 15 },
    tickMs: 135,
    tickAcc: 0,
    score: 0,
    high: storedScores.snake,
    gameOver: false
  };

  let astPaused = false;
  let invPaused = false;
  let brickPaused = false;
  let snakePaused = false;
  let games = [];
  let suppressScrollPauseUntil = 0;

  document.documentElement.classList.add("js");

  function readStoredNumber(key) {
    try {
      const value = Number(localStorage.getItem(key));
      return Number.isFinite(value) && value >= 0 ? value : 0;
    } catch {
      return 0;
    }
  }

  function writeStoredNumber(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // ignore
    }
  }

  function setMenuOpen(open) {
    if (!hamburger || !navLinks) return;
    navLinks.classList.toggle("show", open);
    hamburger.setAttribute("aria-expanded", String(open));
    hamburger.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
  }

  function updatePlayButton() {
    if (!playBtn || !gameContainer) return;
    const expanded = gameContainer.classList.contains("expanded");
    playBtn.textContent = expanded ? "Back" : "Play";
    playBtn.setAttribute("aria-label", expanded ? "Exit selected game" : "Play selected game");
  }

  function updateHelpButton() {
    if (!helpBtn) return;
    helpBtn.textContent = helpOpen ? "Close Help" : "Help";
    helpBtn.setAttribute("aria-label", helpOpen ? "Close game instructions" : "Show game instructions");
  }

  function setFadeInState() {
    if (typeof IntersectionObserver !== "function") {
      fadeEls.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        });
      },
      { threshold: 0.35 }
    );

    fadeEls.forEach((el) => observer.observe(el));
  }

  function isPlayMode() {
    return Boolean(gameContainer && gameContainer.classList.contains("expanded"));
  }

  function clearHolds() {
    holdLeft = false;
    holdRight = false;
  }

  function appendLines(parent, lines) {
    parent.replaceChildren();
    lines.forEach((line, index) => {
      if (index > 0) parent.appendChild(document.createElement("br"));
      parent.appendChild(document.createTextNode(line));
    });
  }

  function createHelpSection(text, extraClass = "") {
    const section = document.createElement("div");
    section.className = extraClass ? `help-section ${extraClass}` : "help-section";

    const body = document.createElement("span");
    body.textContent = text;
    section.appendChild(body);
    return section;
  }

  function renderHelpContent() {
    if (!helpText) return;
    const content = getHelpContent();
    helpText.replaceChildren(
      createHelpSection(content.controls),
      createHelpSection(content.summary),
      createHelpSection("Click or tap the game to resume.", "help-dismiss")
    );
  }

  function showMessageOverlay(lines) {
    if (!overlay || !overlayText) return;
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    appendLines(overlayText, lines);
    overlay.style.visibility = "visible";
  }

  function hideOverlay() {
    if (!overlay) return;
    overlay.style.visibility = "hidden";
    overlay.setAttribute("aria-hidden", "true");
    overlay.hidden = true;
  }

  function hideHelpOverlay() {
    if (!helpOverlay) return;
    helpOverlay.style.visibility = "hidden";
    helpOverlay.setAttribute("aria-hidden", "true");
    helpOverlay.hidden = true;
    helpOpen = false;
    updateHelpButton();
  }

  function closeHelpOverlay() {
    if (!helpOpen) return;
    hideHelpOverlay();
    if (helpBtn) helpBtn.focus();
  }

  function getActiveGame() {
    return games[currentIndex] || null;
  }

  function getHelpContent() {
    return getActiveGame()?.help || {
      controls: "Use left/right controls.",
      summary: "Choose a game to see instructions."
    };
  }

  function openHelpOverlay() {
    if (!helpOverlay || !helpText) return;
    if (isPlayMode()) return;

    hideOverlay();

    renderHelpContent();
    helpOverlay.hidden = false;
    helpOverlay.setAttribute("aria-hidden", "false");
    helpOverlay.style.visibility = "visible";
    helpOpen = true;
    updateHelpButton();
    helpOverlay.focus({ preventScroll: true });
  }

  function showOverlay(score, highScore) {
    const retry = "Click or tap the game to try again.";
    showMessageOverlay([
      "Your score:",
      String(Math.floor(score)),
      "",
      "Highscore:",
      String(Math.floor(highScore)),
      "",
      retry
    ]);
  }

  function showPauseOverlay() {
    showMessageOverlay(["Game Paused.", "", "Click or tap the game to resume."]);
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function applyDragResistance(value, delta, min, max) {
    if (!delta) return value;

    const direction = delta < 0 ? -1 : 1;
    const limit = direction < 0 ? min : max;
    const remaining = direction < 0 ? value - limit : limit - value;
    if (remaining <= 0.5) return value;

    const resistanceZone = 300;
    const t = clamp(remaining / resistanceZone, 0, 1);
    const resistanceScale = 0.12 + 0.88 * t;
    const scaledDelta = Math.abs(delta) * resistanceScale;
    const softenedMove =
      remaining * (1 - Math.exp(-scaledDelta / Math.max(remaining, 1)));
    const move = Math.min(softenedMove, Math.max(remaining - 0.5, 0));

    return value + direction * move;
  }

function updateCarouselArrows() {
  if (!leftArrow || !rightArrow) return;
  const atStart = currentIndex <= 0;
  const atEnd = currentIndex >= panels.length - 1;

  leftArrow.classList.toggle("hidden", atStart);
  rightArrow.classList.toggle("hidden", atEnd);
  leftArrow.disabled = atStart;
  rightArrow.disabled = atEnd;
  leftArrow.setAttribute("aria-hidden", String(atStart));
  rightArrow.setAttribute("aria-hidden", String(atEnd));
}

function positionCarouselArrows() {
  if (!leftArrow || !rightArrow || !panels.length) return;

  const leftPanel = panels[currentIndex - 1];
  const rightPanel = panels[currentIndex + 1];

  if (leftPanel) {
    const rect = leftPanel.getBoundingClientRect();
    const leftSpace = rect.left;
    leftArrow.style.left = `${clamp(leftSpace / 2, 14, 120)}px`;
  }

  if (rightPanel) {
    const rect = rightPanel.getBoundingClientRect();
    const rightSpace = window.innerWidth - rect.right;
    rightArrow.style.right = `${clamp(rightSpace / 2, 14, 120)}px`;
  }
}

  function setActive(index) {
    currentIndex = clamp(index, 0, panels.length - 1);
    panels.forEach((panel, panelIndex) => {
      const isActivePanel = panelIndex === currentIndex;
      const distance = Math.abs(panelIndex - currentIndex);
      panel.classList.toggle("active", isActivePanel);
      panel.classList.toggle("distance-1", distance === 1);
      panel.classList.toggle("distance-2", distance === 2);
      panel.classList.toggle("distance-far", distance > 2);
      panel.classList.toggle("distance-before", panelIndex < currentIndex);
      panel.classList.toggle("distance-after", panelIndex > currentIndex);
      panel.style.removeProperty("order");
      panel.setAttribute("aria-hidden", String(!isActivePanel));
      panel.tabIndex = isActivePanel ? 0 : -1;
    });
    if (helpOpen && helpText) {
      renderHelpContent();
    }
    updateCarouselArrows();
    positionCarouselArrows();
  }

  function positionPlayButton() {
    const controls = document.getElementById("game-controls");
    if (!controls) return;
    controls.style.removeProperty("top");
  }

  function getActiveCanvas() {
    const activePanel = document.querySelector(".game-panel.active");
    return activePanel ? activePanel.querySelector("canvas") : null;
  }

  function getCanvasPosFromClient(clientX, clientY) {
    const canvas = getActiveCanvas();
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    if (
      clientX < rect.left || clientX > rect.right ||
      clientY < rect.top || clientY > rect.bottom
    ) {
      return null;
    }

    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    return { x, y, canvas };
  }

  function updateFloatingTitle() {
    if (!floatingTitle || !gameContainer) return;

    const rect = gameContainer.getBoundingClientRect();
    const fadeEnd = Math.max(1, rect.height * 0.5);
    const t = clamp(window.scrollY / fadeEnd, 0, 1);

    floatingTitle.style.setProperty("--title-opacity", String(1 - t));
    floatingTitle.style.setProperty("--title-shift-y", `${60 * t}px`);
  }

  function requestTitleUpdate() {
    if (titleRaf) return;
    titleRaf = requestAnimationFrame(() => {
      titleRaf = 0;
      updateFloatingTitle();
    });
  }

  function moveCarousel(dir) {
    if (helpOpen || isPlayMode() || !panels.length) return;

    const next = clamp(currentIndex + dir, 0, panels.length - 1);
    selectCarouselIndex(next, true);
  }

  function getTranslateX() {
    if (!carousel) return 0;
    const transform = window.getComputedStyle(carousel).transform;
    if (!transform || transform === "none") return 0;

    const matrixMatch = transform.match(/matrix\(([^)]+)\)/);
    if (matrixMatch) {
      const parts = matrixMatch[1].split(",").map((value) => Number(value.trim()));
      return parts.length >= 6 ? parts[4] : 0;
    }

    const matrix3dMatch = transform.match(/matrix3d\(([^)]+)\)/);
    if (matrix3dMatch) {
      const parts = matrix3dMatch[1].split(",").map((value) => Number(value.trim()));
      return parts.length >= 16 ? parts[12] : 0;
    }

    const translateMatch = transform.match(/translateX\((-?\d+(?:\.\d+)?)px\)/);
    return translateMatch ? Number(translateMatch[1]) : 0;
  }

  function easeCarousel(t) {
    return t;
  }

  function getCarouselDuration(distance = 1) {
    return CAROUSEL_BASE_DURATION + Math.min(Math.max(distance - 1, 0), 2) * 30;
  }

  function applyTranslateX(x) {
    if (!carousel) return;
    carousel.style.transition = "none";
    carousel.style.transform = `translate3d(${x}px, 0, 0)`;
  }

  function stopCarouselAnimation() {
    if (carouselAnimationRaf) {
      cancelAnimationFrame(carouselAnimationRaf);
      carouselAnimationRaf = 0;
    }
    if (carouselAnimationTimer) {
      window.clearTimeout(carouselAnimationTimer);
      carouselAnimationTimer = 0;
    }
  }

  function animateTranslateX(targetX, duration = CAROUSEL_BASE_DURATION) {
    if (!carousel) return;
    stopCarouselAnimation();

    const startX = getTranslateX();
    const deltaX = targetX - startX;
    if (Math.abs(deltaX) < 0.5 || duration <= 0) {
      applyTranslateX(targetX);
      finishCarouselAnimation();
      return;
    }

    carouselAnimating = true;
    const startedAt = performance.now();

    const tick = (now) => {
      const t = clamp((now - startedAt) / duration, 0, 1);
      applyTranslateX(startX + deltaX * easeCarousel(t));

      if (t < 1) {
        carouselAnimationRaf = requestAnimationFrame(tick);
        return;
      }

      carouselAnimationRaf = 0;
      applyTranslateX(targetX);
      finishCarouselAnimation();
    };

    carouselAnimationRaf = requestAnimationFrame(tick);
  }

  function setTranslateX(x, animate, duration = CAROUSEL_BASE_DURATION) {
    if (!carousel) return;
    if (animate) {
      animateTranslateX(x, duration);
      return;
    }
    applyTranslateX(x);
  }

  function getProjectedTargetXForIndex(index) {
    if (!carousel || !panels.length) return;
    const targetIndex = clamp(index, 0, panels.length - 1);
    const originalIndex = currentIndex;
    const panelTransitions = panels.map((panel) => panel.style.transition);

    panels.forEach((panel) => {
      panel.style.transition = "none";
    });
    setActive(targetIndex);

    const targetX = getTargetXForIndex(targetIndex);

    setActive(originalIndex);
    carousel.offsetWidth;
    panels.forEach((panel, panelIndex) => {
      panel.style.transition = panelTransitions[panelIndex];
    });

    return targetX;
  }

  function getTargetXForIndex(index) {
    if (!viewport || !carousel || !panels.length) return;
    const targetIndex = clamp(index, 0, panels.length - 1);
    const activePanel = panels[targetIndex];
    const activeCenter = activePanel.offsetLeft + activePanel.offsetWidth / 2;
    const carouselCenter = carousel.offsetWidth / 2;
    return carouselCenter - activeCenter;
  }

  function getActiveTargetX() {
    return getTargetXForIndex(currentIndex);
  }

  function centerActive(animate, duration = CAROUSEL_BASE_DURATION) {
    const targetX = getProjectedTargetXForIndex(currentIndex) ?? getActiveTargetX();
    if (typeof targetX !== "number") return;
    setTranslateX(targetX, animate, duration);
  }

  function finishCarouselAnimation() {
    carouselAnimating = false;
    stopCarouselAnimation();
    const targetX = getProjectedTargetXForIndex(currentIndex) ?? getActiveTargetX();
    if (!isDragging && typeof targetX === "number") {
      applyTranslateX(targetX);
    }
    positionPlayButton();
    positionCarouselArrows();
    drawAllOnce();
  }

  function waitForCarouselAnimation(duration) {
    if (!carousel) return;
    carouselAnimating = true;
    if (carouselAnimationTimer) window.clearTimeout(carouselAnimationTimer);
    carouselAnimationTimer = window.setTimeout(finishCarouselAnimation, duration + 120);
  }

  function selectCarouselIndex(index, animate) {
    if (carouselAnimating && animate) return;
    const next = clamp(index, 0, panels.length - 1);
    if (next === currentIndex) return;

    const shouldAnimate = Boolean(animate);
    const distance = Math.abs(next - currentIndex);
    const duration = shouldAnimate ? getCarouselDuration(distance) : 0;
    const targetX = getProjectedTargetXForIndex(next);

    setActive(next);
    if (typeof targetX === "number") {
      setTranslateX(targetX, shouldAnimate, duration);
    } else {
      centerActive(shouldAnimate, duration);
    }
    positionPlayButton();
    if (shouldAnimate) {
      waitForCarouselAnimation(duration);
    } else {
      drawAllOnce();
    }
  }

  function snapToNearest(momentumPx = 0, maxStep = panels.length) {
    if (!viewport || panels.length === 0) return;

    const viewportRect = viewport.getBoundingClientRect();
    const viewportCenter = viewportRect.left + viewportRect.width / 2 - momentumPx;

    let bestIdx = currentIndex;
    let bestDist = Infinity;

    panels.forEach((panel, index) => {
      if (panel.classList.contains("distance-far")) return;
      const panelStyle = window.getComputedStyle(panel);
      if (panelStyle.display === "none" || panelStyle.visibility === "hidden") return;

      const rect = panel.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const distance = Math.abs(center - viewportCenter);
      if (distance < bestDist) {
        bestDist = distance;
        bestIdx = index;
      }
    });

    bestIdx = clamp(bestIdx, currentIndex - maxStep, currentIndex + maxStep);

    if (bestIdx === currentIndex) {
      const duration = getCarouselDuration();
      centerActive(true, duration);
      waitForCarouselAnimation(duration);
      positionPlayButton();
      return;
    }

    selectCarouselIndex(bestIdx, true);
  }

  function updateStoredHighScore(key, currentHigh, candidate) {
    if (candidate <= currentHigh) return currentHigh;
    writeStoredNumber(key, candidate);
    return candidate;
  }

  function setAstCanvasSize() {
    if (!astCanvas) return;
    astCanvas.width = 400;
    astCanvas.height = 600;
  }

  function wrapPosition(obj, width, height) {
    if (obj.x < 0) obj.x += width;
    if (obj.x > width) obj.x -= width;
    if (obj.y < 0) obj.y += height;
    if (obj.y > height) obj.y -= height;
  }

  function makeAsteroidFromEdge(index, speedBoost) {
    if (!astCanvas) return { x: 0, y: 0, vx: 0, vy: 0, r: 20 };
    const side = index % 4;
    const margin = 26;
    const x = side === 0 ? -margin : side === 1 ? astCanvas.width + margin : 40 + Math.random() * 320;
    const y = side === 2 ? -margin : side === 3 ? astCanvas.height + margin : 80 + Math.random() * 440;
    const targetX = 140 + Math.random() * 120;
    const targetY = 230 + Math.random() * 140;
    const dx = targetX - x;
    const dy = targetY - y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = (28 + Math.random() * 22) * speedBoost;
    return {
      x,
      y,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
      r: 18 + Math.random() * 9,
      art: ["[O]", "{O}", "(0)", "<O>", "[0]"][index % 5]
    };
  }

  function spawnAsteroids() {
    ast.rocks = [];
    const speedBoost = 1 + Math.min(1.3, ast.score / 220 + ast.elapsed / 85);
    const rockCount = Math.min(5, 2 + Math.floor(ast.score / 40 + ast.elapsed / 28));
    for (let i = 0; i < rockCount; i += 1) {
      ast.rocks.push(makeAsteroidFromEdge(i, speedBoost));
    }
  }

  function recycleAsteroid(rock, index) {
    const speedBoost = 1 + Math.min(1.3, ast.score / 220 + ast.elapsed / 85);
    Object.assign(rock, makeAsteroidFromEdge(index, speedBoost));
  }

  function resetAsteroidsGame() {
    if (!astCanvas || !astCtx) return;
    setAstCanvasSize();
    ast.shipX = 200;
    ast.shipY = 300;
    ast.angle = -Math.PI / 2;
    ast.vx = 0;
    ast.vy = 0;
    ast.bullets = [];
    ast.score = 0;
    ast.gameOver = false;
    astPaused = false;
    ast.elapsed = 0;
    ast.lastShot = Date.now();
    hideOverlay();
    spawnAsteroids();
  }

  function drawAsteroids() {
    if (!astCanvas || !astCtx) return;

    astCtx.clearRect(0, 0, astCanvas.width, astCanvas.height);
    astCtx.strokeStyle = "white";
    astCtx.fillStyle = "white";
    astCtx.lineWidth = 2;
    astCtx.strokeRect(0, 0, astCanvas.width, astCanvas.height);

    astCtx.font = "16px Arial";
    astCtx.fillText(`Score: ${Math.floor(ast.score)}`, 10, 20);
    astCtx.fillText(`High Score: ${Math.floor(ast.high)}`, 10, 40);

    astCtx.save();
    astCtx.translate(ast.shipX, ast.shipY);
    astCtx.rotate(ast.angle + Math.PI / 2);
    astCtx.font = "22px Courier";
    astCtx.textAlign = "center";
    astCtx.textBaseline = "middle";
    astCtx.fillText("/\\", 0, 0);
    astCtx.restore();
    astCtx.textAlign = "start";
    astCtx.textBaseline = "alphabetic";

    ast.bullets.forEach((bullet) => {
      astCtx.font = "18px Courier";
      astCtx.save();
      astCtx.translate(bullet.x, bullet.y);
      astCtx.rotate(bullet.angle + Math.PI / 2);
      astCtx.textAlign = "center";
      astCtx.textBaseline = "middle";
      astCtx.fillText("|", 0, 0);
      astCtx.restore();
      astCtx.textAlign = "start";
      astCtx.textBaseline = "alphabetic";
    });

    ast.rocks.forEach((rock) => {
      astCtx.font = "20px Courier";
      astCtx.fillText(rock.art, rock.x - 15, rock.y + 6);
    });
  }

  function updateAsteroids(dt) {
    if (!astCanvas || !astCtx || !isPlayMode() || currentIndex !== GAME_INDEX.asteroids) return;
    if (ast.gameOver || astPaused) return;

    const turnSpeed = 3.6;
    if (holdLeft) ast.angle -= turnSpeed * dt;
    if (holdRight) ast.angle += turnSpeed * dt;
    ast.elapsed += dt;

    const thrust = 62;
    ast.vx += Math.cos(ast.angle) * thrust * dt;
    ast.vy += Math.sin(ast.angle) * thrust * dt;
    ast.vx *= 0.965;
    ast.vy *= 0.965;
    ast.shipX += ast.vx * dt;
    ast.shipY += ast.vy * dt;
    if (ast.shipX < 0) ast.shipX += astCanvas.width;
    if (ast.shipX > astCanvas.width) ast.shipX -= astCanvas.width;
    if (ast.shipY < 0) ast.shipY += astCanvas.height;
    if (ast.shipY > astCanvas.height) ast.shipY -= astCanvas.height;

    const now = Date.now();
    if (now - ast.lastShot > ast.shotMs) {
      ast.lastShot = now;
      ast.bullets.push({
        x: ast.shipX + Math.cos(ast.angle) * 18,
        y: ast.shipY + Math.sin(ast.angle) * 18,
        vx: Math.cos(ast.angle) * 420 + ast.vx,
        vy: Math.sin(ast.angle) * 420 + ast.vy,
        angle: ast.angle,
        life: 1.1
      });
    }

    ast.bullets.forEach((bullet) => {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
    });
    ast.bullets = ast.bullets.filter((bullet) => (
      bullet.life > 0 &&
      bullet.x >= -10 &&
      bullet.x <= astCanvas.width + 10 &&
      bullet.y >= -10 &&
      bullet.y <= astCanvas.height + 10
    ));

    ast.rocks.forEach((rock, index) => {
      rock.x += rock.vx * dt;
      rock.y += rock.vy * dt;
      if (
        rock.x < -80 ||
        rock.x > astCanvas.width + 80 ||
        rock.y < -80 ||
        rock.y > astCanvas.height + 80
      ) {
        recycleAsteroid(rock, index);
      }
    });

    ast.bullets.forEach((bullet) => {
      ast.rocks.forEach((rock) => {
        if (rock.dead || bullet.dead) return;
        const dx = bullet.x - rock.x;
        const dy = bullet.y - rock.y;
        if (Math.hypot(dx, dy) < rock.r) {
          bullet.dead = true;
          rock.dead = true;
          ast.score += 10;
          ast.high = updateStoredHighScore(HIGH_SCORE_KEYS.asteroids, ast.high, ast.score);
        }
      });
    });
    ast.bullets = ast.bullets.filter((bullet) => !bullet.dead);
    ast.rocks = ast.rocks.filter((rock) => !rock.dead);

    if (!ast.rocks.length) {
      spawnAsteroids();
    }

    for (const rock of ast.rocks) {
      const dx = ast.shipX - rock.x;
      const dy = ast.shipY - rock.y;
      if (Math.hypot(dx, dy) < rock.r + 10) {
        ast.gameOver = true;
        ast.high = updateStoredHighScore(HIGH_SCORE_KEYS.asteroids, ast.high, ast.score);
        showOverlay(ast.score, ast.high);
        break;
      }
    }
  }

  function resumeAsteroidsIfPaused() {
    if (!astPaused) return;
    astPaused = false;
    hideOverlay();
  }

  function setCarCanvasSize() {
    if (!carCanvas) return;
    carCanvas.width = 400;
    carCanvas.height = 600;
    playerCar.y = carCanvas.height - 100;
  }

  function getLaneCenterX(lane, yPos) {
    if (!carCanvas) return 0;
    const topW = carCanvas.width / 3;
    const bottomW = carCanvas.width - 50;
    const t = yPos / carCanvas.height;
    const roadW = topW * (1 - t) + bottomW * t;
    const laneW = roadW / laneCount;
    const offset = (carCanvas.width - roadW) / 2;
    return offset + lane * laneW + laneW / 2;
  }

  function createObstacle() {
    const lanes = [0, 1, 2].sort(() => 0.5 - Math.random());
    const count = carScore < 50 ? 1 : 2;
    lanes.slice(0, count).forEach((lane) => {
      obstacles.push({ lane, y: -50 });
    });
  }

  function drawCarGame() {
    if (!carCanvas || !carCtx) return;

    carCtx.clearRect(0, 0, carCanvas.width, carCanvas.height);

    const topW = carCanvas.width / 3;
    const bottomW = carCanvas.width - 50;
    carCtx.strokeStyle = "white";
    carCtx.lineWidth = 2;

    carCtx.beginPath();
    carCtx.moveTo((carCanvas.width - topW) / 2, 0);
    carCtx.lineTo((carCanvas.width - bottomW) / 2, carCanvas.height);
    carCtx.moveTo((carCanvas.width + topW) / 2, 0);
    carCtx.lineTo((carCanvas.width + bottomW) / 2, carCanvas.height);
    carCtx.stroke();

    carCtx.setLineDash([15, 15]);
    for (let i = 1; i < laneCount; i += 1) {
      const x1 = (carCanvas.width - topW) / 2 + (topW / laneCount) * i;
      const x2 = (carCanvas.width - bottomW) / 2 + (bottomW / laneCount) * i;
      carCtx.beginPath();
      carCtx.moveTo(x1, 0);
      carCtx.lineTo(x2, carCanvas.height);
      carCtx.stroke();
    }
    carCtx.setLineDash([]);

    carCtx.fillStyle = "white";
    carCtx.font = "20px Courier";

    const playerWidth = carCtx.measureText(playerCarArt).width;
    const playerX = getLaneCenterX(playerCar.lane, playerCar.y) - playerWidth / 2;
    carCtx.fillText(playerCarArt, playerX, playerCar.y);

    obstacles.forEach((obstacle) => {
      const obstacleX = getLaneCenterX(obstacle.lane, obstacle.y) - 10;
      carCtx.fillText(obstacleArt, obstacleX, obstacle.y);
    });

    carCtx.fillStyle = "white";
    carCtx.font = "16px Arial";
    carCtx.fillText(`Score: ${Math.floor(carScore)}`, 10, 20);
    carCtx.fillText(`High Score: ${Math.floor(carHighScore)}`, 10, 40);
  }

  function resetCarGame() {
    setCarCanvasSize();
    playerCar.lane = 1;
    obstacles = [];
    carSpeed = 5;
    carScore = 0;
    lastObstacleSpawn = Date.now();
    carGameOver = false;
    carPaused = false;
    hideOverlay();
  }

  function updateCarGame(deltaTime) {
    if (!carCanvas || !carCtx || !isPlayMode() || currentIndex !== GAME_INDEX.car) return;
    if (carPaused || carGameOver) return;

    carSpeed += carAcceleration * deltaTime;
    carScore += deltaTime * 10;
    carHighScore = updateStoredHighScore(HIGH_SCORE_KEYS.car, carHighScore, carScore);

    const moveAmount = carSpeed * (deltaTime * 60);
    obstacles.forEach((obstacle) => {
      obstacle.y += moveAmount;
    });
    obstacles = obstacles.filter((obstacle) => obstacle.y < carCanvas.height + 50);

    const playerWidth = carCtx.measureText(playerCarArt).width;
    const playerHeight = 20;
    const playerX = getLaneCenterX(playerCar.lane, playerCar.y) - playerWidth / 2;
    const playerY = playerCar.y - playerHeight;

    for (const obstacle of obstacles) {
      const obstacleWidth = 20;
      const obstacleHeight = 20;
      const obstacleX = getLaneCenterX(obstacle.lane, obstacle.y) - obstacleWidth / 2;
      const obstacleY = obstacle.y - obstacleHeight;

      if (
        playerX < obstacleX + obstacleWidth &&
        playerX + playerWidth > obstacleX &&
        playerY < obstacleY + obstacleHeight &&
        playerY + playerHeight > obstacleY
      ) {
        carGameOver = true;
        showOverlay(carScore, carHighScore);
        break;
      }
    }

    const now = Date.now();
    if (now - lastObstacleSpawn > Math.max(300, 1000 - carScore * 2)) {
      createObstacle();
      lastObstacleSpawn = now;
    }
  }

  function resumeCarIfPaused() {
    if (!carPaused) return;
    carPaused = false;
    hideOverlay();
  }

  function pauseInvaders() {
    if (inv.gameOver) return;
    invPaused = true;
    showPauseOverlay();
  }

  function resumeInvadersIfPaused() {
    if (!invPaused) return;
    invPaused = false;
    hideOverlay();
  }

  function setInvCanvasSize() {
    if (!invCanvas) return;
    invCanvas.width = 400;
    invCanvas.height = 600;
    inv.shipY = invCanvas.height - 60;
  }

  function spawnInvaderWave() {
    inv.aliens = [];
    inv.dir = 1;

    const rows = 4;
    const cols = 9;
    const startX = 60;
    const startY = 100;
    const gapX = 32;
    const gapY = 30;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        inv.aliens.push({ x: startX + col * gapX, y: startY + row * gapY, alive: true });
      }
    }
  }

  function resetInvadersGame() {
    if (!invCanvas || !invCtx) return;
    setInvCanvasSize();
    inv.shipX = 190;
    inv.bullets = [];
    inv.speedX = 1.2;
    inv.score = 0;
    inv.gameOver = false;
    invPaused = false;
    hideOverlay();
    spawnInvaderWave();
  }

  function nextInvaderWave() {
    inv.bullets = [];
    inv.speedX += 0.35;
    spawnInvaderWave();
  }

  function drawInvaders() {
    if (!invCanvas || !invCtx) return;

    invCtx.clearRect(0, 0, invCanvas.width, invCanvas.height);
    invCtx.strokeStyle = "white";
    invCtx.strokeRect(0, 0, invCanvas.width, invCanvas.height);

    invCtx.font = "16px Arial";
    invCtx.fillStyle = "white";
    invCtx.fillText(`Score: ${Math.floor(inv.score)}`, 10, 20);
    invCtx.fillText(`High Score: ${Math.floor(inv.high)}`, 10, 40);

    invCtx.font = "22px Courier";
    invCtx.fillText("/^\\", inv.shipX - 12, inv.shipY);

    invCtx.font = "20px Courier";
    inv.aliens.forEach((alien) => {
      if (!alien.alive) return;
      invCtx.fillText("W", alien.x, alien.y);
    });

    invCtx.font = "18px Courier";
    inv.bullets.forEach((bullet) => {
      invCtx.fillText("|", bullet.x, bullet.y);
    });
  }

  function updateInvaders(dt) {
    if (!invCanvas || !invCtx || !isPlayMode() || currentIndex !== GAME_INDEX.invaders) return;
    if (inv.gameOver || invPaused) return;

    const shipSpeed = 380;
    if (holdLeft) inv.shipX -= shipSpeed * dt;
    if (holdRight) inv.shipX += shipSpeed * dt;
    inv.shipX = clamp(inv.shipX, 20, 380);

    const now = Date.now();
    if (now - inv.lastShot > inv.shotMs) {
      inv.lastShot = now;
      inv.bullets.push({ x: inv.shipX, y: inv.shipY - 18, dead: false });
    }

    const bulletSpeed = 650;
    inv.bullets.forEach((bullet) => {
      bullet.y -= bulletSpeed * dt;
    });
    inv.bullets = inv.bullets.filter((bullet) => bullet.y > -20 && !bullet.dead);

    let leftMost = Infinity;
    let rightMost = -Infinity;
    inv.aliens.forEach((alien) => {
      if (!alien.alive) return;
      const alienSpeed = inv.speedX * 90;
      alien.x += alienSpeed * dt * inv.dir;
      leftMost = Math.min(leftMost, alien.x);
      rightMost = Math.max(rightMost, alien.x);
    });

    const leftOverflow = Math.min(0, leftMost - 20);
    const rightOverflow = Math.max(0, rightMost - 380);
    const edgeCorrection = leftOverflow ? -leftOverflow : -rightOverflow;

    if (edgeCorrection) {
      inv.dir *= -1;
      inv.aliens.forEach((alien) => {
        if (!alien.alive) return;
        alien.x += edgeCorrection;
        alien.y += inv.stepDown;
        if (alien.y > inv.shipY - 40) inv.gameOver = true;
      });
    }

    inv.bullets.forEach((bullet) => {
      inv.aliens.forEach((alien) => {
        if (!alien.alive || bullet.dead) return;
        const dx = Math.abs(bullet.x - alien.x);
        const dy = Math.abs(bullet.y - alien.y);
        if (dx < 12 && dy < 12) {
          alien.alive = false;
          bullet.dead = true;
          inv.score += 10;
          inv.high = updateStoredHighScore(HIGH_SCORE_KEYS.invaders, inv.high, inv.score);
        }
      });
    });

    if (!inv.aliens.some((alien) => alien.alive)) {
      nextInvaderWave();
    }

    if (inv.gameOver) {
      inv.high = updateStoredHighScore(HIGH_SCORE_KEYS.invaders, inv.high, inv.score);
      showOverlay(inv.score, inv.high);
    }
  }

  function pauseBrick() {
    if (brick.gameOver) return;
    brickPaused = true;
    showPauseOverlay();
  }

  function resumeBrickIfPaused() {
    if (!brickPaused) return;
    brickPaused = false;
    hideOverlay();
  }

  function setBrickCanvasSize() {
    if (!brickCanvas) return;
    brickCanvas.width = 400;
    brickCanvas.height = 600;
  }

  function resetBrickGame() {
    if (!brickCanvas || !brickCtx) return;
    setBrickCanvasSize();

    brick.score = 0;
    brick.gameOver = false;
    brickPaused = false;
    brick.paddleX = 156;
    brick.ballX = 200;
    brick.ballY = 360;
    brick.ballDX = 2.6;
    brick.ballDY = -2.8;

    brick.bricks = [];
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 9; col += 1) {
        brick.bricks.push({ x: 28 + col * 40, y: 90 + row * 24, alive: true });
      }
    }

    hideOverlay();
  }

  function drawBrick() {
    if (!brickCanvas || !brickCtx) return;

    brickCtx.clearRect(0, 0, brickCanvas.width, brickCanvas.height);
    brickCtx.strokeStyle = "white";
    brickCtx.strokeRect(0, 0, brickCanvas.width, brickCanvas.height);

    brickCtx.font = "16px Arial";
    brickCtx.fillStyle = "white";
    brickCtx.fillText(`Score: ${Math.floor(brick.score)}`, 10, 20);
    brickCtx.fillText(`High Score: ${Math.floor(brick.high)}`, 10, 40);

    brickCtx.font = "20px Courier";
    brickCtx.fillText("[=====]", brick.paddleX, 560);
    brickCtx.fillText("O", brick.ballX, brick.ballY);
    brick.bricks.forEach((block) => {
      if (block.alive) brickCtx.fillText("[#]", block.x, block.y);
    });
  }

  function updateBrick(dt) {
    if (!brickCanvas || !brickCtx || !isPlayMode() || currentIndex !== GAME_INDEX.brick) return;
    if (brick.gameOver || brickPaused) return;

    const ballMinX = 12;
    const ballMaxX = brickCanvas.width - 12;
    const ballMinY = 60;
    const paddleY = 548;
    const paddleWidth = 80;
    const paddleCatchPadding = 8;
    const paddleSpeed = 540;
    if (holdLeft) brick.paddleX -= paddleSpeed * dt;
    if (holdRight) brick.paddleX += paddleSpeed * dt;

    brick.paddleX = clamp(brick.paddleX, 10, brickCanvas.width - paddleWidth - 10);

    const ballSpeedScale = dt * 60;
    const previousBallY = brick.ballY;
    brick.ballX += brick.ballDX * ballSpeedScale;
    brick.ballY += brick.ballDY * ballSpeedScale;

    if (brick.ballX <= ballMinX) {
      brick.ballX = ballMinX;
      brick.ballDX = Math.abs(brick.ballDX);
    } else if (brick.ballX >= ballMaxX) {
      brick.ballX = ballMaxX;
      brick.ballDX = -Math.abs(brick.ballDX);
    }

    if (brick.ballY <= ballMinY) {
      brick.ballY = ballMinY;
      brick.ballDY = Math.abs(brick.ballDY);
    }

    const crossedPaddle = previousBallY < paddleY && brick.ballY >= paddleY;
    if ((crossedPaddle || (brick.ballY >= paddleY && brick.ballY <= paddleY + 14)) && brick.ballDY > 0) {
      if (
        brick.ballX >= brick.paddleX - paddleCatchPadding &&
        brick.ballX <= brick.paddleX + paddleWidth + paddleCatchPadding
      ) {
        brick.ballY = paddleY - 2;
        brick.ballDY = -Math.abs(brick.ballDY);
        const hit = (brick.ballX - (brick.paddleX + paddleWidth / 2)) / (paddleWidth / 2);
        brick.ballDX = hit * 3.4;
      }
    }

    for (const block of brick.bricks) {
      if (!block.alive) continue;
      const dx = Math.abs(brick.ballX - (block.x + 10));
      const dy = Math.abs(brick.ballY - (block.y - 8));
      if (dx < 16 && dy < 16) {
        block.alive = false;
        brick.ballDY *= -1;
        brick.score += 10;
        brick.high = updateStoredHighScore(HIGH_SCORE_KEYS.brick, brick.high, brick.score);
        break;
      }
    }

    if (!brick.bricks.some((block) => block.alive)) {
      brick.gameOver = true;
      brick.high = updateStoredHighScore(HIGH_SCORE_KEYS.brick, brick.high, brick.score);
      showOverlay(brick.score, brick.high);
    }

    if (brick.ballY >= 592) {
      brick.gameOver = true;
      brick.high = updateStoredHighScore(HIGH_SCORE_KEYS.brick, brick.high, brick.score);
      showOverlay(brick.score, brick.high);
    }
  }

  function setSnakeCanvasSize() {
    if (!snakeCanvas) return;
    snakeCanvas.width = 400;
    snakeCanvas.height = 600;
    snake.cols = snakeCanvas.width / snake.cell;
    snake.rows = snakeCanvas.height / snake.cell;
  }

  function placeSnakeFood() {
    do {
      snake.food = {
        x: Math.floor(Math.random() * snake.cols),
        y: Math.floor(Math.random() * snake.rows)
      };
    } while (snake.body.some((part) => part.x === snake.food.x && part.y === snake.food.y));
  }

  function resetSnakeGame() {
    if (!snakeCanvas || !snakeCtx) return;
    setSnakeCanvasSize();
    snake.body = [
      { x: 10, y: 15 },
      { x: 9, y: 15 },
      { x: 8, y: 15 }
    ];
    snake.dirX = 1;
    snake.dirY = 0;
    snake.pendingTurns = [];
    snake.tickAcc = 0;
    snake.score = 0;
    snake.gameOver = false;
    snakePaused = false;
    hideOverlay();
    placeSnakeFood();
  }

  function turnSnake(dir) {
    if (snake.pendingTurns.length > 2) return;
    snake.pendingTurns.push(dir);
  }

  function applySnakeTurn() {
    const turn = snake.pendingTurns.shift();
    if (!turn) return;
    const { dirX, dirY } = snake;
    if (turn < 0) {
      snake.dirX = dirY;
      snake.dirY = -dirX;
    } else {
      snake.dirX = -dirY;
      snake.dirY = dirX;
    }
  }

  function drawSnake() {
    if (!snakeCanvas || !snakeCtx) return;

    snakeCtx.clearRect(0, 0, snakeCanvas.width, snakeCanvas.height);
    snakeCtx.strokeStyle = "white";
    snakeCtx.fillStyle = "white";
    snakeCtx.strokeRect(0, 0, snakeCanvas.width, snakeCanvas.height);

    snakeCtx.font = "16px Arial";
    snakeCtx.fillText(`Score: ${Math.floor(snake.score)}`, 10, 20);
    snakeCtx.fillText(`High Score: ${Math.floor(snake.high)}`, 10, 40);

    snakeCtx.font = "20px Courier";
    snakeCtx.fillText("*", snake.food.x * snake.cell + 5, snake.food.y * snake.cell + 16);

    snake.body.forEach((part, index) => {
      snakeCtx.fillText(index === 0 ? "@" : "o", part.x * snake.cell + 4, part.y * snake.cell + 16);
    });
  }

  function updateSnake(dt) {
    if (!snakeCanvas || !snakeCtx || !isPlayMode() || currentIndex !== GAME_INDEX.snake) return;
    if (snake.gameOver || snakePaused) return;

    snake.tickAcc += dt * 1000;
    if (snake.tickAcc < snake.tickMs) return;
    snake.tickAcc %= snake.tickMs;

    applySnakeTurn();
    const head = snake.body[0];
    const next = {
      x: head.x + snake.dirX,
      y: head.y + snake.dirY
    };

    const eatsFood = next.x === snake.food.x && next.y === snake.food.y;
    const bodyToCheck = eatsFood ? snake.body : snake.body.slice(0, -1);

    if (
      next.x < 0 ||
      next.x >= snake.cols ||
      next.y < 0 ||
      next.y >= snake.rows ||
      bodyToCheck.some((part) => part.x === next.x && part.y === next.y)
    ) {
      snake.gameOver = true;
      snake.high = updateStoredHighScore(HIGH_SCORE_KEYS.snake, snake.high, snake.score);
      showOverlay(snake.score, snake.high);
      return;
    }

    snake.body.unshift(next);
    if (eatsFood) {
      snake.score += 10;
      snake.high = updateStoredHighScore(HIGH_SCORE_KEYS.snake, snake.high, snake.score);
      placeSnakeFood();
    } else {
      snake.body.pop();
    }
  }

  function resumeSnakeIfPaused() {
    if (!snakePaused) return;
    snakePaused = false;
    hideOverlay();
  }

  games = [
    {
      key: "asteroids",
      help: {
        controls: "Use arrow keys or hold left/right to rotate.",
        summary: "Auto-shoot while steering around incoming asteroids."
      },
      canvas: astCanvas,
      reset: resetAsteroidsGame,
      update: updateAsteroids,
      draw: drawAsteroids,
      pause: () => {
        if (!ast.gameOver) astPaused = true;
      },
      resume: resumeAsteroidsIfPaused,
      isOver: () => ast.gameOver
    },
    {
      key: "invaders",
      help: {
        controls: "Use arrow keys or hold left/right to move.",
        summary: "Clear the aliens before they reach you."
      },
      canvas: invCanvas,
      reset: resetInvadersGame,
      update: updateInvaders,
      draw: drawInvaders,
      pause: (opts = {}) => {
        if (inv.gameOver) return;
        invPaused = true;
        if (!opts.silent) showPauseOverlay();
      },
      resume: resumeInvadersIfPaused,
      isOver: () => inv.gameOver
    },
    {
      key: "car",
      help: {
        controls: "Use arrow keys or tap left/right to move.",
        summary: "Dodge cars and survive as long as possible."
      },
      canvas: carCanvas,
      reset: resetCarGame,
      update: updateCarGame,
      draw: drawCarGame,
      pause: () => {
        if (!carGameOver) carPaused = true;
      },
      resume: resumeCarIfPaused,
      isOver: () => carGameOver
    },
    {
      key: "brick",
      help: {
        controls: "Use arrow keys or hold left/right to move.",
        summary: "Break all bricks without dropping the ball."
      },
      canvas: brickCanvas,
      reset: resetBrickGame,
      update: updateBrick,
      draw: drawBrick,
      pause: (opts = {}) => {
        if (brick.gameOver) return;
        brickPaused = true;
        if (!opts.silent) showPauseOverlay();
      },
      resume: resumeBrickIfPaused,
      isOver: () => brick.gameOver
    },
    {
      key: "snake",
      help: {
        controls: "Use arrow keys or tap left/right to turn.",
        summary: "The snake always moves forward. Keep turning and eat the food."
      },
      canvas: snakeCanvas,
      reset: resetSnakeGame,
      update: updateSnake,
      draw: drawSnake,
      pause: () => {
        if (!snake.gameOver) snakePaused = true;
      },
      resume: resumeSnakeIfPaused,
      isOver: () => snake.gameOver
    }
  ];

  function handlePressAtClient(clientX, clientY) {
    if (!isPlayMode()) return;
    const pos = getCanvasPosFromClient(clientX, clientY);
    if (!pos) return;
    const x = pos.x;

    if (currentIndex === GAME_INDEX.asteroids && astPaused && !ast.gameOver) {
      resumeAsteroidsIfPaused();
      return;
    }
    if (currentIndex === GAME_INDEX.invaders && invPaused && !inv.gameOver) {
      resumeInvadersIfPaused();
      return;
    }
    if (currentIndex === GAME_INDEX.brick && brickPaused && !brick.gameOver) {
      resumeBrickIfPaused();
      return;
    }
    if (currentIndex === GAME_INDEX.snake && snakePaused && !snake.gameOver) {
      resumeSnakeIfPaused();
      return;
    }

    if (currentIndex === GAME_INDEX.car && !carGameOver) {
      if (carPaused) resumeCarIfPaused();
      const mid = carCanvas ? carCanvas.width / 2 : 200;

      if (x < mid) {
        playerCar.lane = Math.max(0, playerCar.lane - 1);
      } else {
        playerCar.lane = Math.min(laneCount - 1, playerCar.lane + 1);
      }
      return;
    }

    if (currentIndex === GAME_INDEX.snake && !snake.gameOver) {
      turnSnake(x < 200 ? -1 : 1);
      return;
    }

    holdLeft = x < 200;
    holdRight = x >= 200;
  }

  function handleReleasePress() {
    clearHolds();
  }

  function isTypingTarget(target) {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return target.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  function handleGameKeyDown(event) {
    if (isTypingTarget(event.target)) return;

    if (helpOpen) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeHelpOverlay();
      }
      return;
    }

    if (!isPlayMode()) return;

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
    }

    if (currentIndex === GAME_INDEX.asteroids) {
      if (ast.gameOver) {
        resetAsteroidsGame();
        return;
      }
      if (astPaused) {
        resumeAsteroidsIfPaused();
      }
      if (event.key === "ArrowLeft") {
        holdLeft = true;
        holdRight = false;
      } else if (event.key === "ArrowRight") {
        holdRight = true;
        holdLeft = false;
      }
      return;
    }

    if (currentIndex === GAME_INDEX.car) {
      if (carGameOver) {
        resetCarGame();
        return;
      }
      if (carPaused) {
        resumeCarIfPaused();
      }
      if (event.key === "ArrowLeft") {
        playerCar.lane = Math.max(0, playerCar.lane - 1);
      } else if (event.key === "ArrowRight") {
        playerCar.lane = Math.min(laneCount - 1, playerCar.lane + 1);
      }
      return;
    }

    if (currentIndex === GAME_INDEX.invaders) {
      if (inv.gameOver) {
        resetInvadersGame();
        return;
      }
      if (invPaused) {
        resumeInvadersIfPaused();
      }
      if (event.key === "ArrowLeft") {
        holdLeft = true;
        holdRight = false;
      } else if (event.key === "ArrowRight") {
        holdRight = true;
        holdLeft = false;
      }
      return;
    }

    if (currentIndex === GAME_INDEX.brick) {
      if (brick.gameOver) {
        resetBrickGame();
        return;
      }
      if (brickPaused) {
        resumeBrickIfPaused();
      }
      if (event.key === "ArrowLeft") {
        holdLeft = true;
        holdRight = false;
      } else if (event.key === "ArrowRight") {
        holdRight = true;
        holdLeft = false;
      }
      return;
    }

    if (currentIndex === GAME_INDEX.snake) {
      if (snake.gameOver) {
        resetSnakeGame();
        return;
      }
      if (snakePaused) {
        resumeSnakeIfPaused();
      }
      if (event.key === "ArrowLeft") {
        turnSnake(-1);
      } else if (event.key === "ArrowRight") {
        turnSnake(1);
      }
    }
  }

  function handleGameKeyUp(event) {
    if (!isPlayMode() || isTypingTarget(event.target) || helpOpen) return;

    if (event.key === "ArrowLeft") {
      holdLeft = false;
    } else if (event.key === "ArrowRight") {
      holdRight = false;
    }
  }

  function pauseAllGames() {
    clearHolds();
    games.forEach((game) => game.pause({ silent: true }));
    hideOverlay();
  }

  function resumeActiveGame() {
    getActiveGame()?.reset();
  }

  function isNearActive(index) {
    return Math.abs(index - currentIndex) <= 1;
  }

  function drawAllOnce() {
    games.forEach((game, index) => {
      if (isNearActive(index)) game.draw();
    });
  }

  function drawEveryGameOnce() {
    games.forEach((game) => game.draw());
  }

  function loop(ts) {
    if (!lastCarFrame) lastCarFrame = ts;
    const dt = Math.min((ts - lastCarFrame) / 1000, 0.05);
    lastCarFrame = ts;

    if (isPlayMode()) {
      const activeGame = getActiveGame();
      activeGame?.update(dt);
      activeGame?.draw();
    }

    requestAnimationFrame(loop);
  }

  if (hamburger && navLinks) {
    setMenuOpen(false);

    hamburger.addEventListener("click", () => {
      const nextOpen = hamburger.getAttribute("aria-expanded") !== "true";
      setMenuOpen(nextOpen);
    });

    navItems.forEach((item) => {
      item.addEventListener("click", () => setMenuOpen(false));
    });

    document.addEventListener("click", (event) => {
      if (window.innerWidth > 768) return;
      if (!navLinks.classList.contains("show")) return;
      if (navLinks.contains(event.target) || hamburger.contains(event.target)) return;
      setMenuOpen(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => loadProjects(projectContainer, { force: true }));
  }

  setFadeInState();
  loadProjects(projectContainer, { force: false });

  window.addEventListener("scroll", requestTitleUpdate, { passive: true });
  window.addEventListener("resize", () => {
    requestTitleUpdate();
    requestAnimationFrame(() => {
      centerActive(false);
      positionPlayButton();
      positionCarouselArrows();
    });
  });

  window.addEventListener("popstate", () => {
    if (!isPlayMode() || !gameContainer) return;

    suppressScrollPauseUntil = Date.now() + 300;
    gameContainer.classList.remove("expanded");
    hideOverlay();
    hideHelpOverlay();
    pauseAllGames();
    drawAllOnce();
    updatePlayButton();
    updateHelpButton();

    requestAnimationFrame(() => {
      centerActive(false);
      positionPlayButton();
    });
  });

  window.addEventListener("scroll", () => {
    if (!isPlayMode()) return;
    if (Date.now() < suppressScrollPauseUntil) return;

    const activeGame = getActiveGame();
    if (!activeGame || activeGame.isOver()) return;
    activeGame.pause();
    showPauseOverlay();
  });

  if (leftArrow) {
    leftArrow.addEventListener("click", (event) => {
      event.preventDefault();
      moveCarousel(-1);
    });
  }

  if (rightArrow) {
    rightArrow.addEventListener("click", (event) => {
      event.preventDefault();
      moveCarousel(1);
    });
  }

  if (viewport) {
    viewport.addEventListener("keydown", (event) => {
      if (helpOpen) return;
      if (!isPlayMode() && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        moveCarousel(event.key === "ArrowLeft" ? -1 : 1);
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (playBtn) playBtn.click();
      }
    });
  }

  if (carousel) {
    carousel.addEventListener("pointerdown", (event) => {
      if (helpOpen) return;
      if (isPlayMode()) return;
      if (carouselAnimating) finishCarouselAnimation();
      isDragging = true;
      dragMoved = false;
      dragStartX = event.clientX;
      queuedDragX = getTranslateX();
      dragStartTranslateX = queuedDragX;
      const prevTargetX = getProjectedTargetXForIndex(currentIndex - 1);
      const nextTargetX = getProjectedTargetXForIndex(currentIndex + 1);
      dragMinX = Math.min(prevTargetX ?? queuedDragX, nextTargetX ?? queuedDragX);
      dragMaxX = Math.max(prevTargetX ?? queuedDragX, nextTargetX ?? queuedDragX);
      pendingPanelIndex = panels.indexOf(event.target.closest(".game-panel"));
      try {
        carousel.setPointerCapture(event.pointerId);
      } catch {
        // ignore
      }
      carousel.style.transition = "none";
    });

    carousel.addEventListener("pointermove", (event) => {
      if (!isDragging) return;

      const dx = event.clientX - dragStartX;
      const isPhone = window.matchMedia("(max-width: 768px)").matches;
      const dragMultiplier = isPhone ? 1 : 0.72;
      const adjustedDx = dx * dragMultiplier;

      if (dragMinX !== dragMaxX) {
        queuedDragX = applyDragResistance(
          queuedDragX,
          adjustedDx,
          dragMinX,
          dragMaxX
        );
      } else {
        queuedDragX += adjustedDx;
      }

      if (Math.abs(queuedDragX - dragStartTranslateX) > 3) dragMoved = true;
      dragStartX = event.clientX;

      if (!dragRaf) {
        dragRaf = requestAnimationFrame(() => {
          dragRaf = 0;
          setTranslateX(queuedDragX, false);
        });
      }
      event.preventDefault();
    }, { passive: false });

    const endDrag = () => {
      if (!isDragging) return;
      isDragging = false;
      if (dragRaf) {
        cancelAnimationFrame(dragRaf);
        dragRaf = 0;
        setTranslateX(queuedDragX, false);
      }
      if (dragMoved) {
        suppressPanelClickUntil = Date.now() + 150;
        snapToNearest(0, 1);
      } else if (
        pendingPanelIndex !== null &&
        pendingPanelIndex !== -1 &&
        pendingPanelIndex !== currentIndex &&
        Date.now() >= suppressPanelClickUntil
      ) {
        selectCarouselIndex(pendingPanelIndex, true);
      } else {
        centerActive(true, getCarouselDuration());
      }
      pendingPanelIndex = null;
    };

    carousel.addEventListener("pointerup", endDrag);
    carousel.addEventListener("pointercancel", endDrag);
  }

  panels.forEach((panel, index) => {
    panel.addEventListener("click", () => {
      if (helpOpen) return;
      if (isPlayMode()) return;
      if (carouselAnimating) return;
      if (Date.now() < suppressPanelClickUntil) return;
      if (index === currentIndex) return;

      selectCarouselIndex(index, true);
    });
  });

  if (playBtn && gameContainer) {
    playBtn.addEventListener("click", () => {
      if (helpOpen) closeHelpOverlay();

      if (!isPlayMode()) {
        try {
          history.pushState({ playMode: true }, "");
        } catch {
          // ignore
        }

        gameContainer.classList.add("expanded");
        hideOverlay();
        resumeActiveGame();
      } else {
        suppressScrollPauseUntil = Date.now() + 300;
        gameContainer.classList.remove("expanded");
        hideOverlay();
        pauseAllGames();
        drawAllOnce();
        requestAnimationFrame(hideOverlay);
      }

      updatePlayButton();
      requestAnimationFrame(() => {
        centerActive(false);
        positionPlayButton();
      });
    });
  }

  if (helpBtn) {
    helpBtn.addEventListener("click", (e) => {
      e.preventDefault();

      if (helpOpen) {
        closeHelpOverlay();
        return;
      }

      openHelpOverlay();
    });
  }

  if (helpOverlay) {
    helpOverlay.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      closeHelpOverlay();
    });
  }

  document.addEventListener("pointerdown", (event) => {
    if (helpOpen) {
      if (helpOverlay && helpOverlay.contains(event.target)) {
        event.preventDefault();
        closeHelpOverlay();
      }
      return;
    }

    if (!isPlayMode()) return;

    if (event.pointerType !== "touch" && Date.now() - lastTouchStartMs < 500) return;
    if (event.pointerType === "touch") lastTouchStartMs = Date.now();

    const pos = getCanvasPosFromClient(event.clientX, event.clientY);
    if (!pos) return;

    const activeGame = getActiveGame();
    if (activeGame?.isOver()) {
      activeGame.reset();
      event.preventDefault();
      return;
    }
    if (currentIndex === GAME_INDEX.car && carPaused && !carGameOver) resumeCarIfPaused();

    try {
      pos.canvas.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }

    handlePressAtClient(event.clientX, event.clientY);
    event.preventDefault();
  }, { passive: false });

  document.addEventListener("pointerup", handleReleasePress, { passive: true });
  document.addEventListener("pointercancel", handleReleasePress, { passive: true });
  document.addEventListener("pointerleave", handleReleasePress, { passive: true });
  document.addEventListener("keydown", handleGameKeyDown);
  document.addEventListener("keyup", handleGameKeyUp);

  document.addEventListener("pointermove", (event) => {
    if (!isPlayMode()) return;
    if (!holdLeft && !holdRight) return;

    const pos = getCanvasPosFromClient(event.clientX, event.clientY);
    if (!pos) clearHolds();
  }, { passive: true });

  setActive(currentIndex);
  updatePlayButton();
  updateHelpButton();
  hideOverlay();
  hideHelpOverlay();
  setAstCanvasSize();
  setCarCanvasSize();
  setInvCanvasSize();
  setBrickCanvasSize();
  setSnakeCanvasSize();

  games.forEach((game) => game.reset());
  drawEveryGameOnce();

  requestAnimationFrame(() => {
    centerActive(false);
    positionPlayButton();
    positionCarouselArrows();
    requestAnimationFrame(() => centerActive(false));
  });

  requestAnimationFrame(loop);
  requestTitleUpdate();
});
