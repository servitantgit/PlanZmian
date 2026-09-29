/* ================================================================
   PLAN ZMIAN — Module 11: GOOGLE DRIVE SYNC
   (bez serwera / bez bazy danych — czysto klienckie)
   ================================================================ */

const DRIVE_CLIENT_ID_KEY = 'grafik_drive_client_id';
const DRIVE_FILE_NAME = 'grafik-gillette-data.json';
const DRIVE_MIME = 'application/json';
/**
 * Narrow, stable scope used for every token request. Kept deliberately free of
 * identity scopes: adding a scope invalidates the existing Google grant, which
 * turns every silent (prompt:'') refresh into a visible login screen.
 */
const DRIVE_SCOPE =
  'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata';
/**
 * Identity scope is appended ONLY until the user e-mail has been learned once
 * (needed by js/admin.js). After it is cached, token requests go back to the
 * narrow DRIVE_SCOPE and the already-granted superset keeps silent refresh
 * working — so the "app wants your profile" screen appears at most once.
 */
const IDENTITY_SCOPE = 'openid email';
const DRIVE_TOKEN_SCOPE_KEY = 'grafik_drive_token_scope';
const DRIVE_EMAIL_TRIES_KEY = 'grafik_drive_email_tries';
const DRIVE_EMAIL_MAX_TRIES = 3;

let gDriveTokenClient = null;
let gDriveToken = localStorage.getItem('grafik_drive_token') || null;
let gDriveTokenExpiry = parseInt(localStorage.getItem('grafik_drive_token_expiry') || '0', 10);
let gDriveFileId = localStorage.getItem('grafik_drive_file_id') || null;
let driveUserEmail = localStorage.getItem('grafik_drive_user_email') || null;
/** Scope string Google actually granted with the last token (persisted). */
let gDriveGrantedScope = localStorage.getItem(DRIVE_TOKEN_SCOPE_KEY) || '';
const DEFAULT_CLIENT_ID =
  '384517397558-agfoqvv4pv5nbkejhc9i7hbg86qs6her.apps.googleusercontent.com';
let gDriveClientId = localStorage.getItem(DRIVE_CLIENT_ID_KEY) || DEFAULT_CLIENT_ID;

/* === POMOCNICZE === */
const DRIVE_SESSION_KEY = 'grafik_drive_had_session';
const DRIVE_SESSION_COOKIE = 'grafik_drive_session';
const DRIVE_REMOTE_MT_KEY = 'grafik_drive_remote_mtime';
const ICON_GOOGLE_G = '<svg class="mi-svg mi-google" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>';
const ICON_DRIVE = '<svg class="mi-svg mi-drive" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#1FA463" d="M8.5 3.5h7L22 15h-7z"/><path fill="#FFBA00" d="M2 15l3.5 6h13L15 15z"/><path fill="#4285F4" d="M8.5 3.5L2 15h7l6.5-11.5z"/></svg>';

let gDriveRemoteNewer = false;
let gDriveRemoteCheckAt = 0;
let gDriveCheckStale = false; // true when we could not verify Drive (e.g. token expired and silent refresh failed)

let gDriveRefreshTimer = null;
let gDriveTokenInflight = null; // Promise for concurrent refresh requests

function isDriveTokenValid() {
  return !!(gDriveToken && Date.now() < gDriveTokenExpiry - 60000);
}

/** User opt-in for Google Drive (Settings → Privacy). When false, never load GIS / login / refresh. */

/** Turn Drive backup on/off (menu switch + Settings share this). */
function setDriveFeatureEnabled(on, opts) {
  const next = !!on;
  try {
    if (typeof prefs !== 'undefined' && prefs) {
      prefs.driveEnabled = next;
      if (typeof savePrefs === 'function') savePrefs(prefs, true);
      else if (typeof savePrefsSafe === 'function') savePrefsSafe();
    }
  } catch (e) {
    console.warn('[SYNC] setDriveFeatureEnabled save failed', e);
  }
  if (!next && typeof scheduleDriveTokenRefresh === 'function') {
    try { scheduleDriveTokenRefresh(); } catch (_) {}
  }
  const silent = opts && opts.silent;
  if (!silent && typeof showToast === 'function' && typeof t === 'function') {
    showToast('success', t(next ? 'driveFeatureEnabledToast' : 'driveFeatureDisabledToast'));
  }
  try { updateMenuSyncStatus(); } catch (_) {}
  try { updateDriveUI(); } catch (_) {}
  return next;
}

function driveFeatureOn() {
  if (typeof isDriveFeatureEnabled === 'function') return isDriveFeatureEnabled();
  try {
    if (typeof prefs !== 'undefined' && prefs && typeof prefs.driveEnabled === 'boolean') {
      return prefs.driveEnabled === true;
    }
  } catch (_) {}
  return false;
}

/**
 * Whether automatic Google Drive synchronization is enabled.
 * True only when Drive backup is ON and the manual-only preference is OFF.
 * Gates background Drive checks and token refresh; manual Upload/Download and
 * explicit login are never affected.
 */
function isDriveAutoSyncEnabled() {
  return driveFeatureOn() && prefs.driveAutoSync === true;
}
window.isDriveAutoSyncEnabled = isDriveAutoSyncEnabled;

/** True when the e-mail is still unknown and worth asking Google for. */
function needIdentityScope() {
  if (driveUserEmail) return false;
  const tries = parseInt(localStorage.getItem(DRIVE_EMAIL_TRIES_KEY) || '0', 10);
  return !(tries >= DRIVE_EMAIL_MAX_TRIES);
}

/** Scope to request right now — narrow unless the e-mail is still missing. */
function getRequestedScope() {
  return needIdentityScope() ? DRIVE_SCOPE + ' ' + IDENTITY_SCOPE : DRIVE_SCOPE;
}

/**
 * Whether Google already granted the Drive scopes we need. Lets us attempt a
 * silent refresh (and skip the consent popup) instead of assuming the worst.
 */
function hasGrantedDriveScopes() {
  if (!gDriveGrantedScope) return false;
  const wanted = DRIVE_SCOPE.split(' ').filter(Boolean);
  try {
    if (
      typeof google !== 'undefined' &&
      google.accounts &&
      google.accounts.oauth2 &&
      typeof google.accounts.oauth2.hasGrantedAllScopes === 'function'
    ) {
      return google.accounts.oauth2.hasGrantedAllScopes(
        { scope: gDriveGrantedScope },
        ...wanted
      );
    }
  } catch (_) {
    /* fall through to the string check below */
  }
  const granted = gDriveGrantedScope.split(' ').filter(Boolean);
  return wanted.every((s) => granted.includes(s));
}

/** Reads the long-lived session marker cookie (survives localStorage purges). */
function readDriveSessionCookie() {
  try {
    return (document.cookie || '')
      .split(';')
      .some((c) => c.trim().startsWith(DRIVE_SESSION_COOKIE + '=1'));
  } catch (_) {
    return false;
  }
}

/**
 * Asks the browser to keep our storage from being evicted. Without this,
 * iOS Safari drops localStorage for a site unused for ~7 days, which wipes the
 * session marker and makes the app fall back to a full interactive login.
 */
function requestPersistentDriveStorage() {
  try {
    if (navigator.storage && navigator.storage.persist && navigator.storage.persisted) {
      navigator.storage
        .persisted()
        .then((already) => {
          if (!already) navigator.storage.persist().catch(() => {});
        })
        .catch(() => {});
    }
  } catch (_) {
    /* not supported — nothing to do */
  }
}

/**
 * User had a Drive session before (even if access token expired). Deliberately
 * checks several independent traces, so losing one storage key does not force
 * a fresh login.
 */
function hadDriveSession() {
  return (
    localStorage.getItem(DRIVE_SESSION_KEY) === '1' ||
    readDriveSessionCookie() ||
    !!driveUserEmail ||
    !!localStorage.getItem('grafik_drive_token') ||
    !!gDriveGrantedScope ||
    !!localStorage.getItem('grafik_drive_file_id')
  );
}

/**
 * Logged-in for UI / personal data until explicit logout.
 * Access token may expire (~1h); background refresh restores it for API calls.
 */
function isDriveLoggedIn() {
  return hadDriveSession() || isDriveTokenValid();
}

function markDriveSession() {
  localStorage.setItem(DRIVE_SESSION_KEY, '1');
  try {
    document.cookie =
      DRIVE_SESSION_COOKIE + '=1; path=/; max-age=31536000; SameSite=Lax';
  } catch (_) {}
  requestPersistentDriveStorage();
}

function clearDriveSessionFlag() {
  localStorage.removeItem(DRIVE_SESSION_KEY);
  try {
    document.cookie = DRIVE_SESSION_COOKIE + '=; path=/; max-age=0; SameSite=Lax';
  } catch (_) {}
}

function getStoredRemoteMtime() {
  const n = Number(localStorage.getItem(DRIVE_REMOTE_MT_KEY) || 0);
  return Number.isFinite(n) ? n : 0;
}
function setStoredRemoteMtime(isoOrMs) {
  let ms = 0;
  if (typeof isoOrMs === 'number') ms = isoOrMs;
  else if (isoOrMs) ms = Date.parse(isoOrMs) || 0;
  if (ms > 0) localStorage.setItem(DRIVE_REMOTE_MT_KEY, String(ms));
}
function clearStoredRemoteMtime() {
  localStorage.removeItem(DRIVE_REMOTE_MT_KEY);
}

/**
 * Compare Drive file modifiedTime with last local sync.
 * Sets gDriveRemoteNewer for menu status.
 */
async function checkDriveRemoteStatus(force = false) {
  // Only when a still-valid token exists — never trigger OAuth from menu open
  if (!isDriveTokenValid()) {
    gDriveRemoteNewer = false;
    return false;
  }
  try {
    const found = await findDriveFile();
    if (!found || !found.modifiedTime) {
      gDriveRemoteNewer = false;
      updateMenuSyncStatus();
      return false;
    }
    if (found.id) {
      gDriveFileId = found.id;
      localStorage.setItem('grafik_drive_file_id', gDriveFileId);
    }
    const remoteMs = Date.parse(found.modifiedTime) || 0;
    setStoredRemoteMtime(remoteMs);
    const meta = typeof getSyncMeta === 'function' ? getSyncMeta() : { lastSync: 0 };
    // remote is newer if modified after last successful sync (8s slack for clock skew)
    gDriveRemoteNewer = remoteMs > (meta.lastSync || 0) + 8000;
    updateMenuSyncStatus();
    return gDriveRemoteNewer;
  } catch (e) {
    console.warn('[SYNC] checkDriveRemoteStatus', e);
    return gDriveRemoteNewer;
  }
}

/**
 * Auto-sync helper: check Drive, auto-download if safe, warn on conflict.
 * Called on page load, visibility change, and can be called manually.
 * @returns {Promise<'idle'|'up-to-date'|'downloaded'|'conflict'|'error'>}
 */
