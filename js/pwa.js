/* ================================================================
   PLAN ZMIAN — Module 10: PWA + NOTIFICATIONS
   ================================================================ */

/* === STAN === */
let deferredInstallPrompt = null;
let lastNotified = null; // 'YYYY-MM-DD:ZMIANA'

/**
 * Cross-platform notification display via ServiceWorker.
 * Works on Android Chrome, iOS PWA, Desktop — replaces deprecated new Notification().
 * @param {string} title
 * @param {object} options - standard Notification options + optional data
 * @returns {Promise<boolean>} - true on success
 */
function showNotificationViaServiceWorker(title, options) {
  if (!('Notification' in window)) {
    return Promise.resolve(false);
  }
  if (Notification.permission !== 'granted') {
    return Promise.resolve(false);
  }
  if (!('serviceWorker' in navigator)) {
    return Promise.resolve(false);
  }
  return navigator.serviceWorker.ready
    .then((registration) => {
      if (!registration || typeof registration.showNotification !== 'function') {
        return false;
      }
      const opts = Object.assign(
        {
          icon: './icons/icon-192.png',
          badge: './icons/icon-192.png',
        },
        options || {}
      );
      return registration.showNotification(title, opts).then(() => true);
    })
    .catch((error) => {
      console.warn('[pwa]', 'ServiceWorker.showNotification failed', error);
      return false;
    });
}

window.showNotificationViaServiceWorker = showNotificationViaServiceWorker;


/* === SERVICE WORKER + AUTO-UPDATE ===
   The SW uses a cache-first strategy and its cache name is the build id
   (`__BUILD_ID__`, replaced by CI). Locally that placeholder is never
   replaced, so the cache name never changes and a locally edited CSS/JS
   file is served from the cache forever — changes appear to "not apply".
   Skip registration on localhost / file:// so local work always shows the
   freshly edited files. */
function isLocalDevOrigin() {
  try {
    const h = window.location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '';
  } catch (e) {
    return false;
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (window.location.protocol === 'file:') return;
  if (isLocalDevOrigin()) {
    // Dev: drop any previously installed worker so it can't serve stale files.
    if (navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
    }
    if (window.caches && caches.keys) {
      caches
        .keys()
        .then((keys) => keys.forEach((k) => caches.delete(k)))
        .catch(() => {});
    }
    console.info('[PWA] Service Worker skipped on local dev origin (no stale cache).');
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {

        // Check for updates right away
        reg.update();

        // Periodic check (every 60 min)
        setInterval(() => reg.update(), 60 * 60 * 1000);

        // 1) A new version is already waiting (e.g. after F5)
        if (reg.waiting) {
          promptUserToUpdate(reg.waiting);
        }

        // 2) An update was found — watch its state
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          if (!newSW) return;

          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              // New version installed, old one still active → prompt to update
              promptUserToUpdate(newSW);
            }
          });
        });
      })
      .catch((err) => console.warn('[PWA] SW error:', err));

    // When the new SW activates → reload the page
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    // Answer from the worker after a PURGE_ALL request.
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'PURGE_DONE') {
        console.info('[PWA] Caches purged, reloading…');
        window.location.reload();
      }
    });

    // Drop leftover registrations from older scopes/builds. More than one
    // registration for the same origin means a stale worker may still be
    // serving the app shell next to the current one.
    if (navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          if (regs.length <= 1) return;
          console.warn('[PWA] Multiple service worker registrations:', regs);
          // Keep the registration that owns the currently active worker
          // (same script URL as the one we just registered), drop the rest.
          const current =
            regs.find((r) => r.active && reg.active && r.active.scriptURL === reg.active.scriptURL) ||
            regs.find((r) => r.active) ||
            regs[0];
          regs.forEach((r) => {
            if (r !== current) r.unregister().catch(() => {});
          });
        })
        .catch(() => {});
    }
  });
}

/* === HARD RESET: unregister EVERY worker + delete EVERY cache ===
   Unregistering a single registration in DevTools can leave another one alive
   (e.g. an older scope). This nukes all of them and reloads, so the next load
   starts from a clean, network-driven state. */
window.purgeServiceWorkersAndCaches = function () {
  if (!('serviceWorker' in navigator)) {
    window.location.reload();
    return;
  }

  // 1) Ask the active worker to purge from its side too.
  const controller = navigator.serviceWorker.controller;
  if (controller) {
    try {
      controller.postMessage({ type: 'PURGE_ALL' });
    } catch (e) {
      /* ignore */
    }
  }

  // 2) Unregister every registration for this origin.
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
    .catch(() => {});

  // 3) Delete every cache of this origin.
  if (window.caches && caches.keys) {
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .catch(() => {});
  }

  setTimeout(() => window.location.reload(), 600);
};

/* === Toast with an "Update" button === */
function promptUserToUpdate(waitingSW) {
  // Don't show it again if already shown this session
  if (window._updatePromptShown) return;
  window._updatePromptShown = true;

  showUpdateToast(() => {
    // Tell the new SW to take control → controllerchange → reload
    waitingSW.postMessage({ type: 'SKIP_WAITING' });
  });
}

