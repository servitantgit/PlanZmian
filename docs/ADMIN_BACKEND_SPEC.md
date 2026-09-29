# ADMIN_BACKEND_SPEC — публікація фабричного графіка з застосунку (Plan Zmian)

**Статус реалізації (2026-09-29):**

| Фаза | Зміст | Статус |
|------|--------|--------|
| 1 | `GET /api/schedule`, `remote.js`, D1 schema, SW bypass `/api/` | ✅ live |
| 1.5 | Seed 2026 (`migrations/seed_2026.sql`) | ✅ live |
| 2 | Auth + `PUT /api/admin/schedule/:year` + Publish у UI (editor bar + Admin Center) | ✅ live |
| 3 | History list + Rollback UI/API | ❌ not started (`schedule_history` already filled on Publish) |

Спека нижче лишається джерелом правил (auth, validation, revision). Де реалізація
розходиться з ранніми формулюваннями «код НЕ написано» — керуйся таблицею статусу
і фактичним кодом у `functions/` + `js/schedules/remote.js` + `js/admin-center.js`.

---

## 0. Мета

Адмін редагує фабричний графік в Admin Center → натискає **Publish** (кнопка 📤 у
панелі режиму малювання або в Admin Center) → зміни одразу бачать усі користувачі.
Без обов’язкового експорту `YYYY.js`, без git commit/push для звичайної публікації.

Не-цілі:
- Не чіпати особисті дані користувачів (urlop, OT, notes, personal overrides) і їхню Drive-синхронізацію.
- Не переносити логін на інший провайдер.
- Не видаляти існуючий експорт `YYYY.js` (резервний шлях).
- Не редагувати статичний `js/schedules/gillette/2026.js` як основне джерело правди (лише fallback).

---

## 1. Архітектура (рішення)

**Cloudflare Pages Functions + D1 (SQLite)**, у тому ж проєкті Pages, де вже живе `planzmian.pages.dev`.

Чому це, а не інше:
| Варіант | Вердикт |
|---|---|
| Pages Functions + D1 | ✅ Той самий хостинг, same-origin (без CORS), безкоштовний рівень з великим запасом, є SQL для історії/відкату |
| KV | ❌ Eventual consistency (адмін збережув, а користувачі бачать старе до хвилини), немає історії |
| Firebase/Supabase | ❌ Ще один вендор і друга система авторизації поверх Google OAuth, що вже працює |
| Коміт у GitHub з браузера | ❌ Потрібен PAT у браузері (небезпечно) + затримка редеплою |

Читання графіка **публічне** (як зараз), запис — тільки адмін із серверною перевіркою.

Статичний `2026.js` **лишається** як fallback (офлайн, перший запуск, БД порожня). Пріоритет: дані з сервера > статичний файл, **на рівні цілого року**.

Seed не потрібен: поки в БД немає року — діє статичний. Перша публікація року створює рядок.

---

## 2. Факти з коду (перевірено читанням)

1. `factorySchedule` і `factoryMonthHours` — `const`-об'єкти, які читаються синхронно в ~40 місцях (calendar/core/dashboard/views/sync-tracking). Їх треба **оновлювати на місці** (не перепризначати). Робити це через існуючу `registerYearData('gillette', year, data, hours)` — вона вже оновлює `scheduleRegistry`, `AVAILABLE_YEARS` і ці два alias-об'єкти.
2. Адмін зараз визначається **тільки на клієнті** (`js/admin.js`: `ADMIN_EMAILS`, `driveUserEmail`). Це UI-фільтр, не безпека. Реальний захист зараз = право на git push. Після цієї задачі реальний захист = серверна перевірка (розд. 5).
3. Токен, який має клієнт, — це Google **access token** (GIS `initTokenClient`), не ID token. Scope: `drive.file drive.appdata`, а `openid email` додається лише поки email не закешовано (`needIdentityScope()` у `sync.js`).
4. `DEFAULT_CLIENT_ID` захардкоджений у `js/sync.js`; користувач може перевизначити його через `localStorage['grafik_drive_client_id']`.
5. Значення в `2026.js`: тільки `''`, `R`, `P`, `N`. `metadata.shiftTypes = ['R','P','N']`. Paint-інструмент має ще `W` — **перевірити в коді, що саме він записує в дані** (див. 6.3).
6. **Години НЕ завжди дорівнюють R+P+N×8.** У `2026.js` жовтень, бригада A: збережено 160, за формулою 168. Значить сервер **не має** мовчки перераховувати години. Клієнт надсилає `hours` явно; сервер лише валідує.
7. `sw.js` зараз: cache-first + фонове оновлення для **всіх** GET. Для `/api/schedule` це дало б «спочатку старий графік» — потрібен виняток (розд. 8).
8. Централізованої функції перемальовування немає. Є шаблон у `js/sync.js` (~рядки 360–370): `try { renderDashboard(); } catch(_){}` та `renderCalendar()`; у `main.js` є `currentView`.
9. `sync-tracking.js` порівнює стан через `buildComparableSyncState`, де `factoryDrafts` і personal overrides рахуються **відносно поточного `factorySchedule`**. Зміна фабричного графіка з сервера змінює цей еталон.

