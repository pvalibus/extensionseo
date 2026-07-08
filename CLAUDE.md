# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

"410 gone SEO&GEO tools" is a Chrome extension (Manifest V3) for quick on-page SEO analysis. It is plain, unbundled HTML/CSS/JS — there is no build step, package manager, bundler, linter, or test suite. Every `.js` file is loaded by the browser as-is.

## Development workflow

There are no build/lint/test commands. To develop and verify changes:

1. Open `chrome://extensions`.
2. Enable "Developer mode".
3. Click "Load unpacked" and select the repo root (or click the reload icon on the extension card after edits).
4. Reload the target web page to re-inject `contentScript.js`, and reopen the popup to pick up changes in `popup.js`/`popup.html`.
5. Inspect background/service-worker logs via the "service worker" link on the extension card in `chrome://extensions`; inspect popup/content-script logs via normal DevTools on the popup or page.

Since there's no automated test suite, manually validate changes in a loaded browser (per the `verify`/`run` skills) before considering a task done — especially anything touching `webRequest`/`declarativeNetRequest` (background.js), since those require real network activity to exercise.

## Architecture

The extension has five independent entry points that communicate via `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage`, plus one shared background service worker. There is no shared module system — duplicated logic (e.g. triplette/slug extraction, Hn heading extraction) is intentionally copy-pasted between `contentScript.js` and `popup.js`'s injected functions, since content scripts and `chrome.scripting.executeScript` closures can't import shared files at runtime.

- **`background.js`** — MV3 service worker, the only place with persistent-ish state (in-memory `Map`s keyed by `tabId`/`requestId`, cleared on `tabs.onRemoved`). Responsibilities:
  - Tracks main-frame requests via `chrome.webRequest` (onBeforeRequest/onHeadersReceived/onBeforeRedirect/onCompleted/onErrorOccurred) to compute TTFB, transfer size, compression, and the full redirect chain per tab.
  - Manages per-tab JS/CSS blocking using `chrome.declarativeNetRequest.updateSessionRules` (dynamic session rules keyed by an incrementing `nextRuleId`), reloading the tab after toggling.
  - Exposes a `chrome.runtime.onMessage` request/response API: `getPerfData`, `getRedirectData`, `getTechState`, `setJsDisabled`, `setCssDisabled`.

- **`popup.js`** / **`popup.html`** — the toolbar popup UI, tab-based (Perf / Structure / Tech / Redirection / Triplette / Outil / About). On open it queries the active tab and fans out to: `chrome.runtime.sendMessage` (background data), `chrome.scripting.executeScript` (ad-hoc data pulled directly from the page, e.g. `performance.getEntriesByType('navigation')`, title/H1/meta), and `chrome.tabs.sendMessage` (to trigger `contentScript.js` DOM overlays). Also renders SERP preview snippets with pixel-accurate truncation (`truncateByPixels`, via an offscreen `<canvas>` measuring text width) and drives CSV export of internal/external links.

- **`contentScript.js`** — injected into every page (`document_idle`). Maintains a local `state` object per feature (`hn`, `html5`, `externalLinks`, `internalLinks`) so each is an independent on/off toggle. On each toggle it either paints or clears: outlines + floating labels on headings (`toggleHn`), background+outline overlays on HTML5 semantic sectioning elements with nested-element margin adjustment (`toggleHtml5`), or outlines on internal/external anchors (`toggleLinks`). All injected DOM (`gone-seo-*` classes/labels) is fully reversible via `clearFeature`. Listens for `toggleStructure` / `getPagePerfData` / `getTripletteData` / `getHnTreeData` messages.

- **`hn-tree.html`** / **`hn-tree.js`** — a standalone tab opened from the popup showing the page's Hn heading outline. Data is handed off via `chrome.storage.local` (popup writes a timestamped key, this page reads it once and deletes it after 15s) rather than message passing, since it opens in a new tab with no live sender.

- **`scrap-tool.html`** / **`scrap-tool.js`** — a standalone popup window (opened via `chrome.windows.create`) for ad-hoc XPath-based scraping of the source tab (passed as a `tabId` query param). Users define a base XPath (row selector) and per-column relative XPaths; extraction runs inside the source tab via `chrome.scripting.executeScript` and results can be copied or downloaded as CSV using the configured CSV format (see options).

