/* ================================================================
   PLAN ZMIAN — SYNC TRACKING MODULE
   
   PRIVATE MODULE — tracks user's local sync state
   NEVER commit personal data to git — this module only manages
   timestamps in localStorage.
   
   Purpose:
   - Track when user last modified data (any save operation)
   - Track when user last successfully synced to Google Drive
   - Detect unsynced changes (modified > lastSync)
   - Prevent data loss when logging out with pending changes
   ================================================================ */

const SYNC_META_KEY = 'gillette_sync_meta';

function normalizeSyncShift(value) {
  return value === null || value === undefined ? '' : String(value);
}

function countShiftArrayDifferences(first, second) {
  const firstDays = Array.isArray(first) ? first : [];
  const secondDays = Array.isArray(second) ? second : [];
  const sharedLength = Math.min(firstDays.length, secondDays.length);
  let differences = Math.abs(firstDays.length - secondDays.length);

  for (let index = 0; index < sharedLength; index++) {
    if (
      normalizeSyncShift(firstDays[index]) !==
      normalizeSyncShift(secondDays[index])
    ) {
      differences++;
    }
  }

  return differences;
}

function buildLegacyFactoryReference(year, month, brigade, currentDays) {
  const legacyDays = Array.isArray(currentDays) ? currentDays.slice() : [];
  const key = `${year}-${month}-${brigade}`;

  if (key === '2026-2-B') {
    legacyDays.splice(9, 1);
  } else if (key === '2026-4-A') {
    legacyDays.splice(8, 1);
    legacyDays.push('');
  } else if (key === '2026-10-A') {
    legacyDays.splice(10, 1);
    if (legacyDays.length > 0) {
      legacyDays[legacyDays.length - 1] = '';
    }
  } else if (key === '2026-12-C') {
    legacyDays.splice(30, 1);
  }

  return legacyDays;
}

function selectPersonalScheduleReference(
  year,
  month,
  brigade,
  customDays,
  currentFactoryDays,
  allowLegacyReference
) {
  const currentDays = Array.isArray(currentFactoryDays)
    ? currentFactoryDays
    : [];

  if (!allowLegacyReference) return currentDays;

  const legacyDays = buildLegacyFactoryReference(
    year,
    month,
    brigade,
    currentDays
  );

  const currentDifferenceCount = countShiftArrayDifferences(
    customDays,
    currentDays
  );
  const legacyDifferenceCount = countShiftArrayDifferences(
    customDays,
    legacyDays
  );

  return legacyDifferenceCount < currentDifferenceCount
    ? legacyDays
    : currentDays;
}

function buildPersonalScheduleOverrides(
  customData,
  factoryData,
  allowLegacyReference
) {
  const overrides = {};
  const custom = customData && typeof customData === 'object' ? customData : {};
  const factory = factoryData && typeof factoryData === 'object' ? factoryData : {};

  Object.keys(custom).forEach((year) => {
    const customYear = custom[year];
    if (!customYear || typeof customYear !== 'object') return;

    Object.keys(customYear).forEach((month) => {
      const customMonth = customYear[month];
      if (!customMonth || typeof customMonth !== 'object') return;

      Object.keys(customMonth).forEach((brigade) => {
        const customDays = customMonth[brigade];
        if (!Array.isArray(customDays)) return;

        const factoryDays =
          factory[year] &&
          factory[year][month] &&
          Array.isArray(factory[year][month][brigade])
            ? factory[year][month][brigade]
            : [];

        const referenceDays = selectPersonalScheduleReference(
          year,
          month,
          brigade,
          customDays,
          factoryDays,
          allowLegacyReference === true
        );

        customDays.forEach((value, index) => {
          const customShift = normalizeSyncShift(value);
          const referenceShift = normalizeSyncShift(referenceDays[index]);

          if (customShift !== referenceShift) {
            overrides[`${year}-${month}-${brigade}-${index + 1}`] = customShift;
          }
        });
      });
    });
  });

  return overrides;
}

