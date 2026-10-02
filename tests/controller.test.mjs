import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadSite } from './helpers.mjs';

function game(index) {
  const env = loadSite({ controller: true }); env.elements.get('game-container').classList.add('expanded');
  env.context.controller.setActive(index); return { ...env, game: env.context.controller };
}
const key = (env, name) => env.game.handleGameKeyDown({ key: name, target: env.elements.get('game-play'), preventDefault() {} });
test('footer switches between legacy and pixel modes without losing the site path', () => {
  for (const [search, label, nextMode] of [['', 'Legacy mode', 'legacy'], ['?mode=legacy', 'Pixel mode', 'pixel']]) {
    const env = loadSite({ controller: true, url: `https://example.com/portfolio/${search}` });
    const toggle = env.elements.get('arcade-mode-toggle');
    assert(toggle, 'mode control must exist in the footer');
    assert.equal(toggle.textContent, label);
    const destination = new URL(toggle.href, env.window.location);
    assert.equal(destination.pathname, '/portfolio/');
    assert.equal(destination.searchParams.get('mode'), nextMode);
  }
});
test('filling the final Snake cell ends the run without an infinite food loop', () => {
  const env = game(4);
  Object.assign(env.game.snake, { cols: 2, rows: 2, body: [{x:0,y:0},{x:0,y:1},{x:1,y:1}], food:{x:1,y:0}, dirX:1,dirY:0 });
  vm.runInContext('controller.updateSnake(0.135)', env.context, { timeout: 200 });
  assert.equal(env.game.snake.gameOver, true); assert.equal(env.game.snake.body.length, 4);
});
test('ordinary navigation keys do not restart a finished game or resume pause', () => {
  const env = game(1); env.game.inv.gameOver = true; env.game.inv.score = 80;
  for (const name of ['Tab','Shift','Escape','Control','x']) key(env, name);
  assert.equal(env.game.inv.score, 80); assert.equal(env.game.inv.gameOver, true);
  env.game.inv.gameOver = false; env.game.games[1].pause({silent:true}); key(env,'Tab');
  assert.equal(env.game.paused()[1], true);
});
test('blur releases held controls and pauses the current game', () => {
  const env = game(1); key(env,'ArrowLeft'); assert.equal(env.game.holds()[0], true);
  env.window.emit('blur'); assert.equal(env.game.holds()[0], false); assert.equal(env.game.paused()[1], true);
});
test('hidden game loop does not advance game state', () => {
  const env = game(1); const x = env.game.inv.aliens[0].x;
  env.document.hidden = true; env.document.emit('visibilitychange'); env.game.loop(100); env.game.loop(150);
  assert.equal(env.game.inv.aliens[0].x, x);
});
test('a tab cannot overwrite a higher persisted score', () => {
  const env = game(2); env.storage.set('jl_highscore_car','100');
  assert.equal(env.game.updateStoredHighScore('jl_highscore_car',0,10),100);
  assert.equal(env.storage.get('jl_highscore_car'),'100');
});
test('Asteroids damping preserves similar movement at 60 and 144 Hz', () => {
  const speeds = [60,144].map(rate => {
    const env = game(0); env.game.ast.rocks=[{x:390,y:590,vx:0,vy:0,r:1}];
    for(let i=0;i<rate*2;i++) env.game.updateAsteroids(1/rate);
    return Math.hypot(env.game.ast.vx,env.game.ast.vy);
  });
  assert(Math.abs(speeds[0]-speeds[1])/speeds[0]<0.03, `Speeds differ: ${speeds}`);
});
test('Invaders shots hit when crossing an alien on a slow frame', () => {
  const env = game(1); env.game.inv.aliens=[{x:100,y:100,alive:true}];env.game.inv.bullets=[{x:100,y:120,dead:false}];
  env.game.updateInvaders(0.05); assert.equal(env.game.inv.score,10);
});

