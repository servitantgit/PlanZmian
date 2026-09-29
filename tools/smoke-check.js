#!/usr/bin/env node
/* ================================================================
   Zero-dependency smoke checks (no npm install required).
   Catches regressions that unit tests miss: missing login button,
   duration script order, OT input fields.
   Exit 0 = ok, 1 = fail.
   ================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const fails = [];
const oks = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function mustExist(rel) {
  if (!fs.existsSync(path.join(root, rel))) fails.push(`missing file: ${rel}`);
  else oks.push(`file exists: ${rel}`);
}

function mustInclude(rel, snippet, label) {
  const text = read(rel);
  if (!text.includes(snippet)) fails.push(`${label}: "${snippet}" not found in ${rel}`);
  else oks.push(`${label}: ok`);
}

function mustMatch(rel, re, label) {
  const text = read(rel);
  if (!re.test(text)) fails.push(`${label}: pattern not found in ${rel}`);
  else oks.push(`${label}: ok`);
}

// --- files ---
mustExist('js/duration.js');
mustExist('js/overtime-logic.js');
mustExist('js/sync.js');
mustExist('js/calendar.js');
mustExist('js/smart-popup.js');
mustExist('index.html');
mustExist('package.json');
mustExist('eslint.config.js');

// --- duration load order: duration.js before _core.js ---
{
  const html = read('index.html');
  const iDur = html.indexOf('js/duration.js');
  const iCore = html.indexOf('js/schedules/_core.js');
  if (iDur < 0) fails.push('index.html: duration.js script tag missing');
  else if (iCore < 0) fails.push('index.html: _core.js script tag missing');
  else if (iDur > iCore) fails.push('index.html: duration.js must load BEFORE schedules/_core.js');
  else oks.push('script order: duration.js before _core.js');
}

// --- side menu Google login ---
mustInclude('index.html', 'id="menuDriveLogin"', 'side menu login button in HTML');
mustInclude('js/sync.js', 'menuDriveLogin', 'side menu login wired in sync.js');
mustInclude('js/sync.js', 'loginDrive()', 'loginDrive() callable');

// --- OT hours + minutes inputs ---
mustInclude('index.html', 'id="otCustomHoursH"', 'OT modal hours field');
mustInclude('index.html', 'id="otCustomHoursM"', 'OT modal minutes field');
mustInclude('js/calendar.js', 'addShiftHoursH', 'weekend hours field');
mustInclude('js/calendar.js', 'addShiftHoursM', 'weekend minutes field');
mustInclude('js/calendar.js', 'partsToDecimalHours', 'uses duration contract on save');

// --- duration API surface ---
mustInclude('js/duration.js', 'function formatDurationHours', 'formatDurationHours');
mustInclude('js/duration.js', 'function formatHoursCompact', 'formatHoursCompact');
mustInclude('js/duration.js', 'function partsToDecimalHours', 'partsToDecimalHours');
mustInclude('js/duration.js', 'DURATION_LIMITS', 'DURATION_LIMITS');
mustInclude('js/smart-popup.js', 'formatHoursCompact', 'timeline uses compact format');

// --- i18n login key ---
mustInclude('js/i18n/uk.js', 'menuDriveLogin', 'uk menuDriveLogin');
mustInclude('js/i18n/en.js', 'menuDriveLogin', 'en menuDriveLogin');
mustInclude('js/i18n/pl.js', 'menuDriveLogin', 'pl menuDriveLogin');

// --- legacy GitHub Pages redirect stub (servitantgit.github.io/Graffik) ---
mustExist('redirect/index.html');
mustExist('redirect/sw.js');
mustInclude('redirect/index.html', 'https://planzmian.pages.dev/', 'redirect targets the new address');
mustInclude('redirect/index.html', 'http-equiv="refresh"', 'redirect has a no-JS meta refresh');
mustInclude('redirect/index.html', 'location.replace', 'redirect uses location.replace (no back-button loop)');
mustInclude('redirect/sw.js', 'caches.delete', 'legacy worker wipes the stale caches');
mustInclude('redirect/sw.js', 'registration.unregister', 'legacy worker unregisters itself');

// report
console.log('Smoke checks\n');
for (const line of oks) console.log('  ✓ ' + line);
if (fails.length) {
  console.log('');
  for (const line of fails) console.log('  ✗ ' + line);
  console.log(`\nFAIL: ${fails.length} issue(s), ${oks.length} ok`);
  process.exit(1);
}
console.log(`\nPASS: ${oks.length} checks`);
process.exit(0);
