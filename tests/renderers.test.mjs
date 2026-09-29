import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRenderer, loadSite } from './helpers.mjs';
import * as THREE from '../vendor/three/three.module.min.js';

const states = {
  car: () => ({ lane:1,steer:0,distance:1,score:0,highScore:0,preview:true,obstacles:[] }),
  asteroids: () => ({shipX:200,shipY:300,angle:-Math.PI/2,score:0,high:0,rocks:[],bullets:[]}),
  invaders: () => ({shipX:190,shipY:540,score:0,high:0,aliens:[],bullets:[]}),
  brick: () => ({paddleX:156,ballX:200,ballY:360,score:0,high:0,bricks:[]}),
  snake: () => ({body:[{x:19,y:29}],dirX:1,dirY:0,food:null,score:0,high:0})
};
for (const kind of Object.keys(states)) {
  test(`${kind}: hidden restoration retains fallback until a real frame, then cleans up`, () => {
    const env=loadRenderer(kind==='car'?'racing-portal.js':'arcade-portal.js',kind);
    const state=states[kind]();env.motion.matches=true;
    env.portal.render(state,{preview:false});const count=env.renderer.calls;
    env.document.hidden=true;env.renderer.domElement.emit('webglcontextlost',{preventDefault(){}});
    env.renderer.domElement.emit('webglcontextrestored');
    const className=kind==='car'?'has-racing-portal':'has-arcade-portal';
    assert.equal(env.panel.classList.contains(className),false);
    assert.equal(env.renderer.calls,count);
    env.document.hidden=false;env.document.emit('visibilitychange');
    assert.equal(env.renderer.calls,count+1);assert.equal(env.panel.classList.contains(className),true);
    env.portal.dispose();const disposedCount=env.renderer.calls;
    env.renderer.domElement.emit('webglcontextrestored');
    if(kind==='car')state.distance++;
    assert.equal(env.portal.render(state,{preview:false}),false);
    assert.equal(env.renderer.calls,disposedCount);assert.equal(env.panel.children.length,1);
  });
}
test('racing disposes all instanced window buffers', () => {
  const env=loadRenderer('racing-portal.js','car');env.portal.render(states.car());
  let disposed=0,expected=0;
  env.renderer.scene.traverse(object=>{if(object.isInstancedMesh){expected++;object.addEventListener('dispose',()=>disposed++);}});
  env.portal.dispose();assert(expected>0);assert.equal(disposed,expected);
});
test('traffic keeps its colour when earlier cars leave', () => {
  const env=loadRenderer('racing-portal.js','car');const first={lane:0,y:640},following={lane:2,y:300};
  const state={...states.car(),preview:false,obstacles:[first,following]};
  const colour=()=>env.renderer.scene.children.find(mesh=>mesh.isGroup&&mesh.visible&&mesh.position.x===3&&mesh.position.z===-28).children[0].material.color.getHex();
  env.portal.render(state);const before=colour();state.obstacles=[following];state.distance++;
  env.portal.render(state);assert.equal(colour(),before);env.portal.dispose();
});
test('asteroid colour and orientation survive removal of another rock', () => {
  const env=loadRenderer('arcade-portal.js','asteroids');const hit={x:80,y:150,r:22},survivor={x:240,y:300,r:25};
  const state={...states.asteroids(),rocks:[hit,survivor]};
  const appearance=()=>{const mesh=env.renderer.scene.children.find(mesh=>mesh.visible&&mesh.geometry?.type==='IcosahedronGeometry'&&mesh.position.x===40);return [mesh.material.color.getHex(),mesh.rotation.x,mesh.rotation.y,mesh.rotation.z];};
  env.portal.render(state,{time:1});const before=appearance();state.rocks=[survivor];
  env.portal.render(state,{time:1});assert.deepEqual(appearance(),before);env.portal.dispose();
});
test('a paused arcade scene retains its last rendered frame', () => {
  const env=loadRenderer('arcade-portal.js','asteroids');const state=states.asteroids();
  env.portal.render(state,{paused:true,time:1});const count=env.renderer.calls;
  env.portal.render(state,{paused:true,time:5});assert.equal(env.renderer.calls,count);
  env.portal.render(state,{paused:false,time:6});assert.equal(env.renderer.calls,count+1);env.portal.dispose();
});

function sceneLayout(scene) {
  const layout = [];
  scene.traverseVisible(object => {
    if (!object.isMesh && !object.isGroup) return;
    layout.push({ visible: object.visible, position: object.position.toArray(), scale: object.scale.toArray(),
      rotation: object.rotation.toArray(), count: object.count,
      instances: object.isInstancedMesh ? Array.from(object.instanceMatrix.array.slice(0, object.count * 16)) : null });
  });
  return layout;
}