function showUpdateToast(onUpdate) {
  const container = document.getElementById('toastContainer');
  if (!container) {
    // Fallback — if the toast container isn't ready
    if (confirm(`🔄 ${t('updateAvailable') || 'New version available'}. ${t('updateHint') || 'Click to refresh'}`)) {
      onUpdate();
    }
    return;
  }

  const toast = document.createElement('div');
  toast.className = 'toast info';
  toast.style.cssText = 'min-width: 280px; align-items: center; gap: 12px;';
  toast.innerHTML = `
    <span class="toast-icon">🔄</span>
    <div style="flex:1;">
      <div style="font-weight:700; margin-bottom:2px;">${t('updateAvailable') || 'New version available'}</div>
      <div style="font-size:12px; opacity:0.85;">${t('updateHint') || 'Click to refresh'}</div>
    </div>
    <button id="updateNowBtn" style="
      background: var(--text-header);
      color: #fff;
      border: none;
      padding: 8px 14px;
      border-radius: 8px;
      font-weight: 700;
      cursor: pointer;
      font-size: 13px;
      white-space: nowrap;
    ">${t('updateNow') || '🔄 Update'}</button>
  `;
  container.appendChild(toast);

  document.getElementById('updateNowBtn').onclick = () => {
    toast.remove();
    onUpdate();
  };

  // Do NOT auto-close — the user decides
}

/* === WYKRYWANIE PLATFORMY === */
function isIOS() {
  const ua = navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}
function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  );
}

/* === INSTALL PROMPT (Add to Home Screen) === */
function setupInstallPrompt() {
  const installItem = document.getElementById('menuInstallApp');
  if (!installItem) return;

  // iOS doesn't support beforeinstallprompt — show manual instructions
  if (isIOS()) {
    if (!isStandalone()) {
      installItem.style.display = 'flex';
      installItem.onclick = () => {
        closeSideMenu();
        showModal({
          title: `📲 ${t('installApp')}`,
          body: `
            <p>${t('installAppIosIntro')}</p>
            <ol style="margin:8px 0; padding-left:22px; font-size:13px;">
              <li>${t('installAppIosStep1')}</li>
              <li>${t('installAppIosStep2')}</li>
              <li>${t('installAppIosStep3')}</li>
            </ol>
            <p style="font-size:12px; color:var(--text-muted);">${t('installAppIosNote')}</p>
          `,
          buttons: [{ text: t('gotIt'), class: 'primary' }],
        });
      };
    } else {
      installItem.style.display = 'none';
    }
    return;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    installItem.style.display = 'flex';
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installItem.style.display = 'none';
    showToast('success', t('appInstalled'));
  });

  installItem.onclick = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice.outcome === 'accepted') showToast('success', t('installStarted'));
    else showToast('info', t('installCancelled'));
    deferredInstallPrompt = null;
    installItem.style.display = 'none';
  };
}

/* === POWIADOMIENIA (Notification API) === */
function areNotificationsEnabled() {
  return (
    prefs.notifications === true &&
    'Notification' in window &&
    Notification.permission === 'granted'
  );
}

function getNotificationStatus() {
  const supported = 'Notification' in window;
  const permission = supported ? Notification.permission : 'unsupported';
  const enabled = prefs.notifications === true && permission === 'granted';
  const lead = typeof prefs.notificationsLead === 'number' ? prefs.notificationsLead : 1;
  return { supported, permission, enabled, lead };
}
window.getNotificationStatus = getNotificationStatus;

window.setNotificationsEnabled = function (enabled) {
  return new Promise(function (resolve) {
    if (!('Notification' in window)) {
      showToast('warn', t('browserNoNotificationSupport'));
      resolve(false);
      return;
    }
    if (enabled) {
      if (Notification.permission === 'granted') {
        prefs.notifications = true;
        savePrefs(prefs);
        showToast('success', '🔔 ' + t('notificationsEnabled'));
        resolve(true);
        return;
      }
      if (Notification.permission === 'denied') {
        showToast('error', t('notificationsBlockedInBrowser'));
        resolve(false);
        return;
      }
      Notification.requestPermission().then(function (permission) {
        if (permission === 'granted') {
          prefs.notifications = true;
          savePrefs(prefs);
          showToast('success', '🔔 ' + t('notificationsEnabled'));
          showNotificationViaServiceWorker('🔔 ' + t('appName'), {
            body: t('notificationsTestBody'),
            tag: 'grafik-welcome',
          });
          resolve(true);
        } else {
          prefs.notifications = false;
          savePrefs(prefs);
          showToast('warn', t('notificationsDisabled'));
          resolve(false);
        }
      });
    } else {
      prefs.notifications = false;
      savePrefs(prefs);
      showToast('info', '🔕 ' + t('notificationsDisabled'));
      resolve(true);
    }
  });
};

window.setNotificationLead = function (lead) {
  const val = parseInt(lead, 10) || 1;
  prefs.notificationsLead = Math.max(1, Math.min(3, val));
  savePrefs(prefs);
  return prefs.notificationsLead;
};

