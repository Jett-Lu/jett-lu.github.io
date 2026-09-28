import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRenderer } from './helpers.mjs';

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
