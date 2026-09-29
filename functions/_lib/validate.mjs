/* ================================================================
   PLAN ZMIAN — server-side schedule validation (pure, no deps)

   Used by Pages Functions and node:test.
   SPEC: docs/ADMIN_BACKEND_SPEC.md 6.3
   ================================================================ */

const BRIGADES = ['A', 'B', 'C', 'D'];
const ALLOWED_SHIFTS = new Set(['', 'R', 'P', 'N']);
const YEAR_MIN = 2000;
const YEAR_MAX = 2100;
const HOURS_MIN = 0;
const HOURS_MAX = 744; // 31 * 24

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * @param {unknown} year
 * @param {unknown} data
 * @param {unknown} hours
 * @returns {{ ok: true } | { ok: false, details: string[] }}
 */
export function validateScheduleYear(year, data, hours) {
  const details = [];

  const y = Number(year);
  if (!Number.isInteger(y) || y < YEAR_MIN || y > YEAR_MAX) {
    details.push(`year must be integer ${YEAR_MIN}..${YEAR_MAX}`);
    return { ok: false, details };
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    details.push('data must be a plain object');
    return { ok: false, details: details.slice(0, 10) };
  }

  if (!hours || typeof hours !== 'object' || Array.isArray(hours)) {
    details.push('hours must be a plain object');
    return { ok: false, details: details.slice(0, 10) };
  }

  for (let m = 1; m <= 12; m++) {
    const mk = String(m);
    const monthData = data[mk] !== undefined ? data[mk] : data[m];
    if (!monthData || typeof monthData !== 'object' || Array.isArray(monthData)) {
      details.push(`data.${mk} missing or not an object`);
      if (details.length >= 10) break;
      continue;
    }

    const expectedDays = daysInMonth(y, m);
    for (const b of BRIGADES) {
      const arr = monthData[b];
      if (!Array.isArray(arr)) {
        details.push(`data.${mk}.${b} must be an array`);
        if (details.length >= 10) break;
        continue;
      }
      if (arr.length !== expectedDays) {
        details.push(`data.${mk}.${b} length ${arr.length} != ${expectedDays}`);
        if (details.length >= 10) break;
        continue;
      }
      for (let d = 0; d < arr.length; d++) {
        if (!ALLOWED_SHIFTS.has(arr[d])) {
          details.push(`data.${mk}.${b}[${d}] invalid shift ${JSON.stringify(arr[d])}`);
          if (details.length >= 10) break;
        }
      }
      if (details.length >= 10) break;
    }
    if (details.length >= 10) break;

    const monthHours = hours[mk] !== undefined ? hours[mk] : hours[m];
    if (!monthHours || typeof monthHours !== 'object' || Array.isArray(monthHours)) {
      details.push(`hours.${mk} missing or not an object`);
      if (details.length >= 10) break;
      continue;
    }
    for (const b of BRIGADES) {
      const h = monthHours[b];
      if (!Number.isInteger(h) || h < HOURS_MIN || h > HOURS_MAX) {
        details.push(`hours.${mk}.${b} must be integer ${HOURS_MIN}..${HOURS_MAX}`);
        if (details.length >= 10) break;
      }
    }
    if (details.length >= 10) break;
  }

  if (details.length) return { ok: false, details: details.slice(0, 10) };
  return { ok: true };
}

/**
 * Normalize data/hours keys to string months "1".."12" for storage.
 * @param {object} data
 * @param {object} hours
 */
export function normalizeYearPayload(data, hours) {
  const outData = {};
  const outHours = {};
  for (let m = 1; m <= 12; m++) {
    const mk = String(m);
    const monthData = data[mk] !== undefined ? data[mk] : data[m];
    const monthHours = hours[mk] !== undefined ? hours[mk] : hours[m];
    outData[mk] = {};
    outHours[mk] = {};
    for (const b of BRIGADES) {
      outData[mk][b] = Array.isArray(monthData?.[b]) ? monthData[b].slice() : [];
      outHours[mk][b] = Number(monthHours?.[b]) || 0;
    }
  }
  return { data: outData, hours: outHours };
}

export { BRIGADES, ALLOWED_SHIFTS, daysInMonth };
