const PROJECTS_CACHE_KEY = "jl_projects_cache_v1";
const PROJECTS_CACHE_TTL_MS = 1000 * 60 * 30;
const PROJECTS_QUEUE_KEY = "jl_projects_queue_v1";
const PROJECT_LIMIT = 3;
const FEATURED_TOPIC = "featured";
const GITHUB_REPOS_URL = "https://api.github.com/users/Jett-Lu/repos?per_page=100&sort=updated&type=owner";
const GITHUB_API_HEADERS = { Accept: "application/vnd.github+json" };
const GITHUB_PROFILE_URL = "https://github.com/Jett-Lu?tab=repositories";

function readProjectsCache() {
  try {
    const raw = sessionStorage.getItem(PROJECTS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.t !== "number" || !Array.isArray(parsed.repos)) return null;
    if (Date.now() - parsed.t > PROJECTS_CACHE_TTL_MS) return null;
    return parsed.repos;
  } catch {
    return null;
  }
}

function writeProjectsCache(repos) {
  try {
    sessionStorage.setItem(PROJECTS_CACHE_KEY, JSON.stringify({ t: Date.now(), repos }));
  } catch {
    // ignore
  }
}

function shuffleList(values) {
  const shuffled = [...values];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function readProjectsQueue() {
  try {
    const raw = sessionStorage.getItem(PROJECTS_QUEUE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.poolKey !== "string" || !Array.isArray(parsed.remainingIds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeProjectsQueue(poolKey, remainingIds) {
  try {
    sessionStorage.setItem(PROJECTS_QUEUE_KEY, JSON.stringify({ poolKey, remainingIds }));
  } catch {
    // ignore
  }
}

function selectProjectWindow(repos) {
  if (repos.length === 0) return [];

  const repoIds = repos.map((repo) => repo.id);
  const poolKey = repoIds.join(",");
  const savedQueue = readProjectsQueue();
  let remainingIds =
    savedQueue && savedQueue.poolKey === poolKey
      ? savedQueue.remainingIds.filter((id) => repoIds.includes(id))
      : [];

  const selectedIds = [];
  const targetSize = Math.min(PROJECT_LIMIT, repos.length);

  while (selectedIds.length < targetSize) {
    if (!remainingIds.length) {
      remainingIds = shuffleList(repoIds);
    }

    const nextId = remainingIds.shift();
    if (!selectedIds.includes(nextId)) {
      selectedIds.push(nextId);
    }
  }

  writeProjectsQueue(poolKey, remainingIds);

  return selectedIds
    .map((id) => repos.find((repo) => repo.id === id))
    .filter(Boolean);
}

function sanitizeRepoUrl(value) {
  try {
    const url = new URL(String(value));
    const path = url.pathname.toLowerCase();
    if (url.protocol === "https:" && url.hostname === "github.com" && path.startsWith("/jett-lu/")) {
      return url.toString();
    }
  } catch {
    // ignore
  }
  return GITHUB_PROFILE_URL;
}

function sanitizeLanguagesUrl(value) {
  try {
    const url = new URL(String(value));
    const path = url.pathname.toLowerCase();
    if (url.protocol === "https:" && url.hostname === "api.github.com" && path.startsWith("/repos/jett-lu/")) {
      return url.toString();
    }
  } catch {
    // ignore
  }
  return null;
}

function hasFeaturedTopic(repo) {
  return Array.isArray(repo.topics) && repo.topics.some((topic) => String(topic).toLowerCase() === FEATURED_TOPIC);
}

function hasProjectSummary(repo) {
  return Boolean(repo.description || repo.homepage);
}

function compareRepos(a, b) {
  const archivedDiff = Number(a.archived) - Number(b.archived);
  if (archivedDiff !== 0) return archivedDiff;

  const summaryDiff = Number(hasProjectSummary(b)) - Number(hasProjectSummary(a));
  if (summaryDiff !== 0) return summaryDiff;

  const updatedDiff = new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  if (updatedDiff !== 0) return updatedDiff;

  const starsDiff = (b.stargazers_count || 0) - (a.stargazers_count || 0);
  if (starsDiff !== 0) return starsDiff;

  return a.name.localeCompare(b.name);
}

function createProjectCard(repo, langList) {
  const card = document.createElement("article");
  card.className = "project-card";

  const title = document.createElement("h3");
  title.textContent = repo.name;

  const description = document.createElement("p");
  description.textContent = repo.description || "No description provided.";

  const languages = document.createElement("p");
  const languagesLabel = document.createElement("strong");
  languagesLabel.textContent = "Languages:";
  languages.append(languagesLabel, ` ${langList}`);

  const link = document.createElement("a");
  link.href = sanitizeRepoUrl(repo.html_url);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "View on GitHub ->";

  card.append(title, description, languages, link);
  return card;
}

function renderProjectFallback(container, message) {
  const text = document.createElement("p");
  text.textContent = `${message} `;

  const link = document.createElement("a");
  link.className = "text-link";
  link.href = GITHUB_PROFILE_URL;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Browse all repositories on GitHub.";

  container.replaceChildren(text);
  text.appendChild(link);
}

async function loadProjects(container, opts = { force: false }) {
  if (!container) return;

  const loading = document.createElement("p");
  loading.textContent = "Loading featured projects...";
  container.replaceChildren(loading);

  try {
    let allRepos = null;

    if (!opts.force) {
      const cached = readProjectsCache();
      if (cached) allRepos = cached;
    }

    if (!allRepos) {
      const res = await fetch(GITHUB_REPOS_URL, { headers: GITHUB_API_HEADERS });
      if (!res.ok) throw new Error(`GitHub API request failed with status ${res.status}`);
      allRepos = await res.json();
      if (!Array.isArray(allRepos)) throw new Error("GitHub API returned an unexpected response.");
      writeProjectsCache(allRepos);
    }

    const repos = allRepos.filter((repo) => repo && !repo.fork);
    const featuredRepos = repos.filter(hasFeaturedTopic).sort(compareRepos);
    const fallbackRepos = repos.filter((repo) => !hasFeaturedTopic(repo)).sort(compareRepos);
    const repoPool = featuredRepos.length ? featuredRepos : fallbackRepos;
    const selected = selectProjectWindow(repoPool);

    container.replaceChildren();

    for (const repo of selected) {
      let langList = "N/A";

      try {
        const langCacheKey = `jl_lang_${repo.name}`;
        const cachedLang = sessionStorage.getItem(langCacheKey);
        if (cachedLang) {
          langList = cachedLang;
        } else {
          const languagesUrl = sanitizeLanguagesUrl(repo.languages_url);
          if (!languagesUrl) throw new Error("Repository languages URL is not trusted.");
          const langRes = await fetch(languagesUrl, { headers: GITHUB_API_HEADERS });
          if (!langRes.ok) throw new Error(`GitHub API request failed with status ${langRes.status}`);
          const langs = await langRes.json();
          langList = Object.keys(langs || {}).join(", ") || "N/A";
          sessionStorage.setItem(langCacheKey, langList);
        }
      } catch {
        langList = "N/A";
      }

      container.appendChild(createProjectCard(repo, langList));
    }

    if (!selected.length) {
      renderProjectFallback(container, "No featured projects found.");
    }
  } catch (err) {
    console.error("GitHub fetch failed:", err);
    renderProjectFallback(container, "Failed to load featured projects.");
  }
}

window.portfolioProjects = {
  loadProjects
};