async function handleAutoSyncCheck() {
  // Manual-only mode: no background Drive checks and no silent token refresh.
  // Manual syncWithDrive()/Upload/Download/login never go through this gate.
  if (!isDriveAutoSyncEnabled()) {
    return 'idle';
  }

  if (!isDriveLoggedIn()) {
    return 'idle';
  }

  // Try a silent (no popup) token refresh before giving up. An access token
  // expires after ~1h; without this, a backgrounded phone that reopens after
  // that window silently stops checking Drive at all — no error, no badge
  // update — until the user manually logs out and back in.
  if (!(await ensureDriveToken(false))) {
    gDriveCheckStale = true;
    updateMenuSyncStatus();
    return 'idle';
  }
  gDriveCheckStale = false;

  try {
    const remoteNewer = await checkDriveRemoteStatus(true);
    if (!remoteNewer) {
      updateMenuSyncStatus();
      return 'up-to-date';
    }

    const hasLocal =
      typeof hasUnsyncedChanges === 'function' && hasUnsyncedChanges();

    if (!hasLocal) {
      // Safe auto-download
      const ok = await downloadFromDrive(false);
      if (ok) {
        showToast('success', '☁️ ' + t('driveAutoSynced'));
        return 'downloaded';
      }
      return 'error';
    }

    // Both local and remote look changed by the cheap mtime heuristic —
    // before alarming the user, verify against the actual remote content.
    // Two known false-positive causes:
    //  1) local changes were already uploaded, but the fingerprint on this
    //     device just hadn't been reconciled yet;
    //  2) device clock skew made the mtime comparison wrong even though the
    //     remote revision isn't actually ahead of what we already know.
    const remotePayload = await fetchDriveRemotePayload();
    if (remotePayload) {
      if (
        typeof reconcileSyncedFingerprint === 'function' &&
        reconcileSyncedFingerprint(remotePayload)
      ) {
        gDriveRemoteNewer = false;
        updateMenuSyncStatus();
        return 'up-to-date';
      }

      if (typeof isRemoteAheadByRevision === 'function') {
        const localRevision =
          typeof getSyncRevision === 'function' ? getSyncRevision() : 0;
        const aheadByRevision = isRemoteAheadByRevision(localRevision, remotePayload);
        // false (not null) means the remote's own revision counter is not
        // ahead of what this device already knows — trust that over the
        // clock-based mtime guess.
        if (aheadByRevision === false) {
          updateMenuSyncStatus();
          return 'up-to-date';
        }
      }
    }

    // Confirmed conflict: local changes + remote genuinely moved on.
    if (!window._syncConflictWarned) {
      window._syncConflictWarned = true;
      showToast('warn', '⚠️ ' + t('driveSyncConflictWarn'));
    }
    updateMenuSyncStatus();
    return 'conflict';
  } catch (error) {
    console.warn('[sync]', 'handleAutoSyncCheck failed', error);
    return 'error';
  }
}

window.handleAutoSyncCheck = handleAutoSyncCheck;

/** Re-render current view after Google Drive authentication. */
function refreshAfterDriveAuth() {
  if (typeof updateAdminUI === 'function') {
    try { updateAdminUI(); } catch (_) {}
  }
  if (typeof updateDriveUI === 'function') {
    try { updateDriveUI(); } catch (_) {}
  }
  if (typeof refreshViews === 'function') {
    try { refreshViews(); return; } catch (_) {}
  }
  if (typeof renderDashboard === 'function') {
    try { renderDashboard(); } catch (_) {}
  }
  if (typeof renderCalendar === 'function') {
    try { renderCalendar(); } catch (_) {}
  }
  if (typeof renderInfo === 'function') {
    try { renderInfo(); } catch (_) {}
  }
}

function persistDriveToken(accessToken, expiresInSec, grantedScope) {
  gDriveToken = accessToken;
  const sec = Number(expiresInSec) > 0 ? Number(expiresInSec) : 3600;
  gDriveTokenExpiry = Date.now() + sec * 1000;
  localStorage.setItem('grafik_drive_token', gDriveToken);
  localStorage.setItem('grafik_drive_token_expiry', String(gDriveTokenExpiry));
  if (grantedScope) {
    gDriveGrantedScope = String(grantedScope);
    localStorage.setItem(DRIVE_TOKEN_SCOPE_KEY, gDriveGrantedScope);
  }
  markDriveSession();
  scheduleDriveTokenRefresh();
}

/**
 * Schedules a silent (no popup) token refresh ~5 min before expiry while the
 * app stays open, so a foregrounded session never runs out of a valid token.
 * This is a best-effort background refresh only — it does not replace the
 * on-demand silent refresh in ensureDriveToken(), which covers the far more
 * common case of the app being backgrounded/closed past the ~1h expiry and
 * reopened later (background timers don't fire reliably while suspended).
 */
function scheduleDriveTokenRefresh() {
  if (gDriveRefreshTimer) {
    clearTimeout(gDriveRefreshTimer);
    gDriveRefreshTimer = null;
  }
  // Manual-only mode: never schedule a background token refresh.
  if (!isDriveAutoSyncEnabled()) return;
  if (!driveFeatureOn()) return;
  if (!gDriveTokenExpiry) return;
  const delay = gDriveTokenExpiry - Date.now() - 5 * 60000;
  if (delay <= 0) return; // already due — next ensureDriveToken() call covers it
  gDriveRefreshTimer = setTimeout(() => {
    gDriveRefreshTimer = null;
    if (document.visibilityState === 'visible') {
      requestDriveAccessToken({ interactive: false }).catch(() => {});
    }
  }, delay);
}

/**
 * Fetches the logged-in user's email from the Google API.
 * Wymagany scope: 'openid email' w DRIVE_SCOPE.
 * Wynik zapisywany do driveUserEmail + localStorage.
 * Called after a successful login.
 */
async function fetchDriveUserEmail() {
  if (driveUserEmail) return driveUserEmail; // asked once, cached forever
  if (!gDriveToken) {
    console.warn('[SYNC] fetchDriveUserEmail: no token');
    return null;
  }
  if (!needIdentityScope()) return null; // gave up after repeated failures
  const bumpTries = () => {
    const tries = parseInt(localStorage.getItem(DRIVE_EMAIL_TRIES_KEY) || '0', 10) + 1;
    localStorage.setItem(DRIVE_EMAIL_TRIES_KEY, String(tries));
  };
  try {
    const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + gDriveToken },
    });
    if (!resp.ok) {
      console.warn('[SYNC] fetchDriveUserEmail failed:', resp.status);
      bumpTries();
      return null;
    }
    const data = await resp.json();
    if (data && data.email) {
      driveUserEmail = data.email.toLowerCase();
      localStorage.setItem('grafik_drive_user_email', driveUserEmail);
      localStorage.removeItem(DRIVE_EMAIL_TRIES_KEY);
      if (typeof updateAdminUI === 'function') {
        updateAdminUI();
      }
      return driveUserEmail;
    }
  } catch (e) {
    console.error('[SYNC] fetchDriveUserEmail error:', e);
    bumpTries();
    return null;
  }
  bumpTries();
  return null;
}

function loadGis() {
  return new Promise((resolve) => {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2)
      return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

function initGDriveTokenClient() {
  if (!gDriveClientId || typeof google === 'undefined' || !google.accounts) return false;
  try {
    // prompt is set per requestAccessToken call ('' = silent, consent = interactive)
    gDriveTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: gDriveClientId,
      // Narrow by default; getRequestedScope() widens it only for the very
      // first login (until the e-mail is cached). include_granted_scopes keeps
      // previously granted scopes attached instead of replacing the grant.
      scope: getRequestedScope(),
      include_granted_scopes: true,
      callback: (resp) => {
        if (resp && resp.access_token) {
          persistDriveToken(resp.access_token, resp.expires_in, resp.scope);
          if (gDriveTokenInflight && gDriveTokenInflight._resolve) {
            gDriveTokenInflight._resolve(true);
            gDriveTokenInflight = null;
          }
          // Toast only for interactive login (not silent refresh)
          if (gDriveTokenClient && gDriveTokenClient._lastInteractive) {
            showToast('success', `☁️ ${t('driveLoggedIn')}`);
            gDriveTokenClient._lastInteractive = false;
          }
          fetchDriveUserEmail().finally(() => {
            refreshAfterDriveAuth();
            try {
              window.dispatchEvent(new CustomEvent('driveAuthChanged', { detail: { loggedIn: true } }));
            } catch (_) {}
          });
        } else {
          if (gDriveTokenInflight && gDriveTokenInflight._resolve) {
            gDriveTokenInflight._resolve(false);
            gDriveTokenInflight = null;
          }
          // Silent failure: do not toast (expired session / no Google cookie)
          if (gDriveTokenClient && gDriveTokenClient._lastInteractive) {
            showToast('error', `☁️ ${t('driveLoginFailed')}`);
            gDriveTokenClient._lastInteractive = false;
          }
        }
      },
      error_callback: (err) => {
        console.warn('[SYNC] token error:', err);
        if (gDriveTokenInflight && gDriveTokenInflight._resolve) {
          gDriveTokenInflight._resolve(false);
          gDriveTokenInflight = null;
        }
        if (gDriveTokenClient && gDriveTokenClient._lastInteractive) {
          showToast('error', `☁️ ${t('driveLoginFailed')}`);
          gDriveTokenClient._lastInteractive = false;
        }
      },
    });
    return true;
  } catch (e) {
    console.warn('[SYNC] initTokenClient błąd:', e);
    return false;
  }
}

/**
 * Request a new access token.
 * @param {{ interactive?: boolean }} opts
 *   interactive true → user-initiated; Google shows UI only if needed
 *   interactive false → prompt:'' (no UI when possible)
 * @returns {Promise<boolean>}
 */
function requestDriveAccessToken(opts) {
  const interactive = !!(opts && opts.interactive);
  if (!gDriveTokenClient) initGDriveTokenClient();
  if (!gDriveTokenClient) return Promise.resolve(false);

  // Coalesce parallel requests
  if (gDriveTokenInflight) return gDriveTokenInflight;

  let resolveFn;
  gDriveTokenInflight = new Promise((resolve) => {
    resolveFn = resolve;
  });
  gDriveTokenInflight._resolve = resolveFn;

  gDriveTokenClient._lastInteractive = interactive;
  try {
    // Do NOT force prompt:'consent' on every login — that always shows the
    // second "app wants access / make sure you trust this app" screen.
    // Scope is set per call so the identity scope disappears from every
    // request once the e-mail is known; prompt:'' means "no UI if possible".
    const cfg = { scope: getRequestedScope(), include_granted_scopes: true };
    if (!interactive) cfg.prompt = '';
    gDriveTokenClient.requestAccessToken(cfg);
  } catch (e) {
    console.warn('[SYNC] requestAccessToken:', e);
    resolveFn(false);
    gDriveTokenInflight = null;
    return Promise.resolve(false);
  }

  // Safety timeout
  setTimeout(() => {
    if (gDriveTokenInflight && gDriveTokenInflight._resolve === resolveFn) {
      resolveFn(isDriveTokenValid());
      gDriveTokenInflight = null;
    }
  }, interactive ? 120000 : 8000);

  return gDriveTokenInflight;
}

/**
 * Attempts a silent (no popup) token refresh via GIS prompt:''. Only makes
 * sense if the user had a Drive session before — otherwise there is no
 * grant to refresh and Google would silently fail anyway.
 */
async function trySilentDriveRefresh() {
  if (!driveFeatureOn()) return false;
  if (isDriveTokenValid()) return true;
  if (!hadDriveSession() && !hasGrantedDriveScopes()) return false;
  const ok = await requestDriveAccessToken({ interactive: false });
  if (ok) gDriveCheckStale = false;
  return ok;
}

/**
 * Ensure a valid token before Drive API calls.
 * - interactiveFallback=true: show Google UI if needed (user-initiated action).
 * - interactiveFallback=false: try a silent refresh first (prompt:''); never
 *   shows a popup. This is what lets auto-sync checks recover after the
 *   access token expires while the app was backgrounded, instead of doing
 *   nothing until the user manually logs out and back in.
 */
