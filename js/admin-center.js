/* ================================================================
   PLAN ZMIAN — Module 10: ADMIN CENTER
   Factory schedule editing, export, guide and danger zone
   ================================================================ */

/* === FACTORY PAINTING MODE STATE === */

let factoryPaintMode = null; // null when not active, 'R', 'P', 'N', or 'W' when active
let factoryPaintYear = null;
let factoryPaintMonth = null;
let factoryPaintActive = false;

/* Resolve schedule globals: top-level `const`/`let` are NOT on window. */
function getFactoryScheduleObj() {
  try {
    if (typeof factorySchedule !== 'undefined' && factorySchedule) return factorySchedule;
  } catch (_) {}
  return (typeof window !== 'undefined' && window.factorySchedule) || {};
}
function getCustomScheduleObj() {
  try {
    if (typeof customSchedule !== 'undefined' && customSchedule) return customSchedule;
  } catch (_) {}
  return (typeof window !== 'undefined' && window.customSchedule) || {};
}
function getFactoryDraftsObj() {
  try {
    if (typeof factoryDrafts !== 'undefined' && factoryDrafts) return factoryDrafts;
  } catch (_) {}
  return (typeof window !== 'undefined' && window.factoryDrafts) || {};
}
function getAvailableScheduleYears() {
  const years = new Set();
  try {
    if (typeof AVAILABLE_YEARS !== 'undefined' && Array.isArray(AVAILABLE_YEARS)) {
      AVAILABLE_YEARS.forEach((y) => years.add(Number(y)));
    }
  } catch (_) {}
  try {
    if (typeof window !== 'undefined' && Array.isArray(window.AVAILABLE_YEARS)) {
      window.AVAILABLE_YEARS.forEach((y) => years.add(Number(y)));
    }
  } catch (_) {}
  Object.keys(getFactoryScheduleObj()).forEach((y) => years.add(Number(y)));
  Object.keys(getCustomScheduleObj()).forEach((y) => years.add(Number(y)));
  return [...years].filter((y) => y > 2000 && y < 2100).sort((a, b) => a - b);
}

/* === FACTORY PAINTING MODE CONTROLS === */

/**
 * Activates factory painting mode for a specific year
 * @param {number} year - The year to edit
 */
function activateFactoryPaintMode(year) {
  if (!window.requireAdmin()) {
    showToast('error', t('adminRequired') || 'Admin access required');
    return;
  }
  
  factoryPaintYear = year;
  // Sync with the calendar period so day clicks match.
  try {
    if (typeof currentYear !== 'undefined') currentYear = year;
    if (typeof currentMonth !== 'undefined' && currentMonth >= 1 && currentMonth <= 12) {
      factoryPaintMonth = currentMonth;
    } else {
      factoryPaintMonth = new Date().getMonth() + 1;
      if (typeof currentMonth !== 'undefined') currentMonth = factoryPaintMonth;
    }
  } catch (_) {
    factoryPaintMonth = new Date().getMonth() + 1;
  }

  // Factory painting always uses the monthly calendar grid.
  if (typeof yearMode !== 'undefined') yearMode = false;
  if (typeof prefs !== 'undefined' && prefs) {
    prefs.year = year;
    prefs.yearMode = false;
    if (typeof savePrefs === 'function') savePrefs(prefs);
  }

  factoryPaintMode = 'R';
  factoryPaintActive = true;
  document.body.classList.add('factory-editor-active');
  // Expose state for other modules (calendar.js, main.js)
  window.factoryPaintActive = true;
  window.factoryPaintYear = factoryPaintYear;
  window.factoryPaintMonth = factoryPaintMonth;
  window.factoryPaintMode = factoryPaintMode;
  
  // Switch to month view for painting
  if (typeof switchView === 'function') switchView('month');
  else if (typeof window.switchView === 'function') window.switchView('month');
  
  // Show factory editor bar and bind tools
  const factoryEditorBar = document.getElementById('factoryEditorBar');
  if (factoryEditorBar) {
    factoryEditorBar.style.display = 'flex';
  }
  bindFactoryEditorBar();
  activateFactoryPaintTool('R');
  updateFactoryEditorContext();
  
  if (typeof refreshViews === 'function') refreshViews();
  else if (typeof updateAppShellUI === 'function') updateAppShellUI();
  
  showToast('info', t('factoryEditorActive') || 'Factory editor active - use R/P/N/W keys to paint');
}

/**
 * Deactivates factory painting mode
 */
function deactivateFactoryPaintMode() {
  factoryPaintActive = false;
  factoryPaintMode = null;
  factoryPaintYear = null;
  factoryPaintMonth = null;
  document.body.classList.remove('factory-editor-active');
  window.factoryPaintActive = false;
  window.factoryPaintYear = null;
  window.factoryPaintMonth = null;
  window.factoryPaintMode = null;
  
  const factoryEditorBar = document.getElementById('factoryEditorBar');
  if (factoryEditorBar) factoryEditorBar.style.display = 'none';
  
  if (typeof refreshViews === 'function') refreshViews();
  
  showToast('info', t('factoryEditorExit') || 'Factory editor exited');
}

/**
 * Updates the context display in the factory editor bar
 */
function updateFactoryEditorContext() {
  const contextEl = document.getElementById('factoryEditorContext');
  if (!contextEl) return;
  
  if (!factoryPaintActive || !factoryPaintYear) {
    contextEl.innerHTML = '';
    return;
  }
  
  // Keep paint month in sync with the visible calendar month
  try {
    if (typeof currentMonth === 'number' && currentMonth >= 1 && currentMonth <= 12) {
      factoryPaintMonth = currentMonth;
      window.factoryPaintMonth = factoryPaintMonth;
    }
    if (typeof currentYear === 'number') {
      // Stay on paint year while editing; if user navigates year via UI, follow it
      factoryPaintYear = currentYear;
      window.factoryPaintYear = factoryPaintYear;
    }
  } catch (_) {}
  
  let monthName = '';
  try {
    if (typeof monthNames !== 'undefined' && monthNames && monthNames[factoryPaintMonth - 1]) {
      monthName = monthNames[factoryPaintMonth - 1];
    }
  } catch (_) {}
  if (!monthName) monthName = String(factoryPaintMonth || '');
  
  const shiftLabel = factoryPaintMode
    ? (t('label' + factoryPaintMode) || factoryPaintMode)
    : (t('factoryEditorSelectTool') || 'Select tool');
  
  contextEl.innerHTML = `
    <span>${t('factoryEditorYear') || 'Year'}: <strong>${factoryPaintYear}</strong></span>
    <span>${t('factoryEditorMonth') || 'Month'}: <strong>${monthName}</strong></span>
    <span>${t('factoryEditorShift') || 'Shift'}: <strong>${shiftLabel}</strong></span>
  `;
}

