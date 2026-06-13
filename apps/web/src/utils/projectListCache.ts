const PROJECT_LIST_CACHE_PREFIX = 'eazyui:workspace-projects:';

export type ProjectListCache<T> = {
  cachedAt: number;
  projects: T[];
};

function getProjectListCacheKey(uid: string) {
  return `${PROJECT_LIST_CACHE_PREFIX}${uid}`;
}

export function readProjectListCache<T>(uid: string): ProjectListCache<T> | null {
  try {
    const raw = window.localStorage.getItem(getProjectListCacheKey(uid));
    if (!raw) return null;
    const cache = JSON.parse(raw) as ProjectListCache<T>;
    if (!Array.isArray(cache.projects) || typeof cache.cachedAt !== 'number') return null;
    return cache;
  } catch {
    return null;
  }
}

export function writeProjectListCache<T>(uid: string, projects: T[]) {
  try {
    window.localStorage.setItem(getProjectListCacheKey(uid), JSON.stringify({
      cachedAt: Date.now(),
      projects,
    } satisfies ProjectListCache<T>));
  } catch {
    // Storage can be unavailable or full; the in-memory state still remains usable.
  }
}

export function markProjectListCacheStale(uid: string) {
  const cache = readProjectListCache<unknown>(uid);
  if (!cache) return;
  try {
    window.localStorage.setItem(getProjectListCacheKey(uid), JSON.stringify({
      ...cache,
      cachedAt: 0,
    }));
  } catch {
    // The next normal refresh will recover if storage is unavailable.
  }
}
