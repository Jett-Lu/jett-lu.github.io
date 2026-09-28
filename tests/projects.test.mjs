import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSite } from './helpers.mjs';

const repo = (name = 'example') => ({ name, html_url: `https://github.com/Jett-Lu/${name}`, languages_url: `https://api.github.com/repos/Jett-Lu/${name}/languages`, language: 'JavaScript', updated_at: '2026-09-01', description: 'A project' });
const response = body => ({ ok: true, json: async () => body });
test('valid projects survive malformed neighbours in API data', async () => {
  const env = loadSite({ fetch: async url => response(url.includes('/languages') ? { JavaScript: 42 } : [repo(), {}, null, { name: 123 }]) });
  const container = env.elements.get('project-container'); await env.context.loadProjects(container);
  assert.match(container.textContent, /example/); assert.equal(container.getAttribute('aria-busy'), 'false');
  assert.equal(container.querySelectorAll('.project-card').length, 1);
});
test('language fetching still works when browser storage is blocked', async () => {
  let requests = 0;
  const env = loadSite({ storage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } }, fetch: async url => { requests++; return response(url.includes('/languages') ? { Python: 42 } : [repo()]); } });
  const container = env.elements.get('project-container'); await env.context.loadProjects(container);
  assert.equal(requests, 2); assert.match(container.textContent, /Python/);
});
test('trusted URLs reject credentials, nonstandard ports and extra paths', () => {
  const { context } = loadSite();
  for (const url of ['javascript:alert(1)', 'https://user:pass@github.com/Jett-Lu/repo', 'https://github.com:444/Jett-Lu/repo', 'https://github.com/Jett-Lu/repo/evil']) {
    assert.equal(context.sanitizeRepoUrl(url), 'https://github.com/Jett-Lu?tab=repositories');
  }
  assert.equal(context.sanitizeLanguagesUrl('https://api.github.com/repos/Jett-Lu/repo/issues'), null);
});
test('invalid cache timestamps and malformed cache entries are rejected', () => {
  const env = loadSite(); env.storage.set('jl_projects_cache_v1', JSON.stringify({ t: Date.now() + 10000000, repos: [repo()] }));
  assert.equal(env.context.readProjectsCache(), null);
});
test('network failure recovers controls and offers a usable GitHub link', async () => {
  const env = loadSite({ fetch: async () => { throw Error('offline'); } }); const container = env.elements.get('project-container');
  await env.context.loadProjects(container); assert.match(container.textContent, /Failed to load/);
  assert.equal(container.querySelector('a').href, 'https://github.com/Jett-Lu?tab=repositories');
  assert.equal(env.elements.get('refresh-projects').disabled, false);
});
test('a stalled request times out instead of leaving loading permanently', async () => {
  const env = loadSite({ fetch: (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Error('timeout')))) });
  assert.equal(typeof env.context.fetchGithubJson, 'function');
  await assert.rejects(env.context.fetchGithubJson('https://api.github.com', 5));
});

test('a failed refresh retains loaded cards and explains the failure', async () => {
  let offline = false;
  const env = loadSite({ fetch: async url => {
    if (offline) throw Error('offline');
    return response(url.includes('/languages') ? { JavaScript: 42 } : [repo()]);
  } });
  const container = env.elements.get('project-container');
  await env.context.loadProjects(container);
  const card = container.querySelector('.project-card');
  offline = true;
  await env.context.loadProjects(container, { force: true });
  assert.equal(container.querySelector('.project-card'), card);
  assert.match(env.elements.get('project-status').textContent, /last available projects/);
  assert.equal(env.elements.get('refresh-projects').disabled, false);
});

test('an empty successful refresh removes obsolete cards and supplies a fallback', async () => {
  let repositories = [repo()];
  const env = loadSite({ fetch: async url => response(url.includes('/languages') ? { JavaScript: 42 } : repositories) });
  const container = env.elements.get('project-container');
  await env.context.loadProjects(container);
  repositories = [];
  await env.context.loadProjects(container, { force: true });
  assert.equal(container.querySelectorAll('.project-card').length, 0);
  assert.match(container.textContent, /No featured projects found/);
  assert.equal(container.getAttribute('aria-busy'), 'false');
});