Не перевірено (агент має перевірити першим, розд. 10, крок 0):
- чи токен, отриманий після кешування email (вузький scope), взагалі містить `email` у відповіді `tokeninfo`;
- чи Cloudflare Pages проєкт зібраний з GitHub-репо (Git integration) чи через direct upload — від цього залежить, де живе `functions/`;
- що робить `W` у paint mode.

---

## 3. Жорсткі правила (порушення = задачу не прийнято)

1. Не перейменовувати `localStorage`-ключі `gillette_*` / `grafik_*`, файли Drive, id розкладу `gillette`, каталог `js/schedules/gillette/`.
2. Нові `localStorage`-ключі — тільки з префіксом `planzmian_`.
3. Не змінювати `js/schedules/gillette/2026.js`.
4. i18n: кожен новий рядок — у `pl.js`, `en.js`, `uk.js` одночасно; `node tools/i18n-audit.js` без parity/missing.
5. Клієнтський код — класичні скрипти без ES-модулів (як у `AGENT.md`). Серверний код у `functions/` — ES-модулі (це вимога Cloudflare), файли тільки в `functions/`.
6. Синхронізувати `docs/PROJECT_DOCS.md`, `docs/AGENT.md`, `CHANGELOG.md`.
7. `npm run check` (smoke + unit) має проходити після кожної фази.
8. Ніколи не логувати токени.

---

## 4. Модель даних (D1)

`migrations/0001_init.sql`:

```sql
CREATE TABLE schedule_years (
  schedule_id TEXT NOT NULL,
  year        INTEGER NOT NULL,
  data_json   TEXT NOT NULL,   -- { "1": {"A":[...],"B":[...],"C":[...],"D":[...]}, ... "12": {...} }
  hours_json  TEXT NOT NULL,   -- { "1": {"A":168,...}, ... }
  revision    INTEGER NOT NULL,
  updated_at  TEXT NOT NULL,   -- ISO UTC
  updated_by  TEXT NOT NULL,   -- email адміна
  PRIMARY KEY (schedule_id, year)
);

CREATE TABLE schedule_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id TEXT NOT NULL,
  year        INTEGER NOT NULL,
  revision    INTEGER NOT NULL,
  data_json   TEXT NOT NULL,
  hours_json  TEXT NOT NULL,
  saved_at    TEXT NOT NULL,
  saved_by    TEXT NOT NULL
);
CREATE INDEX idx_history_year ON schedule_history (schedule_id, year, revision DESC);
```

`schedule_id` поки завжди `'gillette'`.

Правило запису: у **одному** `db.batch([...])`: (1) вставити поточний рядок у `schedule_history`, якщо він існує; (2) `UPSERT` у `schedule_years` з `revision = old + 1`. Зберігати в історії останні 30 ревізій на рік (видаляти старіші тим самим batch).

---

## 5. Авторизація (сервер)

Файл: `functions/_lib/auth.js`. Змінні середовища (задаються в Cloudflare → Settings → Variables and Secrets, НЕ в репо):
- `GOOGLE_CLIENT_ID` — той самий, що `DEFAULT_CLIENT_ID` у `sync.js`.
- `ADMIN_EMAILS` — через кому, нижній регістр.
- binding `DB` → D1.

Алгоритм `requireAdmin(request, env)`:
1. Прочитати `Authorization: Bearer <access_token>`. Немає → `401 {error:'no_token'}`.
2. `GET https://oauth2.googleapis.com/tokeninfo?access_token=<token>` (з таймаутом 5 с). Не 200 → `401 {error:'invalid_token'}`.
3. Обов'язкові перевірки відповіді:
   - `aud` (або `azp`) **строго дорівнює** `env.GOOGLE_CLIENT_ID`. Інакше `403 {error:'wrong_audience'}`. Без цього будь-який Google-токен з чужого застосунку пройде.
   - `expires_in > 0`.
   - якщо `email` відсутній → `403 {error:'email_scope_required'}` (клієнт має перезапросити токен з `openid email`, розд. 7.4).
   - `email_verified` є `"true"`.
