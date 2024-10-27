const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameOverDiv = document.getElementById('game-over');
const gameOverText = document.getElementById('game-over-text');

let isPaused = false;
let gameRunning = true;
let gameOver = false;

// Set canvas dimensions for a larger game map
canvas.width = 500;
canvas.height = 700;

// Game variables
const laneCount = 3;
const carWidth = 60;
const carHeight = 50;
let playerCar = { y: canvas.height - carHeight * 2, lane: 1 };
let obstacles = [];
let speed = 0.5;
let score = 0;
let highScore = 0;
let lastObstacleSpawnTime = 0;

// ASCII Art for player car and obstacles
const playerCarArt = "[=]";
const obstacleArt = "[#]";

// Function to calculate lane center X position based on road perspective
function getLaneCenterX(lane, yPosition) {
    const roadWidthBottom = canvas.width / 3;
    const roadWidthTop = canvas.width - 50;
    const laneWidthBottom = roadWidthBottom / laneCount;
    const laneWidthTop = roadWidthTop / laneCount;

    const t = yPosition / canvas.height; // Calculate perspective interpolation factor

    // Interpolating lane width and road offset based on vertical position
    const laneWidth = laneWidthBottom * (1 - t) + laneWidthTop * t;
    const roadOffset = (canvas.width - (roadWidthBottom * (1 - t) + roadWidthTop * t)) / 2;

    // Return the center X position for the specified lane
    return roadOffset + lane * laneWidth + laneWidth / 2;
}

// Create obstacles, ensuring no more than two cars per row and proper gaps
function createObstacle() {
    const lanes = [0, 1, 2];
    let obstacleCount = score < 50 ? 1 : (score < 200 ? 1 + Math.floor(Math.random() * 2) : 2);

    // Shuffle lane positions
    for (let i = lanes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }

    lanes.slice(0, obstacleCount).forEach(lane => {
        obstacles.push({ x: lane, y: -carHeight });
    });
}

// Draw the game elements
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw road and lane lines
    const roadWidthTop = canvas.width - 50;
    const roadWidthBottom = canvas.width / 3;

    // Draw outer road boundaries
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo((canvas.width - roadWidthTop) / 2, canvas.height);
    ctx.lineTo((canvas.width - roadWidthBottom) / 2, 0);
    ctx.moveTo((canvas.width + roadWidthTop) / 2, canvas.height);
    ctx.lineTo((canvas.width + roadWidthBottom) / 2, 0);
    ctx.stroke();

    // Draw lane dividers
    ctx.setLineDash([15, 15]);
    for (let i = 1; i < laneCount; i++) {
        const laneXTop = (canvas.width - roadWidthTop) / 2 + (roadWidthTop / laneCount) * i;
        const laneXBottom = (canvas.width - roadWidthBottom) / 2 + (roadWidthBottom / laneCount) * i;
        ctx.beginPath();
        ctx.moveTo(laneXTop, canvas.height);
        ctx.lineTo(laneXBottom, 0);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw player car in the center of the current lane
    ctx.fillStyle = 'white';
    ctx.font = '20px Courier';
    const playerX = getLaneCenterX(playerCar.lane, playerCar.y);
    ctx.fillText(playerCarArt, playerX - ctx.measureText(playerCarArt).width / 2, playerCar.y);

    // Draw obstacles with perspective spread
    obstacles.forEach(obstacle => {
        const laneCenterX = getLaneCenterX(obstacle.x, obstacle.y);
        ctx.fillText(obstacleArt, laneCenterX - 10, obstacle.y);
    });

    // Display score and high score
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    ctx.fillText(`Score: ${Math.floor(score)}`, 10, 20);
    ctx.fillText(`High Score: ${Math.floor(highScore)}`, 10, 40);
}

// Update the game state
function update() {
    if (!gameRunning || isPaused || gameOver) return;

    obstacles.forEach(obstacle => {
        obstacle.y += speed;
    });

    // Filter obstacles that go off-screen
    obstacles = obstacles.filter(obstacle => obstacle.y < canvas.height);

    // Check for collision
    obstacles.forEach(obstacle => {
        if (
            obstacle.y + carHeight > playerCar.y &&
            obstacle.y < playerCar.y + carHeight &&
            obstacle.x === playerCar.lane
        ) {
            gameOver = true;
            displayGameOver();
        }
    });

    // Update score and speed
    score += 0.02;
    if (score > highScore) highScore = score;
    if (Math.floor(score) % 100 === 0) speed += 0.05;

    // Spawn obstacles at intervals
    const now = Date.now();
    const spawnRate = Math.min(1500, 500 + score * 10);
    if (now - lastObstacleSpawnTime > spawnRate) {
        createObstacle();
        lastObstacleSpawnTime = now;
    }
}

// Display the game-over screen
function displayGameOver() {
    gameOverText.innerHTML = `Your score:<br><br>${Math.floor(score)}<br><br>`;
    if (score >= highScore) {
        gameOverText.innerHTML += `New Highscore:<br><br>${Math.floor(highScore)}<br><br>`;
    }
    gameOverText.innerHTML += `Press any key to try again.`;
    gameOverDiv.classList.remove('hidden');
    gameOverDiv.style.visibility = 'visible';
}

// Display "Game Paused" message
function displayPauseMessage() {
    if (gameOverDiv.style.visibility === 'visible') return;

    gameOverText.innerHTML = 'Game Paused.<br><br>Press any key to resume.';
    gameOverDiv.classList.remove('hidden');
    gameOverDiv.style.visibility = 'visible';
}

// Hide pause message and resume the game
function resumeGame() {
    gameOverDiv.classList.add('hidden');
    gameOverDiv.style.visibility = 'hidden';
    isPaused = false;
    gameLoop();
}

// Move the player car between lanes
function movePlayer(direction) {
    if (direction === 'left' && playerCar.lane > 0) {
        playerCar.lane -= 1; // Move left if not in the leftmost lane
    } else if (direction === 'right' && playerCar.lane < laneCount - 1) {
        playerCar.lane += 1; // Move right if not in the rightmost lane
    }
}

// Game loop function
function gameLoop() {
    if (!isPaused && !gameOver) {
        draw();
        update();
        requestAnimationFrame(gameLoop);
    }
}

// Reset the game state
function resetGame() {
    playerCar = { y: canvas.height - carHeight * 2, lane: 1 };
    obstacles = [];
    speed = 0.5;
    score = 0;
    gameRunning = true;
    gameOver = false;
    isPaused = false;
    gameOverDiv.classList.add('hidden');
    gameOverDiv.style.visibility = 'hidden';
}

// Event listeners
window.addEventListener('scroll', () => {
    const gameContainer = document.getElementById('game-container');
    const gameContainerBottom = gameContainer.getBoundingClientRect().bottom;
    const boundaryThreshold = 150; 

    if (gameContainerBottom < boundaryThreshold && !isPaused && !gameOver) {
        isPaused = true;
        displayPauseMessage(); // Show pause pop-up
    }
});

document.addEventListener('keydown', (e) => {
    if (isPaused && !gameOver) {
        resumeGame();
    } else if (gameOver) {
        resetGame();
        gameLoop();
    } else if (gameRunning) {
        if (e.key === 'ArrowLeft') movePlayer('left');
        if (e.key === 'ArrowRight') movePlayer('right');
    }
});

// Initial game setup
resetGame();
gameLoop();
