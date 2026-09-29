/* ================================================================
   PLAN ZMIAN — Module 2: UTILITY + HOLIDAYS + PERSISTENCE + SCHEDULE
   ================================================================ */

/* === PERSISTENCJA === */
function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY)) || {};
    return sanitizePrefs(raw);
  } catch (e) {
    console.warn('[core]', 'Failed to parse prefs, using defaults', e);
    return sanitizePrefs({});
  }
}

/**
 * Validates prefs structure and replaces invalid values with safe defaults.
 * Internal safety net — protects against corrupted localStorage, legacy formats,
 * and manual editing. Non-destructive: unknown keys are preserved.
 *
 * @param {object} raw - prefs object (possibly invalid)
 * @returns {object} - sanitized prefs
 */
function sanitizePrefs(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    console.warn('[core]', 'prefs is not an object, resetting to defaults');
    raw = {};
  }

  const p = Object.assign({}, raw);
  let fixedCount = 0;

  function fix(key, condition, defaultValue, reason) {
    if (!condition) {
      if (p[key] !== undefined) {
        console.warn('[core]', 'Invalid prefs.' + key + ':', p[key], '->', defaultValue, '(' + reason + ')');
        fixedCount++;
      }
      p[key] = defaultValue;
    }
  }

  // === Navigation ===
  fix('year',
    typeof p.year === 'number' && p.year >= MIN_YEAR && p.year <= MAX_YEAR,
    new Date().getFullYear(),
    'out of range');

  fix('shift',
    typeof p.shift === 'string' && ['A', 'B', 'C', 'D'].includes(p.shift),
    'A',
    'invalid brigade');

  fix('view',
    typeof p.view === 'string' && ['dashboard', 'month', 'table'].includes(p.view),
    'dashboard',
    'unknown view');

  fix('yearMode',
    typeof p.yearMode === 'boolean',
    false,
    'not boolean');

  // === UI preferences ===
  fix('theme',
    typeof p.theme === 'string' && ['system', 'light', 'dark'].includes(p.theme),
    'light',
    'unknown theme');

  fix('lang',
    typeof p.lang === 'string' && ['pl', 'en', 'uk'].includes(p.lang),
    'pl',
    'unsupported lang');

  fix('cellSkin',
    typeof p.cellSkin === 'string' && ['full', 'strip', 'quiet'].includes(p.cellSkin),
    'full',
    'unknown cellSkin');

  fix('uiSkin',
    typeof p.uiSkin === 'string' && ['industrial', 'paper', 'neon'].includes(p.uiSkin),
    'industrial',
    'unknown uiSkin');

  fix('tableDensity',
    typeof p.tableDensity === 'string' && ['compact', 'comfortable'].includes(p.tableDensity),
    'compact',
    'unknown tableDensity');

  fix('uiMode',
    typeof p.uiMode === 'string' && ['simple', 'advanced'].includes(p.uiMode),
    p.uiMode === undefined ? undefined : 'simple',
    'unknown uiMode');

  fix('startView',
    typeof p.startView === 'string' && ['dashboard', 'month', 'table'].includes(p.startView),
    'dashboard',
    'unknown startView');

  fix('restoreLastView',
    typeof p.restoreLastView === 'boolean',
    true,
    'not boolean');

  // === Features ===
  fix('notifications',
    typeof p.notifications === 'boolean',
    false,
    'not boolean');

  fix('notificationsLead',
    typeof p.notificationsLead === 'number' && p.notificationsLead >= 1 && p.notificationsLead <= 3,
    1,
    'out of range');

  fix('privacyMode',
    typeof p.privacyMode === 'boolean',
    false,
    'not boolean');

  // Night shift date display on Dashboard: controls ONLY the date shown for
  // an ongoing previous-day N shift after midnight. It never changes which
  // shift is treated as active — only the date shown on the Dashboard card.
  fix('nightShiftDisplayPreviousDay',
    typeof p.nightShiftDisplayPreviousDay === 'boolean',
    true,
    'not boolean');

  // Optional Google Drive backup/sync. Off by default so the app never
  // prompts for Google login unless the user explicitly enables it.
  // Exception: users who already have a Drive token/session keep it enabled
  // so an update does not silently disconnect them.
  let driveDefault = false;
  try {
    if (
      localStorage.getItem('grafik_drive_token') ||
      localStorage.getItem('grafik_drive_user_email') ||
      localStorage.getItem('grafik_drive_had_session') === '1'
    ) {
      driveDefault = true;
    }
  } catch (_) {}
  fix('driveEnabled',
    typeof p.driveEnabled === 'boolean',
    driveDefault,
    'not boolean');

  // Automatic Drive sync: controls background Drive checks and token refresh,
  // NOT manual Upload/Download which always remain available. Default off.
  fix(
    'driveAutoSync',
    typeof p.driveAutoSync === 'boolean',
    false,
    'not boolean'
  );

  // === Onboarding flags ===
  fix('welcomed',
    typeof p.welcomed === 'boolean',
    false,
    'not boolean');

  fix('uiModeToastShown',
    typeof p.uiModeToastShown === 'boolean',
    false,
    'not boolean');

  fix('personalDataMigratedV5',
    typeof p.personalDataMigratedV5 === 'boolean',
    false,
    'not boolean');

  fix('notesUnifiedMigratedV1',
    typeof p.notesUnifiedMigratedV1 === 'boolean',
    false,
    'not boolean');

  // === Accessibility ===
  fix('reduceMotion', typeof p.reduceMotion === 'boolean', false, 'not boolean');
  fix('largeText', typeof p.largeText === 'boolean', false, 'not boolean');
  fix('compactCells', typeof p.compactCells === 'boolean', false, 'not boolean');

  // === Vacation limits (object per brigade) ===
  if (!p.urlopLimits || typeof p.urlopLimits !== 'object' || Array.isArray(p.urlopLimits)) {
    if (p.urlopLimits !== undefined) {
      console.warn('[core]', 'Invalid prefs.urlopLimits, resetting');
      fixedCount++;
    }
    p.urlopLimits = {};
  }
  ['A', 'B', 'C', 'D'].forEach(function (brig) {
    const val = p.urlopLimits[brig];
    if (typeof val !== 'number' || val < 0 || !isFinite(val)) {
      if (val !== undefined) {
        console.warn('[core]', 'Invalid urlopLimits.' + brig + ':', val, '-> ' + URLOP_LIMIT);
        fixedCount++;
      }
      p.urlopLimits[brig] = URLOP_LIMIT;
    } else {
      p.urlopLimits[brig] = Math.floor(val);
    }
  });

  // === Vacation pre-used ===
  if (!p.vacationPreUsed || typeof p.vacationPreUsed !== 'object' || Array.isArray(p.vacationPreUsed)) {
    if (p.vacationPreUsed !== undefined) {
      console.warn('[core]', 'Invalid prefs.vacationPreUsed, resetting');
      fixedCount++;
    }
    p.vacationPreUsed = {};
  }
  ['A', 'B', 'C', 'D'].forEach(function (brig) {
    const val = p.vacationPreUsed[brig];
    if (typeof val !== 'number' || val < 0 || !isFinite(val)) {
      p.vacationPreUsed[brig] = 0;
    } else {
      p.vacationPreUsed[brig] = Math.floor(val);
    }
  });

  // === Cell colors (object with hex strings) ===
  if (!p.cellColors || typeof p.cellColors !== 'object' || Array.isArray(p.cellColors)) {
    if (p.cellColors !== undefined) {
      console.warn('[core]', 'Invalid prefs.cellColors, resetting');
      fixedCount++;
    }
    p.cellColors = {};
  }
  ['R', 'P', 'N', 'U'].forEach(function (k) {
    const hex = p.cellColors[k];
    if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
      if (hex !== undefined) {
        console.warn('[core]', 'Invalid cellColors.' + k + ':', hex);
        fixedCount++;
      }
      delete p.cellColors[k];
    }
  });

  if (fixedCount > 0) {
    console.warn('[core]', 'sanitizePrefs fixed', fixedCount, 'invalid field(s)');
  }

  return p;
}

