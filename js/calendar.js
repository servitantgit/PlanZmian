/* ================================================================
    PLAN ZMIAN — Module 6: MONTH CALENDAR + INFO + OVERTIME
    ================================================================ */
/* === STATE: when selectedDay was set (for mobile UX) === */

/* === RENDER MONTH VIEW === */
function renderCalendar(direction) {
  const cal = document.getElementById('calendar');
  cal.innerHTML = '';
  cal.className =
    'calendar' +
    (direction === 'right' ? ' slide-right' : direction === 'left' ? ' slide-left' : '');

  dayNames.forEach((d, idx) => {
    const h = document.createElement('div');
    h.className = 'day-header' + (idx >= 5 ? ' weekend' : '');
    h.textContent = d;
    cal.appendChild(h);
  });

  const first = new Date(currentYear, currentMonth - 1, 1);
  let startDay = first.getDay();
  startDay = startDay === 0 ? 6 : startDay - 1;
  const dim = daysInMonthCal(currentYear, currentMonth);
  const yHolidays = buildHolidays(currentYear);

  for (let i = 0; i < startDay; i++) {
    const e = document.createElement('div');
    e.className = 'day-cell empty';
    cal.appendChild(e);
  }

  const today = new Date();
  const hidePrivate = !shouldShowPersonalData();
  const factoryEditorIsActive =
    (typeof factoryPaintActive !== 'undefined' && factoryPaintActive) ||
    window.factoryPaintActive === true;

  // cycleRange must use the same data source as cell rendering:
  // factory schedule when logged out, personal schedule when logged in.
  // Otherwise cycle highlighting can leak personal edits or disagree with visible cells.
  let cycleRange = null;
  if (selectedDay && !factoryEditorIsActive) {
    if (hidePrivate) {
      cycleRange = getFactoryCycleRange(currentYear, currentMonth, selectedDay, selectedShift);
    } else {
      cycleRange = getCycleRange(currentYear, currentMonth, selectedDay, selectedShift);
    }
  }

  for (let d = 1; d <= dim; d++) {
    const cell = document.createElement('div');
    let shiftCode = getShiftAtWithPending(currentYear, currentMonth, d, selectedShift);
    let onUrlop = isUrlop(currentYear, currentMonth, d, selectedShift);

    // Factory painting mode override - show factory drafts when active
    const isFactoryPaintingMode =
      factoryEditorIsActive &&
      factoryPaintYear === currentYear &&
      factoryPaintMonth === currentMonth;
    if (isFactoryPaintingMode) {
      // Show factory drafts for the selected shift
      shiftCode = window.getFactoryDraftShiftAt(currentYear, currentMonth, d, selectedShift) || '';
      onUrlop = false; // URLop logic doesn't apply in factory painting mode
    } else if (hidePrivate) {
      shiftCode =
        factorySchedule[currentYear] &&
        factorySchedule[currentYear][currentMonth] &&
        factorySchedule[currentYear][currentMonth][selectedShift]
          ? factorySchedule[currentYear][currentMonth][selectedShift][d - 1]
          : '';
      onUrlop = false;
    }
    const cellClass = isWolne(shiftCode) ? 'W' : shiftCode;
    cell.className = 'day-cell cell-' + cellClass;
    if (onUrlop) cell.classList.add('urlop');
    cell.dataset.day = d;

    const dow = new Date(currentYear, currentMonth - 1, d).getDay();
    if (dow === 0 || dow === 6) cell.classList.add('day-weekend');
    // Position within the week (0=Mon, 6=Sun) for correct popup positioning
    const weekdayIdx = dow === 0 ? 6 : dow - 1;
    if (weekdayIdx === 0) cell.classList.add('col-first');
    if (weekdayIdx === 6) cell.classList.add('col-last');
    if (weekdayIdx <= 1) cell.classList.add('col-left-edge');
    if (weekdayIdx >= 5) cell.classList.add('col-right-edge');
    if (yHolidays[currentMonth + '-' + d]) cell.classList.add('holiday');
    if (
      today.getFullYear() === currentYear &&
      today.getMonth() + 1 === currentMonth &&
      today.getDate() === d
    )
      cell.classList.add('today');
    if (selectedDay === d) cell.classList.add('selected');

    if (cycleRange && cycleRange.length > 1 && d >= cycleRange.start && d <= cycleRange.end) {
      if (d === cycleRange.start) cell.classList.add('cycle-start');
      else if (d === cycleRange.end) cell.classList.add('cycle-end');
      else cell.classList.add('cycle-middle');
    }

    const numEl = document.createElement('div');
    numEl.className = 'day-num';
    numEl.innerHTML = d;
    if (yHolidays[currentMonth + '-' + d]) {
      const em = document.createElement('span');
      em.className = 'day-emoji';
      em.textContent = '🎉';
      em.title = yHolidays[currentMonth + '-' + d];
      numEl.appendChild(em);
    }
    cell.appendChild(numEl);

    const shiftEl = document.createElement('div');
    shiftEl.className = 'day-shift';
    if (onUrlop) {
      shiftEl.innerHTML = `<span class="shift-emoji">🌴</span>`;
      shiftEl.title = t('vacation');
      shiftEl.classList.add('day-shift-urlop');
    } else if (isWolne(shiftCode)) shiftEl.textContent = '—';
    else
      shiftEl.innerHTML = `<span class="shift-emoji">${shiftEmoji[shiftCode]}</span>${shiftCode}`;
    cell.appendChild(shiftEl);

    // OVERTIME: colored ⏱ marker (detail in info-panel)
    // Shows for przed/po (day with shift) AND weekend hours (day without shift).
    if (!isFactoryPaintingMode && !hidePrivate && !onUrlop) {
      const ot = getOvertimes(currentYear, currentMonth, d, selectedShift);
      const hasPrzedPo = (ot.przed || ot.po) && !isWolne(shiftCode);
      const hasWeekend = ot.weekend && typeof ot.weekend.hours === 'number' && ot.weekend.hours > 0;
      if (hasPrzedPo || hasWeekend) {
        cell.classList.add('has-ot');
        let maxRate = 50;
        const parts = [];
        if (hasPrzedPo) {
          if (ot.przed) {
            const cat = categorizeOvertime(
              currentYear,
              currentMonth,
              d,
              shiftCode,
              'przed',
              ot.przed.hours
            );
            const r = cat.h200 > 0 ? 200 : cat.h100 > 0 ? 100 : 50;
            if (r > maxRate) maxRate = r;
            parts.push(
              `${t('otBefore') || 'przed'}: ${formatDurationHoursI18n(ot.przed.hours)} +${r}%`
            );
          }
          if (ot.po) {
            const cat = categorizeOvertime(
              currentYear,
              currentMonth,
              d,
              shiftCode,
              'po',
              ot.po.hours
            );
            const r = cat.h200 > 0 ? 200 : cat.h100 > 0 ? 100 : 50;
            if (r > maxRate) maxRate = r;
            parts.push(
              `${t('otAfter') || 'po'}: ${formatDurationHoursI18n(ot.po.hours)} +${r}%`
            );
          }
        }
        if (hasWeekend) {
          const cat = categorizeOvertime(
            currentYear,
            currentMonth,
            d,
            null,
            'weekend',
            ot.weekend.hours
          );
          const r = cat.h200 > 0 ? 200 : cat.h100 > 0 ? 100 : 50;
          if (r > maxRate) maxRate = r;
          parts.push(`${formatDurationHoursI18n(ot.weekend.hours)} +${r}%`);
        }

        // Corner clock — palette colors: 50 gray, 100 purple, 200 red
        // Detail popup removed — OT details live in info-panel / timeline
        const marker = document.createElement('div');
        marker.className = `ot-marker ot-${maxRate}`;
        marker.textContent = '⏱';
        marker.title = parts.join(' · ');
        cell.appendChild(marker);
      }
    }

    const noteKey = `${currentYear}-${currentMonth}-${d}-${selectedShift}`;
    const dayNoteList = Array.isArray(notes[noteKey]) ? notes[noteKey] : [];
    if (!isFactoryPaintingMode && !hidePrivate && dayNoteList.length > 0) {
      const nEl = document.createElement('div');
      nEl.className = 'day-note';
      nEl.textContent = '📝';
      nEl.title = dayNoteList.map((n) => n.text).join(' · ');
      cell.appendChild(nEl);
    }

    // Relief handoff popups removed — functionality lives in info-panel timeline widget

    cell.addEventListener('click', () => {
      // Factory painting mode: apply direct shift replacement (admin factory editing)
      // Free day is stored as '' internally ('W' is only its display/CSS representation).
      if (
        factoryPaintActive &&
        factoryPaintYear === currentYear &&
        factoryPaintMonth === currentMonth
      ) {
        const val = factoryPaintMode === 'W' ? '' : factoryPaintMode;
        window.handleFactoryPaintDayClick(currentYear, currentMonth, d, selectedShift, val);
        selectedDay = d;
        refreshViews();
        return;
      }

      selectedDay = selectedDay === d ? null : d;
      renderCalendar();
      renderInfo();
    });

    cal.appendChild(cell);
  }

  renderMonthOvertimeSummary();
}

