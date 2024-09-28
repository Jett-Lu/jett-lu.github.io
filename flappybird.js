// flappybird.js

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let birdY = 150;
let gravity = 0.6;
let velocity = 0;
let lift = -15;
let pipes = [];
let pipeGap = 100;

// Adjust canvas size
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Listen for mouse click to make bird jump
document.addEventListener('click', () => {
    velocity = lift;
});

// Main game loop
function gameLoop() {
    // Update bird position
    velocity += gravity;
    birdY += velocity;

    // Draw bird
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'yellow';
    ctx.fillRect(50, birdY, 20, 20); // Example bird

    requestAnimationFrame(gameLoop);
}

// Start the game loop
gameLoop();