function normalizeShiftOverrides(overrides) {
  const normalized = {};

  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    return normalized;
  }

  Object.keys(overrides)
    .sort()
    .forEach((key) => {
      if (!/^\d{4}-\d{1,2}-[ABCD]-\d{1,2}$/.test(key)) return;

      const value = overrides[key];
      if (value !== '' && value !== 'R' && value !== 'P' && value !== 'N') {
        return;
      }

      normalized[key] = value;
    });

  return normalized;
}

function getPersonalShiftOverrides(payload) {
  const source = payload && typeof payload === 'object' ? payload : null;

  if (
    source &&
    Object.prototype.hasOwnProperty.call(source, 'shiftOverrides')
  ) {
    return normalizeShiftOverrides(source.shiftOverrides);
  }

  const customData = source
    ? source.customSchedule || {}
    : typeof customSchedule !== 'undefined'
      ? customSchedule
      : {};

  const embeddedFactoryIsAvailable = !!(
    source &&
    source.factorySchedule &&
    typeof source.factorySchedule === 'object'
  );

  const referenceFactory = embeddedFactoryIsAvailable
    ? source.factorySchedule
    : typeof factorySchedule !== 'undefined'
      ? factorySchedule
      : {};

  return normalizeShiftOverrides(
    buildPersonalScheduleOverrides(
      customData,
      referenceFactory,
      !embeddedFactoryIsAvailable
    )
  );
}

function createScheduleYearFromFactory(year, sourceFactory) {
  const result = {};
  const factoryYear =
    sourceFactory &&
    sourceFactory[year] &&
    typeof sourceFactory[year] === 'object'
      ? sourceFactory[year]
      : {};

  for (let month = 1; month <= 12; month++) {
    const daysInMonth = new Date(Number(year), month, 0).getDate();
    result[month] = {};

    ['A', 'B', 'C', 'D'].forEach((brigade) => {
      const factoryDays =
        factoryYear[month] && Array.isArray(factoryYear[month][brigade])
          ? factoryYear[month][brigade]
          : [];

      result[month][brigade] = new Array(daysInMonth)
        .fill('')
        .map((unused, index) => normalizeSyncShift(factoryDays[index]));
    });
  }

  return result;
}

function buildCustomScheduleFromShiftOverrides(overrides, sourceFactory) {
  const normalized = normalizeShiftOverrides(overrides);
  const factory =
    sourceFactory && typeof sourceFactory === 'object' ? sourceFactory : {};
  const result = {};

  Object.keys(normalized).forEach((key) => {
    const match = key.match(/^(\d{4})-(\d{1,2})-([ABCD])-(\d{1,2})$/);
    if (!match) return;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const brigade = match[3];
    const day = Number(match[4]);

    if (month < 1 || month > 12) return;
    if (day < 1 || day > new Date(year, month, 0).getDate()) return;

    if (!result[year]) {
      result[year] = createScheduleYearFromFactory(year, factory);
    }

    result[year][month][brigade][day - 1] = normalized[key];
  });

  return result;
}

function buildFactoryDraftOverrides(draftData, factoryData) {
  const overrides = {};
  const drafts = draftData && typeof draftData === 'object' ? draftData : {};
  const factory = factoryData && typeof factoryData === 'object' ? factoryData : {};

  Object.keys(drafts).forEach((year) => {
    const draftYear = drafts[year];
    if (!draftYear || typeof draftYear !== 'object') return;

    Object.keys(draftYear).forEach((month) => {
      const draftMonth = draftYear[month];
      if (!draftMonth || typeof draftMonth !== 'object') return;

      Object.keys(draftMonth).forEach((brigade) => {
        const draftDays = draftMonth[brigade];
        if (!Array.isArray(draftDays)) return;

        const factoryDays =
          factory[year] &&
          factory[year][month] &&
          Array.isArray(factory[year][month][brigade])
            ? factory[year][month][brigade]
            : [];

        draftDays.forEach((value, index) => {
          if (value === null || value === undefined) return;

          const draftShift = normalizeSyncShift(value);
          const factoryShift = normalizeSyncShift(factoryDays[index]);

          if (draftShift !== factoryShift) {
            overrides[`${year}-${month}-${brigade}-${index + 1}`] = draftShift;
          }
        });
      });
    });
  });

  return overrides;
}

