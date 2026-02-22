const actionStore = new Map();

function keyFor(guildId, action) {
  return `${guildId}:${action}`;
}

function nowMs() {
  return Date.now();
}

function cleanupOld(entries, ttlMs) {
  const cutoff = nowMs() - ttlMs;
  return entries.filter((entry) => entry.at >= cutoff);
}

function recordModAction({ guildId, action, actorId, data = {}, ttlMs = 45_000 }) {
  if (!guildId || !action || !actorId) return;

  const key = keyFor(guildId, action);
  const existing = actionStore.get(key) || [];
  const cleaned = cleanupOld(existing, ttlMs);

  cleaned.push({
    guildId,
    action,
    actorId,
    data,
    at: nowMs(),
    ttlMs
  });

  actionStore.set(key, cleaned);
}

function findRecentModAction({ guildId, action, matcher, ttlMs = 45_000 }) {
  if (!guildId || !action) return null;

  const key = keyFor(guildId, action);
  const existing = actionStore.get(key) || [];
  const cleaned = cleanupOld(existing, ttlMs);
  actionStore.set(key, cleaned);

  for (let index = cleaned.length - 1; index >= 0; index--) {
    const entry = cleaned[index];
    if (!matcher || matcher(entry.data)) {
      return entry;
    }
  }

  return null;
}

module.exports = {
  recordModAction,
  findRecentModAction
};
