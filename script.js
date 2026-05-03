document.addEventListener("DOMContentLoaded", () => {
  const PROJECTS_CACHE_KEY = "jl_projects_cache_v1";
  const PROJECTS_CACHE_TTL_MS = 1000 * 60 * 30;
  const PROJECTS_QUEUE_KEY = "jl_projects_queue_v1";
  const PROJECT_LIMIT = 3;
  const FEATURED_TOPIC = "featured";
  const GITHUB_REPOS_URL = "https://api.github.com/users/Jett-Lu/repos?per_page=100&sort=updated&type=owner";
  const GITHUB_API_HEADERS = { Accept: "application/vnd.github+json" };
  const HIGH_SCORE_KEYS = {
    car: "jl_highscore_car",
    invaders: "jl_highscore_invaders",
    brick: "jl_highscore_brick"
  };

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
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
  const helpTitle = document.getElementById("game-help-title");
  const helpText = document.getElementById("game-help-text");
  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

  const carCanvas = document.getElementById("gameCanvas");
  const carCtx = carCanvas ? carCanvas.getContext("2d") : null;
  const invCanvas = document.getElementById("invadersCanvas");
  const invCtx = invCanvas ? invCanvas.getContext("2d") : null;
  const brickCanvas = document.getElementById("brickCanvas");
  const brickCtx = brickCanvas ? brickCanvas.getContext("2d") : null;

  if (carCanvas) carCanvas.style.touchAction = "none";
  if (invCanvas) invCanvas.style.touchAction = "none";
  if (brickCanvas) brickCanvas.style.touchAction = "none";

  let titleRaf = 0;
  let holdLeft = false;
  let holdRight = false;
  let lastTouchStartMs = 0;
  let currentIndex = panels.length >= 2 ? 1 : 0;
  let isDragging = false;
  let dragStartX = 0;
  let dragMoved = false;
  let pendingPanelIndex = null;
  let suppressPanelClickUntil = 0;
  let lastCarFrame = null;
  let helpOpen = false;

  const laneCount = 3;
  const playerCarArt = "[=]";
  const obstacleArt = "[#]";

  const storedScores = {
    car: readStoredNumber(HIGH_SCORE_KEYS.car),
    invaders: readStoredNumber(HIGH_SCORE_KEYS.invaders),
    brick: readStoredNumber(HIGH_SCORE_KEYS.brick)
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

  let invPaused = false;
  let brickPaused = false;

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
    if (prefersReducedMotion.matches || typeof IntersectionObserver !== "function") {
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

  function sanitizeUrl(value) {
    try {
      const url = new URL(String(value));
      if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
    } catch {
      // ignore
    }
    return "https://github.com/Jett-Lu";
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
    link.href = sanitizeUrl(repo.html_url);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "View on GitHub →";

    card.append(title, description, languages, link);
    return card;
  }

  async function loadProjects(opts = { force: false }) {
    if (!projectContainer) return;

    projectContainer.innerHTML = "<p>Loading featured projects...</p>";

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

      projectContainer.innerHTML = "";

      for (const repo of selected) {
        let langList = "N/A";

        try {
          const langCacheKey = `jl_lang_${repo.name}`;
          const cachedLang = sessionStorage.getItem(langCacheKey);
          if (cachedLang) {
            langList = cachedLang;
          } else {
            const langRes = await fetch(repo.languages_url, { headers: GITHUB_API_HEADERS });
            if (!langRes.ok) throw new Error(`GitHub API request failed with status ${langRes.status}`);
            const langs = await langRes.json();
            langList = Object.keys(langs || {}).join(", ") || "N/A";
            sessionStorage.setItem(langCacheKey, langList);
          }
        } catch {
          langList = "N/A";
        }

        projectContainer.appendChild(createProjectCard(repo, langList));
      }

      if (!selected.length) {
        projectContainer.innerHTML = "<p>No featured projects found.</p>";
      }
    } catch (err) {
      console.error("GitHub fetch failed:", err);
      projectContainer.innerHTML = "<p>Failed to load featured projects. Please try again.</p>";
    }
  }

  function isPlayMode() {
    return Boolean(gameContainer && gameContainer.classList.contains("expanded"));
  }

  function clearHolds() {
    holdLeft = false;
    holdRight = false;
  }

  function showMessageOverlay(messageHtml) {
    if (!overlay || !overlayText) return;
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    overlayText.innerHTML = messageHtml;
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

  function getHelpContent() {
    if (currentIndex === 0) {
      return {
        controls: "Use arrow keys or hold left/right to move.",
        summary: "Clear the aliens before they reach you."
      };
    }

    if (currentIndex === 1) {
      return {
        controls: "Use arrow keys or tap left/right to move.",
        summary: "Dodge cars and survive as long as possible."
      };
    }

    return {
      controls: "Use arrow keys or hold left/right to move.",
      summary: "Break all bricks without dropping the ball."
    };
  }

  function openHelpOverlay() {
    if (!helpOverlay || !helpTitle || !helpText) return;
    if (isPlayMode()) return;

    hideOverlay();

    const content = getHelpContent();
    helpTitle.textContent = "How to play";
    helpText.innerHTML =
      `<div class="help-section">` +
      `<span>${content.controls}</span>` +
      `</div>` +
      `<div class="help-section">` +
      `<span>${content.summary}</span>` +
      `</div>` +
      `<div class="help-section help-dismiss">` +
      `<span>Click or tap the game to resume.</span>` +
      `</div>`;
    helpOverlay.hidden = false;
    helpOverlay.setAttribute("aria-hidden", "false");
    helpOverlay.style.visibility = "visible";
    helpOpen = true;
    updateHelpButton();
    if (helpOverlay) helpOverlay.focus();
  }

  function showOverlay(score, highScore) {
    const retry = "Click or tap the game to try again.";
    showMessageOverlay(
      `Your score:<br>${Math.floor(score)}<br><br>` +
      `Highscore:<br>${Math.floor(highScore)}<br><br>` +
      retry
    );
  }

  function showPauseOverlay() {
    showMessageOverlay("Game Paused.<br><br>Click or tap the game to resume.");
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
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

  function setActive(index) {
    currentIndex = clamp(index, 0, panels.length - 1);
    panels.forEach((panel, panelIndex) => {
      const isActivePanel = panelIndex === currentIndex;
      panel.classList.toggle("active", isActivePanel);
      panel.setAttribute("aria-hidden", String(!isActivePanel));
      panel.tabIndex = isActivePanel ? 0 : -1;
    });
    if (helpOpen && helpTitle && helpText) {
      const content = getHelpContent();
      helpTitle.textContent = "How to play";
      helpText.innerHTML =
        `<div class="help-section">` +
        `<span>${content.controls}</span>` +
        `</div>` +
        `<div class="help-section">` +
        `<span>${content.summary}</span>` +
        `</div>` +
        `<div class="help-section help-dismiss">` +
        `<span>Click or tap the game to resume.</span>` +
        `</div>`;
    }
    updateCarouselArrows();
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
    if (next === currentIndex) return;

    setActive(next);
    centerActive(true);
    drawAllOnce();
    positionPlayButton();
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

    const translateMatch = transform.match(/translateX\((-?\d+(?:\.\d+)?)px\)/);
    return translateMatch ? Number(translateMatch[1]) : 0;
  }

  function setTranslateX(x, animate) {
    if (!carousel) return;
    carousel.style.transition = animate ? "transform 220ms ease" : "none";
    carousel.style.transform = `translateX(${x}px)`;
  }

  function centerActive(animate) {
    if (!viewport || !carousel || !panels[currentIndex]) return;
    const viewportRect = viewport.getBoundingClientRect();
    const activeRect = panels[currentIndex].getBoundingClientRect();
    const viewportCenter = viewportRect.left + viewportRect.width / 2;
    const activeCenter = activeRect.left + activeRect.width / 2;
    setTranslateX(getTranslateX() + (viewportCenter - activeCenter), animate);
  }

  function snapToNearest() {
    if (!viewport || panels.length === 0) return;

    const viewportRect = viewport.getBoundingClientRect();
    const viewportCenter = viewportRect.left + viewportRect.width / 2;

    let bestIdx = currentIndex;
    let bestDist = Infinity;

    panels.forEach((panel, index) => {
      const rect = panel.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const distance = Math.abs(center - viewportCenter);
      if (distance < bestDist) {
        bestDist = distance;
        bestIdx = index;
      }
    });

    setActive(bestIdx);
    centerActive(true);
    drawAllOnce();
    positionPlayButton();
  }

  function updateStoredHighScore(key, currentHigh, candidate) {
    if (candidate <= currentHigh) return currentHigh;
    writeStoredNumber(key, candidate);
    return candidate;
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
    if (!carCanvas || !carCtx || !isPlayMode() || currentIndex !== 1) return;
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
    if (!invCanvas || !invCtx || !isPlayMode() || currentIndex !== 0) return;
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
    if (!brickCanvas || !brickCtx || !isPlayMode() || currentIndex !== 2) return;
    if (brick.gameOver || brickPaused) return;

    const paddleSpeed = 540;
    if (holdLeft) brick.paddleX -= paddleSpeed * dt;
    if (holdRight) brick.paddleX += paddleSpeed * dt;

    brick.paddleX = clamp(brick.paddleX, 10, 310);

    const ballSpeedScale = dt * 60;
    brick.ballX += brick.ballDX * ballSpeedScale;
    brick.ballY += brick.ballDY * ballSpeedScale;

    if (brick.ballX <= 10 || brick.ballX >= 390) brick.ballDX *= -1;
    if (brick.ballY <= 60) brick.ballDY *= -1;

    const paddleY = 548;
    if (brick.ballY >= paddleY && brick.ballY <= paddleY + 14) {
      if (brick.ballX >= brick.paddleX && brick.ballX <= brick.paddleX + 80) {
        brick.ballDY = -Math.abs(brick.ballDY);
        const hit = (brick.ballX - (brick.paddleX + 40)) / 40;
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

  function handlePressAtClient(clientX, clientY) {
    if (!isPlayMode()) return;
    const pos = getCanvasPosFromClient(clientX, clientY);
    if (!pos) return;
    const x = pos.x;

    if (currentIndex === 0 && invPaused && !inv.gameOver) {
      resumeInvadersIfPaused();
      return;
    }
    if (currentIndex === 2 && brickPaused && !brick.gameOver) {
      resumeBrickIfPaused();
      return;
    }

    if (currentIndex === 1 && !carGameOver) {
      if (carPaused) resumeCarIfPaused();
      const mid = carCanvas ? carCanvas.width / 2 : 200;

      if (x < mid) {
        playerCar.lane = Math.max(0, playerCar.lane - 1);
      } else {
        playerCar.lane = Math.min(laneCount - 1, playerCar.lane + 1);
      }
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

    if (currentIndex === 1) {
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

    if (currentIndex === 0) {
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

    if (currentIndex === 2) {
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
    if (!carGameOver) carPaused = true;
    if (!inv.gameOver) invPaused = true;
    if (!brick.gameOver) brickPaused = true;
  }

  function resumeActiveGame() {
    if (currentIndex === 0) resetInvadersGame();
    if (currentIndex === 1) resetCarGame();
    if (currentIndex === 2) resetBrickGame();
  }

  function drawAllOnce() {
    drawCarGame();
    drawInvaders();
    drawBrick();
  }

  function loop(ts) {
    if (!lastCarFrame) lastCarFrame = ts;
    const dt = (ts - lastCarFrame) / 1000;
    lastCarFrame = ts;

    updateCarGame(dt);
    updateInvaders(dt);
    updateBrick(dt);

    drawCarGame();
    drawInvaders();
    drawBrick();

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
    refreshBtn.addEventListener("click", () => loadProjects({ force: true }));
  }

  setFadeInState();
  loadProjects({ force: false });

  window.addEventListener("scroll", requestTitleUpdate, { passive: true });
  window.addEventListener("resize", () => {
    requestTitleUpdate();
    requestAnimationFrame(() => {
      centerActive(false);
      positionPlayButton();
    });
  });

  window.addEventListener("popstate", () => {
    if (!isPlayMode() || !gameContainer) return;

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

    if (currentIndex === 1) {
      if (carGameOver) return;
      carPaused = true;
    } else if (currentIndex === 0) {
      if (inv.gameOver) return;
      pauseInvaders();
      return;
    } else if (currentIndex === 2) {
      if (brick.gameOver || brickPaused) return;
      pauseBrick();
      return;
    } else {
      return;
    }

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
      isDragging = true;
      dragMoved = false;
      dragStartX = event.clientX;
      pendingPanelIndex = panels.indexOf(event.target.closest(".game-panel"));
      carousel.setPointerCapture(event.pointerId);
      carousel.style.transition = "none";
    });

    carousel.addEventListener("pointermove", (event) => {
      if (!isDragging) return;

      const dx = event.clientX - dragStartX;
      if (Math.abs(dx) > 3) dragMoved = true;
      const isPhone = window.matchMedia("(max-width: 768px)").matches;
      const dragMultiplier = isPhone ? 1.1 : 0.45;

      setTranslateX(getTranslateX() + dx * dragMultiplier, false);
      dragStartX = event.clientX;
    });

    const endDrag = () => {
      if (!isDragging) return;
      isDragging = false;
      if (dragMoved) {
        suppressPanelClickUntil = Date.now() + 150;
        snapToNearest();
      } else if (
        pendingPanelIndex !== null &&
        pendingPanelIndex !== -1 &&
        pendingPanelIndex !== currentIndex &&
        Date.now() >= suppressPanelClickUntil
      ) {
        setActive(pendingPanelIndex);
        centerActive(true);
        drawAllOnce();
        positionPlayButton();
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
      if (Date.now() < suppressPanelClickUntil) return;
      if (index === currentIndex) return;

      setActive(index);
      centerActive(true);
      drawAllOnce();
      positionPlayButton();
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
        gameContainer.classList.remove("expanded");
        hideOverlay();
        pauseAllGames();
        drawAllOnce();
      }

      updatePlayButton();
      requestAnimationFrame(() => {
        centerActive(false);
        positionPlayButton();
      });
    });
  }

  if (helpBtn) {
    helpBtn.addEventListener("click", () => {
      if (helpOpen) {
        closeHelpOverlay();
        return;
      }

      openHelpOverlay();
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

    if (currentIndex === 1 && carGameOver) {
      resetCarGame();
      event.preventDefault();
      return;
    }
    if (currentIndex === 0 && inv.gameOver) {
      resetInvadersGame();
      event.preventDefault();
      return;
    }
    if (currentIndex === 2 && brick.gameOver) {
      resetBrickGame();
      event.preventDefault();
      return;
    }
    if (currentIndex === 1 && carPaused && !carGameOver) resumeCarIfPaused();

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
  setCarCanvasSize();
  setInvCanvasSize();
  setBrickCanvasSize();

  resetCarGame();
  resetInvadersGame();
  resetBrickGame();
  drawAllOnce();

  requestAnimationFrame(() => {
    centerActive(false);
    positionPlayButton();
    requestAnimationFrame(() => centerActive(false));
  });

  requestAnimationFrame(loop);
  requestTitleUpdate();
});