function buildComparableSyncState(payload) {
  const source = payload && typeof payload === 'object' ? payload : null;
  const sourcePrefs = source
    ? source.prefs && typeof source.prefs === 'object'
      ? source.prefs
      : {}
    : typeof prefs !== 'undefined' && prefs
      ? prefs
      : {};

  const currentFactory =
    typeof factorySchedule !== 'undefined' && factorySchedule
      ? factorySchedule
      : {};

  const personalOverrides =
    typeof getPersonalShiftOverrides === 'function'
      ? getPersonalShiftOverrides(source)
      : {};

  const drafts = source
    ? source.factoryDrafts || {}
    : typeof factoryDrafts !== 'undefined'
      ? factoryDrafts
      : {};

  const vacationLimits = source
    ? source.vacationLimits || sourcePrefs.urlopLimits || {}
    : sourcePrefs.urlopLimits || {};

  return {
    customSchedule: personalOverrides,
    factoryDrafts: buildFactoryDraftOverrides(drafts, currentFactory),
    urlops: source
      ? source.urlops || {}
      : typeof urlops !== 'undefined'
        ? urlops
        : {},
    overtimes: source
      ? source.overtimes || {}
      : typeof overtimes !== 'undefined'
        ? overtimes
        : {},
    notes: source
      ? source.notes || {}
      : typeof notes !== 'undefined'
        ? notes
        : {},
    personalPrefs: {
      cellColors: sourcePrefs.cellColors || {},
      cellSkin: sourcePrefs.cellSkin || 'full',
      vacationLimits,
    },
  };
}

function stableSyncSerialize(value) {
  if (value === null) return 'null';

  if (Array.isArray(value)) {
    return `[${value
      .map((item) => stableSyncSerialize(item === undefined ? null : item))
      .join(',')}]`;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined && typeof value[key] !== 'function')
      .sort();

    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableSyncSerialize(value[key])}`)
      .join(',')}}`;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'null';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return JSON.stringify(String(value));
}

function hashSyncString(value) {
  let first = 2166136261;
  let second = 2246822507;

  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 16777619);
    second ^= code;
    second = Math.imul(second, 3266489917);
  }

  return (
    'v1-' +
    (first >>> 0).toString(16).padStart(8, '0') +
    '-' +
    (second >>> 0).toString(16).padStart(8, '0')
  );
}

function getSyncFingerprint(payload) {
  return hashSyncString(stableSyncSerialize(buildComparableSyncState(payload)));
}

function reconcileSyncedFingerprint(remotePayload) {
  if (!remotePayload || typeof remotePayload !== 'object') return false;

  const localFingerprint = getSyncFingerprint();
  const remoteFingerprint = getSyncFingerprint(remotePayload);

  if (localFingerprint !== remoteFingerprint) return false;

  const meta = getSyncMeta();
  meta.syncedFingerprint = localFingerprint;
  meta.changeCount = 0;
  meta.lastKnownDiffCount = 0;
  setSyncMeta(meta);
  return true;
}

/**
 * Reads sync metadata from localStorage.
 * @returns {object} - { lastModified: number, lastSync: number, changeCount: number }
 */
