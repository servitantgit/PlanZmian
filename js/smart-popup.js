/* ================================================================
   PLAN ZMIAN - SMART-POPUP.JS
   Timeline widgets: handoff flow + cycle-to-free (segment modes)
   ================================================================ */

const TL_SHIFT_ICONS = {
  R: '🌅',
  P: '🌤',
  N: '🌙',
  W: '💤',
  U: '🏖️',
};

function tlFormatWhen(year, month, day, currentYear, currentMonth, currentDay) {
  if (year === currentYear && month === currentMonth) {
    if (day === currentDay) {
      return typeof t === 'function' ? t('tlToday') : 'dziś';
    }
    if (day === currentDay - 1) {
      return typeof t === 'function' ? t('tlYesterday') : 'wcz.';
    }
    if (day === currentDay + 1) {
      return typeof t === 'function' ? t('tlTomorrow') : 'jutro';
    }
  }
  return day + '.' + month;
}

function tlRenderNode(config) {
  const {
    type = 'shift',
    brig = null,
    shift = null,
    label = '',
    value = null,
    otPercent = null,
    isSelf = false,
    extraClass = '',
  } = config;

  const classes = ['tl-node'];
  if (extraClass) classes.push(extraClass);
  let content = '';

  if (type === 'empty') {
    classes.push('tl-empty');
    content = `<div class="tl-brig">—</div>`;
    if (label) content += `<div class="tl-label">${label}</div>`;
  } else if (type === 'ot') {
    if (otPercent === 50) classes.push('tl-ot-50');
    else if (otPercent === 100) classes.push('tl-ot-100');
    else classes.push('tl-ot');
    // Compact timeline via duration contract (1 decimal, e.g. 4h 41m → 4.7h)
    const display =
      typeof formatHoursCompact === 'function' ? formatHoursCompact(value) : value + 'h';
    content = `<div class="tl-value">${display}</div>`;
    if (otPercent != null) content += `<div class="tl-label">+${otPercent}%</div>`;
  } else if (type === 'free') {
    classes.push('tl-free');
    content = `<div class="tl-brig">🏖️</div>`;
    if (label) content += `<div class="tl-label">${label}</div>`;
  } else if (type === 'self' || isSelf) {
    if (shift) classes.push('tl-shift-' + shift);
    classes.push('tl-self');
    content = `<div class="tl-brig">${brig != null ? brig : '—'}</div>`;
    if (shift && TL_SHIFT_ICONS[shift]) {
      content += `<div class="tl-icon">${TL_SHIFT_ICONS[shift]}</div>`;
    }
    if (label) content += `<div class="tl-label">${label}</div>`;
  } else {
    if (shift) classes.push('tl-shift-' + shift);
    content = `<div class="tl-brig">${brig || '—'}</div>`;
    if (shift && TL_SHIFT_ICONS[shift]) {
      content += `<div class="tl-icon">${TL_SHIFT_ICONS[shift]}</div>`;
    }
    if (label) content += `<div class="tl-label">${label}</div>`;
  }

  return `<div class="${classes.join(' ')}">${content}</div>`;
}

function tlRenderArrow() {
  return `<div class="tl-arrow">→</div>`;
}

/**
 * Handoff flow: prev → [OT before] → day+shift → [OT after] → next
 */
function renderReliefTimeline(
  info,
  currentYear,
  currentMonth,
  currentDay,
  currentShift,
  currentBrigade,
  otData
) {
  let otBefore = null;
  let otAfter = null;
  if (otData) {
    if (otData.before || otData.after) {
      otBefore = otData.before || null;
      otAfter = otData.after || null;
    } else if (otData.hours > 0) {
      otAfter = { hours: otData.hours, percent: otData.percent || 200 };
    }
  }

  const parts = [];

  if (info && info.prevBrig) {
    parts.push(
      tlRenderNode({
        type: 'shift',
        brig: info.prevBrig,
        shift: info.prevType,
        label: tlFormatWhen(
          info.prevYear,
          info.prevMonth,
          info.prevDay,
          currentYear,
          currentMonth,
          currentDay
        ),
      })
    );
  } else {
    parts.push(tlRenderNode({ type: 'empty', label: '—' }));
  }

  if (otBefore && otBefore.hours > 0) {
    parts.push(tlRenderArrow());
    parts.push(
      tlRenderNode({
        type: 'ot',
        value: otBefore.hours,
        otPercent: otBefore.percent || 200,
      })
    );
  }

  parts.push(tlRenderArrow());
  parts.push(
    tlRenderNode({
      type: 'self',
      brig: String(currentDay),
      shift: currentShift,
      label: currentShift || '',
      isSelf: true,
    })
  );

  if (otAfter && otAfter.hours > 0) {
    parts.push(tlRenderArrow());
    parts.push(
      tlRenderNode({
        type: 'ot',
        value: otAfter.hours,
        otPercent: otAfter.percent || 200,
      })
    );
  }

  parts.push(tlRenderArrow());

  if (info && info.nextBrig) {
    parts.push(
      tlRenderNode({
        type: 'shift',
        brig: info.nextBrig,
        shift: info.nextType,
        label: tlFormatWhen(
          info.nextYear,
          info.nextMonth,
          info.nextDay,
          currentYear,
          currentMonth,
          currentDay
        ),
      })
    );
  } else {
    parts.push(tlRenderNode({ type: 'empty', label: '—' }));
  }

  return `<div class="timeline-widget">${parts.join('')}</div>`;
}