/* === POPUPY ZMIAN (relief) — removed; timeline widget in info-panel replaces them === */

/* === MODAL: ADD EXTRA SHIFT === */
function openAddShiftModal(day) {
  const yHolidays = buildHolidays(currentYear);
  const isHoliday = !!yHolidays[currentMonth + '-' + day];
  const dowLocal = new Date(currentYear, currentMonth - 1, day).getDay();
  const isSunday = dowLocal === 0;
  const isSaturday = dowLocal === 6;
  const rateInfo = isHoliday
    ? `+200% (${t('labelHoliday')})`
    : isSunday
      ? `+100% (${t('labelSunday')})`
      : '';
  const rateHtml = rateInfo
    ? `<div style="margin-top:6px; padding:6px 10px; background:var(--bg-info); border-radius:6px; font-size:13px; text-align:center; font-weight:600;">💰 ${rateInfo}</div>`
    : '';

  // Check if day already has a custom shift (for showing/highlighting Empty button)
  const existingShift = getShiftAtWithPending(currentYear, currentMonth, day, selectedShift);
  const hasExistingShift = !isWolne(existingShift);

  // Check factory shift for this day/brigade — needed to decide whether to show hours-only section
  const factoryShift =
    factorySchedule[currentYear] &&
    factorySchedule[currentYear][currentMonth] &&
    factorySchedule[currentYear][currentMonth][selectedShift]
      ? factorySchedule[currentYear][currentMonth][selectedShift][day - 1]
      : '';
  const isFactoryFree = isWolne(factoryShift);
  // Show hours-only section on ANY day where factory has no shift for this brigade.
  // Rate is categorized by categorizeOvertime('weekend', ...): holiday=+200%, Sunday=+100%,
  // other days off (Saturday or any weekday off) = +100%.
  const showHoursOnly = isFactoryFree;

  // Existing weekend hours (if any) — for pre-filling input and showing Delete button
  const existingOt = getOvertimes(currentYear, currentMonth, day, selectedShift);
  const existingWeekend = existingOt && existingOt.weekend ? existingOt.weekend : null;
  const existingParts =
    existingWeekend && typeof existingWeekend.hours === 'number'
      ? decimalHoursToParts(existingWeekend.hours)
      : { hours: '', minutes: '' };
  const existingNote =
    typeof getDayNoteTextByTag === 'function'
      ? getDayNoteTextByTag(currentYear, currentMonth, day, selectedShift, 'weekend')
      : '';

  const hoursOnlyHtml = showHoursOnly
    ? `
    <div style="margin-top:20px; padding-top:15px; border-top:1px solid var(--border-cell);">
      <div style="font-weight:600; margin-bottom:10px;">${t('addShiftHoursSection')}:</div>
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:10px; flex-wrap:wrap;">
        <label style="font-size:13px; color:var(--text-muted); flex-shrink:0;">${t('addShiftHoursLabel')}</label>
        <input type="number" id="addShiftHoursH" min="0" max="24" step="1" inputmode="numeric"
          placeholder="0"
          value="${existingParts.hours === '' ? '' : existingParts.hours}"
          style="width:64px; padding:8px 8px; border:1px solid var(--border-cell); border-radius:6px; background:var(--bg-container); color:var(--text-main); font-size:14px;">
        <span style="color:var(--text-muted); font-size:13px;">${t('durationHoursUnit') || 'h'}</span>
        <input type="number" id="addShiftHoursM" min="0" max="59" step="1" inputmode="numeric"
          placeholder="0"
          value="${existingParts.minutes === '' ? '' : existingParts.minutes}"
          style="width:64px; padding:8px 8px; border:1px solid var(--border-cell); border-radius:6px; background:var(--bg-container); color:var(--text-main); font-size:14px;">
        <span style="color:var(--text-muted); font-size:13px;">${t('durationMinutesUnit') || 'm'}</span>
      </div>
      <div id="addShiftHoursPreview" style="padding:10px; background:var(--bg-info); border-radius:8px; font-size:13px; margin-bottom:10px; display:none;"></div>
      <div style="margin-bottom:10px;">
        <label style="font-size:13px; color:var(--text-muted); display:block; margin-bottom:4px;">${t('otNote')}</label>
        <input type="text" id="addShiftHoursNote" class="note-input"
          placeholder="${t('otNotePlaceholder')}"
          value="${escapeHtml(existingNote)}">
      </div>
      <div style="display:flex; gap:8px;">
        <button id="addShiftHoursSaveBtn" class="modal-btn success" style="flex:1;">💾 ${t('addShiftHoursSave')}</button>
        ${existingWeekend ? `<button id="addShiftHoursDeleteBtn" class="modal-btn danger" style="flex:0 0 auto;">🗑 ${t('addShiftHoursDelete')}</button>` : ''}
      </div>
    </div>
    `
    : '';

  const body = `
    <div style="padding:10px 14px; background:var(--bg-cell); border-radius:10px; margin-bottom:15px; font-size:13px;">
      <b>📅 ${day} ${monthNamesGenitive[currentMonth - 1]} ${currentYear}</b>
      ${hasExistingShift ? `<div style="margin-top:6px; font-size:12px; opacity:0.85;">${t('addShiftCurrent') || 'Currently'}: <b>${existingShift}</b></div>` : ''}
      ${rateHtml}
    </div>
    <div style="font-weight:600; margin-bottom:10px;">${t('addShiftSelectType')}:</div>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <button class="add-shift-modal-btn" data-shift="R" style="flex:1; min-width:90px; padding:14px 8px; border:none; background:var(--color-R); color:#fff; border-radius:10px; cursor:pointer; font-size:15px; font-weight:700;">🌅 R<br><small style="opacity:0.85; font-weight:500;">6:00-14:00</small></button>
      <button class="add-shift-modal-btn" data-shift="P" style="flex:1; min-width:90px; padding:14px 8px; border:none; background:var(--color-P); color:#fff; border-radius:10px; cursor:pointer; font-size:15px; font-weight:700;">🌤️ P<br><small style="opacity:0.85; font-weight:500;">14:00-22:00</small></button>
      <button class="add-shift-modal-btn" data-shift="N" style="flex:1; min-width:90px; padding:14px 8px; border:none; background:var(--color-N); color:#fff; border-radius:10px; cursor:pointer; font-size:15px; font-weight:700;">🌙 N<br><small style="opacity:0.85; font-weight:500;">22:00-6:00</small></button>
      <button class="add-shift-modal-btn" data-shift="" style="flex:1; min-width:90px; padding:14px 8px; border:none; background:linear-gradient(135deg, #7f8c8d, #5d6d6e); color:#fff; border-radius:10px; cursor:pointer; font-size:15px; font-weight:700;" title="${t('addShiftEraseTitle') || 'Clear shift'}">🏖️ —<br><small style="opacity:0.85; font-weight:500;">${t('addShiftEraseLabel') || 'Free'}</small></button>
    </div>
    ${hoursOnlyHtml}
  `;

  showModal({
    title: t('addShiftTitle'),
    body: body,
    buttons: [{ text: t('otCancelBtn'), class: 'secondary' }],
  });

  // Helper: live preview for hours + minutes input
  function updateHoursPreview() {
    const hEl = document.getElementById('addShiftHoursH');
    const mEl = document.getElementById('addShiftHoursM');
    const preview = document.getElementById('addShiftHoursPreview');
    if (!hEl || !mEl || !preview) return;
    const hours = partsToDecimalHours(hEl.value, mEl.value);
    if (typeof isValidWeekendDuration === 'function' ? !isValidWeekendDuration(hours) : !hours || hours <= 0 || hours > 24) {
      preview.style.display = 'none';
      return;
    }
    const cat = categorizeOvertime(currentYear, currentMonth, day, null, 'weekend', hours);
    const paid = cat.h50 * 1.5 + cat.h100 * 2 + cat.h200 * 3;
    preview.style.display = 'block';
    preview.innerHTML = `
      <div style="font-weight:700; margin-bottom:4px;">${t('addShiftHoursPreview')}:</div>
      <div>${formatDurationHoursI18n(hours)} × ${cat.h200 > 0 ? '+200%' : cat.h100 > 0 ? '+100%' : '+50%'}</div>
      <div style="margin-top:4px; font-weight:700;">💰 ${formatDurationHoursI18n(paid)} ${t('infoPaid')}</div>
    `;
  }

  // Attach handlers after modal is shown
  setTimeout(() => {
    // Shift buttons (R/P/N/free) — same as before + clear weekend hours if any
    document.querySelectorAll('.add-shift-modal-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const shiftType = btn.dataset.shift;
        // Mutual exclusion: picking a shift clears weekend hours
        if (existingWeekend) {
          removeOvertime(currentYear, currentMonth, day, selectedShift, 'weekend');
        }
        applyEdit(currentYear, currentMonth, day, selectedShift, shiftType);
        showToast('success', t('addShiftAdded', { s: shiftType }));
        hideModal();
        refreshViews();
      });
    });

    // Hours + minutes input live preview
    const hoursH = document.getElementById('addShiftHoursH');
    const hoursM = document.getElementById('addShiftHoursM');
    if (hoursH && hoursM) {
      hoursH.addEventListener('input', updateHoursPreview);
      hoursM.addEventListener('input', updateHoursPreview);
      if (hoursH.value || hoursM.value) updateHoursPreview();
    }

    // Save hours button
    const saveBtn = document.getElementById('addShiftHoursSaveBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const hEl = document.getElementById('addShiftHoursH');
        const mEl = document.getElementById('addShiftHoursM');
        const noteInput = document.getElementById('addShiftHoursNote');
        const hours = partsToDecimalHours(hEl && hEl.value, mEl && mEl.value);
        // Duration contract: weekend 0.5–24h
        if (typeof isValidWeekendDuration === 'function' ? !isValidWeekendDuration(hours) : !hours || hours < 0.5 || hours > 24) {
          showToast('error', t('addShiftHoursInvalid'));
          return;
        }
        // Mutual exclusion: saving hours clears any existing R/P/N shift
        if (hasExistingShift) {
          applyEdit(currentYear, currentMonth, day, selectedShift, '');
        }
        setOvertime(currentYear, currentMonth, day, selectedShift, 'weekend', { hours });
        const noteText = noteInput ? noteInput.value.trim() : '';
        if (typeof upsertDayNoteByTag === 'function') {
          upsertDayNoteByTag(currentYear, currentMonth, day, selectedShift, 'weekend', noteText);
        }
        showToast('success', t('addShiftHoursSaved', { h: formatDurationHoursI18n(hours) }));
        hideModal();
        refreshViews();
      });
    }

    // Delete hours button
    const deleteBtn = document.getElementById('addShiftHoursDeleteBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        removeOvertime(currentYear, currentMonth, day, selectedShift, 'weekend');
        showToast('success', t('addShiftHoursRemoved'));
        hideModal();
        refreshViews();
      });
    }
  }, 50);
}

