import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../vendor/three/three.module.min.js';

export class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.listeners = new Map();
    this.className = ''; this.text = ''; this.hidden = false; this.offsetWidth = 400; this.offsetHeight = 600; this.offsetLeft = 0;
    this.classList = {
      contains: name => this.className.split(' ').includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(' ').filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = this.className.split(' ').filter(name => !names.includes(name)).join(' '); },
      toggle: (name, force) => { const on = force ?? !this.classList.contains(name); this.classList[on ? 'add' : 'remove'](name); return on; }
    };
    this.style = { setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; }, getPropertyValue(name) { return this[name] || ''; } };
  }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(child => typeof child === 'string' ? child : child.textContent).join(''); }
  append(...children) { children.forEach(child => { if (typeof child !== 'string') child.parentElement = this; this.children.push(child); }); }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.text = ''; this.children = []; this.append(...children); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  querySelectorAll(selector) {
    const result = [];
    for (const child of this.children) {
      if (typeof child === 'string') continue;
      if (selector.startsWith('.') ? child.classList.contains(selector.slice(1)) : child.tagName === selector.toUpperCase()) result.push(child);
      result.push(...child.querySelectorAll(selector));
    }
    return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener); }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  emit(type, event = {}) { for (const listener of this.listeners.get(type) || []) listener(event); }
  getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, right: 400, bottom: 600, width: 400, height: 600 }; }
  contains(node) { return node === this || this.children.some(child => child instanceof Element && child.contains(node)); }
  focus() { if (this.document) this.document.activeElement = this; }
  getContext() { return new Proxy({ measureText: () => ({ width: 24 }) }, { get: (target, key) => target[key] ?? (() => {}) }); }
  setPointerCapture() {}
}

export function environment(options = {}) {
  const document = new Element('document'); document.hidden = false; document.documentElement = new Element('html');
  const elements = new Map();
  document.createElement = tag => { const element = new Element(tag); element.document = document; return element; };
  document.createTextNode = value => String(value);
  document.createDocumentFragment = () => new Element('fragment');
  for (const [, id] of fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').matchAll(/id="([^"]+)"/g)) {
    const element = document.createElement(id.endsWith('Canvas') ? 'canvas' : 'div'); element.id = id; elements.set(id, element);
  }
  const canvasIds = ['asteroidsCanvas', 'invadersCanvas', 'gameCanvas', 'brickCanvas', 'snakeCanvas'];
  const panels = canvasIds.map((id, i) => { const panel = document.createElement('div'); panel.className = 'game-panel'; panel.offsetLeft = i * 464; panel.append(elements.get(id)); return panel; });
  elements.get('game-carousel').append(...panels);
  document.getElementById = id => elements.get(id) || null;
  document.querySelectorAll = selector => selector === '.game-panel' ? panels : [];
  document.querySelector = selector => selector === '.game-panel.active' ? panels.find(panel => panel.classList.contains('active')) : null;
  const motion = new Element(); motion.matches = false;
  const window = new Element('window'); Object.assign(window, { scrollY: 0, innerWidth: 1280, innerHeight: 720, matchMedia: () => motion, getComputedStyle: element => ({ transform: 'none', getPropertyValue: key => element.style[key] || '' }), scrollTo() {}, setTimeout, clearTimeout });
  const storage = new Map();
  const sessionStorage = options.storage || { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const frames = [];
  const context = vm.createContext({ console, document, window, HTMLElement: Element, navigator: { maxTouchPoints: 0 }, history: { pushState() {} },
    sessionStorage, localStorage: sessionStorage, URL, AbortController, setTimeout, clearTimeout,
    performance: { now: () => 100 }, requestAnimationFrame: callback => { frames.push(callback); return frames.length; }, cancelAnimationFrame() {},
    IntersectionObserver: class { constructor(callback) { this.callback = callback; } observe() {} unobserve() {} disconnect() {} },
    fetch: options.fetch || (async () => ({ ok: true, json: async () => [] })) });
  return { context, document, window, motion, elements, panels, frames, storage };
}

export function loadSite(options = {}) {
  const env = environment(options);
  let source = fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8');
  if (options.controller) {
    // Expose closed-over controller operations only in this isolated test VM.
    // Do not initialize WebGL or run the animation scheduler in unit tests.
    source = source.slice(0, source.indexOf('  // Keep the 2D game available')) + `
      globalThis.controller = { snake, ast, inv, brick, games, setActive, placeSnakeFood, updateSnake,
        handleGameKeyDown, updateStoredHighScore, loop, getActiveGame, updateAsteroids, updateInvaders, selectCarouselIndex,
        holds: () => [holdLeft, holdRight], paused: () => [astPaused, invPaused, carPaused, brickPaused, snakePaused] };
    });`;
  }
  vm.runInContext(source, env.context, { filename: 'script.js' });
  if (options.controller) env.document.emit('DOMContentLoaded');
  return env;
}

export function loadRenderer(file, kind) {
  const env = environment(); const renderers = []; const observers = [];
  class Renderer {
    constructor() { this.domElement = new Element('canvas'); this.calls = 0; renderers.push(this); }
    setPixelRatio() {} setSize(width, height) { this.width = width; this.height = height; }
    render(scene, camera) { this.scene = scene; this.camera = camera; this.calls++; }
    dispose() { this.disposed = true; }
  }
  env.context.THREE = { ...THREE, WebGLRenderer: Renderer };
  env.context.IntersectionObserver = class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } };
  const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    .replace(/^import \* as THREE[^\n]+\n/, '').replace('export function ', 'function ');
  vm.runInContext(source, env.context, { filename: file });
  const canvas = env.elements.get(kind === 'car' ? 'gameCanvas' : `${kind}Canvas`);
  canvas.parentElement.classList.add('active');
  const portal = kind === 'car' ? env.context.createRacingPortal(canvas) : env.context.createArcadePortal(canvas, kind);
  return { ...env, portal, renderer: renderers[0], observer: observers[0], panel: canvas.parentElement };
}
