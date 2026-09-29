/* ================================================================
    PLAN ZMIAN — Module 4: EDIT (immediate save)
    ================================================================ */

/**
 * Read shift including any in-memory overlay.
 * Kept for API compatibility — edits now write straight to customSchedule,
 * so this is identical to getShiftAt().
 */
function getShiftAtWithPending(year, month, day, brigade) {
  return getShiftAt(year, month, day, brigade);
}

/**
 * Apply a shift edit and save immediately (same model as urlop / overtime).
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @param {string} brigade
 * @param {string} [forcedValue] — if omitted, cycles R→P→N→free
 * @returns {string} new shift value
 */
function applyEdit(year, month, day, brigade, forcedValue) {
  let next;
  if (forcedValue !== undefined) {
    next = forcedValue;
  } else {
    const cur = getShiftAt(year, month, day, brigade) || '';
    const idx = SHIFT_CYCLE.indexOf(cur);
    next = SHIFT_CYCLE[(idx + 1) % SHIFT_CYCLE.length];
  }
  setShift(year, month, day, brigade, next);
  return next;
}