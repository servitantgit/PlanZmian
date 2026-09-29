/* ================================================================
   Tests for js/schedules/remote.js (Cloudflare read-only schedule)

   Covers:
   - applyRemoteSchedulePayload(): the factorySchedule / factoryMonthHours
     ALIAS OBJECTS are never re-assigned (same reference), while the year
     content is updated;
   - invalid year is skipped, valid year is applied;
   - empty / malformed payload breaks nothing;
   - 'W' is rejected (the paint tool converts it to '' before writing);
   - client-side validation: array length vs days in month (incl. Feb 2028),
     unknown symbol, missing brigade, month 13.
   ================================================================ */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  REMOTE_SCHEDULE_CACHE_KEY,
  REMOTE_SCHEDULE_ID,
  REMOTE_ALLOWED_SHIFTS,
  validateRemoteYearPayload,
  validateRemoteSchedulePayload,
  applyRemoteSchedulePayload,
  remoteDaysInMonth,
} = require('../js/schedules/remote.js');

const BRIGADES = ['A', 'B', 'C', 'D'];

function makeData(year) {
  const data = {};
  for (let month = 1; month <= 12; month++) {
    const days = remoteDaysInMonth(year, month);
    const cell = {};
    BRIGADES.forEach((b) => {
      cell[b] = new Array(days).fill('R');
    });
    data[String(month)] = cell;
  }
  return data;
}

function makeHours() {
  const hours = {};
  for (let month = 1; month <= 12; month++) {
    const cell = {};
    BRIGADES.forEach((b) => {
      cell[b] = 168;
    });
    hours[String(month)] = cell;
  }
  return hours;
}

function makeEntry(year, overrides) {
  const entry = {
    revision: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    data: makeData(year),
    hours: makeHours(),
  };
  return Object.assign(entry, overrides || {});
}

function installRegistryStub() {
  const registered = [];
  global.factorySchedule = {};
  global.factoryMonthHours = {};
  global.registerYearData = function (scheduleId, year, data, hours) {
    registered.push({ scheduleId, year, data, hours });
    global.factorySchedule[year] = data;
    global.factoryMonthHours[year] = hours;
  };
  return registered;
}

// ============================================================
// cache key / constants
// ============================================================