function getSyncMeta() {
  try {
    const raw = localStorage.getItem(SYNC_META_KEY);
    if (!raw) return { lastModified: 0, lastSync: 0, changeCount: 0, revision: 0 };
    const parsed = JSON.parse(raw);
    return {
      lastModified: parsed.lastModified || 0,
      lastSync: parsed.lastSync || 0,
      changeCount: typeof parsed.changeCount === 'number' ? parsed.changeCount : 0,
      syncedFingerprint:
        typeof parsed.syncedFingerprint === 'string' ? parsed.syncedFingerprint : '',
      lastKnownDiffCount:
        typeof parsed.lastKnownDiffCount === 'number' ? parsed.lastKnownDiffCount : null,
      revision: typeof parsed.revision === 'number' ? parsed.revision : 0,
    };
  } catch (e) {
    console.warn('[sync-tracking] Failed to parse sync meta:', e);
    return { lastModified: 0, lastSync: 0, changeCount: 0, lastKnownDiffCount: null, revision: 0 };
  }
}

/**
 * Writes sync metadata to localStorage.
 * @param {object} meta - { lastModified?, lastSync? }
 */
function setSyncMeta(meta) {
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
  } catch (e) {
    console.warn('[sync-tracking] Failed to save sync meta:', e);
  }
}

/**
 * Updates lastModified timestamp to now.
 * Call this from any save function (saveUrlops, saveNotes, saveOvertimes, saveCustomSchedule).
 */
function updateLastModified() {
  const meta = getSyncMeta();
  meta.lastModified = Date.now();
  meta.changeCount = (meta.changeCount || 0) + 1;
  setSyncMeta(meta);
}

/**
 * Updates lastSync timestamp to now.
 * Call this after successful uploadToDrive() / downloadFromDrive().
 * @param {number} [revision] - the sync revision now known to be in effect
 *   (the value just uploaded, or the value read from a downloaded payload).
 *   Revision only ever advances — a lower/older value is ignored so a
 *   stale caller can never roll it backwards.
 */
function updateLastSync(revision) {
  const meta = getSyncMeta();
  meta.lastSync = Date.now();
  meta.changeCount = 0;
  meta.lastKnownDiffCount = 0;
  meta.syncedFingerprint = getSyncFingerprint();
  if (typeof revision === 'number' && Number.isFinite(revision)) {
    meta.revision = Math.max(revision, meta.revision || 0);
  }
  setSyncMeta(meta);
}

/**
 * Last sync revision known to this device (monotonic counter carried in
 * the Drive payload's `revision` field). Used instead of device clocks to
 * decide who is "ahead", since wall-clock time can drift or differ across
 * timezones between a phone and a laptop.
 * @returns {number}
 */
function getSyncRevision() {
  const meta = getSyncMeta();
  return typeof meta.revision === 'number' ? meta.revision : 0;
}

/**
 * Pure helper: is a downloaded remote payload's revision strictly ahead of
 * what this device already knows about?
 * @param {number} localRevision
 * @param {object} remotePayload - parsed Drive JSON payload
 * @returns {boolean|null} true/false when comparable; null when the remote
 *   payload has no `revision` field (older app version) — callers should
 *   fall back to fingerprint/mtime comparison in that case.
 */
function isRemoteAheadByRevision(localRevision, remotePayload) {
  const remoteRevision =
    remotePayload && typeof remotePayload.revision === 'number'
      ? remotePayload.revision
      : null;
  if (remoteRevision === null) return null;
  const safeLocal = Math.max(0, Number(localRevision) || 0);
  return remoteRevision > safeLocal;
}

/**
 * Checks if there are unsynced changes.
 * @returns {boolean} - true if lastModified > lastSync
 */
function hasUnsyncedChanges() {
  const meta = getSyncMeta();

  if (meta.syncedFingerprint) {
    return getSyncFingerprint() !== meta.syncedFingerprint;
  }

  return meta.lastModified > meta.lastSync;
}

/**
 * Returns human-readable time since last sync in the active UI language.
 * Falls back to Polish when i18n is not available (e.g. isolated Node tests).
 * @returns {string} - e.g. "5 minut temu" / "5 minutes ago" / "5 хв тому"
 */