4. `email.toLowerCase()` має бути в `ADMIN_EMAILS`. Інакше `403 {error:'not_admin'}`.
5. Повернути `{ email }`.

Кешувати результат перевірки токена в пам'яті isolate на ≤60 с за ключем sha-256 токена (щоб не бити Google на кожен запит). Не кешувати відмови.

Клієнтський `ADMIN_EMAILS` у `admin.js` **лишається** як UI-фільтр; додати коментар, що це не безпека.

---

## 6. API

Усі відповіді JSON, `Cache-Control` як вказано. Same-origin, CORS не потрібен (не додавати `Access-Control-Allow-Origin: *`).

### 6.1 `GET /api/schedule` — публічний
Відповідь `200`:
```json
{
  "scheduleId": "gillette",
  "generatedAt": "2026-…Z",
  "years": {
    "2026": { "revision": 3, "updatedAt": "…Z", "data": {…}, "hours": {…} }
  }
}
```
Порожня БД → `{ "years": {} }` (це нормально, не помилка).
Заголовки: `Cache-Control: no-cache`, `ETag` (від максимального `revision` + кількості років). Підтримати `If-None-Match` → `304`.
`updatedBy` у публічну відповідь **не включати** (це email адміна).

### 6.2 `PUT /api/admin/schedule/:year` — адмін
Тіло:
```json
{ "data": {…}, "hours": {…}, "expectedRevision": 3 }
```
- `expectedRevision`: `0` для року, якого ще нема в БД. Якщо не збігається з поточним → `409 {error:'revision_conflict', currentRevision:N}` (щоб два адміни не затерли одне одного).
- Ліміт тіла 256 KB → інакше `413`.
- Успіх: `200 { year, revision, updatedAt }`.

### 6.3 Валідація (`functions/_lib/validate.mjs`, чиста функція, без залежностей)
- `year`: ціле, 2000–2100.
- `data`: ключі рівно `"1"…"12"`; в кожному місяці рівно `A,B,C,D`; кожен — масив довжини `daysInMonth(year, month)`; елементи ∈ `['', 'R', 'P', 'N']` (+ `'W'` **тільки якщо** агент підтвердить, що paint mode пише `W` у фабричні дані — тоді додати й у тест; інакше `W` відхиляти).
- `hours`: ключі `"1"…"12"` → `A,B,C,D` → ціле 0–744.
- Помилка → `400 { error:'validation', details:[…до 10 перших…] }`.
- Години **не перераховувати** на сервері (факт №6 з розд. 2).

`validate.mjs` — `.mjs`, щоб його можна було імпортувати і з Pages Function, і з `node:test`.

### 6.4 `GET /api/admin/schedule/:year/history` — адмін
Список `{ revision, savedAt, savedBy }` (без даних), до 30.

### 6.5 `POST /api/admin/schedule/:year/rollback` — адмін
Тіло `{ "toRevision": N, "expectedRevision": M }`. Створює **нову** ревізію з даними ревізії N (історія не переписується). Ті самі 409-правила.

---

## 7. Клієнт

### 7.1 Новий файл `js/schedules/remote.js` (класичний скрипт)
Підключити в `index.html` **одразу після** `js/schedules/gillette/2026.js` і **до** `js/personal/sync-tracking.js`. Додати в `ASSETS` у `sw.js`.

