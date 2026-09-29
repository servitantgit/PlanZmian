# AGENT.md — Plan Zmian engineering rules

**Status:** mandatory
**Updated:** 2026-09-22
**Project state:** post-v4 UI refactor stabilization + Weekend Hours feature complete
**Owner language:** Ukrainian
**Primary UI language:** Polish

---

## 0. READ THIS FIRST

This file is the current and authoritative instruction set for every AI agent working on Plan Zmian.

Before analyzing, planning, or modifying code:

1. Read this file completely.
2. Read the user's current request.
3. Inspect the actual current files.
4. Identify the smallest safe scope.
5. Preserve working behavior outside that scope.
6. Stop and ask if the request or current architecture is ambiguous.

Do not rely on old prompts, previous chat assumptions, old line numbers, historical documentation, or an earlier `code.json`.

The current workspace is the source of truth.

### Required first line in every future agent task

Every task given to an implementation agent must begin with this exact line:

    READ AGENT.md COMPLETELY BEFORE MAKING ANY CHANGE.

If a task does not contain that line, the agent must still read this file before acting.

---

## 1. CURRENT PRIORITY: STABILIZATION

The application underwent a large UI and menu refactor. Several regressions were introduced.

Until the owner explicitly ends stabilization mode:

- fix existing behavior before adding features;
- make one focused repair at a time;
- modify no more than 1-2 production files per task whenever possible;
- do not perform architectural cleanup together with a bug fix;
- do not rewrite a module because it looks untidy;
- do not remove compatibility code unless all references were verified;
- do not change working layout while fixing business logic;
- do not change data models while fixing UI;
- do not change Service Worker behavior unless the task concerns PWA caching;
- do not update documentation in the same task as a runtime repair;
- do not assume a later task will repair the current task.

A task is complete only when its exact user scenario works and existing related scenarios still work.

### Current protected areas

These areas were manually repaired after the large refactor and must not be redesigned without an explicit request:

- top bar order and placement;
- context toolbar layout;
- period navigation placement;
- Month/Year control placement;
- mobile bottom navigation;
- current Google Drive card;
- current GitHub Pages deployment workflow;
- current factory-draft storage concept;
- current Admin Center entry point;
- current factory editor period synchronization;
- Simple/Advanced UI mode toggle behavior;
- `.advanced-only` CSS class semantics;
- `prefs.uiMode` default detection logic;
- `sanitizePrefs()` schema validation logic in `js/core.js`;
- privacy auto-disable when switching Advanced → Simple;
- Drive silent token refresh flow (`ensureDriveToken`, `trySilentDriveRefresh`, `scheduleDriveTokenRefresh`) — do not reintroduce "no auto OAuth";
- `prefs.driveEnabled` opt-in gate (`isDriveFeatureEnabled()`): when false, do not load GIS, request tokens, or show Google login UI; default false for new users, true if an existing Drive session is detected;
- `handleAutoSyncCheck()` conflict verification order (fingerprint reconcile, then revision compare, before warning the user);
- `revision` field in the Drive sync payload and `meta.revision` in `gillette_sync_meta` — only ever advances, never regress it;
- unified `notes[key]` array format (`{id, tag, text}`, tag null/'before'/'after'/'weekend') — do not reintroduce separate per-position note fields on `overtimes[key]`;
- `openDriveSyncOptionsPanel()`, `bindDriveSyncOptionsPanel()`, `renderDriveSyncOptionsDiff()` in `js/sync.js` — the single Drive management UI; do not add duplicate Drive controls elsewhere;
- Drive card in the side menu is the primary Drive entry point: enable/disable switch, **login** (`#menuDriveLogin`), account display, warning row, Sync options, logout. Do not scatter Drive controls into Settings or other panels;
- mode toggle (Auto/Manual) in the Sync Options panel writes `prefs.driveAutoSync` directly and MUST NOT trigger any Drive request or token refresh — avoids accidental Google popups on misclick;
- `overtimes[key].weekend` slot in `js/core.js` — third position alongside `przed`/`po` for hours-only overtime; do not remove or rename without updating `overtime-logic.js` and `js/calendar.js` display code;
- Overtime duration contract lives in `js/duration.js` (loaded first): storage is decimal hours; UI input is hours+minutes; display via `formatDurationHoursI18n` / `formatHoursCompact` — never show raw floats like `4.68333h`. Do not reintroduce decimal-only inputs without updating this module and tests;
- Drive card login: `#menuDriveLogin` must remain when Drive is ON and user is logged out (alongside header `userAuthBtn`);
- Weekend hours UI mutual exclusion in `openAddShiftModal()` (`js/calendar.js`) — picking R/P/N clears weekend slot, saving weekend hours clears custom shift; do not allow both simultaneously;
- Variant C safeguard in `getMonthOvertimeSummary()` (`js/core.js`) — `if (isAddedShift && !hasWeekendHours)` prevents double-counting when both slots exist through corrupted data;
- Space/Enter accessibility guard in `bindNotesListEvents` (`js/notes-view.js`) and `renderInfo` note-edit block (`js/calendar.js`) — `if (event.target !== el) return;` prevents Space key from being swallowed when typing in inline edit input.

