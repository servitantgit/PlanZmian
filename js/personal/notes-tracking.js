/* ================================================================
   PLAN ZMIAN — Personal Module: Unified Day Notes
   ================================================================
   Pure, dependency-free helpers for the unified per-day notes list.
   A day's notes are an array of { id, tag, text } entries:
     - tag === null      → free-form note the user typed directly
     - tag === 'before'  → note attached to the "overtime before" record
     - tag === 'after'   → note attached to the "overtime after" record
   This replaces three previously separate note stores (day note string,
   overtime.przed.note, overtime.po.note).

   Kept in a small standalone module (same pattern as sync-tracking.js) so
   this logic is unit-testable in plain Node without the DOM/localStorage
   that js/core.js depends on at top level.
   ================================================================ */

function genNoteId() {
  return 'note-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/** True when a legacy notes[key] value (string) or a unified array has real text. */
function noteEntryHasContent(value) {
  if (Array.isArray(value)) return value.some((n) => n && String(n.text || '').trim());
  return value != null && String(value).trim() !== '';
}

/** Returns a new array with a new entry appended. No-op (list unchanged) if text is empty. */
function addNoteEntry(list, text, tag) {
  const trimmed = String(text || '').trim();
  const next = Array.isArray(list) ? list.slice() : [];
  if (!trimmed) return { list: next, id: null };
  const entry = { id: genNoteId(), tag: tag || null, text: trimmed };
  next.push(entry);
  return { list: next, id: entry.id };
}

/** Returns a new array with the given entry id removed. */
function removeNoteEntry(list, noteId) {
  if (!Array.isArray(list)) return [];
  return list.filter((n) => n && n.id !== noteId);
}

/**
 * Returns a new array with the text of the entry matching `noteId` replaced.
 * Editing to an empty/whitespace value is a no-op (returns the list
 * unchanged) — deletion stays a deliberate, separate action via
 * removeNoteEntry(), not an accidental side effect of clearing a field.
 */
function updateNoteText(list, noteId, text) {
  if (!Array.isArray(list)) return [];
  const trimmed = String(text || '').trim();
  if (!trimmed) return list.slice();
  const idx = list.findIndex((n) => n && n.id === noteId);
  if (idx < 0) return list.slice();
  const next = list.slice();
  next[idx] = { ...next[idx], text: trimmed };
  return next;
}

/**
 * Returns a new array where the single entry carrying `tag` has its text
 * set to `text` (updated in place, not duplicated), or removed if `text`
 * is empty. Used so re-saving an overtime note updates its entry instead
 * of piling up duplicates.
 */
function upsertNoteByTag(list, tag, text) {
  const trimmed = String(text || '').trim();
  const next = Array.isArray(list) ? list.slice() : [];
  const idx = next.findIndex((n) => n && n.tag === tag);

  if (!trimmed) {
    if (idx >= 0) next.splice(idx, 1);
    return next;
  }

  if (idx >= 0) next[idx] = { ...next[idx], text: trimmed };
  else next.push({ id: genNoteId(), tag, text: trimmed });
  return next;
}

/** Text of the single entry carrying `tag`, or '' if none. */
function getNoteTextByTag(list, tag) {
  if (!Array.isArray(list)) return '';
  const entry = list.find((n) => n && n.tag === tag);
  return entry ? entry.text : '';
}

/**
 * Total number of non-empty note entries across a whole notes[] map (all
 * days), counting each individual note — not the number of day-keys that
 * have notes. A day can hold several notes since the unified-notes change,
 * so counting by day-key silently hides added/removed notes whenever a day
 * already had at least one (this was a real bug in the sync change-diff).
 * Also tolerates legacy string values (pre-migration data).
 * @param {object} notesMap - e.g. the `notes` global or a downloaded payload's `notes`
 * @returns {number}
 */
function countNoteEntries(notesMap) {
  if (!notesMap || typeof notesMap !== 'object') return 0;
  return Object.keys(notesMap).reduce((total, k) => {
    const v = notesMap[k];
    if (Array.isArray(v)) {
      return total + v.filter((n) => n && String(n.text || '').trim()).length;
    }
    return total + (v != null && String(v).trim() !== '' ? 1 : 0);
  }, 0);
}

/**
 * Pure transform used by core.js's migrateUnifiedNotes(): given raw
 * notes/overtimes objects (any legacy shape — string notes, embedded
 * overtime .note fields, or already-migrated arrays), returns new
 * { notes, overtimes } objects with notes[key] as unified { id, tag, text }
 * arrays and overtime .note fields stripped.
 */
function computeUnifiedNotesMigration(rawNotes, rawOvertimes) {
  const outNotes = {};

  if (rawNotes && typeof rawNotes === 'object') {
    Object.keys(rawNotes).forEach((k) => {
      const v = rawNotes[k];
      if (typeof v === 'string') {
        const trimmed = v.trim();
        if (trimmed) outNotes[k] = [{ id: genNoteId(), tag: null, text: trimmed }];
      } else if (Array.isArray(v)) {
        outNotes[k] = v.slice();
      }
    });
  }

  const outOvertimes = {};
  if (rawOvertimes && typeof rawOvertimes === 'object') {
    Object.keys(rawOvertimes).forEach((k) => {
      const rec = rawOvertimes[k];
      if (!rec || typeof rec !== 'object') {
        outOvertimes[k] = rec;
        return;
      }
      const newRec = {};
      ['przed', 'po'].forEach((pos) => {
        const entry = rec[pos];
        if (entry && typeof entry === 'object') {
          if (entry.note) {
            const trimmed = String(entry.note).trim();
            if (trimmed) {
              if (!outNotes[k]) outNotes[k] = [];
              outNotes[k].push({
                id: genNoteId(),
                tag: pos === 'przed' ? 'before' : 'after',
                text: trimmed,
              });
            }
          }
          const rest = {};
          Object.keys(entry).forEach((field) => {
            if (field !== 'note') rest[field] = entry[field];
          });
          newRec[pos] = rest;
        } else {
          newRec[pos] = entry;
        }
      });
      outOvertimes[k] = newRec;
    });
  }

  return { notes: outNotes, overtimes: outOvertimes };
}

if (typeof window !== 'undefined') {
  window.genNoteId = genNoteId;
  window.noteEntryHasContent = noteEntryHasContent;
  window.addNoteEntry = addNoteEntry;
  window.removeNoteEntry = removeNoteEntry;
  window.updateNoteText = updateNoteText;
  window.upsertNoteByTag = upsertNoteByTag;
  window.getNoteTextByTag = getNoteTextByTag;
  window.countNoteEntries = countNoteEntries;
  window.computeUnifiedNotesMigration = computeUnifiedNotesMigration;
}

// Node.js compatibility for unit tests (browser ignores this block)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    genNoteId,
    noteEntryHasContent,
    addNoteEntry,
    removeNoteEntry,
    updateNoteText,
    upsertNoteByTag,
    getNoteTextByTag,
    countNoteEntries,
    computeUnifiedNotesMigration,
  };
}
