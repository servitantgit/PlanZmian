/* ================================================================
   PLAN ZMIAN — Module 5: DASHBOARD
   ================================================================ */

/**
 * Resolves the shift context that is actually active right now on the
 * Dashboard. After midnight, when yesterday's N shift is still running
 * (normally until 06:00, later when personal "po" overtime exists and
 * Privacy Mode is off), the active context stays on yesterday's N so the
 * Dashboard card and handoff flow do not switch to today's scheduled shift
 * before the previous N shift actually ends.
 *
 * The preference `prefs.nightShiftDisplayPreviousDay` controls only the
 * DATE shown on the card for that ongoing N shift — it never changes which
 * shift is treated as active.
 *
 * Note: getLiveTimer() is intentionally not called here — renderDashboard()
 * keeps its real-current-date timer call (based on y/m/d) so the existing
 * overnight timer handling keeps working unchanged.
 *
 * @param {Date} [nowArg] - optional "now" (used for tests/manual mocking)
 * @returns {{
 *   activeYear: number, activeMonth: number, activeDay: number,
 *   activeShift: string, activeOnUrlop: boolean, isPreviousDayNight: boolean,
 *   displayYear: number, displayMonth: number, displayDay: number
 * }}
 */
function getActiveDashboardShiftContext(nowArg) {
  const now = nowArg || new Date();
  const y = now.getFullYear(),
    m = now.getMonth() + 1,
    d = now.getDate();
  const hidePrivate = !shouldShowPersonalData();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Read today's shift with exactly the same privacy logic as the Dashboard.
  let shiftCode, onUrlop;
  if (hidePrivate) {
    shiftCode =
      factorySchedule[y] && factorySchedule[y][m] && factorySchedule[y][m][selectedShift]
        ? factorySchedule[y][m][selectedShift][d - 1]
        : '';
    onUrlop = false;
  } else {
    shiftCode = getShiftAtWithPending(y, m, d, selectedShift);
    onUrlop = isUrlop(y, m, d, selectedShift);
  }

  // Default context: real current date, today's shift, no night override.
  let activeYear = y,
    activeMonth = m,
    activeDay = d;
  let activeShift = shiftCode;
  let activeOnUrlop = onUrlop;
  let isPreviousDayNight = false;
  let displayYear = y,
    displayMonth = m,
    displayDay = d;

  // Detect an ongoing previous-day N shift (after midnight, before its end).
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yY = yesterday.getFullYear(),
    yM = yesterday.getMonth() + 1,
    yD = yesterday.getDate();

  let yShift;
  if (hidePrivate) {
    yShift =
      factorySchedule[yY] && factorySchedule[yY][yM] && factorySchedule[yY][yM][selectedShift]
        ? factorySchedule[yY][yM][selectedShift][yD - 1]
        : '';
  } else {
    yShift = getShiftAtWithPending(yY, yM, yD, selectedShift);
  }

  let yVacation = false;
  if (!hidePrivate) yVacation = isUrlop(yY, yM, yD, selectedShift);

  if (yShift === 'N' && !yVacation) {
    let yEndMin = 6 * 60; // base end 06:00
    if (!hidePrivate) {
      // Personal "po" overtime extends the active N only outside Privacy Mode.
      const yOT = getOvertimes(yY, yM, yD, selectedShift);
      if (yOT && yOT.po && typeof yOT.po.hours === 'number' && isFinite(yOT.po.hours) && yOT.po.hours > 0) {
        yEndMin += yOT.po.hours * 60;
      }
    }

    if (nowMinutes < yEndMin) {
      activeYear = yY;
      activeMonth = yM;
      activeDay = yD;
      activeShift = 'N';
      activeOnUrlop = false;
      isPreviousDayNight = true;

      // The preference changes only the date shown, never the active shift.
      if (prefs.nightShiftDisplayPreviousDay !== false) {
        displayYear = yY;
        displayMonth = yM;
        displayDay = yD;
      }
    }
  }

  return {
    activeYear,
    activeMonth,
    activeDay,
    activeShift,
    activeOnUrlop,
    isPreviousDayNight,
    displayYear,
    displayMonth,
    displayDay,
  };
}