/* === MODAL NADGODZIN === */
let otModalContext = null;

function openOvertimeModal(day, shift, position, existing) {
  otModalContext = { day, shift, position };
  const overlay = document.getElementById('otOverlay');

  const [sh, eh] = shiftHours[shift];
  const shiftTimeStr = `${String(sh).padStart(2, '0')}:00-${String(eh % 24).padStart(2, '0')}:00`;
  const posLabel = position === 'przed' ? t('otPositionBefore') : t('otPositionAfter');
  const posArrow = position === 'przed' ? '⬅' : '➡';

  document.getElementById('otTitle').textContent =
    `${t('otTitle')} ${posArrow} ${posLabel} ${shift}`;

  document.getElementById('otContext').innerHTML = `
    <b>${t('infoDate')}</b> ${day} ${monthNamesGenitive[currentMonth - 1]} ${currentYear}<br>
    <b>${t('infoShiftLabel')}</b> ${shift} (${shiftTimeStr})<br>
    <b>${t('infoPosition')}</b> ${posArrow} ${posLabel}
  `;

  document.getElementById('otNote').value = getDayNoteTextByTag(
    currentYear,
    currentMonth,
    day,
    selectedShift,
    position === 'przed' ? 'before' : 'after'
  );
  document.getElementById('otCustomHoursH').value = '';
  document.getElementById('otCustomHoursM').value = '';

  document.querySelectorAll('.ot-qbtn').forEach((b) => b.classList.remove('active'));
  if (existing) {
    const btn = document.querySelector(`.ot-qbtn[data-h="${existing.hours}"]`);
    if (btn) {
      btn.classList.add('active');
    } else {
      const parts = decimalHoursToParts(existing.hours);
      document.getElementById('otCustomHoursH').value = parts.hours || '';
      document.getElementById('otCustomHoursM').value = parts.minutes || '';
    }
    updateOvertimePreview(existing.hours);
  } else {
    document.getElementById('otPreview').style.display = 'none';
  }

  const footer = document.getElementById('otFooter');
  footer.innerHTML = '';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'modal-btn secondary';
  cancelBtn.textContent = t('otCancelBtn');
  cancelBtn.onclick = () => overlay.classList.remove('show');
  footer.appendChild(cancelBtn);

  // Delete button — shown only if overtime exists for current position
  // (updated dynamically when user switches PRZED/PO via radio)
  const delBtn = document.createElement('button');
  delBtn.className = 'modal-btn danger';
  delBtn.id = 'otDeleteBtn';
  delBtn.textContent = '🗑 ' + t('otDeleteBtn');
  delBtn.onclick = () => {
    const currentPos = otModalContext.position;
    removeOvertime(currentYear, currentMonth, day, selectedShift, currentPos);
    overlay.classList.remove('show');
    showToast('success', t('otDeleted'));
    refreshViews();
  };
  // Show only if overtime exists for INITIAL position
  delBtn.style.display = existing ? 'inline-block' : 'none';
  footer.appendChild(delBtn);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'modal-btn success';
  saveBtn.textContent = t('otSaveBtn');
  saveBtn.onclick = saveOvertimeFromModal;
  footer.appendChild(saveBtn);

  overlay.classList.add('show');
}