/**
 * Activates a specific factory paint tool (R/P/N/W)
 * @param {string} tool - The tool to activate ('R', 'P', 'N', or 'W')
 */
function activateFactoryPaintTool(tool) {
  if (!['R', 'P', 'N', 'W'].includes(tool)) return;
  if (!factoryPaintActive) return;
  
  factoryPaintMode = tool;
  window.factoryPaintMode = tool;
  
  document.querySelectorAll('.factory-tool-btn').forEach(btn => {
    const isActive = btn.getAttribute('data-factory-shift') === tool;
    btn.classList.toggle('active', isActive);
  });
  
  updateFactoryEditorContext();
}

function bindFactoryEditorBar() {
  document.querySelectorAll('.factory-tool-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const tool = btn.getAttribute('data-factory-shift');
      activateFactoryPaintTool(tool);
    };
  });
  const publishBtn = document.getElementById('factoryEditorPublishBtn');
  if (publishBtn) {
    publishBtn.title = t('adminPublishBtn') || 'Publish';
    publishBtn.setAttribute('aria-label', t('adminPublishBtn') || 'Publish');
    publishBtn.onclick = (e) => {
      e.preventDefault();
      const year = factoryPaintYear || (typeof currentYear === 'number' ? currentYear : null);
      if (!year) {
        showToast('error', t('adminInvalidYear') || 'Invalid year');
        return;
      }
      publishFactoryScheduleYear(year);
    };
  }
  const exitBtn = document.getElementById('factoryEditorExitBtn');
  if (exitBtn) {
    exitBtn.onclick = (e) => {
      e.preventDefault();
      deactivateFactoryPaintMode();
    };
  }
}

/** Call after calendar period changes while painting so day clicks keep working. */
function syncFactoryPaintPeriodFromCalendar() {
  if (!factoryPaintActive) return;
  try {
    if (typeof currentMonth === 'number') {
      factoryPaintMonth = currentMonth;
      window.factoryPaintMonth = currentMonth;
    }
    if (typeof currentYear === 'number') {
      factoryPaintYear = currentYear;
      window.factoryPaintYear = currentYear;
    }
  } catch (_) {}
  updateFactoryEditorContext();
}

/**
 * Handles day click in factory painting mode
 * @param {number} year - The year
 * @param {number} month - The month (1-12)
 * @param {number} day - The day of month
 * @param {string} shift - The brigade/shift ('A', 'B', 'C', 'D')
 */
function handleFactoryPaintDayClick(year, month, day, shift) {
  if (!factoryPaintActive) return;
  // Keep paint period aligned with the visible calendar
  try {
    if (typeof currentYear === 'number') factoryPaintYear = currentYear;
    if (typeof currentMonth === 'number') factoryPaintMonth = currentMonth;
    window.factoryPaintYear = factoryPaintYear;
    window.factoryPaintMonth = factoryPaintMonth;
  } catch (_) {}
  if (year !== factoryPaintYear || month !== factoryPaintMonth) return;
  if (!factoryPaintMode) {
    showToast('info', t('factoryEditorSelectTool') || 'Select tool R/P/N/W');
    return;
  }
  
  const val = factoryPaintMode === 'W' ? '' : factoryPaintMode;
  if (typeof window.setFactoryDraftShift === 'function') {
    window.setFactoryDraftShift(year, month, day, shift, val);
  }
  // Quiet feedback — avoid toast spam on every cell
  if (typeof refreshViews === 'function') refreshViews();
}

/* === FACTORY SCHEDULE APIS === */

/**
 * Gets factory schedule data for a year (merged with custom schedule for admin view)
 * @param {number} year - The year to get
 * @returns {Object} - Schedule data for the year
 */
function getFactoryScheduleForYear(year) {
  if (!window.requireAdmin()) return null;
  
  // Get merged schedule (factory + custom) - same as what actions.js uses for export
  const factory = getFactoryScheduleObj()[year] || {};
  const custom = getCustomScheduleObj()[year] || {};
  
  // For admin view, we want to show factory schedule as base, with custom overlay
  // But in factory painting mode, we work directly with factoryDrafts
  return { factory, custom };
}

/**
 * Gets factory draft data for a year
 * @param {number} year - The year to get
 * @returns {Object} - Factory draft data for the year
 */
function getFactoryDraftForYear(year) {
  if (!window.requireAdmin()) return null;
  
  if (typeof window.ensureFactoryDraftYear === 'function') window.ensureFactoryDraftYear(year);
  return getFactoryDraftsObj()[year] || null;
}

/* === EXPORT FUNCTIONS (moved from actions.js) === */

/**
 * Merges factorySchedule + customSchedule for a given year.
 * @param {number} year
 * @returns {object} - { 1: { A: [...], B, C, D }, 2: {...}, ... 12: {...} }
 */
function mergeFactoryWithCustom(year) {
  const merged = {};
  const factory = getFactoryScheduleObj()[year] || {};
  const drafts = getFactoryDraftsObj()[year] || {};
  const brigades = ['A', 'B', 'C', 'D'];

  for (let m = 1; m <= 12; m++) {
    const daysInMonth = new Date(year, m, 0).getDate();
    merged[m] = {};
    brigades.forEach((b) => {
      // Base: public factory schedule
      const factoryArr =
        factory[m] && factory[m][b] ? [...factory[m][b]] : new Array(daysInMonth).fill('');
      // Overlay admin factory drafts (painted in Admin Center)
      if (drafts[m] && drafts[m][b]) {
        for (let d = 0; d < daysInMonth; d++) {
          const draftVal = drafts[m][b][d];
          if (draftVal !== undefined && draftVal !== null) {
            factoryArr[d] = draftVal;
          }
        }
      }
      while (factoryArr.length < daysInMonth) factoryArr.push('');
      if (factoryArr.length > daysInMonth) factoryArr.length = daysInMonth;
      merged[m][b] = factoryArr;
    });
  }
  return merged;
}