Local bug fixes inside these areas are allowed. Structural redesign is not.

---

## 2. PROJECT OVERVIEW

Plan Zmian is a Progressive Web App for a four-brigade factory shift schedule.

### Stack

- Vanilla JavaScript, ES2020+
- Classic browser scripts
- HTML5
- Modular CSS
- localStorage
- Service Worker
- Web App Manifest
- Google Drive OAuth and Drive API
- Cloudflare Pages
- No runtime framework
- No build system
- No npm runtime dependencies
- No TypeScript
- No ES modules

### Production URL

https://planzmian.pages.dev/

### Branding and legacy identifiers

The product name is **Plan Zmian** (formerly Grafik Gillette / Graffik). Use it in all user-visible text and docs.
Do NOT rename technical identifiers that carry the old name: `localStorage` keys (`gillette_*`, `grafik_*`),
Google Drive file names (`grafik-gillette-data*.json`), schedule id `gillette`, `js/schedules/gillette/`,
ICS UID suffix `@gillette`. Changing them breaks existing user data and Drive sync unless a migration is written first.

### Primary concepts

- Brigades: A, B, C, D
- Shifts:
  - `R` — morning
  - `P` — afternoon
  - `N` — night
  - `''` — free day
- Vacation: stored separately from schedule data
- Overtime slots:
  - `przed` — before a shift
  - `po` — after a shift
  - `weekend` — N hours on a factory-free day (no shift required)
- Personal data is local-first
- Google Drive is optional backup and synchronization
- Privacy Mode is independent from Google login
- Public factory schedule is stored in git
- Personal schedule overrides are not public factory data
- Factory drafts are separate admin data

---

## 3. CURRENT PRODUCTION FILES

### Application entry

- `index.html`

### CSS load order

The actual order in `index.html` is authoritative. Expected current order:

1. `css/variables.css`
2. `css/layout.css`
3. `css/components.css`
4. `css/calendar.css`
5. `css/overtime.css`
6. `css/views.css`
7. `css/dashboard.css`
8. `css/responsive.css`
9. `css/print.css`
10. `css/smart-popup.css`
11. `css/app-shell.css`

`app-shell.css` is the final normal-screen cascade layer. Do not move CSS files without checking cascade effects.

### JavaScript load order

Expected current order:

1. `js/schedules/_core.js`
2. `js/schedules/_registry.js`
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
27. `js/notes-view.js`
28. `js/main.js`

`main.js` must remain last.

### Current major modules

| File                        | Responsibility                                            |
| --------------------------- | --------------------------------------------------------- |
| `js/schedules/_core.js`     | shared constants, storage keys, dates, holidays           |
| `js/schedules/_registry.js` | schedule registry, public schedule aliases, Privacy Mode  |
| `js/core.js`                | localStorage and schedule business logic                  |
| `js/edit.js`                | immediate personal schedule override helper               |
| `js/calendar.js`            | month calendar, selected-day details, overtime modal      |
| `js/views.js`               | year and table views                                      |
| `js/dashboard.js`           | dashboard                                                 |
| `js/actions.js`             | ICS, print, Share Center, Export Center                   |
| `js/app-shell.js`           | panel, action sheet, drawer and shell navigation          |
| `js/settings.js`            | full-screen Settings UI                                   |
| `js/admin-center.js`        | Admin Center, factory editor and factory export           |
| `js/notes-view.js`          | full-screen Notes View panel with filters and inline edit |
| `js/pwa.js`                 | Service Worker registration, install and notifications    |
| `js/sync.js`                | Google Drive login, upload, download and sync UI          |
| `js/admin.js`               | admin identity and visibility                             |
| `js/personalization.js`     | low-level cell colors and skins                           |
| `js/i18n/*.js`              | Polish, English and Ukrainian translations                |

---

## 4. NON-NEGOTIABLE JAVASCRIPT RULES

### 4.1 No ES modules

Never add:

    import ...
    export ...
    export default ...

Use classic scripts and explicit globals only when cross-file access is required:

    function myFunction() {
      // ...
    }

    window.myFunction = myFunction;

Do not expose every internal helper on `window`.

### 4.2 Defensive cross-module calls

Use:

    if (typeof refreshViews === 'function') {
      refreshViews();
    }

For optional public APIs on `window`:

    if (typeof window.openAppPanel === 'function') {
      window.openAppPanel(config);
    }

Do not use a defensive check to hide a required missing dependency. If the function is required for the feature, report or fix the missing dependency.

