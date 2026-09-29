/* ================================================================
   PLAN ZMIAN — Module 8: ACTIONS (ICS, PRINT, SHARE, MENU)
   ================================================================ */

function bindClick(id, handler) {
  const el = document.getElementById(id);
  if (el) {
    el.onclick = handler;
  } else {
    console.warn(`[actions.js] Element #${id} not found in DOM`);
  }
}

/* === ICS EXPORT === */
function exportICS() {
  let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Plan Zmian//PL\r\n';
  const ySched = getYearSchedule(currentYear);
  function pad(n) {
    return String(n).padStart(2, '0');
  }
  for (let m = 1; m <= 12; m++) {
    const arr = ySched[m][selectedShift];
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i];
      if (isWolne(s)) continue;
      if (isUrlop(currentYear, m, i + 1, selectedShift)) continue;
      const [sh, eh] = shiftHours[s];
      const dt = new Date(currentYear, m - 1, i + 1);
      const startDt = new Date(dt);
      startDt.setHours(sh, 0, 0);
      const endDt = new Date(dt);
      endDt.setHours(eh, 0, 0);
      const fmt = (d) =>
        d.getFullYear() +
        pad(d.getMonth() + 1) +
        pad(d.getDate()) +
        'T' +
        pad(d.getHours()) +
        pad(d.getMinutes()) +
        '00';
      ics += `BEGIN:VEVENT\r\nUID:${currentYear}-${m}-${i + 1}-${selectedShift}@gillette\r\nDTSTART:${fmt(startDt)}\r\nDTEND:${fmt(endDt)}\r\nSUMMARY:${s} - Brygada ${selectedShift}\r\nEND:VEVENT\r\n`;
    }
  }
  (urlops[selectedShift] || []).forEach((k) => {
    const parts = k.split('-').map(Number);
    if (parts.length !== 3 || parts[0] !== currentYear) return;
    const yy = parts[0],
      mm = parts[1],
      dd = parts[2];
    const fmtD = (dt) =>
      dt.getFullYear() +
      String(dt.getMonth() + 1).padStart(2, '0') +
      String(dt.getDate()).padStart(2, '0');
    const dt = new Date(yy, mm - 1, dd);
    const dtEnd = new Date(dt);
    dtEnd.setDate(dd + 1);
    ics += `BEGIN:VEVENT\r\nUID:urlop-${k}-${selectedShift}@gillette\r\nDTSTART;VALUE=DATE:${fmtD(dt)}\r\nDTEND;VALUE=DATE:${fmtD(dtEnd)}\r\nSUMMARY:🌴 URLOP - Brygada ${selectedShift}\r\nEND:VEVENT\r\n`;
  });
  ics += 'END:VCALENDAR\r\n';
  const blob = new Blob([ics], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `grafik_${selectedShift}_${currentYear}.ics`;
  a.click();
  showToast('success', t('exportSuccess'));
}
/* === EXPORT CENTER === */
function openExportCenter() {
  const html = `
    <div style="padding: 24px;">
      <div style="margin-bottom: 20px;">
        <strong>${t('exportCenterTitle')}</strong>
      </div>
      
      <!-- Export ICS -->
      <div style="background: var(--bg-cell); border: 1px solid var(--border-cell); border-radius: 12px; padding: 16px; margin-bottom: 16px;">
        <div style="display: flex; align-items: flex-start; gap: 12px;">
          <div style="flex-shrink: 0;">
            <span style="font-size: 24px;">📤</span>
          </div>
          <div>
            <div style="font-weight: 600; margin-bottom: 4px;">${t('exportIcsTitle')}</div>
            <div style="font-size: 14px; color: var(--text-muted);">${t('exportIcsDesc')}</div>
          </div>
        </div>
        <button id="exportIcsBtn" class="modal-btn primary" style="width: 100%; margin-top: 12px; padding: 12px;">
          ${t('exportIcsTitle')}
        </button>
      </div>

      <!-- Print -->
      <div style="background: var(--bg-cell); border: 1px solid var(--border-cell); border-radius: 12px; padding: 16px;">
        <div style="display: flex; align-items: flex-start; gap: 12px;">
          <div style="flex-shrink: 0;">
            <span style="font-size: 24px;">🖨️</span>
          </div>
          <div>
            <div style="font-weight: 600; margin-bottom: 4px;">${t('printCurrentTitle')}</div>
            <div style="font-size: 14px; color: var(--text-muted);">${t('printCurrentDesc')}</div>
          </div>
        </div>
        <button id="printBtn" class="modal-btn primary" style="width: 100%; margin-top: 12px; padding: 12px;">
          ${t('printCurrentTitle')}
        </button>
      </div>
    </div>
  `;
  
  openActionSheet({
    id: 'export-center',
    title: t('exportCenterTitle'),
    html: html,
    onMount: (bodyElement) => {
      // Export ICS handler
      const exportIcsBtn = bodyElement.querySelector('#exportIcsBtn');
      if (exportIcsBtn) {
        exportIcsBtn.onclick = () => {
          closeActionSheet();
          exportICS();
        };
      }
      
      // Print handler
      const printBtn = bodyElement.querySelector('#printBtn');
      if (printBtn) {
        printBtn.onclick = () => {
          closeActionSheet();
          window.print();
        };
      }
    }
  });
}