/**
 * Calculates factoryMonthHours automatically from schedule (R+P+N × 8h).
 * @param {object} yearData - merged schedule for one year
 * @returns {object} - { 1: { A: 168, B: 184, C: 160, D: 168 }, ... }
 */
function calculateMonthHours(yearData) {
  const hours = {};
  const brigades = ['A', 'B', 'C', 'D'];
  for (let m = 1; m <= 12; m++) {
    hours[m] = {};
    brigades.forEach((b) => {
      const arr = yearData[m] ? yearData[m][b] || [] : [];
      const workedDays = arr.filter((s) => s === 'R' || s === 'P' || s === 'N').length;
      hours[m][b] = workedDays * 8;
    });
  }
  return hours;
}

/**
 * Formats one year of schedule data as pretty-printed JS code (indented).
 * @param {number} year
 * @param {object} yearData - merged schedule
 * @returns {string} - JS code snippet
 */
function formatYearAsJs(year, yearData) {
  let out = `    ${year}: {\n`;
  for (let m = 1; m <= 12; m++) {
    out += `      ${m}: {\n`;
    ['A', 'B', 'C', 'D'].forEach((b, idx) => {
      const arr = yearData[m][b] || [];
      const formatted = arr.map((v) => `'${v}'`).join(', ');
      const comma = idx < 3 ? ',' : '';
      out += `        ${b}: [${formatted}]${comma}\n`;
    });
    const comma = m < 12 ? ',' : '';
    out += `      }${comma}\n`;
  }
  out += `    }`;
  return out;
}

/**
 * Formats factoryMonthHours as JS code.
 * @param {number} year
 * @param {object} hoursData
 * @returns {string}
 */
function formatHoursAsJs(year, hoursData) {
  let out = `    ${year}: {\n`;
  for (let m = 1; m <= 12; m++) {
    const h = hoursData[m];
    const comma = m < 12 ? ',' : '';
    out += `      ${m}: { A: ${h.A}, B: ${h.B}, C: ${h.C}, D: ${h.D} }${comma}\n`;
  }
  out += `    }`;
  return out;
}

/**
 * Main function: generates data.js snippet for a chosen year and downloads it.
 * Shows instructions modal after download.
 */
function exportFactorySchedule() {
  if (!window.requireAdmin()) {
    showToast('error', t('adminRequired') || 'Admin access required');
    return;
  }
  
  // Get list of available years (factory + custom + registry)
  const fs = getFactoryScheduleObj();
  const cs = getCustomScheduleObj();
  const factoryYears = Object.keys(fs).map(Number);
  const customYears = Object.keys(cs).map(Number);
  const allYears = getAvailableScheduleYears();

  if (allYears.length === 0) {
    showToast('error', t('adminExportNoData') || 'No data to export');
    return;
  }

  // Build year selection buttons
  const yearButtons = allYears
    .map((y) => {
      const hasCustom = customYears.includes(y);
      const hasFactory = factoryYears.includes(y);
      const label = hasCustom && hasFactory ? `${y} ✏️` : hasCustom ? `${y} 🆕` : `${y}`;
      const title = hasCustom
        ? t('adminExportYearWithEdits') || 'Contains your edits'
        : t('adminExportYearFactory') || 'Factory data only';
      return `<button class="admin-export-year-btn" data-year="${y}" title="${title}" style="padding:12px 20px; margin:4px; border:2px solid var(--border-cell); background:var(--bg-cell); color:var(--text-main); border-radius:8px; cursor:pointer; font-size:15px; font-weight:700;">${label}</button>`;
    })
    .join('');

  const body = `
    <p style="margin-bottom:12px;">${t('adminExportSelectYear') || 'Select year to export:'}</p>
    <div style="display:flex; flex-wrap:wrap; justify-content:center; margin-bottom:12px;">
      ${yearButtons}
    </div>
    <p style="font-size:12px; color:var(--text-muted); margin-top:8px;">
      ✏️ = ${t('adminExportYearWithEdits') || 'contains your edits'}<br>
      🆕 = ${t('adminExportYearNew') || 'new year (custom only)'}
    </p>
  `;

  showModal({
    title: '📤 ' + (t('menuAdminExport') || 'Export data.js'),
    body: body,
    buttons: [{ text: t('otCancelBtn'), class: 'secondary' }],
  });

  // Attach year button handlers
  setTimeout(() => {
    document.querySelectorAll('.admin-export-year-btn').forEach((btn) => {
      btn.onclick = () => {
        const year = parseInt(btn.dataset.year, 10);
        hideModal();
        generateAndDownloadDataJs(year);
      };
    });
  }, 50);
}

/**
 * Generates schedules/gillette/YYYY.js file content and triggers download.
 * New format uses registerYearData() from schedules architecture.
 * @param {number} year
 */