### 4.3 No inline event handlers in generated HTML

Never generate:

    <button onclick="doSomething()">...</button>

Never serialize a closure:

    onclick="(${handler.toString()})()"

This loses lexical scope and silently breaks local variables.

Correct pattern:

    container.innerHTML = `
      <button type="button" data-action="save">Save</button>
    `;

    const saveButton = container.querySelector('[data-action="save"]');
    if (saveButton) {
      saveButton.addEventListener('click', handleSave);
    }

### 4.4 Never hide exceptions silently

Forbidden:

    try {
      doSomething();
    } catch (e) {}

Use a prefixed warning or error when failure matters:

    try {
      doSomething();
    } catch (error) {
      console.error('[calendar]', 'Failed to update day details', error);
    }

Empty catches are allowed only for truly optional browser APIs and must include an explanatory comment.

### 4.5 Do not clone DOM nodes to remove listeners

Forbidden:

    const fresh = button.cloneNode(true);
    button.parentNode.replaceChild(fresh, button);

This can remove listeners installed by other modules. Each DOM control must have one clear owner. If duplicate listeners exist, fix ownership rather than replacing the node.

### 4.6 One owner per event domain

Current intended ownership:

| Event domain                     | Owner                                                      |
| -------------------------------- | ---------------------------------------------------------- |
| app panel and action sheet       | `js/app-shell.js`                                          |
| side drawer shell                | `js/app-shell.js`                                          |
| primary and mobile navigation    | `js/app-shell.js` with state functions from `main.js`      |
| universal modal                  | `js/ui.js`                                                 |
| overtime modal                   | `js/calendar.js`                                           |
| Google Drive controls            | `js/sync.js`                                               |
| Settings controls                | `js/settings.js`                                           |
| Admin Center controls            | `js/admin-center.js`                                       |
| Notes View controls              | `js/notes-view.js`                                         |
| factory editor keyboard controls | must have exactly one owner                                |
| selected-day actions             | `js/calendar.js` (immediate edit via `js/edit.js` helpers) |

Before adding a listener, search for an existing listener for the same element or keyboard event.

### 4.7 No duplicate function declarations

Before adding a global or top-level function, verify that the name does not already exist. Duplicate declarations in classic scripts silently override earlier behavior.

### 4.8 Do not shadow `t()`

Forbidden:

    const t = new Date();

Use:

    const now = new Date();

The global `t()` function is used for translations.

### 4.9 Console prefixes

Use lowercase module prefixes:

    console.warn('[sync]', 'Token expired');
    console.error('[actions]', 'Share failed', error);
    console.log('[calendar]', 'Rendered month', month);

Never log:

- OAuth tokens
- user email in production diagnostics
- notes
- vacation dates
- overtime content
- personal schedule content

### 4.10 New prefs keys must go through `sanitizePrefs`

When adding a new `prefs.XXX` key:

1. Add validation rule to `sanitizePrefs()` in `js/core.js`.
2. Provide safe default value.
3. Preserve behavior: unknown keys are kept (forward compat).
4. Document in `docs/PROJECT_DOCS.md` section "prefs schema".

Do not silently accept new prefs keys without validation. Corrupted or missing values must not crash the app.

### 4.11 i18n keys must be defined before use

Before calling `t('newKey')` in code:

1. Add key to all three files: `js/i18n/pl.js`, `en.js`, `uk.js`.
2. Do NOT use fallback pattern `t('key') || 'text'` — `t()` returns key name (truthy) if missing, so fallback never triggers.
3. Run `node tools/i18n-audit.js` before commit to detect missing keys.

If dynamic key construction is used (e.g. `t('label' + variant)`), ensure all possible variants are defined.

---

## 5. UTF-8 AND TEXT SAFETY

All source files must remain UTF-8 without BOM.

Preserve literal characters:

- Polish: ą ć ę ł ń ó ś ź ż
- Ukrainian: і ї є ґ
- emoji
- arrows and typographic symbols already present in source

Never convert them to Unicode escape sequences for normal source strings.

### Known corruption signatures

The current repository has had mojibake such as:

- вЂ”
- рџЊґ
- рџ"¤
- рџ–ЁпёЏ

Do not copy corrupted text into new code.

When a file already contains mojibake:

- repair only verified corrupted literals;
- do not re-encode the entire file blindly;
- compare intended text with an earlier known-good commit when possible;
- verify Polish, Ukrainian and emoji after the change.

Never use this PowerShell pattern to rewrite source:

    Get-Content file.js | Set-Content file.js

Use UTF-8 APIs without BOM.

---

## 6. I18N RULES

Every user-facing string must exist in all three files:

- `js/i18n/pl.js`
- `js/i18n/en.js`
- `js/i18n/uk.js`

Polish is the primary UI language.

### Required behavior of `t()`

