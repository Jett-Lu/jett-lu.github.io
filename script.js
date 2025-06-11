document.addEventListener("DOMContentLoaded", () => {

  // ———————————————————————————————
  // MENU TOGGLE (hamburger on mobile, full nav on desktop)
  // ———————————————————————————————
  const menuToggle = document.getElementById("menu-toggle");
  const mainNav    = document.getElementById("main-nav");

  if (menuToggle && mainNav) {
    menuToggle.addEventListener("click", () => {
      mainNav.classList.toggle("active");
    });

    function adjustNav() {
      if (window.innerWidth > 768) {
        mainNav.classList.add("active");
        menuToggle.style.display = "none";
      } else {
        mainNav.classList.remove("active");
        menuToggle.style.display = "block";
      }
    }

    window.addEventListener("resize", adjustNav);
    adjustNav();
  }

  // ———————————————————————————————
  // 🕹️ GAME SECTION
  // ———————————————————————————————

  const canvas        = document.getElementById("gameCanvas");
  const ctx           = canvas.getContext("2d");
  const gameOverDiv   = document.getElementById("game-over");
  const gameOverText  = document.getElementById("game-over-text");

  let isPaused = false;
  let gameOver = false;

  canvas.width  = 500;
  canvas.height = 700;

  const laneCount    = 3;
  const playerCarArt = "[=]";
  const obstacleArt  = "[#]";

  let speed                 = 5;
  const acceleration        = 0.2;
  let score                 = 0;
  let highScore             = 0;
  let lastObstacleSpawnTime = Date.now();
  let lastTime              = null;

  let playerCar = { y: canvas.height - 100, lane: 1 };
  let obstacles = [];

  function getLaneCenterX(lane, yPos) {
    const topW    = canvas.width / 3;
    const bottomW = canvas.width - 50;
    const t       = yPos / canvas.height;
    const roadW   = topW * (1 - t) + bottomW * t;
    const laneW   = roadW / laneCount;
    const offset  = (canvas.width - roadW) / 2;
    return offset + lane * laneW + laneW / 2;
  }

  function createObstacle() {
    const lanes = [0, 1, 2].sort(() => 0.5 - Math.random());
    const count = score < 50 ? 1 : 2;
    lanes.slice(0, count).forEach(lane => {
      obstacles.push({ x: lane, y: -50 });
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const topW    = canvas.width / 3;
    const bottomW = canvas.width - 50;
    ctx.strokeStyle = "white";
    ctx.lineWidth   = 2;

    // Road edges
    ctx.beginPath();
    ctx.moveTo((canvas.width - topW) / 2, 0);
    ctx.lineTo((canvas.width - bottomW) / 2, canvas.height);
    ctx.moveTo((canvas.width + topW) / 2, 0);
    ctx.lineTo((canvas.width + bottomW) / 2, canvas.height);
    ctx.stroke();

    // Lane dividers
    ctx.setLineDash([15, 15]);
    for (let i = 1; i < laneCount; i++) {
      const x1 = (canvas.width - topW) / 2 + (topW / laneCount) * i;
      const x2 = (canvas.width - bottomW) / 2 + (bottomW / laneCount) * i;
      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.lineTo(x2, canvas.height);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Player car
    ctx.fillStyle = "white";
    ctx.font      = "20px Courier";
    const pWidth  = ctx.measureText(playerCarArt).width;
    const pX      = getLaneCenterX(playerCar.lane, playerCar.y) - pWidth / 2;
    ctx.fillText(playerCarArt, pX, playerCar.y);

    // Obstacles
    obstacles.forEach(o => {
      const oX = getLaneCenterX(o.x, o.y) - 10;
      ctx.fillText(obstacleArt, oX, o.y);
    });

    // Score HUD
    ctx.fillStyle = "white";
    ctx.font      = "16px Arial";
    ctx.fillText(`Score: ${Math.floor(score)}`, 10, 20);
    ctx.fillText(`High Score: ${Math.floor(highScore)}`, 10, 40);
  }

  function displayGameOver() {
    gameOverText.innerHTML =
      `Your score<br>${Math.floor(score)}<br><br>` +
      `Highscore<br>${Math.floor(highScore)}<br><br>` +
      `Press any key to try again.`;
    gameOverDiv.style.visibility = "visible";
  }

  function displayPauseMessage() {
    if (!isPaused && !gameOver) {
      isPaused = true;
      gameOverText.innerHTML = "Game Paused<br><br>Press any key to resume.";
      gameOverDiv.style.visibility = "visible";
    }
  }

  function resumeGame() {
    isPaused = false;
    gameOverDiv.style.visibility = "hidden";
  }

  function resetGame() {
    obstacles             = [];
    speed                 = 5;
    score                 = 0;
    lastObstacleSpawnTime = Date.now();
    gameOver              = false;
    isPaused              = false;
    gameOverDiv.style.visibility = "hidden";
  }

  function update(deltaTime) {
    if (isPaused || gameOver) return;

    speed     += acceleration * deltaTime;
    score     += deltaTime * 10;
    highScore = Math.max(highScore, score);

    const moveAmt = speed * (deltaTime * 60);
    obstacles.forEach(o => o.y += moveAmt);
    obstacles = obstacles.filter(o => o.y < canvas.height + 50);

    // Hitbox detection
    const pW = ctx.measureText(playerCarArt).width;
    const pH = 20;
    const pX = getLaneCenterX(playerCar.lane, playerCar.y) - pW / 2;
    const pY = playerCar.y - pH;
    for (let o of obstacles) {
      const oW = 20, oH = 20;
      const oX = getLaneCenterX(o.x, o.y) - oW / 2;
      const oY = o.y - oH;
      if (
        pX < oX + oW &&
        pX + pW > oX &&
        pY < oY + oH &&
        pY + pH > oY
      ) {
        gameOver = true;
        displayGameOver();
        break;
      }
    }

    const now = Date.now();
    if (now - lastObstacleSpawnTime > Math.max(300, 1000 - score * 2)) {
      createObstacle();
      lastObstacleSpawnTime = now;
    }
  }

  function mainLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime       = timestamp;

    update(deltaTime);
    draw();
    requestAnimationFrame(mainLoop);
  }

  // Keyboard controls
  document.addEventListener("keydown", e => {
    if (gameOver)      resetGame();
    else if (isPaused) resumeGame();
    else if (e.key === "ArrowLeft")  playerCar.lane = Math.max(0, playerCar.lane - 1);
    else if (e.key === "ArrowRight") playerCar.lane = Math.min(laneCount - 1, playerCar.lane + 1);
  });

  // Touch steering
  canvas.addEventListener("touchstart", e => {
    e.preventDefault();
    const rect   = canvas.getBoundingClientRect();
    const touchX = e.touches[0].clientX - rect.left;
    const half   = rect.width / 2;
    if (touchX < half)      playerCar.lane = Math.max(0, playerCar.lane - 1);
    else                    playerCar.lane = Math.min(laneCount - 1, playerCar.lane + 1);
  });

  // Touch restart/resume
  gameOverDiv.addEventListener("touchstart", e => {
    e.preventDefault();
    if (gameOver)      resetGame();
    else if (isPaused) resumeGame();
  }, { passive: false });

  // Pause on scroll
  window.addEventListener("scroll", displayPauseMessage);

  // Start game loop
  resetGame();
  requestAnimationFrame(mainLoop);

  // ———————————————————————————————
  // GITHUB PROJECT SECTION
  // ———————————————————————————————
  async function loadProjects() {
    const container = document.getElementById("project-container");
    if (!container) return;

    container.innerHTML = "<p>Loading...</p>";

    try {
      const res      = await fetch("https://api.github.com/users/Jett-Lu/repos");
      if (!res.ok) throw new Error(res.status);
      const allRepos = await res.json();
      const repos    = allRepos.filter(r => !r.fork);
      const selected = repos.sort(() => 0.5 - Math.random()).slice(0, 3);

      container.innerHTML = "";

      for (const repo of selected) {
        const desc = repo.description || "No description provided.";
        let langList = "N/A";

        try {
          const langRes = await fetch(repo.languages_url);
          const langs   = await langRes.json();
          langList      = Object.keys(langs).join(", ") || "N/A";
        } catch {}

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
    } catch (err) {
      console.error("GitHub fetch failed:", err);
      document.getElementById("project-container").innerHTML = "<p>Failed to load projects 😢</p>";
    }
  }

  const refreshBtn = document.getElementById("refresh-projects");
  if (refreshBtn) refreshBtn.addEventListener("click", loadProjects);
  loadProjects();

  // ———————————————————————————————
  // FADE-IN ON SCROLL
  // ———————————————————————————————
  const fadeEls = document.querySelectorAll(".fade-in-section");
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  fadeEls.forEach(el => observer.observe(el));

});

// 🍔 Toggle mobile menu
const hamburger = document.getElementById('hamburger');
const menu = document.querySelector('.menu');
if (hamburger && menu) {
  hamburger.addEventListener('click', () => {
    menu.classList.toggle('show');
  });
}

// 📱 Mobile tap support for game restart and controls
canvas.addEventListener('click', () => {
  if (gameOver) resetGame();
  else if (isPaused) resumeGame();
});

// 📱 Mobile left/right tap to move
canvas.addEventListener('touchstart', (e) => {
  const touchX = e.touches[0].clientX;
  const canvasMid = canvas.getBoundingClientRect().left + canvas.offsetWidth / 2;
  if (touchX < canvasMid) {
    playerCar.lane = Math.max(0, playerCar.lane - 1);
  } else {
    playerCar.lane = Math.min(laneCount - 1, playerCar.lane + 1);
  }
});