window.sendTestNotification = function () {
  if (!('Notification' in window)) {
    showToast('warn', t('browserNoNotificationSupport'));
    return false;
  }
  if (Notification.permission !== 'granted') {
    showToast('warn', t('notificationsBlockedInBrowser'));
    return false;
  }
  showNotificationViaServiceWorker('🔔 ' + t('appName'), {
    body: t('notificationsTestBody'),
    tag: 'grafik-test',
  }).then((success) => {
    if (success) {
      showToast('success', t('notificationTestSent'));
    } else {
      showToast('error', t('browserNoNotificationSupport'));
    }
  });
  return true;
};

window.checkForAppUpdate = function () {
  if (!('serviceWorker' in navigator)) {
    showToast('error', t('aboutUpdateNotSupported'));
    return;
  }

  showToast('info', t('aboutUpdateChecking'));
  window._updatePromptShown = false;

  navigator.serviceWorker.getRegistrations()
    .then(function (regs) {
      if (!regs || regs.length === 0) {
        showToast('error', t('aboutUpdateError'));
        return;
      }
      return Promise.all(regs.map(function (reg) { return reg.update(); }));
    })
    .then(function () {
      setTimeout(function () {
        if (window._updatePromptShown) return;
        showToast('success', t('aboutUpdateUpToDate'));
      }, 2500);
    })
    .catch(function (error) {
      console.warn('[pwa]', 'checkForAppUpdate failed', error);
      showToast('error', t('aboutUpdateError'));
    });
};

function requestNotificationPermission() {
  if (!('Notification' in window)) {
    showToast('warn', t('browserNoNotificationSupport'));
    return;
  }
  if (Notification.permission === 'denied') {
    showToast('error', t('notificationsBlockedInBrowser'));
    return;
  }
  if (Notification.permission === 'granted') {
    prefs.notifications = true;
    savePrefs(prefs);
    showToast('success', '🔔 ' + t('notificationsEnabled'));
    return;
  }
  // Prosimy o pozwolenie
  Notification.requestPermission().then((permission) => {
    if (permission === 'granted') {
      prefs.notifications = true;
      savePrefs(prefs);
      showToast('success', '🔔 ' + t('notificationsEnabled'));
      // testowe powiadomienie
      showNotificationViaServiceWorker(`🔔 ${t('appName')}`, {
        body: t('notificationsTestBody'),
        tag: 'grafik-welcome',
      });
    } else {
      prefs.notifications = false;
      savePrefs(prefs);
      showToast('warn', t('notificationsDisabled'));
    }
  });
}

function toggleNotifications() {
  if (areNotificationsEnabled()) {
    prefs.notifications = false;
    savePrefs(prefs);
    showToast('info', '🔕 ' + t('notificationsDisabled'));
  } else {
    requestNotificationPermission();
  }
}

/* === CHECK FOR SHIFT START (every minute) === */
function notifyCurrentShift() {
  if (!areNotificationsEnabled()) return;

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();

  // Shift for today according to the selected brigade's schedule
  const s = getShiftAt(y, m, d, selectedShift);
  if (isWolne(s) || isUrlop(y, m, d, selectedShift)) return;

  const hours = shiftHours[s];
  if (!hours) return;
  const startHour = hours[0];

  const lead = prefs.notificationsLead || 1;
  const notifyAt = startHour - lead;

  // Show the notification when the time matches (same hour, minute 0)
  if (now.getHours() === notifyAt && now.getMinutes() === 0) {
    const key = `${y}-${m}-${d}:${s}`;
    if (lastNotified === key) return; // already shown today
    lastNotified = key;
    localStorage.setItem('grafik_last_notified', key);

    const [sh, eh] = hours;
    const timeRange = `${String(sh).padStart(2, '0')}:00 – ${String(eh % 24).padStart(2, '0')}:00`;
    // Use the existing shift names (shiftLongNames / shiftEmoji from data.js) instead of duplicating translations
    const shiftLabel = `${shiftEmoji[s] || ''} ${shiftLongNames[s] || s}`;

    const title = `⏰ ${t('shift')} ${s} — ${shiftLabel}`;
    const body = `${t('brigade')} ${selectedShift} • ${d} ${monthNamesGenitive[m - 1]} ${y}\n${timeRange}`;
    showNotificationViaServiceWorker(title, {
      body: body,
      vibrate: [200, 100, 200],
      tag: 'grafik-shift-start',
      requireInteraction: false,
      data: { url: './' },
    });
  }
}

/* === INIT === */
function initPwa() {
  registerServiceWorker();
  setupInstallPrompt();

  // Restore the last notification state.
  lastNotified = localStorage.getItem('grafik_last_notified');

  // Check every minute for the selected shift.
  window._notifyTimer = setInterval(notifyCurrentShift, 60000);
  notifyCurrentShift();
}

/* FAQ and About moved to full-screen panels (see app-shell.js and ui.js) */
// Run once that DOM has loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPwa);
} else {
  initPwa();
}