The current `t(key)` function returns the key name when no translation exists. Therefore this is unreliable:

    t('missingKey') || 'Fallback'

`t('missingKey')` is truthy, so the fallback is never used.

Before using a key:

- verify it exists in all three dictionaries;
- use exactly the same key spelling;
- keep parameter names consistent.

Do not invent a key in JavaScript without adding it to all dictionaries in the same task.

### Translation parity

For any i18n task, verify:

- the key exists exactly once in PL;
- exactly once in EN;
- exactly once in UK;
- placeholders match;
- the object syntax remains valid.

### UI fallback policy

Hardcoded fallback text is acceptable only for an emergency failure path before i18n initializes. It is not acceptable as the normal UI implementation.

### Technical compatibility

Do not rename:

- `full`
- `strip`
- `quiet`
- `skin-full`
- `skin-strip`
- `skin-quiet`

The UI label for `quiet` is:

- Polish: Kolorowe obramowanie
- English: Colored outline
- Ukrainian: Кольорове обведення

---

## 7. DATA OWNERSHIP AND PRIVACY

### 7.1 Public factory schedule

Stored in:

    js/schedules/gillette/YYYY.js

Public schedule data is git-tracked and visible to everyone. Do not modify `js/schedules/gillette/2026.js` during UI or infrastructure tasks. Any schedule-data correction requires explicit owner confirmation.

### 7.2 Personal schedule overrides

- Storage key: `gillette_custom_schedule_v2`
- Variable: `customSchedule`

This is personal data. It must not be used as public factory schedule data.

### 7.3 Factory drafts

- Storage key: `gillette_factory_drafts_v1`
- Variable: `factoryDrafts`

Factory drafts are admin working data.

Rules:

- normal user views must not render factory drafts;
- Privacy Mode must not expose factory drafts;
- factory editor may render factory drafts;
- factory export may overlay factory drafts on public factory data;
- factory drafts must not be merged into personal `customSchedule`;
- personal data clearing must not delete factory drafts;
- Admin Danger Zone must not clear personal data.

### 7.4 Other personal storage

- `gillette_urlops_v1`
- `gillette_notes_v1`
- `gillette_overtimes_v1`
- `gillette_prefs_v1`
- `gillette_sync_meta`

Google Drive token and session keys are also local. Never commit actual localStorage data.

### 7.5 Privacy Mode

Privacy Mode is independent from Google login.

When Privacy Mode is on:

- show only the public factory schedule;
- hide personal schedule overrides;
- hide vacations;
- hide overtime;
- hide notes;
- hide personal counters and timers where required;
- hide selected-day personal actions.

Google login is for backup/sync and admin identity, not personal-data visibility.

---

## 8. FACTORY DRAFT RULES

A factory draft cell must distinguish three states:

    null       // no draft override; use public factory value
    'R'        // explicit morning shift override
    'P'        // explicit afternoon shift override
    'N'        // explicit night shift override
    ''         // explicit free-day override

An empty string is a real draft change. Do not treat it as "no draft".

Incorrect:

    if (value !== '') count++;

Correct logic must compare the draft value with `null` or compare it with the public factory value.

### Export

Factory export must use:

- public factory schedule + factory draft overrides

It must never use personal `customSchedule` unless the admin explicitly copies personal data into a draft.

### Drive sync symmetry

If a field is uploaded, it must also be downloaded and applied.

For every payload field verify all of these:

- local payload builder;
- upload payload;
- remote statistics;
- download application;
- persistence;
- UI refresh;
- backward compatibility when the field is missing.

Old Drive payloads without `factoryDrafts` must remain valid.

---

## 9. UI ARCHITECTURE RULES

### 9.1 App shell

`js/app-shell.js` owns:

- full-screen app panel;
- action sheet;
- side drawer shell;
- desktop navigation;
- mobile bottom navigation;
- shell state synchronization.

Do not place feature business logic in `app-shell.js`. Examples of feature logic that do not belong there:

- exporting ICS;
- generating QR;
- clearing personal data;
- editing a day;
- editing factory drafts;
- Drive synchronization.

`app-shell.js` may call public feature entry points.

### 9.2 Universal modal

Use the universal modal only for short transactional operations:

- confirmation;
- destructive action;
- overtime entry;
- short form;
- overwrite warning.

Do not use it as a multi-screen navigation system.

### 9.3 Full-screen panel

Use the app panel for:

- Settings
- FAQ
- About
- Admin Center
- Notes View

Panel stack navigation must be owned by `app-shell.js`.

### 9.4 Action sheet

Use the action sheet for short sets of related actions:

- Share
- Export and Print

On mobile it opens from the bottom. On desktop it can be centered.

### 9.5 Dynamic info panel