test('Invaders collisions cover the larger artwork and reject shots outside it', () => {
  for (const [offset, expectedScore] of [[19, 10], [23, 0]]) {
    const env = game(1);
    Object.assign(env.game.inv, { speedX: 0, lastShot: Date.now(),
      aliens: [{ x: 100, y: 100, alive: true }], bullets: [{ x: 100 + offset, y: 130, dead: false }] });
    env.game.updateInvaders(0.05);
    assert.equal(env.game.inv.score, expectedScore);
  }
});

test('Asteroids collision radius follows the larger playable ship', () => {
  for (const [distance, hits] of [[45, true], [48, false]]) {
    const env = game(0);
    const { ast } = env.game;
    ast.rocks = [{ x: ast.shipX + distance, y: ast.shipY, r: 25, vx: 0, vy: 0 }];
    env.game.updateAsteroids(0);
    assert.equal(ast.gameOver, hits);
  }
});
test('keyboard carousel selection moves focus away from the hidden panel', () => {
  const env = game(1); env.elements.get('game-container').classList.remove('expanded'); env.panels[1].focus();
  env.game.selectCarouselIndex(2,false); assert.equal(env.document.activeElement,env.panels[2]);
});

test('reaching either carousel end keeps focus on the selected game', () => {
  for (const [start, end, button] of [[1, 0, 'carousel-left'], [3, 4, 'carousel-right']]) {
    const env = game(start);
    env.elements.get('game-container').classList.remove('expanded');
    env.elements.get(button).focus();
    env.game.selectCarouselIndex(end, false);
    assert(env.document.activeElement === env.panels[end], 'focus should leave the hidden arrow');
  }
});

test('Brick ball bounces off visible brick sides using its full radius', () => {
  const env = game(3);
  // A 32×20 brick centred at (100, 200), approached from the left.
  Object.assign(env.game.brick, { ballX: 74, ballY: 200, ballDX: 3, ballDY: 0,
    bricks: [{ x: 90, y: 208, alive: true }, { x: 300, y: 300, alive: true }] });
  env.game.games[3].update(1 / 30);
  assert.equal(env.game.brick.score, 10);
  assert(env.game.brick.ballDX < 0, 'side contact should reverse horizontal travel');
  assert.equal(env.game.brick.ballDY, 0);
});

test('Brick ball hits the visible top edge but misses outside a rounded corner', () => {
  for (const [x, y, expected] of [[100, 183.5, 10], [122, 184, 0]]) {
    const env = game(3);
    Object.assign(env.game.brick, { ballX: x, ballY: y, ballDX: 0, ballDY: 2,
      bricks: [{ x: 90, y: 208, alive: true }, { x: 300, y: 300, alive: true }] });
    env.game.games[3].update(0);
    assert.equal(env.game.brick.score, expected);
    if (expected) assert(env.game.brick.ballDY < 0);
  }
});

test('Brick ball bounces when its lower edge reaches the paddle', () => {
  const env = game(3);
  Object.assign(env.game.brick, { paddleX: 160, ballX: 200, ballY: 537, ballDX: 0, ballDY: 2.8 });
  env.game.games[3].update(1 / 30);
  assert(env.game.brick.ballDY < 0, 'ball should bounce before its centre enters the paddle');
  assert.equal(env.game.brick.ballY, 541);
});

for (const webgl of [false, true]) {
  test(`${webgl ? '3D' : '2D'} Racing catches fast traffic crossing the player but permits other lanes`, () => {
    for (const lane of [0, 1]) {
      const env = game(2);
      if (webgl) env.game.setRacingPortal({ available: true });
      const racing = env.game.games[2];
      // A valid 75-second run reaches a speed where a 50ms frame spans the car.
      for (let frame = 0; frame < 1500; frame++) racing.update(0.05);
      const state = env.game.racingState();
      assert(state.speed > 19);
      state.obstacles.splice(0, state.obstacles.length, { lane, y: 479 });
      racing.update(0.05);
      assert.equal(racing.isOver(), lane === 1, `incorrect collision for lane ${lane}`);
    }
  });
}
