const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameOverDiv = document.getElementById('game-over');
const gameOverText = document.getElementById('game-over-text');

// Set canvas dimensions for a larger game map
canvas.width = 500;
canvas.height = 700;

// Game variables
const laneCount = 3;
const carWidth = 60;
const carHeight = 50;
let playerCar = { y: canvas.height - carHeight * 2, lane: 1 };
let obstacles = [];
let speed = 0.5; // Start with a slower speed
let score = 0;
let highScore = 0;
let gameRunning = true;
let lastObstacleSpawnTime = 0; // To control the timing between car spawns

// ASCII Art
const playerCarArt = "[=]";
const obstacleArt = "[#]";

// Create obstacles ensuring no more than two cars per row and proper gaps
function createObstacle() {
    const lanes = [0, 1, 2];

    // Decide how many obstacles to spawn based on score
    let obstacleCount;
    if (score < 50) {
        obstacleCount = 1; // Start with 1 obstacle per row
    } else if (score < 200) {
        obstacleCount = 1 + Math.floor(Math.random() * 2); // Randomly 1 or 2 obstacles
    } else {
        obstacleCount = 2;
    }

    // Shuffle lanes
    for (let i = lanes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }

    // Add obstacles in the first obstacleCount lanes
    lanes.slice(0, obstacleCount).forEach(lane => {
        obstacles.push({ x: lane, y: -carHeight });
    });
}

// Draw the road with flipped perspective
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Road parameters
    const roadWidthBottom = canvas.width / 3; // Narrowest at the bottom now
    const roadWidthTop = canvas.width - 50;   // Widest at the top
    const roadHeight = canvas.height;
    const laneWidthBottom = roadWidthBottom / laneCount;
    const laneWidthTop = roadWidthTop / laneCount;

    // Draw road sides (flipped perspective)
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo((canvas.width - roadWidthTop) / 2, roadHeight); // Left bottom (now widest)
    ctx.lineTo((canvas.width - roadWidthBottom) / 2, 0);       // Left top (now narrowest)
    ctx.moveTo((canvas.width + roadWidthTop) / 2, roadHeight); // Right bottom (now widest)
    ctx.lineTo((canvas.width + roadWidthBottom) / 2, 0);       // Right top (now narrowest)
    ctx.stroke();

    // Draw dashed center lines for lanes with flipped perspective
    ctx.setLineDash([15, 15]); // Dash pattern
    for (let i = 1; i < laneCount; i++) {
        const laneXTop = (canvas.width - roadWidthTop) / 2 + laneWidthTop * i;
        const laneXBottom = (canvas.width - roadWidthBottom) / 2 + laneWidthBottom * i;
        ctx.beginPath();
        ctx.moveTo(laneXTop, roadHeight);
        ctx.lineTo(laneXBottom, 0);
        ctx.stroke();
    }
    ctx.setLineDash([]); // Reset dash pattern

    // Draw obstacles following the flipped perspective
    ctx.fillStyle = 'white';
    ctx.font = '20px Courier';
    obstacles.forEach(obstacle => {
        const laneCenterX = getLaneCenterX(obstacle.x, obstacle.y);
        ctx.fillText(obstacleArt, laneCenterX - 10, obstacle.y); // Adjusted position
    });

    // Draw player car
    ctx.fillStyle = 'white';
    const playerX = getLaneCenterX(playerCar.lane, playerCar.y);
    ctx.fillText(playerCarArt, playerX - ctx.measureText(playerCarArt).width / 2, playerCar.y); // Centered

    // Draw score and high score
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    ctx.fillText(`Score: ${Math.floor(score)}`, 10, 20);
    ctx.fillText(`High Score: ${Math.floor(highScore)}`, 10, 40);
}

// Get lane center X-coordinate with corrected flipped perspective
function getLaneCenterX(lane, yPosition) {
    const roadWidthBottom = canvas.width / 3;  // Narrow at the bottom
    const roadWidthTop = canvas.width - 50;    // Wide at the top
    const laneWidthBottom = roadWidthBottom / laneCount;
    const laneWidthTop = roadWidthTop / laneCount;

    // Corrected t calculation for flipped perspective
    const t = yPosition / canvas.height; // t = 0 at top, t = 1 at bottom

    const laneWidth = laneWidthBottom * (1 - t) + laneWidthTop * t;
    const roadOffset = (canvas.width - (roadWidthBottom * (1 - t) + roadWidthTop * t)) / 2;

    return roadOffset + lane * laneWidth + laneWidth / 2;
}

// Update game state
function update() {
    if (!gameRunning) return;

    // Move obstacles
    obstacles.forEach(obstacle => {
        obstacle.y += speed;
    });

    // Remove off-screen obstacles
    obstacles = obstacles.filter(obstacle => obstacle.y < canvas.height);

    // Collision detection
    obstacles.forEach(obstacle => {
        if (
            obstacle.y + carHeight > playerCar.y &&
            obstacle.y < playerCar.y + carHeight &&
            obstacle.x === playerCar.lane
        ) {
            gameRunning = false;
            displayGameOver();
        }
    });

    // Increase score and difficulty
    score += 0.02; // Slow down the score count by reducing the increment
    if (score > highScore) highScore = score;
    if (Math.floor(score) % 100 === 0) speed += 0.05; // Increase speed more slowly

    // Add new obstacles with longer timing gaps
    const now = Date.now();
    const spawnRate = Math.min(1500, 500 + score * 10); // Minimum spawn gap of 1.5 seconds
    if (now - lastObstacleSpawnTime > spawnRate) {
        createObstacle();
        lastObstacleSpawnTime = now;
    }
}

// Move the player car
function movePlayer(direction) {
    if (direction === 'left' && playerCar.lane > 0) {
        playerCar.lane--;
    }
    if (direction === 'right' && playerCar.lane < laneCount - 1) {
        playerCar.lane++;
    }
}

// Display game over screen
function displayGameOver() {
    gameOverText.innerHTML = `Your score:<br><br>${Math.floor(score)}<br><br>`;
    if (score >= highScore) {
        gameOverText.innerHTML += `New Highscore:<br><br>${Math.floor(highScore)}<br><br>`;
    }
    gameOverDiv.classList.remove('hidden');
    gameOverDiv.style.visibility = 'visible';
}

// Reset the game
function resetGame() {
    playerCar = { y: canvas.height - carHeight * 2, lane: 1 };
    obstacles = [];
    speed = 0.5; // Reset speed to be slower
    score = 0;
    gameRunning = true;
    gameOverDiv.classList.add('hidden');
    gameOverDiv.style.visibility = 'hidden';
}

// Game loop
function gameLoop() {
    draw();
    update();
    if (gameRunning) requestAnimationFrame(gameLoop);
}

// Handle keyboard input
document.addEventListener('keydown', (e) => {
    if (!gameRunning) {
        resetGame();
        gameLoop();
    } else {
        if (e.key === 'ArrowLeft') movePlayer('left');
        if (e.key === 'ArrowRight') movePlayer('right');
    }
});

// Scroll event for background color change
window.addEventListener('scroll', () => {
    if (window.scrollY > window.innerHeight) {
        document.body.classList.add('black-bg');
    } else {
        document.body.classList.remove('black-bg');
    }
});

// Initialize game
resetGame();
gameLoop();