The selected-day info panel is generated by JavaScript. Do not edit placeholder content in `index.html` to change real day details. Modify the active day renderer in `js/calendar.js`; shared edit helpers live in `js/edit.js`.

### 9.6 Selected-day editing

Personal day actions belong to Month view day details.

Expected actions:

- add/remove vacation;
- add/change/clear personal extra shift when allowed;
- overtime before;
- overtime after;
- weekend hours (on factory-free days);
- note editing.

Rules:

- normal calendar click selects a day;
- it must not mutate data immediately;
- action buttons must use bound listeners;
- disabled actions need a visible reason;
- vacation must support both add and remove;
- note save must happen once per actual change;
- personal actions are hidden in Privacy Mode.

### 9.7 Year and Table views

Year and Table views are navigation-only for personal editing.

Clicking a day/cell should:

- select the correct brigade when appropriate;
- select the correct month;
- select the correct day;
- disable Year mode;
- open Month view.

Year view must not refer to an undefined `brig` variable. In `buildMonthTable(month)`, always use the function argument `month`, not global `currentMonth`, when reading that table's data.

### 9.8 Factory editor

Factory editor is admin-only.

While active:

- render public factory schedule plus factory draft overrides;
- do not render personal vacations, overtime, notes or custom shifts;
- allow brigade navigation;
- allow month/year navigation;
- paint only factory drafts;
- keep keyboard ownership in one module;
- exit immediately if admin identity is lost.

Do not add factory painting logic to Year or Table views unless explicitly requested.

---

## 10. CURRENT KNOWN REGRESSIONS

These issues are known in the current post-refactor code. Do not assume they are fixed unless the current workspace proves otherwise.

### Runtime and behavior

- `js/views.js` Year view may reference undefined `brig`.
- Year view contains factory-paint logic that should not be there.
- Privacy Table may read `currentMonth` instead of its `month` argument.
- Share Center tab switching does not correctly render Application content.
- Share Center QR container may not exist when listeners are bound.
- `js/actions.js` contains mojibake.
- Selected-day actions serialize closures into inline `onclick`.
- Selected-day action errors are silently swallowed.
- Existing vacation may disable the button instead of allowing removal.
- Extra shift availability may ignore vacation state.
- ~~Note change and blur may save the same value twice.~~ FIXED via `saveInProgress` flag + `commitNote()` (see CHANGELOG).
- There is no separate day-editor module; day UI is rendered in `js/calendar.js` with `js/edit.js` helpers.
- Factory editor keyboard handling exists in more than one module.
- Factory editor may block brigade selection.
- Factory editor may render personal OT and notes.
- Drive upload includes factory drafts but download may not restore them.
- Sync statistics may calculate factory drafts without displaying them.
- Draft change counting may ignore explicit free-day overrides.
- Admin Center contains inline handlers.
- Admin Danger Zone includes personal-data reset even though it should be draft-only.
- Admin export instructions are hardcoded in Ukrainian.
- ~~Settings and Share use translation keys that do not exist.~~ 3 keys fixed (`infoWorking`, `adminAuthLost`, `en.login`). Use `tools/i18n-audit.js` to find remaining gaps.
- ~~Space key swallowed in inline note edit on desktop.~~ FIXED via `event.target !== el` guard in both `js/notes-view.js` and `js/calendar.js`.
- Accessibility settings are incomplete and may appear ineffective.
- Old edit, popup and language CSS remains after corresponding UI removal.
- `.verify-modal.html` is a temporary artifact and is not production functionality.
- FAQ and documentation contain stale descriptions.

### Rule for repairs

Do not repair multiple numbered items in one task unless they are in the same file and the same user scenario.

---

## 11. CSS RULES

### 11.1 Do not clean CSS during runtime fixes

If a task fixes JavaScript behavior, do not remove unrelated CSS. Dead CSS cleanup must be a separate task after behavior is verified.

### 11.2 Current cascade

`app-shell.css` is last and may override earlier modules.

Before changing a style:

- search all CSS files for the selector;
- identify which rule currently wins;
- avoid adding another override unless necessary;
- prefer fixing the owning stylesheet.

### 11.3 All three skins

Any calendar-cell visual change must be checked with:

- `body.skin-full`
- `body.skin-strip`
- `body.skin-quiet`

### 11.4 Themes

Current theme preferences may be:

- `system`
- `light`
- `dark`

The effective dark theme uses:

    body.theme-dark

Test both effective light and dark appearance.

### 11.5 Mobile

Test at minimum:

- 320px
- 380px
- 480px
- 700px
- desktop

Do not allow the mobile bottom navigation to cover content. Touch targets should be at least 44x44 px where practical.

### 11.6 Print

Print must hide application controls and preserve printable schedule content. Do not modify print behavior during unrelated UI repairs.

---

## 12. SERVICE WORKER RULES

Any new production JS or CSS file must be registered in both:

- `index.html`
- `sw.js`

