/* 基于内存的 Idempotency-Key 防重：单进程内重复提交返回首次结果 */
const store = new Map();
const TTL_MS = 10 * 60 * 1000;

export function getIdempotent(key) {
  if (!key) return null;
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry.result;
}

export function setIdempotent(key, result) {
  if (!key) return;
  store.set(key, { result, at: Date.now() });
}

/* 周期性清理过期条目，避免 Map 无限增长 */
export function startIdempotencySweep() {
  return setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of store) {
      if (now - entry.at > TTL_MS) store.delete(k);
    }
  }, TTL_MS);
}
