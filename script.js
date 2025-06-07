// script.js
// ———————————————————————————————————————————————
// COMPLETE GAME LOGIC (old + updated)
// ———————————————————————————————————————————————

const canvas        = document.getElementById('gameCanvas');
const ctx           = canvas.getContext('2d');
const gameOverDiv   = document.getElementById('game-over');
const gameOverText  = document.getElementById('game-over-text');

let isPaused = false;
let gameOver  = false;

// Set canvas dimensions (unchanged)
canvas.width  = 500;
canvas.height = 700;

// Game variables
const laneCount      = 3;
const playerCarArt   = '[=]';
const obstacleArt    = '[#]';
let speed            = 5;      // px/frame (~300px/sec)
const acceleration   = 0.2;    // px/sec²
let score            = 0;
let highScore        = 0;
let lastObstacleSpawnTime = Date.now();
let lastTime         = null;

// Player & obstacles (unchanged)
let playerCar = { y: canvas.height - 100, lane: 1 };
let obstacles = [];

/** 
 * Calculate lane center X with proper perspective 
 * (narrow at top, wide at bottom) 
 */
function getLaneCenterX(lane, yPos) {
    const topW    = canvas.width / 3;
    const bottomW = canvas.width - 50;
    const t       = yPos / canvas.height;
    const roadW   = topW * (1 - t) + bottomW * t;
    const laneW   = roadW / laneCount;
    const offset  = (canvas.width - roadW) / 2;
    return offset + lane * laneW + laneW / 2;
}

/** Spawn 1–2 oncoming cars above the top edge */
function createObstacle() {
    const lanes = [0,1,2].sort(() => Math.random() - 0.5);
    const count = score < 50 ? 1 : 2;
    lanes.slice(0, count).forEach(lane => {
        obstacles.push({ x: lane, y: -50 }); // carHeight = 50
    });
}

/** Draw road, player, obstacles, and scoreboard */
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Road borders (unchanged)
    const topW    = canvas.width / 3;
    const bottomW = canvas.width - 50;
    ctx.strokeStyle = 'white';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo((canvas.width - topW)/2, 0);
    ctx.lineTo((canvas.width - bottomW)/2, canvas.height);
    ctx.moveTo((canvas.width + topW)/2, 0);
    ctx.lineTo((canvas.width + bottomW)/2, canvas.height);
    ctx.stroke();

    // Lane dividers (unchanged)
    ctx.setLineDash([15,15]);
    for (let i = 1; i < laneCount; i++) {
        const x1 = (canvas.width - topW)/2    + (topW    / laneCount) * i;
        const x2 = (canvas.width - bottomW)/2 + (bottomW / laneCount) * i;
        ctx.beginPath();
        ctx.moveTo(x1, 0);
        ctx.lineTo(x2, canvas.height);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    // UPDATE: use your original ASCII-text cars (spacing & font as before)
    ctx.fillStyle = 'white';
    ctx.font      = '20px Courier';
    const pWidth  = ctx.measureText(playerCarArt).width;
    const pX      = getLaneCenterX(playerCar.lane, playerCar.y) - pWidth / 2;
    ctx.fillText(playerCarArt, pX, playerCar.y);

    // Draw oncoming cars
    ctx.fillStyle = 'white';
    ctx.font      = '20px Courier';
    obstacles.forEach(o => {
        const oX = getLaneCenterX(o.x, o.y) - 10;
        ctx.fillText(obstacleArt, oX, o.y);
    });

    // Display score & high score in-game (unchanged)
    ctx.fillStyle = 'white';
    ctx.font      = '16px Arial';
    ctx.fillText(`Score: ${Math.floor(score)}`, 10, 20);
    ctx.fillText(`High Score: ${Math.floor(highScore)}`, 10, 40);
}

/** Show the game-over popup with both scores */
function displayGameOver() {
    gameOverText.innerHTML =
      `Your score:<br>${Math.floor(score)}<br><br>` +
      `New Highscore:<br>${Math.floor(highScore)}<br><br>` +
      `Press any key to try again.`;
    gameOverDiv.style.visibility = 'visible';
}

/** Show the pause popup */
function displayPauseMessage() {
    if (!isPaused && !gameOver) {
        isPaused = true;
        gameOverText.innerHTML = 'Game Paused.<br><br>Press any key to resume.';
        gameOverDiv.style.visibility = 'visible';
    }
}

/** Hide pop-up and resume game */
function resumeGame() {
    isPaused = false;
    gameOverDiv.style.visibility = 'hidden';
}

/** Reset everything for a fresh start */
function resetGame() {
    obstacles             = [];
    speed                 = 5;
    score                 = 0;
    lastObstacleSpawnTime = Date.now();
    gameOver              = false;
    isPaused              = false;
    gameOverDiv.style.visibility = 'hidden';
}

/** Update positions, spawn new cars, detect collisions */
function update(deltaTime) {
    if (isPaused || gameOver) return;

    // Speed & score ramp-up (unchanged)
    speed     += acceleration * deltaTime;
    score     += deltaTime * 10;
    highScore = Math.max(highScore, score);

    // Move cars downward
    const moveAmt = speed * (deltaTime * 60);
    obstacles.forEach(o => o.y += moveAmt);
    obstacles = obstacles.filter(o => o.y < canvas.height + 50);

    // Accurate hit-registration (AABB on your ASCII cars)
    const pW = ctx.measureText(playerCarArt).width;
    const pH = 20; // approx. font height
    const pX = getLaneCenterX(playerCar.lane, playerCar.y) - pW/2;
    const pY = playerCar.y - pH;
    for (let o of obstacles) {
        const oW = 20, oH = 20; // “[#]” approx
        const oX = getLaneCenterX(o.x, o.y) - oW/2;
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

    // Spawn logic (faster as you rack up points)
    const now = Date.now();
    if (now - lastObstacleSpawnTime > Math.max(300, 1000 - score * 2)) {
        createObstacle();
        lastObstacleSpawnTime = now;
    }
}

/** Main animation loop */
function mainLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    update(deltaTime);
    draw();
    requestAnimationFrame(mainLoop);
}

// Pause on scroll-away
window.addEventListener('scroll', displayPauseMessage);

// Controls: resume, reset, lane change
document.addEventListener('keydown', (e) => {
    if (gameOver)       resetGame();
    else if (isPaused)  resumeGame();
    else if (e.key === 'ArrowLeft')  playerCar.lane = Math.max(0, playerCar.lane - 1);
    else if (e.key === 'ArrowRight') playerCar.lane = Math.min(laneCount - 1, playerCar.lane + 1);
});

// Start
resetGame();
requestAnimationFrame(mainLoop);