async function ensureDriveToken(interactiveFallback) {
  if (!driveFeatureOn()) return false;
  if (isDriveTokenValid()) return true;
  // Always try silent first — even for user-initiated actions. A valid Google
  // session usually renews the token with no UI at all, so upload/download
  // after the ~1h expiry no longer means "log in again".
  if (await trySilentDriveRefresh()) return true;
  if (interactiveFallback) {
    return requestDriveAccessToken({ interactive: true });
  }
  return false;
}

/* === API WRAPPERS === */
async function driveFetch(url, options = {}, retry = true) {
  if (!isDriveTokenValid()) {
    // No auto-login; caller must ensureDriveToken(true) on user actions
    return new Response(JSON.stringify({ error: 'no_token' }), { status: 401 });
  }
  const headers = options.headers || {};
  headers['Authorization'] = 'Bearer ' + gDriveToken;
  const resp = await fetch(url, { ...options, headers });
  if (resp.status === 401 && retry) {
    // Token rejected — drop it, then try one silent (no popup) renewal and
    // replay the request. Only if that fails do we surface the stale state.
    gDriveToken = null;
    gDriveTokenExpiry = 0;
    localStorage.removeItem('grafik_drive_token');
    localStorage.removeItem('grafik_drive_token_expiry');
    if (await trySilentDriveRefresh()) {
      return driveFetch(url, options, false);
    }
    gDriveCheckStale = true;
    updateDriveUI();
  }
  return resp;
}

/* === SZUKANIE PLIKU W DRIVE === */
async function findDriveFile() {
  // Look for ALL files with our name in App Data
  const query = `name='${DRIVE_FILE_NAME}' and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`;

  const resp = await driveFetch(url);
  if (!resp.ok) {
    console.error('[SYNC] findDriveFile error:', resp.status);
    return null;
  }

  const data = await resp.json();
  const files = data.files || [];

  if (files.length === 0) return null;

  // Newest file — first in the list (orderBy=modifiedTime desc)
  const newest = files[0];

  // Remove duplicates (all except the first one)
  if (files.length > 1) {
    for (let i = 1; i < files.length; i++) {
      try {
        await driveFetch(`https://www.googleapis.com/drive/v3/files/${files[i].id}`, {
          method: 'DELETE',
        });
      } catch (e) {
        console.warn('[SYNC] Nie udało się usunąć:', files[i].id);
      }
    }
  }

  return newest;
}

/* === PRE-UPLOAD REGRESSION CHECK (Session 1) ===
   Guards uploadToDrive() against accidentally overwriting a richer Drive
   copy with a stale local payload. Compares local vs remote entry counts
   per category; if any category loses >20% AND remote had >0 entries,
   returns a report so the caller can show a confirmation modal.
   Returns null when: no remote file exists yet, network fails, or no
   category regressed enough — in all those cases upload proceeds silently.
   Reuses buildLocalSyncPayload / countSyncPayloadStats / fetchDriveRemotePayload
   which already exist and are used by the Sync Options panel diff table. */
async function detectUploadRegression() {
  const localPayload = buildLocalSyncPayload();
  const localStats = countSyncPayloadStats(localPayload);
  let remotePayload;
  try {
    remotePayload = await fetchDriveRemotePayload();
  } catch (e) {
    console.warn('[sync]', 'Pre-upload check failed, allowing upload', e);
    return null;
  }
  if (!remotePayload) return null;
  const remoteStats = countSyncPayloadStats(remotePayload);

  const categories = [
    { key: 'urlops', labelKey: 'driveDiffUrlops' },
    { key: 'overtimes', labelKey: 'driveDiffOvertimes' },
    { key: 'notes', labelKey: 'driveDiffNotes' },
    { key: 'customShifts', labelKey: 'driveDiffCustom' },
    { key: 'factoryDraftChanges', labelKey: 'syncDiffFactoryDrafts' },
    { key: 'vacationLimits', labelKey: 'driveDiffLimits' },
  ];

  const lost = [];
  categories.forEach((cat) => {
    const local = localStats[cat.key] || 0;
    const remote = remoteStats[cat.key] || 0;
    if (remote === 0) return;
    if (local >= remote) return;
    const lostCount = remote - local;
    const lostPct = (lostCount / remote) * 100;
    if (lostPct > 20) {
      lost.push({ category: cat.labelKey, local, remote, lostCount, lostPct });
    }
  });

  return lost.length > 0 ? { lost } : null;
}

/* Shows the regression warning modal. Resolves with true if user confirmed
   the upload anyway, false if cancelled. */
function showUploadRegressionWarning(regression) {
  return new Promise((resolve) => {
    const rows = regression.lost.map((item) => {
      const label = escapeHtml(t(item.category));
      return '<tr>' +
        '<td style="padding:6px;">' + label + '</td>' +
        '<td style="text-align:right; padding:6px;">' + item.local + '</td>' +
        '<td style="text-align:right; padding:6px;">' + item.remote + '</td>' +
        '<td style="text-align:right; padding:6px; color:#c0392b; font-weight:700;">' +
        '−' + item.lostCount + ' (' + Math.round(item.lostPct) + '%)' +
        '</td>' +
        '</tr>';
    }).join('');

    const body =
      '<p>' + t('uploadWarningBody') + '</p>' +
      '<table style="width:100%; border-collapse:collapse; margin:12px 0; font-size:13px;">' +
      '<thead><tr style="border-bottom:1px solid var(--border-cell);">' +
      '<th style="text-align:left; padding:6px;">' + t('uploadWarningCategory') + '</th>' +
      '<th style="text-align:right; padding:6px;">' + t('uploadWarningLocal') + '</th>' +
      '<th style="text-align:right; padding:6px;">' + t('uploadWarningRemote') + '</th>' +
      '<th style="text-align:right; padding:6px;">' + t('uploadWarningLoss') + '</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '</table>' +
      '<p style="padding:10px; background:rgba(192,57,43,0.1); border-radius:8px; margin-top:12px; font-size:13px;">' +
      '⚠️ ' + t('uploadWarningHint') +
      '</p>';

    showModal({
      title: '⚠️ ' + t('uploadWarningTitle'),
      body: body,
      buttons: [
        { text: t('cancel'), class: 'secondary', onClick: () => resolve(false) },
        { text: t('uploadWarningProceed'), class: 'danger', onClick: () => resolve(true) },
      ],
    });
  });
}

/* === ROLLING BACKUPS (Session 2) ===
   3 rolling backup copies on appDataFolder alongside the main file.
   Rotation happens after each successful upload: previous main becomes
   new backup-1; existing backup-1→2, backup-2→3, backup-3 is deleted.
   Rotation is best-effort — never throws, never blocks upload. Failures
   are logged to console; next successful upload heals the state. */

const BACKUP_FILE_NAMES = [
  'grafik-gillette-data.backup-1.json',
  'grafik-gillette-data.backup-2.json',
  'grafik-gillette-data.backup-3.json',
];

/**
 * Finds main file + all 3 backup files on Drive. Returns metadata for each
 * (id, name, modifiedTime). Uses driveFetch so silent token refresh works.
 * Handles concurrent-upload edge case: if multiple files exist with same name
 * (2 devices uploaded simultaneously), keeps newest and deletes older ones
 * — same pattern as findDriveFile().
 * @returns {Promise<{main: object|null, backups: Array<object|null>}>}
 *   backups array is always length 3 (index 0 = backup-1, 1 = backup-2, 2 = backup-3).
 *   null entries mean that backup slot doesn't exist yet.
 */
async function findAllDriveFiles() {
  const allNames = [DRIVE_FILE_NAME, ...BACKUP_FILE_NAMES];
  const queryParts = allNames.map((n) => "name='" + n + "'").join(' or ');
  const query = '(' + queryParts + ') and trashed=false';
  const url =
    'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder' +
    '&q=' + encodeURIComponent(query) +
    '&fields=files(id,name,modifiedTime)' +
    '&orderBy=modifiedTime desc';
  const resp = await driveFetch(url);
  if (!resp.ok) {
    console.warn('[sync]', 'findAllDriveFiles failed:', resp.status);
    return { main: null, backups: [null, null, null] };
  }

  const data = await resp.json();
  const files = data.files || [];

  // Group by name, keep newest per name, delete duplicates (concurrent-upload safety)
  const byName = {};
  files.forEach((f) => {
    if (!byName[f.name]) {
      byName[f.name] = f;
    } else {
      // Duplicate — delete older one (files sorted by modifiedTime desc, so this is older)
      driveFetch('https://www.googleapis.com/drive/v3/files/' + f.id, { method: 'DELETE' })
        // Best-effort cleanup: the newest copy is already selected above, so a
        // failed duplicate delete is harmless and heals on the next upload.
        .catch(() => {});
    }
  });

  return {
    main: byName[DRIVE_FILE_NAME] || null,
    backups: BACKUP_FILE_NAMES.map((name) => byName[name] || null),
  };
}

/**
 * Rotates backup files after a successful upload.
 * Order: delete backup-3, rename backup-2→3, backup-1→2, create new backup-1
 * from previousMainContent (raw JSON string of what main was BEFORE the upload).
 * NEVER THROWS — all failures logged to console. If rotation partially fails,
 * next successful upload heals the state.
 * @param {string} previousMainContent - JSON string of main file BEFORE upload
 */
async function rotateBackups(previousMainContent) {
  if (typeof previousMainContent !== 'string' || !previousMainContent) {
    // No previous main (first upload) — nothing to rotate
    return;
  }
  try {
    const all = await findAllDriveFiles();
    const [b1, b2, b3] = all.backups;

    // 1. Delete backup-3 if exists
    if (b3 && b3.id) {
      try {
        await driveFetch('https://www.googleapis.com/drive/v3/files/' + b3.id, {
          method: 'DELETE',
        });
      } catch (e) {
        console.warn('[sync]', 'rotateBackups: delete backup-3 failed', e);
      }
    }

    // 2. Rename backup-2 → backup-3
    if (b2 && b2.id) {
      try {
        await driveFetch(
          'https://www.googleapis.com/drive/v3/files/' + b2.id,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: BACKUP_FILE_NAMES[2] }),
          }
        );
      } catch (e) {
        console.warn('[sync]', 'rotateBackups: rename backup-2 failed', e);
      }
    }

    // 3. Rename backup-1 → backup-2
    if (b1 && b1.id) {
      try {
        await driveFetch(
          'https://www.googleapis.com/drive/v3/files/' + b1.id,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: BACKUP_FILE_NAMES[1] }),
          }
        );
      } catch (e) {
        console.warn('[sync]', 'rotateBackups: rename backup-1 failed', e);
      }
    }

    // 4. Create new backup-1 from previousMainContent
    try {
      const metadata = {
        name: BACKUP_FILE_NAMES[0],
        mimeType: DRIVE_MIME,
        parents: ['appDataFolder'],
      };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([previousMainContent], { type: DRIVE_MIME }));
      await driveFetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
        { method: 'POST', body: form }
      );
    } catch (e) {
      console.warn('[sync]', 'rotateBackups: create backup-1 failed', e);
    }
  } catch (e) {
    console.warn('[sync]', 'rotateBackups: unexpected error', e);
  }
}

/**
 * Fetches content of a specific backup file. Used to show revision in restore modal.
 * @param {string} fileId - Drive file id
 * @returns {Promise<object|null>} - parsed payload or null on error
 */
