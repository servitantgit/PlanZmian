/* ================================================================
   PLAN ZMIAN — Logic module (Overtime)
   Ten plik zawiera czyste funkcje obliczeniowe, bez zależności od DOM/LS.
   
   Requires: js/schedules/_core.js (for shiftHours + buildHolidays)
   ================================================================ */

// In the browser, _core.js is loaded before this file and provides these names
// through the shared classic-script scope. Under Node.js, require the core explicitly.
const overtimeCore =
  typeof module !== 'undefined' && module.exports && typeof require === 'function'
    ? require('./schedules/_core.js')
    : null;

/**
 * Categorizes overtime hours into pay rates (+50%, +100%, +200%).
 * @param {number} year
 * @param {number} month - 1-12
 * @param {number} day - 1-31
 * @param {string} shift - 'R', 'P', 'N'
 * @param {string} position - 'przed', 'po', 'weekend'
 * @param {number} hours
 * @returns {object} - { h50, h100, h200 }
 */
function categorizeOvertime(year, month, day, shift, position, hours) {
  const yHolidays = (overtimeCore ? overtimeCore.buildHolidays : buildHolidays)(year);
  const isHoliday = !!yHolidays[month + '-' + day];
  const dow = new Date(year, month - 1, day).getDay();
  const isSunday = dow === 0;

  // Holiday work — always +200%
  if (isHoliday) return { h50: 0, h100: 0, h200: hours };

  // Weekend overtime (work on a day off/holiday)
  if (position === 'weekend') {
    if (isSunday) return { h50: 0, h100: hours, h200: 0 };
    return { h50: 0, h100: hours, h200: 0 }; // Saturday or dzień wolny — +100%
  }

  const [shStart, shEnd] = (overtimeCore ? overtimeCore.shiftHours : shiftHours)[shift];
  let curHour;
  if (position === 'przed') curHour = shStart - hours;
  else curHour = shEnd;
  if (curHour < 0) curHour += 24;

  // Count day/night by minutes so fractional hours (0.5, 1.5, 4.8, …) are accurate.
  // Night window: 22:00–06:00 (same rule as whole-hour path).
  const totalMin = Math.round(Number(hours) * 60);
  let nightMin = 0;
  let dayMin = 0;
  const startMin = Math.round((((curHour % 24) + 24) % 24) * 60);
  for (let i = 0; i < totalMin; i++) {
    const absMin = startMin + i;
    const hourOfDay = Math.floor(absMin / 60) % 24;
    if (hourOfDay >= 22 || hourOfDay < 6) nightMin++;
    else dayMin++;
  }
  // For 4-brigade 24/7 schedule, Saturday and Sunday are regular workdays.
  // Standard weekly workers (5-day) use +100% for Sunday, but that rule
  // does not apply here. Only day/night distinction matters.
  // Nearest-minute hours so UI never shows float noise (1.333333…).
  const toHours = (min) => Math.round(min) / 60;
  return { h50: toHours(dayMin), h100: toHours(nightMin), h200: 0 };
}

/**
 * Calculates start/end time of overtime based on shift and position.
 * @param {string} shift - 'R', 'P', 'N'
 * @param {string} position - 'przed' or 'po'
 * @param {number} hours
 * @returns {object} - { from, to }
 */
function calcOvertimeTime(shift, position, hours) {
  const [start, end] = (overtimeCore ? overtimeCore.shiftHours : shiftHours)[shift];
  let from, to;
  if (position === 'przed') {
    to = start;
    from = start - hours;
    if (from < 0) from += 24;
  } else {
    from = end % 24;
    to = (end + hours) % 24;
  }
  return { from, to };
}

// Node.js export (for tests)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { categorizeOvertime, calcOvertimeTime };
}