window.sanitizePrefs = sanitizePrefs;
/**
 * Persist UI/prefs to localStorage.
 * @param {object} p - prefs object
 * @param {boolean} [markSync=false] - if true, mark data as unsynced (for personal fields like urlopLimits)
 */
function savePrefs(p, markSync) {
  localStorage.setItem(LS_KEY, JSON.stringify(p));
  if (markSync && typeof updateLastModified === 'function') updateLastModified();
}
function loadNotes() {
  try {
    return JSON.parse(localStorage.getItem(NOTES_KEY)) || {};
  } catch (e) {
    return {};
  }
}
function saveNotes(n) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(n));
  if (typeof updateLastModified === 'function') updateLastModified();
}
function loadUrlops() {
  try {
    return JSON.parse(localStorage.getItem(URLOPS_KEY)) || {};
  } catch (e) {
    return {};
  }
}
function saveUrlops(u) {
  localStorage.setItem(URLOPS_KEY, JSON.stringify(u));
  if (typeof updateLastModified === 'function') updateLastModified();
}
function loadCustomSchedule() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_SCHEDULE_KEY)) || {};
  } catch (e) {
    return {};
  }
}
function saveCustomSchedule(s) {
  localStorage.setItem(CUSTOM_SCHEDULE_KEY, JSON.stringify(s));
  if (typeof updateLastModified === 'function') updateLastModified();
}
function loadOvertimes() {
  try {
    return JSON.parse(localStorage.getItem(OVERTIMES_KEY)) || {};
  } catch (e) {
    return {};
  }
}
function saveOvertimes(o) {
   localStorage.setItem(OVERTIMES_KEY, JSON.stringify(o));
   if (typeof updateLastModified === 'function') updateLastModified();
 }
 
 function loadFactoryDrafts() {
   try {
     return JSON.parse(localStorage.getItem(FACTORY_DRAFTS_KEY)) || {};
   } catch (e) {
     return {};
   }
 }
 
 function saveFactoryDrafts(drafts) {
   localStorage.setItem(FACTORY_DRAFTS_KEY, JSON.stringify(drafts));
   if (typeof updateLastModified === 'function') updateLastModified();
 }
 
 /* === Persistent state === */
 const prefs = loadPrefs();
 const notes = loadNotes();
 const urlops = loadUrlops();
 let customSchedule = loadCustomSchedule();
 let overtimes = loadOvertimes();
 let factoryDrafts = loadFactoryDrafts();

if (!prefs.urlopLimits) prefs.urlopLimits = {};
 ['A', 'B', 'C', 'D'].forEach((brigade) => {
   if (prefs.urlopLimits[brigade] === undefined) prefs.urlopLimits[brigade] = URLOP_LIMIT;
 });