test('remote: cache key is planzmian_remote_schedule_v1', () => {

// ============================================================
// applyRemoteSchedulePayload
// ============================================================

test('applyRemoteSchedulePayload: alias object reference stays, year content updated', () => {
  const registered = installRegistryStub();
  const scheduleRef = global.factorySchedule;
  const hoursRef = global.factoryMonthHours;

  const outcome = applyRemoteSchedulePayload({
    scheduleId: 'gillette',
    generatedAt: '2026-01-01T00:00:00.000Z',
    years: { '2026': makeEntry(2026) },
  });

  assert.deepStrictEqual(outcome.applied, [2026]);
  assert.deepStrictEqual(outcome.skipped, []);
  // The alias objects themselves must NOT be re-assigned
  assert.strictEqual(global.factorySchedule, scheduleRef);
  assert.strictEqual(global.factoryMonthHours, hoursRef);
  // ... and the year was really registered
  assert.strictEqual(registered.length, 1);
  assert.strictEqual(registered[0].scheduleId, 'gillette');
  assert.strictEqual(registered[0].year, 2026);
});

test('applyRemoteSchedulePayload: existing year object is updated in place', () => {
  installRegistryStub();
  const yearObject = makeData(2026);
  yearObject['1'].A[0] = 'P';
  global.factorySchedule[2026] = yearObject;

  const payload = { years: { '2026': makeEntry(2026) } };
  payload.years['2026'].data['1'].A[0] = 'N';
  applyRemoteSchedulePayload(payload);

  assert.strictEqual(global.factorySchedule[2026], yearObject, 'year object must be reused');
  assert.strictEqual(yearObject['1'].A[0], 'N');
  assert.strictEqual(yearObject['1'].A.length, 31);
});

test('applyRemoteSchedulePayload: invalid year skipped, valid year applied', () => {
  installRegistryStub();
  const bad = makeEntry(2026);
  bad.data['1'].A = new Array(3).fill('R'); // wrong length

  const outcome = applyRemoteSchedulePayload({
    years: { '2026': bad, '2027': makeEntry(2027) },
  });

  assert.deepStrictEqual(outcome.applied, [2027]);
  assert.deepStrictEqual(outcome.skipped, [2026]);
  assert.ok(global.factorySchedule[2027], '2027 must be present');
  assert.ok(!global.factorySchedule[2026], '2026 must not be applied');
});

test('applyRemoteSchedulePayload: empty payload does not throw and changes nothing', () => {
  installRegistryStub();
  const outcome = applyRemoteSchedulePayload({ scheduleId: 'gillette', years: {} });
  assert.deepStrictEqual(outcome, { applied: [], skipped: [] });
  assert.deepStrictEqual(Object.keys(global.factorySchedule), []);
});

test('applyRemoteSchedulePayload: malformed payload is ignored', () => {
  installRegistryStub();
  assert.deepStrictEqual(applyRemoteSchedulePayload(null), { applied: [], skipped: [] });
  assert.deepStrictEqual(applyRemoteSchedulePayload(undefined), { applied: [], skipped: [] });
  assert.deepStrictEqual(applyRemoteSchedulePayload({}), { applied: [], skipped: [] });
  assert.deepStrictEqual(applyRemoteSchedulePayload('nope'), { applied: [], skipped: [] });
});

test("applyRemoteSchedulePayload: value 'W' is rejected", () => {
  installRegistryStub();
  const entry = makeEntry(2026);
  entry.data['1'].A[3] = 'W';

// ============================================================
// client-side validation
// ============================================================

test('validate: array length != days in month is rejected (Feb 2028 = 29)', () => {
  assert.strictEqual(remoteDaysInMonth(2028, 2), 29);
  const entry = makeEntry(2028);
  entry.data['2'].A = new Array(28).fill('R');
  assert.strictEqual(validateRemoteYearPayload(2028, entry), false);
});

test('validate: correct leap-February length is accepted (Feb 2028 = 29)', () => {
  const entry = makeEntry(2028);
  entry.data['2'].A = new Array(29).fill('R');
  assert.strictEqual(validateRemoteYearPayload(2028, entry), true);
});

test('validate: unknown symbol is rejected', () => {
  const entry = makeEntry(2026);
  entry.data['5'].B[10] = 'X';
  assert.strictEqual(validateRemoteYearPayload(2026, entry), false);
});

test('validate: missing brigade is rejected', () => {
  const entry = makeEntry(2026);
  delete entry.data['3'].C;
  assert.strictEqual(validateRemoteYearPayload(2026, entry), false);
});

test('validate: extra brigade is rejected', () => {
  const entry = makeEntry(2026);
  entry.data['3'].E = new Array(31).fill('R');
  assert.strictEqual(validateRemoteYearPayload(2026, entry), false);
});

test('validate: month 13 is rejected', () => {
  const entry = makeEntry(2026);
  entry.data['13'] = { A: [], B: [], C: [], D: [] };
  assert.strictEqual(validateRemoteYearPayload(2026, entry), false);
});

test('validate: hours out of range are rejected', () => {
  const entry = makeEntry(2026);
  entry.hours['1'].A = 745;
  assert.strictEqual(validateRemoteYearPayload(2026, entry), false);
});

test('validate: year out of 2000..2100 is rejected', () => {
  assert.strictEqual(validateRemoteYearPayload(1999, makeEntry(1999)), false);
  assert.strictEqual(validateRemoteYearPayload(2101, makeEntry(2101)), false);
});


// ============================================================
// 2026.js compatibility (acceptance criterion: static == remote)
// ============================================================

test('remote: static 2026 schedule data passes client validation', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const code = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'schedules', 'gillette', '2026.js'),
    'utf8'
  );
  let captured = null;
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    registerSchedule() {},
    registerYearData(id, year, data, hours) {
      captured = { id, year, data, hours };
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  assert.ok(captured, '2026.js must call registerYearData()');
  assert.strictEqual(validateRemoteYearPayload(captured.year, captured), true);
  assert.strictEqual(captured.hours[10].A, 160, 'October / brigade A must stay 160');
});

test('validate: valid 2026 entry passes', () => {
  assert.strictEqual(validateRemoteYearPayload(2026, makeEntry(2026)), true);
});

test('validateSchedulePayload: full valid payload passes, empty years pass', () => {
  assert.strictEqual(
    validateRemoteSchedulePayload({ scheduleId: 'gillette', years: { '2026': makeEntry(2026) } }),
    true
  );
  assert.strictEqual(validateRemoteSchedulePayload({ years: {} }), true);
  assert.strictEqual(validateRemoteSchedulePayload(null), false);
});


  const outcome = applyRemoteSchedulePayload({ years: { '2026': entry } });
  assert.deepStrictEqual(outcome.applied, []);
  assert.deepStrictEqual(outcome.skipped, [2026]);
});

  assert.strictEqual(REMOTE_SCHEDULE_CACHE_KEY, 'planzmian_remote_schedule_v1');
});

test('remote: schedule id stays gillette', () => {
  assert.strictEqual(REMOTE_SCHEDULE_ID, 'gillette');
});

test('remote: allowed shifts are exactly "", "R", "P", "N"', () => {
  assert.deepStrictEqual(REMOTE_ALLOWED_SHIFTS, ['', 'R', 'P', 'N']);
});