async function fetchBackupPayload(fileId) {
  if (!fileId) return null;
  try {
    const resp = await driveFetch(
      'https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media'
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch (e) {
    console.warn('[sync]', 'fetchBackupPayload failed', e);
    return null;
  }
}

/**
 * Opens modal with list of available backups. User picks one → confirm →
 * downloadFromDrive-style restore with the specific fileId.
 */
async function openRestoreBackupModal() {
  if (!(await ensureDriveToken(true))) {
    showToast('warn', '☁️ ' + t('driveLoginRequired'));
    return;
  }

  // Show loading modal first
  showModal({
    title: '💾 ' + t('backupModalTitle'),
    body: '<p style="text-align:center; color:var(--text-muted);">' + t('driveDiffLoading') + '</p>',
    buttons: [{ text: t('cancel'), class: 'secondary' }],
  });

  const all = await findAllDriveFiles();
  const availableBackups = all.backups
    .map((b, idx) => (b ? { ...b, slot: idx + 1 } : null))
    .filter(Boolean);

  if (availableBackups.length === 0) {
    // Empty state
    const emptyBody =
      '<p style="padding:20px; text-align:center; color:var(--text-muted);">' +
      escapeHtml(t('backupEmpty')) +
      '</p>';
    showModal({
      title: '💾 ' + t('backupModalTitle'),
      body: emptyBody,
      buttons: [{ text: t('close'), class: 'primary' }],
    });
    return;
  }

  // Fetch revision for each backup in parallel
  const withRevisions = await Promise.all(
    availableBackups.map(async (b) => {
      const payload = await fetchBackupPayload(b.id);
      const revision =
        payload && typeof payload.revision === 'number' ? payload.revision : null;
      return { ...b, revision };
    })
  );

  // Format list
  const rows = withRevisions
    .map((b) => {
      const dateObj = new Date(b.modifiedTime);
      let dateStr;
      try {
        let locale = 'pl-PL';
        if (typeof currentLang === 'string' && currentLang === 'uk') locale = 'uk-UA';
        else if (typeof currentLang === 'string' && currentLang === 'en') locale = 'en-US';
        dateStr = dateObj.toLocaleString(locale, {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch (e) {
        dateStr = dateObj.toLocaleString();
      }
      const label =
        b.revision !== null
          ? t('backupItemFormat', { date: dateStr, rev: b.revision })
          : t('backupItemFormatNoRev', { date: dateStr });
      return (
        '<button type="button" class="modal-btn secondary" data-backup-id="' +
        escapeHtml(b.id) +
        '" data-backup-label="' +
        escapeHtml(label) +
        '" style="width:100%; text-align:left; margin:4px 0; padding:12px 14px;">' +
        escapeHtml(label) +
        '</button>'
      );
    })
    .join('');

  const body = '<div>' + rows + '</div>';

  showModal({
    title: '💾 ' + t('backupModalTitle'),
    body: body,
    buttons: [{ text: t('cancel'), class: 'secondary' }],
  });

  // Attach handlers to backup buttons
  setTimeout(() => {
    document.querySelectorAll('[data-backup-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const fileId = btn.getAttribute('data-backup-id');
        const label = btn.getAttribute('data-backup-label');
        hideModal();
        restoreFromBackup(fileId, label);
      });
    });
  }, 50);
}

/**
 * Restores from a specific backup file. Shows confirm modal, then downloads
 * that file's content and applies it (same logic as downloadFromDrive with
 * confirmOverwrite=true).
 * @param {string} fileId - Drive file id of the backup
 * @param {string} backupLabel - human-readable label (date + revision)
 */
async function restoreFromBackup(fileId, backupLabel) {
  if (!fileId) return;
  showConfirm(
    '💾 ' + t('backupRestoreConfirmTitle'),
    t('backupRestoreConfirmBody', { label: backupLabel }),
    async () => {
      if (!(await ensureDriveToken(true))) {
        showToast('warn', '☁️ ' + t('driveLoginRequired'));
        return;
      }

      // Temporarily override gDriveFileId to point to backup, download, restore original
      const originalFileId = gDriveFileId;
      gDriveFileId = fileId;

      try {
        const success = await downloadFromDrive(false);
        if (success) {
          showToast('success', '💾 ' + t('backupRestored', { label: backupLabel }));
        }
      } catch (e) {
        console.error('[sync]', 'restoreFromBackup failed', e);
        showToast('error', '☁️ ' + t('driveDownloadError'));
      } finally {
        // Restore original main file id (backup restore shouldn't change main pointer)
        gDriveFileId = originalFileId;
        localStorage.setItem('grafik_drive_file_id', gDriveFileId || '');
      }
    },
    { primaryText: t('backupRestoreBtn'), primaryClass: 'primary' }
  );
}

// Expose to window (per AGENT.md — cross-module access via window.*)
window.findAllDriveFiles = findAllDriveFiles;
window.rotateBackups = rotateBackups;
window.fetchBackupPayload = fetchBackupPayload;
window.openRestoreBackupModal = openRestoreBackupModal;
window.restoreFromBackup = restoreFromBackup;

/* === ZAPIS (create lub update) === */
async function uploadToDrive(force = false) {
  if (!(await ensureDriveToken(true))) {
    showToast('warn', `☁️ ${t('driveLoginRequired')}`);
    return false;
  }

  // Pre-upload regression check (Session 1): if the local payload has
  // significantly fewer entries than the current Drive copy, ask for
  // confirmation before overwriting. Runs after token is valid so the
  // remote fetch does not itself trigger a login popup mid-check.
  const regression = await detectUploadRegression();
  if (regression) {
    const confirmed = await showUploadRegressionWarning(regression);
    if (!confirmed) {
      showToast('info', t('driveUploadCancelled'));
      return false;
    }
  }

  // Capture current main file content BEFORE overwriting (Session 2: rolling backups).
  // Used by rotateBackups() after successful upload. Best-effort — if fetch fails,
  // previousMainContent stays null and rotation is skipped for this cycle.
  // Stale-device fallback (Session 2 hotfix): when localStorage was cleared
  // (private mode, cache wipe, iOS 7-day storage eviction) gDriveFileId is null
  // even though a main file exists on Drive. Without fallback, the accidental
  // overwrite would take no backup — the exact scenario backups exist to guard
  // against. One extra Drive lookup only for the no-id case.
  let previousMainContent = null;
  try {
    let idForCapture = gDriveFileId;
    if (!idForCapture) {
      const found = await findDriveFile();
      if (found && found.id) idForCapture = found.id;
    }
    if (idForCapture) {
      const prevResp = await driveFetch(
        'https://www.googleapis.com/drive/v3/files/' + idForCapture + '?alt=media'
      );
      if (prevResp.ok) {
        previousMainContent = await prevResp.text();
      }
    }
  } catch (e) {
    console.warn('[sync]', 'Failed to capture previous main content for backup', e);
  }

// Compact v4 payload: public factory data stays in the application.
  const priorRevision = typeof getSyncRevision === 'function' ? getSyncRevision() : 0;
  const nextRevision = priorRevision + 1;
  const payload = {
    version: 4,
    revision: nextRevision,
    savedAt: new Date().toISOString(),
    prefs: prefs,
    shiftOverrides:
      typeof getPersonalShiftOverrides === 'function'
        ? getPersonalShiftOverrides()
        : {},
    factoryDrafts: factoryDrafts,
    urlops: urlops,
    overtimes: overtimes,
    notes: notes,
    vacationLimits: prefs.urlopLimits || {},
  };
  const json = JSON.stringify(payload);

  try {
    if (!gDriveFileId) {
      // Look for an existing file
      const found = await findDriveFile();
      if (found) {
        gDriveFileId = found.id;
        // Persist to localStorage so stale-device state (empty file id)
        // does not repeat on every reload. Without this, findDriveFile
        // fallback would run on every upload even after a successful one.
        localStorage.setItem('grafik_drive_file_id', gDriveFileId);
      }
    }

    if (!gDriveFileId) {
      // Tworzymy nowy plik
      const metadata = {
        name: DRIVE_FILE_NAME,
        mimeType: DRIVE_MIME,
        parents: ['appDataFolder'],
      };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([json], { type: DRIVE_MIME }));
      const resp = await driveFetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
        { method: 'POST', body: form }
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        console.error('[SYNC] Create error:', err);
        const errText =
          (err && err.error && err.error.message) ||
          err.message ||
          JSON.stringify(err) ||
          t('unknownError');
        showToast('error', `☁️ ${t('driveCreateFileError')}: ` + errText);
        return false;
      }
      const data = await resp.json();
      gDriveFileId = data.id;
      localStorage.setItem('grafik_drive_file_id', gDriveFileId);
    } else {
      // Update the existing file
      const resp = await driveFetch(
        `https://www.googleapis.com/upload/drive/v3/files/${gDriveFileId}?uploadType=media`,
        { method: 'PATCH', body: json, headers: { 'Content-Type': DRIVE_MIME } }
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        console.error('[SYNC] Update error:', err);
        showToast('error', `☁️ ${t('driveUpdateFileError')}`);
        return false;
      }
    }
    showToast('success', `☁️ ${t('driveSaved')}`);
    if (typeof updateLastSync === 'function') updateLastSync(nextRevision);
    gDriveRemoteNewer = false;
    // Refresh remote mtime so this device is not flagged as behind
    setStoredRemoteMtime(Date.now());
    try {
      const found = await findDriveFile();
      if (found && found.modifiedTime) setStoredRemoteMtime(found.modifiedTime);
    } catch (_) {}
    updateDriveUI();
    updateMenuSyncStatus();

    // Rolling backups (Session 2) — best-effort, never blocks upload.
    // previousMainContent is the raw JSON of what main was BEFORE this upload.
    // Runs async without await so it doesn't delay the return.
    if (typeof previousMainContent === 'string' && previousMainContent) {
      rotateBackups(previousMainContent).catch((e) => {
        console.warn('[sync]', 'rotateBackups background failure', e);
      });
    }
    return true;
  } catch (e) {
    console.error('[SYNC] upload:', e);
    showToast('error', `☁️ ${t('driveSyncError')}`);
    return false;
  }
}

