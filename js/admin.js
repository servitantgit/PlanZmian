/* ================================================================
   PLAN ZMIAN — ADMIN module
   Admin identification + admin menu visibility
   ================================================================ */

/* === ADMIN EMAIL LIST ===
   Public in the code — safe.
   Knowing the email doesn't grant access — a Google login is still required. */
const ADMIN_EMAILS = [
  'servitant@gmail.com',
  'kipkvz@gmail.com', // ← додай, або зміни тут email нового адміна
];

/* === ADMIN STATE CHECK === */

/**
 * Checks whether the logged-in Google Drive user is an admin.
 * @returns {boolean}
 */
function isCurrentUserAdmin() {
  const email =
    typeof driveUserEmail === 'string' && driveUserEmail ? driveUserEmail.toLowerCase() : null;

  if (!email) return false;

  return ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email);
}

/**
 * Updates the body.admin-mode class according to admin state.
 * Shows/hides elements with the .admin-only class (via CSS).
 */
function updateAdminUI() {
  const isAdmin = isCurrentUserAdmin();

  if (isAdmin) {
    document.body.classList.add('admin-mode');
  } else {
    document.body.classList.remove('admin-mode');
  }

  // Ensure all .admin-only elements and #adminPanelSection are toggled
  const adminElements = document.querySelectorAll('.admin-only, #adminPanelSection');
  adminElements.forEach((el) => {
    if (isAdmin) {
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  });
}

/* === INICJALIZACJA === */

function initAdminMode() {
  updateAdminUI();
  window.addEventListener('driveAuthChanged', updateAdminUI);

  // Polling fallback: check admin state every 3 seconds
  // (needed because fetchDriveUserEmail from sync.js resolves async after login,
  // and we can't guarantee event 'driveAuthChanged' is dispatched)
  // Overhead is negligible — just checks a global variable.
  setInterval(updateAdminUI, 3000);
}

/* === EXPOSE TO GLOBAL SCOPE === */
window.isCurrentUserAdmin = isCurrentUserAdmin;
window.updateAdminUI = updateAdminUI;

/* === ADMIN GATE === */
function requireAdmin() {
  if (typeof isCurrentUserAdmin !== 'function' || !isCurrentUserAdmin()) {
    return false;
  }
  return true;
}
window.requireAdmin = requireAdmin;

/* === AUTO-INIT === */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdminMode);
} else {
  initAdminMode();
}
