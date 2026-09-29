/* ================================================================
    PLAN ZMIAN — Module 7: VIEWS (YEAR, TABLE)
    ================================================================ */

/* === YEAR VIEW === */
function renderYearView() {
  const yv = document.getElementById('yearView');
  yv.innerHTML = '';
  const today = new Date();
  const yHolidays = buildHolidays(currentYear);
  const hidePrivate = !shouldShowPersonalData();
  for (let m = 1; m <= 12; m++) {
    const wrap = document.createElement('div');
    wrap.className = 'year-month';
    wrap.innerHTML = `<h4>${monthNames[m - 1]}</h4>`;
    const mini = document.createElement('div');
    mini.className = 'mini-calendar';
    dayNames.forEach((d, wi) => {
      const h = document.createElement('div');
      h.className = 'mini-weekday' + (wi >= 5 ? ' mini-weekend' : '');
      h.textContent = d[0];
      mini.appendChild(h);
    });
    const first = new Date(currentYear, m - 1, 1);
    let sd = first.getDay();
    sd = sd === 0 ? 6 : sd - 1;
    const dim = daysInMonthCal(currentYear, m);
    for (let i = 0; i < sd; i++) {
      const e = document.createElement('div');
      e.className = 'mini-day mE';
      mini.appendChild(e);
    }
    for (let d = 1; d <= dim; d++) {
      let s = getShiftAtWithPending(currentYear, m, d, selectedShift);
      let onU = isUrlop(currentYear, m, d, selectedShift);
      
      if (hidePrivate) {
        s =
          factorySchedule[currentYear] &&
          factorySchedule[currentYear][m] &&
          factorySchedule[currentYear][m][selectedShift]
            ? factorySchedule[currentYear][m][selectedShift][d - 1]
            : '';
        onU = false;

      }
      const cls = onU ? 'U' : isWolne(s) ? 'W' : s;
      const el = document.createElement('div');
el.className = 'mini-day m' + cls;
      el.textContent = d;
      const dowY = new Date(currentYear, m - 1, d).getDay();
      if (dowY === 0 || dowY === 6) el.classList.add('mWeekend');
      if (
        today.getFullYear() === currentYear &&
        today.getMonth() + 1 === m &&
        today.getDate() === d
      )
        el.classList.add('mToday');
      if (yHolidays[m + '-' + d]) el.classList.add('mHoliday');
      el.title = `${d} ${monthNamesGenitive[m - 1]}: ${onU ? '🌴 ' + t('vacation') : shiftFullName[s] || t('dayOff')}`;
      el.onclick = (ev) => {
        ev.stopPropagation();

        // Preserve the current brigade in Year view.
        // Factory painting uses the month represented by this mini-calendar.
        if (
          typeof factoryPaintActive !== 'undefined' &&
          factoryPaintActive &&
          factoryPaintYear === currentYear &&
          factoryPaintMonth === m
        ) {
          const val = factoryPaintMode === 'W' ? '' : factoryPaintMode;
          if (typeof window.handleFactoryPaintDayClick === 'function') {
            window.handleFactoryPaintDayClick(currentYear, m, d, selectedShift, val);
          }
          refreshViews();
          return;
        }

        currentMonth = m;
        selectedDay = d;
        yearMode = false;
        prefs.shift = selectedShift;
        prefs.yearMode = false;
        savePrefs(prefs);
        updateShiftButtons();
        switchView('month');
      };
      mini.appendChild(el);
    }
    wrap.appendChild(mini);
    wrap.onclick = () => {
      
      currentMonth = m;
      yearMode = false;
      prefs.yearMode = false;
      savePrefs(prefs);
      const yt = document.getElementById('yearToggle');
      if (yt) yt.checked = false;
      const ytl = document.getElementById('yearToggleLabel');
      if (ytl) ytl.classList.remove('active');
      switchView('month');
    };
    yv.appendChild(wrap);
  }
}

/* === TABLE VIEW === */
function renderTableView(showAllYear) {
  const tv = document.getElementById('tableView');
  tv.innerHTML = '';
  if (showAllYear) {
    const wrap = document.createElement('div');
    wrap.className = 'table-year-wrap';
    for (let m = 1; m <= 12; m++) {
      const block = document.createElement('div');
      block.className = 'table-month-block';
      const h = document.createElement('h3');
      h.className = 'table-month-title';
      h.textContent = `${monthNames[m - 1]} ${currentYear}`;
      block.appendChild(h);
      const scroll = document.createElement('div');
      scroll.className = 'table-scroll';
      scroll.appendChild(buildMonthTable(m));
      block.appendChild(scroll);
      wrap.appendChild(block);
    }
    tv.appendChild(wrap);
  } else {
    const scroll = document.createElement('div');
    scroll.className = 'table-scroll';
    scroll.appendChild(buildMonthTable(currentMonth));
    tv.appendChild(scroll);
  }

  const leg = document.createElement('div');
  leg.className = 'table-legend';
  leg.innerHTML = `<span class="tl-R">🌅 R</span><span class="tl-P">🌤️ P</span><span class="tl-N">🌙 N</span><span class="tl-W">— W</span><span class="tl-U">🌴 U</span>`;
  tv.appendChild(leg);
}