function renderDashboard() {
  const dv = document.getElementById('dashboardView');
  const today = new Date();
  const y = today.getFullYear(),
    m = today.getMonth() + 1,
    d = today.getDate();
  const limit = getVacationLimit(selectedShift);
  const yHolidays = buildHolidays(y);
  const hidePrivate = !shouldShowPersonalData();

  // Active shift context — after midnight this stays on yesterday's still
  // running N shift for the card and the handoff flow.
  const activeContext = getActiveDashboardShiftContext(today);
  const shiftCode = activeContext.activeShift;
  const onUrlop = activeContext.activeOnUrlop;

  // Date text shown on the current-shift card. Only this follows the
  // nightShiftDisplayPreviousDay preference — the active shift is never
  // affected by it.
  const displayDate = new Date(activeContext.displayYear, activeContext.displayMonth - 1, activeContext.displayDay);
  const displayDayName = dayNamesFull[displayDate.getDay()];

  const holidayName = yHolidays[m + '-' + d];

  // === Compact flow: prev → today → next → tomorrow (no full cycle) ===
  let reliefFlowCard = '';
  if (!isWolne(shiftCode) && !onUrlop && typeof tlRenderNode === 'function') {
    const info = getRelief(activeContext.activeYear, activeContext.activeMonth, activeContext.activeDay, selectedShift, shiftCode);
    const nodes = [];
    // 1) Who we take over from
    if (info && info.prevBrig) {
      const prevLabel =
        typeof tlFormatWhen === 'function'
          ? tlFormatWhen(info.prevYear, info.prevMonth, info.prevDay, y, m, d)
          : '';
      nodes.push(
        tlRenderNode({
          brig: info.prevBrig,
          shift: info.prevType || null,
          label: prevLabel,
        })
      );
    } else {
      nodes.push(tlRenderNode({ type: 'empty', label: '' }));
    }
    nodes.push(typeof tlRenderArrow === 'function' ? tlRenderArrow() : '<span class="tl-arrow">→</span>');
    // 2) Today (self)
    nodes.push(
      tlRenderNode({
        type: 'self',
        brig: String(activeContext.activeDay),
        shift: shiftCode,
        label:
          typeof t === 'function'
            ? t(activeContext.isPreviousDayNight ? 'tlYesterday' : 'tlToday')
            : activeContext.isPreviousDayNight
              ? 'вчора'
              : 'сьогодні',
        isSelf: true,
      })
    );
    nodes.push(typeof tlRenderArrow === 'function' ? tlRenderArrow() : '<span class="tl-arrow">→</span>');
    // 3) Who takes over from us
    if (info && info.nextBrig) {
      const nextLabel =
        typeof tlFormatWhen === 'function'
          ? tlFormatWhen(info.nextYear, info.nextMonth, info.nextDay, y, m, d)
          : '';
      nodes.push(
        tlRenderNode({
          brig: info.nextBrig,
          shift: info.nextType || null,
          label: nextLabel,
        })
      );
    } else {
      nodes.push(tlRenderNode({ type: 'empty', label: '' }));
    }
    nodes.push(typeof tlRenderArrow === 'function' ? tlRenderArrow() : '<span class="tl-arrow">→</span>');
    // 4) Own shift tomorrow
    const tom = new Date(today);
    tom.setDate(today.getDate() + 1);
    const ty = tom.getFullYear(),
      tm = tom.getMonth() + 1,
      td = tom.getDate();
    let tShift, tUrlop;
    if (hidePrivate) {
      tShift =
        factorySchedule[ty] && factorySchedule[ty][tm] && factorySchedule[ty][tm][selectedShift]
          ? factorySchedule[ty][tm][selectedShift][td - 1]
          : '';
      tUrlop = false;
    } else {
      tShift = getShiftAtWithPending(ty, tm, td, selectedShift);
      tUrlop = isUrlop(ty, tm, td, selectedShift);
    }
    const tomLabel = typeof t === 'function' ? t('tlTomorrow') : 'завтра';
    if (tUrlop) {
      nodes.push(tlRenderNode({ type: 'free', label: tomLabel, brig: '🌴' }));
    } else if (isWolne(tShift)) {
      nodes.push(tlRenderNode({ type: 'free', label: tomLabel }));
    } else {
      nodes.push(
        tlRenderNode({
          brig: String(td),
          shift: tShift,
          label: tomLabel,
        })
      );
    }
    reliefFlowCard = `
      <div class="info-card flow-segment-card" style="grid-column:1/-1;">
        <div class="label">🔄 ${t('reliefFlowTitle')}</div>
        <div class="value"><div class="timeline-widget">${nodes.join('')}</div></div>
      </div>`;
  }

  let todayCard = '';
  let cardCls = '';
  if (onUrlop) {
    cardCls = 'card-U';
    todayCard = `
      <div class="dtc-meta">${displayDayName}, ${activeContext.displayDay} ${monthNamesGenitive[activeContext.displayMonth - 1]} ${activeContext.displayYear} · ${t('brigade')} ${selectedShift}</div>
      <div class="dtc-label">${t('todayLabel')}</div>
      <div class="dtc-shift">${t('infoUrlop')}</div>
    `;
  } else if (isWolne(shiftCode)) {
    cardCls = 'card-W';
    todayCard = `
    <div class="dtc-meta">${displayDayName}, ${activeContext.displayDay} ${monthNamesGenitive[activeContext.displayMonth - 1]} ${activeContext.displayYear} · ${t('brigade')} ${selectedShift}</div>
    <div class="dtc-label">${t('todayLabel')}</div>
    <div class="dtc-shift">${t('infoFree')}</div>
  `;
  } else {
    cardCls = 'card-' + shiftCode;
    const [sh, eh] = shiftHours[shiftCode];
    let startTxt = `${String(sh).padStart(2, '0')}:00`;
    let endTxt = `${String(eh % 24).padStart(2, '0')}:00`;
    // Live timer keeps the real current calendar date (y, m, d) so its
    // existing overnight previous-N handling continues to work unchanged.
    const timer = hidePrivate ? null : getLiveTimer(shiftCode, y, m, d);

    // Nadgodziny - tylko gdy zalogowany; brane z faktycznie aktywnej zmiany
    let otInfo = '';
    if (!hidePrivate) {
      const otActive = getOvertimes(activeContext.activeYear, activeContext.activeMonth, activeContext.activeDay, selectedShift);
      if (otActive.przed || otActive.po) {
        const actualTime = getActualWorkTime(activeContext.activeYear, activeContext.activeMonth, activeContext.activeDay, selectedShift, shiftCode);
        const parts = [];
        if (otActive.przed) {
          const cat = categorizeOvertime(activeContext.activeYear, activeContext.activeMonth, activeContext.activeDay, shiftCode, 'przed', otActive.przed.hours);
          const dom = cat.h200 > 0 ? '+200%' : cat.h100 > 0 ? '+100%' : '+50%';
          parts.push(`⬅ ${formatDurationHoursI18n(otActive.przed.hours)} ${dom}`);
        }
        if (otActive.po) {
          const cat = categorizeOvertime(activeContext.activeYear, activeContext.activeMonth, activeContext.activeDay, shiftCode, 'po', otActive.po.hours);
          const dom = cat.h200 > 0 ? '+200%' : cat.h100 > 0 ? '+100%' : '+50%';
          parts.push(`${formatDurationHoursI18n(otActive.po.hours)} ${dom} ➡`);
        }
        otInfo = `<div class="advanced-only" style="margin-top:8px; padding:8px 12px; background:rgba(0,0,0,0.35); border-radius:8px; font-size:13px; font-weight:600; color:#fff;">${t('infoOvertime')}: ${parts.join(' · ')}<br><span style="font-size:12px; font-weight:700; color:#fff;">${t('infoTime')} ${actualTime}</span></div>`;
      }
    }

    todayCard = `
      <div class="dtc-meta">${displayDayName}, ${activeContext.displayDay} ${monthNamesGenitive[activeContext.displayMonth - 1]} ${activeContext.displayYear} · ${t('brigade')} ${selectedShift}</div>
      <div class="dtc-label">${t('todayLabel')} ${holidayName ? '· 🎉 ' + holidayName : ''}</div>
      <div class="dtc-shift">${shiftEmoji[shiftCode]} ${shiftFullName[shiftCode].split(' ')[0]}</div>
      <div class="dtc-time">${startTxt} – ${endTxt}</div>
      ${otInfo}
      ${timer ? `<div class="dtc-timer">${timer}</div>` : ''}
    `;
  }

  const usedUrlop = hidePrivate ? 0 : (typeof getTotalUsedVacation === 'function' ? getTotalUsedVacation(y, selectedShift) : countWorkingUrlops(y, selectedShift));

  const otMonthSum = hidePrivate
    ? { h50: 0, h100: 0, h200: 0 }
    : getMonthOvertimeSummary(y, m, selectedShift);
  const totalOT = otMonthSum.h50 + otMonthSum.h100 + otMonthSum.h200;

  let upcomingHtml = '';
  for (let i = 1; i <= 7; i++) {
    const dt = new Date(today);
    dt.setDate(today.getDate() + i);
    const yy = dt.getFullYear(),
      mm = dt.getMonth() + 1,
      dd = dt.getDate();

    let s, onU;
    if (hidePrivate) {
      s =
        factorySchedule[yy] && factorySchedule[yy][mm] && factorySchedule[yy][mm][selectedShift]
          ? factorySchedule[yy][mm][selectedShift][dd - 1]
          : '';
      onU = false;
    } else {
      s = getShiftAtWithPending(yy, mm, dd, selectedShift);
      onU = isUrlop(yy, mm, dd, selectedShift);
    }

    const cls = onU ? 'U' : isWolne(s) ? 'W' : s;
    const label = onU ? '🌴' : isWolne(s) ? '🏖' : s;
    let otBadge = '';
    if (!hidePrivate) {
      const otChip = getOvertimes(yy, mm, dd, selectedShift);
      const hasOT = (otChip.przed || otChip.po) && !isWolne(s) && !onU;
      otBadge = hasOT ? '<span class="ddc-ot">⏱</span>' : '';
    }
    upcomingHtml += `
      <div class="dash-day-chip chip-${cls}" onclick="jumpToDate(${yy},${mm},${dd})">
        <div class="ddc-day">${String(dayNames[(dt.getDay() + 6) % 7] || '').slice(0, 2)}</div>
        <div class="ddc-date">${dd}</div>
        <div class="ddc-shift">${label}</div>
        ${otBadge}
      </div>
    `;
  }

  const vacationCard = hidePrivate
    ? ''
    : `
      <div class="dash-stat-card dash-vacation-stats advanced-only">
        <div class="dsc-icon">🌴</div>
        <div class="dsc-info">
          <div class="dsc-label">${t('vacation')} ${y}</div>
          <div class="dsc-value">${t('vacationStatsFormat', { left: Math.max(0, limit - usedUrlop), used: usedUrlop, limit: limit })}</div>
        </div>
      </div>`;

  const overtimeCard =
    !hidePrivate && totalOT > 0
      ? `
      <div class="dash-stat-card dash-overtime-summary advanced-only" style="border:2px solid #f1c40f;">
        <div class="dsc-icon">⏱</div>
        <div class="dsc-info">
          <div class="dsc-label">${t('infoOvertime')} (${monthNamesShort[m - 1]})</div>
          <div class="dsc-value">${formatDurationHoursI18n(totalOT)} <small>(${formatDurationHoursI18n(otMonthSum.h50)}+${formatDurationHoursI18n(otMonthSum.h100)}+${formatDurationHoursI18n(otMonthSum.h200)})</small></div>
        </div>
      </div>`
      : '';

  dv.innerHTML = `
    <div class="dash-today-card ${cardCls}">
      ${todayCard}
    </div>

    ${reliefFlowCard ? `<div class="dash-flow-wrap">${reliefFlowCard}</div>` : ''}

    <div class="dash-upcoming">
      <h4>${t('upcomingDays')}</h4>
      <div class="dash-upcoming-list">${upcomingHtml}</div>
    </div>

    <div class="dash-stats">
      ${overtimeCard}
      ${vacationCard}
    </div>
  `;

}

