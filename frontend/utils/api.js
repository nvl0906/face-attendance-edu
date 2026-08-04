import axios from "axios";
import * as SecureStore from 'expo-secure-store';

// Nodes grouped by tier. GPU nodes are tried first — even if a CPU node
// happens to answer its health check faster, GPU is still preferred as
// long as at least one GPU node responds within GPU_TIER_TIMEOUT_MS.
// Only if the entire GPU tier fails/times out does the CPU tier get tried.
const BACKEND_TIERS = [
  {
    type: "gpu",
    urls: [
      "https://node1.samtech.qzz.io"
    ],
  },
  {
    type: "cpu",
    urls: [

    ],
  },
];

const STORAGE_KEY = "backendBaseUrl";
const HEALTH_CHECK_TIMEOUT_MS = 3000;
// How long to wait for the GPU tier specifically before giving up on it
// and falling back to CPU. Shorter than HEALTH_CHECK_TIMEOUT_MS so a single
// slow/dead GPU machine doesn't stall the whole selection process.
const GPU_TIER_TIMEOUT_MS = 1500;
const REVALIDATE_INTERVAL_MS = 5 * 60 * 1000; // re-check cached URL every 5 min while app is open

let lastValidatedAt = 0;

function raceUrls(urls, timeoutMs) {
  return Promise.any(
    urls.map((url) =>
      axios
        .get(`${url}/health`, { timeout: timeoutMs })
        .then((res) => {
          if (res.data?.status !== "ok") throw new Error("unhealthy");
          return url;
        })
    )
  );
}

/**
 * Tries the GPU tier first (raced against itself, with a short deadline).
 * Falls back to the CPU tier only if every GPU node fails or times out.
 * Within a tier, whichever node answers first wins — priority is
 * tier-level (GPU > CPU), not based on raw response speed across tiers.
 */
async function findFastestHealthyUrl() {
  for (const tier of BACKEND_TIERS) {
    if (tier.urls.length === 0) continue;
    try {
      const winner = await raceUrls(
        tier.urls,
        tier.type === "gpu" ? GPU_TIER_TIMEOUT_MS : HEALTH_CHECK_TIMEOUT_MS
      );
      return winner;
    } catch {
      // Entire tier failed — fall through to the next one.
      continue;
    }
  }
  throw new Error("No healthy backend available");
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