Відповідальність:
- `applyRemoteSchedulePayload(payload)` — для кожного року з `payload.years` викликати `registerYearData('gillette', Number(year), data, hours)`. Перед цим для цього року **очистити** старі ключі в `factorySchedule[year]`/`factoryMonthHours[year]` (registerYearData заміняє посилання на рівні року — переконатися, що alias-об'єкти оновились, а не лише `scheduleRegistry`).
- Синхронний старт: якщо є `localStorage['planzmian_remote_schedule_v1']` — застосувати його **під час завантаження скрипта** (до `core.js`), щоб перший рендер вже мав останній відомий серверний графік (важливо офлайн).
- Асинхронно: `fetch('/api/schedule', { cache: 'no-store' })` → якщо `revision`-и відрізняються від застосованих → застосувати, записати в `planzmian_remote_schedule_v1`, викликати `refreshAfterRemoteSchedule()`.
- Будь-яка помилка мережі/парсингу — тихо ігнорувати (лишається кеш/статика). Не показувати помилку користувачу, лише `console.warn` без даних.
- Повторна перевірка: при `visibilitychange` → visible (не частіше ніж раз на 60 с) і при події `online`.
- Захист від сміття: перед застосуванням прогнати ту саму перевірку форми, що й сервер (легка клієнтська копія: місяці/бригади/довжина масивів/значення). Невалідний рік — пропустити, решту застосувати.

`refreshAfterRemoteSchedule()`: за шаблоном `sync.js` — `try { renderDashboard(); } catch(_){}`, `try { renderCalendar(); } catch(_){}`, плюс `renderYearView`/`renderTableView` залежно від `currentView` (звірити з `main.js`). Показати ненав'язливий toast «Grafik zaktualizowany» (i18n ×3) **лише** якщо це не перший застосунок після холодного старту.

### 7.2 Admin Center: Publish замість експорту
У `js/admin-center.js`:
- Вкладка Export лишається, але перейменувати в «Резервна копія / Export» (i18n) і винести після нової дії.
- Додати кнопку **Publish** у Factory Editor (за `requireAdmin()`):
  1. Зібрати `merged = mergeFactoryWithCustom(year)` (вже враховує drafts) і `hours`:
     - для кожного `month/brigade`: якщо merged-масив **збігається** з поточним `factorySchedule[year]` → взяти поточні `factoryMonthHours[year][m][b]`; якщо **змінився** → `calculateMonthHours` для цього місяця/бригади. (Це зберігає вручну виставлені години типу жовтня/A=160 там, де адмін нічого не чіпав.)
  2. Показати підтвердження з підсумком (скільки клітинок змінено).
  3. `PUT /api/admin/schedule/:year` з `Authorization: Bearer <gDriveToken>` і `expectedRevision` (з `planzmian_remote_schedule_v1`; `0` якщо року нема на сервері).
  4. Успіх → `registerYearData` з відправленими даними, очистити `factoryDrafts[year]` (існуючою функцією, а не прямим `delete`), зберегти, оновити кеш, перемалювати, toast.
  5. `409` → показати «Хтось уже опублікував новішу версію», підтягнути `/api/schedule`, **не** втрачати локальні drafts.
  6. `403 email_scope_required` → див. 7.4.
  7. `401`/`403 not_admin` → зрозуміле повідомлення (i18n), drafts не чіпати.
- Drafts залишаються **чернеткою до Publish** (як зараз): рядок «публічний графік не змінено до публікації» лишається правдивим.
- Додати «Історія» (список ревізій року + Rollback) — фаза 3, не блокує релізу.

### 7.3 Токен для запиту
Брати актуальний токен існуючим шляхом із `sync.js` (той, що використовується для Drive). Якщо токен прострочений — використати існуючий механізм silent refresh; **не** писати паралельну логіку OAuth. Якщо існує функція типу `ensureDriveToken()` — використати її; назву знайти в `sync.js`, не вигадувати.

### 7.4 Сценарій `email_scope_required`
Якщо сервер каже, що в токені нема email: клієнт **один раз** примусово запитує токен зі scope `DRIVE_SCOPE + ' openid email'` (обхід `needIdentityScope()` для цього виклику), повторює PUT. Якщо й тоді немає — показати помилку, не зациклюватись. Це найбільший невідомий ризик — розд. 9.

### 7.5 Service Worker (`sw.js`)
- У `fetch`-обробнику: для запитів, чий `pathname` починається з `/api/`, **не** віддавати cache-first. Для `GET /api/schedule` — мережа, а при помилці мережі — нічого не підставляти (клієнт сам має `planzmian_remote_schedule_v1`). `/api/admin/*` не кешувати ніколи.
- Додати `./js/schedules/remote.js` в `ASSETS`.
- Не змінювати логіку `activate`/видалення старих кешів.

---

## 8. Чого НЕ чіпати в sync

Фабричний графік **не** записувати в Drive-payload (зараз `sync.js` вже читає `data.factorySchedule` лише як довідковий еталон для старих бекапів — залишити як є). Серверні дані — джерело істини для фабричної частини, Drive — для особистої.

---

## 9. Ризики, які агент мусить перевірити, а не припускати

1. **`email` у токені.** Після першого логіну клієнт просить вузький scope. Чи повертає `tokeninfo` тоді `email`? Невідомо. Перевірити реальним запитом (curl із токеном з DevTools) до написання решти. Якщо ні — реалізувати 7.4; якщо й це ненадійно — зупинитись і повідомити Dancer, запропонувати ID-token flow (`google.accounts.id`) як окреме рішення. Не вигадувати обхід самому.
2. **Хибні «зміни» в sync після оновлення графіка.** `buildComparableSyncState` і personal overrides залежать від поточного `factorySchedule`. Після того як сервер змінив фабричну клітинку, а в користувача є personal override на цей день, override може стати no-op. Перевірити на тестах (розд. 10) і переконатися, що це **не** запускає авто-upload/конфлікт у Drive без реальних змін користувача.
3. **Legacy `customSchedule` (повний клон фабрики).** У `core.js` є коментар про історичний баг, коли `ensureCustomYear()` клонував весь `factorySchedule` в `customSchedule`. Якщо в користувача залишився такий клон у localStorage/Drive, він **перекриє** нові адмінські зміни. Перевірити, що нормалізація (`buildCustomScheduleFromShiftOverrides` / repair-шлях) виконується при старті **до** першого рендера з віддаленими даними; описати результат.
4. **Хто розгортає `functions/`.** Якщо Pages проєкт створено через direct upload, а не Git — `functions/` не підхопиться автоматично. Визначити спосіб деплою і повідомити.
5. **Два адміни.** Захист лише через `expectedRevision`. Це достатньо, але не блокування.
6. **Ліміти.** Безкоштовний рівень Pages Functions/D1 для масштабу «одна фабрика» з великим запасом (1 GET на відкриття застосунку), але цифр на сьогодні я не звіряв — перевірити в документації Cloudflare перед релізом.

---

## 10. Порядок робіт і критерії приймання

**Крок 0 — розвідка (без коду в репо).** Відповісти письмово: (a) що повертає tokeninfo, (b) що записує `W`, (c) як задеплоєно Pages, (d) назва функції отримання/оновлення Drive-токена в `sync.js`. Якщо (a) або (c) проблемні — зупинитись і доповісти.

**Фаза 1 — read-only (безпечна, можна деплоїти окремо).**
- `functions/api/schedule.js` (GET), `migrations/0001_init.sql`. **`wrangler.toml` НЕ створювати:** binding `DB` Dancer налаштовує в дашборді Cloudflare; наявність `wrangler.toml` у Pages-проєкті може перекрити налаштування з дашборда (поведінку не перевіряв). Міграції застосовує Dancer вручну.
- `js/schedules/remote.js`, зміни `index.html`, `sw.js`.
- Критерій: з порожньою БД додаток поводиться **ідентично** до змін (статичний графік). Вручну вставлений тестовий рядок року → з'являється в UI після перезавантаження і після офлайн-перезапуску.

**Фаза 2 — запис.**
- `functions/_lib/auth.js`, `functions/_lib/validate.mjs`, `functions/api/admin/schedule/[year].js` (PUT).
- Publish у `admin-center.js`, i18n ×3.
- Критерій: адмін публікує рік → другий пристрій бачить зміну без деплою; не-адмін отримує 403; невалідне тіло → 400; застарілий `expectedRevision` → 409.

**Фаза 3 — історія і rollback.** `history`, `rollback`, UI.

### Обов'язкові автотести (`node:test`, у `tests/`)
- `validate.mjs`: валідний рік; довжина масиву ≠ днів у місяці (у т.ч. лютий 2028); невідоме значення; відсутня бригада; місяць 13; години поза межами.
- Клієнтська логіка `applyRemoteSchedulePayload`: заміна року на місці (перевірити, що **посилання** `factorySchedule` те саме, а вміст оновився); невалідний рік пропускається, валідний застосовується; порожній payload нічого не ламає.
- Обчислення `hours` при Publish: незмінений місяць зберігає вручну виставлені години (кейс: жовтень/A = 160), змінений — перераховується.
- `sync-tracking`: після зміни `factorySchedule` для клітинки без personal override `buildComparableSyncState` не містить фантомних змін; з override — задокументована поведінка.
- Auth: unit-тест на чисту функцію рішення (aud/email/verified/allowlist) з підставленою відповіддю tokeninfo, без мережі.

### Чого автотести не покриють — агент має чесно вказати «не перевірено»:
реальний Google-логін, реальний D1, поведінку SW на телефоні, офлайн-сценарій, вигляд PWA.

---

## 11. Ручна перевірка після деплою (для Dancer)

1. Відкрити на пристрої, який уже користувався застосунком: особисті дані, вхід Google, Drive-синхронізація на місці.
2. Під адміном змінити 1 день у тестовому році → Publish → на другому пристрої (без перезавантаження, після повернення у вкладку) з'являється зміна.
3. Під не-адміном: у DevTools виконати `fetch('/api/admin/schedule/2026',{method:'PUT'})` → очікувати 401/403.
4. Вимкнути мережу → перезапустити PWA → графік показується (останній серверний).
5. Публікація в одну й ту саму секунду з двох пристроїв → один отримує «конфлікт ревізії».
6. Перевірити, що Drive-синхронізація після оновлення графіка не показує «є незбережені зміни» без реальних правок.

---

## 12. Що треба від Dancer до старту
- Створити D1 базу в Cloudflare і прив'язати як `DB` до Pages проєкту.
- Задати `GOOGLE_CLIENT_ID` та `ADMIN_EMAILS` у змінних середовища.
- Сказати, як зараз деплоїться Pages (Git-інтеграція чи ручне завантаження).

---

## 13. Доповнення (рішення: дані фабричного графіка живуть у Cloudflare, не в git)

Замінює/уточнює розд. 1 (fallback) і розд. 7.1 (перемальовування).

### 13.1 Одноразовий seed 2026 (Фаза 1.5, між фазами 1 і 2)
- Скрипт `tools/seed-schedule.mjs`: завантажує `js/schedules/gillette/2026.js` через `vm` із заглушками `registerSchedule`/`registerYearData` і виводить SQL `INSERT` для `schedule_years` (revision = 1, updated_by = 'seed').
- Години беруться **з файлу як є** (не перераховуються): у жовтні бригада A = 160, це навмисне значення.
- Критерій: `GET /api/schedule` після seed повертає `data` і `hours` **побайтово еквівалентні** (deep-equal у тесті) тому, що реєструє `2026.js`. Тест обов'язковий.

### 13.2 Статичні файли
- Після seed `2026.js` НЕ видаляти в цій самій задачі. Лишити як заморожений baseline із коментарем у шапці: «DEPRECATED: джерело істини — БД; використовується лише якщо року нема на сервері».
- Видалити `2026.js`, `index.html`-рядок і запис в `sw.js` лише окремим комітом після того, як Dancer підтвердить, що ≥1 тиждень усе працює. Разом із цим прибрати `tools/sync_schedule_assets.py` і підказки «додай script у index.html» з i18n admin-guide (вони стають хибними).
- До видалення: адмін-експорт `YYYY.js` лишається як бекап, але тексти в i18n мають чітко казати, що це не спосіб публікації.

### 13.3 Нові роки
2027 і далі створюються в Admin Center: «Новий рік» → порожня сітка (або копія іншого року як шаблон) → малювання → Publish з `expectedRevision: 0`. Жодних файлів.

### 13.4 Перемальовування після отримання даних
У коді вже є `refreshViews()` (викликається з `setPrivacyMode`). Використати її в `refreshAfterRemoteSchedule()` замість ручного списку render-функцій; перевірити, що вона покриває поточний `currentView`.

### 13.5 Мульти-підприємство — ПОЗА обсягом цієї задачі
Не робити. Див. окреме обговорення: потребує рішення Dancer. Єдина підготовка, яка дозволена зараз: колонка `schedule_id` у таблицях уже є, API-шлях лишається `/api/schedule` для `gillette`.

---

## 14. Гілка Cloudflare і співіснування з GitHub Pages (рішення Dancer)

Контекст: `main` (ребрендинг) лишається як є і продовжує деплоїтись на GitHub Pages для Gillette. Уся робота з цього ТЗ — в **окремій гілці** (назва: `cloudflare`, якщо Dancer не скаже інакше), яка деплоїться на Cloudflare Pages. Гілки розвиваються окремо.

### 14.1 Жорсткі правила для гілки
1. **Сумісність з Drive-файлом.** GitHub Pages-версія і CF-версія використовують той самий `DEFAULT_CLIENT_ID` і той самий файл `grafik-gillette-data.json` (+ `.backup-1..3`) у Drive appdata користувача. Отже гілка `cloudflare` **не має** змінювати формат Drive-payload, ім'я файлу, семантику `revision`/`meta.revision` несумісно зі старою версією. Будь-яка зміна payload — лише додавання необов'язкових полів, які стара версія ігнорує. Перед кожною зміною в `sync.js` / `sync-tracking.js` агент письмово підтверджує, що стара версія прочитає новий файл без втрати даних.
2. Фабричний графік у Drive-payload не писати (див. розд. 8) — інакше стара версія на GitHub Pages почне сприймати серверний графік як власні зміни.
3. `localStorage` між origin-ами **не спільний** (github.io і pages.dev — різні сховища). Міграція між ними можлива лише через Drive-синхронізацію. Нічого для цього не будувати в цій задачі.
4. Не чіпати `.github/workflows/deploy.yml` і `test.yml` у гілці `cloudflare`. `deploy.yml` спрацьовує лише на push у `main` (перевірено), тож гілка GH Pages не задеплоїть. `test.yml` теж на `main` і `pull_request`; для гілки `cloudflare` тести проходитимуть лише через PR, або додати гілку в тригер **тільки в цій гілці**.
5. Не мерджити `cloudflare` у `main` без окремого рішення Dancer: злиття змінить те, що бачать користувачі на GitHub Pages.

### 14.2 Налаштування Cloudflare Pages (робить Dancer, не агент)
- Проєкт підключений до GitHub-репозиторію (Git integration), **production branch = `cloudflare`**. Це вирішує питання `functions/` з розд. 9 п.4: папка `functions/` підхоплюється автоматично.
- Build command для підстановки версії кешу (у GitHub цим займається `deploy.yml`, у CF його нема):
  `sed -i "s/__BUILD_ID__/$CF_PAGES_COMMIT_SHA/g" sw.js`
  Build output directory: `/` (корінь). **Перевірити за документацією Cloudflare**, що змінна `CF_PAGES_COMMIT_SHA` доступна на етапі збірки — я її не запускав.
- Google Cloud Console: у OAuth Client в Authorized JavaScript origins мають бути **обидва** origin-и (github.io і pages.dev). Для pages.dev, за словами Dancer, вхід уже працює.
- Якщо `planzmian.pages.dev` зараз створений через direct upload, а не Git — потрібен новий Pages-проєкт із Git integration (або перепідключення); тоді URL може змінитись. Dancer має з'ясувати це до Кроку 0.

### 14.3 Крок 0 доповнюється
Пункт (c) «як задеплоєно Pages» знімається, якщо Dancer підтвердить 14.2. Решта пунктів Кроку 0 (email у токені, значення `W`, назва функції токена в `sync.js`) лишаються.

---

## 15. Уточнення з коду (закривають пункти (b) і (d) Кроку 0; читанням, не запуском)

### 15.1 Значення `W` (закриває (b))
`W` — лише інструмент малювання «вільний день». У `handleFactoryPaintDayClick` (`admin-center.js`) і в `calendar.js:211` це перетворюється на `''` перед записом (`const val = factoryPaintMode === 'W' ? '' : factoryPaintMode`). У фабричні дані потрапляють тільки `''`, `R`, `P`, `N`.
→ **Валідація (6.3) і клієнтська перевірка (7.1): дозволені значення рівно `['', 'R', 'P', 'N']`. `'W'` відхиляти.** Умовність «+`W` якщо…» з 6.3 скасована.
(`isWolne()` у `_core.js` трактує `'W'` як вільний день лише для відображення — не змінювати.)

### 15.2 Токен (закриває (d))
- Отримання токена: `ensureDriveToken(interactiveFallback)` у `js/sync.js` (async, повертає boolean). Сам токен — top-level `let gDriveToken` у `sync.js` (доступний іншим класичним скриптам як глобальний lexical binding, але НЕ як `window.gDriveToken`). `isDriveTokenValid()` — перевірка терміну.
- Для запитів до нашого API **не** використовувати `driveFetch` (він додає токен лише для Google-URL-ів логікою виклику і має власну 401-логіку під Drive). Написати окрему функцію `adminApiFetch(url, options)` у `admin-center.js`: `await ensureDriveToken(true)` → `Authorization: Bearer ${gDriveToken}` → fetch → при `401` один раз скинути токен і повторити після `ensureDriveToken(true)`. Не дублювати OAuth.
- **Пастка:** `ensureDriveToken` одразу повертає `false`, якщо `driveFeatureOn()` вимкнений (резервна копія Drive вимкнена в налаштуваннях). Адмін з вимкненим Drive-бекапом не зможе опублікувати. Агент має: (1) перевірити `driveFeatureOn()`; (2) якщо вимкнений — показати зрозуміле повідомлення (i18n ×3) з проханням увімкнути вхід Google, **а не** обходити прапорець у `sync.js`.
- `requestDriveAccessToken(opts)` **не приймає** override scope: scope береться з `getRequestedScope()`. Для сценарію `email_scope_required` (7.4) потрібна мінімальна зміна: `opts.forceIdentityScope` → у `cfg.scope` використати `DRIVE_SCOPE + ' ' + IDENTITY_SCOPE`. Зміна лише в цій функції; `getRequestedScope()` не чіпати.

### 15.3 Рекомендований порядок для агента після цих уточнень
Крок 0 тепер зводиться до двох речей: (a) реальний `tokeninfo` (робить Dancer вручну — розд. 16) і (c) підтвердження налаштувань Cloudflare (14.2). Код для (b) і (d) уже з'ясовано вище — агент лише перевіряє, що номери рядків/імена не змінились.

---

## 16. Ручний тест токена (робить Dancer, пункт (a))

Умова: браузер і акаунт адміна, де вхід у Google уже виконано раніше і email закешований (це реальний стан, у якому клієнт просить **вузький** scope).

1. Відкрити застосунок на pages.dev під адміном, DevTools → Console:
   `localStorage.getItem('grafik_drive_token')` — скопіювати значення (діє ~1 год; нікому не показувати і не публікувати).
2. У терміналі:
   `curl "https://oauth2.googleapis.com/tokeninfo?access_token=ТОКЕН"`
3. Надіслати агентові/Claude **лише JSON-відповідь без токена**, за потреби замазавши `sub` та `email`. Важливі поля: `aud`, `azp`, `scope`, наявність `email` і `email_verified`, `expires_in`.
4. Інтерпретація:
   - `email` є → реалізуємо як у розд. 5, 7.4 лишається запасним шляхом.
   - `email` нема, `scope` без `email` → обов'язковий сценарій 7.4 (15.2), і перед релізом його треба перевірити вручну.
   - `aud` не дорівнює `DEFAULT_CLIENT_ID` з `sync.js` → зупинитись і розібратись, чому (можливо, перевизначений `grafik_drive_client_id` у localStorage).

---

## 17. Результати розвідки на planzmian.pages.dev (2026-09-29, зняті Dancer скриптом у консолі)

Підтверджено на одному акаунті адміна, в одному браузері, в один момент:
1. `tokeninfo` для поточного токена (вузький запитуваний scope, email закешований) повертає HTTP 200, `email`, `email_verified: "true"`, `scope` включає `openid email userinfo.email`, `aud == azp == DEFAULT_CLIENT_ID`. → Схема авторизації з розд. 5 працює як задумано. Сценарій `email_scope_required` (7.4) лишається **страховкою**, а не основним шляхом; його все одно реалізувати мінімально й покрити unit-тестом рішення.
2. `clientIdIsDefault: true`, `driveFeatureOn: true`, `isAdmin: true`, `hasRefreshViews: true`.
3. **ДЕФЕКТ (не пов'язаний із цим ТЗ, виправляє Dancer у Cloudflare):** розгорнутий `sw.js` містить `'plan-zmian-' + '__BUILD_ID__'`, кеш називається `plan-zmian-__BUILD_ID__`. Build command із розд. 14.2 не застосувався. До виправлення назва кешу не змінюється між деплоями. Агент не починає Фазу 1, доки Dancer не підтвердить, що на розгорнутому `sw.js` плейсхолдер замінено (перевірка: `caches.keys()` показує `plan-zmian-<sha>`).
4. Не перевірено цим скриптом: чи знайдений Drive-файл на цьому origin (ключа `grafik_drive_file_id` у localStorage не було), форма `customSchedule` (ризик 9.3), поведінка на телефоні/офлайн.

### 17.1 Другий скрипт (planzmian.pages.dev, браузер адміна)
`customSchedule` порожній, `compactOverrideCount: 0`, `gDriveFileId` і `grafik_drive_file_id` відсутні, `gillette_sync_meta.revision = 0`. Тобто на цьому origin **немає жодних особистих даних і немає прив'язки до Drive-файлу**.
Наслідки для агента:
- Ризик 9.3 (legacy full-clone `customSchedule`) на цьому браузері **не перевіряється** — перевірку треба виконати в браузері з реальними особистими даними (напр. на origin GitHub Pages). До цього ризик вважати відкритим і покрити unit-тестом на `buildCustomScheduleFromShiftOverrides` з клоном фабрики на вході.
- Прив'язка до існуючого Drive-файлу на новому origin **не підтверджена**. Агент не має тестувати синхронізацію на реальному Drive-акаунті Dancer; для перших ручних тестів використовувати окремий тестовий Google-акаунт.
- Небезпечний сценарій (не перевірено, що застосунок від нього захищає): натиснути Upload на origin з `revision = 0` і порожніми локальними даними — це може перезаписати реальний Drive-файл порожнім. Перший крок на такому origin — тільки Download/перевірка, ніколи Upload.