/* === ODCZYT === */
async function downloadFromDrive(confirmOverwrite = false) {
  if (!(await ensureDriveToken(true))) {
    showToast('warn', `☁️ ${t('driveLoginRequired')}`);
    return false;
  }
  try {
    if (!gDriveFileId) {
      const found = await findDriveFile();
      if (!found) {
        showToast('info', `☁️ ${t('driveNoFileToDownload')}`);
        return false;
      }
      gDriveFileId = found.id;
      localStorage.setItem('grafik_drive_file_id', gDriveFileId);
    }
    const resp = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${gDriveFileId}?alt=media`
    );
    if (!resp.ok) {
      showToast('error', `☁️ ${t('driveDownloadFileError')}`);
      return false;
    }
    const data = await resp.json();
    if (!data || typeof data !== 'object') {
      showToast('error', `☁️ ${t('driveInvalidDataFormat')}`);
      return false;
    }

    const doApply = () => {
      let applyErrors = [];

      // Personal shifts: read compact v4 overrides or migrate a legacy v3 schedule.
      const hasCompactShiftOverrides =
        Object.prototype.hasOwnProperty.call(data, 'shiftOverrides') &&
        data.shiftOverrides &&
        typeof data.shiftOverrides === 'object' &&
        !Array.isArray(data.shiftOverrides);

      const hasLegacyCustomSchedule =
        data.customSchedule &&
        typeof data.customSchedule === 'object' &&
        !Array.isArray(data.customSchedule);

      if (
        (hasCompactShiftOverrides || hasLegacyCustomSchedule) &&
        typeof customSchedule !== 'undefined'
      ) {
        try {
          const personalOverrides = hasCompactShiftOverrides
            ? getPersonalShiftOverrides(data)
            : getPersonalShiftOverrides({
                customSchedule: data.customSchedule,
                factorySchedule:
                  data.factorySchedule &&
                  typeof data.factorySchedule === 'object' &&
                  !Array.isArray(data.factorySchedule)
                    ? data.factorySchedule
                    : factorySchedule,
              });

          const rebuiltCustomSchedule =
            buildCustomScheduleFromShiftOverrides(
              personalOverrides,
              factorySchedule
            );

          Object.keys(customSchedule).forEach(
            (key) => delete customSchedule[key]
          );
          Object.assign(customSchedule, rebuiltCustomSchedule);
          saveCustomSchedule(customSchedule);
        } catch (e) {
          console.error('[SYNC] personal schedule migration error', e);
          applyErrors.push('personalSchedule');
        }
      }

      // factoryDrafts — optional for backward compatibility with old Drive payloads.
      // When present, replace the local draft object while preserving its reference.
      if (
        Object.prototype.hasOwnProperty.call(data, 'factoryDrafts') &&
        data.factoryDrafts &&
        typeof data.factoryDrafts === 'object' &&
        !Array.isArray(data.factoryDrafts) &&
        typeof factoryDrafts !== 'undefined'
      ) {
        try {
          Object.keys(factoryDrafts).forEach((k) => delete factoryDrafts[k]);
          Object.assign(factoryDrafts, data.factoryDrafts);
          saveFactoryDrafts(factoryDrafts);
        } catch (e) {
          console.error('[SYNC] factoryDrafts error', e);
          applyErrors.push('factoryDrafts');
        }
      }

      // urlops — we MUTATE the object (CRITICAL — this used to be a bug!)
      if (data.urlops && typeof urlops !== 'undefined') {
        try {
          Object.keys(urlops).forEach((k) => delete urlops[k]);
          Object.assign(urlops, data.urlops);
          saveUrlops(urlops);
        } catch (e) {
          console.error('[SYNC] urlops error', e);
          applyErrors.push('urlops');
        }
      }

      // overtimes — we MUTATE the object
      if (data.overtimes && typeof overtimes !== 'undefined') {
        try {
          Object.keys(overtimes).forEach((k) => delete overtimes[k]);
          Object.assign(overtimes, data.overtimes);
          saveOvertimes(overtimes);
        } catch (e) {
          console.error('[SYNC] overtimes error', e);
          applyErrors.push('overtimes');
        }
      }

      // notes — we MUTATE the object
      if (data.notes && typeof notes !== 'undefined') {
        try {
          Object.keys(notes).forEach((k) => delete notes[k]);
          Object.assign(notes, data.notes);
          saveNotes(notes);
        } catch (e) {
          console.error('[SYNC] notes error', e);
          applyErrors.push('notes');
        }
      }

      // prefs — we merge (don't remove keys!)
      if (data.prefs && typeof prefs !== 'undefined') {
        try {
          Object.assign(prefs, data.prefs);
          savePrefs(prefs);
          if (typeof applyPersonalization === 'function') applyPersonalization();
          else if (typeof applyCellColors === 'function') applyCellColors();
        } catch (e) {
          console.error('[SYNC] prefs error', e);
          applyErrors.push('prefs');
        }
      }

      const applyVacationLimits = (limits, source) => {
        if (!limits || typeof limits !== 'object') return false;
        if (typeof setVacationLimit !== 'function') {
          console.warn('[SYNC] setVacationLimit not available, skipping vacationLimits');
          return false;
        }
        Object.keys(limits).forEach((brig) => {
          try {
            setVacationLimit(brig, limits[brig]);
          } catch (e) {
            console.error('[SYNC] vacationLimit error', brig, e);
            applyErrors.push('vacationLimits.' + brig);
          }
        });
        return true;
      };

      if (!applyVacationLimits(data.vacationLimits, 'data.vacationLimits')) {
        applyVacationLimits(data.prefs && data.prefs.urlopLimits, 'data.prefs.urlopLimits');
      }

      // Refresh the view
      currentView = 'dashboard';
      if (typeof switchView === 'function') {
        try {
          switchView('dashboard');
        } catch (e) {
          console.error('[SYNC] switchView error', e);
          applyErrors.push('switchView');
        }
      } else if (typeof refreshViews === 'function') {
        try {
          refreshViews();
        } catch (e) {
          console.error('[SYNC] refreshViews error', e);
          applyErrors.push('refreshViews');
        }
      } else {
        console.warn('[SYNC] neither switchView nor refreshViews available');
      }

      if (applyErrors.length) {
        showToast('warn', `☁️ ${t('driveDownloadedWithErrors')}: ` + applyErrors.join(', '));
      } else {
        showToast('success', `☁️ ${t('driveDownloaded')}`);
      }
      // Saves above bump lastModified — mark synced AFTER apply
      if (typeof updateLastSync === 'function') {
        updateLastSync(typeof data.revision === 'number' ? data.revision : undefined);
      }
      gDriveRemoteNewer = false;
      setStoredRemoteMtime(Date.now());
      findDriveFile()
        .then((found) => {
          if (found && found.modifiedTime) setStoredRemoteMtime(found.modifiedTime);
        })
        .catch(() => {})
        .finally(() => {
          updateDriveUI();
          updateMenuSyncStatus();
        });
    };

    if (confirmOverwrite) {
      showConfirm(`☁️ ${t('driveDownloadConfirmTitle')}`, t('driveDownloadConfirmBody'), doApply, {
        primaryText: t('download'),
        primaryClass: 'primary',
      });
    } else {
      doApply();
    }
    return true;
  } catch (e) {
    console.error('[SYNC] download:', e);
    showToast('error', `☁️ ${t('driveDownloadError')}`);
    return false;
  }
}

/* === UI ===
   The old #menuSyncStatus row (connection status + badge) was removed
   in commit "refactor(drive-card): simplify...". Login state is now
   communicated by the visible account email; unsynced changes by the
   clickable warning row; the primary action is the "Sync options" button. */
function updateMenuSyncStatus() {
  const warnBlock = document.getElementById('menuDriveWarn');
  const warnText = document.getElementById('menuDriveWarnText');
  const syncOptionsBtn = document.getElementById('menuDriveSyncOptions');
  const enableBtn = document.getElementById('menuDriveEnable');
  const card = document.querySelector('.drive-card');
  const tr = (key, params, fallback) => (typeof t === 'function' ? t(key, params) : fallback);

  // Keep enable switch + card visual state in sync with pref
  if (enableBtn) {
    enableBtn.setAttribute('aria-checked', driveFeatureOn() ? 'true' : 'false');
  }
  if (card) card.classList.toggle('is-drive-off', !driveFeatureOn());

  const loginBtn = document.getElementById('menuDriveLogin');

  // Feature off — hide everything except the enable switch itself
  if (!driveFeatureOn()) {
    if (warnBlock) warnBlock.style.display = 'none';
    if (syncOptionsBtn) syncOptionsBtn.style.display = 'none';
    if (loginBtn) loginBtn.style.display = 'none';
    return;
  }

  const logged = typeof isDriveLoggedIn === 'function' ? isDriveLoggedIn() : isDriveTokenValid();
  const unsynced = typeof hasUnsyncedChanges === 'function' && hasUnsyncedChanges();
  const remoteNewer = !!gDriveRemoteNewer;
  const stale = !!gDriveCheckStale;

  // Sync options button — shown only when logged in (needs auth to do anything useful)
  if (syncOptionsBtn) {
    syncOptionsBtn.style.display = logged ? 'flex' : 'none';
  }

  // Login button — when Drive is ON but user is not signed in
  if (loginBtn) {
    loginBtn.style.display = logged ? 'none' : 'flex';
  }

  // Not connected — warning off; login button is the sign-in entry point
  if (!logged) {
    if (warnBlock) warnBlock.style.display = 'none';
    return;
  }

  // Connected — show warning row when there is something to communicate
  const count = typeof getUnsyncedChangeCount === 'function'
    ? getUnsyncedChangeCount()
    : (unsynced ? 1 : 0);
  const staleOnly = stale && !unsynced && !remoteNewer;
  const showWarn = unsynced || remoteNewer || stale;

  if (warnBlock) {
    warnBlock.style.display = showWarn ? 'flex' : 'none';
    if (showWarn && warnText) {
      if (staleOnly) {
        warnText.textContent = tr('driveCardStaleWarn', null, 'Could not verify — tap to reconnect');
      } else {
        const n = Math.max(1, count);
        warnText.textContent = tr('driveSyncUnsyncedShort', { count: n }, `${n} unsynced changes`);
      }
      warnBlock.title = staleOnly
        ? tr('syncStatusStale', null, 'Could not verify Google Drive — sign-in may have expired')
        : tr('syncStatusConflict', null, 'Local and Drive both changed — sync needed');
    }
  }
}



function updateDriveUI() {
  updateMenuSyncStatus();
  const logged = typeof isDriveLoggedIn === 'function' ? isDriveLoggedIn() : isDriveTokenValid();
  const logoutBtn = document.getElementById('menuDriveLogout');
  const loginBtn = document.getElementById('menuDriveLogin');
  const authBtn = document.getElementById('userAuthBtn');
  if (logoutBtn) logoutBtn.style.display = logged ? 'flex' : 'none';
  // Login in side menu when Drive feature is ON and not logged in
  if (loginBtn) {
    loginBtn.style.display = driveFeatureOn() && !logged ? 'flex' : 'none';
  }

  // Logged-in account line in the Drive menu section
  const acct = document.getElementById('menuDriveAccount');
  const acctEmail = document.getElementById('menuDriveAccountEmail');
  const acctAvatar = document.getElementById('menuDriveAccountAvatar');
  const acctAdmin = document.getElementById('menuDriveAccountAdmin');
  if (acct && acctEmail) {
    if (logged && driveUserEmail) {
      const emailSafe = typeof escapeHtml === 'function' ? escapeHtml(driveUserEmail) : driveUserEmail;
      acct.style.display = 'flex';
      acctEmail.textContent = emailSafe;
      if (acctAvatar) acctAvatar.textContent = (driveUserEmail[0] || '?').toUpperCase();
      if (acctAdmin) {
        const isAdmin = typeof isCurrentUserAdmin === 'function' && isCurrentUserAdmin();
        acctAdmin.style.display = isAdmin ? 'inline-block' : 'none';
      }
    } else {
      acct.style.display = 'none';
    }
  }

  if (authBtn) {
    if (logged) {
      authBtn.innerHTML = ICON_DRIVE;
      authBtn.title = driveUserEmail
        ? `${t('logoutFromDrive')} · ${driveUserEmail}`
        : t('logoutFromDrive');
      authBtn.classList.add('auth-logged-in');
    } else {
      authBtn.innerHTML = ICON_GOOGLE_G;
      authBtn.title = t('login');
      authBtn.classList.remove('auth-logged-in');
    }
  }
}

/* === USTAWIANIE CLIENT ID === */
function askForClientId() {
  showModal({
    title: `☁️ ${t('driveConfigTitle')}`,
    body: `
      <p>${t('driveConfigIntro')}</p>
      <p><b>${t('driveConfigHowTo')}</b></p>
      <ol style="margin:8px 0; padding-left:22px; font-size:13px;">
        <li>${t('driveConfigStep1')} <a href="https://console.cloud.google.com/apis/credentials" target="_blank" style="color:var(--text-header);">Google Cloud Console → Credentials</a></li>
        <li>${t('driveConfigStep2')}</li>
        <li>${t('driveConfigStep3')}</li>
        <li>${t('driveConfigStep4')} <code>http://localhost:8000</code></li>
        <li>${t('driveConfigStep5')}</li>
      </ol>
      <div style="margin-top:12px;">
        <label style="font-weight:600; font-size:13px; display:block; margin-bottom:4px;">OAuth Client ID:</label>
        <input type="text" id="driveClientIdInput" placeholder="np. 1234567890-abc.apps.googleusercontent.com"
               style="width:100%; padding:8px 12px; border:1px solid var(--border-cell); border-radius:8px; background:var(--bg-container); color:var(--text-main); font-size:14px;"
               value="${gDriveClientId}">
      </div>
      <p style="font-size:12px; color:var(--text-muted); margin-top:10px;">⚠️ ${t('driveConfigNote')}</p>
    `,
    buttons: [
      {
        text: t('save'),
        class: 'primary',
        onClick: () => {
          const input = document.getElementById('driveClientIdInput');
          const val = input ? input.value.trim() : '';
          if (!val) {
            showToast('warn', t('enterClientId'));
            return;
          }
          gDriveClientId = val;
          localStorage.setItem(DRIVE_CLIENT_ID_KEY, val);
          initGDriveTokenClient();
          showToast('success', `☁️ ${t('driveClientIdSaved')}`);
        },
      },
    ],
  });
}

/* === LOGOWANIE === */
function loginDrive() {
  if (!driveFeatureOn()) {
    showToast('warn', `☁️ ${typeof t === 'function' ? t('driveFeatureDisabledHint') : 'Enable Google Drive in Settings → Privacy first'}`);
    return;
  }
  if (!gDriveClientId) {
    showToast('warn', `☁️ ${t('driveConfigureClientIdFirst')}`);
    askForClientId();
    return;
  }
  loadGis().then(() => {
    if (!gDriveTokenClient) initGDriveTokenClient();
    if (!gDriveTokenClient) {
      showToast('error', `☁️ ${t('driveCannotInitLogin')}`);
      return;
    }
    requestDriveAccessToken({ interactive: true });
  });
}

/* === SYNC DIFF SUMMARY (local vs Drive) === */

/** Count entries in personal data objects for a short log. */
function countSyncPayloadStats(data) {
  if (!data || typeof data !== 'object') {
    return {
      urlops: 0,
      overtimes: 0,
      notes: 0,
      customShifts: 0,
      factoryDraftChanges: 0,
      vacationLimits: 0,
    };
  }
  let urlops = 0;
  if (data.urlops && typeof data.urlops === 'object') {
    Object.keys(data.urlops).forEach((b) => {
      const list = data.urlops[b];
      if (Array.isArray(list)) urlops += list.length;
    });
  }
  let overtimes = 0;
  if (data.overtimes && typeof data.overtimes === 'object') {
    overtimes = Object.keys(data.overtimes).length;
  }
  let notes = 0;
  if (data.notes && typeof data.notes === 'object') {
    // Count individual note entries, not the number of days that have
    // notes — otherwise adding a 2nd/3rd note to a day that already had
    // one note (unified multi-note list, 2026-09) doesn't change the
    // per-day key count and the diff silently shows no change at all.
    notes = typeof countNoteEntries === 'function' ? countNoteEntries(data.notes) : 0;
  }
  const personalOverrides =
    typeof getPersonalShiftOverrides === 'function'
      ? getPersonalShiftOverrides(data)
      : {};

  const customShifts = Object.keys(personalOverrides).length;
  let factoryDraftChanges = 0;
  if (data.factoryDrafts && typeof data.factoryDrafts === 'object') {
    const walk = (obj, depth) => {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        obj.forEach((v) => {
          if (v !== null && v !== undefined) factoryDraftChanges++;
        });
        return;
      }
      Object.keys(obj).forEach((k) => walk(obj[k], depth + 1));
    };
    walk(data.factoryDrafts, 0);
  }
  let vacationLimits = 0;
  const limits = data.vacationLimits || (data.prefs && data.prefs.urlopLimits);
  if (limits && typeof limits === 'object') {
    vacationLimits = Object.keys(limits).length;
  }
  return { urlops, overtimes, notes, customShifts, factoryDraftChanges, vacationLimits };
}

function buildLocalSyncPayload() {
  return {
    version: 4,
    savedAt: new Date().toISOString(),
    prefs: typeof prefs !== 'undefined' ? prefs : {},
    shiftOverrides:
      typeof getPersonalShiftOverrides === 'function'
        ? getPersonalShiftOverrides()
        : {},
    urlops: typeof urlops !== 'undefined' ? urlops : {},
    overtimes: typeof overtimes !== 'undefined' ? overtimes : {},
    notes: typeof notes !== 'undefined' ? notes : {},
    factoryDrafts:
      typeof factoryDrafts !== 'undefined' ? factoryDrafts : {},
    vacationLimits:
      typeof prefs !== 'undefined' && prefs.urlopLimits
        ? prefs.urlopLimits
        : {},
  };
}

/**
 * Build short HTML log of local stats and optional local-vs-remote deltas.
 * @param {object} localStats
 * @param {object|null} remoteStats - null if remote not available / still loading
 * @param {boolean} hasUnsynced
 * @param {string} lastSyncText
 * @param {'loading'|'ready'|'error'} [remoteState='ready']
 */
function formatSyncDiffLog(localStats, remoteStats, hasUnsynced, lastSyncText, remoteState) {
  remoteState = remoteState || (remoteStats == null ? 'error' : 'ready');
  const showRemote = remoteState === 'ready' && remoteStats != null;

  const line = (label, localN, remoteN) => {
    if (!showRemote) {
      return `<li>${label}: <b>${localN}</b></li>`;
    }

    const difference = localN - remoteN;
    let differenceLabel = '';

    if (difference > 0) {
      differenceLabel =
        ` <span style="color:#e67e22">(📱 +${difference})</span>`;
    } else if (difference < 0) {
      differenceLabel =
        ` <span style="color:#4285f4">(☁️ +${Math.abs(difference)})</span>`;
    } else {
      differenceLabel =
        ' <span style="color:var(--text-muted)">(✓)</span>';
    }

    return (
      `<li>${label}: <b>${localN}</b> / Drive ${remoteN}` +
      `${differenceLabel}</li>`
    );
  };

  const tr = (key, fb) => (typeof t === 'function' ? t(key) : fb);

  // Header: signed-in account + detailed last-sync time (absolute + relative)
  let html = '';
  const signedEmail = typeof driveUserEmail === 'string' && driveUserEmail ? driveUserEmail : '';
  if (signedEmail) {
    const emailSafe = typeof escapeHtml === 'function' ? escapeHtml(signedEmail) : signedEmail;
    html += `<p style="margin:0 0 6px; font-size:13px; color:var(--text-muted);">${tr('driveDiffSignedInAs', 'Signed in as')}: <b>${emailSafe}</b></p>`;
  }

  const lastSyncDetail = typeof formatLastSyncDateTime === 'function' ? formatLastSyncDateTime() : '';
  let syncTimeHtml = lastSyncText || '—';
  if (lastSyncDetail) {
    const neverText = tr('syncNever', 'nigdy');
    const relative = lastSyncText && lastSyncText !== neverText ? ` (${lastSyncText})` : '';
    syncTimeHtml = `${lastSyncDetail}${relative}`;
  }
  html += `<p style="margin:0 0 6px; font-size:13px; color:var(--text-muted);">${tr('driveDiffLastSync', 'Last sync')}: <b>${syncTimeHtml}</b></p>`;

  html += `<div class="sync-diff-log" style="font-size:13px; line-height:1.45; padding:10px 12px; background:var(--bg-controls); border-radius:8px; border:1px solid var(--border-cell); margin:0;">`;
  html += `<div style="font-weight:600; margin-bottom:6px;">${tr('driveDiffTitle', 'Short change log')}</div>`;
  html += '<ul style="margin:0; padding-left:18px;">';
  html += line(tr('driveDiffUrlops', 'Vacations'), localStats.urlops, showRemote ? remoteStats.urlops : 0);
  html += line(tr('driveDiffOvertimes', 'Overtime'), localStats.overtimes, showRemote ? remoteStats.overtimes : 0);
  html += line(tr('driveDiffNotes', 'Notes'), localStats.notes, showRemote ? remoteStats.notes : 0);
  html += line(tr('driveDiffCustom', 'Custom shifts'), localStats.customShifts, showRemote ? remoteStats.customShifts : 0);
  html += line(
    tr('syncDiffFactoryDrafts', 'Factory schedule drafts'),
    localStats.factoryDraftChanges,
    showRemote ? remoteStats.factoryDraftChanges : 0
  );
  html += line(tr('driveDiffLimits', 'Vacation limits'), localStats.vacationLimits, showRemote ? remoteStats.vacationLimits : 0);
  html += '</ul>';

  if (remoteState === 'loading') {
    html += `<p style="margin:8px 0 0; font-size:12px; color:var(--text-muted);">${tr('driveDiffLoading', 'Comparing with Drive…')}</p>`;
  } else if (remoteState === 'error' || remoteStats == null) {
    html += `<p style="margin:8px 0 0; font-size:12px; color:var(--text-muted);">${tr('driveDiffNoRemote', 'Could not load Drive version for comparison.')}</p>`;
  } else {
const same =
       localStats.urlops === remoteStats.urlops &&
       localStats.overtimes === remoteStats.overtimes &&
       localStats.notes === remoteStats.notes &&
       localStats.customShifts === remoteStats.customShifts &&
       localStats.factoryDraftChanges === remoteStats.factoryDraftChanges &&
       localStats.vacationLimits === remoteStats.vacationLimits;
    if (same && !hasUnsynced) {
      html += `<p style="margin:8px 0 0; font-size:12px; color:var(--text-muted);">${tr('driveDiffIdentical', 'Counts match Drive (no structural differences detected).')}</p>`;
    } else {
      html += `<p style="margin:8px 0 0; font-size:12px; color:var(--text-muted);">${tr('driveDiffHint', 'Numbers: local / Drive. (+N) more on device, (−N) more on Drive.')}</p>`;
    }
  }
  html += '</div>';
  return html;
}

/** Fetch remote Drive JSON (or null). Does not apply data. */
async function fetchDriveRemotePayload() {
  try {
    if (!gDriveFileId) {
      const found = await findDriveFile();
      if (!found) return null;
      gDriveFileId = found.id;
      localStorage.setItem('grafik_drive_file_id', gDriveFileId);
    }
    const resp = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${gDriveFileId}?alt=media`
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch (e) {
    console.warn('[SYNC] fetchDriveRemotePayload', e);
    return null;
  }
}

/* === MAIN MENU: sync ===
   Kept for backward compatibility with existing callers (handleAutoSyncCheck
   conflict path, etc). Now just opens the unified Sync Options panel —
   the old ad-hoc modal is retired. */
async function syncWithDrive() {
  if (typeof openDriveSyncOptionsPanel === 'function') {
    openDriveSyncOptionsPanel();
    return;
  }
  // Fallback: only runs if this function is somehow called before the panel
  // helper is defined (shouldn't happen — both live in this file).
  if (!driveFeatureOn()) {
    showToast('warn', `☁️ ${typeof t === 'function' ? t('driveFeatureDisabledHint') : 'Enable Google Drive in Settings → Privacy first'}`);
    return;
  }
  if (!(await ensureDriveToken(true))) {
    showToast('warn', `☁️ ${t('driveLoginRequired')}`);
    loginDrive();
    return;
  }

  const localPayload = buildLocalSyncPayload();
  const localStats = countSyncPayloadStats(localPayload);
  let hasUnsynced = typeof hasUnsyncedChanges === 'function' && hasUnsyncedChanges();
  const lastSyncText =
    typeof timeSinceLastSync === 'function'
      ? timeSinceLastSync()
      : typeof t === 'function'
        ? t('syncUnknown')
        : '—';

  // Clear icons: download = arrow-down-to-line, upload = arrow-up-from-line
  const ICON_DL =
    '<svg class="modal-btn-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 16l-5-5h3V4h4v7h3l-5 5zm-7 2h14v2H5v-2z"/></svg>';
  const ICON_UL =
    '<svg class="modal-btn-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 4l5 5h-3v7h-4V9H7l5-5zM5 18h14v2H5v-2z"/></svg>';

  // Show modal immediately with local summary; then refine with remote if available
  showModal({
    title: `☁️ ${t('driveSyncTitle')}`,
    body: formatSyncDiffLog(localStats, null, hasUnsynced, lastSyncText, 'loading'),
    buttons: [
      {
        text: t('driveSyncCancel'),
        html: t('driveSyncCancel'),
        class: 'secondary',
        title: t('cancel'),
      },
      {
        text: t('driveSyncDownload'),
        html: ICON_DL + ' ' + t('driveSyncDownload'),
        class: 'secondary',
        title: t('download'),
        onClick: () => downloadFromDrive(true),
        closeOnClick: true,
      },
      {
        text: t('driveSyncUpload'),
        html: ICON_UL + ' ' + t('driveSyncUpload'),
        class: 'primary',
        title: t('sendToDrive'),
        onClick: () => uploadToDrive(true),
        closeOnClick: true,
      },
    ],
  });

  // Force buttons on one row
  const footer = document.getElementById('modalFooter');
  if (footer) {
    footer.classList.add('modal-footer-single-row');
  }

  // Async: replace body with full local vs remote log
  try {
    const remote = await fetchDriveRemotePayload();
    const remoteStats = remote ? countSyncPayloadStats(remote) : null;

    if (
      remote &&
      typeof reconcileSyncedFingerprint === 'function' &&
      reconcileSyncedFingerprint(remote)
    ) {
      gDriveRemoteNewer = false;
      hasUnsynced =
        typeof hasUnsyncedChanges === 'function' && hasUnsyncedChanges();
      updateMenuSyncStatus();
    }

    // Update lastKnownDiffCount з реальним diff (для точного badge count)
    if (remoteStats && typeof getSyncMeta === 'function' && typeof setSyncMeta === 'function') {
      const totalDiff =
        Math.abs(localStats.urlops - remoteStats.urlops) +
        Math.abs(localStats.overtimes - remoteStats.overtimes) +
        Math.abs(localStats.notes - remoteStats.notes) +
        Math.abs(localStats.customShifts - remoteStats.customShifts) +
        Math.abs(localStats.factoryDraftChanges - remoteStats.factoryDraftChanges) +
        Math.abs(localStats.vacationLimits - remoteStats.vacationLimits);
      const meta = getSyncMeta();
      meta.lastKnownDiffCount = totalDiff;
      setSyncMeta(meta);
      updateMenuSyncStatus();
    }

    const bodyEl = document.getElementById('modalBody');
    const overlay = document.getElementById('modalOverlay');
    if (bodyEl && overlay && overlay.classList.contains('show')) {
      bodyEl.innerHTML = formatSyncDiffLog(
        localStats,
        remoteStats,
        hasUnsynced,
        lastSyncText,
        remoteStats ? 'ready' : 'error'
      );
    }
  } catch (e) {
    console.warn('[SYNC] syncWithDrive remote diff', e);
  }
}

/* === DRIVE SYNC OPTIONS PANEL ===
   Full-screen app-panel that consolidates: sync mode toggle (auto/manual),
   local-vs-remote diff table, and Upload/Download actions. Single entry
   point from the Drive card in the side menu — replaces the ad-hoc modal
   and scattered switches in Settings. */
async function openDriveSyncOptionsPanel() {
  if (typeof openAppPanel !== 'function') {
    console.error('[sync-options]', 'openAppPanel not available');
    return;
  }
  if (!driveFeatureOn()) {
    showToast('warn', `☁️ ${typeof t === 'function' ? t('driveFeatureDisabledHint') : 'Enable Google Drive backup first'}`);
    return;
  }
  if (!(await ensureDriveToken(true))) {
    showToast('warn', `☁️ ${t('driveLoginRequired')}`);
    loginDrive();
    return;
  }
  if (typeof closeSideMenu === 'function') {
    try { closeSideMenu(); } catch (e) { /* ignore */ }
  }

  const tr = (key, params, fallback) => (typeof t === 'function' ? t(key, params) : fallback);
  const mode = isDriveAutoSyncEnabled() ? 'auto' : 'manual';

  const html = `
    <div class="drive-sync-options-panel">
      <div class="dso-section">
        <div class="dso-section-title">${tr('driveSyncOptionsSection', null, 'Sync mode')}</div>
        <div class="dso-mode-list">
          <label class="dso-mode-row${mode === 'auto' ? ' active' : ''}" data-dso-mode="auto">
            <input type="radio" name="dso-mode" value="auto"${mode === 'auto' ? ' checked' : ''}>
            <span class="dso-mode-body">
              <span class="dso-mode-title">${tr('driveSyncModeAuto', null, 'Automatic')}</span>
              <span class="dso-mode-desc">${tr('driveSyncModeAutoDesc', null, 'Background checks and token refresh. Google may show sign-in windows.')}</span>
            </span>
          </label>
          <label class="dso-mode-row${mode === 'manual' ? ' active' : ''}" data-dso-mode="manual">
            <input type="radio" name="dso-mode" value="manual"${mode === 'manual' ? ' checked' : ''}>
            <span class="dso-mode-body">
              <span class="dso-mode-title">${tr('driveSyncModeManual', null, 'Manual only')}</span>
              <span class="dso-mode-desc">${tr('driveSyncModeManualDesc', null, 'Used only when you press Upload or Download. No background checks.')}</span>
            </span>
          </label>
        </div>
      </div>

      <div class="dso-section">
        <div class="dso-section-title">${tr('driveSyncActionsSection', null, 'Actions')}</div>
        <div class="dso-actions">
          <button type="button" class="modal-btn primary" data-dso-action="upload">
            ↑ ${tr('driveSyncUpload', null, 'Upload')}
          </button>
          <button type="button" class="modal-btn secondary" data-dso-action="download">
            ↓ ${tr('driveSyncDownload', null, 'Download')}
          </button>
          <button type="button" class="modal-btn secondary" data-dso-action="restore">
            💾 ${tr('backupRestoreBtn', null, 'Restore from backup')}
          </button>
        </div>
      </div>

      <div class="dso-section">
        <div class="dso-section-title">${tr('driveSyncChangesSection', null, 'Changes')}</div>
        <div class="dso-diff" data-dso-diff>
          <div class="dso-diff-loading">${tr('driveDiffLoading', null, 'Comparing with Drive…')}</div>
        </div>
      </div>
    </div>
  `;

  openAppPanel({
    id: 'drive-sync-options',
    title: tr('driveSyncOptionsTitle', null, 'Sync options'),
    html: html,
    onMount: function (body) {
      bindDriveSyncOptionsPanel(body);
    },
  });
}

/* Renders the local/remote diff table inside the panel body.
   Uses the same helpers as the old modal (countSyncPayloadStats,
   buildLocalSyncPayload, fetchDriveRemotePayload) — those stay untouched. */
function renderDriveSyncOptionsDiff(container, localStats, remoteStats, state) {
  if (!container) return;
  const tr = (key, params, fallback) => (typeof t === 'function' ? t(key, params) : fallback);

  if (state === 'loading') {
    container.innerHTML = `<div class="dso-diff-loading">${tr('driveDiffLoading', null, 'Comparing with Drive…')}</div>`;
    return;
  }
  if (state === 'error' || !remoteStats) {
    container.innerHTML = `<div class="dso-diff-error">${tr('driveDiffNoRemote', null, 'Could not load Drive version for comparison.')}</div>`;
    return;
  }

  const rows = [
    { label: tr('driveDiffUrlops', null, 'Vacations'), local: localStats.urlops, remote: remoteStats.urlops },
    { label: tr('driveDiffOvertimes', null, 'Overtime'), local: localStats.overtimes, remote: remoteStats.overtimes },
    { label: tr('driveDiffNotes', null, 'Notes'), local: localStats.notes, remote: remoteStats.notes },
    { label: tr('driveDiffCustom', null, 'Custom shifts'), local: localStats.customShifts, remote: remoteStats.customShifts },
    { label: tr('syncDiffFactoryDrafts', null, 'Factory drafts'), local: localStats.factoryDraftChanges, remote: remoteStats.factoryDraftChanges },
    { label: tr('driveDiffLimits', null, 'Vacation limits'), local: localStats.vacationLimits, remote: remoteStats.vacationLimits },
  ];

  const lastSyncText = typeof timeSinceLastSync === 'function' ? timeSinceLastSync() : '';
  const lastSyncDetail = typeof formatLastSyncDateTime === 'function' ? formatLastSyncDateTime() : '';
  const lastSyncCombined = lastSyncDetail
    ? (lastSyncText ? `${lastSyncDetail} (${lastSyncText})` : lastSyncDetail)
    : lastSyncText || '—';

  container.innerHTML = `
    <table class="dso-diff-table">
      <thead>
        <tr>
          <th></th>
          <th>${tr('driveSyncColumnLocal', null, 'Local')}</th>
          <th>${tr('driveSyncColumnRemote', null, 'Drive')}</th>
          <th>${tr('driveSyncColumnDiff', null, 'Diff')}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(function (r) {
          const d = r.local - r.remote;
          let diffCell = '<span class="dso-diff-eq">✓</span>';
          if (d > 0) diffCell = `<span class="dso-diff-local">📱 +${d}</span>`;
          else if (d < 0) diffCell = `<span class="dso-diff-remote">☁ +${Math.abs(d)}</span>`;
          return `<tr><td>${r.label}</td><td>${r.local}</td><td>${r.remote}</td><td>${diffCell}</td></tr>`;
        }).join('')}
      </tbody>
    </table>
    <div class="dso-diff-meta">
      <div><b>${tr('driveDiffLastSync', null, 'Last sync')}:</b> ${lastSyncCombined}</div>
    </div>
  `;
}

/* Wires up the panel: mode radios, action buttons, and kicks off the
   async remote diff fetch. Called from openAppPanel onMount. */
function bindDriveSyncOptionsPanel(body) {
  if (!body) return;
  const tr = (key, params, fallback) => (typeof t === 'function' ? t(key, params) : fallback);

  // Mode radios: switch prefs.driveAutoSync. Do NOT trigger sync on switch
  // (per user requirement — avoid extra Google popups if user toggled by mistake).
  body.querySelectorAll('[data-dso-mode]').forEach(function (row) {
    row.addEventListener('click', function () {
      const nextMode = row.getAttribute('data-dso-mode');
      const nextAuto = nextMode === 'auto';
      if (typeof prefs !== 'undefined' && prefs) {
        prefs.driveAutoSync = nextAuto;
        if (typeof savePrefs === 'function') savePrefs(prefs);
      }
      body.querySelectorAll('[data-dso-mode]').forEach(function (r) {
        const isActive = r.getAttribute('data-dso-mode') === nextMode;
        r.classList.toggle('active', isActive);
        const input = r.querySelector('input[type="radio"]');
        if (input) input.checked = isActive;
      });
    });
  });

  // Upload button (primary — most frequent action)
  const uploadBtn = body.querySelector('[data-dso-action="upload"]');
  if (uploadBtn) {
    uploadBtn.addEventListener('click', function () {
      if (typeof closeAppPanel === 'function') closeAppPanel();
      uploadToDrive(true);
    });
  }

  // Download button (secondary)
  const downloadBtn = body.querySelector('[data-dso-action="download"]');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', function () {
      if (typeof closeAppPanel === 'function') closeAppPanel();
      downloadFromDrive(true);
    });
  }

  // Restore button (secondary) — opens backup selection modal
  const restoreBtn = body.querySelector('[data-dso-action="restore"]');
  if (restoreBtn) {
    restoreBtn.addEventListener('click', function () {
      if (typeof closeAppPanel === 'function') closeAppPanel();
      openRestoreBackupModal();
    });
  }

  // Async remote diff: fetch remote payload, render table
  const diffContainer = body.querySelector('[data-dso-diff]');
  const localPayload = typeof buildLocalSyncPayload === 'function' ? buildLocalSyncPayload() : null;
  const localStats = localPayload && typeof countSyncPayloadStats === 'function'
    ? countSyncPayloadStats(localPayload)
    : null;

  if (!localStats || !diffContainer) return;

  fetchDriveRemotePayload()
    .then(function (remote) {
      if (!remote) {
        renderDriveSyncOptionsDiff(diffContainer, localStats, null, 'error');
        return;
      }
      const remoteStats = countSyncPayloadStats(remote);
      // Reconcile: if remote is byte-identical, mark synced (same logic as old modal)
      if (typeof reconcileSyncedFingerprint === 'function' && reconcileSyncedFingerprint(remote)) {
        gDriveRemoteNewer = false;
        try { updateMenuSyncStatus(); } catch (e) { /* ignore */ }
      }
      // Update badge-count meta (same logic as old modal — keeps side-menu badge accurate)
      if (typeof getSyncMeta === 'function' && typeof setSyncMeta === 'function') {
        const totalDiff =
          Math.abs(localStats.urlops - remoteStats.urlops) +
          Math.abs(localStats.overtimes - remoteStats.overtimes) +
          Math.abs(localStats.notes - remoteStats.notes) +
          Math.abs(localStats.customShifts - remoteStats.customShifts) +
          Math.abs(localStats.factoryDraftChanges - remoteStats.factoryDraftChanges) +
          Math.abs(localStats.vacationLimits - remoteStats.vacationLimits);
        const meta = getSyncMeta();
        meta.lastKnownDiffCount = totalDiff;
        setSyncMeta(meta);
        try { updateMenuSyncStatus(); } catch (e) { /* ignore */ }
      }
      renderDriveSyncOptionsDiff(diffContainer, localStats, remoteStats, 'ready');
    })
    .catch(function (error) {
      console.warn('[sync-options]', 'diff fetch failed', error);
      renderDriveSyncOptionsDiff(diffContainer, localStats, null, 'error');
    });
}