function getSelectedHours() {
  const hEl = document.getElementById('otCustomHoursH');
  const mEl = document.getElementById('otCustomHoursM');
  if (hEl || mEl) {
    const custom = partsToDecimalHours(hEl && hEl.value, mEl && mEl.value);
    if (custom > 0) return custom;
  }
  const active = document.querySelector('.ot-qbtn.active');
  if (active) return parseFloat(active.dataset.h);
  return null;
}

function updateOvertimePreview(hours) {
  const preview = getElementByIdSafe('otPreview');
  if (!otModalContext || !hours || !preview) {
    if (preview) preview.style.display = 'none';
    return;
  }
  const { day, shift, position } = otModalContext;
  const { from, to } = calcOvertimeTime(shift, position, hours);
  const cat = categorizeOvertime(currentYear, currentMonth, day, shift, position, hours);
  const crossesMidnight = to < from;
  preview.style.display = 'block';
  const paid = cat.h50 * 1.5 + cat.h100 * 2 + cat.h200 * 3;
  const fmt = formatDurationHoursI18n;
  preview.innerHTML = `
    <div style="font-weight:700; color:var(--text-header); margin-bottom:6px;">${t('otPreview')}</div>
    <div>${t('infoTime')} <b>${formatTimeRange(from, to)}</b> (${fmt(hours)})</div>
    ${crossesMidnight ? `<div style="color:#c0392b; font-weight:700; margin-top:4px;">${t('otCrossesMidnight')}</div>` : ''}
    ${cat.h50 > 0 ? `<div>🟡 <b>+50%</b>: ${fmt(cat.h50)} → ${fmt(cat.h50 * 1.5)} ${t('infoPaid')}</div>` : ''}
    ${cat.h100 > 0 ? `<div>🟣 <b>+100%</b>: ${fmt(cat.h100)} → ${fmt(cat.h100 * 2)} ${t('infoPaid')}</div>` : ''}
    ${cat.h200 > 0 ? `<div>🔴 <b>+200%</b>: ${fmt(cat.h200)} → ${fmt(cat.h200 * 3)} ${t('infoPaid')}</div>` : ''}
    <div style="margin-top:6px; padding-top:6px; border-top:1px solid var(--border-cell); font-weight:700;">
      ${t('otPayment')}: ${fmt(paid)}
    </div>
  `;
}

