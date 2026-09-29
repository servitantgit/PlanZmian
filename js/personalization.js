/* ================================================================
   PLAN ZMIAN — Cell colors + skins (low-level personalization)
   prefs.cellColors, prefs.cellSkin
   v4.0.0: the settings hub, its injected styles and the color/skin/
   vacation modals moved to js/settings.js + css/app-shell.css.
   This module keeps only the data + apply/save/reset API.
   ================================================================ */

const DEFAULT_CELL_COLORS = {
  R: '#f1c40f',
  P: '#27ae60',
  N: '#3498db',
  U: '#14b8a6',
};

const CELL_SKINS = ['full', 'strip', 'quiet'];
const DEFAULT_CELL_SKIN = 'full';

const COLOR_PRESETS = [
  '#f1c40f', '#f39c12', '#e67e22', '#e74c3c', '#c0392b',
  '#82e0aa', '#27ae60', '#1abc9c', '#16a085', '#0e6655',
  '#aed6f1', '#5dade2', '#3498db', '#2980b9', '#1a5276',
  '#2dd4bf', '#14b8a6', '#0f766e', '#f9a8d4', '#a78bfa',
  '#8b7a9e', '#7b6b8f', '#94a3b8', '#64748b', '#1e293b',
];

function _hexToRgb(hex) {
  const h = String(hex || '').replace('#', '').trim();
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  if (h.length !== 6) return { r: 128, g: 128, b: 128 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function _normalizeHex(hex) {
  let h = String(hex || '').trim();
  if (!h.startsWith('#')) h = '#' + h;
  if (/^#[0-9a-fA-F]{3}$/.test(h)) {
    h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(h)) return null;
  return h.toLowerCase();
}

function _luminance(hex) {
  const { r, g, b } = _hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function _textOn(hex) {
  return _luminance(hex) > 0.55 ? '#1a1a1a' : '#ffffff';
}

function _darken(hex, factor) {
  const { r, g, b } = _hexToRgb(hex);
  const f = Math.max(0, Math.min(1, factor));
  const d = (c) => Math.round(c * (1 - f));
  return (
    '#' +
    [d(r), d(g), d(b)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
  );
}

function getCellColors() {
  const c = (prefs && prefs.cellColors) || {};
  return {
    R: _normalizeHex(c.R) || DEFAULT_CELL_COLORS.R,
    P: _normalizeHex(c.P) || DEFAULT_CELL_COLORS.P,
    N: _normalizeHex(c.N) || DEFAULT_CELL_COLORS.N,
    U: _normalizeHex(c.U) || DEFAULT_CELL_COLORS.U,
  };
}

function applyCellColors(colors) {
  const c = colors || getCellColors();
  const root = document.documentElement;
  const set = (k, v) => root.style.setProperty(k, v);

  set('--color-R', c.R);
  set('--color-R-border', _darken(c.R, 0.18));
  set('--color-R-text', _textOn(c.R));

  set('--color-P', c.P);
  set('--color-P-border', _darken(c.P, 0.18));
  set('--color-P-text', _textOn(c.P));

  set('--color-N', c.N);
  set('--color-N-border', _darken(c.N, 0.18));
  set('--color-N-text', _textOn(c.N));
  set('--color-N-grad', `linear-gradient(135deg, ${c.N}, ${_darken(c.N, 0.25)})`);

  set('--color-U', c.U);
  set('--color-U-border', _darken(c.U, 0.2));
  set('--color-U-text', _textOn(c.U));
  set('--color-U-grad', `linear-gradient(135deg, ${c.U}, ${_darken(c.U, 0.28)})`);
}

function saveCellColors(colors, markSync) {
  if (!prefs.cellColors) prefs.cellColors = {};
  ['R', 'P', 'N', 'U'].forEach((k) => {
    const n = _normalizeHex(colors[k]);
    if (n) prefs.cellColors[k] = n;
  });
  savePrefs(prefs, markSync !== false);
  applyCellColors(getCellColors());
}

function resetCellColors() {
  prefs.cellColors = { ...DEFAULT_CELL_COLORS };
  savePrefs(prefs, true);
  applyCellColors(getCellColors());
}

function getCellSkin() {
  const s = prefs && prefs.cellSkin;
  return CELL_SKINS.includes(s) ? s : DEFAULT_CELL_SKIN;
}

function applyCellSkin(skin) {
  const s = CELL_SKINS.includes(skin) ? skin : getCellSkin();
  document.body.classList.remove('skin-full', 'skin-strip', 'skin-quiet');
  document.body.classList.add('skin-' + s);
}

function saveCellSkin(skin, markSync) {
  if (!CELL_SKINS.includes(skin)) skin = DEFAULT_CELL_SKIN;
  prefs.cellSkin = skin;
  savePrefs(prefs, markSync !== false);
  applyCellSkin(skin);
}

function applyPersonalization() {
  applyCellColors();
  applyCellSkin(getCellSkin());
}