// Expose globally
window.openExportCenter = openExportCenter;

/* === SHARE === */
function buildShareUrl() {
  const params = new URLSearchParams();
  params.set('view', currentView);
  params.set('y', currentYear);

  // Rok mode
  if (yearMode && (currentView === 'month' || currentView === 'table')) {
    params.set('rok', '1');
  }

  // Month/table without yearMode
  if (currentView === 'month' || (currentView === 'table' && !yearMode)) {
    params.set('m', currentMonth);
  }

  // Day (only for month with a selected day)
  if (currentView === 'month' && selectedDay && !yearMode) {
    params.set('d', selectedDay);
  }

  // Brigade (for all views except table)
  if (currentView !== 'table') {
    params.set('brig', selectedShift);
  }

  return `${location.origin}${location.pathname}?${params.toString()}`;
}

function buildShareText() {
  // Description of what is being shared (for the message text)
  const viewNames = {
    dashboard: t('viewDashboard'),
    month: yearMode
      ? t('yearViewTitle', { year: currentYear })
      : `${monthNames[currentMonth - 1]} ${currentYear}`,
    table: yearMode
      ? t('yearViewTitle', { year: currentYear })
      : t('monthViewTitle', { month: monthNames[currentMonth - 1], year: currentYear }),
  };

  let text = `📅 ${viewNames[currentView]}`;

  if (currentView === 'month' && selectedDay && !yearMode) {
    text = `📅 ${selectedDay} ${monthNamesGenitive[currentMonth - 1]} ${currentYear}`;
  }

  if (currentView !== 'table') {
    text += ` • Brygada ${selectedShift}`;
  }

  return text;
}

