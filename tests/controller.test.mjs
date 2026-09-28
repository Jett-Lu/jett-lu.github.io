import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadSite } from './helpers.mjs';

function game(index) {
  const env = loadSite({ controller: true }); env.elements.get('game-container').classList.add('expanded');
  env.context.controller.setActive(index); return { ...env, game: env.context.controller };
}
const key = (env, name) => env.game.handleGameKeyDown({ key: name, target: env.elements.get('game-play'), preventDefault() {} });
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
test('keyboard carousel selection moves focus away from the hidden panel', () => {
  const env = game(1); env.elements.get('game-container').classList.remove('expanded'); env.panels[1].focus();
  env.game.selectCarouselIndex(2,false); assert.equal(env.document.activeElement,env.panels[2]);
});
