/* ================================================================
   PLAN ZMIAN — REMOTE FACTORY SCHEDULE (read-only client)

   Classic script (NO ES modules) — see docs/AGENT.md.

   Loads right after js/schedules/gillette/<year>.js and BEFORE js/core.js,
   so the cached server schedule can be applied synchronously during load
   and the very first render already shows the last known server schedule.

   SPEC: docs/ADMIN_BACKEND_SPEC.md 7.1 / 7.5 / 13.4

   Behaviour:
   - synchronous: localStorage['planzmian_remote_schedule_v1'] -> applied now;
   - asynchronous: fetch('/api/schedule', {cache:'no-store'});
   - application goes through registerYearData('gillette', ...) so the
     factorySchedule / factoryMonthHours alias objects are updated IN PLACE
     (the alias objects themselves are never re-assigned);
   - every payload passes a light client-side validation (months 1..12,
     brigades A/B/C/D, array length === days in month, values only
     '' | 'R' | 'P' | 'N'). 'W' is rejected on purpose: the paint tool
     converts 'W' to '' before writing factory data;
   - an invalid year is skipped, the remaining years are applied;
   - any network/parse error is ignored silently (console.warn WITHOUT any
     schedule data); static schedule / local cache keep working;
   - re-check on visibilitychange (not more than once per 60 s) and on 'online';
   - after applying: refreshViews() + a toast (i18n), but NOT for the first
     application after a cold start.

   Phase 1 only: this module NEVER writes to the server.
   ================================================================ */

const REMOTE_SCHEDULE_CACHE_KEY = 'planzmian_remote_schedule_v1';
const REMOTE_SCHEDULE_ID = 'gillette';
const REMOTE_SCHEDULE_ENDPOINT = '/api/schedule';
const REMOTE_RECHECK_MIN_MS = 60000;
const REMOTE_BRIGADES = ['A', 'B', 'C', 'D'];
const REMOTE_ALLOWED_SHIFTS = ['', 'R', 'P', 'N'];

// Revision snapshot of what is currently applied (cold start = nothing applied)
let remoteAppliedRevisions = {};
// True after the first apply of this page load -> suppresses the first toast
let remoteHasAppliedOnce = false;
let remoteLastCheckAt = 0;

/* === VALIDATION (client-side copy of the server rules) === */

function remoteDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function remoteIsPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validates one year entry `{ revision, updatedAt, data, hours }`.
 * @returns {boolean}
 */
function validateRemoteYearPayload(year, entry) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return false;
  if (!remoteIsPlainObject(entry)) return false;
  if (!remoteIsPlainObject(entry.data) || !remoteIsPlainObject(entry.hours)) return false;

  const dataKeys = Object.keys(entry.data).sort((a, b) => Number(a) - Number(b));
  if (dataKeys.length !== 12) return false;
  for (let i = 0; i < 12; i++) {
    if (dataKeys[i] !== String(i + 1)) return false;
  }

  for (let month = 1; month <= 12; month++) {
    const monthKey = String(month);
    const monthData = entry.data[monthKey];
    const monthHours = entry.hours[monthKey];
    if (!remoteIsPlainObject(monthData) || !remoteIsPlainObject(monthHours)) return false;

    const brigades = Object.keys(monthData).sort();
    if (brigades.length !== REMOTE_BRIGADES.length) return false;
    for (let i = 0; i < REMOTE_BRIGADES.length; i++) {
      if (brigades[i] !== REMOTE_BRIGADES[i]) return false;
    }

    const daysCount = remoteDaysInMonth(year, month);
    for (let i = 0; i < REMOTE_BRIGADES.length; i++) {
      const brigade = REMOTE_BRIGADES[i];
      const days = monthData[brigade];
      if (!Array.isArray(days) || days.length !== daysCount) return false;
      for (let d = 0; d < days.length; d++) {
        if (REMOTE_ALLOWED_SHIFTS.indexOf(days[d]) === -1) return false;
      }
      const hours = monthHours[brigade];
      if (!Number.isInteger(hours) || hours < 0 || hours > 744) return false;
    }
  }

  return true;
}

