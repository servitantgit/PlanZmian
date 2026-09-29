/* ================================================================
   PLAN ZMIAN — Module: NOTES VIEW
   Full-screen panel that shows all notes across all dates in a
   searchable, filterable list. Entry point: side menu → 📝 Notatki.

   Reads existing notes[] global (no migration needed).
   Personal data only — hidden in Privacy mode.

   Public API (window.*):
     - openNotesPanel()  — opens the panel
     - getAllNotes()     — pure function, returns enriched note list
   ================================================================ */

(function () {
  'use strict';

  const RECENT_LIMIT = 30;

  /* Filter state (module-local, resets when panel closes) */
  let notesFilter = {
    search: '',
    month: null, // null = all, else 1-12
    brigade: null, // null = all, else 'A'|'B'|'C'|'D'
    tag: null, // null = all, 'free' | 'before' | 'after'
    dateFrom: null, // 'YYYY-MM-DD' or null
    dateTo: null, // 'YYYY-MM-DD' or null
  };
  let notesDisplayMode = 'recent'; // 'recent' | 'all'
  let notesAdvancedOpen = false; // toggle for advanced filters block

  /* ---------- PURE HELPERS ---------- */

  /**
   * Reads notes[] global, flattens into enriched array sorted DESC by date.
   * @returns {Array<{id, tag, text, year, month, day, brigade, dateKey, shift}>}
   */
  function getAllNotes() {
    const result = [];
    if (typeof notes !== 'object' || !notes) return result;

    Object.keys(notes).forEach((key) => {
      const list = notes[key];
      if (!Array.isArray(list)) return;

      // Key format: "YYYY-M-D-B"
      const match = key.match(/^(\d{4})-(\d{1,2})-(\d{1,2})-([ABCD])$/);
      if (!match) return;

      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);
      const brigade = match[4];

      let shift = '';
      try {
        if (typeof getShiftAt === 'function') {
          shift = getShiftAt(year, month, day, brigade) || '';
        }
      } catch (e) {
        shift = '';
      }

      list.forEach((entry) => {
        if (!entry || typeof entry !== 'object') return;
        result.push({
          id: entry.id,
          tag: entry.tag || null,
          text: entry.text || '',
          year,
          month,
          day,
          brigade,
          dateKey: key,
          shift,
        });
      });
    });

    // Sort DESC by date (newest first)
    result.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      if (a.month !== b.month) return b.month - a.month;
      if (a.day !== b.day) return b.day - a.day;
      return 0;
    });

    return result;
  }

  /**
   * Applies filter state to note list. Pure function.
   */
  function applyFilters(allNotes, filter) {
    return allNotes.filter((n) => {
      // Search: substring case-insensitive
      if (filter.search) {
        const q = filter.search.toLowerCase();
        if (!n.text.toLowerCase().includes(q)) return false;
      }
      // Month
      if (filter.month !== null && n.month !== filter.month) return false;
      // Brigade
      if (filter.brigade !== null && n.brigade !== filter.brigade) return false;
      // Tag: 'free' means tag === null; 'before'/'after' means exact match
      if (filter.tag !== null) {
        if (filter.tag === 'free' && n.tag !== null) return false;
        if (filter.tag === 'before' && n.tag !== 'before') return false;
        if (filter.tag === 'after' && n.tag !== 'after') return false;
      }
      // Date range
      if (filter.dateFrom) {
        const noteDate = `${n.year}-${String(n.month).padStart(2, '0')}-${String(n.day).padStart(2, '0')}`;
        if (noteDate < filter.dateFrom) return false;
      }
      if (filter.dateTo) {
        const noteDate = `${n.year}-${String(n.month).padStart(2, '0')}-${String(n.day).padStart(2, '0')}`;
        if (noteDate > filter.dateTo) return false;
      }
      return true;
    });
  }

  /* ---------- HTML BUILDERS ---------- */

  function tagIcon(tag) {
    if (tag === 'before') return '⏱⬅';
    if (tag === 'after') return '⏱➡';
    return '📝';
  }

  function shiftChipClass(shift) {
    if (shift === 'R' || shift === 'P' || shift === 'N') return 'shift-chip ' + shift;
    return 'shift-chip-free';
  }

  function shiftChipText(shift) {
    if (shift === 'R' || shift === 'P' || shift === 'N') return shift;
    return '—';
  }

  function formatNoteDate(n) {
    const monthLabel =
      typeof monthNames !== 'undefined' && monthNames[n.month - 1]
        ? monthNames[n.month - 1]
        : String(n.month);
    return `${n.day} ${monthLabel} ${n.year}`;
  }

  function buildFilterBar() {
    const monthOptions = [`<option value="">${escapeHtml(t('notesFilterAll'))}</option>`];
    for (let m = 1; m <= 12; m++) {
      const label =
        typeof monthNames !== 'undefined' && monthNames[m - 1] ? monthNames[m - 1] : String(m);
      const selected = notesFilter.month === m ? ' selected' : '';
      monthOptions.push(`<option value="${m}"${selected}>${escapeHtml(label)}</option>`);
    }

    const brigadeOptions = [`<option value="">${escapeHtml(t('notesFilterAll'))}</option>`];
    ['A', 'B', 'C', 'D'].forEach((b) => {
      const selected = notesFilter.brigade === b ? ' selected' : '';
      brigadeOptions.push(`<option value="${b}"${selected}>${b}</option>`);
    });

    const tagOptions = [
      `<option value="">${escapeHtml(t('notesFilterAll'))}</option>`,
      `<option value="free"${notesFilter.tag === 'free' ? ' selected' : ''}>${escapeHtml(t('notesFilterTagFree'))}</option>`,
      `<option value="before"${notesFilter.tag === 'before' ? ' selected' : ''}>${escapeHtml(t('notesFilterTagBefore'))}</option>`,
      `<option value="after"${notesFilter.tag === 'after' ? ' selected' : ''}>${escapeHtml(t('notesFilterTagAfter'))}</option>`,
    ];

    const advancedLabel = notesAdvancedOpen
      ? t('notesHideAdvanced')
      : t('notesAdvancedSearch');
    const advancedCaret = notesAdvancedOpen ? '▲' : '▼';

    // Highlight toggle button when any advanced filter has non-default value
    const hasActiveAdvanced =
      notesFilter.month !== null ||
      notesFilter.brigade !== null ||
      notesFilter.tag !== null ||
      notesFilter.dateFrom ||
      notesFilter.dateTo;

    return `
      <div class="notes-filter-bar">
        <div class="notes-filter-topline">
          <input
            type="search"
            class="notes-filter-search"
            data-notes-filter="search"
            placeholder="${escapeHtml(t('notesSearchPlaceholder'))}"
            value="${escapeHtml(notesFilter.search)}"
          >
          <button
            type="button"
            class="notes-advanced-toggle${hasActiveAdvanced ? ' has-active' : ''}"
            data-notes-action="toggle-advanced"
            aria-expanded="${notesAdvancedOpen ? 'true' : 'false'}"
            title="${escapeHtml(advancedLabel)}"
          >
            <span class="nat-icon">🔍</span>
            <span class="nat-caret">${advancedCaret}</span>
          </button>
        </div>
        ${notesAdvancedOpen ? `
        <div class="notes-filter-advanced">
          <div class="notes-filter-row">
            <label class="notes-filter-item">
              <span class="notes-filter-label">${escapeHtml(t('notesFilterMonth'))}</span>
              <select data-notes-filter="month">${monthOptions.join('')}</select>
            </label>
            <label class="notes-filter-item">
              <span class="notes-filter-label">${escapeHtml(t('notesFilterBrigade'))}</span>
              <select data-notes-filter="brigade">${brigadeOptions.join('')}</select>
            </label>
          </div>
          <div class="notes-filter-row advanced-only">
            <label class="notes-filter-item">
              <span class="notes-filter-label">${escapeHtml(t('notesFilterTag'))}</span>
              <select data-notes-filter="tag">${tagOptions.join('')}</select>
            </label>
          </div>
          <div class="notes-filter-row advanced-only">
            <label class="notes-filter-item">
              <span class="notes-filter-label">${escapeHtml(t('notesFilterDateFrom'))}</span>
              <input type="date" data-notes-filter="dateFrom" value="${escapeHtml(notesFilter.dateFrom || '')}">
            </label>
            <label class="notes-filter-item">
              <span class="notes-filter-label">${escapeHtml(t('notesFilterDateTo'))}</span>
              <input type="date" data-notes-filter="dateTo" value="${escapeHtml(notesFilter.dateTo || '')}">
            </label>
          </div>
        </div>
        ` : ''}
      </div>
    `;
  }

  function buildDisplayToggle(totalCount, filteredCount) {
    if (notesDisplayMode === 'recent') {
      if (totalCount <= RECENT_LIMIT) return '';
      return `
        <button type="button" class="notes-display-toggle" data-notes-action="show-all">
          ${escapeHtml(t('notesShowAll', { n: totalCount }))}
        </button>
      `;
    }
    return `
      <button type="button" class="notes-display-toggle" data-notes-action="show-recent">
        ${escapeHtml(t('notesShowRecent'))}
      </button>
    `;
  }

  function buildNoteRow(note) {
    const dateLabel = formatNoteDate(note);
    const brigadeChip = `<span class="note-list-brigade b-${note.brigade}">${note.brigade}</span>`;
    const shiftLabel = shiftChipText(note.shift);
    const shiftChip = `<span class="${shiftChipClass(note.shift)}">${escapeHtml(shiftLabel)}</span>`;
    const tagChip = `<span class="note-list-tag tag-${note.tag || 'free'}">${tagIcon(note.tag)}</span>`;

    const textHtml =
      note.text.trim() === ''
        ? `<span class="note-list-empty-text">${escapeHtml(t('notesEmptyPlaceholder'))}</span>`
        : escapeHtml(note.text);

    return `
      <div class="note-list-row" data-note-id="${escapeHtml(note.id)}" data-date-key="${escapeHtml(note.dateKey)}">
        <div class="note-list-date">${escapeHtml(dateLabel)}</div>
        <div class="note-list-chips">
          ${brigadeChip}
          ${shiftChip}
          ${tagChip}
        </div>
        <div
          class="note-list-text"
          data-note-edit="${escapeHtml(note.id)}"
          role="button"
          tabindex="0"
          title="${escapeHtml(t('infoNoteEditHint'))}"
        >${textHtml}</div>
        <div class="note-list-actions">
          <button
            type="button"
            class="note-list-jump"
            data-note-jump="${escapeHtml(note.id)}"
            aria-label="${escapeHtml(t('notesJumpToDay'))}"
            title="${escapeHtml(t('notesJumpToDay'))}"
          >→</button>
          <button
            type="button"
            class="note-list-delete"
            data-note-delete="${escapeHtml(note.id)}"
            aria-label="${escapeHtml(t('delete'))}"
            title="${escapeHtml(t('delete'))}"
          >✕</button>
        </div>
      </div>
    `;
  }

  /* ---------- RENDER ---------- */

  function renderNotesList(body) {
    if (!body) return;

    // Privacy gate
    if (typeof shouldShowPersonalData === 'function' && !shouldShowPersonalData()) {
      body.innerHTML = `
        <div class="notes-view-panel">
          <div class="notes-empty-state">
            <p>${escapeHtml(t('privacyDayDetailsHidden'))}</p>
            <button type="button" class="btn-primary" data-notes-action="disable-privacy">
              ${escapeHtml(t('privacyDisableAction'))}
            </button>
          </div>
        </div>
      `;
      const btn = body.querySelector('[data-notes-action="disable-privacy"]');
      if (btn) {
        btn.addEventListener('click', () => {
          if (typeof setPrivacyMode === 'function') setPrivacyMode(false);
          renderNotesList(body);
        });
      }
      return;
    }

    const allNotes = getAllNotes();
    const filtered = applyFilters(allNotes, notesFilter);
    const displayed = notesDisplayMode === 'recent' ? filtered.slice(0, RECENT_LIMIT) : filtered;

    let listHtml;
    if (displayed.length === 0) {
      const isFiltered =
        notesFilter.search ||
        notesFilter.month !== null ||
        notesFilter.brigade !== null ||
        notesFilter.tag !== null ||
        notesFilter.dateFrom ||
        notesFilter.dateTo;
      listHtml = `
        <div class="notes-empty-state">
          <p>${escapeHtml(isFiltered ? t('notesEmptyFiltered') : t('notesEmpty'))}</p>
        </div>
      `;
    } else {
      listHtml = `
        <div class="notes-list">
          ${displayed.map(buildNoteRow).join('')}
        </div>
      `;
    }

    body.innerHTML = `
      <div class="notes-view-panel">
        ${buildFilterBar()}
        ${buildDisplayToggle(filtered.length, displayed.length)}
        ${listHtml}
      </div>
    `;

    bindNotesListEvents(body);
  }

  /* ---------- EVENT BINDING ---------- */

  function bindNotesListEvents(body) {
    // Filter inputs
    body.querySelectorAll('[data-notes-filter]').forEach((el) => {
      const field = el.getAttribute('data-notes-filter');
      const eventName = el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input';

      el.addEventListener(eventName, () => {
        let value = el.value;

        if (field === 'search') {
          notesFilter.search = value;
        } else if (field === 'month') {
          notesFilter.month = value === '' ? null : parseInt(value, 10);
        } else if (field === 'brigade') {
          notesFilter.brigade = value === '' ? null : value;
        } else if (field === 'tag') {
          notesFilter.tag = value === '' ? null : value;
        } else if (field === 'dateFrom') {
          notesFilter.dateFrom = value === '' ? null : value;
        } else if (field === 'dateTo') {
          notesFilter.dateTo = value === '' ? null : value;
        }

        renderNotesList(body);
      });
    });

    // Display mode toggle + advanced filters toggle
    body.querySelectorAll('[data-notes-action]').forEach((btn) => {
      const action = btn.getAttribute('data-notes-action');
      if (action === 'show-all') {
        btn.addEventListener('click', () => {
          notesDisplayMode = 'all';
          renderNotesList(body);
        });
      } else if (action === 'show-recent') {
        btn.addEventListener('click', () => {
          notesDisplayMode = 'recent';
          renderNotesList(body);
        });
      } else if (action === 'toggle-advanced') {
        btn.addEventListener('click', () => {
          notesAdvancedOpen = !notesAdvancedOpen;
          renderNotesList(body);
        });
      }
    });

    // Delete
    body.querySelectorAll('[data-note-delete]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const noteId = btn.getAttribute('data-note-delete');
        const row = btn.closest('.note-list-row');
        if (!row) return;
        const dateKey = row.getAttribute('data-date-key');
        const match = dateKey.match(/^(\d{4})-(\d{1,2})-(\d{1,2})-([ABCD])$/);
        if (!match) return;

        if (typeof showConfirm === 'function') {
          showConfirm(
            t('notesDeleteConfirmTitle'),
            t('notesDeleteConfirmBody'),
            () => {
              if (typeof removeDayNote === 'function') {
                removeDayNote(
                  parseInt(match[1], 10),
                  parseInt(match[2], 10),
                  parseInt(match[3], 10),
                  match[4],
                  noteId
                );
              }
              renderNotesList(body);
            },
            { primaryText: t('delete'), primaryClass: 'danger' }
          );
        }
      });
    });

    // Jump to day
    body.querySelectorAll('[data-note-jump]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.note-list-row');
        if (!row) return;
        const dateKey = row.getAttribute('data-date-key');
        const match = dateKey.match(/^(\d{4})-(\d{1,2})-(\d{1,2})-([ABCD])$/);
        if (!match) return;

        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        const day = parseInt(match[3], 10);
        const brigade = match[4];

        if (typeof currentYear !== 'undefined') currentYear = year;
        if (typeof currentMonth !== 'undefined') currentMonth = month;
        if (typeof selectedDay !== 'undefined') selectedDay = day;
        if (typeof selectedShift !== 'undefined') selectedShift = brigade;
        if (typeof yearMode !== 'undefined') yearMode = false;

        if (typeof prefs !== 'undefined' && prefs) {
          prefs.year = year;
          prefs.shift = brigade;
          prefs.yearMode = false;
          prefs.view = 'month';
          if (typeof savePrefs === 'function') savePrefs(prefs);
        }

        if (typeof closeAppPanel === 'function') closeAppPanel();
        if (typeof updateShiftButtons === 'function') updateShiftButtons();
        if (typeof switchView === 'function') switchView('month');
      });
    });

    // Inline edit
    body.querySelectorAll('[data-note-edit]').forEach((el) => {
      el.addEventListener('click', () => startNoteEdit(el, body));
      el.addEventListener('keydown', (event) => {
        // Only activate when span itself is focused, not when event bubbles
        // from a child input (fixes Space being swallowed while typing)
        if (event.target !== el) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          startNoteEdit(el, body);
        }
      });
    });
  }

  function startNoteEdit(el, body) {
    if (el.querySelector('input')) return; // already editing

    const noteId = el.getAttribute('data-note-edit');
    const row = el.closest('.note-list-row');
    if (!row) return;
    const dateKey = row.getAttribute('data-date-key');
    const match = dateKey.match(/^(\d{4})-(\d{1,2})-(\d{1,2})-([ABCD])$/);
    if (!match) return;

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    const brigade = match[4];

    // Find current text from the notes global
    let currentText = '';
    if (typeof getDayNotes === 'function') {
      const list = getDayNotes(year, month, day, brigade);
      const entry = list.find((n) => n.id === noteId);
      if (entry) currentText = entry.text;
    }

    el.innerHTML = `<input type="text" class="note-list-edit-input" value="${escapeHtml(currentText)}">`;
    const input = el.querySelector('input');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    let committed = false;
    const commitEdit = () => {
      if (committed) return;
      committed = true;
      const newText = input.value.trim();
      if (newText && newText !== currentText) {
        if (typeof updateDayNote === 'function') {
          updateDayNote(year, month, day, brigade, noteId, newText);
        }
      }
      renderNotesList(body);
    };

    input.addEventListener('blur', commitEdit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      } else if (event.key === 'Escape') {
        committed = true;
        renderNotesList(body);
      }
    });
  }

  /* ---------- PUBLIC API ---------- */

  function openNotesPanel() {
    if (typeof closeSideMenu === 'function') {
      try {
        closeSideMenu();
      } catch (e) {
        /* ignore */
      }
    }

    // Reset display mode each time panel opens; keep filter state for convenience
    notesDisplayMode = 'recent';

    if (typeof openAppPanel !== 'function') {
      console.error('[notes-view]', 'openAppPanel not available');
      return;
    }

    openAppPanel({
      id: 'notes-view',
      title: t('notesViewTitle'),
      html: '',
      onMount: (body) => {
        renderNotesList(body);
      },
    });
  }

  window.openNotesPanel = openNotesPanel;
  window.getAllNotes = getAllNotes;

  /* ---------- MENU BINDING ---------- */

  function bindMenuButton() {
    const btn = document.getElementById('menuNotesView');
    if (!btn) return;
    // Clone-replace to clear any previous listeners (same pattern as settings.js)
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', () => {
      openNotesPanel();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindMenuButton);
  } else {
    bindMenuButton();
  }
})();