function saveOvertimeFromModal() {
  if (!otModalContext) return;
  const hours = getSelectedHours();
  if (!hours || hours <= 0) {
    showToast('error', t('otSelectHours'));
    return;
  }
  const note = document.getElementById('otNote').value.trim();
  const { day, position } = otModalContext;
  setOvertime(currentYear, currentMonth, day, selectedShift, position, { hours });
  upsertDayNoteByTag(
    currentYear,
    currentMonth,
    day,
    selectedShift,
    position === 'przed' ? 'before' : 'after',
    note
  );
  document.getElementById('otOverlay').classList.remove('show');
  showToast('success', t('otSaved', { h: formatDurationHoursI18n(hours) }));
  refreshViews();
}

document.getElementById('otClose').onclick = () =>
  document.getElementById('otOverlay').classList.remove('show');
document.getElementById('otOverlay').onclick = (e) => {
  if (e.target.id === 'otOverlay') document.getElementById('otOverlay').classList.remove('show');
};

document.querySelectorAll('.ot-qbtn').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('.ot-qbtn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const hEl = document.getElementById('otCustomHoursH');
    const mEl = document.getElementById('otCustomHoursM');
    if (hEl) hEl.value = '';
    if (mEl) mEl.value = '';
    updateOvertimePreview(parseFloat(btn.dataset.h));
  };
});

function onOtCustomDurationInput() {
  const hEl = document.getElementById('otCustomHoursH');
  const mEl = document.getElementById('otCustomHoursM');
  const v = partsToDecimalHours(hEl && hEl.value, mEl && mEl.value);
  if (v > 0) {
    document.querySelectorAll('.ot-qbtn').forEach((b) => b.classList.remove('active'));
    updateOvertimePreview(v);
  }
}
document.getElementById('otCustomHoursH').addEventListener('input', onOtCustomDurationInput);
document.getElementById('otCustomHoursM').addEventListener('input', onOtCustomDurationInput);

/* === MONTHLY OVERTIME SUMMARY === */
function renderMonthOvertimeSummary() {
  const old = document.getElementById('otMonthSummary');
  if (old) old.remove();

  const factoryEditorIsActive =
    (typeof factoryPaintActive !== 'undefined' && factoryPaintActive) ||
    window.factoryPaintActive === true;

  if (factoryEditorIsActive) return;
  if (!shouldShowPersonalData()) return;
  if (typeof isAdvancedMode === 'function' && !isAdvancedMode()) return;

  const sum = getMonthOvertimeSummary(currentYear, currentMonth, selectedShift);
  if (sum.count === 0) return;

  const paid = sum.h50 * 1.5 + sum.h100 * 2 + sum.h200 * 3;
  const totalH = sum.h50 + sum.h100 + sum.h200;
  const fmt = formatDurationHoursI18n;

  const el = document.createElement('div');
  el.id = 'otMonthSummary';
  el.className = 'ot-summary';
  el.innerHTML = `
    <div class="ot-summary-title">${t('otMonthSummary')} (${sum.count} ${sum.count === 1 ? t('otMonthEntry') : t('otMonthEntries')})</div>
    <div class="ot-summary-grid">
      <div class="ot-summary-card s-50">
        <div class="ssc-label">+50%</div>
        <div class="ssc-value">${fmt(sum.h50)}</div>
      </div>
      <div class="ot-summary-card s-100">
        <div class="ssc-label">+100%</div>
        <div class="ssc-value">${fmt(sum.h100)}</div>
      </div>
      <div class="ot-summary-card s-200">
        <div class="ssc-label">+200%</div>
        <div class="ssc-value">${fmt(sum.h200)}</div>
      </div>
    </div>
    <div class="ot-summary-total">
      ${t('otMonthTotal')}: <b>${fmt(totalH)}</b> ${t('otMonthWorked')} · 💰 <b>${fmt(paid)}</b> ${t('otMonthPaid')}
    </div>
  `;
  // Place monthly OT summary at the end of the month view (after info panel)
  const infoPanel = document.getElementById('infoPanel');
  if (infoPanel && infoPanel.parentNode) {
    infoPanel.parentNode.insertBefore(el, infoPanel.nextSibling);
  }
}

