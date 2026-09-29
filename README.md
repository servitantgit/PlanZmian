# 📅 Plan Zmian

**Język / Language / Мова:** **Polski** · [English](./README.en.md) · [Українська](./README.uk.md)

Aplikacja PWA do zarządzania grafikami zmian dla 4 brygad pracujących w systemie 3-zmianowym (Rano/Popołudnie/Noc). Zastępuje papierowy kalendarz w plakietce.

**Demo:** [https://planzmian.pages.dev/](https://planzmian.pages.dev/)

![Status](https://img.shields.io/badge/status-production-brightgreen)
![Tests](https://github.com/servitantgit/PlanZmian/actions/workflows/test.yml/badge.svg)
![PWA](https://img.shields.io/badge/PWA-ready-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Główne funkcje

- 📊 **4 brygady** (A/B/C/D) z systemem 3 zmian (R/P/N) + Wolne + Urlop
- 🏠 **3 główne widoki**: Dashboard, Miesiąc, Tabela
- 📈 **Tryb Rok** — rozszerza Miesiąc/Tabelę na cały rok (12 mini-kalendarzy/tabel)
- ✏️ **Edycja grafiku** (auto-save; limit urlopu w trybie edycji 🌴)
- 🌴 **Urlopy** z limitem per brygada i automatycznym liczeniem dni roboczych
- ⏱ **Nadgodziny** z auto-kategoryzacją (+50%/+100%/+200%) — dla dni roboczych ORAZ dni wolnych/świąt
- 📝 **Notatki** do dowolnych dni
- 🔍 **Wyszukiwanie** zmian, wolnych, urlopów
- ⚖️ **Porównywanie brygad** (Ctrl+klik)
- 🎨 **2 motywy**: jasny/ciemny (Ustawienia → Wygląd)
- 🌐 **Wielojęzyczność**: polski, angielski, ukraiński (Ustawienia → Ogólne)
- 📱 **PWA** — instalacja na telefonie, tryb offline, powiadomienia
- 📱 **Udostępnianie aplikacji** — link + kod QR + natywne udostępnianie (SMS, messengers)
- 🔄 **Auto-update** — automatyczne powiadomienie o nowej wersji z jednym kliknięciem
- 🔗 **Udostępnianie kontekstowe** — link dokładnie do widoku, który oglądasz
- 📥 **Eksport .ics** do kalendarza, **druk**
- ☁️ **Google Drive** — opcjonalny backup/synchronizacja (domyślnie wyłączone; włącz w Ustawienia → Prywatność)

## 📸 Zrzuty ekranu

<p align="center">
  <a href="screenshots/1.png"><img src="screenshots/1.png" width="160" alt="Dashboard (Pulpit)"></a>&nbsp;
  <a href="screenshots/2.png"><img src="screenshots/2.png" width="160" alt="Widok miesiąca"></a>&nbsp;
  <a href="screenshots/3.png"><img src="screenshots/3.png" width="160" alt="Tabela zmian"></a>&nbsp;
  <a href="screenshots/4.png"><img src="screenshots/4.png" width="160" alt="Tryb Rok"></a>
</p>

<p align="center">
  <a href="screenshots/5.png"><img src="screenshots/5.png" width="160" alt="Tabela — widok roczny"></a>&nbsp;
  <a href="screenshots/6.png"><img src="screenshots/6.png" width="160" alt="Ustawienia ogólne"></a>&nbsp;
  <a href="screenshots/7.png"><img src="screenshots/7.png" width="160" alt="Ustawienia wyglądu"></a>&nbsp;
  <a href="screenshots/8.png"><img src="screenshots/8.png" width="160" alt="Udostępnianie — kod QR"></a>
</p>

## 🚀 Szybki start

1. Otwórz [https://planzmian.pages.dev/](https://planzmian.pages.dev/)
2. Wybierz brygadę (A/B/C/D) i rok
3. Dashboard pokaże dzisiejszą zmianę z timerem (trwająca po północy zmiana N poprzedniego dnia pozostaje aktywna; nadgodziny `po` mogą ją wydłużyć — opcja daty w Ustawienia → Ogólne)
4. Przełączaj widoki górnym menu

**Style komórek:** w Personalizacji dostępne są trzy warianty: pełne wypełnienie, spokojny pasek oraz kolorowe obramowanie. W ostatnim wariancie kolor obramowania komórki i okręgu wokół daty odpowiada zmianie.

**Szczegóły funkcji:** ☰ Menu → ❓ Pomoc / FAQ · kod: [GitHub](https://github.com/servitantgit/PlanZmian)

## 📱 Instalacja jako PWA

### Android (Chrome)

- Menu przeglądarki (⋮) → "Dodaj do ekranu głównego"
- Lub: ☰ Menu → 📲 Zainstaluj aplikację

### iPhone / iPad (Safari)

1. Otwórz stronę w **Safari** (nie w innej przeglądarce!)
2. Dotknij **Udostępnij** ⬆️ na dole ekranu
3. Przewiń w dół → **„Dodaj do ekranu głównego"**
4. Dotknij **„Dodaj"**

Po instalacji aplikacja działa w pełnym ekranie, bez paska adresu, i jest dostępna offline.

## 🔗 Udostępnianie i URL params

Funkcja **🔗 Udostępnij widok** w bocznym menu tworzy link do dokładnie tego, co widzisz. Odbiorca zobaczy ten sam widok.

### Parametry URL

| Parametr | Znaczenie                                 | Przykład     | Opcjonalny |
| -------- | ----------------------------------------- | ------------ | ---------- |
| `view`   | Typ widoku: `dashboard`, `month`, `table` | `view=month` | Nie        |
| `y`      | Rok                                       | `y=2026`     | Nie        |
| `m`      | Miesiąc (1-12)                            | `m=8`        | Tak\*      |
| `d`      | Dzień (1-31)                              | `d=10`       | Tak\*      |
| `brig`   | Brygada (A/B/C/D)                         | `brig=C`     | Tak\*      |
| `rok`    | Tryb Rok (1 = włączony)                   | `rok=1`      | Tak\*      |

\* Parametr jest dodawany automatycznie, jeśli ma sens w danym widoku.

### Przykłady URL

```
# Dzień 10 sierpnia, brygada C
?view=month&y=2026&m=8&d=10&brig=C

# Cały sierpień, brygada C
?view=month&y=2026&m=8&brig=C

# Rok view, brygada C
?view=month&y=2026&brig=C&rok=1

# Tabela — cały rok
?view=table&y=2026&rok=1
```

## 📅 Aktualne dane grafiku

- W repozytorium znajduje się aktualnie fabryczny grafik **Gillette na 2026 rok**.
- Obsługiwane brygady: **A, B, C, D**.
- Zmiany: **R (rano), P (popołudnie), N (noc), W (wolne)**.
- Kolejne lata są dodawane jako osobne pliki w `js/schedules/gillette/`.

## 🛠 Dla developerów

### Stos technologiczny

- **Vanilla JavaScript** (ES2020+, bez frameworków, bez build system)
- **HTML5 + CSS3** (Custom Properties, Flexbox, Grid)
- **i18n**: własny prosty system tłumaczeń w `js/i18n/` (3 języki, bez zależności zewnętrznych)
- **PWA**: Service Worker + Web App Manifest
- **Google Drive API** (OAuth 2.0)
- **Hosting**: GitHub Pages
- **CI/CD**: GitHub Actions (auto-versioning cache SW przy każdym pushu)

### Wymagania

- Nowoczesna przeglądarka z obsługą ES2020, Service Worker, localStorage
- **Uwaga**: PWA i moduły JS wymagają HTTP (nie działa z `file://`)

### Uruchomienie lokalne

```bash
# Python 3
python -m http.server 8000

# Node.js (jeśli masz http-server)
npx http-server -p 8000
```

Następnie otwórz: `http://localhost:8000`

### Uruchamianie testów

```bash
node tests/run.js
```

Działa na każdym Node 18+. Forma `node --test "tests/*.test.js"` działa tylko od Node 21, bo dopiero od tej wersji Node sam rozwija glob w argumentach pozycyjnych `--test`.

### Struktura projektu

```
Graffik/
├── index.html          # HTML (bez inline CSS)
│   ├── privacy.html          # Privacy Policy (uk/en/pl)
├── manifest.json       # PWA manifest
├── sw.js               # Service Worker (precache ASSETS)
├── css/
│   ├── app-shell.css      # Shell aplikacji
│   ├── calendar.css       # Kalendarz miesiąca
│   ├── components.css     # Komponenty i widoczność Privacy Mode
│   ├── dashboard.css      # Dashboard
│   ├── layout.css         # Układ aplikacji
│   ├── overtime.css       # Nadgodziny
│   ├── print.css          # Druk
│   ├── responsive.css     # Responsywność
│   ├── smart-popup.css    # Popupy
│   ├── variables.css      # Zmienne motywu
│   └── views.css          # Widoki Rok i Tabela
├── js/
│   ├── schedules/           # Modularna architektura danych (v3.7+)
│   │   ├── _core.js        # Stałe, helpers (monthNames, shiftHours…)
│   │   ├── _registry.js    # Registry + shouldShowPersonalData()
│   │   └── gillette/
│   │       ├── metadata.js # Metadane schedule (brygady, typy zmian)
│   │       └── 2026.js     # Dane roku 2026
│   ├── personal/
│   │   ├── sync-tracking.js  # lastModified / lastSync (unsynced state)
│   │   └── notes-tracking.js # Notatki dzienne (dodawanie/edycja/usuwanie, liczenie)
│   ├── overtime-logic.js    # Kategoryzacja nadgodzin +50%/100%/200%
│   ├── core.js              # Storage, getShiftAt, isUrlop, prefs…
│   ├── ui.js                # Toast, Modal, Confirm, motyw
│   ├── edit.js              # Natychmiastowa edycja zmian (applyEdit)
│   ├── dashboard.js         # Dashboard (gated by shouldShowPersonalData)
│   ├── calendar.js          # Kalendarz, popupy, nadgodziny
│   ├── views.js             # Rok, Tabela
│   ├── actions.js           # .ics, share, print, admin export
│   ├── pwa.js               # SW registration, powiadomienia
│   ├── sync.js              # Google Drive OAuth + upload/download
│   ├── admin.js             # Identyfikacja admina (ADMIN_EMAILS)
│   ├── admin-center.js      # Panel admina
│   ├── app-shell.js         # Shell UI
│   ├── personalization.js   # Style komórek, preferencje UI
│   ├── settings.js          # Ustawienia
│   ├── smart-popup.js       # Inteligentne popupy
│   ├── i18n/
│   │   ├── pl.js / en.js / uk.js
│   │   └── i18n.js          # t(), setLanguage(), renderFAQ()
│   └── main.js              # Stan, events, init
├── icons/
│   ├── icon-192.png
│   ├── icon-512.png
│   └── icon-512-maskable.png
├── screenshots/             # Zrzuty ekranu do README i manifestu
│   └── 1.png … 8.png
├── docs/                    # Dokumentacja techniczna
│   ├── AGENT.md             # Reguły dla AI / engineering rules
│   ├── PROJECT_DOCS.md      # Architektura, schema, edge cases
│   └── tests-README.md
├── tools/                   # Dev helpers (check_js, generate_icons, export-code…)
├── tests/                   # Testy jednostkowe
├── CHANGELOG.md
├── README.md                # PL (domyślny)
├── README.en.md             # EN
└── README.uk.md             # UK
```

## ⌨️ Skróty klawiszowe

### Tryb edycji

| Skrót                     | Działanie                                                         |
| ------------------------- | ----------------------------------------------------------------- |
| `R` / `P` / `N` / `W`     | Wybór zmiany do malowania                                         |
| `C`                       | Tryb cyklu (rotacja zmian)                                        |
| `O`                       | Tryb nadgodzin (przed/po zmianie ORAZ praca w dzień wolny/święto) |
| `Ctrl+Z`                  | Cofnij ostatnią zmianę                                            |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Ponów cofniętą zmianę                                             |
| `Ctrl+S`                  | Zapisz wszystkie zmiany                                           |
| `Esc`                     | Wyjdź z trybu edycji                                              |

### Nawigacja

| Skrót     | Działanie                              |
| --------- | -------------------------------------- |
| `←` / `→` | Poprzedni/następny miesiąc             |
| `E`       | Włącz/wyłącz tryb edycji               |
| `Esc`     | Zamknij popup/modal lub wyjdź z edycji |

### Wybór brygady

| Akcja         | Działanie                                           |
| ------------- | --------------------------------------------------- |
| `Klik`        | Zmień aktywną brygadę                               |
| `Ctrl + klik` | Porównaj z inną brygadą (podświetla wspólne zmiany) |

## 🌐 Języki

Aplikacja obsługuje 3 języki (wybór przyciskiem 🌐 w górnym pasku):

- 🇵🇱 **Polski** (domyślny)
- 🇺🇸 **English**
- 🇺🇦 **Українська**

Język jest automatycznie wykrywany z ustawień przeglądarki przy pierwszym uruchomieniu. Wybrany język zapisuje się w localStorage i zostaje po restarcie.

**Dla developerów** — dodawanie nowych tłumaczeń:

1. Otwórz `js/i18n/pl.js` (lub en.js/uk.js) — dodaj nowy klucz z wartością
2. **Ważne**: dodaj ten sam klucz w WSZYSTKICH 3 plikach
3. W HTML używaj `data-i18n="klucz"` lub w JS: `t('klucz')` / `t('klucz', {param: 'wartość'})`

Parzystość kluczy, placeholdery i prefiksy dynamiczne sprawdza `node tools/i18n-audit.js`. Sekcja „unused keys" w tym raporcie jest wyłącznie informacyjna: kluczy używanych pośrednio (`t(key)` ze zmiennej, mapy odwzorowań, nazwy budowane dynamicznie) analiza statyczna nie widzi, więc nie należy niczego usuwać wyłącznie na podstawie tej listy.

## 💾 Przechowywanie danych

Aplikacja przechowuje dane w dwóch miejscach:

1. **localStorage** (podstawowe) — urlopy, nadgodziny, notatki, ustawienia, edycje grafiku
2. **Google Drive** (opcjonalnie, **domyślnie wyłączone**) — backup i synchronizacja między Twoimi urządzeniami. Włącz przełącznik w Drive card w bocznym menu, potem zaloguj się.

Wszystkie ustawienia synchronizacji znajdują się w jednym miejscu: **⚙ Opcje synchronizacji** w bocznym menu → karta Google Drive. Panel zawiera:
- **Tryb synchronizacji** — Automatyczna (fonowe sprawdzania) lub Tylko ręcznie (bez okien logowania Google w tle — zalecane).
- **Zmiany** — porównanie lokalnych danych z Drive (urlopy, nadgodziny, notatki, własne zmiany).
- **Akcje** — Wyślij / Pobierz.

**Uwaga:** Dane w localStorage można stracić przy wyczyszczeniu pamięci przeglądarki. Rób backup przez ☁️ Google Drive lub eksportuj wybrany widok (ICS / druk).

## 🔒 Prywatność

Wszystkie dane są przechowywane lokalnie w przeglądarce użytkownika. Aplikacja nie zbiera analityki i nie wysyła danych na nasze serwery. Pełny tekst: **[Polityka prywatności](./privacy.html)** (PL / EN / UK).

**Tryb prywatności** (Ustawienia → Dane i prywatność lub przełącznik w menu) ukrywa dane osobiste na ekranie (urlopy, nadgodziny, notatki, własne zmiany) i pokazuje tylko oficjalny grafik fabryczny. Jest niezależny od logowania do Google.

**Google Drive** to wyłącznie opcjonalny backup:

- Domyślnie wyłączony — aplikacja nigdy nie prosi o konto Google.
- Po włączeniu i zalogowaniu dane trafiają tylko do *Twojego* folderu danych aplikacji Google Drive (zakresy `drive.file` + `drive.appdata`).
- Wylogowanie lub wyłączenie opcji czyści lokalny token; plik w Drive pozostaje, dopóki go nie usuniesz lub nie cofniesz dostępu w koncie Google.

## 🐛 Zgłaszanie błędów

Znaleziono błąd lub masz sugestię? Napisz na: [servitant@gmail.com](mailto:servitant@gmail.com)

Przy zgłoszeniu podaj:

- Rok, datę, brygadę
- Nazwę przeglądarki i urządzenie
- Krótki opis problemu
- Zrzut ekranu (jeśli możliwy)

## 📝 Licencja

MIT License (lub wewnętrzne narzędzie fabryczne — wg wyboru autora)

## 🙏 Autor

**Servitant**  
📧 [servitant@gmail.com](mailto:servitant@gmail.com)

---

**Uwaga dla developerów:** Szczegółowa dokumentacja techniczna (architektura, sync, edge cases) znajduje się w [docs/PROJECT_DOCS.md](./docs/PROJECT_DOCS.md). Reguły dla AI — [docs/AGENT.md](./docs/AGENT.md). FAQ w aplikacji (☰ Menu → ❓) zawiera przewodnik dla użytkowników.

## Admin: publikacja fabrycznego grafiku

Źródło prawdy — **Cloudflare D1** (Pages Functions). Statyczny `js/schedules/gillette/YYYY.js` to tylko offline-fallback.

1. Zaloguj się Google jako admin.
2. Admin Center → Factory → **Rozpocznij edycję** (szkice R/P/N/W lokalnie).
3. Na pasku trybu malowania naciśnij **📤** (lub „Opublikuj” w Admin Center).
4. Klienci pobierają nową `revision` z `/api/schedule` (bez git/deploy).

Opcjonalnie: **Eksport `.js`** pozostaje ścieżką awaryjną do git. Szczegóły: [docs/PROJECT_DOCS.md](./docs/PROJECT_DOCS.md) §3.2, [docs/ADMIN_BACKEND_SPEC.md](./docs/ADMIN_BACKEND_SPEC.md).
