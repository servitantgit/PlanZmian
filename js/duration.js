/* ================================================================
   PLAN ZMIAN — Duration contract (pure helpers)

   CONTRACT (do not break without updating tests + PROJECT_DOCS):

   STORAGE
   - Overtime `hours` is always a non-negative decimal number of hours
     (e.g. 1.5 = 90 minutes, 4 + 41/60 ≈ 4.6833… = 4h 41m).
   - Never store display strings in overtimes[*].hours.

   INPUT (UI)
   - Users enter whole hours + minutes (0–59) in two fields.
   - Convert with partsToDecimalHours(h, m) before setOvertime().
   - Limits: weekend 0.5–24h; przed/po typically ≤ 5h (UI max).

   DISPLAY
   - Prefer formatDurationHoursI18n(hours) → "4год 41хв" / "4h 41m".
   - Compact timeline only: formatHoursCompact(hours) → "4.7h" (1 decimal).
   - Clock ranges: formatTimeRange / formatClockTime (HH:MM, supports fractions).

   COMPUTE
   - categorizeOvertime / calcOvertimeTime take decimal hours.
   - Round intermediate rates to nearest minute when returning h50/h100/h200.

   Load order: this file before js/schedules/_core.js and UI modules.
   ================================================================ */

'use strict';

/** @type {Readonly<{ minWeekendHours: number, maxWeekendHours: number, maxPrzedPoHours: number, maxMinutes: number }>} */
const DURATION_LIMITS = {
  minWeekendHours: 0.5,
  maxWeekendHours: 24,
  maxPrzedPoHours: 5,
  maxMinutes: 59,
};

/**
 * Formats a clock time that may include fractional hours (minutes).
 * @param {number} h - hour value (can be fractional, e.g. 14.5 = 14:30)
 * @returns {string} - "HH:MM"
 */
function formatClockTime(h) {
  const totalMin = Math.round((((h % 24) + 24) % 24) * 60);
  const hh = Math.floor(totalMin / 60) % 24;
  const mm = totalMin % 60;
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

/**
 * Formats time range (for overtime display). Supports fractional hours.
 * @param {number} from - start hour (0-24, may be fractional)
 * @param {number} to - end hour (0-30, where 24+ = next day, may be fractional)
 * @returns {string}
 */
function formatTimeRange(from, to) {
  return `${formatClockTime(from)}–${formatClockTime(to)}`;
}

/**
 * Formats a duration in decimal hours as "Xh Ym" / localized hours+minutes.
 * Storage stays decimal (e.g. 4.5); display is human-readable.
 * Rounds to nearest minute. Omits zero minutes when whole hours.
 * @param {number} hours - duration in decimal hours (e.g. 4.8 → 4h 48m)
 * @param {object} [opts]
 * @param {string} [opts.hoursUnit='h'] - unit for hours part
 * @param {string} [opts.minutesUnit='m'] - unit for minutes part
 * @returns {string}
 */
function formatDurationHours(hours, opts) {
  if (hours == null || !isFinite(hours) || hours < 0) return '0h';
  const totalMin = Math.round(Number(hours) * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const hoursUnit = (opts && opts.hoursUnit) || 'h';
  const minutesUnit = (opts && opts.minutesUnit) || 'm';
  if (m === 0) return `${h}${hoursUnit}`;
  if (h === 0) return `${m}${minutesUnit}`;
  return `${h}${hoursUnit} ${m}${minutesUnit}`;
}

/**
 * Localized duration formatter — uses i18n keys when available.
 * Keys: durationHoursUnit, durationMinutesUnit (fallback: h / m).
 * @param {number} hours
 * @returns {string}
 */
function formatDurationHoursI18n(hours) {
  const hu = typeof t === 'function' ? t('durationHoursUnit') || 'h' : 'h';
  const mu = typeof t === 'function' ? t('durationMinutesUnit') || 'm' : 'm';
  return formatDurationHours(hours, { hoursUnit: hu, minutesUnit: mu });
}

/**
 * Compact display for tight UI (timeline nodes): one decimal place + "h".
 * 4h 41m → "4.7h"; whole hours → "4h" (no trailing .0).
 * @param {number} hours
 * @returns {string}
 */
function formatHoursCompact(hours) {
  const num = Number(hours);
  if (!isFinite(num) || num <= 0) return '0h';
  const r = Math.round(num * 10) / 10;
  return (Number.isInteger(r) ? String(r) : r.toFixed(1)) + 'h';
}

/**
 * Split decimal hours into whole hours + minutes (0–59).
 * @param {number} hours
 * @returns {{ hours: number, minutes: number }}
 */
function decimalHoursToParts(hours) {
  if (hours == null || !isFinite(hours) || hours < 0) return { hours: 0, minutes: 0 };
  const totalMin = Math.round(Number(hours) * 60);
  return { hours: Math.floor(totalMin / 60), minutes: totalMin % 60 };
}

/**
 * Combine hours + minutes into decimal hours for storage.
 * Minutes are clamped to 0–59.
 * @param {number|string} h
 * @param {number|string} m
 * @returns {number}
 */
function partsToDecimalHours(h, m) {
  const hh = Math.max(0, parseInt(h, 10) || 0);
  let mm = Math.max(0, parseInt(m, 10) || 0);
  if (mm > DURATION_LIMITS.maxMinutes) mm = DURATION_LIMITS.maxMinutes;
  return hh + mm / 60;
}

/**
 * Whether a decimal duration is within weekend OT limits (inclusive).
 * @param {number} hours
 * @returns {boolean}
 */
function isValidWeekendDuration(hours) {
  const n = Number(hours);
  return isFinite(n) && n >= DURATION_LIMITS.minWeekendHours && n <= DURATION_LIMITS.maxWeekendHours;
}

/**
 * Whether a decimal duration is within przed/po OT limits (positive, ≤ max).
 * @param {number} hours
 * @returns {boolean}
 */
function isValidPrzedPoDuration(hours) {
  const n = Number(hours);
  return isFinite(n) && n > 0 && n <= DURATION_LIMITS.maxPrzedPoHours;
}

// Node.js exports (for tests)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DURATION_LIMITS,
    formatClockTime,
    formatTimeRange,
    formatDurationHours,
    formatDurationHoursI18n,
    formatHoursCompact,
    decimalHoursToParts,
    partsToDecimalHours,
    isValidWeekendDuration,
    isValidPrzedPoDuration,
  };
}