Do not update `sw.js` merely because existing file contents changed. Cache versioning is handled by `__BUILD_ID__`.

The fetch handler must ignore unsupported protocols. Preserve:

    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

Do not cache temporary verification files.

---

## 13. PATCH AND TASK SIZE POLICY

### 13.1 Default task size

Preferred:

- 1 production file;
- 1 user scenario;
- 1-3 exact operations;
- less than roughly 100 changed lines.

Acceptable with justification:

- 2 production files when one is an i18n or CSS companion;
- 3 i18n files for translation parity;
- `index.html` + `sw.js` + one new file when registering a new module.

Do not create tasks that modify 5 or more production files. Break bigger work into sub-tasks (see §21.4).

### 13.2 No cascade plans

Do not provide a chain of tasks where later tasks depend on unverified behavior from earlier tasks.

After each task:

- apply patch;
- inspect diff;
- hard reload;
- check Console;
- run the exact scenario;
- test one related regression scenario;
- commit or roll back;
- regenerate `code.json` before a new chat.

### 13.3 No opportunistic cleanup

Do not combine phrases such as:

- "while here"
- "also clean up"
- "remove old code"
- "refactor for consistency"
- "future-proof"

with a bug fix.

### 13.4 Stop conditions

Stop without modifying code when:

- the requested behavior is ambiguous;
- the active implementation cannot be identified;
- two modules appear to own the same behavior;
- the source contains unexplained corruption in the target block;
- a required translation key is missing but i18n files are outside scope;
- the fix requires a data migration not requested by the owner;
- more than two production files are unexpectedly required;
- the LOCATE block is not unique;
- the current workspace differs from the uploaded code.

Explain what evidence is needed.

---

## 14. REQUIRED TASK FORMAT FOR IMPLEMENTATION AGENTS

Every implementation task must begin with:

    READ AGENT.md COMPLETELY BEFORE MAKING ANY CHANGE.

Then include:

- GOAL
- CURRENT VERIFIED BEHAVIOR
- EXACT FAILURE
- FILES TO MODIFY
- FILES NOT TO MODIFY
- EXACT OPERATIONS
- PRESERVED BEHAVIOR
- MANUAL TEST
- STOP CONDITIONS

### Required example

    READ AGENT.md COMPLETELY BEFORE MAKING ANY CHANGE.

    # TASK: Fix Year view day navigation

    ## GOAL

    Fix only navigation from a mini-day in Year view.

    ## CURRENT VERIFIED BEHAVIOR

    Month view and context toolbar are already working and must remain unchanged.

    ## EXACT FAILURE

    Clicking a mini-day throws because `brig` is undefined.

    ## FILES TO MODIFY

    - `js/views.js`

    ## FILES NOT TO MODIFY

    - `index.html`
    - `js/app-shell.js`
    - `js/main.js`
    - all CSS
    - all i18n files
    - schedule data

    ## EXACT OPERATIONS

    1. Remove factory-paint behavior from the Year mini-day handler.
    2. Keep the current `selectedShift`.
    3. Set `currentMonth = m`.
    4. Set `selectedDay = d`.
    5. Set `yearMode = false`.
    6. Save `prefs.yearMode = false`.
    7. Open Month view.

    ## PRESERVED BEHAVIOR

    - Year rendering
    - current brigade
    - Privacy Mode
    - context toolbar
    - mobile navigation

    ## MANUAL TEST

    1. Open Calendar.
    2. Switch to Year.
    3. Click a day in March.
    4. Confirm March Month view opens with that day selected.
    5. Confirm brigade did not change.
    6. Check Console is empty.

    ## STOP CONDITIONS

    Stop if the current handler differs from the supplied source or if another module also handles mini-day navigation.

Vague tasks are prohibited.

---

## 15. RESPONSE FORMAT FOR THIS PROJECT

Code changes are applied via Cline (VS Code extension) which executes edits through its own tools.

### When writing task descriptions for Cline / DeepSeek Flash V4

- Use natural English prose for instructions.
- `LOCATE` / `REPLACE` / `ACTION` blocks ARE allowed and encouraged for byte-precise specifications (they serve as exact byte-range specs for the agent to find and modify).
- Reference file paths explicitly.
- List forbidden actions explicitly (agent must not improvise).
- Include verification steps (grep counts, syntax checks, manual tests).
- Include rollback plan (git commands FOR USER to run — agent must NOT execute git write commands).
- Use `STEP N:` structure for multi-file changes with individual VERIFY gates.

### When writing focused refactors for Sonnet 4.5

- Provide project as zip attachment in chat.
- Describe scope precisely.
- Sonnet returns full modified files or clear diffs.
- User applies manually via editor.

### What NOT to use