/* === PROGRESS === */
function renderProgress() {
  const today = new Date();
  const progressFill = getElementByIdSafe('progressFill');
  const progressLabel = getElementByIdSafe('progressLabel');
  if (!progressFill || !progressLabel) return;
  if (today.getFullYear() !== currentYear || today.getMonth() + 1 !== currentMonth) {
    progressFill.style.width = '0%';
    progressLabel.textContent = '';
    return;
  }
  const ySched = getYearSchedule(currentYear);
  const arr = ySched[currentMonth][selectedShift];
  const totalHours = getMonthHours(currentYear, currentMonth)[selectedShift] || 1;
  let workedHours = 0;
  for (let i = 0; i < today.getDate() && i < arr.length; i++) {
    if (!isWolne(arr[i]) && !isUrlop(currentYear, currentMonth, i + 1, selectedShift))
      workedHours += 8;
  }
  const pct = Math.round((workedHours / totalHours) * 100);
  progressFill.style.width = Math.min(pct, 100) + '%';
  progressLabel.textContent = t('infoBrigadeHours', {
    brig: selectedShift,
    worked: workedHours,
    total: totalHours,
    pct: pct,
  });
}

/* === INFO PANEL === */
function renderInfo() {
  const panel = document.getElementById('infoPanel');
  const factoryEditorIsActive =
    (typeof factoryPaintActive !== 'undefined' && factoryPaintActive) ||
    window.factoryPaintActive === true;

  if (factoryEditorIsActive) {
    panel.innerHTML = '';
    return;
  }

  if (!selectedDay) {
    panel.innerHTML = `<h3>${t('infoPanelTitle')}</h3><p>${t('infoPanelHint')}</p>`;
    return;
  }
  const hidePrivate = !shouldShowPersonalData();
  let shiftCode = getShiftAtWithPending(currentYear, currentMonth, selectedDay, selectedShift);
  if (hidePrivate) {
    shiftCode =
      factorySchedule[currentYear] &&
      factorySchedule[currentYear][currentMonth] &&
      factorySchedule[currentYear][currentMonth][selectedShift]
        ? factorySchedule[currentYear][currentMonth][selectedShift][selectedDay - 1]
        : '';
  }
  const dateStr = `${selectedDay} ${monthNamesGenitive[currentMonth - 1]} ${currentYear}`;
  const dowIdx = new Date(currentYear, currentMonth - 1, selectedDay).getDay();
  const dow = dayNamesFull[dowIdx];
  const yHolidays = buildHolidays(currentYear);
  const holidayName = yHolidays[currentMonth + '-' + selectedDay];
  const holidayInfo = holidayName ? ` <span style="color:#c0392b;">🎉 ${holidayName}</span>` : '';
  const onUrlop = hidePrivate
    ? false
    : isUrlop(currentYear, currentMonth, selectedDay, selectedShift);

  // Factory shift for determining if extra shift is enabled
  let factoryShift = '';
  if (
    factorySchedule[currentYear] &&
    factorySchedule[currentYear][currentMonth] &&
    factorySchedule[currentYear][currentMonth][selectedShift]
  ) {
    factoryShift = factorySchedule[currentYear][currentMonth][selectedShift][selectedDay - 1];
  }
  const isFactoryFree = isWolne(factoryShift) || factoryShift === '';

  // Existing OT for edit/delete
  const otRaw = !hidePrivate
    ? getOvertimes(currentYear, currentMonth, selectedDay, selectedShift)
    : null;
  const existingOtAntes = otRaw ? otRaw.przed : null;
  const existingOtDespu = otRaw ? otRaw.po : null;

  if (hidePrivate) {
    // Privacy mode: show factory data only, hide personal data
    panel.innerHTML = `
        <h3>📅 ${dateStr} (${dow})${holidayInfo} — <span class="badge ${selectedShift}">${selectedShift}</span></h3>
        <div class="info-grid">
          <div class="info-card" style="grid-column:1/-1;">
            <div class="label">${t('privacyDayDetailsHidden')}</div>
            <div class="value">
              <button class="privacy-disable-btn" id="privacyDisableBtn">${t('privacyDisableAction')}</button>
            </div>
          </div>
        </div>`;
    // Bind privacy disable button
    setTimeout(() => {
      const btn = document.getElementById('privacyDisableBtn');
      if (btn) {
        btn.addEventListener('click', () => {
          setPrivacyMode(false);
          renderInfo(); // Re-render to show personal data
        });
      }
    }, 0);
  } else {
    // Non-privacy mode: show full details
    // Status card
    let statusCard = '';
    if (onUrlop) {
      statusCard = `<div class="info-card" style="grid-column:1/-1;"><div class="label">🌴 ${t('vacation')}</div><div class="value">${t('infoUrlop')}</div></div>`;
    } else if (isWolne(shiftCode)) {
      statusCard = `<div class="info-card" style="grid-column:1/-1;"><div class="label">${t('infoFree') || 'Wolne'}</div><div class="value">—</div></div>`;
    } else {
      // Working day: shift code + hours are already visible on the
      // selected calendar cell and in the legend below the calendar —
      // repeating them here was pure duplication.
      statusCard = '';
    }

    // Timeline (only for working non-vacation day)
    let timelineCard = '';
    if (!onUrlop && !isWolne(shiftCode)) {
      // Relief handoff flow
      let reliefCard = '';
      const info = getRelief(currentYear, currentMonth, selectedDay, selectedShift, shiftCode);
      function formatWhen(y, m, d) {
        if (y === currentYear && m === currentMonth && d === selectedDay) return '';
        if (y === currentYear && m === currentMonth && d === selectedDay - 1)
          return ', ' + t('dayBefore');
        if (y === currentYear && m === currentMonth && d === selectedDay + 1)
          return ', ' + t('dayAfter');
        return `, ${d} ${monthNamesGenitive[m - 1]}${y !== currentYear ? ' ' + y : ''}`;
      }

      // Timeline OT: przed before self, po after self
      let timelineOt = null;
      const otRaw = getOvertimes(currentYear, currentMonth, selectedDay, selectedShift);
      const mk = (pos) => {
        if (!otRaw[pos]) return null;
        const cat = categorizeOvertime(
          currentYear,
          currentMonth,
          selectedDay,
          shiftCode,
          pos,
          otRaw[pos].hours
        );
        const percent = cat.h200 > 0 ? 200 : cat.h100 > 0 ? 100 : 50;
        return { hours: otRaw[pos].hours, percent };
      };
      const before = mk('przed');
      const after = mk('po');
      if (before || after) timelineOt = { before, after };

      if (typeof renderReliefTimeline === 'function') {
        const timelineHtml = renderReliefTimeline(
          info,
          currentYear,
          currentMonth,
          selectedDay,
          shiftCode,
          selectedShift,
          timelineOt
        );
        reliefCard = `
          <div class="info-card" style="grid-column:1/-1;">
            <div class="label">🔄 ${t('reliefFlowTitle')}</div>
            <div class="value">${timelineHtml}</div>
          </div>`;
      }

      timelineCard = reliefCard;
    }

    // Weekend hours info-card (if user recorded custom hours on this day)
    const otForCard = getOvertimes(currentYear, currentMonth, selectedDay, selectedShift);
    let weekendCard = '';
    if (
      otForCard.weekend &&
      typeof otForCard.weekend.hours === 'number' &&
      otForCard.weekend.hours > 0
    ) {
      const weekendHours = otForCard.weekend.hours;
      const weekendCat = categorizeOvertime(
        currentYear,
        currentMonth,
        selectedDay,
        null,
        'weekend',
        weekendHours
      );
      const weekendRate = weekendCat.h200 > 0 ? '+200%' : weekendCat.h100 > 0 ? '+100%' : '+50%';
      const weekendPaid = weekendCat.h50 * 1.5 + weekendCat.h100 * 2 + weekendCat.h200 * 3;
      const weekendNoteText = getDayNoteTextByTag(
        currentYear,
        currentMonth,
        selectedDay,
        selectedShift,
        'weekend'
      );
      weekendCard = `
        <div class="info-card" style="grid-column:1/-1;">
          <div class="label">⏱ ${escapeHtml(t('addShiftHoursSection'))}</div>
          <div class="value">
            <div style="font-weight:700; font-size:15px;">${formatDurationHoursI18n(weekendHours)} × ${weekendRate}</div>
            <div style="margin-top:4px; color:var(--text-muted);">💰 ${escapeHtml(t('otPayment'))}: ${formatDurationHoursI18n(weekendPaid)}</div>
            ${weekendNoteText ? `<div style="margin-top:6px; padding:6px 10px; background:var(--bg-cell); border-radius:6px; font-size:13px;">📝 ${escapeHtml(weekendNoteText)}</div>` : ''}
          </div>
        </div>`;
    }

    // Day action grid
    const canAddExtraShift = isFactoryFree && !onUrlop;
    const canAddOvertime =
      !onUrlop &&
      !isWolne(shiftCode) &&
      (shiftCode === 'R' || shiftCode === 'P' || shiftCode === 'N');

    const extraShiftDisabledReason = onUrlop
      ? t('dayActionUnavailableVacation')
      : !isFactoryFree
        ? t('dayActionUnavailableFactoryShift')
        : '';

    const overtimeDisabledReason = onUrlop
      ? t('dayActionUnavailableVacation')
      : !canAddOvertime
        ? t('dayActionUnavailableNoShift')
        : '';

    const vacationActionLabel = onUrlop ? t('dayActionVacationRemove') : t('dayActionVacationAdd');

    const actionCard = `
        <div class="info-card" style="grid-column:1/-1;">
          <div class="label">${t('dayActionsTitle')}</div>
          <div class="day-action-grid">
            <button
              type="button"
              class="day-action-btn"
              data-day-action="vacation"
              aria-label="${escapeHtml(vacationActionLabel)}"
            >
              <span class="day-action-icon">🌴</span>
              <span class="day-action-label">${vacationActionLabel}</span>
            </button>

            <button
              type="button"
              class="day-action-btn advanced-only"
              data-day-action="extra-shift"
              aria-label="${escapeHtml(t('dayActionExtraShift'))}"
              title="${escapeHtml(extraShiftDisabledReason)}"
              ${canAddExtraShift ? '' : 'disabled'}
            >
              <span class="day-action-icon">➕</span>
              <span class="day-action-label">${t('dayActionExtraShift')}</span>
            </button>

            <button
              type="button"
              class="day-action-btn advanced-only"
              data-day-action="overtime-before"
              aria-label="${escapeHtml(t('dayActionOvertimeBefore'))}"
              title="${escapeHtml(overtimeDisabledReason)}"
              ${canAddOvertime ? '' : 'disabled'}
            >
              <span class="day-action-icon">⏱⬅</span>
              <span class="day-action-label">${t('dayActionOvertimeBefore')}</span>
            </button>

            <button
              type="button"
              class="day-action-btn advanced-only"
              data-day-action="overtime-after"
              aria-label="${escapeHtml(t('dayActionOvertimeAfter'))}"
              title="${escapeHtml(overtimeDisabledReason)}"
              ${canAddOvertime ? '' : 'disabled'}
            >
              <span class="day-action-icon">⏱➡</span>
              <span class="day-action-label">${t('dayActionOvertimeAfter')}</span>
            </button>
          </div>
        </div>`;

    // Unified notes: a shared list of free-form + overtime-tagged notes
    // for this day/shift (replaces the old separate note + OT-note fields).
    const dayNotes = getDayNotes(currentYear, currentMonth, selectedDay, selectedShift);
    const noteTagIcon = { before: '⏱⬅', after: '⏱➡' };
    const noteTagLabel = { before: t('otPositionBefore'), after: t('otPositionAfter') };
    const noteRows = dayNotes
      .map((n) => {
        const icon = n.tag ? noteTagIcon[n.tag] || '📝' : '📝';
        const tagPrefix = n.tag
          ? `<strong>${escapeHtml(noteTagLabel[n.tag] || '')}:</strong> `
          : '';
        return `<div class="day-note-row" data-note-id="${escapeHtml(n.id)}">
              <span class="day-note-icon">${icon}</span>
              <span
                class="day-note-text"
                data-edit-note="${escapeHtml(n.id)}"
                role="button"
                tabindex="0"
                title="${escapeHtml(t('infoNoteEditHint'))}"
              >${tagPrefix}<span class="day-note-text-content">${escapeHtml(n.text)}</span></span>
              <button
                type="button"
                class="day-note-remove"
                data-remove-note="${escapeHtml(n.id)}"
                aria-label="${escapeHtml(t('delete'))}"
                title="${escapeHtml(t('delete'))}"
              >✕</button>
            </div>`;
      })
      .join('');

    const noteCard = `
        <div class="info-card info-section-note" style="grid-column:1/-1;">
          <div class="label">${t('infoNote')}</div>
          ${noteRows ? `<div class="day-note-list">${noteRows}</div>` : ''}
          <div class="value">
            <input
              class="note-input"
              id="noteInput"
              placeholder="${t('infoNotePlaceholder')}"
            >
          </div>
        </div>`;

    // Vacation summary
    const usedUrlop =
      typeof getTotalUsedVacation === 'function'
        ? getTotalUsedVacation(currentYear, selectedShift)
        : countWorkingUrlops(currentYear, selectedShift);
    const limit = getVacationLimit(selectedShift);
    const remainingUrlop = Math.max(0, limit - usedUrlop);
    const vacationCard = `
        <div class="info-card" style="grid-column:1/-1;">
          <div class="label">🌴 ${t('vacation')} ${currentYear}</div>
          <div class="value">${t('vacationStatsFormat', { left: remainingUrlop, used: usedUrlop, limit: limit })}</div>
        </div>`;

    // Build the info-grid
    panel.innerHTML = `
        <h3>📅 ${dateStr} (${dow})${holidayInfo} — <span class="badge ${selectedShift}">${selectedShift}</span></h3>
        <div class="info-grid">
          ${statusCard}
          ${timelineCard}
          ${weekendCard}
          ${actionCard}
          ${noteCard}
          ${vacationCard}
        </div>`;

    // Bind selected-day actions after rendering the panel.
    const vacationButton = panel.querySelector('[data-day-action="vacation"]');
    if (vacationButton) {
      vacationButton.addEventListener('click', () => {
        toggleUrlop(currentYear, currentMonth, selectedDay, selectedShift);
        const vacationIsNowActive = isUrlop(currentYear, currentMonth, selectedDay, selectedShift);
        showToast('success', vacationIsNowActive ? t('urlopAdded') : t('urlopRemoved'));
        renderCalendar();
        renderInfo();
      });
    }

    const extraShiftButton = panel.querySelector('[data-day-action="extra-shift"]');
    if (extraShiftButton) {
      extraShiftButton.addEventListener('click', () => {
        openAddShiftModal(selectedDay);
      });
    }

    const overtimeBeforeButton = panel.querySelector('[data-day-action="overtime-before"]');
    if (overtimeBeforeButton) {
      overtimeBeforeButton.addEventListener('click', () => {
        openOvertimeModal(selectedDay, shiftCode, 'przed', existingOtAntes);
      });
    }

    const overtimeAfterButton = panel.querySelector('[data-day-action="overtime-after"]');
    if (overtimeAfterButton) {
      overtimeAfterButton.addEventListener('click', () => {
        openOvertimeModal(selectedDay, shiftCode, 'po', existingOtDespu);
      });
    }

    const noteRemoveButtons = panel.querySelectorAll('[data-remove-note]');
    noteRemoveButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const noteId = btn.getAttribute('data-remove-note');
        removeDayNote(currentYear, currentMonth, selectedDay, selectedShift, noteId);
        renderCalendar();
        renderInfo();
      });
    });

    const startNoteEdit = (el) => {
      if (el.querySelector('input')) return; // already editing
      const noteId = el.getAttribute('data-edit-note');
      const entry = dayNotes.find((n) => n.id === noteId);
      if (!entry) return;

      const tagPrefixHtml = entry.tag
        ? `<strong>${escapeHtml(noteTagLabel[entry.tag] || '')}:</strong> `
        : '';
      el.innerHTML = `${tagPrefixHtml}<input type="text" class="day-note-edit-input" value="${escapeHtml(entry.text)}">`;
      const input = el.querySelector('input');
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);

      let committed = false;
      const commitEdit = () => {
        if (committed) return;
        committed = true;
        const newText = input.value.trim();
        // Editing to an empty value is a no-op (reverts on re-render) —
        // deletion stays a deliberate action via the ✕ button only.
        if (newText && newText !== entry.text) {
          updateDayNote(currentYear, currentMonth, selectedDay, selectedShift, noteId, newText);
        }
        renderCalendar();
        renderInfo();
      };

      input.addEventListener('blur', commitEdit);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          input.blur();
        } else if (event.key === 'Escape') {
          committed = true; // suppress the blur commit triggered by re-render
          renderInfo();
        }
      });
    };

    const noteEditTargets = panel.querySelectorAll('[data-edit-note]');
    noteEditTargets.forEach((el) => {
      el.addEventListener('click', () => startNoteEdit(el));
      el.addEventListener('keydown', (event) => {
        // Only activate when span itself is focused, not when event bubbles
        // from a child input (fixes Space being swallowed while typing)
        if (event.target !== el) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          startNoteEdit(el);
        }
      });
    });

    const noteInput = panel.querySelector('#noteInput');
    if (noteInput) {
      let addInProgress = false;

      const commitNewNote = () => {
        if (addInProgress) return;
        const noteValue = noteInput.value.trim();
        if (!noteValue) return;

        addInProgress = true;
        addDayNote(currentYear, currentMonth, selectedDay, selectedShift, noteValue, null);
        renderCalendar();
        renderInfo();
        showToast('success', t('infoNoteSaved'));

        setTimeout(() => {
          addInProgress = false;
        }, 100);
      };

      noteInput.addEventListener('blur', commitNewNote);
      noteInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          noteInput.blur();
        }
      });
    }
  }
}
