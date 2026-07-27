import axios from "axios";
import * as SecureStore from 'expo-secure-store';

// All known backend nodes. Add/remove entries here as machines come online
// or go away — nothing else in the app needs to change.
const BACKEND_URLS = [
  "https://attendance.samtech.qzz.io"
];

const STORAGE_KEY = "backendBaseUrl";
const HEALTH_CHECK_TIMEOUT_MS = 3000;
const REVALIDATE_INTERVAL_MS = 5 * 60 * 1000; // re-check cached URL every 5 min while app is open

let lastValidatedAt = 0;

/**
 * Races a health check against every known backend in parallel and
 * resolves with whichever responds successfully first. Dead/slow machines
 * never block this — Promise.any resolves the instant one candidate wins,
 * it doesn't wait for the others to time out.
 */
async function findFastestHealthyUrl() {
  try {
    const winner = await Promise.any(
      BACKEND_URLS.map((url) =>
        axios
          .get(`${url}/health`, { timeout: HEALTH_CHECK_TIMEOUT_MS })
          .then((res) => {
            if (res.data?.status !== "ok") throw new Error("unhealthy");
            return url;
          })
      )
    );
    return winner;
  } catch (aggregateError) {
    // Every single backend failed the race.
    throw new Error("No healthy backend available");
  }
}

async function getBaseUrl({ forceRevalidate = false } = {}) {
  const cached = await SecureStore.getItemAsync(STORAGE_KEY);
  const isStale = Date.now() - lastValidatedAt > REVALIDATE_INTERVAL_MS;

  if (cached && !forceRevalidate && !isStale) {
    return cached;
  }

  const freshUrl = await findFastestHealthyUrl();
  await SecureStore.setItemAsync(STORAGE_KEY, freshUrl);
  lastValidatedAt = Date.now();
  return freshUrl;
}

const api = axios.create();

api.interceptors.request.use(async (config) => {
  // Pick the current best-known backend before every request, unless one
  // was explicitly set already (e.g. during a failover retry below).
  if (!config.baseURL) {
    config.baseURL = await getBaseUrl();
  }

  const token = await SecureStore.getItemAsync("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // If data is FormData, let Axios set the Content-Type automatically
  if (config.data instanceof FormData) {
    config.headers['Content-Type'] = 'multipart/form-data';
  }
  // For other data types, set Content-Type to application/json if not already set
  if (!config.headers['Content-Type']) {
    config.headers['Content-Type'] = 'application/json';
  }
  return config;
});

// The one place failover logic lives. Any request that fails due to a
// network error or the backend being unreachable gets ONE automatic retry
// against a freshly-reselected healthy backend. If that also fails, the
// error propagates normally to whatever called api — no infinite retries.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;

    // Only retry on network-level failures (timeout, connection refused,
    // DNS failure) — not on real HTTP error responses like 401/404/500,
    // which are the backend correctly telling you something, not a sign
    // that backend is down.
    const isNetworkError = !error.response;

    if (isNetworkError && config && !config._retriedFailover) {
      config._retriedFailover = true;
      try {
        config.baseURL = await getBaseUrl({ forceRevalidate: true });
        return api.request(config);
      } catch (failoverError) {
        return Promise.reject(failoverError);
      }
    }

    return Promise.reject(error);
  }
);

// Call once at app startup (e.g. in your root App.js / _layout.js) to warm
// the cache before the user's first real request, rather than paying the
// race latency on the very first API call.
export async function warmBackendSelection() {
  try {
    await getBaseUrl({ forceRevalidate: true });
  } catch {
    // No backend reachable at launch — api will still attempt and surface
    // a real error to the UI on first actual use. Nothing to do here
    // except not crash startup over it.
  }
}

export default api;