Do NOT use `### OP N:` with structured metadata like `FILE:` and `ACTION:` as top-level document structure — this was the parser format for the discontinued `apply-update.ps1` workflow. Use `STEP N:` or similar natural structure instead.

Cline reads task descriptions, uses its own `read_file` / `write_to_file` / `apply_diff` tools to make changes, and shows a diff for each edit before applying.

---

## 16. MANUAL REGRESSION GATES

### Every JavaScript repair

Check:

- no Console error on initial load;
- target scenario works;
- no new missing element warning;
- Privacy Mode ON and OFF if personal data is involved;
- current language does not show raw translation keys.

### Navigation repair

Check:

- Dashboard;
- Month;
- Year;
- Table Month;
- Table Year;
- Today;
- previous/next period;
- selected brigade;
- mobile bottom navigation.

### Selected-day repair

Check:

- working shift;
- free day;
- vacation day;
- OT before;
- OT after;
- weekend hours (on factory-free days);
- note add;
- note delete;
- Privacy Mode.

### Share repair

Check:

- Current View tab;
- Application tab;
- correct URL;
- copy;
- native share fallback;
- QR created only on Application tab;
- QR load error;
- sheet reopens correctly.

### Settings repair

Check:

- PL/EN/UK;
- light/dark/system;
- full/strip/quiet;
- settings persist after reload;
- no raw i18n keys.

### Drive repair

Check:

- logged out;
- logged in with valid token;
- expired token;
- upload;
- download;
- old payload without new fields;
- local unsynced counter;
- logout warning.

### Admin repair

Check:

- non-admin cannot open or call protected action;
- admin can open;
- brigade switching;
- month switching;
- year switching;
- R/P/N/W painting;
- explicit free-day draft;
- export;
- exit;
- auth loss.

### Notes View repair

Check:

- panel opens from side menu;
- search filter works;
- month/brigade filter works;
- advanced filters toggle (Advanced UI mode);
- inline edit — click text → input → Enter/blur saves;
- inline edit — Space key adds a space (not swallowed);
- delete with confirm;
- jump to day closes panel and opens Month view on correct date+brigade;
- Privacy Mode hides notes.

---

## 17. DOCUMENTATION POLICY

During stabilization, documentation changes are separate from runtime repairs.

Update documentation only after the repaired behavior has been manually verified.

Current documentation is known to be stale in several places. Do not trust README or PROJECT_DOCS over current code.

When updating later, synchronize:

- `README.md`
- `docs/PROJECT_DOCS.md`
- `CHANGELOG.md`
- FAQ translations
- this file if architecture or rules change

Do not rewrite historical changelog entries.

---

## 18. GIT AND WORKSPACE SAFETY

Do not run git write commands unless the owner explicitly requests it. Never run:

- `git add`
- `git commit`
- `git push`
- `git checkout` (except when user requests rollback)

Read-only git commands ARE allowed for verification (see §21.5):

- `git status --porcelain`
- `git diff --stat`
- `git diff -U0`

Do not edit generated `code.json`. Do not add temporary files to the repository.

The currently observed modified `code.json` is an export artifact and must not be treated as application source.

Before a new chat:

- finish or roll back the current patch;
- verify working tree intentionally;
- regenerate `code.json` via `.\tools\export-code.ps1` (or a smaller profile like `code`/`ui`/`docs` — see `.\tools\export-code.ps1 -h`);
- upload the new file.

---

## 19. DEFINITION OF DONE

A repair is done only when:

- the exact reported bug is fixed;
- no unrelated architecture was changed;
- all modified paths were declared;
- no inline handlers were introduced;
- no exceptions are silently swallowed;
- no missing i18n keys were introduced;
- no UTF-8 corruption was introduced;
- no personal data was committed or logged;
- target manual test passes;
- related regression test passes;
- Console has no new error;
- the user can review a small understandable diff.

A large diff is not evidence of quality.

During stabilization:

- small verified repair > broad cleanup
- working behavior > architectural elegance
- rollback > fix-forward chain
- evidence > assumption

---

## 20. END OF CURRENT RULES

Sections 0-20 supersede all older agent instructions and previous refactor prompts. Section 21 codifies practical lessons learned from Notes View and Weekend Hours sessions.

If a future task conflicts with this file, stop and ask the owner which rule should be overridden.

---

## 21. LESSONS LEARNED — LOCATE BLOCK ACCURACY AND SPEC WRITING

The following mistakes recurred across multiple sessions when writing task commands for Cline + DeepSeek Flash V4. Every new session must read and follow this section.

### 21.1 LOCATE blocks must be byte-verified against actual file content

DO NOT rely on visual scan of `code.json` or on memory. `code.json` displays content with `\r\n` escaped and long lines wrap visually, which makes it easy to hallucinate:

- Multi-line vs single-line conditions (e.g. `if (a && b && c)` on one line vs wrapped across 5 lines)
- Indentation depth (4 spaces vs 6 spaces vs 2 spaces)
- Presence of blank lines between logical blocks
- Exact wording of nearby comments