function shareCurrent() {
  const url = buildShareUrl();
  const text = buildShareText();
  const isLocal = location.protocol === 'file:' || !location.origin || location.origin === 'null';

  // Local file: copy text without URL
  if (isLocal) {
    const content = `${text}\n🏭 ${t('appName')}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(content)
        .then(() => showToast('success', t('shareCopied')))
        .catch(() => showToast('error', t('shareCopyFailed')));
    } else {
      showToast('error', t('shareCopyFailed'));
    }
    return;
  }

  // Native share (mobile)
  if (navigator.share) {
    navigator
      .share({ title: t('appName'), text, url })
      .then(() => showToast('success', t('shareSuccess')))
      .catch(() => copyToClipboard(url));
  } else {
    copyToClipboard(url);
  }
}

function copyToClipboard(url) {
  if (navigator.clipboard) {
    navigator.clipboard
      .writeText(url)
      .then(() => showToast('success', t('shareLinkCopied')))
      .catch(() => showToast('error', t('shareLinkFailed')));
  } else {
    showToast('error', t('shareLinkFailed'));
  }
}

/* === MENU: OPCJE === */

function openVacationLimitModal() {
  const currentLimit = getVacationLimit(selectedShift);
  const body = `
    <p>${t('vacationLimitBody', { brig: selectedShift })}</p>
    <input id="vacationLimitInput" type="number" min="0" step="1" value="${currentLimit}" style="width:100%; padding:10px; border:1px solid var(--border-cell); border-radius:8px; font-size:16px;">
  `;
  showModal({
    title: t('vacationLimitTitle'),
    body,
    buttons: [
      { text: t('vacationLimitCancel'), class: 'secondary' },
      {
        text: t('vacationLimitSave'),
        class: 'primary',
        onClick: () => {
          const input = document.getElementById('vacationLimitInput');
          const parsed = Number(input.value);
          if (!Number.isFinite(parsed) || parsed < 0) {
            showToast('error', t('vacationLimitInvalid'));
            return;
          }
          setVacationLimit(selectedShift, parsed);
          showToast('success', t('vacationLimitSet', { brig: selectedShift, n: parsed }));
          refreshViews();
        },
      },
    ],
  });
}

/* === CZYSZCZENIE ROKU / RESET === */

/* === SHARE APP HELPERS === */
function getAppUrl() {
  return `${location.origin}${location.pathname}`;
}

function buildQRCodeUrl(text, size) {
  const qrSize = Number(size) > 0 ? Number(size) : 250;
  return (
    `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}` +
    `&data=${encodeURIComponent(text)}&margin=10`
  );
}

/* === SHARE CENTER === */
function openShareCenter() {
  if (typeof openActionSheet !== 'function') {
    console.error('[actions]', 'Action sheet API is not available');
    return;
  }

  const isLocal =
    location.protocol === 'file:' || !location.origin || location.origin === 'null';
  const appUrl = getAppUrl();
  let activeTab = 'application';

  function copyShareValue(value, successKey, failureKey) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(value)
        .then(() => showToast('success', t(successKey)))
        .catch(() => showToast('error', t(failureKey)));
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      const copied = document.execCommand('copy');
      showToast(copied ? 'success' : 'error', t(copied ? successKey : failureKey));
    } catch (error) {
      console.warn('[actions]', 'Clipboard fallback failed', error);
      showToast('error', t(failureKey));
    } finally {
      textarea.remove();
    }
  }

  function renderCurrentViewTab() {
    const shareUrl = buildShareUrl();
    const shareText = buildShareText();
    const safeUrl = escapeHtml(shareUrl);
    const safeText = escapeHtml(shareText);

    return `
      <div class="share-center-panel" data-share-panel="current">
        <div class="share-preview">
          <div class="share-preview-label">${t('shareContextPreview')}</div>
          <div class="share-preview-text">${safeText}</div>
          <div class="share-preview-url">${safeUrl}</div>
        </div>

        <div class="share-actions">
          <button type="button" class="modal-btn secondary" data-share-action="copy-current">
            📋 ${t('shareCopyCurrentLink')}
          </button>
          <button type="button" class="modal-btn primary" data-share-action="native-current">
            🔗 ${t('shareAppShare')}
          </button>
        </div>
      </div>
    `;
  }

  function renderApplicationTab() {
    const safeAppUrl = escapeHtml(appUrl);
    const qrUrl = buildQRCodeUrl(appUrl, 280);

    return `
      <div class="share-center-panel" data-share-panel="application">
        <div class="share-qr" data-share-qr>
          <img
            data-share-qr-image
            src="${qrUrl}"
            alt="QR Code"
            width="240"
            height="240"
          >
          <div class="share-qr-error" data-share-qr-error hidden>
            ⚠️ ${t('shareAppQrError')}
          </div>
        </div>

        <div class="share-preview">
          <div class="share-preview-label">${t('shareApplication')}</div>
          <div class="share-preview-url">${safeAppUrl}</div>
        </div>

        <div class="share-actions">
          <button type="button" class="modal-btn secondary" data-share-action="copy-app">
            📋 ${t('shareCopyAppLink')}
          </button>
          <button type="button" class="modal-btn primary" data-share-action="native-app">
            🔗 ${t('shareAppShare')}
          </button>
        </div>
      </div>
    `;
  }

  function renderActiveTab(bodyElement) {
    const content = bodyElement.querySelector('[data-share-content]');
    if (!content) {
      console.error('[actions]', 'Share Center content container is missing');
      return;
    }

    bodyElement.querySelectorAll('[data-share-tab]').forEach((button) => {
      const isActive = button.dataset.shareTab === activeTab;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    content.innerHTML =
      activeTab === 'application' ? renderApplicationTab() : renderCurrentViewTab();

    const copyCurrentButton = content.querySelector('[data-share-action="copy-current"]');
    if (copyCurrentButton) {
      copyCurrentButton.addEventListener('click', () => {
        copyShareValue(buildShareUrl(), 'shareLinkCopied', 'shareLinkFailed');
      });
    }

    const nativeCurrentButton = content.querySelector('[data-share-action="native-current"]');
    if (nativeCurrentButton) {
      nativeCurrentButton.addEventListener('click', () => {
        const shareUrl = buildShareUrl();
        const shareText = buildShareText();

        if (navigator.share && !isLocal) {
          navigator
            .share({
              title: t('appName'),
              text: shareText,
              url: shareUrl,
            })
            .then(() => showToast('success', t('shareSuccess')))
            .catch((error) => {
              if (error && error.name === 'AbortError') return;
              console.warn('[actions]', 'Native current-view share failed', error);
              copyShareValue(shareUrl, 'shareLinkCopied', 'shareLinkFailed');
            });
          return;
        }

        const localValue = isLocal ? `${shareText}\n🏭 ${t('appName')}` : shareUrl;
        copyShareValue(localValue, 'shareCopied', 'shareCopyFailed');
      });
    }

    const copyAppButton = content.querySelector('[data-share-action="copy-app"]');
    if (copyAppButton) {
      copyAppButton.addEventListener('click', () => {
        copyShareValue(appUrl, 'shareAppCopied', 'shareCopyFailed');
      });
    }

    const nativeAppButton = content.querySelector('[data-share-action="native-app"]');
    if (nativeAppButton) {
      nativeAppButton.addEventListener('click', () => {
        if (navigator.share && !isLocal) {
          navigator
            .share({
              title: t('appName'),
              text: t('shareAppText'),
              url: appUrl,
            })
            .then(() => showToast('success', t('shareSuccess')))
            .catch((error) => {
              if (error && error.name === 'AbortError') return;
              console.warn('[actions]', 'Native application share failed', error);
              copyShareValue(appUrl, 'shareAppCopied', 'shareCopyFailed');
            });
          return;
        }

        copyShareValue(appUrl, 'shareAppCopied', 'shareCopyFailed');
      });
    }

    const qrImage = content.querySelector('[data-share-qr-image]');
    const qrError = content.querySelector('[data-share-qr-error]');
    if (qrImage && qrError) {
      qrImage.addEventListener('error', () => {
        qrImage.hidden = true;
        qrError.hidden = false;
      });
    }
  }

  const html = `
    <div class="share-center">
      <div class="share-tabs" role="tablist">
        <button
          type="button"
          class="share-tab-btn"
          data-share-tab="current"
          role="tab"
          aria-selected="false"
        >
          ${t('shareCurrentView')}
        </button>
        <button
          type="button"
          class="share-tab-btn active"
          data-share-tab="application"
          role="tab"
          aria-selected="true"
        >
          ${t('shareApplication')}
        </button>
      </div>

      <div class="share-center-content" data-share-content></div>
    </div>
  `;

  openActionSheet({
    id: 'share-center',
    title: t('shareCenterTitle'),
    html,
    onMount: (bodyElement) => {
      bodyElement.querySelectorAll('[data-share-tab]').forEach((button) => {
        button.addEventListener('click', () => {
          activeTab = button.dataset.shareTab;
          renderActiveTab(bodyElement);
        });
      });

      renderActiveTab(bodyElement);
    },
  });
}

window.getAppUrl = getAppUrl;
window.buildQRCodeUrl = buildQRCodeUrl;
window.openShareCenter = openShareCenter;