/**
 * Validates the whole payload shape.
 * @returns {boolean}
 */
function validateRemoteSchedulePayload(payload) {
  if (!remoteIsPlainObject(payload)) return false;
  if (!remoteIsPlainObject(payload.years)) return false;
  const years = Object.keys(payload.years);
  for (let i = 0; i < years.length; i++) {
    const year = Number(years[i]);
    if (!Number.isInteger(year)) return false;
    if (!validateRemoteYearPayload(year, payload.years[years[i]])) return false;
  }
  return true;
}

/* === APPLICATION === */

function remoteRegistry() {
  return typeof globalThis !== 'undefined' ? globalThis : {};
}

/**
 * Replaces the contents of target[year] IN PLACE when it already exists,
 * so every module holding a reference to the year object sees new data.
 */
function remoteReplaceYearInPlace(target, year, value) {
  if (!target) return value;
  const existing = target[year];
  if (remoteIsPlainObject(existing)) {
    Object.keys(existing).forEach((key) => {
      delete existing[key];
    });
    Object.keys(value).forEach((key) => {
      existing[key] = value[key];
    });
    return existing;
  }
  target[year] = value;
  return value;
}

/**
 * Applies a payload from GET /api/schedule.
 * Invalid years are skipped, valid ones are applied.
 *
 * @param {object} payload - `{ scheduleId, generatedAt, years: {...} }`
 * @returns {{ applied: number[], skipped: number[] }}
 */
function applyRemoteSchedulePayload(payload) {
  const result = { applied: [], skipped: [] };
  if (!remoteIsPlainObject(payload) || !remoteIsPlainObject(payload.years)) return result;

  const g = remoteRegistry();
  const registerYearDataFn = typeof g.registerYearData === 'function' ? g.registerYearData : null;
  const factorySchedule = g.factorySchedule;
  const factoryMonthHours = g.factoryMonthHours;
  if (!registerYearDataFn) {
    console.warn('[schedules/remote] registerYearData unavailable — remote data ignored');
    return result;
  }

  const years = Object.keys(payload.years);
  for (let i = 0; i < years.length; i++) {
    const year = Number(years[i]);
    const entry = payload.years[years[i]];
    if (!validateRemoteYearPayload(year, entry)) {
      result.skipped.push(year);
      continue;
    }

    const data = remoteReplaceYearInPlace(factorySchedule, year, entry.data);
    const hours = remoteReplaceYearInPlace(factoryMonthHours, year, entry.hours);
    registerYearDataFn(REMOTE_SCHEDULE_ID, year, data, hours);
    remoteAppliedRevisions[year] = Number(entry.revision) || 0;
    result.applied.push(year);
  }

  return result;
}

/* === CACHE (localStorage) === */

