const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameOverDiv = document.getElementById('game-over');
const gameOverText = document.getElementById('game-over-text');

// Set canvas dimensions
canvas.width = 400;
canvas.height = 600;

// Game variables
const laneCount = 3;
const carWidth = canvas.width / (laneCount + 2);
const carHeight = 50;
let playerCar = { x: 1, y: canvas.height - carHeight * 2, lane: 1 };
let obstacles = [];
let speed = 2;
let score = 0;
let highScore = 0;
let gameRunning = true;

// ASCII Art
const playerCarArt = "[=]";
const obstacleArt = "[#]";

// Create an obstacle
function createObstacle() {
    const lane = Math.floor(Math.random() * laneCount);
    obstacles.push({ x: lane * carWidth + carWidth, y: -carHeight });
}

// Draw the road and player
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw road lanes
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    for (let i = 1; i < laneCount; i++) {
        ctx.beginPath();
        ctx.moveTo(i * carWidth + carWidth, 0);
        ctx.lineTo(i * carWidth + carWidth, canvas.height);
        ctx.stroke();
    }

    // Draw obstacles
    ctx.fillStyle = 'white';
    ctx.font = '20px Courier';
    obstacles.forEach(obstacle => {
        ctx.fillText(obstacleArt, obstacle.x, obstacle.y);
    });

    // Draw player car
    ctx.fillStyle = 'white';
    ctx.fillText(playerCarArt, playerCar.x, playerCar.y);

    // Draw score and high score
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    ctx.fillText(`Score: ${score}`, 10, 20);
    ctx.fillText(`High Score: ${highScore}`, 10, 40);
}

// Update the game state
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
            obstacle.x === playerCar.x
        ) {
            gameRunning = false;
            displayGameOver();
        }
    });

    // Increase score and difficulty
    score += 1;
    if (score > highScore) highScore = score;
    if (score % 500 === 0) speed += 0.5;

    // Add new obstacles less frequently
    if (Math.random() < 0.02) createObstacle();
}

// Move the player car
function movePlayer(direction) {
    if (direction === 'left' && playerCar.lane > 0) {
        playerCar.lane--;
        playerCar.x = playerCar.lane * carWidth + carWidth;
    }
    if (direction === 'right' && playerCar.lane < laneCount - 1) {
        playerCar.lane++;
        playerCar.x = playerCar.lane * carWidth + carWidth;
    }
}

// Display game over screen
function displayGameOver() {
    gameOverDiv.classList.remove('hidden');
    gameOverText.textContent = `Your score: ${score}`;
    if (score >= highScore) {
        gameOverText.textContent += `\nNew Highscore: ${highScore}`;
    }
    gameOverDiv.style.visibility = 'visible';
}

// Reset the game
function resetGame() {
    playerCar = { x: 1 * car
