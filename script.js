const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameOverDiv = document.getElementById('game-over');
const gameOverText = document.getElementById('game-over-text');
const fixedNameTitle = document.getElementById('fixed-name-title');

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

// ASCII Art
const playerCarArt = "[=]";
const obstacleArt = "[#]";

// Create obstacles ensuring no more than two cars per row and proper gaps
function createObstacle() {
    const lanes = [0, 1, 2];
    let obstacleCount = score < 50 ? 1 : (score < 200 ? 1 + Math.floor(Math.random() * 2) : 2);

    for (let i = lanes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }

    lanes.slice(0, obstacleCount).forEach(lane => {
        obstacles.push({ x: lane, y: -carHeight });
    });
}

// Draw the road and other elements
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const roadWidthBottom = canvas.width / 3;
    const roadWidthTop = canvas.width - 50;
    const laneWidthBottom = roadWidthBottom / laneCount;
    const laneWidthTop = roadWidthTop / laneCount;

    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo((canvas.width - roadWidthTop) / 2, canvas.height);
    ctx.lineTo((canvas.width - roadWidthBottom) / 2, 0);
    ctx.moveTo((canvas.width + roadWidthTop) / 2, canvas.height);
    ctx.lineTo((canvas.width + roadWidthBottom) / 2, 0);
    ctx.stroke();

    ctx.setLineDash([15, 15]);
    for (let i = 1; i < laneCount; i++) {
        const laneXTop = (canvas.width - roadWidthTop) / 2 + laneWidthTop * i;
        const laneXBottom = (canvas.width - roadWidthBottom) / 2 + laneWidthBottom * i;
        ctx.beginPath();
        ctx.moveTo(laneXTop, canvas.height);
        ctx.lineTo(laneXBottom, 0);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.fillStyle = 'white';
    ctx.font = '20px Courier';
    obstacles.forEach(obstacle => {
        const laneCenterX = getLaneCenterX(obstacle.x, obstacle.y);
        ctx.fillText(obstacleArt, laneCenterX - 10, obstacle.y);
    });

    ctx.fillStyle = 'white';
    const playerX = getLaneCenterX(playerCar.lane, playerCar.y);
    ctx.fillText(playerCarArt, playerX - ctx.measureText(playerCarArt).width / 2, playerCar.y);

    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    ctx.fillText(`Score: ${Math.floor(score)}`, 10, 20);
    ctx.fillText(`High Score: ${Math.floor(highScore)}`, 10, 40);
}

// Get the lane center position for drawing
function getLaneCenterX(lane, yPosition) {
    const roadWidthBottom = canvas.width / 3;
    const roadWidthTop = canvas.width - 50;
    const laneWidthBottom = roadWidthBottom / laneCount;
    const laneWidthTop = roadWidthTop / laneCount;

    const t = yPosition / canvas.height;

    const laneWidth = laneWidthBottom * (1 - t) + laneWidthTop * t;
    const roadOffset = (canvas.width - (roadWidthBottom * (1 - t) + roadWidthTop * t)) / 2;

    return roadOffset + lane * laneWidth + laneWidth / 2;
}

// Update game state
function update() {
    if (!gameRunning || isPaused || gameOver) return;

    obstacles.forEach(obstacle => {
        obstacle.y += speed;
    });

    obstacles = obstacles.filter(obstacle => obstacle.y < canvas.height);

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

    score += 0.02;
    if (score > highScore) highScore = score;
    if (Math.floor(score) % 100 === 0) speed += 0.05;

    const now = Date.now();
    const spawnRate = Math.min(1500, 500 + score * 10);
    if (now - lastObstacleSpawnTime > spawnRate) {
        createObstacle();
        lastObstacleSpawnTime = now;
    }
}

// Display "Game Paused" message
function displayPauseMessage() {
    // Clear the content of gameOverText to avoid duplication
    gameOverText.innerHTML = '';

    // Set the text for the pause screen
    gameOverText.innerHTML = `Game Paused.<br><br>Press any key to resume.`;
    
    // Show the gameOverDiv as the pause screen
    gameOverDiv.classList.remove('hidden');
    gameOverDiv.style.visibility = 'visible';
}

// Display the game-over screen
function displayGameOver() {
    // Clear the content of gameOverText to avoid duplication
    gameOverText.innerHTML = '';

    // Set the text for the game-over screen
    gameOverText.innerHTML = `Your score:<br><br>${Math.floor(score)}<br><br>`;
    if (score >= highScore) {
        gameOverText.innerHTML += `New Highscore:<br><br>${Math.floor(highScore)}<br><br>`;
    }
    gameOverText.innerHTML += `Press any key to try again.`;

    // Show the gameOverDiv as the game-over screen
    gameOverDiv.classList.remove('hidden');
    gameOverDiv.style.visibility = 'visible';
}

// Hide pause message and resume the game
function resumeGame() {
    // Clear the content of gameOverText before resuming the game
    gameOverText.innerHTML = '';

    // Hide the gameOverDiv
    gameOverDiv.classList.add('hidden');
    gameOverDiv.style.visibility = 'hidden';

    isPaused = false;
    gameLoop();
}

// Pause the game when scrolling down
window.addEventListener('scroll', () => {
    const gameContainer = document.getElementById('game-container');
    const gameContainerBottom = gameContainer.getBoundingClientRect().bottom;

    // Adjust this value to get closer to the actual boundary
    const boundaryThreshold = 150; 

    // Change color and apply a less intense glowing effect to "Jett Lu" when close to the transition point
    if (gameContainerBottom < window.innerHeight + boundaryThreshold) {
        fixedNameTitle.style.color = 'black';
        fixedNameTitle.style.textShadow = '0 0 10px rgba(255, 255, 255, 0.5), 0 0 15px rgba(255, 255, 255, 0.3)'; // Reduced glow effect
    } else {
        fixedNameTitle.style.color = 'white';
        fixedNameTitle.style.textShadow = 'none'; // Remove glow effect
    }
});
// Event listener for key presses to resume the game
document.addEventListener('keydown', (e) => {
    if (isPaused) {
        resumeGame();
    } else if (gameOver) {
        resetGame();
        gameLoop();
    } else if (gameRunning) {
        if (e.key === 'ArrowLeft') movePlayer('left');
        if (e.key === 'ArrowRight') movePlayer('right');
    }
});

// Move the player
function movePlayer(direction) {
    if (direction === 'left' && playerCar.lane > 0) {
        playerCar.lane--;
    }
    if (direction === 'right' && playerCar.lane < laneCount - 1) {
        playerCar.lane++;
    }
}

// Game loop function
function gameLoop() {
    if (gameRunning && !isPaused && !gameOver) {
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

// Initial game setup
resetGame();
gameLoop();