function generateAndDownloadDataJs(year) {
  try {
    const merged = mergeFactoryWithCustom(year);
    const hours = calculateMonthHours(merged);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);

    // formatYearAsJs / formatHoursAsJs return "    YYYY: { ... }" (legacy nested shape).
    // registerYearData expects two plain objects — wrap stripped inner lines in обʼєкти.
    const scheduleFormatted = formatYearAsJs(year, merged);
    const scheduleLines = scheduleFormatted.split('\n');
    const scheduleInner = scheduleLines.slice(1, -1).join('\n');

    const hoursFormatted = formatHoursAsJs(year, hours);
    const hoursLines = hoursFormatted.split('\n');
    const hoursInner = hoursLines.slice(1, -1).join('\n');

    const content = `/* ================================================================
   PLAN ZMIAN — Data for year ${year} (Gillette schedule)
   
   PUBLIC MODULE — safe to commit to git
   
   Auto-generated: ${dateStr} by Admin Panel Export
   Data extracted from admin's local factorySchedule + customSchedule.
   
   Requires:
   - schedules/_registry.js (for registerYearData function)
   - schedules/gillette/metadata.js (registers 'gillette' schedule first)
   ================================================================ */

registerYearData(
  'gillette',
  ${year},
  {
${scheduleInner}
  },
  {
${hoursInner}
  }
);
`;

    // Trigger download
    const blob = new Blob([content], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${year}.js`;
    a.click();
    URL.revokeObjectURL(url);

    // Show success modal with instructions
    showInstructionsModal(year);
  } catch (err) {
    console.error('[admin-center.js] Export data.js error:', err);
    showToast('error', (t('adminExportError') || 'Export failed') + ': ' + err.message);
  }
}

/**
 * Shows post-download modal with deployment instructions for new schedules format.
 * @param {number} year
 */
function showInstructionsModal(year) {
  const params = { year };
  const body = `
    <div style="padding:12px; background:var(--bg-info); border-radius:10px; margin-bottom:15px;">
      <p style="margin:0; font-weight:600; color:var(--text-header);">
        ✅ ${t('factoryExportDownloaded')}: <code>${year}.js</code>
      </p>
      <p style="margin:8px 0 0; color:var(--text-muted); font-size:13px;">
        ${t('factoryExportInstructions')}
      </p>
    </div>

    <p style="font-weight:600; margin-bottom:10px;">
      ${t('factoryExportDeployIntro', params)}
    </p>

    <ol style="line-height:1.7; font-size:14px; padding-left:22px;">
      <li>${t('factoryExportDeployStepFile', params)}</li>
      <li>${t('factoryExportDeployStepIndex', params)}</li>
      <li>${t('factoryExportDeployStepCache', params)}</li>
      <li>${t('factoryExportDeployStepCommit', params)}</li>
      <li>${t('factoryExportDeployStepPush', params)}</li>
    </ol>

    <p style="font-size:12px; color:var(--text-muted); margin-top:12px; padding-top:12px; border-top:1px solid var(--border-cell);">
      💡 ${t('factoryExportExistingYearHint', params)}
    </p>
  `;

  showModal({
    title: `📦 ${t('factoryExportDeployTitle')}`,
    body,
    buttons: [{ text: t('gotIt'), class: 'primary' }],
  });
}

/* === GUIDE SECTION CONTENT === */

/**
 * Renders the guide section content
 * @returns {string} - HTML content for the guide tab
 */
function renderGuideContent() {
  return `
    <div style="line-height:1.6;">
      <h3>${t('adminGuide') || 'Guide'}</h3>
      <p>${t('adminGuideIntro') || 'This guide explains how to use the Admin Center to manage factory schedules.'}</p>
      
      <h4>${t('factoryEditorTitle') || 'Factory Schedule Editor'}</h4>
      <p>${t('adminGuideFactoryEditor') || 'Use the factory editor to create and modify factory schedules that apply to all users.'}</p>
      
      <div style="background:var(--bg-info); padding:12px; border-radius:8px; margin:12px 0;">
        <p><strong>${t('factoryEditorWorkflow') || 'Typical workflow:'}</strong></p>
        <ol>
          <li>${t('adminGuideStep1') || 'Activate factory painting mode for a year from the factory editor tab'}</li>
          <li>${t('adminGuideStep2') || 'Use R/P/N/W keys or toolbar buttons to paint shifts'}</li>
          <li>${t('adminGuideStep3') || 'Changes are saved locally as drafts'}</li>
          <li>${t('adminGuideStep4') || 'Export the year when ready to publish'}</li>
          <li>${t('adminGuideStep5') || 'Deploy the exported .js file to make it live for all users'}</li>
        </ol>
      </div>
      
      <h4>${t('keyboardShortcuts') || 'Keyboard Shortcuts'}</h4>
      <table style="width:100%; border-collapse:collapse; margin:12px 0;">
        <tr><td style="padding:8px; font-weight:bold;">R</td><td style="padding:8px;">${t('labelR') || 'Day shift'}</td></tr>
        <tr><td style="padding:8px; font-weight:bold;">P</td><td style="padding:8px;">${t('labelP') || 'Evening shift'}</td></tr>
        <tr><td style="padding:8px; font-weight:bold;">N</td><td style="padding:8px;">${t('labelN') || 'Night shift'}</td></tr>
        <tr><td style="padding:8px; font-weight:bold;">W</td><td style="padding:8px;">${t('labelW') || 'Day off'}</td></tr>
        <tr><td style="padding:8px; font-weight:bold;">← / →</td><td style="padding:8px;">${t('adminGuideNavigateMonth') || 'Navigate months'}</td></tr>
        <tr><td style="padding:8px; font-weight:bold;">E / Esc</td><td style="padding:8px;">${t('adminGuideExitEditor') || 'Exit editor'}</td></tr>
      </table>
      
      <h4>${t('adminExportTitle') || 'Export'}</h4>
      <p>${t('adminGuideExport') || 'Export factory schedules to create deployable .js files for all users.'}</p>
      
      <h4>${t('adminDangerZone') || 'Danger zone'}</h4>
      <p>${t('adminGuideDangerZone') || 'Use with caution - these actions cannot be easily undone.'}</p>
    </div>
  `;
}

/* === DANGER ZONE SECTION CONTENT === */

/**
 * Renders the danger zone section content
 * @returns {string} - HTML content for the danger zone tab
 */
function renderDangerZoneContent() {
  return `
    <div style="line-height:1.6;">
      <h3>${t('adminDangerZone') || 'Danger zone'}</h3>
      <p>${t('adminDangerZoneWarning') || 'These actions affect all users and cannot be easily undone.'}</p>
      
      <div style="background:var(--bg-warning); color:var(--text-warning); padding:12px; border-radius:8px; margin:12px 0; border-left:4px solid var(--text-warning);">
        <h4>${t('adminDangerZoneTitle') || '⚠️ Danger zone'}</h4>
        <p>${t('adminDangerZoneDesc') || 'Actions in this section can permanently affect data for all users.'}</p>
      </div>
      
      <h4>${t('factoryDraftResetAll') || 'Reset all drafts'}</h4>
      <p>${t('adminDangerZoneResetAllDesc') || 'Delete all factory schedule drafts for all years.'}</p>
      <button type="button" class="admin-danger-btn" id="adminResetAllDraftsBtn">
        ${t('factoryDraftResetAll') || 'Reset all drafts'}
      </button>
      
      <div style="margin-top:12px;">
        <h4>${t('factoryDraftClearYear') || 'Clear year draft'}</h4>
        <p>${t('adminDangerZoneClearYearDesc') || 'Delete factory schedule draft for a specific year.'}</p>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <input type="number" id="clearYearInput" min="2020" max="2030" value="${new Date().getFullYear()}" style="padding:8px; border:1px solid var(--border-cell); border-radius:4px; width:100px;">
          <button type="button" class="admin-danger-btn" id="adminClearDraftYearBtn">
            ${t('factoryDraftClearYear') || 'Clear year'}
          </button>
        </div>
      </div>
      

    </div>
  `;
}

function bindDangerZoneActions(root) {
  if (!root) return;

  const resetAllDraftsButton = root.querySelector(
    '#adminResetAllDraftsBtn'
  );
  if (resetAllDraftsButton) {
    resetAllDraftsButton.addEventListener(
      'click',
      handleResetAllDrafts
    );
  }

  const clearDraftYearButton = root.querySelector(
    '#adminClearDraftYearBtn'
  );
  if (clearDraftYearButton) {
    clearDraftYearButton.addEventListener(
      'click',
      handleClearYearDraft
    );
  }
}

/**
 * Handles resetting all factory drafts
 */
function handleResetAllDrafts() {
  if (!window.requireAdmin()) {
    showToast('error', t('adminRequired') || 'Admin access required');
    return;
  }
  
  showConfirm(
    t('factoryDraftResetAllTitle') || 'Reset all drafts?',
    t('factoryDraftResetAllBody') || 'This will delete ALL factory schedule drafts for ALL years. This action cannot be undone.',
    () => {
      window.resetFactoryDrafts();
      showToast('success', t('factoryDraftsReset') || 'All drafts reset');
      // Close any open factory editor
      if (factoryPaintActive) {
        deactivateFactoryPaintMode();
      }
      // Refresh views if needed
      if (typeof refreshViews === 'function') {
        refreshViews();
      }
    },
    { primaryText: t('factoryDraftResetAll') || 'Reset all', primaryClass: 'danger' }
  );
}

/**
 * Handles clearing a specific year's factory draft
 */
function handleClearYearDraft() {
  if (!window.requireAdmin()) {
    showToast('error', t('adminRequired') || 'Admin access required');
    return;
  }
  
  const yearInput = document.getElementById('clearYearInput');
  const year = parseInt(yearInput.value, 10);
  
  if (isNaN(year) || year < 2020 || year > 2030) {
    showToast('error', t('adminInvalidYear') || 'Please enter a valid year');
    return;
  }
  
  showConfirm(
    t('factoryDraftClearYearTitle', { year: year }) || `Clear the draft for ${year}?`,
    t('factoryDraftClearYearBody', { year: year }) || `This will delete the factory schedule draft for ${year}. This action cannot be undone.`,
    () => {
      window.clearFactoryDraftYear(year);
      showToast('success', t('factoryDraftClearYearSuccess', { year: year }) || `Draft for ${year} cleared`);
      // Close factory editor if it's for this year
      if (factoryPaintActive && factoryPaintYear === year) {
        deactivateFactoryPaintMode();
      }
      // Refresh views if needed
      if (typeof refreshViews === 'function') {
        refreshViews();
      }
    },
    { primaryText: t('factoryDraftClearYear') || 'Clear', primaryClass: 'danger' }
  );
}



/* === EXPOSE TO GLOBAL SCOPE === */

/**
 * Open the admin center panel
 * @returns {Object|null} - The panel screen object or null if failed
 */
function openAdminCenter() {
  if (!window.requireAdmin()) {
    showToast('error', t('adminRequired') || 'Admin access required');
    return null;
  }
  
  // Close factory editor if open when opening admin center
  if (factoryPaintActive) {
    deactivateFactoryPaintMode();
  }
  
  const panelHTML = `
    <div style="display:flex; flex-direction:column; height:100%;">
      <!-- Tabs -->
      <div style="display:flex; border-bottom:1px solid var(--border-cell);">
        <button class="admin-tab-btn${window.adminCenterActiveTab === 'factory' ? ' active' : ''}" 
                data-tab="factory" 
                style="flex:1; padding:12px; border:none; background:var(--bg-controls); color:var(--text-main); cursor:pointer;">
          ${t('factoryEditorTitle') || 'Factory editor'}
        </button>
        <button class="admin-tab-btn${window.adminCenterActiveTab === 'export' ? ' active' : ''}" 
                data-tab="export" 
                style="flex:1; padding:12px; border:none; background:var(--bg-controls); color:var(--text-main); cursor:pointer;">
          ${t('adminExportTitle') || 'Export'}
        </button>
        <button class="admin-tab-btn${window.adminCenterActiveTab === 'guide' ? ' active' : ''}" 
                data-tab="guide" 
                style="flex:1; padding:12px; border:none; background:var(--bg-controls); color:var(--text-main); cursor:pointer;">
          ${t('adminGuide') || 'Guide'}
        </button>
        <button class="admin-tab-btn${window.adminCenterActiveTab === 'danger' ? ' active' : ''}" 
                data-tab="danger" 
                style="flex:1; padding:12px; border:none; background:var(--bg-controls); color:var(--text-main); cursor:pointer;">
          ${t('adminDangerZone') || 'Danger zone'}
        </button>
      </div>
      
      <!-- Tab Content -->
      <div style="flex:1; overflow-y:auto; padding:16px;">
        <div id="adminCenterContent"></div>
      </div>
    </div>
  `;
  
  return window.openAppPanel({
    id: 'admin-center',
    title: t('adminCenterTitle') || 'Admin center',
    html: panelHTML,
    onMount: (bodyElement) => {
      // Initialize tab state
      window.adminCenterActiveTab = window.adminCenterActiveTab || 'factory';
      
      // Render initial content
      renderAdminCenterTab(window.adminCenterActiveTab, bodyElement);
      
      // Attach tab handlers
      const tabButtons = bodyElement.querySelectorAll('.admin-tab-btn');
      tabButtons.forEach(btn => {
        btn.onclick = (e) => {
          // Update active tab
          tabButtons.forEach(b => b.classList.remove('active'));
          e.target.classList.add('active');
          window.adminCenterActiveTab = e.target.dataset.tab;
          
          // Render tab content
          renderAdminCenterTab(window.adminCenterActiveTab, bodyElement);
        };
      });
    }
  });
}

/**
 * Renders the content for a specific admin center tab
 * @param {string} tabId - The tab ID to render ('factory', 'export', 'guide', 'danger')
 * @param {Object} bodyElement - The panel body element
 */
function renderAdminCenterTab(tabId, bodyElement) {
  const contentEl = bodyElement.querySelector('#adminCenterContent');
  if (!contentEl) return;
  
  switch (tabId) {
    case 'factory':
      contentEl.innerHTML = renderFactoryEditorTab();
      populateFactoryYearPicker(contentEl);
      bindFactoryEditorTab(contentEl);
      break;
    case 'export':
      contentEl.innerHTML = renderExportTab();
      populateExportYearList(contentEl);
      bindExportTab(contentEl);
      break;
    case 'guide':
      contentEl.innerHTML = renderGuideContent();
      break;
    case 'danger':
      contentEl.innerHTML = renderDangerZoneContent();
      bindDangerZoneActions(contentEl);
      break;
    default:
      contentEl.innerHTML = `<p>${t('adminCenterTabNotFound') || 'Tab not found'}</p>`;
  }
}

function bindFactoryEditorTab(root) {
  const startBtn = root.querySelector('#factoryStartEditBtn');
  if (startBtn) {
    startBtn.onclick = () => {
      const picker = root.querySelector('#factoryYearPicker');
      const year = picker ? parseInt(picker.value, 10) : new Date().getFullYear();
      if (!year || isNaN(year)) {
        showToast('error', t('adminInvalidYear') || 'Invalid year');
        return;
      }
      activateFactoryPaintMode(year);
      // Close admin panel so calendar is usable
      if (typeof closeAppPanel === 'function') closeAppPanel();
      else if (typeof window.closeAppPanel === 'function') window.closeAppPanel();
    };
  }
  const publishBtn = root.querySelector('#factoryPublishBtn');
  if (publishBtn) {
    publishBtn.onclick = () => {
      const picker = root.querySelector('#factoryYearPicker');
      const year = picker ? parseInt(picker.value, 10) : new Date().getFullYear();
      if (!year || isNaN(year)) {
        showToast('error', t('adminInvalidYear') || 'Invalid year');
        return;
      }
      publishFactoryScheduleYear(year);
    };
  }
  const exportBtn = root.querySelector('#factoryExportBtn');
  if (exportBtn) {
    exportBtn.onclick = () => {
      if (typeof exportFactorySchedule === 'function') exportFactorySchedule();
    };
  }
}

function bindExportTab(root) {
  const exportBtn = root.querySelector('#exportActionBtn');
  if (exportBtn) {
    exportBtn.onclick = () => {
      const year = window.selectedExportYear;
      if (year === undefined || year === null) {
        showToast('error', t('adminExportNoData') || 'No year selected');
        return;
      }
      generateAndDownloadDataJs(Number(year));
    };
  }
}

/**
 * Renders the factory editor tab content
 * @returns {string} - HTML content for the factory editor tab
 */
function renderFactoryEditorTab() {
  return `
    <div style="line-height:1.6;">
      <h3>${t('factoryEditorTitle') || 'Factory schedule editor'}</h3>
      <p>${t('factoryEditorDraftHint') || 'Changes are saved as a draft — the public factory schedule stays unchanged until you publish.'}</p>
      
      <div style="background:var(--bg-info); padding:12px; border-radius:8px; margin:12px 0;">
        <p><strong>${t('factoryEditorHowToUse') || 'How to use:'}</strong></p>
        <ol>
          <li>${t('factoryEditorStep1') || 'Select a year using the year picker below'}</li>
          <li>${t('factoryEditorStep2') || 'Click \\"Start editing\\" to activate factory painting mode'}</li>
          <li>${t('factoryEditorStep3') || 'Use R/P/N/W keys or toolbar buttons to paint shifts'}</li>
          <li>${t('factoryEditorStep4') || 'Changes are saved automatically as drafts'}</li>
          <li>${t('factoryEditorStep5') || 'When ready, click \\"Publish\\" — all users get the update immediately'}</li>
        </ol>
      </div>
      
      <div style="margin:16px 0;">
        <label for="factoryYearPicker" style="display:block; margin-bottom:8px; font-weight:600;">
          ${t('factoryEditorSelectYear') || 'Select year to edit:'}
        </label>
        <select id="factoryYearPicker" style="width:100%; padding:10px; border:1px solid var(--border-cell); border-radius:6px; font-size:16px;">
          <!-- Years will be populated by onMount -->
        </select>
      </div>
      
      <div style="display:flex; gap:12px; flex-wrap:wrap;">
        <button id="factoryStartEditBtn" class="modal-btn primary" style="padding:12px 24px;">
          ${t('factoryEditorStart') || 'Start editing'}
        </button>
        <button id="factoryPublishBtn" class="modal-btn primary" style="padding:12px 24px;">
          ${t('adminPublishBtn') || 'Publish'}
        </button>
        <button id="factoryExportBtn" class="modal-btn secondary" style="padding:12px 24px;">
          ${t('menuAdminExport') || 'Export .js'}
        </button>
      </div>
      
      </div>
  `;
}

/**
 * Renders the export tab content
 * @returns {string} - HTML content for the export tab
 */
function renderExportTab() {
  return `
    <div style="line-height:1.6;">
      <h3>${t('adminExportTitle') || 'Export'}</h3>
      <p>${t('adminExportDescription') || 'Export factory schedules to create deployable .js files for all users.'}</p>
      
      <div style="background:var(--bg-info); padding:12px; border-radius:8px; margin:12px 0;">
        <p><strong>${t('adminExportHowItWorks') || 'How it works:'}</strong></p>
        <ol>
          <li>${t('adminExportStep1') || 'Select a year from the list below'}</li>
          <li>${t('adminExportStep2') || 'Click \\"Export\\" to generate the .js file'}</li>
          <li>${t('adminExportStep3') || 'Follow the deployment instructions in the popup'}</li>
        </ol>
      </div>
      
      <div style="margin:16px 0;">
        <label for="exportYearList" style="display:block; margin-bottom:8px; font-weight:600;">
          ${t('adminExportSelectYear') || 'Select year to export:'}
        </label>
        <div id="exportYearList" style="max-height:300px; overflow-y:auto; border:1px solid var(--border-cell); border-radius:6px; padding:12px;">
          <!-- Years will be populated by onMount -->
        </div>
      </div>
      
      <div style="margin-top:16px;">
        <button id="exportActionBtn" class="modal-btn primary" style="padding:12px 24px;">
          ${t('menuAdminExport') || 'Export'}
        </button>
      </div>
    </div>
  `;
}

/* === PUBLISH TO CLOUDFLARE D1 (Phase 2) === */

/**
 * Admin API fetch with Google Bearer token.
 * SPEC: ADMIN_BACKEND_SPEC 15.2 — not driveFetch (Drive-only 401 logic).
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {boolean} [retried]
 * @returns {Promise<Response>}
 */
async function adminApiFetch(url, options, retried) {
  options = options || {};
  if (typeof ensureDriveToken !== 'function' || !(await ensureDriveToken(true))) {
    return new Response(JSON.stringify({ error: 'no_token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const token = localStorage.getItem('grafik_drive_token');
  if (!token) {
    return new Response(JSON.stringify({ error: 'no_token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const headers = Object.assign({}, options.headers || {}, {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json; charset=utf-8',
  });
  const resp = await fetch(url, Object.assign({}, options, { headers, cache: 'no-store' }));
  if (resp.status === 401 && !retried) {
    localStorage.removeItem('grafik_drive_token');
    localStorage.removeItem('grafik_drive_token_expiry');
    if (typeof ensureDriveToken === 'function') await ensureDriveToken(true);
    return adminApiFetch(url, options, true);
  }
  // Server asked for email scope — one interactive re-auth with forceIdentityScope
  if (resp.status === 403 && !retried) {
    let errBody = null;
    try {
      errBody = await resp.clone().json();
    } catch (_) {}
    if (errBody && errBody.error === 'email_scope_required' && typeof requestDriveAccessToken === 'function') {
      const ok = await requestDriveAccessToken({ interactive: true, forceIdentityScope: true });
      if (ok) return adminApiFetch(url, options, true);
    }
  }
  return resp;
}

/**
 * Current server revision for a year (from remote cache or 0).
 * @param {number} year
 * @returns {number}
 */
function getExpectedRevisionForYear(year) {
  try {
    const raw = localStorage.getItem('planzmian_remote_schedule_v1');
    if (raw) {
      const payload = JSON.parse(raw);
      const entry = payload && payload.years && (payload.years[String(year)] || payload.years[year]);
      if (entry && entry.revision != null) return Number(entry.revision) || 0;
    }
  } catch (_) {}
  return 0;
}

/**
 * Publish factory year (factory + admin drafts) to D1 via PUT /api/admin/schedule/:year.
 * @param {number} year
 */
async function publishFactoryScheduleYear(year) {
  if (!window.requireAdmin || !window.requireAdmin()) {
    showToast('error', t('adminRequired') || 'Admin access required');
    return;
  }

  // Drive feature must be on so ensureDriveToken can obtain a Google token
  const driveOn =
    typeof window.isDriveFeatureEnabled === 'function'
      ? window.isDriveFeatureEnabled()
      : localStorage.getItem('gillette_prefs_v1')
        ? (() => {
            try {
              return JSON.parse(localStorage.getItem('gillette_prefs_v1')).driveEnabled !== false;
            } catch (_) {
              return true;
            }
          })()
        : true;
  // Prefer explicit driveFeatureOn if exposed
  let featureOn = true;
  try {
    if (typeof driveFeatureOn === 'function') featureOn = driveFeatureOn();
  } catch (_) {}
  if (!featureOn && !driveOn) {
    showToast('error', t('adminPublishNeedDrive') || 'Enable Google sign-in (Drive backup) to publish');
    return;
  }

  const y = Number(year);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) {
    showToast('error', t('adminInvalidYear') || 'Invalid year');
    return;
  }

  const data = mergeFactoryWithCustom(y);
  const hours = calculateMonthHours(data);
  const expectedRevision = getExpectedRevisionForYear(y);

  // Normalize month keys to strings for the API
  const dataOut = {};
  const hoursOut = {};
  for (let m = 1; m <= 12; m++) {
    const mk = String(m);
    dataOut[mk] = data[m] || data[mk];
    hoursOut[mk] = hours[m] || hours[mk];
  }

  showToast('info', t('adminPublishInProgress') || 'Publishing…');

  try {
    const resp = await adminApiFetch('/api/admin/schedule/' + y, {
      method: 'PUT',
      body: JSON.stringify({
        data: dataOut,
        hours: hoursOut,
        expectedRevision: expectedRevision,
      }),
    });

    let body = null;
    try {
      body = await resp.json();
    } catch (_) {}

    if (resp.status === 200 && body) {
      showToast(
        'success',
        (t('adminPublishSuccess') || 'Published') +
          ` ${y} · rev ${body.revision}`
      );
      // Refresh remote schedule so this client and cache pick up the new revision
      try {
        if (typeof scheduleRemoteCheck === 'function') scheduleRemoteCheck(true);
        else if (typeof window.scheduleRemoteCheck === 'function') window.scheduleRemoteCheck(true);
        else {
          const r = await fetch('/api/schedule', { cache: 'no-store' });
          if (r.ok && typeof window.applyRemoteSchedulePayload === 'function') {
            const payload = await r.json();
            window.applyRemoteSchedulePayload(payload);
            try {
              localStorage.setItem(
                'planzmian_remote_schedule_v1',
                JSON.stringify({
                  scheduleId: payload.scheduleId,
                  generatedAt: payload.generatedAt,
                  years: payload.years,
                })
              );
            } catch (_) {}
          }
        }
      } catch (_) {}
      return;
    }

    if (resp.status === 409 && body && body.error === 'revision_conflict') {
      showToast(
        'error',
        (t('adminPublishConflict') || 'Revision conflict') +
          ` (server: ${body.currentRevision}). ` +
          (t('adminPublishConflictHint') || 'Refresh and try again.')
      );
      try {
        const r = await fetch('/api/schedule', { cache: 'no-store' });
        if (r.ok && typeof window.applyRemoteSchedulePayload === 'function') {
          window.applyRemoteSchedulePayload(await r.json());
        }
      } catch (_) {}
      return;
    }

    if (resp.status === 401) {
      showToast('error', t('adminPublishNeedLogin') || 'Sign in with Google to publish');
      return;
    }
    if (resp.status === 403) {
      const code = body && body.error;
      if (code === 'not_admin') {
        showToast('error', t('adminRequired') || 'Admin access required');
      } else if (code === 'email_scope_required') {
        showToast('error', t('adminPublishNeedEmailScope') || 'Re-sign in to grant email scope, then retry');
      } else {
        showToast('error', (t('adminPublishForbidden') || 'Forbidden') + (code ? `: ${code}` : ''));
      }
      return;
    }
    if (resp.status === 400 && body && body.error === 'validation') {
      const details = (body.details || []).slice(0, 3).join('; ');
      showToast('error', (t('adminPublishValidation') || 'Validation failed') + (details ? ': ' + details : ''));
      return;
    }

    showToast(
      'error',
      (t('adminPublishError') || 'Publish failed') +
        (body && body.error ? `: ${body.error}` : ` (${resp.status})`)
    );
  } catch (err) {
    console.warn('[admin-center] publish failed', err);
    showToast('error', (t('adminPublishError') || 'Publish failed') + ': ' + (err && err.message ? err.message : String(err)));
  }
}

/* === INITIALIZATION AND EVENT LISTENERS === */

// Initialize admin center state
window.adminCenterActiveTab = 'factory';


// Expose functions to global scope
window.activateFactoryPaintMode = activateFactoryPaintMode;
window.deactivateFactoryPaintMode = deactivateFactoryPaintMode;
window.activateFactoryPaintTool = activateFactoryPaintTool;
window.updateFactoryEditorContext = updateFactoryEditorContext;
window.syncFactoryPaintPeriodFromCalendar = syncFactoryPaintPeriodFromCalendar;
window.bindFactoryEditorBar = bindFactoryEditorBar;
window.handleFactoryPaintDayClick = handleFactoryPaintDayClick;
window.factoryPaintActive = factoryPaintActive;
window.factoryPaintMode = factoryPaintMode;
window.factoryPaintYear = factoryPaintYear;
window.factoryPaintMonth = factoryPaintMonth;
window.getFactoryScheduleForYear = getFactoryScheduleForYear;
window.getFactoryDraftForYear = getFactoryDraftForYear;
window.exportFactorySchedule = exportFactorySchedule;
window.publishFactoryScheduleYear = publishFactoryScheduleYear;
window.adminApiFetch = adminApiFetch;
window.openAdminCenter = openAdminCenter;
window.handleResetAllDrafts = handleResetAllDrafts;
window.handleClearYearDraft = handleClearYearDraft;

window.generateAndDownloadDataJs = generateAndDownloadDataJs;
window.mergeFactoryWithCustom = mergeFactoryWithCustom;

// Initialize factory paint mode state on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Populate year pickers when DOM is ready
    setTimeout(() => {
      populateFactoryYearPicker();
      populateExportYearList();
    }, 100);
  });
} else {
  // DOM already ready
  setTimeout(() => {
    populateFactoryYearPicker();
    populateExportYearList();
  }, 100);
}

/**
 * Populates the factory year picker dropdown
 */
function populateFactoryYearPicker(root) {
  const scope = root || document;
  const picker = scope.querySelector ? scope.querySelector('#factoryYearPicker') : document.getElementById('factoryYearPicker');
  if (!picker) return;
  
  const allYears = getAvailableScheduleYears();
  const currentYear = new Date().getFullYear();
  const futureYears = [];
  for (let y = currentYear; y <= currentYear + 5; y++) {
    futureYears.push(y);
  }
  // Always include recent past year for editing continuity
  futureYears.push(currentYear - 1);
  
  const yearsToShow = [...new Set([...allYears, ...futureYears])].sort((a, b) => a - b);
  
  picker.innerHTML = '';
  yearsToShow.forEach(year => {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = String(year);
    picker.appendChild(option);
  });
  
  // Prefer current year, else first available
  if (yearsToShow.includes(currentYear)) picker.value = String(currentYear);
  else if (yearsToShow.length) picker.value = String(yearsToShow[0]);
}

/**
 * Populates the export year list
 */
function populateExportYearList(root) {
  const scope = root || document;
  const listEl = scope.querySelector ? scope.querySelector('#exportYearList') : document.getElementById('exportYearList');
  if (!listEl) return;
  
  const fs = getFactoryScheduleObj();
  const cs = getCustomScheduleObj();
  const factoryYears = Object.keys(fs).map(Number);
  const customYears = Object.keys(cs).map(Number);
  const allYears = getAvailableScheduleYears();
  
  if (allYears.length === 0) {
    listEl.innerHTML = `<p style="color:var(--text-muted);">${t('adminExportNoData') || 'No data to export'}</p>`;
    return;
  }
  
  listEl.innerHTML = '';
  allYears.forEach(year => {
    const hasCustom = customYears.includes(year);
    const hasFactory = factoryYears.includes(year);
    const label = hasCustom && hasFactory ? `${year} ✏️` : hasCustom ? `${year} 🆕` : `${year}`;
    const title = hasCustom
      ? t('adminExportYearWithEdits') || 'Contains your edits'
      : t('adminExportYearFactory') || 'Factory data only';
    
    const yearEl = document.createElement('div');
    yearEl.className = 'export-year-item';
    yearEl.innerHTML = `
      <button type="button" class="export-year-btn" data-year="${year}" title="${title}" style="width:100%; text-align:left; padding:10px; margin:4px 0; border:1px solid var(--border-cell); background:var(--bg-cell); color:var(--text-main); border-radius:4px; cursor:pointer;">
        <span>${label}</span>
      </button>
    `;
    
    yearEl.querySelector('.export-year-btn').onclick = (ev) => {
      const btn = ev.currentTarget;
      listEl.querySelectorAll('.export-year-btn').forEach(b => {
        b.classList.toggle('active', b === btn);
        b.style.borderColor = b === btn ? 'var(--text-header)' : 'var(--border-cell)';
        b.style.background = b === btn ? 'var(--bg-controls)' : 'var(--bg-cell)';
      });
      window.selectedExportYear = year;
    };
    
    listEl.appendChild(yearEl);
  });
  
  if (allYears.length > 0) {
    const firstBtn = listEl.querySelector('.export-year-btn');
    if (firstBtn) {
      firstBtn.classList.add('active');
      firstBtn.style.borderColor = 'var(--text-header)';
      firstBtn.style.background = 'var(--bg-controls)';
      window.selectedExportYear = allYears[0];
    }
  }
}

// Override the export action button click to use selected year
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'exportActionBtn' && window.selectedExportYear !== undefined) {
    hideModal(); // Close admin center if open
    exportFactorySchedule(); // This will show its own year selection modal
  }
});

// Export functions for admin center tab rendering
window.renderAdminCenterTab = renderAdminCenterTab;
window.openAdminCenter = openAdminCenter;