/**
 * Cycle path: own shifts until free day
 * @param {Object} path - from getCyclePath()
 * @param {number} currentYear
 * @param {number} currentMonth
 * @param {number} currentDay
 */
function renderCycleTimeline(path, currentYear, currentMonth, currentDay) {
  if (!path || ((!path.steps || !path.steps.length) && !path.free)) {
    return `<div class="timeline-widget"><div class="tl-node tl-empty"><div class="tl-brig">—</div><div class="tl-label">${typeof t === 'function' ? t('infoFree') : '—'}</div></div></div>`;
  }
  if (!path.steps) path.steps = [];

  const parts = [];
  path.steps.forEach((step, idx) => {
    if (idx > 0) parts.push(tlRenderArrow());
    parts.push(
      tlRenderNode({
        type: step.isSelf ? 'self' : 'shift',
        brig: String(step.day),
        shift: step.shift,
        label: step.shift || '',
        isSelf: !!step.isSelf,
      })
    );
  });

  parts.push(tlRenderArrow());
  if (path.free) {
    const freeLabel = tlFormatWhen(
      path.free.year,
      path.free.month,
      path.free.day,
      currentYear,
      currentMonth,
      currentDay
    );
    parts.push(
      tlRenderNode({
        type: 'free',
        label: freeLabel,
      })
    );
  } else {
    parts.push(tlRenderNode({ type: 'empty', label: '—' }));
  }

  return `<div class="timeline-widget">${parts.join('')}</div>`;
}

/**
 * Segmented control: Handoff | Until free
 * Returns HTML; bindFlowSegmentToggle() wires clicks after insert.
 */
function renderFlowSegmentWidget(opts) {
  const {
    handoffHtml,
    cycleHtml,
    defaultMode, // 'handoff' | 'cycle'
  } = opts;
  const mode = defaultMode === 'cycle' ? 'cycle' : 'handoff';
  const handoffLabel = typeof t === 'function' ? t('flowModeHandoff') : 'Передача';
  const cycleLabel = typeof t === 'function' ? t('flowModeCycle') : 'До вільного';
  const title =
    typeof t === 'function' ? t('reliefFlowTitle') : 'Flow передачі зміни';

  return `
  <div class="info-card flow-segment-card" style="grid-column:1/-1;" data-flow-root>
    <div class="label">🔄 ${title}</div>
    <div class="flow-segment-tabs" role="tablist">
      <button type="button" class="flow-seg-btn${mode === 'handoff' ? ' active' : ''}" data-flow-mode="handoff" role="tab" aria-selected="${mode === 'handoff'}">${handoffLabel}</button>
      <button type="button" class="flow-seg-btn${mode === 'cycle' ? ' active' : ''}" data-flow-mode="cycle" role="tab" aria-selected="${mode === 'cycle'}">${cycleLabel}</button>
    </div>
    <div class="value flow-seg-panel" data-flow-panel="handoff" style="${mode === 'handoff' ? '' : 'display:none;'}">${handoffHtml}</div>
    <div class="value flow-seg-panel" data-flow-panel="cycle" style="${mode === 'cycle' ? '' : 'display:none;'}">${cycleHtml}</div>
  </div>`;
}

function bindFlowSegmentToggle(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-flow-root]').forEach((card) => {
    if (card.dataset.flowBound === '1') return;
    card.dataset.flowBound = '1';
    card.querySelectorAll('.flow-seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-flow-mode');
        card.querySelectorAll('.flow-seg-btn').forEach((b) => {
          const on = b.getAttribute('data-flow-mode') === mode;
          b.classList.toggle('active', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        card.querySelectorAll('.flow-seg-panel').forEach((p) => {
          p.style.display = p.getAttribute('data-flow-panel') === mode ? '' : 'none';
        });
      });
    });
  });
}

window.renderReliefTimeline = renderReliefTimeline;
window.renderCycleTimeline = renderCycleTimeline;
window.renderFlowSegmentWidget = renderFlowSegmentWidget;
window.bindFlowSegmentToggle = bindFlowSegmentToggle;
window.tlFormatWhen = tlFormatWhen;
window.tlRenderNode = tlRenderNode;