- **`options.html`** / **`options.js`** — settings page (`chrome.storage.sync`) for overlay colors (Hn outline, HTML5 zone color/alpha, internal/external link colors) and CSV export format (quote values, separator, with `\t` typed as literal `\t`). Both `popup.js` (structure actions) and `scrap-tool.js`/`popup.js` (CSV export) read these via `chrome.storage.sync.get(defaults)`, merging over local `defaults`/`defaultConfig` objects duplicated in each file — keep these default objects in sync when adding new options.

## Conventions

- French-language UI strings and code comments/identifiers mix French (`ancre`, `emplacement`, `triplette`) and English; follow existing naming in the file you're editing rather than normalizing.
- DOM elements/classes injected by the extension are prefixed `gone-seo-` to avoid colliding with page content; any new visual overlay feature should follow this prefix and clean up fully in a `clear*` function.
- Config objects (`defaultConfig` in `popup.js`, `defaults` in `contentScript.js`/`options.js`, `csvDefaults` in `scrap-tool.js`) are copy-pasted per file rather than imported — update all copies when changing a default or adding a field.
- `manifest.json` permissions (`webRequest`, `declarativeNetRequest`, `scripting`, `storage`, `tabs`, `activeTab`) are already broad (`<all_urls>` host permission); avoid adding new permissions unless a feature genuinely needs them.

## Fiche Chrome Web Store (FR)

Texte prêt à coller dans le Developer Dashboard lors de la publication/mise à jour de la fiche. À garder synchronisé avec les fonctionnalités réelles listées dans "Architecture" ci-dessus.

### Résumé (champ "Résumé", 132 caractères max)

```
Extension SEO & GEO : TTFB, structure Hn/HTML5, redirections, title/H1/meta, aperçu SERP, scrap XPath, capture pleine page.
```

### Description détaillée

```
410 gone SEO&GEO tools est une extension Chrome gratuite pour consultants SEO, développeurs et créateurs de contenu qui veulent auditer une page web sans changer d'onglet. Elle regroupe dans un seul popup les vérifications techniques et éditoriales les plus utiles au référencement (SEO) et à l'optimisation pour les moteurs de réponse IA (GEO) : une structure sémantique propre et des balises claires aident aussi bien Google que les assistants IA à comprendre une page.

⚡ Performance
- Temps de réponse serveur (TTFB)
- Taille de transfert de la page HTML
- Détection de la compression (gzip, brotli...)

🏗️ Structure & sémantique HTML
- Surbrillance instantanée des balises Hn (H1 à H6) directement sur la page
- Vue arborescente des titres Hn dans un nouvel onglet, pour visualiser la hiérarchie éditoriale d'un coup d'œil
- Repérage visuel des zones HTML5 sémantiques (header, nav, main, article, section, aside, footer)
- Surbrillance des liens internes et externes, avec export CSV (ancre, URL cible, emplacement, type)

🔀 Redirections
- Visualisation de la chaîne complète de redirections (301, 302...) sous forme de workflow coloré par code de statut

🏷️ Title, H1, meta description & aperçu SERP
- Extraction du title, H1, slug d'URL et meta description, avec comptage de caractères
- Aperçu du résultat Google (SERP) en version desktop et mobile, avec troncature en pixels comme le fait réellement Google

🛠️ Outils avancés
- Scraper XPath : définissez un XPath de base et des colonnes personnalisées pour extraire des données structurées de n'importe quelle page, puis copiez ou exportez en CSV
- Capture d'écran de la page entière en un clic : génère un JPG de la page complète (pas seulement la partie visible), le télécharge et le copie automatiquement dans le presse-papiers

⚙️ Tech & configuration
- Désactivation à la volée du JavaScript ou du CSS d'un onglet, pour tester le rendu "sans JS" ou le contenu brut
- Page de réglages pour personnaliser les couleurs de surbrillance et le format d'export CSV (séparateur, guillemets)

Idéale pour un audit SEO technique rapide, une vérification du maillage interne, un contrôle de la hiérarchie des balises Hn, ou une capture de preuve visuelle d'une page avant/après optimisation.
```