/* === UI MODE default detection (Simple/Advanced) ===
   New users (no personal data yet) default to Simple mode.
   Migrating users (existing customSchedule/urlops/overtimes/notes) default
   to Advanced mode and see a one-time explanatory toast. */
if (!prefs.uiMode) {
  const hasData =
    Object.keys(customSchedule).length > 0 ||
    Object.values(urlops).some((arr) => Array.isArray(arr) && arr.length > 0) ||
    Object.keys(overtimes).length > 0 ||
    Object.keys(notes).some((k) => noteEntryHasContent(notes[k]));
  prefs.uiMode = hasData ? 'advanced' : 'simple';
  savePrefs(prefs);

  if (hasData && !prefs.uiModeToastShown) {
    setTimeout(() => {
      if (typeof showToast === 'function' && typeof t === 'function') {
        showToast('info', t('uiModeAdvancedAutoDetected'), 6000);
      }
    }, 1000);
    prefs.uiModeToastShown = true;
    savePrefs(prefs);
  }
}

 /* === Factory drafts === */
  function getFactoryShift(year, month, day, brigade) {
    if (factoryDrafts[year] && factoryDrafts[year][month] && factoryDrafts[year][month][brigade]) {
      const arr = factoryDrafts[year][month][brigade];
      if (day >= 1 && day <= arr.length) {
        return arr[day - 1];
      }
    }
    return null;
  }
  
  function getFactoryDraftShiftAt(year, month, day, brigade) {
    const draft = getFactoryShift(year, month, day, brigade);
    if (draft !== null) {
      return draft;
    }
   if (factorySchedule[year] && factorySchedule[year][month] && factorySchedule[year][month][brigade]) {
     const arr = factorySchedule[year][month][brigade];
     if (day >= 1 && day <= arr.length) {
       return arr[day - 1];
     }
   }
   return null;
 }
 
  function ensureFactoryDraftYear(year) {
    if (!factoryDrafts[year]) {
      factoryDrafts[year] = {};
      for (let m = 1; m <= 12; m++) {
        factoryDrafts[year][m] = { A: [], B: [], C: [], D: [] };
      }
    }
    for (let m = 1; m <= 12; m++) {
      if (!factoryDrafts[year][m]) {
        factoryDrafts[year][m] = { A: [], B: [], C: [], D: [] };
      }
      const dim = new Date(year, m, 0).getDate();
      ['A', 'B', 'C', 'D'].forEach((b) => {
        if (!Array.isArray(factoryDrafts[year][m][b])) {
          factoryDrafts[year][m][b] = new Array(dim).fill(null);
        }
        while (factoryDrafts[year][m][b].length < dim) {
          factoryDrafts[year][m][b].push(null);
        }
        if (factoryDrafts[year][m][b].length > dim) {
          factoryDrafts[year][m][b].length = dim;
        }
      });
    }
  }
 
 function setFactoryDraftShift(year, month, day, brigade, value) {
   ensureFactoryDraftYear(year);
   factoryDrafts[year][month][brigade][day - 1] = value;
   saveFactoryDrafts(factoryDrafts);
 }
 
 function hasFactoryDraftData(year) {
   return !!factoryDrafts[year];
 }
 
 function clearFactoryDraftYear(year) {
   if (factoryDrafts[year]) {
     delete factoryDrafts[year];
     saveFactoryDrafts(factoryDrafts);
   }
 }
 
 function resetFactoryDrafts() {
   factoryDrafts = {};
   if (typeof window !== 'undefined') window.factoryDrafts = factoryDrafts;
   saveFactoryDrafts(factoryDrafts);
 }
 
 function copyPersonalYearToFactoryDraft(year) {
   if (customSchedule[year]) {
     factoryDrafts[year] = JSON.parse(JSON.stringify(customSchedule[year]));
     saveFactoryDrafts(factoryDrafts);
   }
 }
 
  function countFactoryDraftChanges() {
    let count = 0;
    const walk = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        obj.forEach((v) => {
          if (v !== null && v !== undefined && v !== '') count++;
        });
        return;
      }
      Object.keys(obj).forEach((k) => walk(obj[k]));
    };
    walk(factoryDrafts);
    return count;
  }
 
 /* === Limity urlopu === */

/* === Accessibility preferences === */
if (typeof prefs.reduceMotion === 'undefined') prefs.reduceMotion = false;
if (typeof prefs.largeText === 'undefined') prefs.largeText = false;
if (typeof prefs.compactCells === 'undefined') prefs.compactCells = false;

function applyAccessibilityPreferences() {
  const systemReduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reduceMotion = prefs.reduceMotion === true || systemReduceMotion;
  const largeText = prefs.largeText === true;
  const compactCells = prefs.compactCells === true;

  document.body.classList.toggle('reduce-motion', reduceMotion);
  document.body.classList.toggle('large-text', largeText);
  document.body.classList.toggle('compact-cells', compactCells);
}
window.applyAccessibilityPreferences = applyAccessibilityPreferences;

/* === Limity urlopu === */
function getVacationLimit(brigade) {
  const raw = prefs.urlopLimits && prefs.urlopLimits[brigade];
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return URLOP_LIMIT;
  return Math.floor(value);
}

