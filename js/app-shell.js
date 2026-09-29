/* ================================================================
   PLAN ZMIAN — APP-SHELL.JS
   Reusable full-screen App Panel (with screen stack) + Action Sheet.
   Shell infrastructure for Settings / Share / Export / Admin (v4.0.0).
   Global scope via window.* — NO ES modules (AGENT.md #1).
   Exposed API:
     openAppPanel(config)    — open panel, stack reset to one screen
     pushAppPanel(config)    — push a nested screen onto the stack
     popAppPanel()           — go back one screen (closes at depth 1)
     closeAppPanel()         — close the whole panel
     isAppPanelOpen()        — true when panel is visible
     openActionSheet(config) — open single-screen action sheet
     closeActionSheet()      — close the action sheet
     isActionSheetOpen()     — true when action sheet is visible
   Config: { id, title, html, onMount(bodyElement) }
   ================================================================ */

(function () {
  'use strict';

  const el = (id) => document.getElementById(id);

  /* === STATE === */
  let panelStack = []; // [{ id, title, html, onMount }]
  let panelOpener = null; // element focused before the panel opened
  let sheetOpener = null; // element focused before the sheet opened

  /* === HELPERS === */
  function safeFocus(node) {
    if (!node || typeof node.focus !== 'function') return;
    try {
      node.focus({ preventScroll: true });
    } catch (e) {
      try {
        node.focus();
      } catch (e2) {
        /* ignore */
      }
    }
  }

  function restoreFocus(opener) {
    if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
      safeFocus(opener);
    }
  }

  function currentOpener() {
    const a = document.activeElement;
    if (a && typeof a.focus === 'function') return a;
    return null;
  }

  function normalizeConfig(config) {
    config = config || {};
    return {
      id: config.id || '',
      title: config.title || '',
      html: config.html || '',
      onMount: typeof config.onMount === 'function' ? config.onMount : null,
    };
  }

  /* ================= APP PANEL ================= */

  function updateBackButton() {
    const panel = el('appPanel');
    if (!panel) return;
    if (panelStack.length > 1) panel.classList.add('has-back');
    else panel.classList.remove('has-back');
  }

  function renderPanelScreen(screen) {
    const panel = el('appPanel');
    const title = el('appPanelTitle');
    const body = el('appPanelBody');
    if (!panel || !title || !body) return;
    if (screen.id) panel.dataset.screenId = screen.id;
    else panel.removeAttribute('data-screen-id');
    title.textContent = screen.title;
    body.innerHTML = screen.html;
    body.scrollTop = 0;
    updateBackButton();
    safeFocus(panel);
    if (screen.onMount) screen.onMount(body);
  }

  function openAppPanel(config) {
    const overlay = el('appPanelOverlay');
    const panel = el('appPanel');
    if (!panel) {
      console.warn('[app-shell] App panel markup missing (#appPanel)');
      return null;
    }
    panelOpener = currentOpener();
    panelStack = [normalizeConfig(config)];
    panel.classList.add('show');
    if (overlay) overlay.classList.add('show');
    document.body.classList.add('app-panel-open');
    renderPanelScreen(panelStack[0]);
    return panelStack[0].id || true;
  }

  function pushAppPanel(config) {
    if (!isAppPanelOpen()) return openAppPanel(config);
    const screen = normalizeConfig(config);
    panelStack.push(screen);
    renderPanelScreen(screen);
    return screen.id || true;
  }

  function popAppPanel() {
    if (!isAppPanelOpen()) return null;
    if (panelStack.length <= 1) {
      closeAppPanel();
      return null;
    }
    panelStack.pop();
    const top = panelStack[panelStack.length - 1];
    renderPanelScreen(top);
    return top.id || true;
  }

  function closeAppPanel() {
    const overlay = el('appPanelOverlay');
    const panel = el('appPanel');
    if (!panel || !panel.classList.contains('show')) return;
    panel.classList.remove('show', 'has-back');
    if (overlay) overlay.classList.remove('show');
    document.body.classList.remove('app-panel-open');
    panelStack = [];
    const opener = panelOpener;
    panelOpener = null;
    restoreFocus(opener);
  }

  function isAppPanelOpen() {
    const panel = el('appPanel');
    return !!(panel && panel.classList.contains('show'));
  }

  /* ================= ACTION SHEET ================= */

  function openActionSheet(config) {
    const overlay = el('actionSheetOverlay');
    const sheet = el('actionSheet');
    const title = el('actionSheetTitle');
    const body = el('actionSheetBody');
    if (!sheet || !body) {
      console.warn('[app-shell] Action sheet markup missing (#actionSheet)');
      return null;
    }
    sheetOpener = currentOpener();
    const screen = normalizeConfig(config);
    if (title) title.textContent = screen.title;
    if (screen.id) sheet.dataset.screenId = screen.id;
    else sheet.removeAttribute('data-screen-id');
    body.innerHTML = screen.html;
    body.scrollTop = 0;
    if (overlay) overlay.classList.add('show');
    sheet.classList.add('show');
    document.body.classList.add('action-sheet-open');
    safeFocus(sheet);
    if (screen.onMount) screen.onMount(body);
    return screen.id || true;
  }

  function closeActionSheet() {
    const overlay = el('actionSheetOverlay');
    const sheet = el('actionSheet');
    if (!sheet || !sheet.classList.contains('show')) return;
    sheet.classList.remove('show');
    if (overlay) overlay.classList.remove('show');
    document.body.classList.remove('action-sheet-open');
    const opener = sheetOpener;
    sheetOpener = null;
    restoreFocus(opener);
  }

  function isActionSheetOpen() {
    const sheet = el('actionSheet');
    return !!(sheet && sheet.classList.contains('show'));
  }

  /* ================= EVENTS ================= */

  function bindShellEvents() {
    const backBtn = el('appPanelBackBtn');
    const closeBtn = el('appPanelCloseBtn');
    const overlay = el('appPanelOverlay');
    const sheetCloseBtn = el('actionSheetCloseBtn');
    const sheetOverlay = el('actionSheetOverlay');

    if (backBtn) backBtn.addEventListener('click', () => popAppPanel());
    if (closeBtn) closeBtn.addEventListener('click', () => closeAppPanel());
    // Only a direct click on the overlay closes; clicks inside never do.
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeAppPanel();
      });
    }
    if (sheetCloseBtn) sheetCloseBtn.addEventListener('click', () => closeActionSheet());
    if (sheetOverlay) {
      sheetOverlay.addEventListener('click', (e) => {
        if (e.target === sheetOverlay) closeActionSheet();
      });
    }

    // Escape: action sheet first, then the panel. The shell owns Escape
    // while it is open — stop other global handlers (edit mode, drawer).
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (isActionSheetOpen()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeActionSheet();
        return;
      }
      if (isAppPanelOpen()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeAppPanel();
      }
    });
  }

  /* ================= EXPORT (window.*) ================= */

  window.openAppPanel = openAppPanel;
  window.pushAppPanel = pushAppPanel;
  window.popAppPanel = popAppPanel;
  window.closeAppPanel = closeAppPanel;
  window.isAppPanelOpen = isAppPanelOpen;
  window.openActionSheet = openActionSheet;
  window.closeActionSheet = closeActionSheet;
  window.isActionSheetOpen = isActionSheetOpen;

  /* ================= APP SHELL UI SYNC (v4.0.0) ================= */

  /* Single place that mirrors app state (main.js globals) into the shell:
     active nav (desktop + mobile), top title, context toolbar row
     visibility, period label, Month/Year active state, brigade label. */
  function updateAppShellUI() {
    const view = typeof currentView === 'string' ? currentView : 'dashboard';
    const year = typeof currentYear === 'number' ? currentYear : new Date().getFullYear();
    const month =
      typeof currentMonth === 'number' && currentMonth >= 1 && currentMonth <= 12
        ? currentMonth
        : new Date().getMonth() + 1;
    const isYear = yearMode === true;
    const localized = typeof t === 'function';
    const monthLabel =
      monthNames && monthNames[month - 1] ? monthNames[month - 1] : String(month);

    // 1) Active desktop navigation
    document.querySelectorAll('#primaryNav .primary-nav-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === view);
    });
    // 2) Active mobile navigation (synchronized with desktop)
    document.querySelectorAll('#mobileBottomNav .mobile-nav-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === view);
    });

    // 3) Top bar: stable app name only (period lives between the arrows).
    const title = el('appContextTitle');
    if (title) title.textContent = localized ? t('appName') : 'Plan Zmian';

    const period = el('contextPeriod');
    if (period) period.textContent = isYear ? String(year) : `${monthLabel} ${year}`;

    // 4) Context toolbar row visibility (CSS reacts to data-view)
    const toolbar = el('contextToolbar');
    if (toolbar) toolbar.dataset.view = view;

    // 5) Active Month/Year state
    document.querySelectorAll('#contextToolbar .range-btn').forEach((b) => {
      b.classList.toggle('active', (b.dataset.range === 'year') === isYear);
    });

    // 6) Brigade label (same wording on all views) - REMOVED
    // const brigLabel = el('brigadeContextLabel');
    // if (brigLabel) {
    //   brigLabel.textContent = localized ? t('contextBrigade') : '';
    // }
  }
  window.updateAppShellUI = updateAppShellUI;

  /* ================= SIDE DRAWER OWNERSHIP (v4.0.0) ================= */

  let drawerOpener = null; // element focused before the drawer opened

  function isSideMenuOpen() {
    const menu = el('sideMenu');
    return !!(menu && menu.classList.contains('show'));
  }
  window.isSideMenuOpen = isSideMenuOpen;

  function openSideMenu() {
    const menu = el('sideMenu');
    const overlay = el('sideMenuOverlay');
    if (!menu) return;
    drawerOpener = currentOpener();
    menu.classList.add('show');
    if (overlay) overlay.classList.add('show');
    document.body.classList.add('side-menu-open');
    // Defensive state refresh (moved from ui.js): Drive card status
    if (typeof updateMenuSyncStatus === 'function') {
      try {
        updateMenuSyncStatus();
      } catch (e) {
        /* ignore */
      }
    }
    if (typeof updateDriveUI === 'function') {
      try {
        updateDriveUI();
      } catch (e) {
        /* ignore */
      }
    }
    if (
      typeof handleAutoSyncCheck === 'function' &&
      typeof isDriveLoggedIn === 'function' &&
      isDriveLoggedIn()
    ) {
      try {
        // Also attempts a silent token refresh — otherwise an expired
        // access token would leave the badge stuck showing stale info
        // every time the menu is opened.
        Promise.resolve(handleAutoSyncCheck()).catch(() => {});
      } catch (e) {
        /* ignore */
      }
    }
    safeFocus(menu);
  }
  window.openSideMenu = openSideMenu;

  function closeSideMenu() {
    const menu = el('sideMenu');
    const overlay = el('sideMenuOverlay');
    if (!menu || !menu.classList.contains('show')) return;
    menu.classList.remove('show');
    if (overlay) overlay.classList.remove('show');
    document.body.classList.remove('side-menu-open');
    const opener = drawerOpener;
    drawerOpener = null;
    restoreFocus(opener);
  }
  window.closeSideMenu = closeSideMenu;

  function bindDrawerEvents() {
    const menuBtn = el('menuBtn');
    const closeBtn = el('sideMenuClose');
    const overlay = el('sideMenuOverlay');
    if (menuBtn) menuBtn.addEventListener('click', () => openSideMenu());
    if (closeBtn) closeBtn.addEventListener('click', () => closeSideMenu());
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeSideMenu();
      });
    }
  }

  /* ================= NAV BINDINGS (v4.0.0) ================= */

  function periodStep(delta) {
    // Month range steps months, Year range steps years (main.js owns state)
    if (typeof window.goToPeriod === 'function') window.goToPeriod(delta);
    else if (typeof goToMonth === 'function') goToMonth(delta);
  }

  function setYearRange(on) {
    if (typeof yearMode === 'undefined') return;
    if (yearMode === on) {
      if (typeof updateAppShellUI === 'function') updateAppShellUI();
      return;
    }
    yearMode = on;
    prefs.yearMode = on;
    savePrefs(prefs);
    if (typeof refreshViews === 'function') refreshViews();
    else if (typeof updateAppShellUI === 'function') updateAppShellUI();
  }

  function bindNavEvents() {
    // Desktop primary navigation
    document.querySelectorAll('#primaryNav .primary-nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (typeof switchView === 'function') switchView(btn.dataset.view);
      });
    });
    // Mobile bottom navigation (same destinations, active state kept in sync)
    document.querySelectorAll('#mobileBottomNav .mobile-nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (typeof switchView === 'function') switchView(btn.dataset.view);
      });
    });
    // Month/Year range switch
    document.querySelectorAll('#contextToolbar .range-btn').forEach((btn) => {
      btn.addEventListener('click', () => setYearRange(btn.dataset.range === 'year'));
    });
    // Period arrows (‹ ›)
    const prev = el('prevPeriodBtn');
    const next = el('nextPeriodBtn');
    if (prev) prev.addEventListener('click', () => periodStep(-1));
    if (next) next.addEventListener('click', () => periodStep(1));
  }

  /* ================= MENU ACTIONS (temporary, v4.0.0) ================= */

  function tt(key) {
    return typeof t === 'function' ? t(key) : key;
  }

  /* Menu feature entry points. Settings is owned by js/settings.js
     (clone-binds #menuSettings so this module must not attach a second listener). */
  function bindMenuActions() {
    const onBtn = (id, fn) => {
      const b = el(id);
      if (b) b.addEventListener('click', fn);
    };

    onBtn('menuShareCenter', () => {
      closeSideMenu();
      if (typeof openShareCenter === 'function') openShareCenter();
    });
    onBtn('menuExportCenter', () => {
      closeSideMenu();
      if (typeof openExportCenter === 'function') openExportCenter();
    });
    onBtn('menuAbout', () => {
      closeSideMenu();
      openAppPanel({
        id: 'about-panel',
        title: t('aboutTitle'),
        html: `
          <div class="about-content">
            <p><strong>${t('appName')}</strong></p>
            <p>${t('aboutDescription')}</p>
            <p><strong>${t('aboutVersion')}</strong>: <span id="about-version">2.0.0</span></p>
            <p><strong>${t('menuGitHub')}</strong>: <a href="https://github.com/servitantgit/Graffik" target="_blank" rel="noopener noreferrer">github.com/servitantgit/Graffik</a></p>
            <p><strong>${t('aboutDeveloper')}</strong>: <a href="mailto:servitant@gmail.com">servitant@gmail.com</a></p>
            <button id="about-check-update" class="btn-primary">${t('aboutCheckUpdates')}</button>
          </div>
        `,
        onMount: (body) => {
          // Set version from pkg info or meta tag
          const versionEl = body.querySelector('#about-version');
          if (versionEl) {
            // Try to get version from manifest or meta tag
            const manifestLink = document.querySelector('link[rel="manifest"]');
            if (manifestLink) {
              fetch(manifestLink.href)
                .then(resp => resp.json())
                .then(data => {
                  if (data.version) versionEl.textContent = data.version;
                })
                .catch(() => {/* ignore */});
            }
          }
          // Check for updates button
          const checkUpdateBtn = body.querySelector('#about-check-update');
          if (checkUpdateBtn) {
            checkUpdateBtn.onclick = () => {
              window.checkForAppUpdate();
            };
          }
        }
      });
    });
    onBtn('menuAdminCenter', () => {
      closeSideMenu();
      if (typeof openAdminCenter === 'function') openAdminCenter();
    });
  }

  /* ================= INIT ================= */

  function bindAll() {
    bindShellEvents();
    bindNavEvents();
    bindDrawerEvents();
    bindMenuActions();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindAll);
  } else {
    bindAll();
  }
})();
