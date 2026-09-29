# Changelog

Wszystkie istotne zmiany w projekcie Plan Zmian.

Format oparty na [Keep a Changelog](https://keepachangelog.com/pl/).

## [Unreleased]

### Added

- **Remote factory schedule — Phase 1 (read-only), branch `cloudflare`.** Spec: `docs/ADMIN_BACKEND_SPEC.md`.
  - `migrations/0001_init.sql` — D1 schema: `schedule_years` + `schedule_history` (`schedule_id` always `gillette`). Applied manually in Cloudflare; no `wrangler.toml` in the repo.
  - `functions/api/schedule.js` — public Cloudflare Pages Function (ES module) `GET /api/schedule`: `Cache-Control: no-cache` + `ETag` (max revision + year count), `If-None-Match` → `304`, empty DB → `200 {"scheduleId":"gillette","years":{}}`, missing `env.DB` or DB error → `503 {"error":"unavailable"}` with no details leaked or logged. `updatedBy` (admin e-mail) is never exposed.
  - `js/schedules/remote.js` — new classic script, loaded right after `js/schedules/gillette/2026.js` and before `js/core.js` (also before `js/personal/sync-tracking.js`). Applies `localStorage['planzmian_remote_schedule_v1']` **synchronously at load** (offline-safe first render), then `fetch('/api/schedule', { cache: 'no-store' })`; newer revisions are applied through the existing `registerYearData('gillette', …)` so `factorySchedule` / `factoryMonthHours` are updated **in place** (references never re-assigned). Client-side validation mirrors the server rules (months 1–12, brigades A/B/C/D, array length = days in month, values only `'' | 'R' | 'P' | 'N'` — `'W'` rejected); an invalid year is skipped and the rest applied. After applying: `refreshViews()` + toast `toastScheduleUpdatedRemote` (pl/en/uk), suppressed for the first application after a cold start. Re-check on `visibilitychange` (max once per 60 s) and on `online`. Any network/parse error is ignored silently (`console.warn` without schedule data).
  - New localStorage key `planzmian_remote_schedule_v1` (only new key; `gillette_*` / `grafik_*` untouched).
  - `sw.js`: `./js/schedules/remote.js` added to `ASSETS`; requests whose `pathname` starts with `/api/` are no longer served cache-first and `/api/admin/*` is never cached. `CACHE_NAME` and `activate` logic unchanged.
  - `tools/seed-schedule.mjs` → `migrations/seed_2026.sql` (Phase 1.5 seed): loads `js/schedules/gillette/2026.js` via `node:vm` with `registerSchedule` / `registerYearData` stubs, writes one `INSERT INTO schedule_years` with `revision = 1`, `updated_by = 'seed'`. **Hours are copied verbatim, never recomputed** (October / brigade A = 160 on purpose).
  - Tests: `tests/remote-schedule.test.js` (alias reference preserved + year content updated, invalid year skipped, empty/malformed payload safe, `'W'` rejected, array length vs days in month incl. Feb 2028, unknown symbol, missing brigade, month 13) and `tests/seed-schedule.test.js` (seed SQL deep-equal to what `2026.js` registers, incl. `hours[10].A === 160`).
  - `js/schedules/gillette/2026.js` remains the static fallback: with an empty DB or an unreachable API the app behaves exactly as before. Phase 2 (PUT / auth / Publish) and Phase 3 (history / rollback) are **not** part of this change.

### Changed

- **Rebrand: Grafik Gillette -> Plan Zmian.** User-visible name, page titles, manifest (`name` / `short_name`), i18n (`appName`, `appNameShort`, `shareApp`, FAQ title), notifications, ICS `PRODID`, privacy policy, file headers and docs updated. Production URL is now https://planzmian.pages.dev/. Service Worker cache renamed to `plan-zmian-<BUILD_ID>` (old cache is removed on activate). **Intentionally unchanged (data compatibility):** all `localStorage` keys (`gillette_*`, `grafik_*`), Google Drive file names (`grafik-gillette-data*.json`), schedule id `gillette` and `js/schedules/gillette/`, ICS event `UID` suffix `@gillette`.
- **Overtime display + input: hours + minutes.** Storage stays decimal (`hours: 4.8` = 4h 48m) for compatibility. UI shows `4h 48m` / `4год 48хв` / `4godz 48min`. **Input is two fields (hours + minutes)**, not a decimal — enter `4` and `41` for 4h 41m. Quick buttons 1h–5h unchanged. Helpers: `formatDurationHours*`, `decimalHoursToParts`, `partsToDecimalHours`, `formatClockTime`. `categorizeOvertime` counts by the minute. i18n: `durationHoursUnit` / `durationMinutesUnit` (uk/pl/en).
- **Relief flow timeline OT nodes** (`js/smart-popup.js`): round hours to **1 decimal** (e.g. 4h 41m → `4.7h`) instead of raw float `4.683333…h`.
- **Side menu Google login restored** — `#menuDriveLogin` in the Drive card when backup is ON and the user is not signed in (header button still works).
- **Duration contract module** — `js/duration.js` is the single source for OT duration format/parse/limits. Loaded before schedules/UI.
- **Dev tooling** — `package.json` + ESLint 9 + zero-dep smoke (`node tools/smoke-check.js`). CI: smoke → unit tests; ESLint optional. `npm run check` needs no npm install.
- **Overtime data model** — `overtimes[key]` now has 3 slots (`przed`, `po`, `weekend`) instead of 2. Existing records without `weekend` field still work (backward compatible). Sync payload includes weekend automatically (structural serialization).
- **Google Drive UX — single entry point via ⚙ Sync options panel.** All Drive controls (mode selector, diff table, Upload/Download) consolidated into one full-screen panel opened from the Drive card in the side menu. Scattered switches removed from Settings → Data & privacy.
- **Warning row in Drive card is now clickable** — tap opens the Sync options panel with the diff. Replaces the previous separate "Details →" button.
- **Manual sync mode surfaced.** The Auto/Manual toggle (previously hidden inside Settings) is now the first section of the Sync options panel. Manual mode is recommended for users who don't want periodic Google login prompts.
- Sync mode toggle no longer triggers Drive activity — flipping the switch just writes the preference (avoids accidental Google popups on misclick).

### Added

- **Weekend hours slot for overtime** — new overtime position `weekend` alongside existing `przed`/`po`. Records N hours (0.5-24) on any factory-free day for the user's brigade: holidays (+200%), Sundays (+100%), Saturdays and weekday days-off (+100%). UI: new "Or work without full shift" section appears in the Add Extra Shift modal whenever the day has no shift by factory. Save/Delete + optional note (tagged `weekend` in unified notes list). Mutually exclusive with picking R/P/N — choosing one clears the other. Weekend hours visible via `⏱` cell marker (color reflects rate), in the monthly overtime summary, and as a dedicated info-card in the day panel. Variant C safeguard in `getMonthOvertimeSummary` prevents double-count if both shift and weekend hours ever coexist. 7 new unit tests in `tests/overtime-logic.test.js`.
- New `openDriveSyncOptionsPanel()` in `js/sync.js` — full-screen `app-panel` with:
  - Mode selector (Auto / Manual only) as radio-styled rows
  - Local-vs-remote diff table (fetched async, shows 📱 +N / ☁ +N indicators)
  - Upload / Download action buttons
- New `#menuDriveSyncOptions` primary button in the side menu Drive card.
- New i18n keys `driveSyncOptions*`, `driveSyncMode*`, `driveSyncColumn*`, `driveSyncUnsyncedShort` in pl/en/uk.

### Removed

- `onMenuSyncStatusClick()` function and its `window.*` export.
- `#menuSyncStatus` HTML block (connection status + badge row) — login state is now communicated by the visible account email instead.
- Nested `#menuDriveWarnMore` "Details →" button inside the warning row.
- `#stDriveEnabled` and `#stDriveAutoSync` switches from Settings → Data & privacy panel (moved to Sync options panel).
- Orphan `const driveStateLabel` in `js/settings.js`.
- Dead CSS: `.drive-status-row`, `.ds-badge`, `.ds-badge-dot`, `.ds-text`, `.drive-warn .dw-more`, and one leftover `.drive-card.is-drive-off .drive-status-row` compound-selector reference.

### Notes

- `syncWithDrive()` kept as a function name for backward compatibility with existing callers — now just opens the new panel.
- i18n keys `settingsPrivacyDriveState`, `driveCardConnected`, `driveNotLoggedIn`, `driveCardDetails` remain in the dictionaries — used only in fallback contexts; no cleanup needed.

## [4.0.0] - 2026-09-14 — Post v4 shell stabilization

Consolidates months of accumulated improvements around the v4.0 UI shell refactor: full-screen panel infrastructure, unified per-day notes, Google Drive session/token hardening, admin factory-drafts, Simple/Advanced UI mode, and hundreds of smaller UX fixes.

### Added

- **Full-screen app-panel infrastructure** (`js/app-shell.js`): reusable panel + action sheet system used by Settings, FAQ, About, Admin Center, Share, Export. Replaces ad-hoc modals.
- **Simple/Advanced UI mode** — two-tier interface. Simple: calendar, brigades, vacations, basic settings. Advanced: overtime, notes, notifications, privacy, custom colors. Auto-detection for migrating users; one-time explanatory toast; toggle in Settings → Interface mode. `.advanced-only` CSS class + `body.ui-mode-*` for conditional rendering.
- **Unified per-day notes** (`js/personal/notes-tracking.js`) — the three previously separate note stores (free-form day note, overtime "przed" note, overtime "po" note) are now a single `notes[key]` list. Multiple notes per day, inline editing (Enter/blur to save, Esc to cancel), separate ✕ button for deliberate deletion. One-shot migration `migrateUnifiedNotes()` from legacy formats.
- **Google Drive backup opt-in** (`prefs.driveEnabled`, default off). When off, no GIS load, no silent token refresh, no login prompts. Users with an existing session keep it enabled after upgrade.
- **Manual-only Drive sync option** (`prefs.driveAutoSync`, default off). When off, Drive is used only after explicit Upload/Download/sign-in.
- **Google Drive session hardening**: silent token refresh via `prompt:''`, proactive refresh ~5 min before expiry, `revision` field in sync payload (monotonic counter, clock-skew safe), stable fingerprint reconciliation, distinct stale/unverified state.
- **Sync change count badge** shows real diff between local and Drive (computed after opening sync modal, cached in `lastKnownDiffCount`), replaces the old save-operation counter.
- **Ongoing night shift after midnight** — Dashboard card and handoff flow keep the previous-day N shift active until it actually ends. Post-shift `po` overtime extends the timer past 06:00. Settings → General option to show an ongoing N shift under its start date (default) or the current calendar date.
- **Admin factory editor** (`js/admin-center.js`) — R/P/N/W painting for factory schedule drafts, stored locally in `gillette_factory_drafts_v1`. Not visible to normal users. Publish flow: Admin Center → Export → git deploy.
- **Note editing in place** — click/tap note text to inline-edit. Enter or blur to save, Escape to cancel. Empty submit is a no-op (deletion is a separate ✕ action).
- **Privacy Policy page** (`privacy.html`) in Ukrainian, English, Polish. Linked from Settings → Data & privacy.
- **Drive card switch** at the top of the Google Drive block in the side menu (on/off). Shared `setDriveFeatureEnabled()` keeps menu switch and Settings toggle in sync (until the Drive UX refactor made the Settings switch redundant).
- **Google account display** — logged-in account (avatar letter + email + 👑 admin badge) shown in the side-menu Drive section.
- **Detailed last-sync time** in sync modal and logout warning (absolute date-time + relative time via localized `formatLastSyncDateTime()`).
- **Sync modal** — short change log comparing local vs Drive counts (vacations, overtime, notes, custom shifts, vacation limits) with last-sync timestamp.
- **Cell colored outline skin** (`skin-quiet`) — neutral cells with colored borders around the cell and around the date; joins the existing full/strip skins.
- **App sharing** — link + QR code + native Web Share API in the side menu. Fallback to clipboard on desktop without Web Share.
- **Auto-update Service Worker** — background detection of new SW, toast with refresh button, `SKIP_WAITING` message handling.
- **Contextual sharing** — the "Share view" link contains URL parameters matching the current view (`view`, `y`, `m`, `d`, `brig`, `rok`); the recipient opens the exact same view.
- **Overtime for holidays / Sundays / days-off** — new "weekend" overtime type with `+100%` / `+200%` categorization based on day type. Auto-detected in "Add extra shift" modal.
- **Multi-language support** (i18n): Polish (default), English, Ukrainian. Language switcher in Settings → General. Browser language auto-detection on first launch. Modular structure: `js/i18n/pl.js`, `en.js`, `uk.js`, `i18n.js`.
- **Undo/Redo buttons** in edit banner (`Ctrl+Z` / `Ctrl+Y`).
- **Import JSON validation** (`validateImportedData()`) — type-checks arrays, date formats, brigade schedules.
- **CI/CD**: GitHub Actions auto-versioning Service Worker cache on every push via `__BUILD_ID__` placeholder replaced with commit hash.
- **README in three languages** (`README.md` PL, `README.en.md`, `README.uk.md`) with language switcher row.
- **Unit tests** (166 tests total, `node tests/run.js`): sync-tracking (fingerprint stability, revision comparison), overtime-logic (holidays, night boundaries, edge cases), schedules-core (Easter dates, leap centuries, isWolne), notes-tracking (add/remove/update/upsert, migration).

### Changed

- **Modular data architecture** — `js/data.js` split into `js/schedules/_core.js`, `_registry.js`, `gillette/metadata.js`, `gillette/YYYY.js`. Each year in a separate file. Backward-compatible aliases (`factorySchedule`, `factoryMonthHours`) preserved.
- **CSS split** into 11 modules by concern: `variables.css`, `layout.css`, `components.css`, `calendar.css`, `overtime.css`, `views.css`, `dashboard.css`, `responsive.css`, `print.css`, `smart-popup.css`, `app-shell.css`. Load order significant (`app-shell.css` last).
- **Local-first personal data** — visible without Google login. Account is for backup/sync only. Privacy Mode is independent of Google login (toggle in side menu / Settings → Data & privacy).
- **Sync payload v4** with compact `shiftOverrides` (personal shift changes stored as key-value map instead of full schedule mirror) — smaller payload, cleaner diffs. Migration from v3 payloads handled by `getPersonalShiftOverrides()`.
- **Handoff flow visualization** — `prevBrig → day+shift → [OT] → nextBrig` timeline in the info-panel. Day shown as a self-node (not brigade letter). Overtime inserted before/after the day node when present. Available on Dashboard and Month view.
- **Info panel** — removed duplicated status card and "current shift" card; card info already visible on the cell and in the legend. Vacation shows only used/remaining at end. Overtime cards moved into the handoff flow.
- **Calendar cell styles** — three variants: full fill, colored strip on the left, colored outline. Border color and date-ring color both reflect the shift in the outline variant.
- **Cycle "until day off"** now uses the same shift source as the visible cells (`getShiftAtWithPending`) — no more mismatches between highlighted cycle and rendered shifts.
- **Timer for the current shift** — shows 🌙 icon and dedicated label when counting down the end of an ongoing yesterday-night shift.
- **Empty state** during factory-year edit — allows admins to paint a brand-new year manually (Add shift modal now supports the "Clear (free)" button as a 4th option).
- **Menu shell cleanup** — Settings owned by `js/settings.js`, Admin Center by `js/admin-center.js`, `js/app-shell.js` no longer opens placeholder panels.
- **Context toolbar** — brigade label uses same "Brigade" wording on all views; month/year segmented toggle sits with brigade controls; "Today" stays next to period arrows.
- **Top bar** — removed view-name kicker above the app title.
- **Admin guide / export copy** — clearer publish vs draft vs deploy (YYYY.js → `gillette/` → git push).
- **FAQ** rewritten for current UX (Settings → language, UI skins, table Standard/Capsule, no separate edit-mode button).
- **Style renamed** — cell `quiet` displayed as "Colored outline" instead of "Dots" in UI and translations.
- **Table density option** (Standard/Capsule) in Settings → Appearance.
- **Genitive month names** for date strings (uk: «18 липня», pl: «18 lipca») — proper Polish/Ukrainian grammar.

### Fixed

- **Silent token expiry killed auto-sync** — access token (~1h) had no refresh path. `ensureDriveToken(false)` / `trySilentDriveRefresh()` now attempt real `prompt:''` silent refresh.
- **Misleading "all synced"** when the check never ran — distinct stale state (`gDriveCheckStale`) surfaced with its own warning text.
- **False-positive sync conflicts** — `handleAutoSyncCheck()` now double-checks against the actual remote payload (fingerprint reconcile + revision counter) before warning the user.
- **Sync count badge undercounted notes** — `countSyncPayloadStats()` used to count day-keys with notes instead of individual note entries. Fixed by shared `countNoteEntries()`.
- **Google login screen appeared far too often** — root cause was widened `openid email` scope invalidating existing consent. Scope split into narrow `DRIVE_SCOPE` (default) + `IDENTITY_SCOPE` appended only until email is cached.
- **User actions opened a login window instead of refreshing** — `ensureDriveToken(true)` now attempts silent refresh first.
- **A single 401 dropped the session** — `driveFetch()` now tries one silent refresh and replays the request before flagging state as stale.
- **Session marker was too easy to lose** — `hadDriveSession()` also checks a 1-year cookie, granted scope, Drive file id; `markDriveSession()` requests `navigator.storage.persist()` so iOS Safari's ~7-day storage eviction no longer forces a full interactive login.
- **PWA install failed silently on any bad URL** — `cache.addAll()` is all-or-nothing. App shell now cached strictly; everything else best-effort via `Promise.allSettled` + `cache.add`.
- **`js/personal/notes-tracking.js` missing from SW precache** — added to `ASSETS` (27/27 files match `index.html`).
- **`node tests/run.js` failed on Node 18/20** — the runner now expands `tests/*.test.js` itself with `fs.readdirSync` instead of relying on Node 21+ glob support.
- **`tools/i18n-audit.js` reported a non-existent missing key `label`** — literal-usage regex now requires strings to be closed by `,` or `)`.
- **Duplicate overtime icon on Dashboard "today" card** — icon was in both template and `infoOvertime` translation.
- **Duplicate shift info in day panel** — "Zmiana 🌅 R (06:00-14:00)" card duplicated info already on cell + legend.
- **Duplicate note button** — Day-action-grid "Note" button just focused a field visible directly below it.
- **Kolizja lokalnej zmiennej `t` z globalną funkcją `t()`** in overtime popup handlers and "Today" button — caused `TypeError`.
- **Timer nocnej zmiany po północy** — `getLiveTimer()` did not show remaining N time after 00:00 when today's scheduled shift differed from yesterday's.
- **Safe DOM binding in `main.js`** — 12 places switched from `document.getElementById(...).onclick = ...` to `bindClick()` / `bindEvent()` helpers with null-check.
- **Service Worker errors for `chrome-extension://` requests** — added protocol filter in `sw.js`.
- **Dashboard privacy leak** — `renderDashboard()` did not check `shouldShowPersonalData()`. Vacations, overtime, notes, live-timer, statistics were visible without login.
- **Calendar cycle range / compareShift** with `hidePrivate` was still computed from personal schedule. Added `getFactoryCycleRange()` and factory path for compare.
- **prefs / lastModified** — `savePrefs()` did not mark unsynced. Changing `urlopLimits` (personal data on Drive) could miss the pre-logout warning. `savePrefs(p, markSync?)` + `setVacationLimit()` calls with `markSync=true`.
- **Admin permissions consistency** — palette buttons (R/P/N/W) now also check `isCurrentUserAdmin()`, same as keyboard shortcuts.
- **Missing i18n keys**: `infoWorking`, `adminAuthLost`, `en.login` — detected via new `tools/i18n-audit.js`.
- **Note double-save bug** — save on change + blur produced two writes. Fixed via `saveInProgress` flag + 100ms cooldown + Enter key handler.
- **Empty state blocked editing an empty year** — `refreshViews` condition now includes `!editMode`.
- **Placeholder `{year}` not substituted** in `renderEmptyState` — changed from string concat to `t('key', { year: currentYear })`.
- **AddShift modal blocked re-editing added shifts** — check for `dayIsCustomEdited` allows modal to open again.
- **Mobile UX bug** — accidental taps on vacation / overtime popups after tap-selecting a day (e.g. via "Today" button). Popups now inactive for 400ms after selection.
- **Cell relief popups** were removed — functionality moved to info-panel timeline.
- **Cell overtime detail popups** were removed — details in info-panel / timeline; ⏱ marker kept.
- **Dashboard "This week" stats block** was dead code — removed.

### Removed

- Legacy `js/data.js` (monolithic 2000+ line file) — replaced by modular `js/schedules/` architecture. Zero data loss (values preserved 1:1).
- Standalone Privacy Mode toggle in side menu (v3.7.0 era) — replaced by automatic login-based logic later refined into local-first with independent privacy toggle.
- Week view tab and all related UI/logic (`renderWeekView`, week navigation, week detail panel).
- Status card in month info-panel — redundant with cell + legend.
- Dashboard "Tomorrow" and "Until-day-off" cards — replaced by handoff flow + until-free cycle.
- Personal JSON import/export (backup path is now Drive only).
- Vacation limit from side menu — moved to edit banner (🌴).
- Advanced menu section — its items relocated.
- Dead file `tools/apply_calendar_privacy.js` (one-time migration script).
- Experimental KWGT export integration.
- `js/data.js` after modular split.
- 6 unused themes (Ocean, Las, Zachód, Neon, Pastel, Kontrast) — reduced to 2 (light/dark) initially, later expanded to system/light/dark preference + separate UI skins (Industrial / Paper / Neon).
- Search feature — calendar visualisation already shows everything; search added noise.
- Blocker for overtime on days off ("Overtime only on a day with a shift" toast) — replaced by proper weekend/holiday overtime UI.
- Dead refactor leftovers: temporary `tempNote` menu panels, `.menu-temp-note` styles, obsolete HTML comments for removed `#editModeToggle` / `#adminFaqBtn`, unused `contextHighlightBrigade` i18n keys, local `.update-backups/` snapshots.

## [3.7.0] - 2026-08-17

### Zmienione (BREAKING CHANGE ARCHITEKTURY)

- **🏗️ Modularna architektura danych** — `js/data.js` rozbite na wiele plików:
  - `js/schedules/_core.js` — stałe i helpers (`monthNames`, `shiftHours`, `buildHolidays`, etc.)
  - `js/schedules/_registry.js` — registry pattern + `shouldShowPersonalData()` helper
  - `js/schedules/gillette/metadata.js` — metadane Gillette schedule (nazwa, brygady, typy zmian)
  - `js/schedules/gillette/2026.js` — dane roku 2026 (używa `registerYearData()`)
  - Struktura gotowa na przyszłe schedules (office, production, etc.)
  - Każdy rok w osobnym pliku — dodanie 2027 = jeden nowy plik + jeden `<script>` tag
- **`index.html`** — zaktualizowane script tags (4 nowe zamiast starego `js/data.js`)
- **Backward-compatible** — `factorySchedule` i `factoryMonthHours` nadal dostępne globalnie (aliased)

### Usunięte

- **🗑️ `js/data.js`** — stary monolityczny plik (2000+ linii) usunięty
- **🔒 Privacy Mode** — usunięta stara funkcja z osobnym przełącznikiem, zastąpiona automatyczną logiką login-based

### Zmienione

- **Admin Export** — generuje pliki w nowym formacie `YYYY.js` z `registerYearData()` — standalone valid JS
- **PROJECT_DOCS.md** — nowa sekcja "10. Dodawanie nowego roku" z krok-po-kroku
- **Admin FAQ** — zaktualizowane sekcje 2 i 4 dla nowej architektury

## [3.6.2] - 2026-08-15

### Dodane

- **👑 Admin identification** — moduł `js/admin.js` z listą `ADMIN_EMAILS`; sekcja "👑 Admin Panel" w bocznym menu; automatyczna aktywacja po zalogowaniu do Google Drive
- **Nowy scope `openid email`** w Google Drive OAuth — pobranie emaila zalogowanego użytkownika (funkcja `fetchDriveUserEmail()` w `js/sync.js`)
- **🆓 Przycisk "Wolne"** w modalu dodawania zmiany (`openAddShiftModal`) — 4-ty przycisk obok R/P/N, pozwala szybko wyczyścić błędnie dodaną zmianę

### Zmienione

- **Uproszczony edit-banner** — usunięto 5 przycisków, przeniesiono do bocznego menu; banner pokazuje tylko: Undo/Redo (icon-only) + Save (green primary) + Done (grey)
- **Refactor pl.js** — reorganizacja ~330 kluczy w 28 sekcji z komentarzami

### Naprawione

- Empty state blokował edycję pustego roku (warunek teraz uwzględnia `!editMode`)
- Placeholder `{year}` nie był podmieniany w `renderEmptyState`
- Modal AddShift blokował ponowne edytowanie dodanych zmian

## [3.6.0] - 2026-08-14

### Dodane

- **📱 Udostępnianie aplikacji** — QR + link + Web Share API w bocznym menu
- **🔄 Auto-update Service Workera** — toast "Nowa wersja dostępna" z przyciskiem odświeżenia
- **🤖 GitHub Actions CI/CD** — auto-versioning cache SW przy każdym pushu

### Zmienione

- `sw.js` — dynamiczny `CACHE_NAME` z hash commita
- Dashboard — nadgodziny za dodane zmiany w święta/niedziele liczone także w widoku tygodnia
- Info panel — połączone karty "Kto przekazał" i "Kto przejmie" w jedną kompaktową kartę

## [3.5.1] - 2026-08-13

### Naprawione

- **Krytyczny bug UX na mobile** — przypadkowe tapy na popupy urlopu i nadgodzin po wybraniu dnia
- **Refactor UI dla urlopów i nadgodzin** — popupy z komórek kalendarza przeniesione do info-panel poniżej
- **Uproszczona paleta edycji** — 5 przycisków (R, P, N, W, CYCLE)

## [3.5.0] - 2026-08-13

### Naprawione

- Kolizja lokalnej zmiennej `t` z globalną funkcją i18n `t()` w handlerach popupów nadgodzin
- Timer nocnej zmiany po północy — `getLiveTimer()` nie pokazywał pozostałego czasu zmiany N po 00:00
- Bezpieczne bindowanie eventów DOM w `main.js` — 12 miejsc z `bindClick()` i `bindEvent()`

### Dodane

- 🌙 Wskaźnik nocnej zmiany trwającej po północy (nowy klucz i18n `timerNightEndsIn`)
- Ochrona przed przypadkowym tap-em na popup na mobile (400ms okno)
- Konfiguracja Prettier

## [3.4.0] - 2026-08-12

### Dodane

- **Wielojęzyczność (i18n)** — obsługa 3 języków: polski, angielski, ukraiński
- Przełącznik języka 🌐 w górnym pasku
- **Nadgodziny w dniach wolnych i świętach** — nowy typ `weekend` z auto-kategoryzacją +200% (święto) / +100% (niedziela/wolne)
- Genitive month names dla poprawnego formatowania dat

### Zmienione

- Podzielono `js/i18n.js` na 4 pliki (pl/en/uk + logika)
- Cache Service Worker → v5

### Usunięte

- Funkcja wyszukiwania (search)
- Blokada dodawania nadgodzin w dni wolne

## [3.3.0] - 2026-08-12

### Dodane

- Przyciski Undo/Redo w edit banner + skrót `Ctrl+Y`
- Stos `redoStack`
- Walidacja struktury importowanego JSON
- Plik `js/overtime-logic.js` — wydzielona logika nadgodzin
- FAQ generowane dynamicznie z JavaScript

### Zmienione

- CSS wydzielone do `css/styles.css` (wcześniej inline)

## [3.2.0] - 2026-08-10

### Dodane

- Kontekstowy przycisk "Udostępnij widok" z URL params
- Przełącznik motywu (🌙/☀️) w top-bar
- Przycisk "Drukuj" w bocznym menu
- Helper `bindClick()` w `actions.js`

### Zmienione

- Uproszczono liczbę motywów z 8 do 2 (jasny/ciemny)
- Klik na dzień w widokach "Miesiąc + Rok" i "Tabela + Rok" prowadzi do szczegółowego widoku miesiąca

### Usunięte

- Funkcja "Podsumowanie tygodnia" (widget boczny)
- Blok duplikujących się przycisków pod kalendarzem
- 6 nieużywanych motywów

### Naprawione

- `ReferenceError: goToMonth is not defined`
- `Cannot set properties of null (setting 'onclick')`

## [Wcześniejsze wersje]

Historia wcześniejszych wersji nie była śledzona.

[Unreleased]: https://github.com/servitantgit/Graffik/compare/v4.0.0...HEAD
[4.0.0]: https://github.com/servitantgit/Graffik/releases/tag/v4.0.0
[3.7.0]: https://github.com/servitantgit/Graffik/releases/tag/v3.7.0
[3.6.2]: https://github.com/servitantgit/Graffik/releases/tag/v3.6.2
[3.6.0]: https://github.com/servitantgit/Graffik/releases/tag/v3.6.0
[3.5.1]: https://github.com/servitantgit/Graffik/releases/tag/v3.5.1
[3.5.0]: https://github.com/servitantgit/Graffik/releases/tag/v3.5.0
[3.4.0]: https://github.com/servitantgit/Graffik/releases/tag/v3.4.0
[3.3.0]: https://github.com/servitantgit/Graffik/releases/tag/v3.3.0
[3.2.0]: https://github.com/servitantgit/Graffik/releases/tag/v3.2.0