for (const [kind, key] of [['asteroids', 'ast'], ['invaders', 'inv'], ['brick', 'brick'], ['snake', 'snake']]) {
  test(`${kind}: original preview artwork and gameplay share sprite sizes`, () => {
    const site = loadSite({ controller: true });
    const initial = structuredClone(site.context.controller[key]);
    const env = loadRenderer('arcade-portal.js', kind);
    env.portal.render(initial, { preview: false, time: 0 });
    const gameplay = sceneLayout(env.renderer.scene);
    const models = env.renderer.scene.children.filter(object => object.isGroup && object.visible);
    const sizes = models.map(model => model.scale.x);
    env.portal.render(initial, { preview: true, time: 0 });
    assert.deepEqual(models.map(model => model.scale.x), sizes, 'Sprites must not shrink on Play');
    if (kind === 'asteroids' || kind === 'invaders') {
      if (kind === 'asteroids') {
        assert.equal(models[0].position.x, 0);
        assert.equal(models[0].position.y, 300 - 453);
        const rocks = env.renderer.scene.children.filter(mesh => mesh.visible && mesh.geometry?.type === 'IcosahedronGeometry');
        assert.equal(rocks.length, 6, 'Restore the six-rock Asteroids illustration');
        assert(rocks.every(rock => rock.scale.x >= 25));
        assert(env.renderer.scene.children.some(mesh => mesh.isInstancedMesh && mesh.count === 3), 'Restore preview laser shots');
      } else {
        assert.equal(models[0].position.x, initial.shipX - 200);
        assert.equal(models[0].position.y, 300 - initial.shipY);
        const aliens = models.slice(1);
        assert.equal(aliens.length, initial.aliens.length);
        assert.equal(new Set(aliens.map(alien => alien.position.y)).size, 4);
        assert.equal(new Set(aliens.map(alien => alien.position.x)).size, 5);
        env.renderer.scene.updateMatrixWorld(true);
        const bounds = aliens.map(alien => new THREE.Box3().setFromObject(alien));
        assert(bounds.every(box => box.min.x > -200 && box.max.x < 200 && box.min.y > -30));
        assert(bounds.slice(1, 5).every((box, i) => box.min.x > bounds[i].max.x), 'Large aliens must not overlap');
      }
    } else if (kind === 'brick') {
      assert.deepEqual(sceneLayout(env.renderer.scene), gameplay);
    } else {
      const body = env.renderer.scene.children.find(mesh => mesh.isInstancedMesh);
      assert.equal(body.count, 21, 'Restore the original curved Snake illustration');
      const segment = new THREE.Matrix4(); body.getMatrixAt(0, segment);
      const scale = new THREE.Vector3().setFromMatrixScale(segment);
      assert.equal(scale.x, 18); assert.equal(scale.y, 18);
    }
    env.portal.render(initial, { preview: false, time: 0 });
    assert.deepEqual(sceneLayout(env.renderer.scene), gameplay);
    env.portal.dispose();
  });
}

test('returning to the carousel restores the starting layout without changing the live game', () => {
  const site = loadSite({ controller: true });
  const initial = structuredClone(site.context.controller.brick);
  const live = structuredClone(initial);
  const env = loadRenderer('arcade-portal.js', 'brick');
  env.portal.render(live, { preview: true, time: 0 });
  const preview = sceneLayout(env.renderer.scene);
  live.bricks[0].alive = false; live.paddleX = 40;
  env.portal.render(live, { preview: false, time: 0 });
  assert.notDeepEqual(sceneLayout(env.renderer.scene), preview);
  env.portal.render(live, { preview: true, time: 0 });
  assert.deepEqual(sceneLayout(env.renderer.scene), preview);
  assert.equal(live.bricks[0].alive, false);
  assert.equal(live.paddleX, 40);
  env.portal.dispose();
});

test('idle camera reveals depth while keeping the playfield anchored, and stops during play', () => {
  const env = loadRenderer('arcade-portal.js', 'brick');
  let time = 100;
  env.context.performance.now = () => time += 1000 / 60;
  const state = states.brick();
  const render = () => env.portal.render(state, { preview: true });
  render();
  env.panel.emit('pointermove', { pointerType: 'mouse', buttons: 0, clientX: 400, clientY: 0 });
  for (let i = 0; i < 120; i++) render();
  const camera = env.renderer.camera;
  camera.updateMatrixWorld();
  const projected = new THREE.Vector3(0, 0, 20).project(camera);
  const movement = Math.abs(projected.x * 150); // Compare within a 300px-wide frame.
  assert(movement < 1, `The game should not slide around in its frame, got ${movement}px`);
  const background = new THREE.Vector3(0, 0, -500).project(camera);
  assert(Math.abs(background.x * 150) > 2, 'Different depths should respond to the viewpoint');
  for (const x of [-208, 208]) for (const y of [-308, 308]) {
    const corner = new THREE.Vector3(x, y, 36).project(camera);
    assert(Math.abs(corner.x) < 1 && Math.abs(corner.y) < 1, 'The board must stay inside its frame');
  }
  env.panel.emit('pointerleave');
  for (let i = 0; i < 120; i++) render();
  assert(Math.abs(camera.position.x) < 0.001 && Math.abs(camera.position.y) < 0.001);
  env.panel.emit('pointermove', { pointerType: 'mouse', buttons: 0, clientX: 400, clientY: 0 });
  for (let i = 0; i < 120; i++) render();
  env.portal.render(state, { preview: false });
  assert.equal(camera.position.x, 0); assert.equal(camera.position.y, 0);
  env.portal.dispose();
});

test('all four arcade scenes have open edges without visible recess walls', () => {
  for (const kind of ['asteroids', 'invaders', 'brick', 'snake']) {
    const env = loadRenderer('arcade-portal.js', kind);
    env.portal.render(states[kind](), { preview: true });
    const { camera, scene } = env.renderer;
    camera.updateMatrixWorld(); scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    for (const [x, y] of [[-0.98, 0], [0.98, 0], [0, -0.98], [0, 0.98]]) {
      ray.setFromCamera(new THREE.Vector2(x, y), camera);
      const solidEdges = ray.intersectObjects(scene.children).filter(hit => !hit.object.isInstancedMesh);
      assert.equal(solidEdges.length, 0, `${kind}: do not surround the artwork with solid recess walls`);
    }
    env.portal.dispose();
  }
});
