/* ================================================================
   Tests for tools/seed-schedule.mjs (Phase 1.5 seed of 2026)

   The SQL produced by the seed script must be deep-equal to the data
   that js/schedules/gillette/2026.js registers — including
   hours[10].A === 160 (October / brigade A is intentionally 160,
   the seed must NOT recompute hours).
   ================================================================ */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SEED_FILE = path.join(ROOT, 'migrations', 'seed_2026.sql');
const SOURCE_FILE = path.join(ROOT, 'js', 'schedules', 'gillette', '2026.js');

function loadScheduleFromFile() {
  const code = fs.readFileSync(SOURCE_FILE, 'utf8');
  let captured = null;
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    registerSchedule() {},
    registerYearData(id, year, data, hours) {
      captured = { id, year, data, hours };
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: SOURCE_FILE });
  return captured;
}

/** Parses the single data_json / hours_json literal out of the seed SQL. */
function parseSeedSql(sql) {
  const lines = sql.split(/\r?\n/);
  const valuesAt = lines.findIndex((line) => line.trim().toUpperCase() === 'VALUES (');
  assert.ok(valuesAt >= 0, 'VALUES block not found in seed SQL');

  const cell = (index) => {
    const line = lines[valuesAt + 1 + index].trim();
    assert.ok(line.startsWith("'") && line.endsWith("',"), 'unexpected VALUES cell #' + index);
    return line.slice(1, -2).replace(/''/g, "'");
  };

  const revision = Number(lines[valuesAt + 5].trim().replace(',', ''));
  const updatedBy = lines[valuesAt + 7].trim().replace(/^'|'$/g, '');

  return {
    scheduleId: lines[valuesAt + 1].trim().replace(/[',]/g, ''),
    year: Number(lines[valuesAt + 2].trim().replace(',', '')),
    revision: Number.isFinite(revision) ? revision : null,
    updatedBy: updatedBy,
    dataJson: cell(2),
    hoursJson: cell(3),
  };
}

test('seed: migrations/seed_2026.sql exists', () => {
  assert.ok(fs.existsSync(SEED_FILE), 'run: node tools/seed-schedule.mjs');
});

test('seed: SQL data_json is deep-equal to what 2026.js registers', () => {
  const sql = fs.readFileSync(SEED_FILE, 'utf8');
  const parsed = parseSeedSql(sql);
  const registered = loadScheduleFromFile();

  // JSON text comparison: objects created inside a vm context have a different
  // Object prototype, which assert.deepStrictEqual would (correctly) reject.
  assert.strictEqual(JSON.stringify(JSON.parse(parsed.dataJson)), JSON.stringify(registered.data));
});

test('seed: SQL hours_json is deep-equal to what 2026.js registers', () => {
  const sql = fs.readFileSync(SEED_FILE, 'utf8');
  const parsed = parseSeedSql(sql);
  const registered = loadScheduleFromFile();

  assert.strictEqual(JSON.stringify(JSON.parse(parsed.hoursJson)), JSON.stringify(registered.hours));
});

test('seed: hours are taken verbatim — October / brigade A stays 160', () => {
  const sql = fs.readFileSync(SEED_FILE, 'utf8');
  const parsed = parseSeedSql(sql);
  const hours = JSON.parse(parsed.hoursJson);

  assert.strictEqual(hours['10'].A, 160);
  assert.notStrictEqual(hours['10'].A, 168, 'must not be recomputed as R+P+N*8');
});

test('seed: metadata is schedule gillette, revision 1, updated_by seed', () => {
  const sql = fs.readFileSync(SEED_FILE, 'utf8');
  const parsed = parseSeedSql(sql);

  assert.strictEqual(parsed.scheduleId, 'gillette');
  assert.strictEqual(parsed.year, 2026);
  assert.strictEqual(parsed.revision, 1);
  assert.strictEqual(parsed.updatedBy, 'seed');
});

test('seed: tools/seed-schedule.mjs regenerates byte-identical JSON payloads', async () => {
  const mod = await import('../tools/seed-schedule.mjs');
  const loaded = mod.loadSchedule2026();
  const registered = loadScheduleFromFile();

  assert.strictEqual(JSON.stringify(loaded.data), JSON.stringify(registered.data));
  assert.strictEqual(JSON.stringify(loaded.hours), JSON.stringify(registered.hours));
  assert.strictEqual(loaded.year, 2026);

  const sql = mod.buildSeedSql(loaded);
  const parsed = parseSeedSql(sql);
  assert.strictEqual(JSON.stringify(JSON.parse(parsed.dataJson)), JSON.stringify(registered.data));
  assert.strictEqual(JSON.stringify(JSON.parse(parsed.hoursJson)), JSON.stringify(registered.hours));
});