Before writing a LOCATE block:

1. Search the target file for a unique anchor string (e.g. a variable name or a specific comment) using grep-like reasoning.
2. Copy 3-5 lines of surrounding context verbatim.
3. If uncertain about indentation or line wrapping, ASK the owner to run `Get-Content <file> | Select-String "<anchor>" -Context 5,5` and paste the actual bytes.

Failure to do this results in STOP-and-report cycles that waste tokens.

### 21.2 grep expected counts should be conservative

DO NOT write exact expected counts unless certain. Prefer:

- `"at least N"` when unsure
- Count line-anchored matches (`grep -c "^  const foo"`) not substrings
- Remember that `grep -c "menuNotesView"` counts LINES containing the substring, so `menuNotesView` and `menuNotesViewDesc` on separate lines both count as 2, but on the same line it is 1

Cline treats VERIFY failures as STOP conditions. Wrong expected counts force it to halt and ask, even though the actual edit was correct.

### 21.3 Rule-6 (preserve comments) requires active checking

When writing a REPLACE block, explicitly verify that EVERY comment present in the LOCATE block is copied to REPLACE, even ones that seem unrelated to the change. Missing comments are a common quiet failure that Cline flags in the report but does not fix on its own (Zero Deviation).

### 21.4 Max 4 files per task

Break bigger work into sub-tasks. When a task touches 5+ files, Cline executes but flags the violation. Prefer explicit split:

- i18n keys → separate sub-task (warm-up)
- Backend API → separate sub-task
- UI in HTML/CSS → separate sub-task
- JS logic → separate sub-task

### 21.5 Read-only git commands ARE allowed for verification

Explicitly permit `git status --porcelain`, `git diff --stat`, `git diff -U0` in every task command. Cline needs them to verify "ZERO changes to any file outside FILES TO MODIFY". Without explicit permission, Cline flags a disclosure for running them.

Forbidden git commands remain (see §18): `git add`, `git commit`, `git push`, `git checkout` (except when user requests rollback).

### 21.6 Space/Enter accessibility handlers must guard `event.target`

When adding `keydown` handlers to elements with `role="button"` and `tabindex="0"` (for keyboard accessibility), the handler must check `event.target === el` before calling `preventDefault()`. Otherwise, when the span later contains a focused child input (inline edit pattern), Space keydown bubbles up and `preventDefault()` swallows the space character.

Bug is desktop-only (mobile virtual keyboards do not bubble keydown the same way), making it easy to miss during testing.

Correct pattern:

    el.addEventListener('keydown', (event) => {
      if (event.target !== el) return;  // ignore bubbles from child input
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        startEdit(el);
      }
    });

### 21.7 If a LOCATE fails, do NOT write a "spec fix" from memory

When Cline reports "LOCATE block not found byte-for-byte", the correct response is:

1. Ask Cline to paste the ACTUAL surrounding bytes.
2. Rewrite the LOCATE from that verbatim, not from memory or `code.json`.
3. Do NOT try to patch the failing spec with a partial fix — issue a complete corrected spec.

Attempting to guess the correction repeatedly is a common failure mode. One clean re-issue saves more tokens than three partial patches.

### 21.8 When writing tests, don't add tests for behavior not yet implemented

Cline enforces this via STOP conditions. If a test would require code changes to pass, the code changes must come first as a separate task. Test-driven development is not the workflow here — code first, tests after, per §17.

### 21.9 Cline is a strong safety net — trust it

DO NOT write specs assuming Cline will silently fix your mistakes. It will not. But DO write specs knowing Cline catches ambiguity, LOCATE mismatches, rule violations, and arithmetic errors. This means:

- Specs can be written with some uncertainty about edge cases
- If unsure, add extra CONTEXT NOTES rather than removing them
- Trust Cline to STOP when spec is genuinely wrong
- Do not "help" Cline by pre-emptively adding fallbacks

The correct division of labor:

- Task author (planner) is responsible for CORRECTNESS of specification
- Cline (executor) is responsible for LITERAL execution and REPORTING
- Owner is responsible for MANUAL VERIFICATION and COMMIT decision

### 21.10 PowerShell console UTF-8 quirk

Windows PowerShell default console codepage (CP1250 on Ukrainian/Polish locales) displays UTF-8 file content as mojibake even when the file itself is clean UTF-8. Symptoms include `Ĺ‚` instead of `ł`, `Ń–` instead of `і`.

Before diagnosing a "file is broken" report:

1. Ask the owner to run `chcp 65001` first, then re-read the file.
2. Alternatively, verify with `[System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes("path"))`.
3. Do NOT propose a re-encoding fix based on console output alone.

The file is almost certainly fine; the console is lying.