function setVacationLimit(brigade, value) {
  const limit = Math.max(0, Math.floor(Number(value) || 0));
  if (!prefs.urlopLimits) prefs.urlopLimits = {};
  prefs.urlopLimits[brigade] = limit;
  // urlopLimits are personal data synced to Drive — mark as unsynced
  savePrefs(prefs, true);
  return limit;
}

/**
 * Get pre-installation vacation days (days used before app install or outside calendar).
 * @param {string} brigade
 * @returns {number} >= 0
 */
function getVacationPreUsed(brigade) {
  if (!prefs.vacationPreUsed || typeof prefs.vacationPreUsed !== 'object') return 0;
  const raw = prefs.vacationPreUsed[brigade];
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

/**
 * Set pre-installation vacation days for a brigade.
 * Marks personal data as unsynced (persists to Drive).
 * @param {string} brigade
 * @param {number} value
 * @returns {number} normalized value that was saved
 */
function setVacationPreUsed(brigade, value) {
  const days = Math.max(0, Math.floor(Number(value) || 0));
  if (!prefs.vacationPreUsed) prefs.vacationPreUsed = {};
  prefs.vacationPreUsed[brigade] = days;
  savePrefs(prefs, true);
  return days;
}

/**
 * Total used vacation days = calendar entries + pre-installation days.
 * @param {number} year
 * @param {string} brigade
 * @returns {number}
 */
function getTotalUsedVacation(year, brigade) {
  const fromCalendar = typeof countWorkingUrlops === 'function'
    ? countWorkingUrlops(year, brigade)
    : 0;
  const preUsed = getVacationPreUsed(brigade);
  return fromCalendar + preUsed;
}

/* === Schedule === */
function makeEmptyMonth(year, month) {
  const dim = new Date(year, month, 0).getDate();
  return {
    A: new Array(dim).fill(''),
    B: new Array(dim).fill(''),
    C: new Array(dim).fill(''),
    D: new Array(dim).fill(''),
  };
}
function makeEmptyYear(year) {
  const y = {};
  for (let m = 1; m <= 12; m++) y[m] = makeEmptyMonth(year, m);
  return y;
}
function getYearSchedule(year) {
  if (customSchedule[year]) return customSchedule[year];
  if (factorySchedule[year]) return factorySchedule[year];
  return makeEmptyYear(year);
}
function hasFactoryData(year) {
  return !!factorySchedule[year];
}
function hasCustomData(year) {
  return !!customSchedule[year];
}
function ensureCustomYear(year) {
  if (!customSchedule[year]) {
    if (factorySchedule[year])
      customSchedule[year] = JSON.parse(JSON.stringify(factorySchedule[year]));
    else customSchedule[year] = makeEmptyYear(year);
  }
  for (let m = 1; m <= 12; m++) {
    if (!customSchedule[year][m]) customSchedule[year][m] = makeEmptyMonth(year, m);
    const dim = new Date(year, m, 0).getDate();
    ['A', 'B', 'C', 'D'].forEach((b) => {
      if (!Array.isArray(customSchedule[year][m][b]))
        customSchedule[year][m][b] = new Array(dim).fill('');
      while (customSchedule[year][m][b].length < dim) customSchedule[year][m][b].push('');
      if (customSchedule[year][m][b].length > dim) customSchedule[year][m][b].length = dim;
    });
  }
}
function setShift(year, month, day, brigade, value) {
  ensureCustomYear(year);
  customSchedule[year][month][brigade][day - 1] = value;
  saveCustomSchedule(customSchedule);
}

/* === Utility === */
function getElementByIdSafe(id) {
  const el = document.getElementById(id);
  if (!el) console.warn(`Missing element: ${id}`);
  return el;
}
function getShiftAt(year, month, day, brigade) {
  if (month < 1 || month > 12) return null;
  const ySched = getYearSchedule(year);
  const arr = ySched[month] && ySched[month][brigade];
  if (!arr || day < 1 || day > arr.length) return null;
  return arr[day - 1];
}
function findBrigadesOnShiftType(year, month, day, shiftType) {
  const res = [];
  ['A', 'B', 'C', 'D'].forEach((b) => {
    const s = getShiftAt(year, month, day, b);
    if (shiftType === '' ? isWolne(s) : s === shiftType) res.push(b);
  });
  return res;
}

/* === Urlopy === */
function urlopKey(year, m, d) {
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function isUrlop(year, m, d, brigade) {
  return urlops[brigade] && urlops[brigade].includes(urlopKey(year, m, d));
}
function toggleUrlop(year, m, d, brigade) {
  const k = urlopKey(year, m, d);
  if (!urlops[brigade]) urlops[brigade] = [];
  const idx = urlops[brigade].indexOf(k);
  if (idx >= 0) urlops[brigade].splice(idx, 1);
  else urlops[brigade].push(k);
  saveUrlops(urlops);
}
function countWorkingUrlops(year, brigade) {
  const list = urlops[brigade] || [];
  let cnt = 0;
  list.forEach((k) => {
    const parts = k.split('-').map(Number);
    if (parts.length !== 3 || parts[0] !== year) return;
    const s = getShiftAt(parts[0], parts[1], parts[2], brigade);
    if (s === 'R' || s === 'P' || s === 'N') cnt++;
  });
  return cnt;
}

/* === Pomocnice dla grafiku === */
function getRelief(year, month, day, brigade, shiftType) {
  let nextBrig = null,
    nextType = null,
    nextMonth = month,
    nextDay = day,
    nextYear = year;
  let prevBrig = null,
    prevType = null,
    prevMonth = month,
    prevDay = day,
    prevYear = year;
  if (shiftType === 'R') {
    nextType = 'P';
    nextBrig =
      findBrigadesOnShiftType(year, month, day, 'P').filter((b) => b !== brigade)[0] || null;
    prevType = 'N';
    prevDay = day - 1;
    if (prevDay < 1) {
      prevMonth = month - 1;
      if (prevMonth < 1) {
        prevMonth = 12;
        prevYear = year - 1;
      }
      prevDay = daysInMonthCal(prevYear, prevMonth);
    }
    prevBrig =
      findBrigadesOnShiftType(prevYear, prevMonth, prevDay, 'N').filter((b) => b !== brigade)[0] ||
      null;
  } else if (shiftType === 'P') {
    nextType = 'N';
    nextBrig =
      findBrigadesOnShiftType(year, month, day, 'N').filter((b) => b !== brigade)[0] || null;
    prevType = 'R';
    prevBrig =
      findBrigadesOnShiftType(year, month, day, 'R').filter((b) => b !== brigade)[0] || null;
  } else if (shiftType === 'N') {
    prevType = 'P';
    prevBrig =
      findBrigadesOnShiftType(year, month, day, 'P').filter((b) => b !== brigade)[0] || null;
    nextType = 'R';
    nextDay = day + 1;
    if (nextDay > daysInMonthCal(year, month)) {
      nextDay = 1;
      nextMonth = month + 1;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear = year + 1;
      }
    }
    nextBrig =
      findBrigadesOnShiftType(nextYear, nextMonth, nextDay, 'R').filter((b) => b !== brigade)[0] ||
      null;
  }
  return {
    nextBrig,
    nextType,
    nextMonth,
    nextDay,
    nextYear,
    prevBrig,
    prevType,
    prevMonth,
    prevDay,
    prevYear,
  };
}
function getCycleRange(year, month, day, brigade) {
  const shift = getShiftAt(year, month, day, brigade);
  if (isWolne(shift)) return null;
  const dim = daysInMonthCal(year, month);
  let start = day,
    end = day;
  while (start > 1 && getShiftAt(year, month, start - 1, brigade) === shift) start--;
  while (end < dim && getShiftAt(year, month, end + 1, brigade) === shift) end++;
  return { start, end, length: end - start + 1, type: shift };
}

/** Cycle range based purely on factory schedule (used in privacy / logged-out mode). */
function getFactoryCycleRange(year, month, day, brigade) {
  const arr =
    factorySchedule[year] && factorySchedule[year][month] && factorySchedule[year][month][brigade]
      ? factorySchedule[year][month][brigade]
      : null;
  if (!arr || day < 1 || day > arr.length) return null;
  const shift = arr[day - 1];
  if (isWolne(shift)) return null;
  const dim = arr.length;
  let start = day,
    end = day;
  while (start > 1 && arr[start - 2] === shift) start--;
  while (end < dim && arr[end] === shift) end++;
  return { start, end, length: end - start + 1, type: shift };
}
function daysToNextWolne(year, month, day, brigade) {
  let y = year,
    m = month,
    d = day,
    count = 0;
  while (count < 60) {
    d++;
    count++;
    if (d > daysInMonthCal(y, m)) {
      d = 1;
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
    if (isWolne(getShiftAt(y, m, d, brigade)) || isUrlop(y, m, d, brigade)) {
      return { days: count, year: y, month: m, day: d };
    }
  }
  return null;
}

/**
 * Work remaining until next free/vacation day.
 * Counts shifts of each type between current day (exclusive) and day off.
 * @returns {{ days, dayShifts, nightShifts, year, month, day } | null}
 *   dayShifts = R+P count, nightShifts = N count
 */
/**
 * Shift for cycle/until-free — same source as calendar cells:
 * personal data on → getShiftAt (factory + custom);
 * personal data off → pure factorySchedule.
 */
function readShiftForCycle(year, month, day, brigade) {
  const hidePrivate =
    typeof shouldShowPersonalData === 'function' ? !shouldShowPersonalData() : false;
  if (hidePrivate) {
    const arr =
      factorySchedule[year] &&
      factorySchedule[year][month] &&
      factorySchedule[year][month][brigade];
    if (!arr || day < 1 || day > arr.length) return '';
    return arr[day - 1] || '';
  }
  if (typeof getShiftAtWithPending === 'function') {
    return getShiftAtWithPending(year, month, day, brigade) || '';
  }
  return getShiftAt(year, month, day, brigade) || '';
}

function getCyclePath(year, month, day, brigade, maxSteps) {
  maxSteps = maxSteps || 8;
  const steps = [];
  let y = +year,
    m = +month,
    d = +day;
  const urlopOn = (yy, mm, dd) => {
    if (typeof shouldShowPersonalData === 'function' && !shouldShowPersonalData()) return false;
    return isUrlop(yy, mm, dd, brigade);
  };
  // include current day if working
  const selfShift = readShiftForCycle(y, m, d, brigade);
  if (!isWolne(selfShift) && !urlopOn(y, m, d)) {
    steps.push({ year: y, month: m, day: d, shift: selfShift, isSelf: true });
  }
  let guard = 0;
  while (guard < 60 && steps.length < maxSteps) {
    guard++;
    d++;
    if (d > daysInMonthCal(y, m)) {
      d = 1;
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
    if (urlopOn(y, m, d)) {
      return { steps, free: { year: y, month: m, day: d } };
    }
    const s = readShiftForCycle(y, m, d, brigade);
    if (isWolne(s)) {
      return { steps, free: { year: y, month: m, day: d } };
    }
    if (s === 'R' || s === 'P' || s === 'N') {
      steps.push({ year: y, month: m, day: d, shift: s, isSelf: false });
    }
  }
  return { steps, free: null };
}


function getUntilDayOff(year, month, day, brigade) {
  let y = +year,
    m = +month,
    d = +day,
    count = 0;
  let dayShifts = 0;
  let nightShifts = 0;
  const urlopOn = (yy, mm, dd) => {
    if (typeof shouldShowPersonalData === 'function' && !shouldShowPersonalData()) return false;
    return isUrlop(yy, mm, dd, brigade);
  };
  while (count < 60) {
    d++;
    count++;
    if (d > daysInMonthCal(y, m)) {
      d = 1;
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
    if (urlopOn(y, m, d) || isWolne(readShiftForCycle(y, m, d, brigade))) {
      return { days: count, dayShifts, nightShifts, year: y, month: m, day: d };
    }
    const s = readShiftForCycle(y, m, d, brigade);
    if (s === 'N') nightShifts++;
    else if (s === 'R' || s === 'P') dayShifts++;
  }
  return null;
}

/**
 * Path of own shifts from selected day (inclusive) until next free/vacation.
 * @returns {{ steps: Array<{year,month,day,shift,isSelf}>, free: {year,month,day}|null }}
 */
/* === Nadgodziny: pomocnicze === */
function otKey(year, month, day, brigade) {
  return `${year}-${month}-${day}-${brigade}`;
}
function getOvertimes(year, month, day, brigade) {
  return overtimes[otKey(year, month, day, brigade)] || { przed: null, po: null, weekend: null };
}
function setOvertime(year, month, day, brigade, position, data) {
  const k = otKey(year, month, day, brigade);
  if (!overtimes[k]) overtimes[k] = { przed: null, po: null, weekend: null };
  overtimes[k][position] = data;
  if (!overtimes[k].przed && !overtimes[k].po && !overtimes[k].weekend) delete overtimes[k];
  saveOvertimes(overtimes);
}
function removeOvertime(year, month, day, brigade, position) {
  setOvertime(year, month, day, brigade, position, null);
  const noteTag =
    position === 'przed' ? 'before' :
    position === 'po' ? 'after' :
    position === 'weekend' ? 'weekend' :
    null;
  if (noteTag) removeDayNoteByTag(year, month, day, brigade, noteTag);
}

/* === Unified day notes ===
   notes[key] is an array of { id, tag, text } entries, keyed the same way
   as overtimes (otKey/noteKeyFor share the same format). tag is null for a
   free-form note, or 'before'/'after' when it is the note attached to an
   overtime record. This replaces three previously separate note stores
   (day note string, overtime.przed.note, overtime.po.note).
   Pure list logic lives in js/personal/notes-tracking.js (loaded before
   this file) so it can be unit-tested without core.js's DOM/localStorage
   dependencies — the functions below are thin localStorage-backed wrappers
   around it. */
function noteKeyFor(year, month, day, brigade) {
  return `${year}-${month}-${day}-${brigade}`;
}

/** Always returns an array (never undefined/string), even for stale data. */
function getDayNotes(year, month, day, brigade) {
  const v = notes[noteKeyFor(year, month, day, brigade)];
  return Array.isArray(v) ? v : [];
}

/** Adds a new free-form or tagged note entry. Returns its id, or null if empty. */
function addDayNote(year, month, day, brigade, text, tag) {
  const k = noteKeyFor(year, month, day, brigade);
  const { list, id } = addNoteEntry(notes[k], text, tag);
  if (!id) return null;
  notes[k] = list;
  saveNotes(notes);
  return id;
}

function removeDayNote(year, month, day, brigade, noteId) {
  const k = noteKeyFor(year, month, day, brigade);
  if (!Array.isArray(notes[k])) return;
  const next = removeNoteEntry(notes[k], noteId);
  if (next.length === 0) delete notes[k];
  else notes[k] = next;
  saveNotes(notes);
}

/** Edits the text of an existing note entry in place (tag is preserved). */
function updateDayNote(year, month, day, brigade, noteId, text) {
  const k = noteKeyFor(year, month, day, brigade);
  if (!Array.isArray(notes[k])) return;
  notes[k] = updateNoteText(notes[k], noteId, text);
  saveNotes(notes);
}

/**
 * Sets (or clears, when text is empty) the single note entry carrying a
 * given tag ('before'/'after'). Used by the overtime modal so re-saving
 * an overtime note updates its entry in place instead of duplicating it.
 */
function upsertDayNoteByTag(year, month, day, brigade, tag, text) {
  const k = noteKeyFor(year, month, day, brigade);
  const next = upsertNoteByTag(notes[k], tag, text);
  if (next.length === 0) delete notes[k];
  else notes[k] = next;
  saveNotes(notes);
}

function removeDayNoteByTag(year, month, day, brigade, tag) {
  upsertDayNoteByTag(year, month, day, brigade, tag, '');
}

function getDayNoteTextByTag(year, month, day, brigade, tag) {
  return getNoteTextByTag(getDayNotes(year, month, day, brigade), tag);
}

/**
 * ONE-SHOT MIGRATION: unify the three previously separate note stores —
 * free-form day note (string), overtime "przed" note, overtime "po" note —
 * into a single notes[key] array of { id, tag, text } entries. Old overtime
 * notes become tag:'before'/'after' entries; the old free-form string
 * becomes a tag:null entry. Runs once (flagged by prefs.notesUnifiedMigratedV1).
 * The actual transform (computeUnifiedNotesMigration) lives in
 * js/personal/notes-tracking.js and is unit-tested there.
 */
function migrateUnifiedNotes() {
  if (prefs.notesUnifiedMigratedV1 === true) return;
  try {
    const result = computeUnifiedNotesMigration(notes, overtimes);
    Object.keys(notes).forEach((k) => delete notes[k]);
    Object.assign(notes, result.notes);
    Object.keys(overtimes).forEach((k) => delete overtimes[k]);
    Object.assign(overtimes, result.overtimes);
    saveNotes(notes);
    saveOvertimes(overtimes);
    console.log('[migration] Unified notes into a single per-day list.');
  } catch (error) {
    console.error('[migration] migrateUnifiedNotes failed:', error);
  }
  prefs.notesUnifiedMigratedV1 = true;
  savePrefs(prefs);
}

window.migrateUnifiedNotes = migrateUnifiedNotes;

function getActualWorkTime(year, month, day, brigade, shift) {
  if (isWolne(shift)) return null;
  const ot = getOvertimes(year, month, day, brigade);
  const [start, end] = shiftHours[shift];
  let realStart = start,
    realEnd = end;
  if (ot.przed) {
    realStart = start - ot.przed.hours;
    if (realStart < 0) realStart += 24;
  }
  if (ot.po) realEnd = end + ot.po.hours;
  // formatClockTime supports fractional hours (minutes)
  const fmt =
    typeof formatClockTime === 'function'
      ? formatClockTime
      : (h) => {
          const totalMin = Math.round((((h % 24) + 24) % 24) * 60);
          const hh = Math.floor(totalMin / 60) % 24;
          const mm = totalMin % 60;
          return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
        };
  return `${fmt(realStart)}-${fmt(realEnd)}`;
}

function getMonthOvertimeSummary(year, month, brigade) {
  const dim = daysInMonthCal(year, month);
  const total = { h50: 0, h100: 0, h200: 0, count: 0 };
  const yHolidays = buildHolidays(year);

  for (let d = 1; d <= dim; d++) {
    const shift = getShiftAt(year, month, d, brigade);
    const ot = getOvertimes(year, month, d, brigade);

    // 1. Standard PRZED/PO overtime
    ['przed', 'po'].forEach((pos) => {
      if (ot[pos]) {
        const cat = categorizeOvertime(year, month, d, shift, pos, ot[pos].hours);
        total.h50 += cat.h50;
        total.h100 += cat.h100;
        total.h200 += cat.h200;
        total.count++;
      }
    });

    // 2. Weekend hours (custom N hours on factory-free day, no full shift)
    const hasWeekendHours =
      ot.weekend && typeof ot.weekend.hours === 'number' && ot.weekend.hours > 0;
    if (hasWeekendHours && !isUrlop(year, month, d, brigade)) {
      const cat = categorizeOvertime(year, month, d, null, 'weekend', ot.weekend.hours);
      total.h50 += cat.h50;
      total.h100 += cat.h100;
      total.h200 += cat.h200;
      total.count++;
    }

    // 3. Added shift on holiday/Sunday (Variant A: only if not in factory schedule)
    // Variant C safeguard: skip auto 8h count if user recorded custom weekend hours
    // (should be impossible via UI mutual exclusion, but protects against corrupted data)
    // Skip if not a working shift or if it's a vacation day
    if (shift === 'R' || shift === 'P' || shift === 'N') {
      if (!isUrlop(year, month, d, brigade)) {
        // Check what was in factory schedule for this day
        const factoryShift =
          factorySchedule[year] &&
          factorySchedule[year][month] &&
          factorySchedule[year][month][brigade]
            ? factorySchedule[year][month][brigade][d - 1]
            : '';

        // If current shift differs from factory (i.e., user ADDED a shift on a free day)
        // AND factory was free (empty/W) → count as additional overtime shift
        const wasFactoryFree = isWolne(factoryShift);
        const isAddedShift = wasFactoryFree && (shift === 'R' || shift === 'P' || shift === 'N');

        if (isAddedShift && !hasWeekendHours) {
          const isHoliday = !!yHolidays[month + '-' + d];
          const dow = new Date(year, month - 1, d).getDay();
          const isSunday = dow === 0;

          if (isHoliday) {
            // Holiday work = +200%
            total.h200 += 8;
            total.count++;
          } else if (isSunday) {
            // Sunday work = +100%
            total.h100 += 8;
            total.count++;
          }
          // Regular Saturday added shift: no extra rate (still counts as regular work)
        }
      }
    }
  }
  return total;
}

function getMonthHours(year, month) {
  if (!customSchedule[year] && factoryMonthHours[year] && factoryMonthHours[year][month])
return factoryMonthHours[year][month];
   const ySched = getYearSchedule(year);
   const h = { A: 0, B: 0, C: 0, D: 0 };
   ['A', 'B', 'C', 'D'].forEach((b) => {
     const arr = ySched[month][b];
     for (let i = 0; i < arr.length; i++) if (!isWolne(arr[i])) h[b] += 8;
   });
   return h;
 }

function countPersonalCustomShifts() {
  if (typeof getPersonalShiftOverrides !== 'function') return 0;
  const overrides = getPersonalShiftOverrides();
  return Object.keys(overrides).length;
}

/**
 * ONE-SHOT MIGRATION: cleanup customSchedule from mirror entries.
 * Historical bug: ensureCustomYear() deep-cloned factorySchedule into customSchedule
 * on first edit, leaving 1000+ mirror entries that identical to factory.
 * This migration removes them, keeping only real overrides.
 * Runs once (flagged by prefs.personalDataMigratedV5).
 */
function cleanupCustomScheduleMirrors() {
  if (prefs.personalDataMigratedV5 === true) return;
  if (typeof getPersonalShiftOverrides !== 'function') return;
  if (!customSchedule || typeof customSchedule !== 'object') {
    prefs.personalDataMigratedV5 = true;
    savePrefs(prefs);
    return;
  }
  try {
    const realOverrides = getPersonalShiftOverrides();
    const cleanCustom = typeof buildCustomScheduleFromShiftOverrides === 'function'
      ? buildCustomScheduleFromShiftOverrides(realOverrides, factorySchedule)
      : {};

    Object.keys(customSchedule).forEach((key) => delete customSchedule[key]);
    Object.assign(customSchedule, cleanCustom);
    saveCustomSchedule(customSchedule);

    console.log('[migration] Cleaned customSchedule mirrors. Real overrides:', Object.keys(realOverrides).length);
  } catch (error) {
    console.error('[migration] cleanupCustomScheduleMirrors failed:', error);
  }

  prefs.personalDataMigratedV5 = true;
  savePrefs(prefs);
}

window.cleanupCustomScheduleMirrors = cleanupCustomScheduleMirrors;

   function countVacations() {
     if (!urlops || typeof urlops !== 'object') return 0;
     let total = 0;
     Object.keys(urlops).forEach((brigade) => {
       const list = urlops[brigade];
       if (Array.isArray(list)) {
         total += list.length;
       }
     });
     return total;
   }

   function countOvertimeRecords() {
     if (!overtimes || typeof overtimes !== 'object') return 0;
     return Object.keys(overtimes).length;
   }

   function countNonEmptyNotes() {
     if (typeof countNoteEntries === 'function') return countNoteEntries(notes);
     return 0;
   }

   function clearLocalPersonalData() {
     // Clear customSchedule
     if (typeof customSchedule !== 'undefined' && customSchedule !== null) {
       Object.keys(customSchedule).forEach((key) => {
         delete customSchedule[key];
       });
       if (typeof saveCustomSchedule === 'function') {
         saveCustomSchedule(customSchedule);
       }
     }

     // Clear urlops
     if (typeof urlops !== 'undefined' && urlops !== null) {
       Object.keys(urlops).forEach((key) => {
         delete urlops[key];
       });
       if (typeof saveUrlops === 'function') {
         saveUrlops(urlops);
       }
     }

     // Clear overtimes
     if (typeof overtimes !== 'undefined' && overtimes !== null) {
       Object.keys(overtimes).forEach((key) => {
         delete overtimes[key];
       });
       if (typeof saveOvertimes === 'function') {
         saveOvertimes(overtimes);
       }
     }

     // Clear notes
     if (typeof notes !== 'undefined' && notes !== null) {
       Object.keys(notes).forEach((key) => {
         delete notes[key];
       });
       if (typeof saveNotes === 'function') {
         saveNotes(notes);
       }
     }

     // Persist empty data (already done in the save calls above)
     // Refresh views
     if (typeof refreshViews === 'function') {
       try {
         refreshViews();
       } catch (e) {
         /* ignore */
       }
     }

// Update sync tracking (the save functions above should have called updateLastModified)
      // Show localized success toast
      if (typeof showToast === 'function' && typeof t === 'function') {
        showToast('success', t('settingsPrivacyClearSuccess'));
      }
    }

    /* === Expose factory draft functions to window === */
    window.loadFactoryDrafts = loadFactoryDrafts;
    window.saveFactoryDrafts = saveFactoryDrafts;
    window.getFactoryShift = getFactoryShift;
    window.getFactoryDraftShiftAt = getFactoryDraftShiftAt;
    window.ensureFactoryDraftYear = ensureFactoryDraftYear;
    window.setFactoryDraftShift = setFactoryDraftShift;
    window.hasFactoryDraftData = hasFactoryDraftData;
    window.clearFactoryDraftYear = clearFactoryDraftYear;
    window.resetFactoryDrafts = resetFactoryDrafts;
    window.copyPersonalYearToFactoryDraft = copyPersonalYearToFactoryDraft;
    window.countFactoryDraftChanges = countFactoryDraftChanges;
    window.clearLocalPersonalData = clearLocalPersonalData;

/** Optional Drive backup gate (prefs.driveEnabled). Default off unless legacy session. */
function isDriveFeatureEnabled() {
  try {
    if (typeof prefs !== 'undefined' && prefs && typeof prefs.driveEnabled === 'boolean') {
      return prefs.driveEnabled === true;
    }
  } catch (_) {}
  return false;
}
window.isDriveFeatureEnabled = isDriveFeatureEnabled;


    window.factoryDrafts = factoryDrafts;
