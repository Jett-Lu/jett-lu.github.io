
document.addEventListener("DOMContentLoaded", () => {

  function updatePlayButton() {
    const btn = document.getElementById("game-play");
    const container = document.getElementById("game-container");
    if (!btn || !container) return;
    btn.textContent = container.classList.contains("expanded") ? "Back" : "Play";
  }

  document.documentElement.classList.add("js");

  // -------------------------
  // Nav: hamburger
  // -------------------------
  const hamburger = document.getElementById("hamburger");
  const navLinks = document.getElementById("nav-links");
  if (hamburger && navLinks) {
    hamburger.addEventListener("click", () => navLinks.classList.toggle("show"));
  }

  // -------------------------
  // Fade-in
  // -------------------------
  const fadeEls = document.querySelectorAll(".fade-in-section");
  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        obs.unobserve(entry.target);
      });
    },
    { threshold: 0.1 }
  );
  fadeEls.forEach((el) => observer.observe(el));

  // -------------------------
  // GitHub projects
  // -------------------------
  async function loadProjects() {
    const container = document.getElementById("project-container");
    if (!container) return;

    container.innerHTML = "<p>Loading...</p>";
    try {
      const res = await fetch("https://api.github.com/users/Jett-Lu/repos");
      const allRepos = await res.json();
      const repos = Array.isArray(allRepos) ? allRepos.filter((r) => r && !r.fork) : [];
      const selected = repos.sort(() => 0.5 - Math.random()).slice(0, 3);

      container.innerHTML = "";
      for (const repo of selected) {
        const desc = repo.description || "No description provided.";
        let langList = "N/A";
        try {
          const langRes = await fetch(repo.languages_url);
          const langs = await langRes.json();
          langList = Object.keys(langs || {}).join(", ") || "N/A";
        } catch (e) {
          langList = "N/A";
        }

        const card = document.createElement("div");
        card.className = "project-card";
        card.innerHTML = `
          <h3>${repo.name}</h3>
          <p>${desc}</p>
          <p><strong>Languages:</strong> ${langList}</p>
          <a href="${repo.html_url}" target="_blank">View on GitHub →</a>
        `;
        container.appendChild(card);
      }

      if (!selected.length) container.innerHTML = "<p>No projects found.</p>";
    } catch (err) {
      console.error("GitHub fetch failed:", err);
      container.innerHTML = "<p>Failed to load projects 😢</p>";
    }
  }

  const refreshBtn = document.getElementById("refresh-projects");
  if (refreshBtn) refreshBtn.addEventListener("click", loadProjects);
  loadProjects();

  // -------------------------
  // Game UI elements
  // -------------------------
  const gameContainer = document.getElementById("game-container");
  const viewport = document.getElementById("game-carousel-viewport");
  const carousel = document.getElementById("game-carousel");
  const panels = Array.from(document.querySelectorAll(".game-panel"));
  const playBtn = document.getElementById("game-play");

  const overlay = document.getElementById("game-over");
  const overlayText = document.getElementById("game-over-text");
  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

  // Hold-to-move flags (for touch + mouse)
  let holdLeft = false;
  let holdRight = false;

  let currentIndex = panels.length >= 2 ? 1 : 0;

  function isPlayMode() {
    return gameContainer && gameContainer.classList.contains("expanded");
  }

  function setPlayButtonText() {
    if (!playBtn) return;
    playBtn.textContent = isPlayMode() ? "Back" : "Play";
  }

  function positionPlayButton() {
    const btn = document.getElementById("game-play");
    const container = document.getElementById("game-container");
    const activePanel = document.querySelector(".game-panel.active");
    if (!btn || !container || !activePanel) return;

    const c = container.getBoundingClientRect();
    const p = activePanel.getBoundingClientRect();

    const midY = (p.bottom + c.bottom) / 2;
    const topInside = midY - c.top - btn.offsetHeight / 2;

    const padding = 10;
    const maxTop = container.clientHeight - btn.offsetHeight - padding;
    const clampedTop = Math.max(padding, Math.min(maxTop, topInside));

    btn.style.top = `${clampedTop}px`;
  }

  function getActiveCanvas() {
    const activePanel = document.querySelector(".game-panel.active");
    if (!activePanel) return null;
    return activePanel.querySelector("canvas");
  }

  function getCanvasXFromClient(clientX) {
    const canvas = getActiveCanvas();
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return null;
    // Map from CSS pixels back to canvas pixels
    return (clientX - rect.left) * (canvas.width / rect.width);
  }

  function clearHolds() {
    holdLeft = false;
    holdRight = false;
  }


  function hideOverlay() {
    if (overlay) overlay.style.visibility = "hidden";
  }

  function showOverlay(score, highScore) {
    if (!overlay || !overlayText) return;
    const retry = isTouch ? "Press anywhere to try again." : "Press any key to try again.";
    overlayText.innerHTML =
      `Your score:<br>${Math.floor(score)}<br><br>` +
      `Highscore:<br>${Math.floor(highScore)}<br><br>` +
      retry;
    overlay.style.visibility = "visible";
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function setActive(index) {
    currentIndex = clamp(index, 0, panels.length - 1);
    panels.forEach((p) => p.classList.remove("active"));
    if (panels[currentIndex]) panels[currentIndex].classList.add("active");
  }

  function getTranslateX() {
    if (!carousel) return 0;
    const tr = window.getComputedStyle(carousel).transform;
    if (!tr || tr === "none") return 0;
    const m = tr.match(/matrix\(([^)]+)\)/);
    if (!m) return 0;
    const parts = m[1].split(",").map((s) => Number(s.trim()));
    return parts.length >= 6 ? parts[4] : 0;
  }

  function setTranslateX(x, animate) {
    if (!carousel) return;
    carousel.style.transition = animate ? "transform 220ms ease" : "none";
    carousel.style.transform = `translateX(${x}px)`;
  }

  function centerActive(animate) {
    if (!viewport || !carousel || !panels[currentIndex]) return;
    const vp = viewport.getBoundingClientRect();
    const ap = panels[currentIndex].getBoundingClientRect();
    const vpCenter = vp.left + vp.width / 2;
    const apCenter = ap.left + ap.width / 2;
    const delta = vpCenter - apCenter;
    setTranslateX(getTranslateX() + delta, animate);
  }

  // Drag only selection
  let isDragging = false;
  let dragStartX = 0;
  let dragOffset = 0;

  function snapToNearest() {
    if (!viewport || panels.length === 0) return;

    const vp = viewport.getBoundingClientRect();
    const vpCenter = vp.left + vp.width / 2;

    let bestIdx = currentIndex;
    let bestDist = Infinity;

    panels.forEach((p, idx) => {
      const r = p.getBoundingClientRect();
      const c = r.left + r.width / 2;
      const d = Math.abs(c - vpCenter);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = idx;
      }
    });

    setActive(bestIdx);
    dragOffset = 0;
    centerActive(true);
    drawAllOnce();
    positionPlayButton();
  }

  if (carousel) {
    carousel.addEventListener("pointerdown", (e) => {
      if (isPlayMode()) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragOffset = 0;
      carousel.setPointerCapture(e.pointerId);
      carousel.style.transition = "none";
    });

    carousel.addEventListener("pointermove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartX;
      dragOffset = dx * 0.45;
      setTranslateX(getTranslateX() + dragOffset, false);
      dragStartX = e.clientX;
    });

    const endDrag = () => {
      if (!isDragging) return;
      isDragging = false;
      snapToNearest();
    };

    carousel.addEventListener("pointerup", endDrag);
    carousel.addEventListener("pointercancel", endDrag);
  }

  if (playBtn && gameContainer) {
    playBtn.addEventListener("click", () => {
      if (!isPlayMode()) {
        gameContainer.classList.add("expanded");
        hideOverlay();
        resumeActiveGame();
      } else {
        gameContainer.classList.remove("expanded");
        hideOverlay();
        pauseAllGames();
        drawAllOnce();
      }
      setPlayButtonText();
      requestAnimationFrame(() => {
        centerActive(false);
        positionPlayButton();
      });
    });
  }

  window.addEventListener("resize", () => requestAnimationFrame(() => centerActive(false)));

  // Start centered on Game 2
  setActive(currentIndex);
  requestAnimationFrame(() => {
    centerActive(false);
    positionPlayButton();
    requestAnimationFrame(() => centerActive(false));
  });

  // -------------------------
  // Game 1: Car Dodger (restored)
  // -------------------------
  const carCanvas = document.getElementById("gameCanvas");
  const carCtx = carCanvas ? carCanvas.getContext("2d") : null;

  const laneCount = 3;
  const playerCarArt = "[=]";
  const obstacleArt = "[#]";

  let carSpeed = 5;
  const carAcceleration = 0.2;
  let carScore = 0;
  let carHighScore = 0;
  let lastObstacleSpawn = Date.now();
  let lastCarFrame = null;

  let playerCar = { y: 500, lane: 1 };
  let obstacles = [];
  let carPaused = false;
  let carGameOver = false;

  function setCarCanvasSize() {
    if (!carCanvas) return;
    carCanvas.width = 400;
    carCanvas.height = 600;
    playerCar.y = carCanvas.height - 100;
  }

  function getLaneCenterX(lane, yPos) {
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

    setCarCanvasSize();
    carCtx.clearRect(0, 0, carCanvas.width, carCanvas.height);

    const topW = carCanvas.width / 3;
    const bottomW = carCanvas.width - 50;
    carCtx.strokeStyle = "white";
    carCtx.lineWidth = 2;

    // Road edges
    carCtx.beginPath();
    carCtx.moveTo((carCanvas.width - topW) / 2, 0);
    carCtx.lineTo((carCanvas.width - bottomW) / 2, carCanvas.height);
    carCtx.moveTo((carCanvas.width + topW) / 2, 0);
    carCtx.lineTo((carCanvas.width + bottomW) / 2, carCanvas.height);
    carCtx.stroke();

    // Lane lines
    carCtx.setLineDash([15, 15]);
    for (let i = 1; i < laneCount; i++) {
      const x1 = (carCanvas.width - topW) / 2 + (topW / laneCount) * i;
      const x2 = (carCanvas.width - bottomW) / 2 + (bottomW / laneCount) * i;
      carCtx.beginPath();
      carCtx.moveTo(x1, 0);
      carCtx.lineTo(x2, carCanvas.height);
      carCtx.stroke();
    }
    carCtx.setLineDash([]);

    // Player + obstacles
    carCtx.fillStyle = "white";
    carCtx.font = "20px Courier";

    const pW = carCtx.measureText(playerCarArt).width;
    const pX = getLaneCenterX(playerCar.lane, playerCar.y) - pW / 2;
    carCtx.fillText(playerCarArt, pX, playerCar.y);

    obstacles.forEach((o) => {
      const oX = getLaneCenterX(o.lane, o.y) - 10;
      carCtx.fillText(obstacleArt, oX, o.y);
    });

    // Score
    carCtx.fillStyle = "white";
    carCtx.font = "16px Arial";
    carCtx.fillText(`Score: ${Math.floor(carScore)}`, 10, 20);
    carCtx.fillText(`High Score: ${Math.floor(carHighScore)}`, 10, 40);
  }

  function resetCarGame() {
    obstacles = [];
    carSpeed = 5;
    carScore = 0;
    lastObstacleSpawn = Date.now();
    carGameOver = false;
    carPaused = false;
    hideOverlay();
  }

  function updateCarGame(deltaTime) {
    if (!isPlayMode() || currentIndex !== 0) return;
    if (carPaused || carGameOver) return;

    carSpeed += carAcceleration * deltaTime;
    carScore += deltaTime * 10;
    carHighScore = Math.max(carHighScore, carScore);

    const moveAmt = carSpeed * (deltaTime * 60);
    obstacles.forEach((o) => (o.y += moveAmt));
    obstacles = obstacles.filter((o) => o.y < carCanvas.height + 50);

    const pW = carCtx.measureText(playerCarArt).width;
    const pH = 20;
    const pX = getLaneCenterX(playerCar.lane, playerCar.y) - pW / 2;
    const pY = playerCar.y - pH;

    for (const o of obstacles) {
      const oW = 20;
      const oH = 20;
      const oX = getLaneCenterX(o.lane, o.y) - oW / 2;
      const oY = o.y - oH;

      if (pX < oX + oW && pX + pW > oX && pY < oY + oH && pY + pH > oY) {
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

  // Pause on scroll only for active play
  window.addEventListener("scroll", () => {
    if (!isPlayMode() || currentIndex !== 0) return;
    if (carGameOver) return;
    carPaused = true;
    if (overlay && overlayText) {
      overlayText.innerHTML = "Game Paused.<br><br>Press anywhere to resume.";
      overlay.style.visibility = "visible";
    }
  });

  function resumeCarIfPaused() {
    if (!carPaused) return;
    carPaused = false;
    hideOverlay();
  }

  // -------------------------
  // Game 2: Space Invaders (fix black screen + keep score on next wave)
  // -------------------------
  const invCanvas = document.getElementById("invadersCanvas");
  const invCtx = invCanvas ? invCanvas.getContext("2d") : null;

  const inv = {
    shipX: 190,
    shipY: 540,
    bullets: [],
    aliens: [],
    dir: 1,
    speedX: 1.2,
    stepDown: 22,
    lastShot: 0,
    shotMs: 220,
    score: 0,
    high: 0,
    gameOver: false
  };

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

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        inv.aliens.push({ x: startX + c * gapX, y: startY + r * gapY, alive: true });
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
    hideOverlay();
    spawnInvaderWave();
  }

  function nextInvaderWave() {
    // Keep score, increase speed, clear bullets
    inv.bullets = [];
    inv.speedX += 0.6;
    spawnInvaderWave();
  }

  function drawInvaders() {
    if (!invCanvas || !invCtx) return;
    setInvCanvasSize();

    invCtx.clearRect(0, 0, invCanvas.width, invCanvas.height);
    invCtx.strokeStyle = "white";
    invCtx.strokeRect(0, 0, invCanvas.width, invCanvas.height);

    invCtx.font = "16px Arial";
    invCtx.fillStyle = "white";
    invCtx.fillText(`Score: ${Math.floor(inv.score)}`, 10, 20);
    invCtx.fillText(`High Score: ${Math.floor(inv.high)}`, 10, 40);

    // Keep drawing the last frame even when game over (avoid black screen)
    invCtx.font = "22px Courier";
    invCtx.fillText("/^\\", inv.shipX - 12, inv.shipY);

    invCtx.font = "20px Courier";
    inv.aliens.forEach((a) => {
      if (!a.alive) return;
      invCtx.fillText("W", a.x, a.y);
    });

    invCtx.font = "18px Courier";
    inv.bullets.forEach((b) => invCtx.fillText("|", b.x, b.y));
  }

  function updateInvaders() {
    if (!invCanvas || !invCtx) return;
    if (!isPlayMode() || currentIndex !== 1) return;
    if (inv.gameOver) return;

    // Hold-to-move (touch/mouse). Uses same speed as keyboard feel.
    if (holdLeft) inv.shipX -= 8;
    if (holdRight) inv.shipX += 8;

    const now = Date.now();
    if (now - inv.lastShot > inv.shotMs) {
      inv.lastShot = now;
      inv.bullets.push({ x: inv.shipX, y: inv.shipY - 18, dead: false });
    }

    inv.bullets.forEach((b) => (b.y -= 10));
    inv.bullets = inv.bullets.filter((b) => b.y > -20 && !b.dead);

    let hitEdge = false;
    inv.aliens.forEach((a) => {
      if (!a.alive) return;
      a.x += inv.speedX * inv.dir;
      if (a.x > 380 || a.x < 20) hitEdge = true;
    });

    if (hitEdge) {
      inv.dir *= -1;
      inv.aliens.forEach((a) => {
        if (!a.alive) return;
        a.y += inv.stepDown;
        if (a.y > inv.shipY - 40) inv.gameOver = true;
      });
    }

    inv.bullets.forEach((b) => {
      inv.aliens.forEach((a) => {
        if (!a.alive || b.dead) return;
        const dx = Math.abs(b.x - a.x);
        const dy = Math.abs(b.y - a.y);
        if (dx < 12 && dy < 12) {
          a.alive = false;
          b.dead = true;
          inv.score += 10;
        }
      });
    });

    if (!inv.aliens.some((a) => a.alive)) {
      nextInvaderWave();
    }

    if (inv.gameOver) {
      inv.high = Math.max(inv.high, inv.score);
      showOverlay(inv.score, inv.high);
    }
  }

  // -------------------------
  // Game 3: Brick Breaker (make sure it exists)
  // -------------------------
  const brickCanvas = document.getElementById("brickCanvas");
  const brickCtx = brickCanvas ? brickCanvas.getContext("2d") : null;

  const brick = {
    score: 0,
    high: 0,
    gameOver: false,
    paddleX: 156,
    ballX: 200,
    ballY: 360,
    ballDX: 2.6,
    ballDY: -2.8,
    bricks: []
  };

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
    brick.paddleX = 156;
    brick.ballX = 200;
    brick.ballY = 360;
    brick.ballDX = 2.6;
    brick.ballDY = -2.8;

    brick.bricks = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 9; col++) {
        brick.bricks.push({ x: 28 + col * 40, y: 90 + row * 24, alive: true });
      }
    }

    hideOverlay();
  }

  function drawBrick() {
    if (!brickCanvas || !brickCtx) return;
    setBrickCanvasSize();

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
    brick.bricks.forEach((b) => {
      if (b.alive) brickCtx.fillText("[#]", b.x, b.y);
    });
  }

  function updateBrick() {
    if (!brickCanvas || !brickCtx) return;
    if (!isPlayMode() || currentIndex !== 2) return;
    if (brick.gameOver) return;

    // Hold-to-move (touch/mouse)
    if (holdLeft) brick.paddleX -= 9;
    if (holdRight) brick.paddleX += 9;

    brick.ballX += brick.ballDX;
    brick.ballY += brick.ballDY;

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

    for (const b of brick.bricks) {
      if (!b.alive) continue;
      const dx = Math.abs(brick.ballX - (b.x + 10));
      const dy = Math.abs(brick.ballY - (b.y - 8));
      if (dx < 16 && dy < 16) {
        b.alive = false;
        brick.ballDY *= -1;
        brick.score += 10;
        break;
      }
    }

    if (!brick.bricks.some((b) => b.alive)) {
      brick.gameOver = true;
      brick.high = Math.max(brick.high, brick.score);
      showOverlay(brick.score, brick.high);
    }

    if (brick.ballY >= 592) {
      brick.gameOver = true;
      brick.high = Math.max(brick.high, brick.score);
      showOverlay(brick.score, brick.high);
    }
  }

  // -------------------------
  // Controls + retry
  // -------------------------
  // Touch and mouse controls (tap or hold on left/right half of the active canvas)
  // -------------------------
  function handlePressAtClientX(clientX) {
    if (!isPlayMode()) return;
    const x = getCanvasXFromClient(clientX);
    if (x === null) return;

    // Game 1: Car dodger (tap to change lanes)
    if (currentIndex === 0 && !carGameOver) {
      if (carPaused) resumeCarIfPaused();
      if (x < 200) playerCar.lane = Math.max(0, playerCar.lane - 1);
      else playerCar.lane = Math.min(2, playerCar.lane + 1);
      return;
    }

    // Game 2/3: hold to move
    holdLeft = x < 200;
    holdRight = x >= 200;
    if (currentIndex === 1 && invPaused) resumeInvadersIfPaused?.();
    if (currentIndex === 2 && brickPaused) resumeBrickIfPaused?.();
  }

  function handleReleasePress() {
    clearHolds();
  }

  // Pointer events cover mouse + touch on modern browsers
  document.addEventListener("pointerdown", (e) => {
    if (!isPlayMode()) return;
    handlePressAtClientX(e.clientX);
  }, { passive: false });

  document.addEventListener("pointerup", handleReleasePress, { passive: true });
  document.addEventListener("pointercancel", handleReleasePress, { passive: true });
  document.addEventListener("pointerleave", handleReleasePress, { passive: true });

  // Fallback for older iOS Safari if needed
  document.addEventListener("touchstart", (e) => {
    if (!isPlayMode()) return;
    if (!e.touches || !e.touches[0]) return;
    handlePressAtClientX(e.touches[0].clientX);
    e.preventDefault();
  }, { passive: false });

  document.addEventListener("touchend", handleReleasePress, { passive: true });
  document.addEventListener("touchcancel", handleReleasePress, { passive: true });

  // -------------------------
  document.addEventListener("keydown", (e) => {
    if (!isPlayMode()) return;

    // Retry on any key
    if (currentIndex === 0 && carGameOver) {
      resetCarGame();
      return;
    }
    if (currentIndex === 1 && inv.gameOver) {
      resetInvadersGame();
      return;
    }
    if (currentIndex === 2 && brick.gameOver) {
      resetBrickGame();
      return;
    }

    if (currentIndex === 0) {
      if (carPaused) {
        resumeCarIfPaused();
        return;
      }
      if (e.key === "ArrowLeft") playerCar.lane = Math.max(0, playerCar.lane - 1);
      if (e.key === "ArrowRight") playerCar.lane = Math.min(laneCount - 1, playerCar.lane + 1);
    }

    if (currentIndex === 1) {
      if (e.key === "ArrowLeft") inv.shipX = Math.max(20, inv.shipX - 10);
      if (e.key === "ArrowRight") inv.shipX = Math.min(380, inv.shipX + 10);
    }

    if (currentIndex === 2) {
      if (e.key === "ArrowLeft") brick.paddleX = Math.max(10, brick.paddleX - 14);
      if (e.key === "ArrowRight") brick.paddleX = Math.min(310, brick.paddleX + 14);
    }
  });

  document.addEventListener(
    "touchstart",
    () => {
      if (!isPlayMode()) return;

      // Retry on tap
      if (currentIndex === 0 && carGameOver) resetCarGame();
      if (currentIndex === 1 && inv.gameOver) resetInvadersGame();
      if (currentIndex === 2 && brick.gameOver) resetBrickGame();

      // Also resume car if paused
      if (currentIndex === 0 && carPaused && !carGameOver) resumeCarIfPaused();
    },
    { passive: true }
  );

  function pauseAllGames() {
    // Logic gates in update loops effectively pause games.
  }

  function resumeActiveGame() {
    if (currentIndex === 0) resetCarGame();
    if (currentIndex === 1) resetInvadersGame();
    if (currentIndex === 2) resetBrickGame();
  }

  function drawAllOnce() {
    drawCarGame();
    drawInvaders();
    drawBrick();
  }

  // -------------------------
  // Main loop
  // -------------------------
  function loop(ts) {
    if (!lastCarFrame) lastCarFrame = ts;
    const dt = (ts - lastCarFrame) / 1000;
    lastCarFrame = ts;

    updateCarGame(dt);
    updateInvaders();
    updateBrick();

    // Draw always so non-active panels are not black.
    drawCarGame();
    drawInvaders();
    drawBrick();

    requestAnimationFrame(loop);
  
  updatePlayButton();
}

  // Init
  setPlayButtonText();
  hideOverlay();
  setCarCanvasSize();
  setInvCanvasSize();
  setBrickCanvasSize();

  resetCarGame();
  resetInvadersGame();
  resetBrickGame();
  drawAllOnce();

  requestAnimationFrame(loop);
});
