#!/usr/bin/env node
/* ================================================================
   Test runner entry point.

   Usage:
     node tests/run.js                            (works on Node 18+)
     node --test "tests/*.test.js"                (Node 21+ only)
     node --test tests/overtime-logic.test.js     (single file)

   This script expands tests/*.test.js itself and hands explicit paths to
   `node --test`, because Node's own glob expansion in --test arguments only
   exists since Node 21 and the directory form breaks on Windows.
   ================================================================ */

'use strict';

const nodeVersion = process.versions.node.split('.').map(Number);
const majorVersion = nodeVersion[0];

if (majorVersion < 18) {
  console.error('\x1b[31m✖ Node.js 18+ required (found: ' + process.version + ')\x1b[0m');
  console.error('  node:test module is not available in older versions.');
  console.error('  Install Node 18+ from https://nodejs.org/');
  process.exit(1);
}

console.log('\x1b[36m═══════════════════════════════════════════════════════\x1b[0m');
console.log('\x1b[36m  Plan Zmian — Unit Tests\x1b[0m');
console.log('\x1b[36m═══════════════════════════════════════════════════════\x1b[0m');
console.log('  Node: ' + process.version);
console.log('');
console.log('  Preferred usage:');
console.log('    \x1b[33mnode tests/run.js\x1b[0m');
console.log('    \x1b[33mnode --test "tests/*.test.js"\x1b[0m \x1b[2m(Node 21+ only)\x1b[0m');
console.log('');
console.log('  Running all tests via child_process...');
console.log('');

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// NOTE: Passing the tests/ directory directly to --test is unreliable on
// Windows / Node 22+ (Node tries to load the directory as a module and fails
// with MODULE_NOT_FOUND), while a glob pattern only works on Node 21+ — on
// Node 18/20 it fails with "Could not find 'tests/*.test.js'".
// Expanding the file list ourselves works identically on every Node 18+.
const testFiles = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith('.test.js'))
  .sort()
  .map((f) => path.join(__dirname, f).replace(/\\/g, '/'));

if (testFiles.length === 0) {
  console.error('\x1b[31m✖ No *.test.js files found in ' + __dirname + '\x1b[0m');
  process.exit(1);
}

console.log('  Test files: ' + testFiles.length);
console.log('');

const result = spawnSync(
  process.execPath,
  ['--test', '--test-reporter=spec', ...testFiles],
  { stdio: 'inherit' }
);

if (result.error) {
  console.error('\x1b[31m✖ Could not start the test runner: ' + result.error.message + '\x1b[0m');
  process.exit(1);
}

// Preserve the real exit status, including termination by signal.
process.exit(result.status === null ? 1 : result.status);