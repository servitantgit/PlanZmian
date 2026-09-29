# PROJECT_DOCS.md - Plan Zmian Technical Documentation

This document is the current English technical reference for Plan Zmian.
It is intended for developers and AI agents. Current source code is always the
final authority when this document and runtime behavior differ.

## 1. Project Overview

Plan Zmian is a local-first Progressive Web App for a four-brigade factory
shift schedule.

- Production URL: https://planzmian.pages.dev/
- Hosting: Cloudflare Pages (https://planzmian.pages.dev/)
- Stack: Vanilla JavaScript, HTML, CSS, localStorage, Service Worker
- JavaScript architecture: classic browser scripts, shared global scope
- No npm runtime dependencies
- No build system
- No ES modules
- No backend server
- Languages: Polish, English, Ukrainian

Primary schedule entities:

- Brigades: A, B, C, D
- Shifts: R (morning), P (afternoon), N (night)
- Free day: empty string internally, displayed as W/free
- Personal data: custom shifts, vacations, overtime, notes, preferences
- Public factory schedule: versioned JavaScript data files in git

Google Drive is optional. It is used only for personal-data backup and
synchronization between a user's own devices.

## 2. Runtime Load Order

The script order in `index.html` is significant.

1. `js/duration.js` (duration contract — pure helpers)
2. `js/schedules/_core.js`
3. `js/schedules/_registry.js`
3. `js/schedules/gillette/metadata.js`
4. `js/schedules/gillette/2026.js`
5. `js/personal/sync-tracking.js`
6. `js/personal/notes-tracking.js`
7. `js/overtime-logic.js`
8. `js/core.js`
9. `js/ui.js`
10. `js/edit.js`
11. `js/dashboard.js`
12. `js/smart-popup.js`
13. `js/calendar.js`
14. `js/views.js`
15. `js/actions.js`
16. `js/pwa.js`
17. `js/sync.js`
18. `js/admin.js`
19. `js/i18n/pl.js`
20. `js/i18n/en.js`
21. `js/i18n/uk.js`
22. `js/i18n/i18n.js`
23. `js/personalization.js`
24. `js/app-shell.js`
25. `js/settings.js`
26. `js/admin-center.js`
27. `js/main.js`

`main.js` must remain last because it initializes application state and renders
the initial view.

CSS load order is also significant. `css/app-shell.css` is the final normal
screen cascade layer.

## 3. Storage Model

All personal data is stored locally first. Storage keys are defined in
`js/schedules/_core.js`.

> **Legacy identifiers (do not rename).** The app was rebranded from Grafik Gillette to Plan Zmian, but the storage keys below,
> the Google Drive file names (`grafik-gillette-data.json` + `.backup-1..3.json`), the schedule id `gillette` and the
> `js/schedules/gillette/` directory keep their old names on purpose. Renaming them would orphan existing user data and
> Drive backups. A rename requires a migration that reads the old key/file and writes the new one.

| Storage key                   | Purpose                                 |
| ----------------------------- | --------------------------------------- |
| `gillette_prefs_v1`           | User preferences                        |
| `gillette_custom_schedule_v2` | Personal shift overrides                |
| `gillette_urlops_v1`          | Vacation dates                          |
| `gillette_overtimes_v1`       | Overtime records                        |
| `gillette_notes_v1`           | Unified day-note lists                  |
| `gillette_factory_drafts_v1`  | Local admin factory drafts              |
| `gillette_sync_meta`          | Sync timestamps, fingerprints, revision |
| `grafik_drive_token`          | Short-lived Google access token         |
| `grafik_drive_token_expiry`   | Access-token expiry timestamp           |
| `grafik_drive_file_id`        | Google Drive app-data file ID           |
| `grafik_drive_user_email`     | Cached signed-in email                  |
| `grafik_drive_had_session`    | Local Drive session marker              |

Never commit browser localStorage content to git.

### 3.1 Preferences

`prefs` is loaded and sanitized by `sanitizePrefs()` in `js/core.js`.
Unknown preference keys are preserved for forward compatibility. Every new
known preference must receive schema validation in `sanitizePrefs()`.

Relevant current preferences:

```javascript
{
  year: 2026,
  shift: 'A',
  view: 'dashboard',
  yearMode: false,

  theme: 'system' | 'light' | 'dark',
  lang: 'pl' | 'en' | 'uk',
  uiMode: 'simple' | 'advanced',
  uiModeToastShown: false,

  cellSkin: 'full' | 'strip' | 'quiet',
  uiSkin: 'industrial' | 'paper' | 'neon',
  tableDensity: 'compact' | 'comfortable',

  startView: 'dashboard' | 'month' | 'table',
  restoreLastView: true,

  notifications: false,
  notificationsLead: 1,

  privacyMode: false,

  // Dashboard only: display an active previous-day N shift under
  // its start date. Does not change active-shift selection.
  nightShiftDisplayPreviousDay: true,

  // Optional Google Drive feature gate.
  driveEnabled: false,

  // Background Drive checks and token refresh.
  // Default false. Manual Upload/Download still work.
  driveAutoSync: false,

  urlopLimits: { A: 26, B: 26, C: 26, D: 26 },
  vacationPreUsed: { A: 0, B: 0, C: 0, D: 0 },

  cellColors: {},

  welcomed: false,
  personalDataMigratedV5: false,
  notesUnifiedMigratedV1: false,

  reduceMotion: false,
  largeText: false,
  compactCells: false
}
3.2 Personal Shift Overrides
customSchedule is stored under gillette_custom_schedule_v2.

{
  [year]: {
    [month]: {
      [brigade]: ['R', 'P', 'N', '', ...]
    }
  }
}
The array index is day - 1.

The current sync payload stores compact shiftOverrides instead of the full
factory-schedule mirror where possible. js/personal/sync-tracking.js rebuilds
a usable nested personal schedule from those overrides.

3.3 Vacations
urlops is stored per brigade:

{
  A: ['2026-09-13', '2026-09-14'],
  B: [],
  C: [],
  D: []
}
Vacation data is personal. Privacy Mode hides it. Vacation limits and
pre-used vacation days are stored in prefs.

3.4 Overtime
Overtime uses a flat key:

`${year}-${month}-${day}-${brigade}`

Example:

{
  '2026-9-13-A': {
    przed: { hours: 2 },
    po: { hours: 1.5 },
    weekend: null
  },
  '2026-11-1-A': {
    przed: null,
    po: null,
    weekend: { hours: 5 }
  }
}

**Duration contract** (canonical module: `js/duration.js`, loaded before schedules/UI):

| Layer | Rule |
|-------|------|
| **Storage** | `hours` is always a non-negative decimal number (e.g. `1.5`, `4.8`). Never store display strings. |
| **Input** | Two fields: whole hours + minutes (0–59). Convert with `partsToDecimalHours`. Weekend limits: `DURATION_LIMITS` (0.5–24h). Przed/po max 5h. |
| **Display** | `formatDurationHoursI18n` → `4год 41хв` / `4h 41m`. Compact timeline: `formatHoursCompact` → `4.7h`. Ranges: `formatTimeRange` / `formatClockTime`. |
| **Validate** | `isValidWeekendDuration` / `isValidPrzedPoDuration`. |

**Categorization:** `categorizeOvertime` counts day/night by the minute so fractional durations are accurate. Night window remains 22:00–06:00.

Three position slots:
- `przed` — overtime BEFORE a scheduled shift (requires the day to have a shift)
- `po` — overtime AFTER a scheduled shift (requires the day to have a shift)
- `weekend` — N hours of work on a day WITHOUT a factory shift for this brigade (0.5-24 hours, no shift required). Categorized as +200% (holiday), +100% (Sunday/Saturday/weekday day-off). UI provides mutually exclusive choice between adding a full R/P/N shift and recording weekend hours.

Overtime notes are stored in the unified notes[] list with tags:
- `before` — note attached to overtime.przed
- `after` — note attached to overtime.po
- `weekend` — note attached to overtime.weekend

Records where all three slots are null/absent are deleted from storage (see `setOvertime()` in js/core.js).
Overtime notes are not stored inside overtimes.przed or overtimes.po.
They belong in unified notes with before or after tags.

3.5 Unified Notes
notes[key] contains an array of entries:

{
  '2026-9-13-A': [
    { id: 'note-abc', tag: null, text: 'Free-form note' },
    { id: 'note-def', tag: 'before', text: 'Before-shift overtime note' },
    { id: 'note-ghi', tag: 'after', text: 'After-shift overtime note' }
  ]
}
Rules:

tag: null is a free-form daily note.
tag: 'before' is the singleton note attached to overtime before shift.
tag: 'after' is the singleton note attached to overtime after shift.
A day can contain multiple free-form notes.
A day can contain at most one before and one after note.
Empty inline edits do not delete a note; deletion is a separate action.
Pure note-list logic lives in js/personal/notes-tracking.js and is covered by
tests/notes-tracking.test.js.

3.6 Factory Drafts
Factory drafts are admin working data stored locally under
gillette_factory_drafts_v1.

Draft values have three distinct meanings:

null // no override; use public factory value
'R'  // explicit morning shift
'P'  // explicit afternoon shift
'N'  // explicit night shift
''   // explicit free-day override
An empty string is a real override, not an absence of data.

Factory drafts:

must not be merged into personal customSchedule;
must not be visible in normal user views;
are shown only in the factory editor;
are exported into public schedule files only by the admin publishing flow;
must not be removed by personal-data cleanup.
4. Module Map
Schedules
js/duration.js
Duration contract (storage decimal hours; input H+M; display formatters). See §3.4.

js/schedules/_core.js
Shared constants and pure helpers:

month and weekday display names
shift definitions and time ranges
localStorage key constants
daysInMonthCal()
isWolne()
escapeHtml()
buildHolidays()
(re-exports duration helpers under Node for older tests)
js/schedules/_registry.js
Schedule registry and public-data aliases:

scheduleRegistry
AVAILABLE_YEARS
factorySchedule
factoryMonthHours
registerSchedule()
registerYearData()
shouldShowPersonalData()
setPrivacyMode()
js/schedules/gillette/metadata.js
Gillette schedule metadata:

four brigades: A/B/C/D
shifts R/P/N
continuous 4-brigade rotating schedule definition
js/schedules/gillette/YYYY.js
Public schedule data by year. These files are safe to commit and deploy.

Core Application
js/core.js
Storage and business logic:

preference loading, saving, and validation
personal schedule persistence
vacations and vacation limits
overtime persistence
unified note wrappers
factory draft persistence
schedule lookup
handoff and cycle helpers
personal data cleanup and one-time migrations
js/edit.js
Immediate personal shift editing:

getShiftAtWithPending() is an API-compatible alias for getShiftAt()
applyEdit() saves an override immediately
There is no pending edit buffer or undo/redo stack in the current runtime model.

js/dashboard.js
Dashboard rendering:

current shift card
handoff flow
next seven days
vacation and overtime summary cards
getLiveTimer()
jumpToDate()
getActiveDashboardShiftContext()
Overnight behavior:

after midnight, a previous-day N shift remains the active Dashboard context;
normal N ends at 06:00;
valid po overtime extends its active context and timer;
nightShiftDisplayPreviousDay changes only the date displayed on the card;
it never changes active-shift selection, overtime logic, or handoff logic.
js/calendar.js
Month calendar and selected-day details:

month rendering
selected-day info panel
vacation actions
overtime modal
monthly overtime summary
unified note UI
privacy-aware display rules
js/views.js
Year and table views:

mini-calendars for Year mode
all-brigade month and year tables
navigation from table/year cells to Month view
js/smart-popup.js
Timeline helpers used by Dashboard and Month view:

handoff nodes
cycle-to-free timeline
timeline arrows
segment controls
UI and Shell
js/ui.js
Shared UI helpers:

themes
UI skins
table density
Simple/Advanced UI mode
toast notifications
universal modal and confirmation UI
js/app-shell.js
Application shell owner:

full-screen app panel
action sheet
side drawer
primary navigation
mobile bottom navigation
shell UI synchronization
Do not put feature business logic into this module.

js/settings.js
Settings panel owner:

General settings
Appearance settings
UI mode
notifications
vacation limits
Data & privacy settings
Drive backup switch
automatic Drive sync switch
js/personalization.js
Low-level cell appearance:

R/P/N/U colors
full, strip, and quiet cell skins
Google Drive and PWA
js/sync.js
Google Drive OAuth and synchronization:

Google Identity Services token client
optional Drive feature gate
login/logout
upload/download
sync modal
remote status checks
conflict detection
silent token refresh
Drive UI status
Important preferences:

prefs.driveEnabled: enables the Google Drive feature.
prefs.driveAutoSync: enables background Drive checks and token refresh.
Manual-only Drive mode:

driveAutoSync defaults to false.
When Drive backup is enabled but auto sync is off, the app does not run:
startup Drive checks;
visibility-return checks;
side-menu auto checks;
proactive token refresh;
automatic remote download.
Manual Upload, Download, sync modal, and explicit login remain available.
Manual actions may try a silent token refresh first.
If silent refresh is unavailable, Google may require interaction after the
user explicitly requests a Drive operation.
js/personal/sync-tracking.js
Sync state and pure sync helpers:

sync metadata
timestamps
fingerprints
compact personal shift overrides
revision comparison
unsynced change detection
js/pwa.js
PWA behavior:

Service Worker registration
update checks
install prompt
notification permissions
shift notification scheduling
5. Privacy Model
Personal data is local-first and visible by default.

Privacy Mode is independent of Google Drive login.

When Privacy Mode is enabled:

public factory schedule remains visible;
personal shift overrides are hidden;
vacations are hidden;
overtime is hidden;
notes are hidden;
personal counters and timers are hidden where applicable;
personal overtime does not extend a night-shift context.
Google Drive is optional backup/synchronization, not a gate for personal-data
visibility.

6. Google Drive OAuth and Sync Strategy
6.1 OAuth Model
The application uses Google Identity Services token flow in a static browser
application.

Access tokens are short-lived, typically around one hour.
A static GitHub Pages application has no secure server-side location for a
long-lived Google refresh token.
Silent refresh uses prompt: '' where permitted by Google and the browser.
Interactive Google UI is used only when an explicit user action needs Drive
access and silent refresh cannot succeed.
The OAuth consent screen should remain in Google Cloud production status. This
avoids the separate Testing grant expiry behavior, but it does not remove the
normal short access-token lifetime.

6.2 Manual-only Drive Mode
prefs.driveAutoSync defaults to false.

When Drive backup is enabled but automatic sync is off, the application does
not perform background Drive checks, visibilitychange checks, proactive token
refresh, or automatic download. Drive is used only after an explicit Upload,
Download, or sign-in action.

This is a user-experience choice for a static browser-only application. Google
access tokens have a limited lifetime, and a manual Drive action may still
require interaction if silent refresh is unavailable. A custom domain or paid
hosting does not remove the normal Google access-token lifetime.

6.3 Automatic Drive Mode
When both driveEnabled and driveAutoSync are true:

the app can schedule a silent refresh about five minutes before expiry;
the app can check Drive at startup;
the app can check Drive after returning to a visible tab or PWA;
side-menu opening can trigger a status check;
remote data can auto-download when there are no local unsynced changes.
6.4 Conflict Handling
Drive synchronization is not a CRDT and does not perform a full three-way
merge.

The app uses:

Drive modifiedTime as a cheap initial signal.
Stable fingerprints to detect identical local/remote data.
Monotonic payload revision counters to reduce false conflicts caused by
device clock skew.
When both local and remote data truly changed, the user resolves the conflict
through the sync modal by choosing Upload or Download. This is effectively
last-write-wins after user confirmation.

### 6.5 Drive UX — Single Entry Point (v4.1+)

All Google Drive management is consolidated in the Drive card in the side menu. Do not add Drive controls anywhere else.

Drive card structure (top to bottom):

1. **Backup switch** — turns `prefs.driveEnabled` on/off. When off, no GIS load, no login prompts, no background activity.
2. **Account row** — visible only when logged in: avatar letter + email + optional admin badge.
3. **Warning row** — clickable button, visible only when there are unsynced changes or a stale/conflict state. Opens the Sync Options panel.
4. **Sync options button** (`#menuDriveSyncOptions`) — primary button, visible only when logged in. Opens the Sync Options panel.
5. **Logout button** — secondary/outline style, visible only when logged in.

The Sync Options panel is a full-screen `app-panel` opened by `openDriveSyncOptionsPanel()` in `js/sync.js`. Contents:

- **Sync mode selector** — Auto / Manual radio rows. Writes `prefs.driveAutoSync` directly. MUST NOT trigger any Drive request or token refresh on toggle (avoids accidental Google popups on misclick).
- **Actions row** — Upload (primary) and Download (secondary) buttons. Both close the panel and delegate to existing `uploadToDrive(true)` / `downloadFromDrive(true)`.
- **Changes table** — local-vs-remote diff fetched asynchronously via `fetchDriveRemotePayload()`. Shows counts per category (vacations, overtime, notes, custom shifts, factory drafts, vacation limits) with 📱 +N / ☁ +N indicators for deltas. Reconciles the local fingerprint if remote matches, updates the badge count.

Rules:

- Settings → Data & privacy must not contain any Drive control. It only owns Privacy Mode, local data counts, and the "Clear local personal data" button.
- The old ad-hoc `syncWithDrive()` modal is retired. The function name is kept for backward compatibility with existing callers (like `handleAutoSyncCheck()` conflict path) — it now just opens the new panel.
- The old `#menuSyncStatus` row, `#menuDriveWarnMore` "Details →" button, and `#stDriveEnabled` / `#stDriveAutoSync` switches from Settings are gone. Do not reintroduce them.
- The warning row itself (`#menuDriveWarn`, now a `<button>`) is the click target for opening the panel from a warning state. It uses `preventDefault()` to avoid accidental form-like behavior.

Related helpers (all in `js/sync.js`):

- `openDriveSyncOptionsPanel()` — public, exposed on `window.*`.
- `bindDriveSyncOptionsPanel(body)` — file-local, wires up mode radios, action buttons, and kicks off async diff.
- `renderDriveSyncOptionsDiff(container, localStats, remoteStats, state)` — file-local, renders the diff table (or loading/error state).

7. Admin Publishing Workflow
The public factory schedule is stored in:

js/schedules/gillette/YYYY.js
Admin Center edits create local factory drafts only. They do not publish data.

Publishing flow:

Sign in as an admin.
Open Admin Center.
Use the factory editor to create local R/P/N/W draft changes.
Export the year as YYYY.js.
Copy the exported file to js/schedules/gillette/.
For a new year only:
add the script to index.html;
add the path to sw.js ASSETS.
Commit and push to main.
GitHub Actions deploys the GitHub Pages version.
Users receive the update through Service Worker update flow.
Never publish personal customSchedule, vacations, overtime, or notes as
factory schedule data.

8. Service Worker and Deployment
sw.js uses a build ID placeholder:

const CACHE_NAME = 'plan-zmian-' + '__BUILD_ID__';
GitHub Actions replaces __BUILD_ID__ with the current commit hash during
deployment.

Rules:

New production JS/CSS files must be registered in both index.html and
sw.js.
Existing-file content changes do not require manual cache version changes.
Do not add temporary test files to the Service Worker cache list.
Preserve the unsupported-protocol filter in the fetch handler.
9. Tests and Quality Checks
Run all unit tests:

node tests/run.js
Run translation audit:

node tools/i18n-audit.js
Check JavaScript syntax:

node --check js/dashboard.js
node --check js/sync.js
node --check js/settings.js
The test suites cover pure logic only:

tests/notes-tracking.test.js
tests/overtime-logic.test.js
tests/schedules-core.test.js
tests/sync-tracking.test.js
Browser UI, Google OAuth, localStorage integration, and Service Worker behavior
require manual testing.

10. Current Limitations
State is global across classic scripts.
Google Drive sync does not perform a full field-level merge.
A static GitHub Pages application cannot safely store a Google refresh token.
Google access tokens have limited lifetimes.
Browser/PWA background execution is not reliable for scheduled activity.
Some older documentation and historical changelog entries may describe
removed architecture; this document reflects the current intended design.
Some legacy CSS and runtime compatibility code remain intentionally during
stabilization.
11. AI and Engineering Rules
The authoritative engineering rules are in:

docs/AGENT.md
Before modifying code:

Read docs/AGENT.md.
Inspect the current workspace.
Keep tasks focused and small.
Preserve unrelated behavior.
Use classic scripts, not ES modules.
Add every user-facing i18n key to PL, EN, and UK.
Validate every new prefs key in sanitizePrefs().
Do not log personal data or OAuth tokens.
Do not use inline event handlers in generated HTML.
Run relevant tests and manual regression checks before accepting a patch.
```
