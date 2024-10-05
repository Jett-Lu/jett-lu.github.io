const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameOverDiv = document.getElementById('game-over');
const gameOverText = document.getElementById('game-over-text');
const nameTitle = document.getElementById('name-title'); // Reference to the name element
const contentBoxes = document.querySelectorAll('.content-box');

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
let gameRunning = true;
let lastObstacleSpawnTime = 0;

// ASCII Art
const playerCarArt = "[=]";
const obstacleArt = "[#]";

// Create obstacles ensuring no more than two cars per row and proper gaps
function createObstacle() {
    const lanes = [0, 1, 2];
    let obstacleCount;
    if (score < 50) {
        obstacleCount = 1;
    } else if (score < 200) {
        obstacleCount = 1 + Math.floor(Math.random() * 2);
    } else {
        obstacleCount = 2;
    }

    for (let i = lanes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }

    lanes.slice(0, obstacleCount).forEach(lane => {
        obstacles.push({ x: lane, y: -carHeight });
    });
}

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

function update() {
    if (!gameRunning) return;
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
            gameRunning = false;
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

function movePlayer(direction) {
    if (direction === 'left' && playerCar.lane > 0) {
        playerCar.lane--;
    }
    if (direction === 'right' && playerCar.lane < laneCount - 1) {
        playerCar.lane++;
    }
}

function displayGameOver() {
    gameOverText.innerHTML = `Your score:<br><br>${Math.floor(score)}<br><br>`;
    if (score >= highScore) {
        gameOverText.innerHTML += `New Highscore:<br><br>${Math.floor(highScore)}<br><br>`;
    }
    gameOverDiv.classList.remove('hidden');
    gameOverDiv.style.visibility = 'visible';
}

function resetGame() {
    playerCar = { y: canvas.height - carHeight * 2, lane: 1 };
    obstacles = [];
    speed = 0.5;
    score = 0;
    gameRunning = true;
    gameOverDiv.classList.add('hidden');
    gameOverDiv.style.visibility = 'hidden';
}

window.addEventListener('scroll', () => {
    if (window.scrollY > window.innerHeight) {
        document.body.classList.add('black-bg');
        nameTitle.style.color = 'black';
        nameTitle.style.textShadow = '2px 2px 4px rgba(255, 255, 255, 0.7)';
        document.getElementById('fixed-name-title').style.color = 'black';
        document.getElementById('fixed-name-title').style.textShadow = '2px 2px 4px rgba(255, 255, 255, 0.7)';
    } else {
        document.body.classList.remove('black-bg');
        nameTitle.style.color = 'white';
        nameTitle.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.7)';
        document.getElementById('fixed-name-title').style.color = 'white';
        document.getElementById('fixed-name-title').style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.7)';
    }

    // Check for content box visibility and add animation
    contentBoxes.forEach(box => {
        const boxTop = box.getBoundingClientRect().top;
        const windowHeight = window.innerHeight;
        if (boxTop < windowHeight - 50) {
            box.classList.add('visible');
        }
    });
});

function gameLoop() {
    draw();
    update();
    if (gameRunning) requestAnimationFrame(gameLoop);
}

document.addEventListener('keydown', (e) => {
    if (!gameRunning) {
        resetGame();
        gameLoop();
    } else {
        if (e.key === 'ArrowLeft') movePlayer('left');
        if (e.key === 'ArrowRight') movePlayer('right');
    }
});

resetGame();
gameLoop();