function buildMonthTable(month) {
  const table = document.createElement('table');
  table.className = 'brigade-table';
  const dim = daysInMonthCal(currentYear, month);
  const today = new Date();
  const yHolidays = buildHolidays(currentYear);
  const hidePrivate = !shouldShowPersonalData();

  const thead = document.createElement('thead');
  const trHead = document.createElement('tr');
  const cornerTh = document.createElement('th');
  cornerTh.className = 'brig-label';
  cornerTh.textContent = t('brigadeDayHeader');
  cornerTh.style.fontSize = '11px';
  trHead.appendChild(cornerTh);
  for (let d = 1; d <= dim; d++) {
    const th = document.createElement('th');
    th.className = 'date-header';
    const dow = new Date(currentYear, month - 1, d).getDay();
    if (dow === 0 || dow === 6) th.classList.add('weekend');
    if (yHolidays[month + '-' + d]) th.classList.add('holiday');
    if (
      today.getFullYear() === currentYear &&
      today.getMonth() + 1 === month &&
      today.getDate() === d
    )
    th.classList.add('today');
    const dayLabel = dayNames[(dow + 6) % 7];
    th.innerHTML = `<span class="dh-num">${d}</span><span class="dh-day">${dayLabel[0]}</span>`;
    if (yHolidays[month + '-' + d]) th.title = yHolidays[month + '-' + d];
    trHead.appendChild(th);
  }
  thead.appendChild(trHead);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  ['A', 'B', 'C', 'D'].forEach((brig) => {
    const tr = document.createElement('tr');
    const brigTh = document.createElement('th');
    brigTh.className = 'brig-label ' + brig;
    brigTh.textContent = brig;
    tr.appendChild(brigTh);
    for (let d = 1; d <= dim; d++) {
      const td = document.createElement('td');
let s = getShiftAtWithPending(currentYear, month, d, brig);
    let onU = isUrlop(currentYear, month, d, brig);
    
    
    // Factory painting mode override - show factory drafts when active
    const isFactoryPaintingMode = factoryPaintActive && 
                                  factoryPaintYear === currentYear && 
                                  factoryPaintMonth === month;
    if (isFactoryPaintingMode) {
      // Show factory drafts for this brigade
      s = window.getFactoryDraftShiftAt(currentYear, month, d, brig) || '';
      onU = false; // URLop logic doesn't apply in factory painting mode
    } else if (hidePrivate) {
      s =
        factorySchedule[currentYear] &&
        factorySchedule[currentYear][month] &&
        factorySchedule[currentYear][month][brig]
          ? factorySchedule[currentYear][month][brig][d - 1]
          : '';
      onU = false;
      
    }
      
      const cls = onU ? 'U' : isWolne(s) ? 'W' : s;
      td.className = 'tc tc-' + cls;
      td.textContent = onU ? '🌴' : isWolne(s) ? '—' : s;
      const dow = new Date(currentYear, month - 1, d).getDay();
      if (dow === 0 || dow === 6) td.classList.add('weekend-col');
      if (
        today.getFullYear() === currentYear &&
        today.getMonth() + 1 === month &&
        today.getDate() === d
      )
        td.classList.add('today-col');
      if (brig === selectedShift) td.classList.add('my-brigade');
      td.title = `${brig} • ${d} ${monthNamesGenitive[month - 1]}: ${onU ? '🌴' : shiftFullName[s] || t('dayOff')}`;
      td.onclick = () => {

        selectedShift = brig;
        currentMonth = month;
        selectedDay = d;
        yearMode = false;
        prefs.shift = selectedShift;
        prefs.yearMode = false;
        savePrefs(prefs);
        updateShiftButtons();
        const yt = document.getElementById('yearToggle');
        if (yt) yt.checked = false;
        const ytl = document.getElementById('yearToggleLabel');
        if (ytl) ytl.classList.remove('active');
        switchView('month');
      };
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

/* === EMPTY STATE === */
function renderEmptyState(container) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="es-emoji">📅</div>
      <h3>${t('yearIsEmptyTitle', { year: currentYear })}</h3>
      <p>${t('yearIsEmptyDescription')}</p>
      
    </div>
  `;
}