function timeSinceLastSync() {
  const meta = getSyncMeta();
  const translate = (key, params, fallback) => {
    if (typeof t === 'function') return t(key, params);
    return fallback;
  };

  if (meta.lastSync === 0) return translate('syncNever', undefined, 'nigdy');

  const diffMs = Math.max(0, Date.now() - meta.lastSync);
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return translate('syncJustNow', undefined, 'przed chwilą');

  if (diffMin < 60) {
    const key = diffMin === 1 ? 'syncMinuteAgo' : 'syncMinutesAgo';
    return translate(key, { n: diffMin }, diffMin === 1 ? '1 minutę temu' : diffMin + ' minut temu');
  }

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) {
    const key = diffHr === 1 ? 'syncHourAgo' : 'syncHoursAgo';
    return translate(key, { n: diffHr }, diffHr === 1 ? '1 godz. temu' : diffHr + ' godz. temu');
  }

  const diffDays = Math.floor(diffHr / 24);
  const key = diffDays === 1 ? 'syncDayAgo' : 'syncDaysAgo';
  return translate(key, { n: diffDays }, diffDays === 1 ? '1 dzień temu' : diffDays + ' dni temu');
}

/**
 * Number of saved changes since the last successful sync.
 * @returns {number} - 0 when everything is synced; at least 1 when unsynced
 */
function getUnsyncedChangeCount() {
  if (!hasUnsyncedChanges()) return 0;

  const meta = getSyncMeta();
  // Prefer real diff count (обчислений при останньому відкритті sync modal)
  if (meta.lastKnownDiffCount !== null && meta.lastKnownDiffCount !== undefined) {
    return Math.max(1, Number(meta.lastKnownDiffCount) || 0);
  }
  // Fallback: counter save-операцій (не точний, але кращий за нічого)
  return Math.max(1, Number(meta.changeCount) || 0);
}

/**
 * Absolute date-time of the last successful sync in the active UI language.
 * @returns {string} - e.g. "04.09.2026, 14:23" or '' when never synced
 */
function formatLastSyncDateTime() {
  const meta = getSyncMeta();
  if (!meta.lastSync) return '';
  let locale = 'pl-PL';
  try {
    if (typeof currentLang === 'string' && currentLang === 'uk') locale = 'uk-UA';
    else if (typeof currentLang === 'string' && currentLang === 'en') locale = 'en-US';
  } catch (e) {
    // i18n not loaded yet — fall back to pl-PL
  }
  try {
    return new Date(meta.lastSync).toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e) {
    return new Date(meta.lastSync).toLocaleString();
  }
}

/* === EXPOSE TO GLOBAL SCOPE === */
// Guarded so the module can also load under Node.js for isolated logic tests
// (browsers always pass the check, so runtime exposure is unchanged).
if (typeof window !== 'undefined') {
  window.updateLastModified = updateLastModified;
  window.updateLastSync = updateLastSync;
  window.hasUnsyncedChanges = hasUnsyncedChanges;
  window.timeSinceLastSync = timeSinceLastSync;
  window.getSyncMeta = getSyncMeta;
  window.getUnsyncedChangeCount = getUnsyncedChangeCount;
  window.formatLastSyncDateTime = formatLastSyncDateTime;
  window.getSyncFingerprint = getSyncFingerprint;
  window.reconcileSyncedFingerprint = reconcileSyncedFingerprint;
  window.getSyncRevision = getSyncRevision;
  window.isRemoteAheadByRevision = isRemoteAheadByRevision;
  window.normalizeShiftOverrides = normalizeShiftOverrides;
  window.getPersonalShiftOverrides = getPersonalShiftOverrides;
  window.buildCustomScheduleFromShiftOverrides =
    buildCustomScheduleFromShiftOverrides;
}

// Node.js compatibility for unit tests (browser ignores this block)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeShiftOverrides,
    getPersonalShiftOverrides,
    buildCustomScheduleFromShiftOverrides,
    getSyncFingerprint,
    hashSyncString,
    stableSyncSerialize,
    isRemoteAheadByRevision,
  };
}