window.openDriveSyncOptionsPanel = openDriveSyncOptionsPanel;

/* === LOGOUT === */
/**
 * Public logout function — checks for unsynced changes first.
 * If unsynced data exists, shows warning modal with 3 options:
 * - Cancel (stay logged in)
 * - Upload first then logout (safest)
 * - Logout anyway (data stays in localStorage but no cloud backup)
 */
function logoutDrive() {
  // Check for unsynced changes (from js/personal/sync-tracking.js)
  const hasUnsynced = typeof hasUnsyncedChanges === 'function' && hasUnsyncedChanges();

  if (!hasUnsynced) {
    // No unsynced changes — safe to logout immediately
    performLogoutDrive();
    return;
  }

  // Has unsynced changes — show warning modal
  const lastSyncText = typeof timeSinceLastSync === 'function' ? timeSinceLastSync() : (typeof t === 'function' ? t('syncUnknown') : 'nieznany');
  const lastSyncDateTime = typeof formatLastSyncDateTime === 'function' ? formatLastSyncDateTime() : '';
  const unsyncedCount = typeof getUnsyncedChangeCount === 'function' ? getUnsyncedChangeCount() : 0;
  const syncWhen = lastSyncDateTime ? `${lastSyncDateTime} (${lastSyncText})` : lastSyncText;
  const bodyParams = { count: unsyncedCount, datetime: syncWhen };

  const title = (typeof t === 'function' && t('logoutUnsyncedTitle')) || '⚠️ Unsaved changes';
  const body =
    (typeof t === 'function' && t('logoutUnsyncedBody', bodyParams)) ||
    `<p>Masz lokalne zmiany, których jeszcze nie zsynchronizowano z Google Drive.</p>
     <p><b>Niezsynchronizowanych zmian:</b> ${unsyncedCount}</p>
     <p><b>Ostatnia synchronizacja:</b> ${syncWhen}</p>
     <p style="margin-top:12px;">Jeśli wylogujesz się teraz:</p>
     <ul style="margin:8px 0; padding-left:22px;">
       <li>✅ Dane pozostaną w tej przeglądarce</li>
       <li>❌ NIE będą w backup Google Drive</li>
       <li>❌ NIE zobaczysz ich na innym urządzeniu</li>
     </ul>
     <p style="padding:10px; background:var(--bg-info); border-radius:8px; margin-top:10px;">
       💡 <b>Zalecane:</b> Zsynchronizuj najpierw, potem się wyloguj.
     </p>`;

  showModal({
    title: title,
    body: body,
    buttons: [
      {
        text: (typeof t === 'function' && t('logoutUnsyncedCancel')) || 'Anuluj',
        class: 'secondary',
      },
      {
        text: (typeof t === 'function' && t('logoutUnsyncedForce')) || 'Wyloguj mimo to',
        class: 'danger',
        onClick: () => {
          performLogoutDrive();
        },
      },
      {
        text:
          (typeof t === 'function' && t('logoutUnsyncedSyncFirst')) || '☁️ Sync and log out',
        class: 'primary',
        onClick: async () => {
          showToast(
            'info',
            '☁️ ' + ((typeof t === 'function' && t('driveSyncing')) || 'Synchronizacja...')
          );
          const success = await uploadToDrive();
          if (success) {
            performLogoutDrive();
          } else {
            showToast(
              'error',
              '☁️ ' +
                ((typeof t === 'function' && t('driveSyncFailedNoLogout')) ||
                  'Sync failed, logout cancelled')
            );
          }
        },
      },
    ],
  });
}