function jumpToDate(y, m, d) {
  currentYear = y;
  currentMonth = m;
  selectedDay = d;
  switchView('month');
}
window.jumpToDate = jumpToDate;

function getLiveTimer(shift, y, m, d) {
  // Live timer shows personal overtime adjustments — only when logged in
  if (!shouldShowPersonalData()) return null;

  const now = new Date();
  if (now.getFullYear() !== y || now.getMonth() + 1 !== m || now.getDate() !== d) return null;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // === SPECIAL CASE: night shift continuing after midnight ===
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yY = yesterday.getFullYear();
  const yM = yesterday.getMonth() + 1;
  const yD = yesterday.getDate();
  const yShift = getShiftAt(yY, yM, yD, selectedShift);

  if (yShift === 'N' && !isUrlop(yY, yM, yD, selectedShift)) {
    const yOT = getOvertimes(yY, yM, yD, selectedShift);
    let yEndMin = 6 * 60;

    if (
      yOT.po &&
      typeof yOT.po.hours === 'number' &&
      Number.isFinite(yOT.po.hours) &&
      yOT.po.hours > 0
    ) {
      yEndMin += yOT.po.hours * 60;
    }

    if (nowMinutes < yEndMin) {
      const rem = yEndMin - nowMinutes;
      return t('timerNightEndsIn', { h: Math.floor(rem / 60), m: rem % 60 });
    }
  }

  // === NORMAL LOGIC: shift starts/is ongoing today ===
  if (!shift || isWolne(shift)) return null;

  let startMin, endMin;
  const ot = getOvertimes(y, m, d, selectedShift);

  if (shift === 'R') {
    startMin = 6 * 60;
    endMin = 14 * 60;
  } else if (shift === 'P') {
    startMin = 14 * 60;
    endMin = 22 * 60;
  } else if (shift === 'N') {
    startMin = 22 * 60;
    endMin = 30 * 60;
  } else return null;

  if (ot.przed) startMin -= ot.przed.hours * 60;
  if (ot.po) endMin += ot.po.hours * 60;

  if (nowMinutes >= startMin && nowMinutes < endMin) {
    const rem = endMin - nowMinutes;
    return t('timerEndsIn', { h: Math.floor(rem / 60), m: rem % 60 });
  }

  if (nowMinutes < startMin && startMin - nowMinutes <= 60) {
    return t('timerStartsIn', { m: startMin - nowMinutes });
  }

  return null;
}
