/* MyFam — local persistence. Saves the tree to localStorage so a refresh
 * no longer resets it to the seed family. Fails silently (private mode,
 * storage disabled, quota) and falls back to the seed in MyFam.jsx. */
const KEY = "myfam:v1";
let _timer;

export function loadState() {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Minimal shape guard — anything malformed falls back to the seed.
    if (!data || !Array.isArray(data.persons)) return null;
    return data;
  } catch {
    return null;
  }
}

/* Debounced so dragging a card (which updates state on every pointer move)
 * doesn't stringify + write on every frame. */
export function saveState(state) {
  if (typeof localStorage === "undefined") return;
  clearTimeout(_timer);
  _timer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* quota / disabled storage — ignore */
    }
  }, 300);
}

export function clearState() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