/**
 * Internal logout — actually clears drive state.
 * Called after user confirms (or if no unsynced changes exist).
 */
function performLogoutDrive() {
  if (gDriveRefreshTimer) {
    clearTimeout(gDriveRefreshTimer);
    gDriveRefreshTimer = null;
  }
  gDriveToken = null;
  gDriveTokenExpiry = 0;
  gDriveFileId = null;
  driveUserEmail = null;
  localStorage.removeItem('grafik_drive_token');
  localStorage.removeItem('grafik_drive_token_expiry');
  localStorage.removeItem('grafik_drive_file_id');
  localStorage.removeItem('grafik_drive_user_email');
  localStorage.removeItem(DRIVE_TOKEN_SCOPE_KEY);
  localStorage.removeItem(DRIVE_EMAIL_TRIES_KEY);
  gDriveGrantedScope = '';
  clearDriveSessionFlag();
  showToast('info', `☁️ ${t('driveLoggedOut')}`);
  refreshAfterDriveAuth();
  try {
    window.dispatchEvent(new CustomEvent('driveAuthChanged', { detail: { loggedIn: false } }));
  } catch (_) {}
}

/* === EXPOSE driveUserEmail TO GLOBAL SCOPE (for js/admin.js) === */
Object.defineProperty(window, 'driveUserEmail', {
  get: () => driveUserEmail,
  configurable: true,
});
window.isDriveLoggedIn = isDriveLoggedIn;
window.isDriveTokenValid = isDriveTokenValid;
window.hadDriveSession = hadDriveSession;
window.ensureDriveToken = ensureDriveToken;
window.updateMenuSyncStatus = updateMenuSyncStatus;
window.checkDriveRemoteStatus = checkDriveRemoteStatus;