function remoteReadCache() {
  try {
    const raw = remoteRegistry().localStorage.getItem(REMOTE_SCHEDULE_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[schedules/remote] cache read failed');
    return null;
  }
}

function remoteWriteCache(payload) {
  try {
    remoteRegistry().localStorage.setItem(
      REMOTE_SCHEDULE_CACHE_KEY,
      JSON.stringify({
        scheduleId: REMOTE_SCHEDULE_ID,
        generatedAt: payload.generatedAt || '',
        years: payload.years || {},
      })
    );
  } catch (err) {
    console.warn('[schedules/remote] cache write failed');
  }
}

/* === REFRESH + TOAST === */

function refreshAfterRemoteSchedule() {
  const g = remoteRegistry();
  if (typeof g.refreshViews === 'function') {
    try {
      g.refreshViews();
    } catch (err) {
      console.warn('[schedules/remote] refreshViews failed');
    }
  }

  const firstApply = !remoteHasAppliedOnce;
  remoteHasAppliedOnce = true;
  if (firstApply) return; // cold start: no toast for the first application

  if (typeof g.showToast === 'function') {
    const message = typeof g.t === 'function' ? g.t('toastScheduleUpdatedRemote') : '';
    if (message) {
      try {
        g.showToast('info', message);
      } catch (err) {
        console.warn('[schedules/remote] toast failed');
      }
    }
  }
}

/* === FETCH === */

function remoteHasNewerRevisions(payload) {
  if (!remoteIsPlainObject(payload) || !remoteIsPlainObject(payload.years)) return false;
  const years = Object.keys(payload.years);
  if (years.length !== Object.keys(remoteAppliedRevisions).length) return true;
  for (let i = 0; i < years.length; i++) {
    const year = Number(years[i]);
    const revision = Number(payload.years[years[i]].revision) || 0;
    if (remoteAppliedRevisions[year] !== revision) return true;
  }
  return false;
}

async function fetchRemoteSchedule() {
  try {
    const response = await fetch(REMOTE_SCHEDULE_ENDPOINT, { cache: 'no-store' });
    if (!response || response.status !== 200) return;
    const payload = await response.json();
    if (!validateRemoteSchedulePayload(payload)) {
      console.warn('[schedules/remote] invalid payload shape — ignored');
      return;
    }
    if (!remoteHasNewerRevisions(payload)) return;

    const outcome = applyRemoteSchedulePayload(payload);
    if (!outcome.applied.length) return;
    remoteWriteCache(payload);
    refreshAfterRemoteSchedule();
  } catch (err) {
    // Offline / 503 / parse error: stay silent, keep cache + static schedule.
    console.warn('[schedules/remote] remote schedule unavailable');
  }
}

/* === RE-CHECK TRIGGERS === */

function scheduleRemoteCheck(force) {
  const now = Date.now();
  if (!force && now - remoteLastCheckAt < REMOTE_RECHECK_MIN_MS) return;
  remoteLastCheckAt = now;
  fetchRemoteSchedule();
}

function remoteInitRechecks() {
  const g = remoteRegistry();
  const doc = g.document;
  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'hidden') return;
      scheduleRemoteCheck(false);
    });
  }
  if (g.window && typeof g.window.addEventListener === 'function') {
    g.window.addEventListener('online', () => {
      scheduleRemoteCheck(true);
    });
  }
}

/* === BOOT (synchronous cache apply) === */

(function remoteScheduleBoot() {
  const g = remoteRegistry();
  if (!g.localStorage) return; // Node / tests: nothing to do

  const cached = remoteReadCache();
  if (cached) {
    const outcome = applyRemoteSchedulePayload(cached);
    if (outcome.applied.length) remoteHasAppliedOnce = true;
  }

  remoteInitRechecks();
  fetchRemoteSchedule();
})();

/* === EXPOSE TO GLOBAL SCOPE === */
if (typeof window !== 'undefined') {
  window.applyRemoteSchedulePayload = applyRemoteSchedulePayload;
  window.validateRemoteYearPayload = validateRemoteYearPayload;
  window.validateRemoteSchedulePayload = validateRemoteSchedulePayload;
  window.refreshAfterRemoteSchedule = refreshAfterRemoteSchedule;
}

// Node.js compatibility for unit tests (browser ignores this block)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    REMOTE_SCHEDULE_CACHE_KEY,
    REMOTE_SCHEDULE_ID,
    REMOTE_SCHEDULE_ENDPOINT,
    REMOTE_BRIGADES,
    REMOTE_ALLOWED_SHIFTS,
    REMOTE_RECHECK_MIN_MS,
    remoteDaysInMonth,
    validateRemoteYearPayload,
    validateRemoteSchedulePayload,
    applyRemoteSchedulePayload,
    remoteHasNewerRevisions,
  };
}