/* === INIT === */
function initSync() {
  const enableBtn = document.getElementById('menuDriveEnable');
  if (enableBtn) {
    enableBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const next = enableBtn.getAttribute('aria-checked') !== 'true';
      setDriveFeatureEnabled(next);
    };
  }



  const authBtn = document.getElementById('userAuthBtn');
  if (authBtn) {
    authBtn.onclick = () => {
      closeSideMenu();
      if (isDriveLoggedIn()) {
        logoutDrive();
      } else {
        loginDrive();
      }
    };
  }

  // Side-menu Sign in with Google
  const loginBtn = document.getElementById('menuDriveLogin');
  if (loginBtn) {
    loginBtn.onclick = () => {
      closeSideMenu();
      loginDrive();
    };
  }

  // Przycisk wylogowania
  const logoutBtn = document.getElementById('menuDriveLogout');
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      closeSideMenu();
      logoutDrive();
    };
  }

  // Warning row itself is now a <button> — clicking anywhere on it opens
  // the Sync Options panel (which shows the diff and offers Upload/Download).
  const warnBtn = document.getElementById('menuDriveWarn');
  if (warnBtn) {
    warnBtn.onclick = (e) => {
      e.preventDefault();
      closeSideMenu();
      openDriveSyncOptionsPanel();
    };
  }

  // Primary "Sync options" entry point — same target as the warning row.
  const syncOptionsBtn = document.getElementById('menuDriveSyncOptions');
  if (syncOptionsBtn) {
    syncOptionsBtn.onclick = () => {
      closeSideMenu();
      openDriveSyncOptionsPanel();
    };
  }

  // Always paint Drive UI; only touch Google when the feature is enabled.
  updateDriveUI();
  updateMenuSyncStatus();

  if (!driveFeatureOn()) {
    // Opt-out: no GIS load, no silent refresh, no auto-sync — no login popups.
    return;
  }

  loadGis().then(() => {
    if (gDriveClientId) initGDriveTokenClient();
    if (localStorage.getItem('grafik_drive_token') || driveUserEmail) {
      markDriveSession();
    }
    updateDriveUI();
    updateMenuSyncStatus();
    if (isDriveTokenValid()) {
      fetchDriveUserEmail();
      scheduleDriveTokenRefresh();
    }
    // Auto-check Drive on load — only in automatic mode. In manual-only mode
    // there are no background Drive checks or silent token refresh on startup.
    if (isDriveAutoSyncEnabled() && isDriveLoggedIn()) {
      handleAutoSyncCheck();
    }
  });

  // Auto-check Drive when user returns to the PWA (unlock phone, switch tab
  // back, etc). handleAutoSyncCheck() silently refreshes the token itself,
  // so this keeps working even after the access token has expired.
  document.addEventListener('visibilitychange', () => {
    if (
      document.visibilityState === 'visible' &&
      isDriveAutoSyncEnabled() &&
      isDriveLoggedIn()
    ) {
      handleAutoSyncCheck();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSync);
} else {
  initSync();
}
