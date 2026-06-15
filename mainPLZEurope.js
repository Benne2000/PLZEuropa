// ═══════════════════════════════════════════════════════════════════════════
//  SAP Custom Widget – Geo-PLZ-Analyse
//  Refactored Version
//
//  Änderungen ggü. Vorversion:
//    • Kein globaler Scope-Leak mehr (alles in IIFE, keine let außerhalb)
//    • disconnectedCallback räumt Timer, Listener & Leaflet sauber auf
//    • Ein zentraler AbortController für alle DOM-Listener
//    • Click-Handler auf GeoLayer werden genau einmal gebunden (vorher: pro
//      updateGeoLayer für jedes Polygon neu → O(n) Listener-Leaks)
//    • XSS-sicheres HTML-Templating über escapeHtml()
//    • PLZ-Namen-Labels auf der Karte ab Zoom 11 mit Collision-Detection
//    • Toter Code entfernt (prepareDropdownData, updateNeighbours,
//      restoreFilterUI, hasTriggeredClick, Debug-Utilities)
//    • Mehrfach duplizierte Helfer (_bad, buildStruktur) konsolidiert
//    • Bug gefixt: `if (isCrossErhebung || true)` → korrekte Bedingung
//    • Inline-Styles größtenteils in CSS-Klassen überführt
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Geteilte Konstanten ───────────────────────────────────────────────
  const GEOJSON_URL      = 'https://raw.githubusercontent.com/Benne2000/PLZAnalyse/main/PLZ.geojson';
  const COMPETITORS_URL  = 'https://raw.githubusercontent.com/Benne2000/PLZAnalyse/main/competitor.json';
  const LEAFLET_JS       = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  const LEAFLET_CSS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  const OSM_TILES    = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  // ── Länder-Konfiguration (Europäisierung) ──────────────────────────
  // Single Source of Truth pro Land. plzLen steuert die landesabhängige
  // PLZ-Normalisierung; center/zoom sind Fallback-Ausschnitt.
  const COUNTRY_CONFIG = {
    DE: { file: 'PLZ_DE.geojson', plzLen: 5, center: [51.2, 12.5], zoom: 6 },
    NL: { file: 'PLZ_NL.geojson', plzLen: 4, center: [52.1,  5.3], zoom: 7 },
    CH: { file: 'PLZ_CH.geojson', plzLen: 4, center: [46.8,  8.2], zoom: 7 },
  };
  const COUNTRY_CODES = Object.keys(COUNTRY_CONFIG);
  const DEFAULT_LAND  = 'DE';
  const GEO_BASE_URL  = 'https://benne2000.github.io/PLZEuropa/';
  const LAND_NAMES    = { DE: 'Deutschland', NL: 'Niederlande', CH: 'Schweiz' };

  const NULL_TOKENS   = new Set(['', '@NullMember', '@TotalMembers']);
  const CATEGORIES    = ['stationaer', 'pluscard', 'ra', 'online'];
  const PLZ_FILTER_KEYS    = ['0POSTALCODE', 'dimension_plz_0', 'dimension_plz'];
  const ERH_FILTER_KEYS    = ['BGFBNR', 'dimension_erhebung_0', 'dimension_erhebung'];
  const JAHR_FILTER_KEYS   = ['0CALYEAR', 'dimension_jahr_0', 'dimension_jahr'];
  const NUMMER_FILTER_KEYS = ['BERHBNUM', 'dimension_erhebungsnummer_0', 'dimension_erhebungsnummer'];
  const ALL_STALE_KEYS = [...ERH_FILTER_KEYS, ...JAHR_FILTER_KEYS, ...NUMMER_FILTER_KEYS];

  const LABEL_ZOOM_MIN   = 11;   // ab diesem Zoom erscheinen PLZ-Namen
  const LABEL_ZOOM_CLEAR = 12;   // ab hier etwas größer / kräftiger
  const LABEL_MAX_COUNT  = 140;  // Hard-Cap damit die Karte nicht überflutet wird

  const isNull = v => v == null || NULL_TOKENS.has(v);

  // ── Streuplan-Fallback (analog Mitbewerber-Fallback) ─────────────────
  const STREUPLAN_FALLBACK = {"termine":[{"datum":"2026-01-31","kw":6,"beschreibung":"16-Seiter A4"},{"datum":"2026-02-28","kw":10,"beschreibung":"32-Seiter A4"},{"datum":"2026-03-28","kw":14,"beschreibung":"32-Seiter A4"},{"datum":"2026-04-11","kw":16,"beschreibung":"16-Seiter A4"},{"datum":"2026-05-02","kw":19,"beschreibung":"24-Seiter A4"},{"datum":"2026-05-16","kw":21,"beschreibung":"16-Seiter A4"},{"datum":"2026-05-30","kw":23,"beschreibung":"24-Seiter A4"},{"datum":"2026-07-18","kw":30,"beschreibung":"8-Seiter A4"},{"datum":"2026-08-29","kw":36,"beschreibung":"16-Seiter A4"},{"datum":"2026-09-12","kw":38,"beschreibung":"16-Seiter A4"},{"datum":"2026-10-02","kw":41,"beschreibung":"40-Seiter A4"},{"datum":"2026-10-30","kw":45,"beschreibung":"24-Seiter A4"},{"datum":"2026-11-28","kw":49,"beschreibung":"32-Seiter A4"}],"partner":[{"haupt_nl":"Kiel-Suchsdorf","haupt_nl_id":571,"partner_nls":[{"id":853,"name":"Kiel-Ravensberg"},{"id":634,"name":"Schwentinental-Raisdorf"}]},{"haupt_nl":"Lübeck","haupt_nl_id":639,"partner_nls":[{"id":534,"name":"Lübeck-St. Jürgen"},{"id":864,"name":"Lübeck-Moisling"}]},{"haupt_nl":"Bremen","haupt_nl_id":647,"partner_nls":[{"id":553,"name":"Stuhr-Groß-Mackenstedt"},{"id":863,"name":"Bremen-Osterholz (Weserpark)"}]},{"haupt_nl":"Dortmund","haupt_nl_id":573,"partner_nls":[{"id":509,"name":"Dortmund-Aplerbeck"}]},{"haupt_nl":"Bochum Harpen","haupt_nl_id":519,"partner_nls":[{"id":648,"name":"Bochum-Hofstede"}]},{"haupt_nl":"Wuppertal-Barmen (Lichtscheid)","haupt_nl_id":868,"partner_nls":[{"id":617,"name":"Wuppertal"}]},{"haupt_nl":"Krefeld-Mevissenstraße","haupt_nl_id":633,"partner_nls":[{"id":541,"name":"Krefeld-Untergath"}]},{"haupt_nl":"Aachen","haupt_nl_id":586,"partner_nls":[{"id":613,"name":"Würselen"}]},{"haupt_nl":"Hamburg-Bergedorf","haupt_nl_id":620,"partner_nls":[{"id":619,"name":"Hamburg-Harburg"},{"id":851,"name":"Hamburg-Wandsbek"},{"id":595,"name":"Hamburg-Moorfleet"},{"id":663,"name":"Hamburg-Bramfeld"},{"id":858,"name":"Hamburg-Langenhorn"},{"id":664,"name":"Hamburg-Stellingen"},{"id":654,"name":"Hamburg-Lokstedt"},{"id":865,"name":"Hamburg-Lurup"},{"id":624,"name":"Barsbüttel"}]},{"haupt_nl":"Berlin-Charlottenburg","haupt_nl_id":812,"partner_nls":[{"id":643,"name":"Berlin-Kurfürstendamm"},{"id":840,"name":"Berlin Am Wittenbergplatz"},{"id":814,"name":"Berlin Am Hermannplatz"},{"id":597,"name":"Berlin-Schöneberg"},{"id":894,"name":"Berlin-Steglitz"},{"id":604,"name":"Berlin-Marienfelde"},{"id":866,"name":"Berlin-Treptow"},{"id":578,"name":"Berlin-Pankow"},{"id":656,"name":"Berlin-Wedding"},{"id":850,"name":"Berlin-Wittenau"},{"id":596,"name":"Berlin-Spandau Brunsbütteler Damm"},{"id":623,"name":"Berlin-Spandau"}]},{"haupt_nl":"Wildau","haupt_nl_id":605,"partner_nls":[{"id":565,"name":"Mahlow"},{"id":577,"name":"Birkenwerder"}]},{"haupt_nl":"Karlsruhe-Oststadt","haupt_nl_id":852,"partner_nls":[{"id":330,"name":"Karlsruhe-Südstadt"},{"id":525,"name":"Karlsruhe-Mühlburg"}]},{"haupt_nl":"Stuttgart","haupt_nl_id":871,"partner_nls":[{"id":631,"name":"Stuttgart-Untertürkheim"},{"id":626,"name":"Stuttgart-Möhringen"}]},{"haupt_nl":"Augsburg-Oberhausen","haupt_nl_id":862,"partner_nls":[{"id":515,"name":"Augsburg"},{"id":632,"name":"Augsburg-Lechhausen"},{"id":548,"name":"Gersthofen"}]},{"haupt_nl":"Kassel","haupt_nl_id":658,"partner_nls":[{"id":603,"name":"Fuldabrück"}]},{"haupt_nl":"Mainz-Mombach","haupt_nl_id":854,"partner_nls":[{"id":614,"name":"Mainz"}]},{"haupt_nl":"Mannheim","haupt_nl_id":655,"partner_nls":[{"id":583,"name":"Mannheim-Mallau"},{"id":557,"name":"Mannheim-Waldhof"},{"id":897,"name":"Mannheim-Columbus"}]},{"haupt_nl":"Dillingen","haupt_nl_id":585,"partner_nls":[{"id":622,"name":"Ensdorf"}]},{"haupt_nl":"Essen-Frillendorf","haupt_nl_id":539,"partner_nls":[{"id":505,"name":"Essen-Frohnhausen"}]},{"haupt_nl":"München","haupt_nl_id":520,"partner_nls":[{"id":870,"name":"München-Freimann"}]},{"haupt_nl":"Braunschweig","haupt_nl_id":607,"partner_nls":[{"id":630,"name":"Braunschweig-Stöckheim"}]}]};

  // HTML-Escape gegen XSS bei nutzergenerierten oder BW-Dimension-Inhalten
  const escapeHtml = (s) => {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const fmtNum = (x) => Math.round(Number(x || 0)).toLocaleString('de-DE');
  const fmtDec = (x) => Number(x || 0).toFixed(2);

  /**
   * Formatiert einen 15-stelligen Erhebungsnummer-Char aus BW.
   *
   * Zwei Varianten:
   *   "000000000000000"  → "0. Laufendes Jahr"
   *   "XXXXXNNSSSSEEEE"  → "N. SS.SS–EE.EE"
   *     XXXXX = Padding (ignoriert)
   *     NN    = lfd. Nummer (2-stellig, führende 0 entfernt)
   *     SSSS  = Start: DDMM
   *     EEEE  = Ende:  DDMM
   *
   * Beispiel: "00000120040305" → Stelle 5-6="01", 7-8="20", 9-10="04", 11-12="03", 13-14="05"
   *           → "1. 20.04–03.05"
   */
  function fmtNummer(raw) {
    if (raw == null) return '';
    const s = String(raw).replace(/\s/g, '');
    if (!s || /^0+$/.test(s)) return '0. Laufendes Jahr';
    // Von hinten lesen: letzte 8 Stellen = DDMMDDMM, davor 1+ Stellen = Nummer
    const meaningful = s.replace(/^0+/, '') || '0';  // führende Nullen weg
    if (meaningful.length < 9) return meaningful;     // unbekanntes Format
    const edMon = meaningful.slice(-2);
    const edDay = meaningful.slice(-4, -2);
    const sdMon = meaningful.slice(-6, -4);
    const sdDay = meaningful.slice(-8, -6);
    const nr    = meaningful.slice(0, -8);
    return `${nr}. ${sdDay}.${sdMon}–${edDay}.${edMon}`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Template (Styles + DOM)
  // ═══════════════════════════════════════════════════════════════════════
  const template = document.createElement('template');
  template.innerHTML = `
    <style>
      /* ─── Design Tokens ─────────────────────────────────────────── */
      :host {
        --red:          #b41821;
        --red-dark:     #8e1219;
        --red-light:    #d42030;
        --red-bg:       #fdf2f2;
        --red-bg-hover: #fce8e8;
        --red-border:   rgba(180,24,33,0.2);
        --red-shadow:   rgba(180,24,33,0.15);
        --white:        #ffffff;
        --gray-50:  #f8f9fa;  --gray-100: #f1f3f5;  --gray-200: #e9ecef;
        --gray-300: #dee2e6;  --gray-400: #ced4da;  --gray-500: #adb5bd;
        --gray-600: #6c757d;  --gray-700: #495057;  --gray-800: #343a40;  --gray-900: #212529;
        --shadow-xs: 0 1px 3px rgba(0,0,0,0.06);
        --shadow-sm: 0 2px 8px rgba(0,0,0,0.08);
        --shadow-md: 0 4px 16px rgba(0,0,0,0.10);
        --shadow-lg: 0 8px 32px rgba(0,0,0,0.12);
        --shadow-red: 0 4px 16px rgba(180,24,33,0.25);
        --radius-sm: 5px; --radius-md: 8px; --radius-lg: 12px; --radius-xl: 16px;
        --font: 'Segoe UI', system-ui, -apple-system, sans-serif;
        --ease-out:    cubic-bezier(0.16, 1, 0.3, 1);
        --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
        display: block; height: 100%; width: 100%; box-sizing: border-box;
        font-family: var(--font);
      }
      *, *::before, *::after { box-sizing: border-box; }

      /* ─── Layout ────────────────────────────────────────────────── */
      .layout { display: flex; height: 100%; width: 100%; background: var(--gray-50); }

      .filter-container {
        width: 30%; padding: 14px 12px;
        background: var(--white);
        display: flex; flex-direction: column; height: 100%;
        position: relative; z-index: 2;
        /* Weicher Schatten als Separator zur Karte — kein harter Border. */
        box-shadow: 4px 0 16px rgba(0,0,0,0.05), 1px 0 0 rgba(0,0,0,0.03);
      }
      .filter-container::before {
        content: ''; display: block; height: 3px;
        background: linear-gradient(90deg, var(--red), var(--red-light));
        margin: -14px -12px 12px;
      }
      .filter-container label {
        display: block; margin-top: 8px; font-size: 0.72rem; font-weight: 700;
        letter-spacing: 0.06em; text-transform: uppercase; color: var(--gray-500);
      }
      .filter-container select {
        width: 100%; margin-top: 4px; padding: 7px 10px; font-size: 0.85rem;
        font-family: var(--font);
        border: 1.5px solid var(--gray-200); border-radius: var(--radius-md);
        background: var(--gray-50); color: var(--gray-800);
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' fill='none'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236c757d' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
        background-repeat: no-repeat; background-position: right 10px center;
        cursor: pointer;
        transition: border-color 0.18s var(--ease-in-out),
                    box-shadow   0.18s var(--ease-in-out),
                    background   0.18s var(--ease-in-out);
        outline: none;
      }
      .filter-container select:hover:not(:disabled) { border-color: var(--red-border); background-color: var(--white); }
      .filter-container select:focus    { border-color: var(--red); box-shadow: 0 0 0 3px var(--red-shadow); background-color: var(--white); }
      .filter-container select:disabled { opacity: 0.45; cursor: not-allowed; }

      #filter-button {
        width: 100%; margin-top: 10px; padding: 9px 16px; font-size: 0.87rem;
        font-family: var(--font); font-weight: 600; color: var(--white);
        background: var(--gray-300); border: none; border-radius: var(--radius-md);
        cursor: not-allowed; position: relative; overflow: hidden;
        transition: background 0.22s var(--ease-in-out), transform 0.12s, box-shadow 0.18s;
        opacity: 0.6;
      }
      #filter-button.ready { background: var(--red); cursor: pointer; opacity: 1; }
      #filter-button.ready::after {
        content: ''; position: absolute; inset: 0;
        background: linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 100%);
        pointer-events: none;
      }
      #filter-button.ready:hover  { background: var(--red-light); box-shadow: var(--shadow-red); transform: translateY(-1px); }
      #filter-button.ready:active { transform: translateY(0); box-shadow: none; }

      /* (info-toggle-btn-Styles wurden mit dem Sidebar-Refactor entfernt —
         Erhebungsübersicht ist jetzt ein Sidebar-Icon.) */

      /* ─── Tabelle ───────────────────────────────────────────────── */
      /* Hinweis: die alte .table-container-Hülle ist mit dem Sidebar-Refactor
         entfallen. Die Styles wurden in .sidebar-view bzw. #table-container
         migriert; hier bleibt ein schlanker Block für rein tabellen-spezifische
         Selektoren (th/td/tbody-Hover etc.). */
      .table-wrapper {
        flex: 1; display: flex; flex-direction: column; min-height: 0;
        overflow: hidden;
        background: var(--white); border-radius: var(--radius-lg);
        border: 1px solid var(--gray-200); box-shadow: var(--shadow-xs);
      }
      .table-scroll {
        flex: 1; overflow-y: auto; min-height: 0;
        scrollbar-width: thin; scrollbar-color: var(--red) var(--gray-100);
      }
      .table-scroll::-webkit-scrollbar       { width: 5px; }
      .table-scroll::-webkit-scrollbar-track { background: var(--gray-100); }
      .table-scroll::-webkit-scrollbar-thumb { background: var(--red); border-radius: 10px; }
      .table-wrapper table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      .table-wrapper thead { position: sticky; top: 0; z-index: 2; }
      .table-wrapper th {
        background: var(--red); color: var(--white); padding: 8px 10px;
        text-align: left; font-size: 0.72rem; font-weight: 700;
        letter-spacing: 0.05em; text-transform: uppercase; white-space: pre-line;
        cursor: pointer; user-select: none; transition: background 0.15s;
      }
      .table-wrapper th:hover { background: var(--red-dark); }
      .table-wrapper th .sort-icon {
        font-size: 10px;
        display: inline-block;
        margin-left: 0;
        opacity: 0;
        transition: opacity 0.18s ease, transform 0.22s var(--ease-out);
      }
      .table-wrapper th .sort-icon.sort-icon-active {
        opacity: 1;
        margin-left: 4px;
        text-shadow: 0 0 4px rgba(255,255,255,0.6);
      }
      .table-wrapper td {
        padding: 6px 10px; border-bottom: 1px solid var(--gray-100);
        text-align: left; font-size: 0.8rem; color: var(--gray-700);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        transition: background 0.12s;
      }
      .table-wrapper tbody tr        {
        transition: background 0.22s var(--ease-out);
        cursor: pointer;
        position: relative;
      }
      .table-wrapper tbody tr:hover td { background: var(--red-bg); color: var(--gray-900); }
      /* Selected: Slide-In-Border + kurzer Background-Pulse beim ersten Klick.
         Wir nutzen ein ::before-Pseudo-Element auf der ersten Zelle, weil
         <tr> selbst keine zuverlässigen Pseudo-Elemente erlaubt (rendering quirks). */
      .table-row-selected td {
        background: #fff3f3 !important;
        transition: background 0.32s var(--ease-out);
      }
      .table-row-selected td:first-child {
        position: relative;
        border-left: 3px solid var(--red) !important;
        /* Animation: Border-Slide + Background-Pulse */
        animation: tableRowEnter 0.5s var(--ease-out) both;
      }
      @keyframes tableRowEnter {
        0%   { background-color: var(--red-bg); box-shadow: inset 6px 0 0 0 var(--red); }
        50%  { background-color: #ffe5e7; }
        100% { background-color: #fff3f3; box-shadow: inset 3px 0 0 0 var(--red); }
      }

      #streuverlust-box {
        flex-shrink: 0; background: var(--red-bg); border-top: 2px solid var(--red);
        padding: 8px 12px; font-size: 0.8rem; color: var(--gray-700);
        display: flex; justify-content: space-between; align-items: center; gap: 8px;
      }
      #streuverlust-box strong { color: var(--red); }

      /* ─── Sidebar-Layout (Phase 2) ─────────────────────────────────── */
      /* Layout-Konzept:
         filter-container = ganze linke Spalte (Filter + Inhalt + Tab-Leiste).
         sidebar-layout   = flex-column: Inhalts-Container oben, Tab-Bar unten.
         Bei "nichts aktiv" (kein Tab selektiert) kollabiert der Inhalts-Container
         vertikal auf 0 — Tab-Leiste bleibt sichtbar, Filter bleibt sichtbar. */
      .sidebar-layout {
        flex: 1; min-height: 0; margin-top: 10px;
        display: flex; flex-direction: column; gap: 8px;
        overflow: hidden;
      }
      .sidebar-content {
        flex: 1; min-height: 0;
        overflow: hidden;
        position: relative;        /* Container für absolute-positionierte Views */
        transition: flex-basis 0.32s var(--ease-out), opacity 0.22s ease;
      }
      /* Alle Views liegen übereinander (position absolute) — der aktive ist
         opacity 1, alle anderen opacity 0 + pointer-events: none. Damit gibt
         es einen echten Crossfade beim View-Wechsel statt eines abrupten
         display:none-Tausches. */
      .sidebar-view {
        position: absolute;
        inset: 0;
        display: flex;             /* Statt none — alle Views sind layoutet */
        flex-direction: column; min-height: 0;
        opacity: 0;
        transform: translateY(8px) scale(0.995);
        pointer-events: none;
        visibility: hidden;
        transition: opacity 0.24s var(--ease-out),
                    transform 0.32s var(--ease-out),
                    visibility 0s 0.32s;
      }
      .sidebar-view.active {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
        visibility: visible;
        z-index: 2;
        /* Beim Aktivieren: visibility sofort sichtbar (delay 0), nicht erst nach Transition */
        transition: opacity 0.28s var(--ease-out) 0.05s,
                    transform 0.36s var(--ease-out) 0.05s,
                    visibility 0s 0s;
      }

      /* Tab-Bar am unteren Rand: jeder Tab hat Icon + Label untereinander.
         Der aktive Tab bekommt einen animierten roten Strich am unteren Rand. */
      .sidebar-rail {
        flex-shrink: 0;
        display: flex; flex-direction: row; gap: 4px;
        padding-top: 6px;
        border-top: 1px solid var(--gray-200);
      }
      .sidebar-icon {
        position: relative;
        flex: 1; min-width: 0;
        padding: 6px 2px;
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; gap: 1px;
        background: transparent; border: 1.5px solid var(--gray-200);
        border-radius: var(--radius-md);
        cursor: pointer; user-select: none;
        font-family: var(--font);
        transition: background 0.22s var(--ease-out),
                    border-color 0.22s var(--ease-out),
                    color 0.22s var(--ease-out),
                    transform 0.18s var(--ease-out);
        overflow: hidden;
      }
      /* Animierter Indikator-Strich am unteren Rand des aktiven Tabs.
         Wir nutzen ein ::after-Pseudo statt box-shadow inset, damit der
         Strich smooth animieren kann (scaleX). */
      .sidebar-icon::after {
        content: '';
        position: absolute; left: 8%; right: 8%; bottom: -1px;
        height: 3px;
        background: var(--red); border-radius: 3px 3px 0 0;
        transform: scaleX(0);
        transform-origin: center;
        transition: transform 0.32s var(--ease-out);
        pointer-events: none;
      }
      .sidebar-icon.active::after { transform: scaleX(1); }
      .sidebar-icon:hover:not(:disabled):not(.active) {
        background: var(--gray-50); border-color: var(--red-border);
        transform: translateY(-1px);
      }
      .sidebar-icon:disabled {
        opacity: 0.4; cursor: not-allowed;
        background: var(--gray-50); border-color: var(--gray-100);
      }
      .sidebar-icon.active {
        background: linear-gradient(180deg, var(--red-bg) 0%, var(--white) 100%);
        border-color: var(--red);
        box-shadow: 0 1px 3px rgba(180,24,33,0.12);
        color: var(--red);
      }
      /* Pulse-Hint für gerade aktivierte Tabs (nach loadErhebung) —
         läuft 2 Pulses lang, dann aus. Klasse wird via JS gesetzt. */
      .sidebar-icon.just-enabled {
        animation: sidebarTabHint 1.6s ease-out 0s 2 both;
      }
      @keyframes sidebarTabHint {
        0%, 100% { box-shadow: 0 0 0 0 rgba(180,24,33,0); border-color: var(--gray-200); }
        50%      { box-shadow: 0 0 0 6px rgba(180,24,33,0); border-color: var(--red-border); }
      }
      .sidebar-icon-glyph { font-size: 1.05rem; line-height: 1; transition: transform 0.18s var(--ease-out); }
      .sidebar-icon.active .sidebar-icon-glyph { transform: scale(1.06); }
      .sidebar-icon-label {
        font-size: 0.6rem; font-weight: 600; line-height: 1.1;
        color: var(--gray-600); letter-spacing: 0.02em;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        max-width: 100%;
        transition: color 0.22s var(--ease-out);
      }
      .sidebar-icon.active .sidebar-icon-label { color: var(--red); }
      .sidebar-icon:disabled .sidebar-icon-label { color: var(--gray-400); }
      /* Badge: erscheint mit scale(0→1) + opacity, statt instant pop */
      .sidebar-icon-badge:empty { display: none; }
      .sidebar-icon-badge {
        position: absolute; top: -4px; right: -4px;
        min-width: 16px; height: 16px;
        padding: 0 4px;
        background: var(--red); color: white;
        font-size: 0.6rem; font-weight: 700;
        border: 1.5px solid white; border-radius: 10px;
        display: inline-flex; align-items: center; justify-content: center;
        line-height: 1;
        animation: badgePop 0.4s var(--ease-out) both;
      }
      @keyframes badgePop {
        0%   { transform: scale(0) rotate(-12deg); opacity: 0; }
        60%  { transform: scale(1.12) rotate(2deg); opacity: 1; }
        100% { transform: scale(1) rotate(0); opacity: 1; }
      }
      .sidebar-icon-badge.badge-hint {
        background: var(--gray-200); color: var(--gray-700);
      }

      /* ─── Skeleton-Loading (Phase 2, Bug #4) ───────────────────────────
         Während Daten laden, zeigen wir animierte Platzhalter statt leere
         Container — fühlt sich "lebendiger" an als ein nackter Spinner. */
      @keyframes skeletonShimmer {
        0%   { background-position: -200% 0; }
        100% { background-position:  200% 0; }
      }
      .skeleton-shimmer {
        background: linear-gradient(90deg,
          rgba(0,0,0,0.04) 0%,
          rgba(0,0,0,0.08) 50%,
          rgba(0,0,0,0.04) 100%);
        background-size: 200% 100%;
        animation: skeletonShimmer 1.4s ease-in-out infinite;
        border-radius: var(--radius-sm);
      }
      .skeleton-table {
        display: flex; flex-direction: column;
        padding: 12px;
      }
      .skeleton-table-row {
        display: flex; gap: 8px; padding: 8px 0;
        border-bottom: 1px solid var(--gray-100);
      }
      .skeleton-table-row:last-child { border-bottom: none; }
      .skeleton-table-row > div {
        height: 12px;
      }
      .skeleton-table-row > div:nth-child(1) { flex: 0 0 28%; }
      .skeleton-table-row > div:nth-child(2) { flex: 0 0 22%; }
      .skeleton-table-row > div:nth-child(3) { flex: 0 0 22%; }
      .skeleton-table-row > div:nth-child(4) { flex: 1; }

      .skeleton-map-overlay {
        position: absolute; inset: 0;
        z-index: 400;
        pointer-events: none;
        background: rgba(248,249,250,0.45);
        backdrop-filter: blur(1px);
        display: flex; align-items: center; justify-content: center;
        opacity: 0;
        transition: opacity 0.22s ease;
      }
      .skeleton-map-overlay.active { opacity: 1; }
      .skeleton-map-pulse {
        width: 64px; height: 64px;
        border-radius: 50%;
        background: var(--red);
        opacity: 0.18;
        animation: mapPulse 1.6s ease-out infinite;
      }
      @keyframes mapPulse {
        0%   { transform: scale(0.6); opacity: 0.18; }
        70%  { transform: scale(2.2); opacity: 0; }
        100% { transform: scale(2.2); opacity: 0; }
      }

      /* Map-Sweep-Overlay: wandernder horizontaler Gradient-Streifen, der
         beim ersten Daten-Load über die Karte zieht. Filmischer Reveal-Effekt. */
      .map-sweep-overlay {
        position: absolute; inset: 0;
        z-index: 380;
        pointer-events: none;
        overflow: hidden;
      }
      .map-sweep-overlay::before {
        content: '';
        position: absolute;
        top: -50%; bottom: -50%;
        left: -30%;
        width: 60%;
        background: linear-gradient(90deg,
          rgba(180,24,33,0) 0%,
          rgba(180,24,33,0.10) 20%,
          rgba(212,32,48,0.18) 50%,
          rgba(180,24,33,0.10) 80%,
          rgba(180,24,33,0) 100%);
        transform: skewX(-12deg);
        animation: mapSweep 1.1s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      }
      @keyframes mapSweep {
        0%   { left: -30%; opacity: 0; }
        15%  { opacity: 1; }
        85%  { opacity: 1; }
        100% { left: 130%; opacity: 0; }
      }

      /* Heatmap-Transition-Overlay: weißer Schleier der beim Modus-Wechsel
         (WK → Umsatz etc.) kurz über die Karte fadet, um den abrupten
         Farb-Tausch der PLZ-Flächen zu kaschieren. Canvas-Renderer hat
         keine native CSS-Color-Transition, also fingieren wir es. */
      #map-mode-fade {
        position: absolute; inset: 0;
        z-index: 350;
        background: rgba(255,255,255,0);
        pointer-events: none;
        transition: background 0.18s ease-out;
      }
      #map-mode-fade.fade-active { background: rgba(255,255,255,0.55); }

      /* ─── Linke Spalte komplett ausgeblendet (Pane-Hide-Modus) ──────────
         Wird durch Klick auf das "👁 Ausblenden"-Tab aktiviert. Filter-Spalte
         schrumpft auf 0, Karte wird Vollbild. Reopen via #left-pane-reopen-btn. */
      .filter-container.pane-collapsed {
        width: 0 !important;
        padding-left: 0; padding-right: 0;
        border-right: none;
        overflow: hidden;
        box-shadow: none;
      }
      .filter-container.pane-collapsed > * {
        opacity: 0; pointer-events: none;
      }
      .filter-container {
        transition: width 0.32s var(--ease-out), padding 0.32s var(--ease-out);
      }
      .filter-container > * {
        transition: opacity 0.22s ease;
      }

      /* Reopen-Button auf der Karte: nur sichtbar wenn die Spalte ausgeblendet
         ist. Hamburger-Menü-Icon (3 waagrechte Striche) — Standard-Pattern
         für "Menü öffnen". Position + Größe wie beim vorigen Pfeil. */
      #left-pane-reopen-btn {
        position: absolute;
        top: 24px;
        left: 12px;
        z-index: 600;
        display: none;
        width: 52px; height: 52px;
        padding: 0;
        background: linear-gradient(135deg, var(--red) 0%, var(--red-light) 100%);
        border: none;
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-red);
        cursor: pointer;
        align-items: center; justify-content: center;
        color: white;
        transition: background 0.18s var(--ease-out),
                    transform 0.18s var(--ease-out),
                    box-shadow 0.18s var(--ease-out);
      }
      #left-pane-reopen-btn:hover {
        transform: scale(1.06);
        box-shadow: 0 8px 24px rgba(180,24,33,0.35);
      }
      #left-pane-reopen-btn:active {
        transform: scale(0.98);
      }
      /* Hamburger-Striche: 3 horizontale Balken, mittig im Button.
         Gebaut via Pseudo-Elemente + Box-Shadow, damit kein extra DOM nötig. */
      .reopen-hamburger {
        position: relative;
        display: block;
        width: 22px; height: 2.5px;
        background: white;
        border-radius: 2px;
        box-shadow:
          0 -7px 0 0 white,
          0  7px 0 0 white;
      }
      .map-container.left-pane-hidden #left-pane-reopen-btn {
        display: inline-flex;
        animation: reopenSlideIn 0.42s var(--ease-out) both,
                   reopenPulse 1.6s ease-out 0.5s 3 both;
      }
      @keyframes reopenSlideIn {
        from { opacity: 0; transform: translateX(-30px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      @keyframes reopenPulse {
        0%, 100% { box-shadow: var(--shadow-red); }
        50%      { box-shadow: 0 0 0 12px rgba(180,24,33,0); }
      }

      /* ─── Filter-Maske einklappbar ─────────────────────────────────────
         Sub-State innerhalb der linken Spalte: Filter-Felder werden versteckt,
         oben erscheint stattdessen ein kompakter Info-Bar mit der aktuellen
         Auswahl. Hauptinhalt (PLZ-Tabelle etc) nimmt dadurch mehr Höhe ein. */
      .filter-fields {
        display: flex; flex-direction: column;
        transition: max-height 0.32s var(--ease-out), opacity 0.22s ease,
                    margin 0.22s ease, visibility 0s 0s;
        max-height: 600px;
        overflow: hidden;
      }
      .filter-container.fields-collapsed .filter-fields {
        max-height: 0; opacity: 0; margin: 0;
        pointer-events: none;
        /* visibility: hidden mit Delay, damit die Transition noch sichtbar
           durchlaufen kann bevor wir den Tab-Fokus entziehen. */
        visibility: hidden;
        transition: max-height 0.32s var(--ease-out), opacity 0.22s ease,
                    margin 0.22s ease, visibility 0s 0.32s;
      }
      .filter-button-row {
        display: flex; gap: 6px; align-items: stretch;
        margin-top: 10px;   /* gleicher Top-Margin wie filter-button vorher */
      }
      .filter-button-row #filter-button {
        flex: 1;
        margin-top: 0;      /* Margin ist jetzt auf der .filter-button-row */
      }
      #filter-fields-toggle {
        flex-shrink: 0;
        padding: 9px 12px;
        font-family: var(--font); font-size: 0.8rem; font-weight: 600;
        color: var(--white);
        background: linear-gradient(135deg, var(--gray-700) 0%, var(--gray-800) 100%);
        border: none; border-radius: var(--radius-md);
        cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center; gap: 5px;
        line-height: 1;
        position: relative; overflow: hidden;
        box-shadow: 0 2px 6px rgba(0,0,0,0.18);
        transition: background 0.22s var(--ease-in-out),
                    transform 0.12s, box-shadow 0.18s;
      }
      #filter-fields-toggle::after {
        content: ''; position: absolute; inset: 0;
        background: linear-gradient(180deg, rgba(255,255,255,0.10) 0%, transparent 100%);
        pointer-events: none;
      }
      #filter-fields-toggle:hover {
        background: linear-gradient(135deg, var(--gray-800) 0%, var(--gray-900) 100%);
        box-shadow: 0 3px 10px rgba(0,0,0,0.25);
        transform: translateY(-1px);
      }
      #filter-fields-toggle:active {
        transform: translateY(0); box-shadow: none;
      }
      #filter-fields-toggle.disabled { display: none; }
      /* Kurze Attention-Animation wenn der Button erstmalig sichtbar wird */
      #filter-fields-toggle.just-visible {
        animation: toggleButtonHint 0.9s ease-out 0.3s 2 both;
      }
      @keyframes toggleButtonHint {
        0%, 100% { box-shadow: 0 2px 6px rgba(0,0,0,0.18); }
        50%       { box-shadow: 0 0 0 4px rgba(73,80,87,0.25), 0 2px 6px rgba(0,0,0,0.18); }
      }

      /* Info-Bar oben in der Spalte: kompakte Anzeige der aktuellen Auswahl,
         sichtbar nur wenn Filter eingeklappt sind. Erscheint mit Crossfade
         und leichtem Slide-down. */
      #filter-info-bar {
        display: flex; align-items: center; gap: 8px;
        margin-bottom: 6px;
        padding: 9px 11px;
        background: linear-gradient(135deg, var(--red) 0%, var(--red-light) 100%);
        color: white;
        border-radius: var(--radius-md);
        font-size: 0.78rem; font-weight: 600;
        box-shadow: 0 1px 4px rgba(180,24,33,0.18);
        opacity: 1; max-height: 60px;
        transform: translateY(0);
        transition: opacity 0.24s var(--ease-out) 0.10s,
                    max-height 0.30s var(--ease-out),
                    transform 0.28s var(--ease-out) 0.10s,
                    margin 0.24s ease,
                    padding 0.24s ease;
        overflow: hidden;
      }
      #filter-info-bar.hidden {
        opacity: 0; max-height: 0;
        margin-bottom: 0; padding-top: 0; padding-bottom: 0;
        transform: translateY(-6px);
        pointer-events: none;
        /* Beim Ausblenden direkt fade ohne Delay */
        transition: opacity 0.18s ease,
                    max-height 0.28s var(--ease-out),
                    transform 0.20s ease,
                    margin 0.24s ease,
                    padding 0.24s ease;
      }
      .filter-info-icon { font-size: 0.95rem; line-height: 1; flex-shrink: 0; }
      .filter-info-text {
        flex: 1; min-width: 0;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        letter-spacing: 0.02em;
      }
      .filter-info-badge {
        flex-shrink: 0;
        background: rgba(255,255,255,0.22);
        font-size: 0.66rem; font-weight: 700;
        padding: 2px 7px; border-radius: 10px;
        letter-spacing: 0.04em;
        animation: badgePop 0.4s var(--ease-out) both;
      }
      .filter-info-badge:empty { display: none; animation: none; }
      #filter-info-expand {
        flex-shrink: 0;
        background: rgba(255,255,255,0.2);
        border: 1.5px solid rgba(255,255,255,0.4);
        border-radius: var(--radius-md);
        color: white;
        cursor: pointer;
        padding: 4px 9px;
        font-size: 0.72rem; font-weight: 700;
        font-family: var(--font);
        line-height: 1;
        white-space: nowrap;
        display: inline-flex; align-items: center; gap: 4px;
        transition: background 0.18s, transform 0.18s var(--ease-out);
      }
      #filter-info-expand:hover {
        background: rgba(255,255,255,0.32);
        transform: translateY(-1px);
      }

      /* Filter-Toggle-Button (▴ in der Filter-Maske): rotiert je nach State */
      #filter-fields-toggle .filter-toggle-arrow {
        display: inline-block;
        font-size: 0.95rem;
        line-height: 1;
        transition: transform 0.28s var(--ease-out);
      }
      .filter-container.fields-collapsed #filter-fields-toggle .filter-toggle-arrow {
        transform: rotate(180deg);
      }

      /* Spezial-Tab "Ausblenden": Pfeil ◀, kein roter Active-State weil es
         kein View ist sondern eine direkte Aktion. Etwas auffälliger als
         disabled-Tabs damit der User den Pfeil als klickbar erkennt. */
      .sidebar-icon-hide {
        color: var(--gray-600);
      }
      .sidebar-icon-hide .sidebar-icon-glyph {
        opacity: 0.7;
        font-size: 0.9rem;
        transition: opacity 0.22s var(--ease-out), transform 0.22s var(--ease-out);
      }
      .sidebar-icon-hide:hover:not(:disabled) .sidebar-icon-glyph {
        opacity: 1; transform: translateX(-3px);
      }
      /* Indikator-Strich am unteren Rand soll bei Hide-Tab nie erscheinen */
      .sidebar-icon-hide::after { display: none; }

      /* ─── NL-Info-Container (jetzt statisch in eigenem View) ──────── */
      #nl-info-container {
        flex: 1; min-height: 0;
        background: var(--white); border: 1px solid var(--gray-200);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-xs);
        display: flex; flex-direction: column; overflow: hidden;
      }
      .nl-info-scroll {
        flex: 1; min-height: 0; overflow-y: auto;
        scrollbar-width: thin; scrollbar-color: var(--red) var(--gray-100);
      }
      .nl-info-scroll::-webkit-scrollbar       { width: 5px; }
      .nl-info-scroll::-webkit-scrollbar-thumb { background: var(--red); border-radius: 10px; }
      .nl-info-table { width: 100%; border-collapse: collapse; table-layout: auto; font-size: 0.78rem; }
      .nl-info-table th {
        background: var(--red); color: white; padding: 6px 8px;
        position: sticky; top: 0; z-index: 2;
        white-space: normal; word-break: break-word; text-align: center;
        border-right: 1px solid rgba(255,255,255,0.2);
        font-size: 0.7rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
        line-height: 1.3;
      }
      .nl-info-table td {
        padding: 6px 8px; border-bottom: 1px solid var(--gray-100);
        font-size: 0.78rem; white-space: nowrap; color: var(--gray-700);
        transition: background 0.12s;
      }
      .nl-info-row { cursor: pointer; transition: background 0.12s; }
      .nl-info-row:hover td { background: var(--red-bg); }
      .nl-info-row.table-row-selected td             { background: #fff3f3; }
      .nl-info-row.table-row-selected td:first-child { border-left: 3px solid var(--red); }

      /* Datenqualitäts-Indikator: NL mit pct_erfassung > 100% (= Umsatz ohne
         gültige PLZ-Zuordnung). Wir markieren nur den auffälligen Prozentwert
         und nicht die ganze Zeile — der Rest der Daten ist ja valide. */
      .nl-info-row td.nl-pct-invalid {
        color: var(--red);
        font-weight: 700;
      }
      .nl-pct-warn {
        display: inline-block;
        font-size: 0.85em;
        line-height: 1;
        vertical-align: middle;
        cursor: help;
        /* Subtiler Pulse, um das Auge auf die Auffälligkeit zu lenken — nicht
           penetrant, einmaliger sanfter Hinweis pro Render. */
        animation: nlInvalidPulse 1.6s ease-out 2;
      }
      @keyframes nlInvalidPulse {
        0%, 100% { transform: scale(1); }
        50%      { transform: scale(1.18); }
      }

      /* GF-Gruppen-Header in NL-Tabelle (Multi-Modus) */
      .nl-gf-group-header td {
        background: linear-gradient(to right, var(--red-bg) 0%, transparent 100%);
        padding: 8px 12px;
        font-size: 0.7rem; font-weight: 700;
        letter-spacing: 0.04em; text-transform: uppercase;
        color: var(--gray-700);
        border-bottom: 1.5px solid var(--red);
        border-top: 1px solid var(--gray-200);
        cursor: default;
      }
      .nl-gf-group-header:first-child td { border-top: none; }
      .nl-gf-group-header:hover td { background: linear-gradient(to right, var(--red-bg) 0%, transparent 100%); }
      .nl-gf-group-icon { display: inline-block; margin-right: 6px; color: var(--red); font-size: 0.85rem; }
      .nl-gf-group-name { color: var(--gray-800); font-weight: 700; }
      .nl-gf-group-count {
        float: right;
        font-size: 0.62rem; font-weight: 600;
        background: white; color: var(--red);
        padding: 1px 7px; border-radius: 10px;
        border: 1px solid var(--red-border);
        text-transform: none; letter-spacing: 0;
        margin-top: 1px;
      }
      /* (nl-info-active CSS-Translation entfernt — NL-Tabelle ist jetzt
         eigener Sidebar-View, kein Overlay über der PLZ-Tabelle mehr) */

      /* ─── Partner-Erhebung-Picker (Phase 1) ───────────────────────── */
      #partner-erh-picker {
        flex-shrink: 0;
        border-bottom: 1px solid var(--gray-200);
        background: var(--gray-50);
        overflow: hidden;
      }
      #partner-erh-picker-header {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 12px;
        cursor: pointer; user-select: none;
        transition: background 0.15s;
      }
      #partner-erh-picker-header:hover { background: var(--gray-100); }
      .partner-picker-icon { font-size: 0.95rem; line-height: 1; flex-shrink: 0; }
      .partner-picker-title-block {
        display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0;
      }
      .partner-picker-label {
        font-size: 0.72rem; font-weight: 700; color: var(--gray-700);
        letter-spacing: 0.04em; text-transform: uppercase;
      }
      .partner-picker-subtitle {
        font-size: 0.67rem; color: var(--gray-500); font-weight: 400;
      }
      .partner-picker-count {
        font-size: 0.66rem; font-weight: 700; color: var(--red);
        background: var(--red-bg); border: 1px solid var(--red-border);
        padding: 2px 7px; border-radius: 8px;
        white-space: nowrap; flex-shrink: 0;
      }
      .partner-picker-chevron {
        font-size: 0.8rem; color: var(--gray-500); flex-shrink: 0;
        transition: transform 0.28s var(--ease-out);
        transform: rotate(180deg); line-height: 1;
      }
      #partner-erh-picker.collapsed .partner-picker-chevron { transform: rotate(0deg); }
      #partner-erh-picker-body {
        max-height: 240px;
        overflow-y: auto; overflow-x: hidden;
        transition: max-height 0.32s var(--ease-out),
                    border-top-color 0.2s ease, opacity 0.2s ease;
        border-top: 1px solid var(--gray-200);
        scrollbar-width: thin; scrollbar-color: var(--red) var(--gray-100);
      }
      #partner-erh-picker-body::-webkit-scrollbar       { width: 5px; }
      #partner-erh-picker-body::-webkit-scrollbar-thumb { background: var(--red); border-radius: 10px; }
      #partner-erh-picker.collapsed #partner-erh-picker-body {
        max-height: 0; border-top-color: transparent; opacity: 0;
      }
      .partner-erh-row {
        display: flex; align-items: center; gap: 8px;
        padding: 7px 12px;
        cursor: pointer; user-select: none;
        border-bottom: 1px solid var(--gray-100);
        border-left: 3px solid transparent;   /* Platz für Pending-Indicator */
        padding-left: 9px;
        transition: background 0.22s var(--ease-out),
                    border-left-color 0.32s var(--ease-out),
                    padding-left 0.22s var(--ease-out);
      }
      .partner-erh-row:last-child { border-bottom: none; }
      .partner-erh-row:hover { background: var(--red-bg); }
      .partner-erh-row.is-base {
        cursor: not-allowed; opacity: 0.8;
        background: linear-gradient(to right, var(--red-bg) 0%, transparent 100%);
      }
      .partner-erh-row.is-base:hover { background: linear-gradient(to right, var(--red-bg) 0%, transparent 100%); }
      .partner-erh-checkbox {
        width: 16px; height: 16px;
        border: 1.5px solid var(--gray-400);
        border-radius: 3px;
        flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        background: var(--white);
        transition: background 0.28s var(--ease-out),
                    border-color 0.28s var(--ease-out),
                    border-style 0.18s ease;
      }
      .partner-erh-row.checked .partner-erh-checkbox {
        background: var(--red); border-color: var(--red);
      }
      .partner-erh-row.checked .partner-erh-checkbox::after {
        content: '✓'; color: white; font-size: 0.7rem; font-weight: 700; line-height: 1;
        animation: checkboxPop 0.32s var(--ease-out) both;
      }
      @keyframes checkboxPop {
        0%   { transform: scale(0); opacity: 0; }
        70%  { transform: scale(1.2); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }
      .partner-erh-row.is-base .partner-erh-checkbox {
        background: var(--red); border-color: var(--red);
      }
      .partner-erh-row.is-base .partner-erh-checkbox::after {
        content: '★'; color: white; font-size: 0.6rem; line-height: 1;
      }
      .partner-erh-name {
        flex: 1; font-size: 0.78rem; color: var(--gray-700);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        transition: color 0.22s var(--ease-out);
      }
      .partner-erh-row.is-base .partner-erh-name { font-weight: 700; }
      .partner-erh-badge {
        font-size: 0.62rem; color: var(--gray-500);
        background: var(--gray-100); padding: 2px 6px;
        border-radius: 10px; flex-shrink: 0;
        transition: background 0.32s var(--ease-out), color 0.32s var(--ease-out);
      }
      .partner-erh-row.checked .partner-erh-badge {
        color: var(--red); background: var(--red-bg);
      }
      #partner-erh-empty {
        padding: 14px 12px; font-size: 0.74rem; color: var(--gray-500);
        text-align: center; font-style: italic;
      }

      /* Pending-State: Partner-Zeile mit ausstehender Änderung. Wird durch
         einen orangenen linken Streifen und ein anderes Badge markiert.
         Border-Color transitionet von transparent → orange (siehe partner-erh-row). */
      .partner-erh-row.pending {
        border-left-color: #f0a500;
        background: rgba(240,165,0,0.04);
      }
      .partner-erh-row.pending-add .partner-erh-checkbox {
        background: rgba(240,165,0,0.18);
        border-color: #f0a500;
        border-style: dashed;
      }
      .partner-erh-row.pending-add .partner-erh-checkbox::after {
        content: '+'; color: #f0a500; font-weight: 700; font-size: 0.85rem; line-height: 1;
      }
      .partner-erh-row.pending-remove .partner-erh-checkbox {
        background: rgba(240,165,0,0.18);
        border-color: #f0a500;
        border-style: dashed;
      }
      .partner-erh-row.pending-remove .partner-erh-checkbox::after {
        content: '−'; color: #f0a500; font-weight: 700; font-size: 0.95rem; line-height: 1;
      }
      .partner-erh-row.pending .partner-erh-badge {
        background: rgba(240,165,0,0.18);
        color: #b56e00;
        font-weight: 600;
      }

      /* Bestätigungsbutton-Leiste — slidet von unten herein wenn Änderungen
         entstehen, statt abrupt zu erscheinen. */
      #partner-erh-actions {
        display: flex; flex-direction: column; gap: 8px;
        padding: 10px 12px;
        background: linear-gradient(180deg, rgba(240,165,0,0.08) 0%, var(--white) 100%);
        border-top: 1px solid rgba(240,165,0,0.4);
        animation: partnerActionSlideIn 0.36s var(--ease-out) both;
      }
      @keyframes partnerActionSlideIn {
        from { opacity: 0; transform: translateY(12px); max-height: 0; padding-top: 0; padding-bottom: 0; }
        to   { opacity: 1; transform: translateY(0); max-height: 120px; }
      }
      .partner-actions-info {
        display: flex; align-items: center; gap: 6px;
        font-size: 0.72rem; color: var(--gray-700);
      }
      .partner-actions-icon {
        color: #f0a500; font-size: 0.6rem; line-height: 1;
        animation: pendingDot 1.4s ease-in-out infinite;
      }
      @keyframes pendingDot {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%      { opacity: 0.4; transform: scale(0.75); }
      }
      .partner-actions-text { font-weight: 600; }
      /* Number-Animation: wenn sich die +N/−N-Zahl ändert, kurzes Scale-Pop */
      .partner-actions-text.bump {
        animation: numberBump 0.32s var(--ease-out) both;
      }
      @keyframes numberBump {
        0%   { transform: scale(1); }
        40%  { transform: scale(1.18); color: var(--red); }
        100% { transform: scale(1); }
      }
      .partner-actions-buttons {
        display: flex; gap: 6px;
      }
      .partner-action-cancel,
      .partner-action-apply {
        flex: 1;
        padding: 7px 10px;
        font-size: 0.74rem; font-family: var(--font); font-weight: 600;
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: background 0.18s var(--ease-out),
                    border-color 0.18s var(--ease-out),
                    box-shadow 0.18s var(--ease-out),
                    transform 0.15s var(--ease-out);
      }
      .partner-action-cancel:hover { transform: translateY(-1px); }
      .partner-action-apply:hover  { transform: translateY(-1px); }
      .partner-action-cancel:active,
      .partner-action-apply:active { transform: scale(0.97); }
      .partner-action-cancel {
        background: var(--white); color: var(--gray-600);
        border: 1.5px solid var(--gray-200);
      }
      .partner-action-cancel:hover {
        background: var(--gray-50); border-color: var(--gray-400);
      }
      .partner-action-apply {
        background: var(--red); color: white;
        border: 1.5px solid var(--red);
        box-shadow: 0 1px 3px rgba(180,24,33,0.18);
      }
      .partner-action-apply:hover {
        background: var(--red-dark); border-color: var(--red-dark);
      }

      /* Cross-GF-Doppelbestreuungs-Toggle */
      .partner-cross-doppel-row {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 12px;
        border-top: 1.5px solid var(--gray-200);
        background: linear-gradient(to right, transparent 0%, var(--red-bg) 100%);
        cursor: pointer; user-select: none;
      }
      .partner-cross-doppel-row:hover { filter: brightness(0.98); }
      .partner-cross-doppel-row .partner-erh-name {
        font-size: 0.72rem; color: var(--gray-700); font-weight: 600;
      }
      .partner-cross-doppel-row.checked .partner-erh-checkbox {
        background: var(--red); border-color: var(--red);
      }
      .partner-cross-doppel-row.checked .partner-erh-checkbox::after {
        content: '✓'; color: white; font-size: 0.7rem; font-weight: 700; line-height: 1;
      }

      /* ─── Map ───────────────────────────────────────────────────── */
      .map-container { flex: 1; min-width: 0; height: 100%; position: relative; z-index: 10; isolation: isolate; }
      #map { height: 100%; width: 100%; background: #e8ecf0; }

      #map-interaction-block {
        position: absolute; inset: 0; z-index: 500;
        cursor: default; pointer-events: all;
      }
      #map-interaction-block.hidden { display: none; }

      .spinner {
        width: 42px; height: 42px;
        border: 3px solid rgba(180,24,33,0.15);
        border-top: 3px solid var(--red);
        border-radius: 50%;
        animation: spin 0.9s linear infinite;
        position: absolute; top: 50%; left: 50%;
        transform: translate(-50%, -50%); z-index: 2000;
      }
      @keyframes spin {
        0%   { transform: translate(-50%,-50%) rotate(0deg); }
        100% { transform: translate(-50%,-50%) rotate(360deg); }
      }
      #loading-spinner.hidden { display: none; }

      /* PLZ-Label auf der Karte (ab Zoom-Level LABEL_ZOOM_MIN) */
      .plz-map-label {
        background: rgba(255,255,255,0.88);
        border: 1px solid rgba(0,0,0,0.06);
        padding: 1px 5px;
        font-size: 10px;
        color: var(--gray-700);
        border-radius: 3px;
        font-family: var(--font);
        font-weight: 600;
        white-space: nowrap;
        pointer-events: none;
        box-shadow: 0 1px 2px rgba(0,0,0,0.08);
        line-height: 1.25;
        display: inline-block;
        width: fit-content;
        transform: translate(-50%, -50%);
      }
      .plz-map-label.plz-map-label-strong {
        background: rgba(255,255,255,0.96);
        font-size: 11px;
        color: var(--gray-800);
        padding: 2px 6px;
      }
      .plz-map-label .plz-code { color: var(--red); font-weight: 700; }

      /* ─── Radius-Slider ─────────────────────────────────────────── */
      #radius-slider-container {
        position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
        background: var(--white); padding: 7px 14px; border-radius: 100px;
        box-shadow: var(--shadow-md); font-size: 13px; z-index: 9999;
        display: flex; align-items: center; gap: 10px;
        border: 1px solid var(--gray-200); animation: slideDown 0.4s var(--ease-out);
      }
      @keyframes slideDown {
        from { transform: translateX(-50%) translateY(-12px); opacity: 0; }
        to   { transform: translateX(-50%) translateY(0); opacity: 1; }
      }
      #radius-slider-container label { color: var(--gray-600); font-size: 0.8rem; font-weight: 500; white-space: nowrap; }
      #radius-value { color: var(--red); font-weight: 700; min-width: 24px; display: inline-block; text-align: right; }
      #radius-slider {
        -webkit-appearance: none; appearance: none; width: 110px; height: 4px;
        border-radius: 2px;
        background: linear-gradient(90deg, var(--red) 0%, var(--gray-200) 0%);
        cursor: pointer; outline: none;
      }
      #radius-slider::-webkit-slider-thumb {
        -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%;
        background: var(--white); border: 2.5px solid var(--red);
        box-shadow: 0 1px 4px rgba(0,0,0,0.18); cursor: pointer;
        transition: transform 0.12s, box-shadow 0.12s;
      }
      #radius-slider::-webkit-slider-thumb:hover { transform: scale(1.15); box-shadow: 0 2px 6px var(--red-shadow); }
      #radius-slider::-moz-range-thumb {
        width: 16px; height: 16px; border-radius: 50%;
        background: var(--white); border: 2.5px solid var(--red); cursor: pointer;
      }

      /* ─── Map-Buttons ───────────────────────────────────────────── */
      #map-tile-toggle-btn {
        position: absolute; bottom: 20px; right: calc(26% + 14px);
        width: 48px; height: 48px;
        background: var(--white); border-radius: 50%;
        box-shadow: var(--shadow-md); cursor: pointer; z-index: 50;
        border: 1.5px solid var(--gray-200);
        transition: transform 0.18s var(--ease-out), box-shadow 0.18s, border-color 0.18s;
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" fill="%23b41821" viewBox="0 0 24 24"><path d="M3 6.5l6-2 6 2 6-2v13l-6 2-6-2-6 2v-13zm6 0v11l4 1.3v-11l-4-1.3zm10 0l-4 1.3v11l4-1.3v-11zm-14 0v11l4-1.3v-11l-4 1.3z"/></svg>');
        background-size: 52%; background-repeat: no-repeat; background-position: center;
      }
      #map-tile-toggle-btn:hover { transform: scale(1.1); box-shadow: var(--shadow-lg); border-color: var(--red); }

      #legend-toggle-btn {
        position: absolute; bottom: 20px; left: 14px;
        width: 48px; height: 48px;
        background: var(--white); border-radius: 50%;
        box-shadow: var(--shadow-md); cursor: pointer; z-index: 9999;
        border: 1.5px solid var(--gray-200);
        transition: transform 0.18s var(--ease-out), box-shadow 0.18s, border-color 0.18s;
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" fill="%23b41821" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="2" rx="1"/><rect x="4" y="11" width="12" height="2" rx="1"/><rect x="4" y="17" width="8" height="2" rx="1"/></svg>');
        background-size: 52%; background-repeat: no-repeat; background-position: center;
      }
      #legend-toggle-btn:hover { transform: scale(1.1); box-shadow: var(--shadow-lg); border-color: var(--red); }

      #heatmap-legend {
        position: absolute; bottom: 78px; left: 14px;
        background: rgba(255,255,255,0.97); border: 1.5px solid var(--gray-200);
        border-radius: var(--radius-lg); padding: 12px 14px; width: 210px;
        font-size: 11.5px; font-family: var(--font);
        z-index: 9998; box-shadow: var(--shadow-lg); pointer-events: none;
        transform-origin: bottom left;
        transition: opacity 0.22s ease, transform 0.22s var(--ease-out), visibility 0.22s;
      }
      #heatmap-legend.hidden { opacity: 0; transform: scale(0.94); visibility: hidden; }
      #heatmap-legend strong {
        font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase;
        color: var(--gray-500); font-weight: 700; display: block; margin-bottom: 8px;
      }
      .heatmap-legend-row {
        display: flex; align-items: center; gap: 8px;
        margin-bottom: 4px; color: var(--gray-700);
      }
      .heatmap-legend-color {
        width: 18px; height: 11px; border-radius: 3px;
        border: 1px solid rgba(0,0,0,0.08); flex-shrink: 0;
      }

      /* ─── Side-Popups ───────────────────────────────────────────── */
      .side-popup {
        position: absolute; right: 0; top: 0;
        width: 26%; height: calc(100% - 36% - 10px); max-height: 68%;
        background: var(--white); border-left: 3px solid var(--red);
        border-top-left-radius: var(--radius-xl);
        border-bottom-left-radius: var(--radius-xl);
        font-family: var(--font);
        overflow-y: auto; z-index: 99999; box-shadow: -4px 0 24px rgba(0,0,0,0.12);
        scrollbar-width: thin; scrollbar-color: var(--red) var(--gray-100);
        opacity: 0; transform: translateX(16px);
        transition: opacity 0.28s ease, transform 0.28s var(--ease-out);
      }
      .side-popup::-webkit-scrollbar       { width: 5px; }
      .side-popup::-webkit-scrollbar-thumb { background: var(--red); border-radius: 10px; }
      .side-popup.show   { opacity: 1; transform: translateX(0); }
      .side-popup.hidden { opacity: 0; transform: translateX(16px); pointer-events: none; }
      .popup-header-strip {
        background: linear-gradient(135deg, var(--red) 0%, var(--red-light) 100%);
        color: white; padding: 12px 14px 10px;
        border-radius: var(--radius-xl) 0 0 0; position: relative;
      }
      .popup-header-strip .popup-location {
        font-size: 0.68rem; font-weight: 500; letter-spacing: 0.04em;
        opacity: 0.75; margin-top: 2px;
      }
      .popup-header-strip .popup-title {
        font-size: 1rem; font-weight: 700; line-height: 1.3;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 32px;
      }
      .side-popup .close-btn {
        position: absolute; top: 10px; right: 10px;
        width: 26px; height: 26px;
        background: rgba(255,255,255,0.2); color: white;
        border: 1.5px solid rgba(255,255,255,0.35); border-radius: 50%;
        font-size: 13px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.15s, transform 0.15s; line-height: 1;
      }
      .side-popup .close-btn:hover { background: rgba(255,255,255,0.35); transform: scale(1.1); }
      .side-popup table { width: 100%; table-layout: fixed; border-collapse: collapse; margin: 0; }
      .side-popup th {
        background: var(--red); color: white; font-weight: 600; padding: 7px 12px;
        text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        border: none; font-size: 0.8rem;
      }
      .side-popup th.subtitle-cell {
        background: var(--gray-50); color: var(--gray-600); font-weight: 600;
        font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase;
        border-bottom: 1px solid var(--gray-200);
      }
      .side-popup td {
        font-size: 0.82rem; padding: 6px 12px; color: var(--gray-700);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        border: none; border-bottom: 1px solid var(--gray-100);
        transition: background 0.1s;
      }
      .side-popup tbody tr:hover td { background: var(--red-bg); }
      .side-popup td.label-cell { width: 62%; text-align: left;  color: var(--gray-600); font-weight: 500; }
      .side-popup td.value-cell { width: 38%; text-align: right; font-weight: 700; color: var(--gray-800); font-variant-numeric: tabular-nums; }
      .side-popup .section-title {
        background: var(--gray-50); color: var(--gray-500);
        font-weight: 700; font-size: 0.68rem;
        letter-spacing: 0.08em; text-transform: uppercase; padding: 6px 12px;
        border-top: 1px solid var(--gray-200); border-bottom: 1px solid var(--gray-200);
      }

      #side-popup-umsatz, #side-popup-overview { display: flex; flex-direction: column; }
      #side-popup-umsatz .popup-header,
      #side-popup-overview .popup-header {
        color: white; padding: 12px 14px 10px;
        font-size: 0.97rem; font-weight: 700;
        display: flex; justify-content: space-between; align-items: flex-start;
        border-radius: var(--radius-xl) 0 0 0; line-height: 1.3; flex-shrink: 0;
      }
      /* PLZ-Detail (rot) */
      #side-popup-umsatz .popup-header {
        background: linear-gradient(135deg, var(--red) 0%, var(--red-light) 100%);
      }
      /* ─── Overview-Popup: eigener visueller Identitäts-Akzent ─────
         Klares Unterscheidungsmerkmal ggü. den PLZ-Detail-Popups:
         dunkler Anthrazit-Header mit rotem Streifen oben, anderer
         Border-Akzent links, "GESAMT"-Badge im Header. So sieht der
         User auf einen Blick, ob ein PLZ-Detail oder die Gesamt-
         Übersicht offen ist. */
      #side-popup-overview {
        border-left: 3px solid var(--gray-800);
      }
      #side-popup-overview .popup-header {
        background: linear-gradient(135deg, #2a2f36 0%, #3a4049 100%);
        position: relative;
        padding-top: 14px;
      }
      #side-popup-overview .popup-header::before {
        content: ''; position: absolute; top: 0; left: 0; right: 0;
        height: 3px; background: var(--gray-800);
      }
      .overview-badge {
        display: inline-flex; align-items: center; gap: 4px;
        background: var(--red); color: white;
        font-size: 0.6rem; font-weight: 700;
        padding: 2px 7px; border-radius: 10px;
        letter-spacing: 0.1em; text-transform: uppercase;
        margin-bottom: 4px; line-height: 1.2;
        box-shadow: 0 1px 3px rgba(180,24,33,0.4);
      }
      .overview-badge::before {
        content: '▦'; font-size: 0.7rem; line-height: 1;
      }
      /* PLZ-Detail-Badge für WK- und Umsatz-Popups (zur Abgrenzung
         gegen "Gesamt"-Popup). Dezenter Look – semitransparent auf
         dem roten Header. */
      .detail-badge {
        display: inline-flex; align-items: center; gap: 4px;
        background: rgba(255,255,255,0.22); color: white;
        font-size: 0.6rem; font-weight: 700;
        padding: 2px 7px; border-radius: 10px;
        letter-spacing: 0.1em; text-transform: uppercase;
        margin-bottom: 4px; line-height: 1.2;
        border: 1px solid rgba(255,255,255,0.3);
      }
      .detail-badge::before {
        content: '◉'; font-size: 0.65rem; line-height: 1;
      }
      #side-popup-umsatz .popup-header .close-btn,
      #side-popup-overview .popup-header .close-btn {
        position: static; flex-shrink: 0; width: 26px; height: 26px;
        background: rgba(255,255,255,0.2); color: white;
        border: 1.5px solid rgba(255,255,255,0.35); border-radius: 50%;
        font-size: 13px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.15s, transform 0.15s;
        margin-left: 8px; margin-top: 2px;
      }
      #side-popup-umsatz .popup-header .close-btn:hover,
      #side-popup-overview .popup-header .close-btn:hover {
        background: rgba(255,255,255,0.35); transform: scale(1.1);
      }
      /* Im Overview-Popup auch den Subheader anders einfärben:
         neutrales Grau statt Rot, damit "Gesamt-Charakter" konsistent bleibt */
      #side-popup-overview .umsatz-subheader {
        background: var(--gray-50);
        border-bottom: 1px solid var(--gray-200);
      }
      #side-popup-overview .umsatz-subheader .strong {
        color: var(--gray-900);
      }

      .umsatz-subheader {
        padding: 12px 14px 6px; font-size: 0.87rem; line-height: 1.55;
        background: var(--red-bg); border-bottom: 1px solid var(--red-border);
      }
      .umsatz-subheader .strong { font-weight: 700; color: var(--gray-900); }
      .section-title {
        margin: 0; padding: 6px 14px;
        background: var(--gray-50);
        border-top: 1px solid var(--gray-200); border-bottom: 1px solid var(--gray-200);
        font-weight: 700; font-size: 0.68rem;
        letter-spacing: 0.08em; text-transform: uppercase; color: var(--gray-500);
      }
      .umsatz-grid {
        display: grid; grid-template-columns: 1.3fr 0.9fr 0.9fr;
        gap: 5px 10px; padding: 8px 14px; align-items: center;
      }
      .umsatz-grid .label { font-weight: 500; color: var(--gray-600); font-size: 0.82rem; }
      .umsatz-grid .value {
        text-align: right; font-weight: 700; color: var(--gray-800);
        font-size: 0.82rem; font-variant-numeric: tabular-nums;
      }
      .umsatz-bar {
        height: 10px; border-radius: 5px; overflow: hidden;
        display: flex; margin: 6px 14px; background: var(--gray-100);
      }
      .umsatz-bar > div { transition: width 0.5s var(--ease-out); }
      .share-stationaer { background: var(--red);  }
      .share-pluscard   { background: #1f78b4; }
      .share-ra         { background: #33a02c; }
      .share-online     { background: #ffb000; }
      .umsatz-legend {
        display: flex; gap: 10px; flex-wrap: wrap;
        padding: 4px 14px 10px; font-size: 0.78rem; color: var(--gray-600);
      }
      .umsatz-legend > span { display: flex; align-items: center; gap: 4px; }
      .disabled-cell { opacity: 0.3; filter: grayscale(1); }

      /* ─── Control-Panel ─────────────────────────────────────────── */
      #map-control-panel {
        position: absolute; right: 0; bottom: 0;
        width: 26%; height: 25%; max-height: 68%;
        overflow-y: auto;
        background: rgba(255,255,255,0.97); backdrop-filter: blur(8px);
        border-left: 1px solid var(--gray-200); border-top: 1px solid var(--gray-200);
        border-top-left-radius: var(--radius-xl); padding: 14px;
        font-family: var(--font); z-index: 20;
        display: flex; flex-direction: column; gap: 12px;
        transition: height 0.32s var(--ease-out);
        box-shadow: -2px -2px 16px rgba(0,0,0,0.08);
        scrollbar-width: thin; scrollbar-color: var(--red) var(--gray-100);
      }
      #map-control-panel.panel-auto   { height: auto; max-height: 68%; overflow-y: visible; }
      #map-control-panel.panel-large  { height: 68%; }
      #map-control-panel.panel-medium { height: 30%; }
      #map-control-panel::before {
        content: ''; display: block; position: absolute; top: 0; left: 24px; right: 0;
        height: 2px;
        background: linear-gradient(90deg, var(--red), transparent);
        pointer-events: none;
      }
      #panel-footer {
        margin-top: 4px; padding-top: 10px;
        border-top: 1px solid var(--gray-100);
        display: flex; gap: 6px; flex-shrink: 0;
      }
      .panel-footer-btn {
        flex: 1; padding: 8px 6px; font-size: 0.75rem;
        font-family: var(--font); font-weight: 600;
        border: 1.5px solid var(--gray-200); border-radius: var(--radius-md);
        background: var(--white); color: var(--gray-500); cursor: pointer;
        transition: background 0.18s, border-color 0.18s, color 0.18s;
        display: flex; align-items: center; justify-content: center; gap: 5px;
        white-space: nowrap;
      }
      .panel-footer-btn:hover:not(:disabled) { background: var(--red-bg); border-color: var(--red); color: var(--red); }
      .panel-footer-btn:disabled { opacity: 0.35; cursor: not-allowed; }

      .panel-card {
        background: var(--white); border: 1px solid var(--gray-200);
        border-radius: var(--radius-lg); padding: 12px;
        box-shadow: var(--shadow-xs);
        display: flex; flex-direction: column; gap: 10px;
        animation: panelCardIn 0.3s var(--ease-out) both;
      }
      @keyframes panelCardIn {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .panel-title {
        font-size: 0.7rem; font-weight: 700;
        letter-spacing: 0.08em; text-transform: uppercase;
        color: var(--gray-400); margin-bottom: 2px;
      }
      /* iOS-Style-Slider: ein Pill-Hintergrund gleitet zwischen den Buttons.
         Buttons selbst werden transparent — der Hintergrund visualisiert
         den aktiven Zustand via Position. */
      .switch-row {
        display: flex; gap: 0;
        position: relative;
        background: var(--gray-100);
        border-radius: var(--radius-md);
        padding: 3px;
      }
      .switch-row::before {
        content: '';
        position: absolute;
        top: 3px; bottom: 3px; left: 3px;
        width: calc(50% - 3px);
        background: var(--red);
        border-radius: calc(var(--radius-md) - 2px);
        box-shadow: 0 2px 6px var(--red-shadow);
        transition: transform 0.32s var(--ease-out);
        z-index: 0;
      }
      /* Wenn der 2. Button (Umsatz) aktiv: Slider nach rechts */
      .switch-row.switch-right::before {
        transform: translateX(100%);
      }
      .switch-btn {
        flex: 1; padding: 8px 10px; border-radius: calc(var(--radius-md) - 2px);
        border: none; background: transparent; color: var(--gray-600);
        font-weight: 600; font-size: 0.83rem; font-family: var(--font); cursor: pointer;
        transition: color 0.24s var(--ease-out);
        display: flex; align-items: center; justify-content: center; gap: 5px;
        position: relative; z-index: 1;
      }
      .switch-btn:hover:not(.active) { color: var(--red); }
      .switch-btn.active {
        color: var(--white);
      }
      .option-row {
        display: flex; gap: 10px; font-size: 0.82rem;
        color: var(--gray-600); align-items: center;
      }
      .option-row label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
      .option-row input[type=checkbox] { accent-color: var(--red); cursor: pointer; width: 14px; height: 14px; }

      .compact-switch {
        display: flex; background: var(--gray-100);
        border-radius: var(--radius-md); padding: 3px; gap: 2px;
        cursor: pointer; user-select: none; border: 1px solid var(--gray-200);
      }
      .compact-switch span {
        flex: 1; text-align: center; padding: 5px 4px;
        font-size: 0.76rem; font-weight: 600; border-radius: 5px;
        transition: all 0.18s var(--ease-in-out); color: var(--gray-500);
      }
      .compact-switch span:hover { color: var(--red); }
      .compact-switch.active-left  .mode-left  { background: var(--white); color: var(--red); box-shadow: var(--shadow-xs); }
      .compact-switch.active-right .mode-right { background: var(--white); color: var(--red); box-shadow: var(--shadow-xs); }
      .switch-label {
        font-size: 0.7rem; font-weight: 700; letter-spacing: 0.06em;
        text-transform: uppercase; color: var(--gray-400); margin-bottom: 1px;
      }
      .big-check {
        display: flex; align-items: center; gap: 7px; padding: 6px 10px;
        border: 1.5px solid var(--gray-200); border-radius: var(--radius-md);
        background: var(--white); font-size: 0.82rem; font-weight: 600;
        cursor: pointer; transition: border-color 0.18s, background 0.18s;
        color: var(--gray-700);
      }
      .big-check:hover { border-color: var(--red-border); background: var(--red-bg); }
      .big-check input { transform: scale(1.2); accent-color: var(--red); }
      .triple-switch {
        display: flex; background: var(--gray-100);
        border-radius: var(--radius-md); padding: 3px; gap: 2px;
        user-select: none; border: 1px solid var(--gray-200);
      }
      .triple-switch span {
        flex: 1; text-align: center; padding: 5px 2px;
        font-size: 0.74rem; font-weight: 600; border-radius: 5px;
        cursor: pointer; transition: all 0.18s var(--ease-in-out); color: var(--gray-500);
      }
      .triple-switch span.active   { background: var(--white); color: var(--red); box-shadow: var(--shadow-xs); }
      .triple-switch span.disabled { opacity: 0.35; cursor: not-allowed; }
      .category-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
      .category-toggle {
        padding: 7px 8px; border-radius: var(--radius-md);
        border: 1.5px solid var(--gray-200); background: var(--white); color: var(--gray-600);
        font-size: 0.78rem; font-weight: 600; font-family: var(--font);
        text-align: center; cursor: pointer; transition: all 0.18s var(--ease-in-out);
      }
      .category-toggle:hover:not(.active) { border-color: var(--red-border); background: var(--red-bg); color: var(--red); }
      .category-toggle.active {
        background: var(--red-bg); border-color: var(--red); color: var(--red);
        font-weight: 700; box-shadow: 0 0 0 3px var(--red-shadow);
      }

      /* ─── Animationen ───────────────────────────────────────────── */
      @keyframes criticalPulse {
        0%, 100% { transform: scale(1);   filter: drop-shadow(0 0 0px rgba(240,165,0,0)); }
        50%      { transform: scale(1.6); filter: drop-shadow(0 0 6px rgba(240,165,0,0.7)); }
      }
      @keyframes bestreuungPulse {
        0%   { opacity: 0.9;  stroke-width: 2.5; }
        50%  { opacity: 0.35; stroke-width: 1.5; }
        100% { opacity: 0.9;  stroke-width: 2.5; }
      }
      .bestreuung-pulse-path {
        fill: none; stroke: #1565c0; stroke-width: 2.5;
        stroke-dasharray: 6 3;
        animation: bestreuungPulse 2s ease-in-out infinite;
        pointer-events: none;
      }

      /* ─── Cinematic Loader ──────────────────────────────────────── */
      #cinematic-loader {
        position: absolute; inset: 0; z-index: 99999;
        background: rgba(255,255,255,0.96); backdrop-filter: blur(6px);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        font-family: var(--font); animation: loaderFadeIn 0.25s ease;
      }
      @keyframes loaderFadeIn { from { opacity: 0; } to { opacity: 1; } }
      #cinematic-loader .loader-logo { width: 64px; height: 64px; margin-bottom: 28px; position: relative; }
      #cinematic-loader .loader-logo::before {
        content: ''; position: absolute; inset: 0; border-radius: 50%;
        border: 3px solid rgba(180,24,33,0.12);
        border-top-color: var(--red); border-right-color: var(--red);
        animation: spinSlow 1.6s linear infinite;
      }
      #cinematic-loader .loader-logo::after {
        content: ''; position: absolute; inset: 10px; border-radius: 50%;
        border: 2px solid rgba(180,24,33,0.08);
        border-bottom-color: rgba(180,24,33,0.4);
        animation: spinFast 0.85s linear infinite reverse;
      }
      #cinematic-loader .loader-core {
        position: absolute; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        width: 12px; height: 12px; border-radius: 50%;
        background: var(--red); box-shadow: 0 0 16px rgba(180,24,33,0.35);
        animation: corePulse 1.6s ease-in-out infinite;
      }
      @keyframes spinSlow  { to { transform: rotate(360deg); } }
      @keyframes spinFast  { to { transform: rotate(360deg); } }
      @keyframes corePulse {
        0%,100% { transform: translate(-50%,-50%) scale(1);    opacity: 1; }
        50%     { transform: translate(-50%,-50%) scale(1.35); opacity: 0.7; }
      }
      #cinematic-loader .loader-phase {
        color: var(--gray-700); font-size: 0.95rem; font-weight: 600;
        letter-spacing: 0.02em; margin-bottom: 4px; min-height: 1.4em;
        text-align: center; transition: opacity 0.22s ease;
      }
      #cinematic-loader .loader-bar-track {
        width: 240px; height: 3px; background: var(--gray-200);
        border-radius: 2px; margin-top: 18px; overflow: hidden;
      }
      #cinematic-loader .loader-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--red), #e96a3a);
        border-radius: 2px; width: 0%;
        transition: width 0.48s var(--ease-in-out);
      }
      #cinematic-loader .loader-dots { display: flex; gap: 20px; margin-top: 22px; }
      #cinematic-loader .loader-dot {
        display: flex; flex-direction: column; align-items: center; gap: 6px;
        opacity: 0.25; transition: opacity 0.35s ease;
      }
      #cinematic-loader .loader-dot.active { opacity: 1; }
      #cinematic-loader .loader-dot.done   { opacity: 0.5; }
      #cinematic-loader .dot-circle {
        width: 8px; height: 8px; border-radius: 50%;
        background: var(--red);
        transition: transform 0.28s var(--ease-out), box-shadow 0.28s;
      }
      #cinematic-loader .loader-dot.active .dot-circle {
        transform: scale(1.5); box-shadow: 0 0 8px var(--red-shadow);
      }
      #cinematic-loader .dot-label {
        font-size: 0.62rem; color: var(--gray-400);
        font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
        white-space: nowrap;
      }
      #cinematic-loader.fade-out { animation: loaderFadeOut 0.35s ease forwards; }
      @keyframes loaderFadeOut { to { opacity: 0; pointer-events: none; } }
      #cinematic-loader .loader-data-progress {
        width: 240px; margin-top: 14px; display: none;
        flex-direction: column; gap: 5px;
      }
      #cinematic-loader .loader-data-bar-track {
        width: 100%; height: 6px; background: var(--gray-200);
        border-radius: 3px; overflow: hidden;
      }
      #cinematic-loader .loader-data-bar-fill {
        height: 100%; border-radius: 3px; width: 0%;
        background: linear-gradient(90deg, var(--red), #e96a3a);
        transition: width 0.35s var(--ease-in-out);
      }
      #cinematic-loader .loader-data-label {
        font-size: 0.72rem; color: var(--gray-500); font-weight: 600;
        text-align: center; letter-spacing: 0.02em;
        font-variant-numeric: tabular-nums;
      }

      /* ─── Doppelbestreuungs-Toggle (collapsible) ────────────────── */
      #doppel-toggle-bar {
        margin-top: 10px; flex-shrink: 0;
        border: 1.5px solid var(--gray-200); border-radius: var(--radius-md);
        background: var(--gray-50); overflow: hidden;
      }
      #doppel-toggle-header {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 10px 6px 10px;
        cursor: pointer; user-select: none;
        transition: background 0.15s;
      }
      #doppel-toggle-header:hover { background: var(--gray-100); }
      .doppel-toggle-icon { font-size: 1rem; line-height: 1; flex-shrink: 0; }
      .doppel-toggle-title-block { display: flex; flex-direction: column; gap: 1px; flex: 1; }
      .doppel-toggle-label {
        font-size: 0.72rem; font-weight: 700; color: var(--gray-700);
        letter-spacing: 0.04em; text-transform: uppercase;
      }
      .doppel-toggle-subtitle { font-size: 0.67rem; color: var(--gray-500); font-weight: 400; }
      .doppel-toggle-chevron {
        font-size: 0.8rem; color: var(--gray-500); flex-shrink: 0;
        transition: transform 0.28s var(--ease-out);
        transform: rotate(180deg);
        line-height: 1;
        margin-left: 4px;
      }
      #doppel-toggle-bar.collapsed .doppel-toggle-chevron { transform: rotate(0deg); }
      #doppel-toggle-bar.collapsed #doppel-toggle-header { padding-bottom: 8px; }
      /* Compact-Hint im collapsed-Zustand: zeigt aktuelle Auswahl rechts */
      .doppel-toggle-current {
        font-size: 0.66rem; color: var(--red); font-weight: 600;
        padding: 2px 7px; border-radius: 8px;
        background: var(--red-bg); border: 1px solid var(--red-border);
        white-space: nowrap; flex-shrink: 0;
        opacity: 0; max-width: 0; overflow: hidden;
        transition: opacity 0.2s ease, max-width 0.28s var(--ease-out);
      }
      #doppel-toggle-bar.collapsed .doppel-toggle-current {
        opacity: 1; max-width: 140px;
      }
      #doppel-toggle-options {
        display: flex; flex-direction: column; gap: 0;
        border-top: 1px solid var(--gray-200);
        max-height: 200px; overflow: hidden;
        transition: max-height 0.32s var(--ease-out),
                    border-top-color 0.2s ease,
                    opacity 0.2s ease;
      }
      #doppel-toggle-bar.collapsed #doppel-toggle-options {
        max-height: 0; border-top-color: transparent; opacity: 0;
      }
      .doppel-option {
        display: flex; align-items: center; gap: 10px;
        padding: 7px 10px; cursor: pointer;
        transition: background 0.15s;
        border-bottom: 1px solid var(--gray-100);
        background: white;
      }
      .doppel-option:last-child { border-bottom: none; }
      .doppel-option:hover:not(.disabled) { background: var(--red-bg); }
      .doppel-option.active { background: var(--red-bg); }
      .doppel-option.disabled {
        opacity: 0.38; cursor: not-allowed; pointer-events: none;
      }
      .doppel-option-radio {
        width: 14px; height: 14px; border-radius: 50%;
        border: 2px solid var(--gray-300); flex-shrink: 0;
        transition: border-color 0.15s, background 0.15s;
        position: relative;
      }
      .doppel-option.active .doppel-option-radio {
        border-color: var(--red); background: var(--red);
        box-shadow: 0 0 0 3px rgba(180,24,33,0.12);
      }
      .doppel-option.active .doppel-option-radio::after {
        content: ''; position: absolute; inset: 2px;
        border-radius: 50%; background: white;
      }
      .doppel-option-text { display: flex; flex-direction: column; gap: 1px; }
      .doppel-option-name { font-size: 0.78rem; font-weight: 600; color: var(--gray-800); }
      .doppel-option.active .doppel-option-name { color: var(--red); }
      .doppel-option-desc { font-size: 0.67rem; color: var(--gray-500); line-height: 1.3; }
      /* Hinweis wenn Doppelbestreuung nicht verfügbar */
      #doppel-laufend-hint {
        display: none; padding: 7px 10px 8px;
        font-size: 0.7rem; color: var(--gray-500); line-height: 1.45;
        background: var(--gray-50); border-top: 1px solid var(--gray-100);
      }
      #doppel-laufend-hint.visible { display: block; }
      #doppel-laufend-hint strong { color: var(--gray-700); }

      /* ─── Tooltip ───────────────────────────────────────────────── */
      .doppel-tooltip {
        position: absolute; z-index: 99999;
        background: var(--white); border: 1.5px solid var(--red-border);
        border-radius: var(--radius-md); padding: 8px 11px;
        font-size: 0.76rem; font-family: var(--font);
        box-shadow: var(--shadow-md);
        pointer-events: none; max-width: 220px;
        animation: tooltipFadeIn 0.18s var(--ease-out);
      }
      @keyframes tooltipFadeIn {
        from { opacity: 0; transform: translateY(4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .doppel-tooltip-title {
        font-size: 0.68rem; font-weight: 700; letter-spacing: 0.06em;
        text-transform: uppercase; color: var(--gray-400); margin-bottom: 5px;
      }
      .doppel-tooltip-row {
        display: flex; align-items: center; gap: 6px;
        padding: 3px 0; border-bottom: 1px solid var(--gray-100);
        color: var(--gray-700);
      }
      .doppel-tooltip-row:last-child { border-bottom: none; }

      /* docs-content (genutzt von _buildRechnungslogikHtml-Strings) */
      .docs-content { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 12px; }
      .docs-content h4 {
        margin: 6px 0 2px;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--red);
      }
      .docs-content h4:first-child { margin-top: 0; }
      .docs-content p { margin: 0; }
      .docs-content ul, .docs-content ol {
        margin: 0; padding-left: 18px;
        display: flex; flex-direction: column; gap: 3px;
      }
      .docs-content li { line-height: 1.5; }
      .docs-content code {
        font-family: 'Consolas', 'Courier New', monospace;
        background: var(--gray-100);
        padding: 1px 5px;
        border-radius: 3px;
        font-size: 0.92em;
        color: var(--red-dark);
      }
      .docs-content strong { color: var(--gray-900); font-weight: 700; }
      .docs-key-block {
        background: var(--gray-50);
        border-left: 3px solid var(--red);
        border-radius: 4px;
        padding: 8px 11px;
        font-size: 0.72rem;
        color: var(--gray-700);
        line-height: 1.55;
      }
      .docs-key-block strong { color: var(--red); }

      /* ─── Anleitung-View (Sidebar) ─────────────────────────────────── */
      .docs-content-wrap {
        flex: 1; overflow-y: auto; min-height: 0;
        padding: 4px 4px 14px;
        scrollbar-width: thin; scrollbar-color: var(--red) var(--gray-100);
        display: flex; flex-direction: column; gap: 10px;
      }
      .docs-content-wrap::-webkit-scrollbar       { width: 5px; }
      .docs-content-wrap::-webkit-scrollbar-thumb { background: var(--red); border-radius: 10px; }

      .docs-hero {
        text-align: center; padding: 12px 8px 6px;
        background: linear-gradient(180deg, var(--red-bg) 0%, transparent 100%);
        border-radius: var(--radius-md);
      }
      .docs-hero-icon { font-size: 2.2rem; margin-bottom: 4px; }
      .docs-hero-title {
        font-size: 0.95rem; font-weight: 700; color: var(--gray-800);
      }
      .docs-hero-subtitle {
        font-size: 0.72rem; color: var(--gray-500); margin-top: 2px;
      }

      .docs-accordion {
        border: 1px solid var(--gray-200);
        border-radius: var(--radius-md);
        background: var(--white);
        overflow: hidden;
        flex-shrink: 0;
      }
      .docs-accordion-header {
        display: flex; align-items: center; gap: 8px;
        padding: 9px 11px;
        cursor: pointer; user-select: none;
        background: var(--gray-50);
        color: var(--gray-800);
        transition: background 0.15s;
        font-size: 0.78rem; font-weight: 700;
      }
      .docs-accordion-header:hover { background: var(--red-bg); }
      .docs-accordion.open .docs-accordion-header {
        background: linear-gradient(135deg, var(--red) 0%, var(--red-light) 100%);
        color: white;
      }
      .docs-accordion-icon { font-size: 0.95rem; line-height: 1; flex-shrink: 0; }
      .docs-accordion-title {
        flex: 1; letter-spacing: 0.04em;
      }
      .docs-accordion-chevron {
        font-size: 0.8rem; line-height: 1; flex-shrink: 0;
        transition: transform 0.28s var(--ease-out);
      }
      .docs-accordion.open .docs-accordion-chevron { transform: rotate(180deg); }
      .docs-accordion-body {
        max-height: 0; overflow: hidden;
        transition: max-height 0.4s var(--ease-out);
      }
      .docs-accordion.open .docs-accordion-body { max-height: 4000px; }
      .docs-accordion-inner {
        padding: 12px 14px;
        font-size: 0.74rem; color: var(--gray-700); line-height: 1.55;
        display: flex; flex-direction: column; gap: 10px;
      }
      .docs-accordion-inner h4 {
        margin: 4px 0 2px;
        font-size: 0.7rem; font-weight: 700;
        letter-spacing: 0.05em; text-transform: uppercase;
        color: var(--red);
      }
      .docs-accordion-inner h4:first-child { margin-top: 0; }
      .docs-accordion-inner p { margin: 0; }
      .docs-accordion-inner ul, .docs-accordion-inner ol {
        margin: 0; padding-left: 18px;
        display: flex; flex-direction: column; gap: 3px;
      }
      .docs-accordion-inner li { line-height: 1.5; }
      .docs-accordion-inner code {
        font-family: 'Consolas', 'Courier New', monospace;
        background: var(--gray-100);
        padding: 1px 5px; border-radius: 3px;
        font-size: 0.92em; color: var(--red-dark);
      }
      .docs-accordion-inner strong { color: var(--gray-900); font-weight: 700; }

      /* Streuplan-Inhalte */
      .streuplan-termine-list {
        list-style: none; margin: 0; padding: 0;
        display: flex; flex-direction: column; gap: 4px;
      }
      .streuplan-termine-list li {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 9px;
        background: var(--gray-50); border-radius: 4px;
        font-size: 0.74rem;
      }
      .streu-datum { font-weight: 700; color: var(--gray-800); min-width: 78px; }
      .streu-kw {
        font-size: 0.65rem; font-weight: 600;
        background: var(--red-bg); color: var(--red);
        padding: 1px 6px; border-radius: 8px;
      }
      .streu-kw.done {
        background: #e8f5e9; color: #2e7d32;
      }
      .streuplan-termine-list li.done .streu-datum { color: var(--gray-500); }
      .streuplan-termine-list li.done .streu-beschr { color: var(--gray-400); }
      .streu-beschr { color: var(--gray-600); font-size: 0.72rem; flex: 1; }
      .streuplan-partner-table {
        width: 100%; border-collapse: collapse; font-size: 0.72rem;
      }
      .streuplan-partner-table th {
        background: var(--gray-100); padding: 5px 7px;
        text-align: left; font-weight: 700; color: var(--gray-700);
        font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.05em;
      }
      .streuplan-partner-table td {
        padding: 5px 7px; border-bottom: 1px solid var(--gray-100);
        color: var(--gray-700);
      }

      /* ─── Erweiterte Analyse View ──────────────────────────────────── */
      .analysis-content {
        flex: 1; overflow-y: auto; min-height: 0;
        padding: 4px 4px 14px;
        scrollbar-width: thin; scrollbar-color: var(--red) var(--gray-100);
        display: flex; flex-direction: column; gap: 10px;
      }
      .analysis-content::-webkit-scrollbar       { width: 5px; }
      .analysis-content::-webkit-scrollbar-thumb { background: var(--red); border-radius: 10px; }

      .analysis-section {
        border: 1px solid var(--gray-200);
        border-radius: var(--radius-md);
        background: var(--white);
        overflow: hidden; flex-shrink: 0;
      }
      .analysis-section-header {
        display: flex; align-items: center; gap: 8px;
        padding: 9px 11px;
        cursor: pointer; user-select: none;
        background: var(--gray-50);
        transition: background 0.15s;
        font-size: 0.74rem; font-weight: 700;
        color: var(--gray-700);
      }
      .analysis-section-header:hover { background: var(--red-bg); }
      .analysis-section.open .analysis-section-header {
        background: linear-gradient(135deg, var(--red) 0%, var(--red-light) 100%);
        color: white;
      }
      .analysis-section-icon { font-size: 0.95rem; flex-shrink: 0; line-height: 1; }
      .analysis-section-title {
        flex: 1; letter-spacing: 0.04em; text-transform: uppercase;
      }
      .analysis-section-status {
        font-size: 0.6rem; font-weight: 700;
        background: var(--gray-200); color: var(--gray-600);
        padding: 1px 6px; border-radius: 8px;
        text-transform: uppercase; letter-spacing: 0.04em;
      }
      .analysis-section.open .analysis-section-status {
        background: rgba(255,255,255,0.25); color: white;
      }
      .analysis-section-chevron {
        font-size: 0.8rem; line-height: 1; flex-shrink: 0;
        transition: transform 0.28s var(--ease-out);
      }
      .analysis-section.open .analysis-section-chevron { transform: rotate(180deg); }
      .analysis-section-body {
        max-height: 0; overflow: hidden;
        transition: max-height 0.4s var(--ease-out);
      }
      .analysis-section.open .analysis-section-body { max-height: 2000px; }
      .analysis-section-body > * { padding: 0; }
      .analysis-section-body > #analysis-partner-body,
      .analysis-section-body > .analysis-empty {
        padding: 8px 10px;
      }
      .analysis-empty {
        font-size: 0.74rem; color: var(--gray-500);
        background: var(--gray-50); border-radius: 4px;
        padding: 10px 12px; line-height: 1.5;
      }
      .analysis-empty strong { color: var(--gray-700); }
      .analysis-empty ul { margin: 6px 0 0; padding-left: 18px; }

      /* Embedded-Picker: wenn Partner-Picker innerhalb einer analysis-section
         lebt, übernimmt diese die Klapp-Funktion → Picker-Header verstecken,
         um Doppel-Akkordeon zu vermeiden. Border auch entfernen weil
         analysis-section ihn schon umrahmt. */
      #partner-erh-picker.embedded-in-section { border: none; }
      #partner-erh-picker.embedded-in-section #partner-erh-picker-header { display: none; }
      #partner-erh-picker.embedded-in-section #partner-erh-picker-body {
        max-height: none; overflow: visible; padding: 0;
      }

      /* ─── Buttons ───────────────────────────────────────────────── */
      /* ─── Mitbewerber-Tooltip + Cluster ─────────────────────────────── */
      .competitor-tooltip {
        background: var(--white); border: 1.5px solid #f26522;
        border-radius: var(--radius-md); padding: 6px 10px;
        font-family: var(--font); font-size: 0.8rem;
        box-shadow: var(--shadow-md); line-height: 1.5;
      }
      .competitor-tooltip::before { display: none; }
      .competitor-cluster {
        background: linear-gradient(135deg, #f26522 0%, #e94e1b 100%);
        color: white; font-weight: 700;
        border-radius: 50%;
        border: 2px solid rgba(255,255,255,0.85);
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        text-align: center;
        font-family: var(--font);
        cursor: pointer;
        animation: clusterPop 0.36s var(--ease-out) both;
        transition: transform 0.18s var(--ease-out);
      }
      .competitor-cluster:hover { transform: scale(1.10); }
      @keyframes clusterPop {
        from { opacity: 0; transform: scale(0.4); }
        to   { opacity: 1; transform: scale(1); }
      }

      .hidden { display: none; }

      @keyframes rowFadeIn {
        from { opacity: 0; transform: translateX(-6px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      .table-row-animated { animation: rowFadeIn 0.2s var(--ease-out) both; }

      /* Preview-Animationen für Vorschau-Rundgang */
      @keyframes previewPing {
        0%   { transform: translate(-50%,-50%) scale(0.2); opacity: 0.9; }
        100% { transform: translate(-50%,-50%) scale(2.5); opacity: 0; }
      }
      @keyframes previewFadeIn {
        from { opacity: 0; transform: translate(-50%,-80%) rotate(-45deg) scale(0.3); }
        to   { opacity: 1; transform: translate(-50%,-80%) rotate(-45deg) scale(1); }
      }
      #preview-erh-label {
        position: absolute; top: 58px; left: 50%;
        transform: translateX(-50%);
        background: rgba(255,255,255,0.93);
        border: 1px solid var(--gray-200);
        border-radius: 100px; padding: 5px 16px;
        font-size: 0.72rem; font-weight: 700;
        color: var(--gray-500); letter-spacing: .06em; text-transform: uppercase;
        pointer-events: none; box-shadow: var(--shadow-sm);
        z-index: 9000; transition: opacity 0.3s ease;
      }
    </style>

    <div class="layout">
      <div class="filter-container">

        <!-- Info-Bar ganz oben: zeigt aktuelle Erhebungs-Auswahl wenn die
             Filter-Maske eingeklappt ist. Sonst versteckt. -->
        <div id="filter-info-bar" class="hidden">
          <span class="filter-info-icon">📍</span>
          <span class="filter-info-text" id="filter-info-text">—</span>
          <span class="filter-info-badge" id="filter-info-badge"></span>
          <button type="button" id="filter-info-expand" title="Filter wieder einblenden">▾ Ändern</button>
        </div>

        <!-- Filter-Felder. Zusammen ein-/ausklappbar via #filter-fields-toggle. -->
        <div class="filter-fields" id="filter-fields">
          <label for="erhebung-select">ErhebungsID</label>
          <select id="erhebung-select"></select>
          <label for="jahr-select">Jahr</label>
          <select id="jahr-select" disabled></select>
          <label for="nummer-select">Erhebungsnummer</label>
          <select id="nummer-select" disabled></select>
          <div class="filter-button-row">
            <button id="filter-button">Anzeigen</button>
            <!-- Filter-Maske einklappen. Erscheint nur wenn eine Erhebung
                 geladen ist (sonst nichts zu verbergen). -->
            <button id="filter-fields-toggle" type="button" title="Filter ausblenden"><span class="filter-toggle-arrow">▴</span> Ausblenden</button>
          </div>
        </div>

        <!-- Hauptinhalts-Container füllt den verbleibenden Platz unter dem
             Filter-Bereich. Tab-Leiste sitzt am unteren Rand. Beim Wechsel
             zwischen Views wird der Hauptinhalt umgeschaltet; bei "nichts
             aktiv" kollabiert der Inhalt auf 0 → Karte wird breiter. -->
        <div class="sidebar-layout">
          <div class="sidebar-content" id="sidebar-content">
            <!-- View: Anleitung -->
            <div class="sidebar-view" id="sidebar-view-docs"></div>
            <!-- View: PLZ-Tabelle -->
            <div class="sidebar-view" id="sidebar-view-plz">
              <div class="table-wrapper" id="table-container"></div>
            </div>
            <!-- View: Erhebungsübersicht (NL-Tabelle, GF-gruppiert) -->
            <div class="sidebar-view" id="sidebar-view-overview">
              <div id="nl-info-container"></div>
            </div>
            <!-- View: Erweiterte Analyse (Partner-Picker, Vergleich-Platzhalter) -->
            <div class="sidebar-view" id="sidebar-view-analysis"></div>
          </div>
          <!-- Tab-Bar: horizontale Reiter unten. Genau ein View muss aktiv sein
               (außer wenn ganze Spalte ausgeblendet ist via 👁 Tab). -->
          <div class="sidebar-rail" id="sidebar-rail">
            <button class="sidebar-icon" data-view="docs" title="Anleitung" type="button">
              <span class="sidebar-icon-glyph">📖</span>
              <span class="sidebar-icon-label">Anleitung</span>
              <span class="sidebar-icon-badge" id="sidebar-badge-docs"></span>
            </button>
            <button class="sidebar-icon" data-view="plz" title="PLZ-Tabelle" type="button" disabled>
              <span class="sidebar-icon-glyph">📋</span>
              <span class="sidebar-icon-label">PLZ</span>
              <span class="sidebar-icon-badge" id="sidebar-badge-plz"></span>
            </button>
            <button class="sidebar-icon" data-view="overview" title="Erhebungsübersicht" type="button" disabled>
              <span class="sidebar-icon-glyph">📊</span>
              <span class="sidebar-icon-label">Übersicht</span>
              <span class="sidebar-icon-badge" id="sidebar-badge-overview"></span>
            </button>
            <button class="sidebar-icon" data-view="analysis" title="Erweiterte Analyse" type="button" disabled>
              <span class="sidebar-icon-glyph">🔬</span>
              <span class="sidebar-icon-label">Analyse</span>
              <span class="sidebar-icon-badge" id="sidebar-badge-analysis"></span>
            </button>
            <!-- Spezial-Tab: blendet die komplette linke Spalte aus.
                 Pfeil ◀ zeigt die Richtung an (Spalte verschwindet nach links). -->
            <button class="sidebar-icon sidebar-icon-hide" data-action="hide-pane"
                    title="Menü ausblenden" type="button">
              <span class="sidebar-icon-glyph">◀</span>
              <span class="sidebar-icon-label">Ausblenden</span>
            </button>
          </div>
        </div>
      </div>

      <div class="map-container">
        <div id="map-interaction-block"></div>
        <div id="map-preview-overlay" style="position:absolute;inset:0;z-index:400;pointer-events:none;overflow:hidden;"></div>
        <div id="loading-spinner" class="spinner hidden"></div>
        <div id="radius-slider-container">
          <label>Radius: <span id="radius-value">40</span> km</label>
          <input type="range" id="radius-slider" min="10" max="100" value="40" step="5">
        </div>
        <div id="map"></div>
        <div id="legend-toggle-btn" title="Legende"></div>
        <div id="heatmap-legend" class="heatmap-legend hidden"></div>

        <!-- Reopen-Button: nur sichtbar wenn die ganze linke Spalte
             ausgeblendet ist. Pfeil ▶ zeigt nach rechts (Richtung die er
             bewirkt: Menü wird nach rechts ausgeklappt). -->
        <button id="left-pane-reopen-btn" type="button" title="Menü einblenden" aria-label="Menü öffnen">
          <span class="reopen-hamburger"></span>
        </button>
      </div>

      <div id="side-popup"          class="side-popup hidden"></div>
      <div id="side-popup-umsatz"   class="side-popup hidden"></div>
      <div id="side-popup-overview" class="side-popup hidden"></div>
    </div>

    <div id="map-tile-toggle-btn" title="Kartenstil wechseln"></div>
    <div id="map-control-panel">
      <div class="panel-card">
        <div class="panel-title">Analyse-Modus</div>
        <div class="switch-row">
          <button id="btn-wk"     class="switch-btn active">📊 WK</button>
          <button id="btn-umsatz" class="switch-btn">💶 Umsatz</button>
        </div>
        <div id="wk-extra" class="option-row">
          <label><input type="checkbox" id="chk-doppelbestreuung"> Doppelbestreuung</label>
          <label><input type="checkbox" id="chk-competitors-wk"> 🔨 Mitbewerber</label>
        </div>
        <div id="umsatz-options-row" class="option-row hidden">
          <label><input type="checkbox" id="chk-bestreuung"> 📍 Bestreuung</label>
          <label><input type="checkbox" id="chk-competitors-umsatz"> 🔨 Mitbewerber</label>
        </div>
      </div>
      <div id="umsatz-panel" class="panel-card hidden">
        <div class="panel-title">Umsatz-Einstellungen</div>
        <div class="switch-label">Umsatztyp</div>
        <div id="umsatz-type-switch" class="compact-switch active-left">
          <span class="mode-left">Umsatz</span>
          <span class="mode-right">Werbeumsatz</span>
        </div>
        <div id="werbe-options-row" class="option-row hidden">
          <label class="big-check"><input type="checkbox" id="chk-werbeumsatz" checked> Werbeumsatz</label>
          <label class="big-check"><input type="checkbox" id="chk-mitgekauft"> Mitgekauft</label>
        </div>
        <div class="switch-label">Darstellung</div>
        <div id="umsatz-analysis-switch" class="triple-switch">
          <span class="mode-abs active">Absolut</span>
          <span class="mode-hh">pro HH</span>
          <span class="mode-werbeanteil disabled">Werbeanteil</span>
        </div>
        <div class="category-grid">
          <div class="category-toggle active" data-cat="stationaer">🏬 Stationär</div>
          <div class="category-toggle active" data-cat="pluscard">💳 Pluscard</div>
          <div class="category-toggle active" data-cat="ra">📦 R&amp;A</div>
          <div class="category-toggle active" data-cat="online">🛒 KUBE OS</div>
        </div>
      </div>
      <div id="panel-footer">
        <button id="panel-home-btn"     class="panel-footer-btn" disabled>← Hauptmenü</button>
        <button id="panel-overview-btn" class="panel-footer-btn" disabled>📋 Übersicht</button>
      </div>
    </div>
  `;


  // ═══════════════════════════════════════════════════════════════════════
  //  GeoMapWidget – Custom Element
  // ═══════════════════════════════════════════════════════════════════════
  class GeoMapWidget extends HTMLElement {

    constructor() {
      super();

      // Shadow DOM
      this._shadowRoot = this.attachShadow({ mode: 'open' });
      this._shadowRoot.appendChild(template.content.cloneNode(true));

      // Lifecycle-Infrastruktur (wird in disconnectedCallback konsumiert)
      this._timers        = new Set();   // alle active setTimeout/setInterval-IDs
      this._intervals     = new Set();   // separate Menge für Intervalle
      this._abortCtrl     = new AbortController();
      this._signal        = this._abortCtrl.signal;

      // Datenmodell
      this._myDataSource       = null;
      this._erhebungIndex      = null;
      this._plzNormCache       = null;
      this._rawPLZCache        = {};
      this._crossErhebungPLZ   = {};
      this._distanceCache      = null;
      this._distanceCacheNLKey = null;
      this._plzCenterCache     = {};
      this._layerByPLZ         = null;
      this._geoData            = null;
      this.geoNotes            = {};
      // Europäisierung: per-Land-GeoJSON-Verwaltung
      this._loadedLands          = new Set();
      this._geoLayerByLand       = new Map();
      this._geoJsonPromiseByLand = new Map();
      this._clickBoundByLand     = new Set();
      this._erhebungLand         = {};      // erhID → Land (DE/NL/CH) der NLs
      this._borderGroup          = null;    // LayerGroup der Länder-Außengrenzen
      this._borderByLand         = new Set();

      // Map-Objekte
      this.map              = null;
      this._tileLayer       = null;
      this._geoLayer        = null;
      this._canvasRenderer  = null;
      this._tilesVisible    = false;
      this.filteredGroup    = null;
      this.neighbourGroup   = null;
      this.radiusGroup      = null;
      this.bestreuungGroup  = null;
      this.criticalMarkers  = {};
      this._labelLayer      = null;   // LayerGroup für PLZ-Namens-Labels
      this._labelByPLZ      = {};     // plz → Leaflet-Marker (Label)
      this.iconCache        = {};

      // UI-State
      this.currentMapMode        = 'wk';
      this.activeCategories      = new Set(CATEGORIES);
      this.umsatzMainMode        = 'gesamt';
      this.umsatzDarstellung     = 'abs';
      this.useWerbeUmsatz        = true;
      this.useZusatzUmsatz       = false;
      this.useRadiusFilter       = true;
      this.showBestreuung        = false;
      this.showCompetitors       = false;
      this.showCritical          = false;
      this._sortState            = { column: null, direction: 'asc' };
      this._selectedNLs          = new Set();
      this._nlSelectionInitialized = false;
      this._activeFilter         = null;
      this._activePopupPLZ       = null;
      this._activePopupType      = null;
      this._highlightedPLZ       = null;
      this._lastHighlightedRow   = null;
      this._lastHighlightedLayer = null;
      this.filteredData          = null;
      this.filteredKennwerte     = {};
      this.filteredPLZWerte      = {};
      this.plzImRadius           = new Set();
      this.allNLs                = [];
      this.allMarkers            = [];
      this.nlMarkers             = [];
      this.Niederlassung         = {};
      this.nlKoordinaten         = {};
      this.hzFlags               = {};
      this.extraNLs              = [];

      // ── Multi-Erhebungs-Aggregation (Phase 1) ─────────────────────────
      // _activeErhebungen[]: aktiv kombinierte Erhebungen.
      // _erhebungRowsCache: BW-Rows pro Erhebung gecacht (vermeidet Reload).
      // _erhebungAggregatesCache: pre-aggregierte PLZ-Buckets pro Erhebung
      //   für inkrementelle Updates ohne Full-Recompute.
      // _crossGfDoppelAktiv: zeigt PLZs die in 2+ aktiven Erhebungen HZ=X sind.
      this._activeErhebungen        = [];   // [{ erhID, jahr, nummer }, ...]
      this._erhebungRowsCache       = new Map();   // key 'erhID|jahr|nummer' → rows[]
      this._erhebungAggregatesCache = new Map();   // key → { byPLZ: {...} }
      this._crossGfDoppelAktiv      = false;

      // Status-Flags
      this._bootstrapDone          = false;
      this._fullIndexReady         = false;
      this._fullDataLoaded         = false;
      this._renderInProgress       = false;
      this._pendingRender          = false;
      this._homeResetPending       = false;
      this._dropdownsInitialized   = false;
      this._plzFilterInitialized   = false;
      this._doppelbestreuungAktiv  = false;
      this._lastLoadedDoppelMode   = null;    // Welcher Doppel-Modus wurde zuletzt mit BW geladen
      this._doppelTooltipEl        = null;
      this._clickBoundByLand?.clear();

      // Geteilte Filter-Keys (werden beim ersten erfolgreichen set/remove gecached)
      this._plzFilterKey    = null;
      this._erhIDFilterKey  = null;
      this._jahrFilterKey   = null;
      this._nummerFilterKey = null;
    }

    // ── Lifecycle ──────────────────────────────────────────────────────
    connectedCallback() {
      // Re-Connect-fest: nach disconnect ist der AbortController aborted und alle
      // weiteren _on()-Calls würden ins Leere laufen. Bei jedem connect frisch.
      if (this._signal?.aborted) {
        this._abortCtrl = new AbortController();
        this._signal    = this._abortCtrl.signal;
      }

      // Bug 17 Fix: Sidebar-Click-Handler früh registrieren — vor Leaflet-Load.
      // Sonst kann der User im Hauptmenü auf die Anleitung klicken, bevor das
      // Setup (in _wireControlPanel) gelaufen ist.
      this._setupSidebarHandlers();

      // GeoJSON + Competitor-Daten parallel vorladen
      // Phase-1: nur DE vorladen. NL/CH werden lazy via loadGeoJson(land)
      // nachgeladen, sobald Daten dieses Landes auftauchen.
      this._prefetchGeoJson(DEFAULT_LAND);

      // Eingebettete Fallback-Daten — werden genutzt wenn der Fetch fehlschlägt
      const COMPETITOR_FALLBACK = [
        { brand: 'HOR', name: 'Hornbach 41063 Mönchengladbach',        lat: '51.2025', lon: '6.4445' },
        { brand: 'HOR', name: 'Hornbach 41199 Mönchengladbach',        lat: '51.1625', lon: '6.4835' },
        { brand: 'HOR', name: 'Hornbach 42285 Wuppertal',              lat: '51.2565', lon: '7.1915' },
        { brand: 'HOR', name: 'Hornbach 44145 Dortmund',               lat: '51.5345', lon: '7.4905' },
        { brand: 'HOR', name: 'Hornbach 44625 Herne',                  lat: '51.5285', lon: '7.2275' },
        { brand: 'HOR', name: 'Hornbach 45356 Essen',                  lat: '51.4745', lon: '6.9905' },
        { brand: 'HOR', name: 'Hornbach 45711 Datteln',                lat: '51.6575', lon: '7.3355' },
        { brand: 'HOR', name: 'Hornbach 45881 Gelsenkirchen',          lat: '51.5225', lon: '7.1035' },
        { brand: 'HOR', name: 'Hornbach 46047 Oberhausen',             lat: '51.4795', lon: '6.8755' },
        { brand: 'HOR', name: 'Hornbach 47055 Duisburg',               lat: '51.4155', lon: '6.7685' },
        { brand: 'HOR', name: 'Hornbach 47167 Duisburg',               lat: '51.4795', lon: '6.7855' },
        { brand: 'HOR', name: 'Hornbach 47443 Moers',                  lat: '51.4625', lon: '6.6765' },
        { brand: 'HOR', name: 'Hornbach 47803 Krefeld',                lat: '51.3355', lon: '6.5845' },
        { brand: 'HOR', name: 'Hornbach 48157 Münster',                lat: '51.9835', lon: '7.6915' },
        { brand: 'HOR', name: 'Hornbach 49084 Osnabrück',              lat: '52.2885', lon: '8.0785' },
        { brand: 'HOR', name: 'Hornbach 51105 Köln',                   lat: '50.9245', lon: '7.0205' },
        { brand: 'GLO', name: 'Globus 40670 Meerbusch',                lat: '51.272',  lon: '6.665'  },
        { brand: 'GLO', name: 'Globus 45770 Marl',                     lat: '51.662',  lon: '7.094'  },
        { brand: 'OBI', name: 'OBI 40231 Düsseldorf',                  lat: '51.2161', lon: '6.8160' },
        { brand: 'OBI', name: 'OBI 40472 Düsseldorf',                  lat: '51.2772', lon: '6.7977' },
        { brand: 'OBI', name: 'OBI 40549 Düsseldorf',                  lat: '51.2330', lon: '6.7110' },
        { brand: 'OBI', name: 'OBI 40721 Hilden',                      lat: '51.1578', lon: '6.9452' },
        { brand: 'OBI', name: 'OBI 40878 Ratingen',                    lat: '51.3031', lon: '6.8402' },
        { brand: 'OBI', name: 'OBI 41334 Nettetal',                    lat: '51.3117', lon: '6.2755' },
        { brand: 'OBI', name: 'OBI 41464 Neuss',                       lat: '51.1738', lon: '6.7027' },
        { brand: 'OBI', name: 'OBI 41747 Viersen',                     lat: '51.2584', lon: '6.3887' },
        { brand: 'OBI', name: 'OBI 41812 Erkelenz',                    lat: '51.0779', lon: '6.3155' },
        { brand: 'OBI', name: 'OBI 41836 Hückelhoven',                 lat: '51.0543', lon: '6.2162' },
        { brand: 'OBI', name: 'OBI 42103 Wuppertal',                   lat: '51.2612', lon: '7.1528' },
        { brand: 'OBI', name: 'OBI 42551 Velbert',                     lat: '51.3444', lon: '7.0267' },
        { brand: 'OBI', name: 'OBI 42655 Solingen',                    lat: '51.1735', lon: '7.0658' },
        { brand: 'OBI', name: 'OBI 42859 Remscheid',                   lat: '51.1894', lon: '7.2272' },
        { brand: 'OBI', name: 'OBI 42929 Wermelskirchen',              lat: '51.1352', lon: '7.2144' },
        { brand: 'OBI', name: 'OBI 45525 Hattingen',                   lat: '51.3995', lon: '7.1685' },
        { brand: 'OBI', name: 'OBI 45665 Recklinghausen',              lat: '51.6033', lon: '7.1678' },
        { brand: 'OBI', name: 'OBI 46325 Borken',                      lat: '51.8366', lon: '6.8488' },
        { brand: 'OBI', name: 'OBI 46446 Emmerich',                    lat: '51.8173', lon: '6.2735' },
        { brand: 'OBI', name: 'OBI 47475 Kamp-Lintfort',               lat: '51.4879', lon: '6.5367' },
        { brand: 'OBI', name: 'OBI 47906 Kempen',                      lat: '51.3654', lon: '6.4258' },
        { brand: 'OBI', name: 'OBI 48429 Rheine',                      lat: '52.2858', lon: '7.4243' },
        { brand: 'OBI', name: 'OBI 49377 Vechta',                      lat: '52.7483', lon: '8.2732' },
        { brand: 'OBI', name: 'OBI 49661 Cloppenburg',                 lat: '52.8464', lon: '8.0487' },
        { brand: 'OBI', name: 'OBI 49808 Lingen',                      lat: '52.5401', lon: '7.3308' },
        { brand: 'HEL', name: 'Hellweg 40789 Monheim',                 lat: '51.1077', lon: '6.9142' },
        { brand: 'HEL', name: 'Hellweg 40822 Mettmann',                lat: '51.2721', lon: '6.9535' },
        { brand: 'HEL', name: 'Hellweg 42109 Wuppertal',               lat: '51.2882', lon: '7.1725' },
        { brand: 'HEL', name: 'Hellweg 44143 Dortmund',                lat: '51.5273', lon: '7.5028' },
        { brand: 'HEL', name: 'Hellweg 44149 Dortmund (1)',            lat: '51.5362', lon: '7.4372' },
        { brand: 'HEL', name: 'Hellweg 44149 Dortmund (2)',            lat: '51.5076', lon: '7.4103' },
        { brand: 'HEL', name: 'Hellweg 44265 Dortmund',                lat: '51.4651', lon: '7.5255' },
        { brand: 'HEL', name: 'Hellweg 44809 Bochum',                  lat: '51.4938', lon: '7.2284' },
        { brand: 'HEL', name: 'Hellweg 45134 Essen',                   lat: '51.4269', lon: '7.0406' },
        { brand: 'HEL', name: 'Hellweg 45139 Essen',                   lat: '51.4623', lon: '7.0552' },
        { brand: 'HEL', name: 'Hellweg 45219 Essen',                   lat: '51.3915', lon: '6.9378' },
        { brand: 'HEL', name: 'Hellweg 45326 Essen',                   lat: '51.4847', lon: '6.9875' },
        { brand: 'HEL', name: 'Hellweg 45359 Essen',                   lat: '51.4752', lon: '6.9394' },
        { brand: 'HEL', name: 'Hellweg 45527 Hattingen',               lat: '51.3998', lon: '7.1853' },
        { brand: 'HEL', name: 'Hellweg 45659 Recklinghausen',          lat: '51.6124', lon: '7.2095' },
        { brand: 'HEL', name: 'Hellweg 46149 Oberhausen',              lat: '51.5281', lon: '6.8274' },
        { brand: 'HEL', name: 'Hellweg 46284 Dorsten',                 lat: '51.6602', lon: '6.9712' },
        { brand: 'HEL', name: 'Hellweg 46395 Bocholt',                 lat: '51.8457', lon: '6.6164' },
        { brand: 'HEL', name: 'Hellweg 47138 Duisburg',                lat: '51.4542', lon: '6.7815' },
        { brand: 'HEL', name: 'Hellweg 48155 Münster',                 lat: '51.9384', lon: '7.6763' },
        { brand: 'HEL', name: 'Hellweg 48161 Münster',                 lat: '51.9481', lon: '7.5472' },
        { brand: 'HEL', name: 'Hellweg 48249 Dülmen',                  lat: '51.8302', lon: '7.2804' },
        { brand: 'HEL', name: 'Hellweg 48565 Steinfurt',               lat: '52.1432', lon: '7.3361' },
        { brand: 'HEL', name: 'Hellweg 48599 Gronau (Westfalen)',      lat: '52.2136', lon: '7.0224' },
        { brand: 'HEL', name: 'Hellweg 48683 Ahaus',                   lat: '52.0783', lon: '7.0125' },
        { brand: 'HEL', name: 'Hellweg 49090 Osnabrück',               lat: '52.2931', lon: '8.0437' },
        { brand: 'TOO', name: 'Toom 40764 Langenfeld (Rheinland)',     lat: '51.1094', lon: '6.9495' },
        { brand: 'TOO', name: 'Toom 41065 Mönchengladbach',            lat: '51.1917', lon: '6.4763' },
        { brand: 'TOO', name: 'Toom 41334 Nettetal',                   lat: '51.3162', lon: '6.2805' },
        { brand: 'TOO', name: 'Toom 41516 Grevenbroich',               lat: '51.0923', lon: '6.5861' },
        { brand: 'TOO', name: 'Toom 44532 Lünen',                      lat: '51.6285', lon: '7.5142' },
        { brand: 'TOO', name: 'Toom 44866 Bochum',                     lat: '51.4926', lon: '7.1472' },
        { brand: 'TOO', name: 'Toom 45472 Mülheim (Ruhr)',             lat: '51.4443', lon: '6.9027' },
        { brand: 'TOO', name: 'Toom 45699 Herten',                     lat: '51.6038', lon: '7.1324' },
        { brand: 'TOO', name: 'Toom 45772 Marl',                       lat: '51.6594', lon: '7.1103' },
        { brand: 'TOO', name: 'Toom 45894 Gelsenkirchen',              lat: '51.5823', lon: '7.0485' },
        { brand: 'TOO', name: 'Toom 46240 Bottrop',                    lat: '51.5326', lon: '6.9378' },
        { brand: 'TOO', name: 'Toom 46562 Voerde (Niederrhein)',       lat: '51.5943', lon: '6.6881' },
        { brand: 'TOO', name: 'Toom 47059 Duisburg',                   lat: '51.4481', lon: '6.7623' },
        { brand: 'TOO', name: 'Toom 47228 Duisburg',                   lat: '51.4076', lon: '6.7215' },
        { brand: 'TOO', name: 'Toom 47506 Neukirchen-Vluyn',           lat: '51.4412', lon: '6.5573' },
        { brand: 'TOO', name: 'Toom 48153 Münster',                    lat: '51.9227', lon: '7.6471' },
        { brand: 'TOO', name: 'Toom 48231 Warendorf',                  lat: '51.9489', lon: '7.9975' },
        { brand: 'TOO', name: 'Toom 48527 Nordhorn',                   lat: '52.4306', lon: '7.0714' },
        { brand: 'TOO', name: 'Toom 49124 Georgsmarienhütte',          lat: '52.2005', lon: '8.0452' },
        { brand: 'TOO', name: 'Toom 49191 Belm',                       lat: '52.3027', lon: '8.1238' },
        { brand: 'TOO', name: 'Toom 49201 Dissen (Teutoburger Wald)', lat: '52.1154', lon: '8.1976' },
        { brand: 'TOO', name: 'Toom 49479 Ibbenbüren',                 lat: '52.2795', lon: '7.7173' },
        { brand: 'TOO', name: 'Toom 49525 Lengerich',                  lat: '52.1956', lon: '7.8653' },
        { brand: 'TOO', name: 'Toom 49811 Lingen (Ems)',               lat: '52.5204', lon: '7.3221' },
        { brand: 'HAG', name: 'Hagebau 40764 Langenfeld (Rheinland)', lat: '51.1078', lon: '6.9624' },
        { brand: 'HAG', name: 'Hagebau 40885 Ratingen',                lat: '51.3075', lon: '6.8521' },
        { brand: 'HAG', name: 'Hagebau 41189 Mönchengladbach',         lat: '51.1683', lon: '6.4152' },
        { brand: 'HAG', name: 'Hagebau 41352 Korschenbroich',          lat: '51.1874', lon: '6.5179' },
        { brand: 'HAG', name: 'Hagebau 41462 Neuss',                   lat: '51.2071', lon: '6.6853' },
        { brand: 'HAG', name: 'Hagebau 41540 Dormagen',                lat: '51.0912', lon: '6.8374' },
        { brand: 'HAG', name: 'Hagebau 41564 Kaarst',                  lat: '51.2256', lon: '6.6173' },
        { brand: 'HAG', name: 'Hagebau 41751 Viersen',                 lat: '51.2557', lon: '6.3925' },
        { brand: 'HAG', name: 'Hagebau 41812 Erkelenz',                lat: '51.0806', lon: '6.3124' },
        { brand: 'HAG', name: 'Hagebau 41844 Wegberg',                 lat: '51.1435', lon: '6.2843' },
        { brand: 'HAG', name: 'Hagebau 42781 Haan',                    lat: '51.1948', lon: '7.0041' },
        { brand: 'HAG', name: 'Hagebau 44357 Dortmund',                lat: '51.5391', lon: '7.3856' },
        { brand: 'HAG', name: 'Hagebau 44575 Castrop-Rauxel',          lat: '51.5562', lon: '7.3087' },
        { brand: 'HAG', name: 'Hagebau 44894 Bochum',                  lat: '51.4732', lon: '7.3041' },
        { brand: 'HAG', name: 'Hagebau 45478 Mülheim (Ruhr)',          lat: '51.4459', lon: '6.8796' },
        { brand: 'HAG', name: 'Hagebau 45721 Haltern (See)',           lat: '51.7364', lon: '7.1782' },
        { brand: 'HAG', name: 'Hagebau 45964 Gladbeck',                lat: '51.5713', lon: '6.9895' },
        { brand: 'HAG', name: 'Hagebau 46049 Oberhausen',              lat: '51.4715', lon: '6.8552' },
        { brand: 'HAG', name: 'Hagebau 46282 Dorsten',                 lat: '51.6615', lon: '6.9731' },
        { brand: 'HAG', name: 'Hagebau 46395 Bocholt',                 lat: '51.8402', lon: '6.6268' },
        { brand: 'HAG', name: 'Hagebau 46414 Rhede',                   lat: '51.8387', lon: '6.7005' },
        { brand: 'HAG', name: 'Hagebau 46485 Wesel',                   lat: '51.6624', lon: '6.6173' },
        { brand: 'HAG', name: 'Hagebau 46509 Xanten',                  lat: '51.6631', lon: '6.4552' },
        { brand: 'HAG', name: 'Hagebau 46539 Dinslaken',               lat: '51.5683', lon: '6.7374' },
        { brand: 'HAG', name: 'Hagebau 47179 Duisburg',                lat: '51.5074', lon: '6.7621' },
        { brand: 'HAG', name: 'Hagebau 47495 Rheinberg',               lat: '51.5436', lon: '6.5972' },
        { brand: 'HAG', name: 'Hagebau 47533 Kleve',                   lat: '51.7895', lon: '6.1403' },
        { brand: 'HAG', name: 'Hagebau 47574 Goch',                    lat: '51.6762', lon: '6.1541' },
        { brand: 'HAG', name: 'Hagebau 47608 Geldern',                 lat: '51.5173', lon: '6.3237' },
        { brand: 'HAG', name: 'Hagebau 48268 Greven',                  lat: '52.0914', lon: '7.6083' },
        { brand: 'HAG', name: 'Hagebau 48301 Nottuln',                 lat: '51.9295', lon: '7.3571' },
        { brand: 'HAG', name: 'Hagebau 48455 Bad Bentheim',            lat: '52.3002', lon: '7.1618' },
        { brand: 'HAG', name: 'Hagebau 48477 Hörstel',                 lat: '52.2973', lon: '7.5854' },
        { brand: 'HAG', name: 'Hagebau 48607 Ochtrup',                 lat: '52.2085', lon: '7.1892' },
        { brand: 'HAG', name: 'Hagebau 48653 Coesfeld',                lat: '51.9452', lon: '7.1637' },
        { brand: 'HAG', name: 'Hagebau 48712 Gescher',                 lat: '51.9527', lon: '7.0028' },
        { brand: 'HAG', name: 'Hagebau 49124 Georgsmarienhütte',       lat: '52.2051', lon: '8.0472' },
        { brand: 'HAG', name: 'Hagebau 49152 Bad Essen',               lat: '52.3207', lon: '8.3426' },
        { brand: 'HAG', name: 'Hagebau 49176 Hilter (Teutoburger Wald)', lat: '52.1354', lon: '8.1597' },
        { brand: 'HAG', name: 'Hagebau 49324 Melle',                   lat: '52.2038', lon: '8.3381' },
        { brand: 'HAG', name: 'Hagebau 49356 Diepholz',                lat: '52.6032', lon: '8.3715' },
        { brand: 'HAG', name: 'Hagebau 49393 Lohne (Oldenburg)',       lat: '52.6624', lon: '8.2361' },
        { brand: 'HAG', name: 'Hagebau 49401 Damme',                   lat: '52.5174', lon: '8.1942' },
        { brand: 'HAG', name: 'Hagebau 49504 Lotte',                   lat: '52.2713', lon: '7.9235' },
        { brand: 'HAG', name: 'Hagebau 49525 Lengerich',               lat: '52.1937', lon: '7.8592' },
        { brand: 'HAG', name: 'Hagebau 49565 Bramsche',                lat: '52.4063', lon: '7.9821' },
        { brand: 'HAG', name: 'Hagebau 49610 Badbergen',               lat: '52.6375', lon: '7.9752' },
        { brand: 'HAG', name: 'Hagebau 49661 Cloppenburg',             lat: '52.8452', lon: '8.0463' },
        { brand: 'HAG', name: 'Hagebau 49716 Meppen',                  lat: '52.6894', lon: '7.2912' },
        { brand: 'HAG', name: 'Hagebau 49733 Haren (Ems)',             lat: '52.7921', lon: '7.2456' },
      ];

      const applyCompetitorData = (raw, source) => {
        const brandAlias = { HOR: 'Hornbach', OBI: 'OBI', GLO: 'Globus', HEL: 'Hellweg', TOO: 'Toom', HAG: 'Hagebau' };
        let entries;
        if (Array.isArray(raw)) {
          entries = raw;
        } else if (raw && typeof raw === 'object') {
          // Erlaubte Object-Formate:
          //   { "name1": { brand, lat, lon }, "name2": {...} }
          //   { "mitbewerber": [...] } oder { "data": [...] } → unwrap
          if (Array.isArray(raw.mitbewerber)) entries = raw.mitbewerber;
          else if (Array.isArray(raw.data))   entries = raw.data;
          else if (Array.isArray(raw.competitors)) entries = raw.competitors;
          else entries = Object.entries(raw).map(([name, v]) => ({ name, ...v }));
        } else {
          console.warn('[PLZ-Widget] competitor: unerwartetes Format', typeof raw);
          entries = [];
        }
        this._competitorData = entries.map(v => ({
          name:  v.name  ?? '–',
          brand: brandAlias[v.brand] ?? v.brand ?? 'Unbekannt',
          lat:   Number(v.lat),
          lon:   Number(v.lon),
        })).filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lon));
        console.info(`[PLZ-Widget] Mitbewerber [${source}]: ${this._competitorData.length} valide Einträge (von ${entries.length} Rohzeilen)`);
        if (this.showCompetitors && this.map) this.updateCompetitorMarkers();
      };

      // Fetch mit explizit deaktiviertem HTTP-Cache.
      // 'force-cache' hatte das Problem, dass eine einmalig fehlgeschlagene
      // Response (z.B. eine 404 von vor dem File-Upload) für die ganze
      // Browser-Session gecacht blieb, sodass auch nach erfolgreichem
      // File-Upload immer der Fallback griff.
      console.info(`[PLZ-Widget] competitor.json Fetch beginnt: ${COMPETITORS_URL}`);
      fetch(COMPETITORS_URL, { cache: 'no-cache' })
        .then(r => {
          console.info(`[PLZ-Widget] competitor.json HTTP ${r.status} | Content-Type: ${r.headers.get('content-type')}`);
          if (!r.ok) {
            // HTTP-Fehler → explizit als solchen behandeln, statt erst auf Text-Inhalt zu prüfen
            throw new Error(`HTTP ${r.status}`);
          }
          return r.text();
        })
        .then(text => {
          const clean = text.replace(/^\uFEFF/, '').trim();
          // GitHub Raw liefert manchmal HTML statt 404 (z.B. wenn der Branch
          // nicht existiert). Defensive Erkennung.
          if (!clean) {
            console.warn('[PLZ-Widget] competitor.json: leere Response — nutze Fallback');
            applyCompetitorData(COMPETITOR_FALLBACK, 'Fallback');
            return;
          }
          if (clean.startsWith('<') || clean === '404: Not Found') {
            console.warn('[PLZ-Widget] competitor.json: HTML/404-Response statt JSON — nutze Fallback');
            console.warn('[PLZ-Widget] Erste 200 Zeichen:', clean.slice(0, 200));
            applyCompetitorData(COMPETITOR_FALLBACK, 'Fallback');
            return;
          }
          try {
            const parsed = JSON.parse(clean);
            applyCompetitorData(parsed, 'GitHub');
          } catch (parseErr) {
            console.error('[PLZ-Widget] competitor.json Parse-Fehler — nutze Fallback:', parseErr.message);
            console.error('[PLZ-Widget] Erste 200 Zeichen des Body:', clean.slice(0, 200));
            applyCompetitorData(COMPETITOR_FALLBACK, 'Fallback');
          }
        })
        .catch(err => {
          console.warn(`[PLZ-Widget] competitor.json Fetch-Fehler (${err.name}: ${err.message}) — nutze Fallback`);
          applyCompetitorData(COMPETITOR_FALLBACK, 'Fallback');
        });

      this._showCinematicLoader();
      this._updateLoaderPhase(1, 'Leaflet wird geladen…');

      if (!window.L) {
        const link = document.createElement('link');
        link.rel = 'stylesheet'; link.href = LEAFLET_CSS;
        const script = document.createElement('script');
        script.src = LEAFLET_JS;
        script.onload = () => {
          if (!this.isConnected) return;   // Widget schon entfernt → abbrechen
          this._updateLoaderPhase(2, 'Karte wird initialisiert…');
          this.initializeMapBase();
        };
        this._shadowRoot.appendChild(link);
        this._shadowRoot.appendChild(script);
      } else {
        this._updateLoaderPhase(2, 'Karte wird initialisiert…');
        this.initializeMapBase();
      }
    }

    disconnectedCallback() {
      // Alle Timer stoppen
      for (const id of this._timers)    clearTimeout(id);
      for (const id of this._intervals) clearInterval(id);
      this._timers.clear();
      this._intervals.clear();

      // Alle DOM-Listener abhängen (addEventListener mit signal: this._signal)
      this._abortCtrl.abort();

      // Leaflet sauber abbauen
      if (this.map) {
        try { this.map.off(); this.map.remove(); } catch (e) { /* swallow */ }
        this.map = null;
      }
      // Layer-Referenzen explizit nullen, damit ein eventueller Re-Connect
      // (gleiche Instanz, neue map) die Layer korrekt neu aufbaut.
      this._geoLayer       = null;
      this._labelLayer     = null;
      this._tileLayer      = null;
      this._canvasRenderer = null;
      this.filteredGroup   = null;
      this.neighbourGroup  = null;
      this.radiusGroup     = null;
      this.bestreuungGroup = null;
      this.competitorGroup = null;   // Mitbewerber-Marker
      this._competitorData = null;   // geladene competitor.json
      this._previewGroup   = null;
      this._radiusPreviewGroup = null;   // Live-Radius-Preview-Kreise

      // Caches freigeben
      this._plzNormCache = null;
      this._erhebungIndex = null;
      this._distanceCache = null;
      this._plzCenterCache = null;
      this._layerByPLZ = null;
      this._loadedLands?.clear();
      this._geoLayerByLand?.clear();
      this._geoJsonPromiseByLand?.clear();
      this._borderByLand?.clear();
      this._borderGroup = null;
      this._erhebungLand = {};
      this._labelByPLZ = {};
      this.criticalMarkers = {};
      this.iconCache = {};

      // Init-Flags zurücksetzen, damit ein eventueller Re-Connect sauber neu aufsetzt
      this._dropdownsInitialized = false;
      this._plzFilterInitialized = false;
      this._clickBoundByLand?.clear();
      this._bootstrapDone        = false;
      this._fullIndexReady       = false;
      this._fullDataLoaded       = false;
      this._renderInProgress     = false;
      this._pendingRender        = false;
      this._dataPollTimer        = null;
      this._loadSecTimer         = null;
      this._previewInterval      = null;
      this._homeResetSafetyTimer = null;
      this._homeResetPending     = false;
      this._partnerToggleInProgress = false;
      // Phase 2: Sidebar-State zurücksetzen für sauberen Re-Connect.
      // Bei Re-Connect ist das Shadow-DOM-Template wieder frisch, also dürfen
      // die View-Container nicht als "schon gerendert" markiert sein.
      this._docsViewInitialized  = false;
      this._sidebarView          = null;
      this._analysisOpenState    = null;
      this._leftPaneVisible      = true;
      this._filterFieldsCollapsed = false;
    }

    // Tracked setTimeout/Interval — werden in disconnectedCallback aufgeräumt
    _setTimeout(fn, ms) {
      const id = setTimeout(() => { this._timers.delete(id); fn(); }, ms);
      this._timers.add(id);
      return id;
    }
    _clearTimeout(id) {
      if (id == null) return;
      clearTimeout(id);
      this._timers.delete(id);
    }
    _setInterval(fn, ms) {
      const id = setInterval(fn, ms);
      this._intervals.add(id);
      return id;
    }
    _clearInterval(id) {
      if (id == null) return;
      clearInterval(id);
      this._intervals.delete(id);
    }

    // Shortcut für addEventListener mit AbortController-Signal
    _on(el, type, handler, opts) {
      if (!el) return;
      el.addEventListener(type, handler, { ...(opts || {}), signal: this._signal });
    }

    // Shortcut für getElementById im Shadow-Root
    $(id) { return this._shadowRoot.getElementById(id); }

    // ── PLZ-Normalisierung mit LRU-light Cache ─────────────────────────
    // BW liefert char(10) z.B. "0000069151" → letzte 5 Stellen = "69151".
    // Normale <=5-stellige PLZs werden mit padStart aufgefüllt.
    _normalizePLZ(raw, land = DEFAULT_LAND) {
      if (raw == null) return null;
      const len = COUNTRY_CONFIG[land]?.plzLen ?? 5;
      if (!this._plzNormCache) this._plzNormCache = new Map();
      const cacheKey = land + '|' + raw;   // landesabhängig cachen
      const cached = this._plzNormCache.get(cacheKey);
      if (cached !== undefined) return cached;

      let s = String(raw);
      if (s.includes(' ')) s = s.replace(/\s/g, '');
      let result;
      if (!s || s === '@NullMember' || s === '@TotalMembers') result = null;
      else if (s.length > len)                                result = s.slice(-len);
      else                                                    result = s.padStart(len, '0');

      if (this._plzNormCache.size > 20000) this._plzNormCache.clear();
      this._plzNormCache.set(cacheKey, result);
      return result;
    }

    // Einheitliche GF-Bereich-Formatierung
    _fmtGF(id) {
      if (!id) return id;
      const land = this._erhebungLand?.[id] || DEFAULT_LAND;
      const prefix = land === 'DE' ? 'GF-Bereich' : 'ErhebungsID';
      const name = LAND_NAMES[land];
      return `${prefix} ${id}${name ? ' (' + name + ')' : ''}`;
    }

    // ── Länder-Helfer (Europäisierung) ─────────────────────────────────
    // Composite-Key aus Land + PLZ — eindeutig über Grenzen hinweg.
    _plzKey(land, plz) { return (land || DEFAULT_LAND) + ':' + plz; }

    // Land einer BW-Row. Fallback DEFAULT_LAND solange dimension_land fehlt.
    _landOfRow(row) {
      const land = row?.['dimension_land_0']?.id?.trim();
      return (land && COUNTRY_CONFIG[land]) ? land : DEFAULT_LAND;
    }

    // Aggregat-/Stammdaten-PLZ (00000 / 0000). Prüfung auf die nackte PLZ.
    _isAggregatePlz(barePlz) { return /^0+$/.test(barePlz || ''); }

    _prefetchGeoJson(land) {
      if (this._geoJsonPromiseByLand.has(land)) return this._geoJsonPromiseByLand.get(land);
      const cfg = COUNTRY_CONFIG[land];
      if (!cfg) return Promise.resolve(null);
      const p = fetch(GEO_BASE_URL + cfg.file, { cache: 'force-cache' })
        .then(r => r.json())
        .catch(err => { console.error(`[PLZ-Widget] GeoJSON prefetch ${land}:`, err); return null; });
      this._geoJsonPromiseByLand.set(land, p);
      return p;
    }

    // Lädt GeoJSONs aller in `rows` vorkommenden Länder (Cross-Border-fähig).
    async _ensureLandsForData(rows) {
      if (!Array.isArray(rows)) return;
      const lands = new Set();
      for (let i = 0; i < rows.length; i++) lands.add(this._landOfRow(rows[i]));
      for (const land of lands) {
        if (!this._loadedLands.has(land)) await this.loadGeoJson(land);
      }
    }


    // ── Erhebungs-Index (ein Pass über alle Rohdaten) ──────────────────
    // Für Fremd-Erhebungen nur HZ=X Rows → 80-90% kleinerer Index.
    //
    // Domain-Frage 5 (geklärt, mit Vorbehalt für Zukunft): Aktuell wird ein
    // einzelner GF-Bereich + Doppelbestreuungs-Erkennung über Fremd-Erhebungen
    // ausgewertet. Wenn später mehrere GF-Bereiche gleichzeitig analysiert
    // werden sollen (Streuverlust durch Nachbar-GF-Bereiche, Cross-GF-Umsatz-
    // Aggregation), reicht der HZ=X-Filter NICHT mehr — dann müssen auch
    // Nachbar-NL-Rows der Fremd-Erhebungen behalten werden. Im aktuellen
    // Use-Case wäre das aber Speicher-Verschwendung.
    // ── Erhebungs-Index (ein Pass über alle Rohdaten) ──────────────────
    // Für **aktive** Erhebungen werden alle Rows behalten (Vollumsatz).
    // Für **fremde** Erhebungen nur HZ=X Rows → 80-90% kleinerer Index.
    //
    // Phase 1 (Multi-GF): wenn der User Partner-Erhebungen dazuschaltet,
    // sind diese ebenfalls "aktiv" — ohne diese Unterscheidung würden
    // Nachbar-NL-Umsätze der Partner-GFs verloren gehen (siehe Punkt 2-Bug).
    //
    // Argument akzeptiert sowohl einen einzelnen String (Backwards-Compat)
    // als auch ein Array von ErhIDs.
    _buildErhebungIndex(activeErhIDs) {
      const data = this._myDataSource?.data;
      if (!Array.isArray(data)) { this._erhebungIndex = {}; return; }
      const idx = {};
      // Aktive ErhIDs normalisieren in ein Set für O(1)-Lookups.
      let activeSet = null;
      if (Array.isArray(activeErhIDs)) {
        if (activeErhIDs.length > 0) activeSet = new Set(activeErhIDs);
      } else if (activeErhIDs) {
        activeSet = new Set([activeErhIDs]);
      }
      const hasActiveFilter = !!activeSet;
      for (let i = 0, len = data.length; i < len; i++) {
        const row = data[i];
        // Bug-Fix B19: trim() konsistent — _buildStrukturFromRows nutzt ihn auch.
        // Ohne trim hier würden Index-Keys mit Spaces nicht zu den Dropdown-Werten passen.
        const eID = row['dimension_erhebung_0']?.id?.trim();
        const yr  = row['dimension_jahr_0']?.id?.trim();
        const nr  = row['dimension_erhebungsnummer_0']?.id?.trim();
        if (isNull(eID) || isNull(yr) || isNull(nr)) continue;
        if (this._erhebungLand[eID] === undefined) this._erhebungLand[eID] = this._landOfRow(row);
        // Fremd-Erhebung (= nicht in der aktiven Liste): nur HZ=X Rows speichern
        if (hasActiveFilter && !activeSet.has(eID)) {
          if (row['dimension_hzflag_0']?.id?.trim() !== 'X') continue;
        }
        const key = eID + '|' + yr + '|' + nr;
        (idx[key] ||= []).push(row);
      }
      this._erhebungIndex = idx;
    }

    _getErhebungRows(erhID, jahr, nummer) {
      if (!this._erhebungIndex) {
        // Phase-1: Wenn der Index lazy aufgebaut wird, alle aktiven Erhebungen
        // mit reinnehmen, sonst gehen Nachbar-NL-Umsätze der Partner-GFs verloren.
        const activeIDs = (this._activeErhebungen?.length || 0) > 0
          ? this._activeErhebungen.map(e => e.erhID)
          : [erhID];
        this._buildErhebungIndex(activeIDs);
      }
      return this._erhebungIndex[erhID + '|' + jahr + '|' + nummer] || [];
    }

    // ── Multi-Erhebungs-Helper (Phase 1) ────────────────────────────────
    // Iterator über die Rows aller aktiv-kombinierten Erhebungen.
    // Reihenfolge: Basis-Erhebung zuerst, dann zugeschaltete in Auswahl-Order.
    _getAllActiveRows() {
      if (!this._activeErhebungen || this._activeErhebungen.length === 0) {
        // Backwards-compat: wenn keine Multi-Liste, nutze _activeFilter.
        if (!this._activeFilter) return [];
        const { erhID, jahr, nummer } = this._activeFilter;
        return this._getErhebungRows(erhID, jahr, nummer);
      }
      // Single-Erhebung: direkter Rückgabewert ohne Allocation.
      if (this._activeErhebungen.length === 1) {
        const { erhID, jahr, nummer } = this._activeErhebungen[0];
        return this._getErhebungRows(erhID, jahr, nummer);
      }
      // Multi: Konkatenation. Bei N Erhebungen × ~27k Rows entsteht ein Array
      // mit N×27k Refs (kein Datenkopier, nur Pointer). Performance ok bis ~10.
      const out = [];
      for (const { erhID, jahr, nummer } of this._activeErhebungen) {
        const rows = this._getErhebungRows(erhID, jahr, nummer);
        for (let i = 0, len = rows.length; i < len; i++) out.push(rows[i]);
      }
      return out;
    }

    // Liste der Partner-Erhebungen (gleiches Jahr+Nummer wie Basis, aber andere
    // ErhID). Quelle: _erhData via setupFilterDropdowns aufgebaut.
    _getPartnerErhebungen() {
      const base = this._activeErhebungen?.[0];
      if (!base) return [];
      const partners = [];
      const erhData = this._erhData || {};
      for (const erhID of Object.keys(erhData)) {
        if (erhID === base.erhID) continue;
        const jahre = erhData[erhID];
        const nummern = jahre?.[base.jahr];
        if (!nummern) continue;
        const arr = nummern instanceof Set ? [...nummern] : nummern;
        if (arr.includes(base.nummer)) {
          partners.push({ erhID, jahr: base.jahr, nummer: base.nummer });
        }
      }
      return partners;
    }

    _isErhebungActive(erhID) {
      return this._activeErhebungen?.some(e => e.erhID === erhID) || false;
    }

    _erhKey(e) { return e.erhID + '|' + e.jahr + '|' + e.nummer; }

    // ── Partner-Erhebung zu/wegschalten (Phase 1) ──────────────────────
    // Lädt eine zusätzliche Erhebung mit gleichem Jahr+Nummer wie die Basis
    // dazu (BW-Multi-Filter), oder entfernt sie aus der aktiven Liste.
    //
    // Performance: BW-Roundtrip nötig nur beim Hinzufügen (Multi-Filter
    // anpassen). Entfernen geht client-seitig, weil die Rows im Cache /
    // _erhebungIndex bleiben — wir filtern sie nur aus der Aggregation raus.
    //
    // Cache-Strategie: nach BW-Reload bleiben alte Rows der nicht-aktiven
    // Erhebungen im Index erhalten, solange BW sie liefert (was es im Multi-
    // Filter-Modus tut). Wenn der User mehrere Erhebungen dazuschaltet und
    // wieder entfernt, ist der Index in einem konsistenten Zustand.
    // ── Legacy: togglePartnerErhebung ───────────────────────────────────
    // Diese Methode war der ursprüngliche Sofort-Toggle-Mechanismus, der
    // mit Phase 2 durch den Pending+Apply-Workflow ersetzt wurde. Sie ist
    // erhalten geblieben für externe Aufrufer (z.B. SAC-Scripting) und
    // wird intern NICHT mehr aufgerufen — die Picker-UI nutzt jetzt
    // _togglePendingPartner + _applyPendingPartners.
    async togglePartnerErhebung(erhID) {
      if (!this._activeFilter || !this._activeErhebungen?.length) return;
      // Bug 22 Fix: Double-Click-Schutz. Wenn ein BW-Reload für eine vorige
      // Partner-Toggle-Aktion läuft, blockieren wir weitere Klicks — sonst
      // gibt es Race Conditions zwischen den Reloads.
      if (this._partnerToggleInProgress) {
        console.info('[PLZ-Widget] togglePartnerErhebung blockiert: vorige Aktion läuft noch');
        return;
      }
      this._partnerToggleInProgress = true;
      try {
        const base = this._activeErhebungen[0];
        if (erhID === base.erhID) return;   // Basis darf nicht entfernt werden

        const idx = this._activeErhebungen.findIndex(e => e.erhID === erhID);
        const wasActive = idx >= 0;

        if (wasActive) {
          this._activeErhebungen.splice(idx, 1);
        } else {
          this._activeErhebungen.push({ erhID, jahr: base.jahr, nummer: base.nummer });
        }

        // BW-Filter aktualisieren mit neuer ErhID-Liste
        const allErhIDs = this._activeErhebungen.map(e => e.erhID);
        const switched = this._switchToErhebungFilter(allErhIDs, base.jahr, base.nummer);

        // Phase-1 (Punkt 2-Bug): Index muss mit der neuen aktiven Liste neu
        // gebaut werden — sonst sind die neu hinzugekommenen Erhebungen noch
        // im "fremd"-Modus (nur HZ=X) und Nachbar-NL-Umsätze fehlen. Bei einem
        // BW-Reload würde render() das ohnehin neu machen, aber das verhindert
        // einen Zwischenzustand mit falschen Zahlen.
        // Aggregat-Cache invalidieren — die Pre-Aggregate sind jetzt veraltet
        // (Partner-Daten haben sich geändert).
        this._erhebungIndex = null;
        this._erhebungAggregatesCache?.clear();

        if (switched) {
          // Phase-1: User-Feedback — Loader während BW reload läuft, sonst
          // wirkt der Click "stumm" für 2-5 Sekunden.
          this._showCinematicLoader?.();
          const action = wasActive ? 'wird entfernt' : 'wird hinzugefügt';
          this._updateLoaderPhase?.(1, `${erhID} ${action}…`);
          // Daten werden nachgeladen, dann triggert _scheduleDataPoll → render()
          this._fullDataLoaded = true;
          if (!this._renderInProgress) this._scheduleDataPoll();
        } else {
          // Fallback: BW nicht erreichbar, lokal neu aggregieren.
          // Index ist null → _getAllActiveRows triggert _buildErhebungIndex
          // mit der neuen Active-Liste → korrekte Daten.
          this.filteredData = this._getAllActiveRows();
          this.applyRadiusFilter(Number(this.$('radius-slider')?.value ?? 40));
          this.updateGeoLayer();
          this.renderDataTable(this.filteredKennwerte);
        }
        // UI-Update: Partner-Picker re-rendern
        this._renderPartnerErhebungPicker();
      } finally {
        // Flag wird mit kleinem Delay zurückgesetzt, damit der BW-Reload
        // wirklich starten kann bevor der nächste Klick verarbeitet wird.
        // Das render() setzt _renderInProgress, was der primäre Schutz ist —
        // dieses Flag schützt nur den kurzen Moment zwischen Click und
        // Reload-Start.
        this._setTimeout(() => { this._partnerToggleInProgress = false; }, 400);
      }
    }

    // Gemeinsame Struktur-Ableitung: {erhID: {jahr: Set<nummer>}}
    _buildStrukturFromRows(rows) {
      const struktur = {};
      for (let i = 0, len = rows.length; i < len; i++) {
        const row   = rows[i];
        const erhID = row['dimension_erhebung_0']?.id?.trim();
        const jahr  = row['dimension_jahr_0']?.id?.trim();
        const nr    = row['dimension_erhebungsnummer_0']?.id?.trim();
        if (isNull(erhID) || isNull(jahr) || isNull(nr)) continue;
        (struktur[erhID] ||= {});
        (struktur[erhID][jahr] ||= new Set()).add(nr);
      }
      return struktur;
    }

    buildErhebungsStruktur(data) {
      // Falls Index vorhanden: daraus ableiten – ein Level flacher als Rohdaten
      if (this._erhebungIndex) {
        const struktur = {};
        for (const key of Object.keys(this._erhebungIndex)) {
          const [erhID, jahr, nummer] = key.split('|');
          (struktur[erhID] ||= {});
          (struktur[erhID][jahr] ||= new Set()).add(nummer);
        }
        return struktur;
      }
      return this._buildStrukturFromRows(data);
    }

    // ── SAC DataSource-Zugriff ─────────────────────────────────────────
    _getDataSource() {
      try {
        return this.dataBindings?.getDataBinding('myDataSource')?.getDataSource() ?? null;
      } catch (e) {
        console.warn('[PLZ-Widget] DataSource nicht verfügbar:', e);
        return null;
      }
    }

    // Alle potentiell gesetzten ErhID/Jahr/Nummer-Filter entfernen
    _removeAllErhebungFilters(ds) {
      for (const key of ALL_STALE_KEYS) {
        try { ds.removeDimensionFilter(key); } catch (e) { /* war nicht gesetzt */ }
      }
      this._erhIDFilterKey = null;
      this._jahrFilterKey  = null;
      this._nummerFilterKey = null;
    }

    // Versucht, einen Filter über eine der möglichen Key-Varianten zu setzen.
    // Gibt den erfolgreichen Key zurück oder null.
    _trySetFilter(ds, keys, values) {
      for (const key of keys) {
        try { ds.setDimensionFilter(key, values); return key; } catch (e) { /* weiter */ }
      }
      return null;
    }

    // Initialer PLZ=00000-Filter beim Widget-Start.
    // BW liefert dann nur ~161 Rows statt 27k → Bootstrap in <1s.
    _applyPLZ00000Filter() {
      const ds = this._getDataSource();
      if (!ds) return;
      try {
        this._removeAllErhebungFilters(ds);
        const key = this._trySetFilter(ds, PLZ_FILTER_KEYS, ['00000']);
        if (key) {
          this._plzFilterKey = key;
          console.info('[PLZ-Widget] PLZ=00000 Filter gesetzt (' + key + ')');
        } else {
          console.warn('[PLZ-Widget] PLZ=00000 Filter konnte nicht gesetzt werden');
        }
      } catch (e) {
        console.warn('[PLZ-Widget] _applyPLZ00000Filter:', e);
      }
    }

    // Wechsel der BW-Filter vor dem removeDimensionFilter für PLZ.
    // Doppelbestreuung aus → ErhebungsID + Jahr + Nummer (nur eigene Erhebung).
    // Doppelbestreuung ein → nur Jahr + Nummer (alle Erhebungen).
    //
    // Phase-1-Erweiterung: erhID kann String ODER Array sein. Bei Array werden
    // alle angegebenen ErhIDs gleichzeitig per Multi-Select in den BW-Filter
    // gesetzt (Jahr + Nummer bleiben einheitlich). Bei _doppelbestreuungAktiv
    // wird der ErhID-Filter weiterhin weggelassen (alle Erhebungen aller GFs).
    _switchToErhebungFilter(erhID, jahr, nummer) {
      const ds = this._getDataSource();
      if (!ds) return false;
      const t0 = performance.now();

      // erhID-Liste normalisieren: String → [String]
      const erhIDs = Array.isArray(erhID) ? erhID.filter(Boolean) : (erhID ? [erhID] : []);

      if (!this._doppelbestreuungAktiv) {
        const kE = this._trySetFilter(ds, ERH_FILTER_KEYS,    erhIDs);
        const kJ = this._trySetFilter(ds, JAHR_FILTER_KEYS,   [jahr]);
        const kN = this._trySetFilter(ds, NUMMER_FILTER_KEYS, [nummer]);
        this._erhIDFilterKey  = kE;
        this._jahrFilterKey   = kJ;
        this._nummerFilterKey = kN;
      } else {
        // ErhID-Filter aus vorigem "ohne Doppelbestreuung"-Lauf sicher entfernen
        if (this._erhIDFilterKey) {
          try { ds.removeDimensionFilter(this._erhIDFilterKey); } catch (e) {}
          this._erhIDFilterKey = null;
        } else {
          for (const k of ERH_FILTER_KEYS) {
            try { ds.removeDimensionFilter(k); } catch (e) {}
          }
        }
        this._jahrFilterKey   = this._trySetFilter(ds, JAHR_FILTER_KEYS,   [jahr]);
        this._nummerFilterKey = this._trySetFilter(ds, NUMMER_FILTER_KEYS, [nummer]);
      }

      // PLZ-Filter entfernen → triggert BW-Reload ohne PLZ-Einschränkung.
      //
      // Reihenfolge der Strategien (von sicher zu Fallback):
      // 1) removeDimensionFilter mit dem beim Bootstrap gecachten Key
      // 2) removeDimensionFilter mit allen bekannten Keys
      // 3) setDimensionFilter(key, []) — leeres Array als "kein Filter"
      //    (in manchen SAC-Versionen äquivalent zu remove)
      //
      // Wichtig: SAC wirft keine Exception bei removeDimensionFilter wenn
      // der Key existiert aber kein Filter aktiv ist → wir können Erfolg
      // nicht sicher messen. Wir führen alle Versuche durch und setzen
      // removed=true wenn kein Ausnahme-Pfad die komplette Schleife abbricht.
      const knownPlzKey = this._plzFilterKey ? [this._plzFilterKey] : [];
      const plzKeysOrdered = [...new Set([...knownPlzKey, ...PLZ_FILTER_KEYS])];
      let removed = false;

      // Strategie 1+2: removeDimensionFilter
      for (const k of plzKeysOrdered) {
        try {
          ds.removeDimensionFilter(k);
          console.info(`[PLZ-Widget] removeDimensionFilter(${k}) OK`);
          removed = true;
        } catch (e) {
          console.warn(`[PLZ-Widget] removeDimensionFilter(${k}) fehler:`, e?.message ?? String(e));
        }
      }

      // Strategie 3: leeres Array als Fallback
      if (!removed) {
        for (const k of plzKeysOrdered) {
          try {
            ds.setDimensionFilter(k, []);
            console.info(`[PLZ-Widget] setDimensionFilter(${k}, []) OK (Fallback)`);
            removed = true;
          } catch (e) {
            console.warn(`[PLZ-Widget] setDimensionFilter(${k}, []) fehler:`, e?.message ?? String(e));
          }
        }
      }

      if (removed) {
        this._plzFilterKey = null;
        this._filterSwitchTime = Date.now();
        this._lastRowCountSinceSwitch = undefined;
        // Lock: Setter-Aufrufe in den ersten 2s nach Filter-Switch werden
        // ignoriert — SAC schickt durch das "dirty"-Marking Re-Renders die
        // noch den alten gecachten Datenstand liefern. Nur der Poll-Tick
        // darf in diesem Fenster die echten Daten akzeptieren.
        this._filterSwitchLockUntil = Date.now() + 2000;
        console.info(`[PLZ-Widget] Filter-Switch OK (${erhIDs.length} ErhID) in ${(performance.now() - t0).toFixed(0)}ms`);
      } else {
        console.error('[PLZ-Widget] KRITISCH: PLZ-Filter konnte nicht entfernt werden!');
      }
      return removed;
    }

    // ── Bootstrap aus PLZ=00000-Rows ───────────────────────────────────
    _bootstrapFromPLZ00000(rows) {
      if (this._bootstrapDone) return;
      this._bootstrapDone = true;

      // Bug-Fix B9: Home-Reset-Pending sicher löschen, sobald Bootstrap erfolgt.
      this._homeResetPending = false;
      if (this._homeResetSafetyTimer) {
        this._clearTimeout(this._homeResetSafetyTimer);
        this._homeResetSafetyTimer = null;
      }

      const t0 = performance.now();

      // Index aus den 00000-Rows aufbauen
      // Bug-Fix B19: .trim() konsistent zu _buildErhebungIndex und _buildStrukturFromRows
      const idx = {};
      for (const row of rows) {
        const eID = row['dimension_erhebung_0']?.id?.trim();
        const yr  = row['dimension_jahr_0']?.id?.trim();
        const nr  = row['dimension_erhebungsnummer_0']?.id?.trim();
        if (isNull(eID) || isNull(yr) || isNull(nr)) continue;
        if (this._erhebungLand[eID] === undefined) this._erhebungLand[eID] = this._landOfRow(row);
        const k = eID + '|' + yr + '|' + nr;
        (idx[k] ||= []).push(row);
      }
      this._erhebungIndex = idx;

      this._erhData = this.buildErhebungsStruktur(rows);
      this.setupFilterDropdowns();

      // NL-Stammdaten
      this.Niederlassung = {};
      this.nlKoordinaten = {};
      for (const row of rows) {
        const nl  = row['dimension_niederlassung_0']?.id?.trim();
        const lat = parseFloat(row['dimension_Lat_0']?.label);
        const lon = parseFloat(row['dimension_lon_0']?.label);
        if (!nl || isNaN(lat) || isNaN(lon)) continue;
        this.Niederlassung[nl] = row['dimension_nl_name_0']?.label?.trim() || nl;
        this.nlKoordinaten[nl] = { lat, lon };
      }

      this.loadGeoJson();
      this._startPreviewAnimation();
      this._hideCinematicLoader();

      this._totalRowCount  = rows.length;
      this._fullIndexReady = true;
      this._cachedBootstrapRows     = rows;
      this._cachedBootstrapStruktur = this._buildStrukturFromRows(rows);

      // Panel-Footer-Buttons im Hauptmenü deaktivieren
      this.$('panel-home-btn')?.setAttribute('disabled', '');
      this.$('panel-overview-btn')?.setAttribute('disabled', '');

      // Phase 2: Sidebar im Hauptmenü → nur Anleitung verfügbar.
      // Die anderen Views (PLZ / Erhebungsübersicht / Erweiterte Analyse)
      // werden erst nach loadErhebung() aktiviert.
      this._setSidebarEnabled(false);
      // Pane-State sicherstellen: Spalte sichtbar, Filter nicht eingeklappt
      this._setLeftPaneVisible(true);
      this._setFilterFieldsCollapsed(false);
      if (this._sidebarView == null) {
        this._switchSidebarView('docs');
      }

      console.info(`[PLZ-Widget] Bootstrap: ${rows.length} Rows in ${(performance.now() - t0).toFixed(0)}ms`);
    }

    // ── GeoJSON ────────────────────────────────────────────────────────
    async loadGeoJson(land = DEFAULT_LAND) {
      if (this._loadedLands.has(land)) return;
      const cfg = COUNTRY_CONFIG[land];
      if (!cfg) { console.warn('[PLZ-Widget] loadGeoJson: unbekanntes Land', land); return; }
      try {
        const geoData = await this._prefetchGeoJson(land);
        if (!geoData || !this.isConnected) return;
        if (this._loadedLands.has(land)) return;   // Race-Schutz
        this._loadedLands.add(land);

        this.geoNotes    ||= {};
        this._layerByPLZ ||= {};
        this._geoData = geoData;

        const features = geoData.features || [];
        for (let i = 0; i < features.length; i++) {
          const p = features[i]?.properties;
          if (p?.plz && p?.note) {
            const bare = this._normalizePLZ(p.plz, land);
            if (bare) this.geoNotes[this._plzKey(land, bare)] = p.note.trim();
          }
        }

        const layer = L.geoJSON(geoData, {
          renderer: this._canvasRenderer,
          style: () => ({
            fillColor: '#e9ecef', weight: 0.8, opacity: 1, color: 'white',
            fillOpacity: this._plzFillOpacity('empty'),
          }),
        }).addTo(this.map);

        this._geoLayerByLand.set(land, layer);
        // Backward-Compat: _geoLayer zeigt aufs erste geladene Land, damit
        // bestehende Guards (updateGeoLayer, _triggerSweepAnimation …) greifen.
        if (!this._geoLayer) this._geoLayer = layer;

        // Index: composite-key (land:plz) → layer, plus Layer-Stamping
        layer.eachLayer(lyr => {
          const bare = this._normalizePLZ(lyr.feature?.properties?.plz, land);
          if (!bare) return;
          lyr._land   = land;
          lyr._plz    = bare;
          lyr._plzKey = this._plzKey(land, bare);
          this._layerByPLZ[lyr._plzKey] = lyr;
        });

        this._bindGeoLayerClicks(land);
        this._bindLabelUpdates();
        this._drawCountryBorder(land, geoData);
        this._distanceCacheNLKey = null;   // neue Polygone → Distanz-Cache neu
      } catch (err) {
        console.error(`[PLZ-Widget] GeoJSON ${land}:`, err);
      }
    }

    // ── Ländergrenzen (aus geladenen PLZ-Polygonen abgeleitet) ─────────
    // Außenkontur = Kanten, die nur in EINEM Polygon vorkommen (geteilte
    // PLZ-Kanten kommen 2×). Dependency-frei, keine Extra-Datei. Deferred.
    _drawCountryBorder(land, geoData) {
      if (!this.map || this._borderByLand.has(land)) return;
      this._borderByLand.add(land);
      requestAnimationFrame(() => {
        if (!this.isConnected || !this.map) return;
        try {
          const segs = this._extractBoundarySegments(geoData);
          if (!segs.length) return;
          if (!this._borderGroup) this._borderGroup = L.layerGroup().addTo(this.map);
          const line = L.polyline(segs, {
            renderer: this._canvasRenderer,
            color: '#3a4049', weight: 1.6, opacity: 0.7,
            fill: false, interactive: false, lineJoin: 'round',
          });
          this._borderGroup.addLayer(line);
        } catch (e) {
          console.warn('[PLZ-Widget] Ländergrenze ' + land + ':', e);
        }
      });
    }

    // Sammelt alle Außenkanten-Segmente einer FeatureCollection als
    // [[lat,lng],[lat,lng]]-Liste (für eine Multi-Polyline).
    _extractBoundarySegments(geoData) {
      const edgeCount = new Map();
      const edgeSeg   = new Map();
      const R = 1e5;   // ~1 m Rundung, damit geteilte Kanten exakt matchen
      const keyPt = (x, y) => (Math.round(x * R) / R) + ',' + (Math.round(y * R) / R);
      const addEdge = (a, b) => {
        const ka = keyPt(a[0], a[1]);
        const kb = keyPt(b[0], b[1]);
        if (ka === kb) return;
        const k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
        edgeCount.set(k, (edgeCount.get(k) || 0) + 1);
        if (!edgeSeg.has(k)) edgeSeg.set(k, [[a[1], a[0]], [b[1], b[0]]]);
      };
      const ring = (coords) => {
        for (let i = 0; i + 1 < coords.length; i++) addEdge(coords[i], coords[i + 1]);
      };
      const poly = (rings) => { for (let i = 0; i < rings.length; i++) ring(rings[i]); };
      const feats = geoData.features || [];
      for (let i = 0; i < feats.length; i++) {
        const g = feats[i] && feats[i].geometry;
        if (!g) continue;
        if (g.type === 'Polygon') poly(g.coordinates);
        else if (g.type === 'MultiPolygon') {
          for (let j = 0; j < g.coordinates.length; j++) poly(g.coordinates[j]);
        }
      }
      const segs = [];
      for (const [k, c] of edgeCount) if (c === 1) segs.push(edgeSeg.get(k));
      return segs;
    }

    // Ein einziger Click-Handler pro Layer (statt pro updateGeoLayer neu gebunden)
    _bindGeoLayerClicks(land = DEFAULT_LAND) {
      if (this._clickBoundByLand.has(land)) return;
      const layer = this._geoLayerByLand.get(land);
      if (!layer) return;
      this._clickBoundByLand.add(land);
      layer.eachLayer(lyr => {
        lyr.on('click', () => {
          this._handlePolygonClick(lyr._plzKey, lyr);
        });
      });
    }

    _handlePolygonClick(key, layer) {
      if (!this._activeFilter) return;  // Home-Ansicht: Klicks ignorieren
      this.closeAllPopups();
      this.highlightMapArea(key);
      this.highlightTableRowByPLZ(key);

      if (this.currentMapMode === 'umsatz-multi' || this.currentMapMode === 'werbeanteil') {
        const values = this.filteredPLZWerte?.[key];
        if (values) this.showUmsatzPopup(key, values);
        else        this.showEmptyUmsatzPopup(key);
      } else {
        this.showPopup(layer.feature, this.filteredKennwerte?.[key] || {}, key);
      }
    }


    // ── PLZ-Namen auf der Karte (zoom-abhängig + Collision-Detection) ──
    //
    // Verhalten:
    //   • Zoom < LABEL_ZOOM_MIN            → alle Labels entfernen
    //   • Zoom >= LABEL_ZOOM_MIN           → Labels im Viewport anzeigen,
    //                                        mit Collision-Detection gegen
    //                                        Überlappungen
    //   • Zoom >= LABEL_ZOOM_CLEAR         → Labels etwas größer / klarer
    //   • Hard-Cap LABEL_MAX_COUNT         → bei zu vielen sichtbaren PLZs
    //                                        werden die priorisiert, die mit
    //                                        Daten belegt sind (filteredPLZWerte)
    //
    // Performance-Strategie:
    //   Labels werden als L.marker mit leerem HTML-Icon eingefügt und nur
    //   neu aufgebaut, wenn sich der sichtbare Set ändert. Wir halten einen
    //   labelByPLZ-Index, damit nur das Delta (add/remove) angefasst wird.
    _bindLabelUpdates() {
      if (!this.map || this._labelLayer) return;
      this._labelLayer = L.layerGroup().addTo(this.map);

      const schedule = () => this._scheduleLabelUpdate();
      this.map.on('zoomend', schedule);
      this.map.on('moveend', schedule);
      // Mitbewerber-Cluster bei Zoom-Wechsel neu berechnen (Cluster greifen
      // bei zoom < 9, einzeln darüber). Debounced damit nicht bei jedem
      // Zwischen-Frame neu gerechnet wird.
      const recluster = () => {
        if (!this.showCompetitors) return;
        if (this._competitorReclusterTimer) this._clearTimeout(this._competitorReclusterTimer);
        this._competitorReclusterTimer = this._setTimeout(() => {
          this.updateCompetitorMarkers();
        }, 120);
      };
      this.map.on('zoomend', recluster);
      // Sofort initial rendern
      schedule();
    }

    _scheduleLabelUpdate() {
      if (this._labelUpdateScheduled) return;
      this._labelUpdateScheduled = true;
      // Ein Frame warten, um Zoom/Pan-Bursts zu poolen
      requestAnimationFrame(() => {
        this._labelUpdateScheduled = false;
        this._updateMapLabels();
      });
    }

    _updateMapLabels() {
      if (!this.map || !this._labelLayer || !this._layerByPLZ) return;

      const zoom = this.map.getZoom();
      // Unterhalb des Schwellwerts alle Labels entfernen
      if (zoom < LABEL_ZOOM_MIN) {
        if (Object.keys(this._labelByPLZ).length > 0) {
          this._labelLayer.clearLayers();
          this._labelByPLZ = {};
        }
        return;
      }

      const strong = zoom >= LABEL_ZOOM_CLEAR;
      const bounds = this.map.getBounds();

      // 1) Kandidaten einsammeln: alle PLZ-Polygone, deren Zentrum im Viewport liegt
      //    Mit Bias auf PLZs, die in filteredPLZWerte liegen (= relevant für aktive Erhebung).
      const centerCache = this._plzCenterCache ||= {};
      const candidates = [];
      const plzList = Object.keys(this._layerByPLZ);
      const haveData = this.filteredPLZWerte && Object.keys(this.filteredPLZWerte).length > 0;

      for (let i = 0; i < plzList.length; i++) {
        const plz = plzList[i];
        const layer = this._layerByPLZ[plz];
        if (!layer) continue;

        // Zentrum cachen (teuer, weil getBounds auf Polygonen)
        let c = centerCache[plz];
        if (!c) {
          try {
            const b = layer.getBounds();
            c = centerCache[plz] = { lat: (b._southWest.lat + b._northEast.lat) / 2,
                                     lng: (b._southWest.lng + b._northEast.lng) / 2 };
          } catch (e) { continue; }
        }
        if (!bounds.contains([c.lat, c.lng])) continue;

        // Priorität: PLZs mit Daten zuerst, dann Rest
        const hasData = haveData && this.filteredPLZWerte[plz] != null;
        candidates.push({ plz, lat: c.lat, lng: c.lng, priority: hasData ? 0 : 1 });
      }

      // Hard-Cap: auf LABEL_MAX_COUNT begrenzen (Daten-Labels priorisieren)
      if (candidates.length > LABEL_MAX_COUNT) {
        candidates.sort((a, b) => a.priority - b.priority);
        candidates.length = LABEL_MAX_COUNT;
      }

      // 2) Collision-Detection in Pixel-Koordinaten
      //    Approx. Label-Größe: 56 × 18 px bei normal, 72 × 22 px bei strong.
      //    Wir projizieren jedes Zentrum nach Pixel und verwerfen Kandidaten,
      //    deren Bounding-Box mit einem bereits akzeptierten überlappt.
      const labelW = strong ? 72 : 58;
      const labelH = strong ? 22 : 18;
      const accepted = [];
      // Kandidaten mit Daten zuerst, so bekommen sie Vorrang beim Overlap
      candidates.sort((a, b) => a.priority - b.priority);

      for (const cand of candidates) {
        const pt = this.map.latLngToContainerPoint([cand.lat, cand.lng]);
        const ax = pt.x - labelW / 2, ay = pt.y - labelH / 2;
        let collide = false;
        for (let j = 0; j < accepted.length; j++) {
          const a = accepted[j];
          if (ax < a.x + labelW && ax + labelW > a.x &&
              ay < a.y + labelH && ay + labelH > a.y) {
            collide = true; break;
          }
        }
        if (collide) continue;
        accepted.push({ plz: cand.plz, lat: cand.lat, lng: cand.lng, x: ax, y: ay });
      }

      // 3) Delta anwenden: existierende Labels behalten, fehlende hinzufügen,
      //    überzählige entfernen.
      const keepSet = new Set(accepted.map(a => a.plz));
      for (const plz of Object.keys(this._labelByPLZ)) {
        if (!keepSet.has(plz)) {
          this._labelLayer.removeLayer(this._labelByPLZ[plz]);
          delete this._labelByPLZ[plz];
        }
      }

      // Icon-Stilwechsel, falls sich "strong" geändert hat
      if (this._labelStrong !== strong) {
        this._labelStrong = strong;
        // alle bestehenden Icons neu stylen
        for (const plz of Object.keys(this._labelByPLZ)) {
          this._labelLayer.removeLayer(this._labelByPLZ[plz]);
          delete this._labelByPLZ[plz];
        }
      }

      for (const a of accepted) {
        if (this._labelByPLZ[a.plz]) continue;
        const gemeinde = this.geoNotes?.[a.plz]
          ? this.geoNotes[a.plz].replace(/^\d{4,5}\s*[-–]?\s*/, '').trim()
          : '';
        const inner = gemeinde
          ? `<span class="plz-code">${escapeHtml(String(a.plz).split(':').slice(1).join(':') || a.plz)}</span>&nbsp;${escapeHtml(gemeinde)}`
          : `<span class="plz-code">${escapeHtml(String(a.plz).split(':').slice(1).join(':') || a.plz)}</span>`;
        const icon = L.divIcon({
          html: `<div class="plz-map-label${strong ? ' plz-map-label-strong' : ''}">${inner}</div>`,
          className: '',
          iconSize: [0, 0],       // kein fixer Rahmen → div bestimmt Breite selbst
          iconAnchor: [0, 0],     // Anker oben-links, Label zentriert sich via CSS transform
        });
        const m = L.marker([a.lat, a.lng], { icon, interactive: false, keyboard: false, zIndexOffset: 400 });
        this._labelLayer.addLayer(m);
        this._labelByPLZ[a.plz] = m;
      }
    }

    _clearMapLabels() {
      if (this._labelLayer) this._labelLayer.clearLayers();
      this._labelByPLZ = {};
    }


    // ── Karte: Styling, Highlighting ───────────────────────────────────
    applyMapMode(mode) {
      // Wenn echter Modus-Wechsel: kurzen Fade-Overlay einblenden, damit
      // der Color-Tausch der PLZ-Flächen nicht abrupt wirkt.
      if (mode !== this.currentMapMode) {
        this._flashMapTransition();
      }
      this.currentMapMode = mode;
      this.updateGeoLayer();
    }

    // Kurz weißer Schleier über die Karte → Mode-Switch → Schleier weg.
    _flashMapTransition() {
      const mc = this._shadowRoot.querySelector('.map-container');
      if (!mc) return;
      let fade = this.$('map-mode-fade');
      if (!fade) {
        fade = document.createElement('div');
        fade.id = 'map-mode-fade';
        mc.appendChild(fade);
      }
      // Aktivieren → Reflow → Deaktivieren
      void fade.offsetWidth;
      fade.classList.add('fade-active');
      this._setTimeout(() => {
        fade.classList.remove('fade-active');
        this._setTimeout(() => { try { fade.remove(); } catch (e) {} }, 220);
      }, 180);
    }

    highlightTableRow(rowElement) {
      if (this._lastHighlightedRow) this._lastHighlightedRow.classList.remove('table-row-selected');
      rowElement.classList.add('table-row-selected');
      this._lastHighlightedRow = rowElement;
    }

    highlightTableRowByPLZ(plz) {
      const container = this.$('table-container');
      if (!container) return;
      const rows = container.querySelectorAll('tbody tr');
      for (const row of rows) {
        if (row.dataset.plz === plz) { this.highlightTableRow(row); break; }
      }
    }

    highlightMapArea(plz) {
      if (!this._layerByPLZ) return;
      const target = this._layerByPLZ[plz];
      if (!target) return;
      if (this._lastHighlightedLayer && this._lastHighlightedLayer !== target) {
        this.applyStyleToLayer(this._lastHighlightedLayer);
      }
      this._highlightedPLZ = plz;
      target.setStyle({ weight: 3, color: '#f0a500', fillOpacity: this._plzFillOpacity('hover') });
      this._lastHighlightedLayer = target;
    }

    zoomToFilteredPLZ() {
      if (!this.map || !this._layerByPLZ || !this.plzImRadius || this.plzImRadius.size === 0) return;
      const bounds = L.latLngBounds([]);
      this.plzImRadius.forEach(plz => {
        const layer = this._layerByPLZ[plz];
        if (layer) { const lb = layer.getBounds?.(); if (lb) bounds.extend(lb); }
      });
      if (bounds.isValid()) this.map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
    }

    // ── Tabellen-Rendering ─────────────────────────────────────────────
    renderDataTable(data) {
      let entries = Object.entries(data || {})
        .filter(([plz]) => !this._isAggregatePlz(String(plz).split(':').pop()));

      if (this.plzImRadius && this.plzImRadius.size > 0) {
        entries = entries.filter(([plz]) => this.plzImRadius.has(plz));
      }
      if (!this._sortState || this._sortState.column == null) {
        entries.sort(([a], [b]) => a.localeCompare(b));
      }
      this.renderDataTableFromEntries(entries);
      this.updateStreuverlustFooter();
    }

    updateStreuverlustFooter() {
      const box = this.$('streuverlust-box');
      if (!box) return;
      if (!this.streuverlust) { box.innerHTML = ''; return; }

      let totalInRadius = 0;
      if (this.filteredKennwerte) {
        for (const [plz, k] of Object.entries(this.filteredKennwerte)) {
          if (!this.plzImRadius || this.plzImRadius.size === 0 || this.plzImRadius.has(plz)) {
            totalInRadius += k['value_hr_n_umsatz_0']?.raw ?? 0;
          }
        }
      }
      box.innerHTML =
        `<span><strong>Streuverlust:</strong> ${fmtNum(this.streuverlust.umsatz)} €
          &nbsp;·&nbsp; ${(this.streuverlust.anteil * 100).toFixed(1)} %</span>
         <span style="font-weight:700;color:var(--red);white-space:nowrap">
           Ges.: ${fmtNum(totalInRadius)} €
         </span>`;
    }

    computeStreuverlust() {
      if (!this.filteredData) return;
      let streuverlustUmsatz = 0, totalErhebungUmsatz = 0;
      const selNLs = this._selectedNLs;
      const radius = this.plzImRadius;
      const hasNL   = selNLs && selNLs.size > 0;
      const hasRad  = radius instanceof Set && radius.size > 0;
      const data    = this.filteredData;
      for (let i = 0, len = data.length; i < len; i++) {
        const row = data[i];
        const nl  = row['dimension_niederlassung_0']?.id?.trim();
        if (hasNL && !selNLs.has(nl)) continue;
        const __land = this._landOfRow(row); const __bare = this._normalizePLZ(row['dimension_plz_0']?.id ?? row['dimension_plz_0']?.raw, __land); const plz = (__bare && !this._isAggregatePlz(__bare)) ? this._plzKey(__land, __bare) : null;
        if (!plz) continue;
        // Bug-Fix B38: PLZ='00000' sind Stammdaten-Aggregate ohne PLZ-Zuordnung.
        // Die als Streuverlust zu zählen würde den Anteil künstlich aufblähen.
        if (plz === '00000') continue;
        const umsatz = row['value_hr_n_umsatz_0']?.raw ?? 0;
        totalErhebungUmsatz += umsatz;
        if (!hasRad || !radius.has(plz)) streuverlustUmsatz += umsatz;
      }
      // Domain-Frage 3 (geklärt): negative Saldo-Summen werden zu 0
      // normalisiert. Einzelne Storno-Rows fließen vorher mit ihrem Vorzeichen
      // in die Aggregation ein (Stornos verringern korrekt den Saldo);
      // erst am Ende clampen wir, damit keine negativen Anzeigen entstehen.
      const sumStreu = streuverlustUmsatz > 0 ? streuverlustUmsatz : 0;
      const sumTotal = totalErhebungUmsatz > 0 ? totalErhebungUmsatz : 0;
      this.streuverlust = {
        umsatz: sumStreu,
        anteil: sumTotal > 0 ? sumStreu / sumTotal : 0
      };
    }

    sortTableByColumn(columnIndex) {
      if (!this.filteredKennwerte) return;
      if (this._sortState.column === columnIndex) {
        this._sortState.direction = this._sortState.direction === 'asc' ? 'desc' : 'asc';
      } else {
        this._sortState.column = columnIndex;
        this._sortState.direction = 'desc';
      }
      const dir = this._sortState.direction === 'asc' ? 1 : -1;
      const entries = Object.entries(this.filteredKennwerte);
      const sorted = entries.sort(([plzA, a], [plzB, b]) => {
        let valA, valB;
        switch (columnIndex) {
          case 0: valA = String(plzA).split(':').pop(); valB = String(plzB).split(':').pop(); break;
          case 1: valA = this.geoNotes?.[plzA] || ''; valB = this.geoNotes?.[plzB] || ''; break;
          case 2:
            valA = a.isCritical ? 2 : (a.isHZ ? 1 : 0);
            valB = b.isCritical ? 2 : (b.isHZ ? 1 : 0);
            break;
          case 3: valA = a['value_hr_n_umsatz_0']?.raw ?? -Infinity; valB = b['value_hr_n_umsatz_0']?.raw ?? -Infinity; break;
          case 4: valA = a['value_wk_nachbar_0']?.raw  ?? -Infinity; valB = b['value_wk_nachbar_0']?.raw  ?? -Infinity; break;
          default: return 0;
        }
        if (typeof valA === 'string') return valA.localeCompare(valB) * dir;
        return (valA - valB) * dir;
      });
      this.renderDataTableFromEntries(sorted);
    }

    updateSortIcons(activeIndex) {
      const headers = this._shadowRoot.querySelectorAll('th .sort-icon');
      headers.forEach((icon, i) => {
        if (i === activeIndex) {
          icon.textContent = this._sortState.direction === 'asc' ? '▲' : '▼';
          icon.classList.add('sort-icon-active');
        } else {
          // Im default-State leer — kein Indikator. Erst bei aktiver Sortierung
          // erscheint ▲ oder ▼ auf der aktiven Spalte.
          icon.textContent = '';
          icon.classList.remove('sort-icon-active');
        }
      });
    }


    renderDataTableFromEntries(entries) {
      const container = this.$('table-container');
      if (!container) return;
      container.innerHTML = '';
      // (Layout-Properties kommen aus .table-wrapper-CSS-Regel.)

      entries = entries.filter(([plz]) => !this._isAggregatePlz(String(plz).split(':').pop()));
      if (this.plzImRadius && this.plzImRadius.size > 0) {
        entries = entries.filter(([plz]) => this.plzImRadius.has(plz));
      }

      // Phase 2: Kein Welcome-Guide mehr im PLZ-Tabellen-Container.
      // Im Hauptmenü ist der PLZ-View ohnehin nicht aktiv (Anleitung-View
      // ist Default). Wenn doch jemand hier ankommt ohne aktive Erhebung,
      // zeigen wir nur einen kurzen Hinweis.
      if (!this._activeFilter) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:24px;text-align:center;color:#adb5bd;font-size:0.85rem;';
        empty.textContent = 'Bitte zuerst eine Erhebung auswählen.';
        container.appendChild(empty);
        return;
      }

      if (!entries.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:24px;text-align:center;color:#adb5bd;font-size:0.85rem;';
        empty.textContent = 'Keine Daten vorhanden';
        container.appendChild(empty);
        const footer = document.createElement('div');
        footer.id = 'streuverlust-box';
        container.appendChild(footer);
        return;
      }

      const scrollWrapper = document.createElement('div');
      scrollWrapper.classList.add('table-scroll');
      const table = document.createElement('table');
      table.style.cssText = 'width:100%;border-collapse:collapse;table-layout:fixed;';

      const isUmsatzMode = this.currentMapMode === 'umsatz-multi' || this.currentMapMode === 'werbeanteil';
      const lastColLabel = isUmsatzMode ? 'Umsatz-\nAnteil' : 'WK (%)';
      const headers = [
        { label: 'PLZ',                    width: '44px' },
        { label: 'Gemeinde',               width: '88px' },
        { label: 'HZ',                     width: '22px' },
        { label: 'Umsatz\n(Hochger.)', width: '58px' },
        { label: lastColLabel,             width: '46px' }
      ];

      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      headers.forEach(({ label, width }, i) => {
        const th = document.createElement('th');
        // Sort-Icon-Span wird leer gerendert — Inhalt setzt updateSortIcons
        // erst bei aktiver Sortierung (▲ oder ▼). Vorher kein Indikator.
        th.innerHTML = `${escapeHtml(label)}<span class="sort-icon"></span>`;
        th.style.width = width;
        th.style.whiteSpace = 'pre-line';
        this._on(th, 'click', () => this.sortTableByColumn(i));
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow); table.appendChild(thead);

      const totalUmsatz = isUmsatzMode
        ? Object.values(this.filteredPLZWerte || {}).reduce((s, v) => s + this.getUmsatzSumForPLZ(v), 0)
        : 0;

      const tbody = document.createElement('tbody');
      const fragment = document.createDocumentFragment();
      const tdBase = 'padding:6px 8px;border-bottom:1px solid #f1f3f5;font-size:0.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

      // Event-Delegation: ein Click-Handler auf tbody statt pro Row
      this._on(tbody, 'click', (ev) => {
        const tr = ev.target.closest('tr');
        if (!tr || !tr.dataset.plz) return;
        const plz = tr.dataset.plz;
        this.closeAllPopups();
        this.highlightMapArea(plz);
        this.openPopupFromTable(plz);
        this.highlightTableRow(tr);
      });

      entries.forEach(([plz, kennwerte], idx) => {
        const tr = document.createElement('tr');
        tr.classList.add('table-row-animated');
        tr.style.animationDelay = `${Math.min(idx * 18, 200)}ms`;
        tr.dataset.plz = plz;

        const __parts = String(plz).split(':'); const __land = __parts.length > 1 ? __parts[0] : ''; const __bare = __parts.length > 1 ? __parts.slice(1).join(':') : __parts[0];
        const note = (this.geoNotes?.[plz] || '').replace(/^\d{4,5}\s*[-–]?\s*/, '').trim() || '—';
        let symbol = '●', symbolColor = '#dee2e6';
        if (kennwerte?.isCritical) { symbol = '▲'; symbolColor = '#f0a500'; }
        else if (kennwerte?.isHZ)  { symbol = '●'; symbolColor = '#33a02c'; }

        let umsatz, lastColVal;
        if (isUmsatzMode) {
          const plzUmsatz = this.getUmsatzSumForPLZ(this.filteredPLZWerte?.[plz] || {});
          umsatz     = plzUmsatz > 0 ? Math.round(plzUmsatz).toLocaleString('de-DE') : '–';
          lastColVal = totalUmsatz > 0 ? (plzUmsatz / totalUmsatz * 100).toFixed(1) + ' %' : '–';
        } else {
          const rawUmsatz = kennwerte['value_hr_n_umsatz_0']?.raw;
          umsatz     = rawUmsatz != null ? Math.round(rawUmsatz).toLocaleString('de-DE') : '–';
          lastColVal = (kennwerte['value_wk_in_percent_0']?.raw?.toFixed(1) ?? '–') + ' %';
        }

        tr.innerHTML = `
          <td style="${tdBase}font-variant-numeric:tabular-nums;font-size:0.78rem;color:#495057;width:${headers[0].width}">${__land ? '<span style="opacity:.5;font-size:.82em">'+escapeHtml(__land)+'</span> ' : ''}${escapeHtml(__bare)}</td>
          <td style="${tdBase}color:#6c757d;width:${headers[1].width}">${escapeHtml(note)}</td>
          <td style="${tdBase}text-align:center;width:${headers[2].width}"><span style="color:${symbolColor};font-size:10px">${symbol}</span></td>
          <td style="${tdBase}text-align:right;font-variant-numeric:tabular-nums;width:${headers[3].width}">${escapeHtml(umsatz)}</td>
          <td style="${tdBase}text-align:right;font-variant-numeric:tabular-nums;width:${headers[4].width}">${escapeHtml(lastColVal)}</td>`;

        fragment.appendChild(tr);
      });

      tbody.appendChild(fragment);
      table.appendChild(tbody);
      scrollWrapper.appendChild(table);
      container.appendChild(scrollWrapper);

      const footer = document.createElement('div');
      footer.id = 'streuverlust-box';
      container.appendChild(footer);

      if (this._sortState?.column != null) this.updateSortIcons(this._sortState.column);
      this.updateStreuverlustFooter();

      if (this._activePopupPLZ) {
        const rows = container.querySelectorAll('tbody tr');
        for (const row of rows) {
          if (row.dataset.plz === this._activePopupPLZ) { this.highlightTableRow(row); break; }
        }
      }
    }

    openPopupFromTable(plz) {
      if (!this._layerByPLZ) return;
      const targetLayer = this._layerByPLZ[plz];
      if (!targetLayer) return;
      this.closeAllPopups();
      if (this.currentMapMode === 'umsatz-multi' || this.currentMapMode === 'werbeanteil') {
        const values = this.filteredPLZWerte?.[plz];
        values ? this.showUmsatzPopup(plz, values) : this.showEmptyUmsatzPopup(plz);
        return;
      }
      this.showPopup(targetLayer.feature, this.filteredKennwerte?.[plz] || {}, plz);
    }


    // ── Distance-Cache (NL ↔ PLZ-Center, in km) ────────────────────────
    _buildDistanceCache() {
      if (!this._layerByPLZ || !this.nlMarkers?.length) return;

      const nlFingerprint = this.nlMarkers.map(m => m.lat.toFixed(4) + ',' + m.lng.toFixed(4)).join('|');
      if (this._distanceCacheNLKey === nlFingerprint &&
          this._distanceCache && Object.keys(this._distanceCache).length > 0) return;

      this._distanceCacheNLKey = nlFingerprint;
      this._distanceCache = {};
      this._plzCenterCache ||= {};

      const nls = this.nlMarkers.map(m => ({ lat: m.lat, lng: m.lng }));
      const nlLen = nls.length;
      const plzList = Object.keys(this._layerByPLZ);
      const cache = this._distanceCache;
      const centerCache = this._plzCenterCache;
      const layerByPLZ = this._layerByPLZ;
      const R = 6371, toRad = d => d * Math.PI / 180;

      for (let i = 0, len = plzList.length; i < len; i++) {
        const plz = plzList[i];
        if (!centerCache[plz]) {
          // Bug R4 Fix: statt der internen _southWest/_northEast (undocumented
          // Leaflet API) lieber getBounds().getCenter() — stabiler. Defensiv
          // gegen leere/zerstörte Layer.
          try {
            const center = layerByPLZ[plz].getBounds().getCenter();
            centerCache[plz] = { lat: center.lat, lng: center.lng };
          } catch (e) {
            continue;   // Layer ohne valide Bounds → skip
          }
        }
        const { lat: lat1, lng: lng1 } = centerCache[plz];
        const rlat1 = toRad(lat1);
        let minDist = Infinity;
        for (let j = 0; j < nlLen; j++) {
          const { lat: lat2, lng: lng2 } = nls[j];
          const dLat = toRad(lat2 - lat1);
          const dLon = toRad(lng2 - lng1);
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(rlat1) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
          const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          if (d < minDist) minDist = d;
        }
        cache[plz] = minDist;
      }
    }

    applyRadiusFilter(radiusKm) {
      if (!this._layerByPLZ) return;
      if (!this._distanceCache || Object.keys(this._distanceCache).length === 0) this._buildDistanceCache();
      const plzImRadius = new Set();
      const cache = this._distanceCache;
      for (const plz of Object.keys(this._layerByPLZ)) {
        if ((cache[plz] ?? Infinity) <= radiusKm) plzImRadius.add(plz);
      }
      this.plzImRadius = plzImRadius;
      this.prepareUmsatzPLZWerte();
      this.computeWKKennwerte();
      this.computeStreuverlust();
      this.updateGeoLayer();
      if (this._activeFilter) {
        this.renderDataTable(this.filteredKennwerte);
        this._rerenderActivePopup();
      }
    }

    // ── Map-Initialisierung + Event-Wiring des Control-Panels ──────────
    initializeMapBase() {
      const mapContainer = this.$('map');
      if (!mapContainer) return;

      this._canvasRenderer = L.canvas({ padding: 0.5 });
      this.map = L.map(mapContainer, {
        preferCanvas: true,
        renderer: this._canvasRenderer,
        zoomAnimation: true,
        markerZoomAnimation: true,
        // Leaflets eingebaute Controls weglassen — die Zoom-Buttons oben
        // links würden den Reopen-Pfeil verdecken wenn die linke Spalte
        // ausgeblendet ist. Zoom geht weiterhin über Mausrad / Pinch /
        // Doppelklick. Attribution bleibt klein unten rechts (nicht
        // entfernen, da OSM-Lizenz das verlangt) — sie wird beim Tile-Layer
        // gesetzt und ist standardmäßig ohnehin sichtbar.
        zoomControl: false,
      }).setView([51.2, 12.5], 6);

      // Default-State konsolidiert im Constructor; hier nur LayerGroups
      this.filteredGroup   = L.layerGroup().addTo(this.map);
      this.neighbourGroup  = L.layerGroup().addTo(this.map);
      this.radiusGroup     = L.layerGroup().addTo(this.map);
      this.bestreuungGroup = L.layerGroup().addTo(this.map);
      this.competitorGroup = L.layerGroup().addTo(this.map);

      // Daten-Ready?
      // ACHTUNG: render()-Aufrufe MÜSSEN über _renderInProgress geschützt werden,
      // sonst kann ein paralleler set myDataSource() einen zweiten render() starten.
      const startRender = () => {
        if (this._renderInProgress) return;
        this._fullDataLoaded = false;
        this._renderInProgress = true;
        this.render().finally(() => { this._renderInProgress = false; });
      };
      if (this._pendingRender) {
        this._pendingRender = false;
        if (this._myDataSource?.state === 'success') {
          if (!this._fullDataLoaded) this._bootstrapFromPLZ00000(this._myDataSource.data);
          else                       startRender();
        } else if (this._myDataSource) {
          this._scheduleDataPoll();
        }
      } else if (this._myDataSource?.state === 'success') {
        if (!this._fullDataLoaded) this._bootstrapFromPLZ00000(this._myDataSource.data);
        else                       startRender();
      } else if (this._myDataSource && !this._dataPollTimer) {
        this._scheduleDataPoll();
      }

      this.initRadiusSlider();
      this._wireControlPanel();
    }

    _wireControlPanel() {
      const btnWK      = this.$('btn-wk');
      const btnUmsatz  = this.$('btn-umsatz');
      const panel      = this.$('map-control-panel');
      const umsatzPanel= this.$('umsatz-panel');
      const wkExtra    = this.$('wk-extra');
      const umsatzOptionsRow = this.$('umsatz-options-row');
      const typeSwitch = this.$('umsatz-type-switch');
      const darstSwitch= this.$('umsatz-analysis-switch');
      const btnAbs     = darstSwitch?.querySelector('.mode-abs');
      const btnHH      = darstSwitch?.querySelector('.mode-hh');
      const btnWA      = darstSwitch?.querySelector('.mode-werbeanteil');
      const werbeRow   = this.$('werbe-options-row');
      const chkWerbe   = this.$('chk-werbeumsatz');
      const chkMit     = this.$('chk-mitgekauft');
      const chkBestreu = this.$('chk-bestreuung');
      const chkDoppel          = this.$('chk-doppelbestreuung');
      const chkCompetitorsWK   = this.$('chk-competitors-wk');
      const chkCompetitorsUms  = this.$('chk-competitors-umsatz');

      this.showCritical = !!chkDoppel?.checked;

      // Map-Buttons
      this._on(this.$('map-tile-toggle-btn'), 'click', () => this.toggleMapTiles());
      this._on(this.$('legend-toggle-btn'),   'click', () => this.$('heatmap-legend').classList.toggle('hidden'));
      this._on(this.$('panel-home-btn'),      'click', () => this._resetToHome());
      this._on(this.$('panel-overview-btn'),  'click', () => this.showOverviewPopup());

      // Sidebar-Icon-Klicks (Phase 2): Hauptinhalt zwischen den 4 Bereichen
      // umschalten. Klick auf aktives Icon deselektiert es → Karte breit.
      // Sidebar-Click-Handler: zentral via _setupSidebarHandlers früh
      // in connectedCallback registriert (siehe Bug 17 Fix). Doppel-Setup
      // wäre redundant.

      const refreshMapAndPopup = () => {
        this._refreshAll();
        this._rerenderActivePopup();
      };

      // WK-Modus
      this._on(btnWK, 'click', () => {
        if (this.currentMapMode !== 'wk') this._flashMapTransition();
        this.closeAllPopups();
        btnWK.classList.add('active'); btnUmsatz.classList.remove('active');
        // iOS-Slider-Position: links (Default, ohne switch-right)
        btnWK.closest('.switch-row')?.classList.remove('switch-right');
        this.currentMapMode = 'wk'; 
        wkExtra.style.display = ''; umsatzOptionsRow.classList.add('hidden');
        umsatzPanel.classList.add('hidden');
        panel.classList.remove('panel-large', 'panel-medium', 'panel-auto');
        this.showCritical = chkDoppel.checked;
        // Bug-Fix B5: Bestreuungs-Overlay-State sauber zurücksetzen.
        // Sonst bleibt showBestreuung=true und beim nächsten Umsatz-Wechsel
        // ist die Checkbox unchecked, intern aber true.
        this.showBestreuung = false;
        if (chkBestreu) chkBestreu.checked = false;
        this.umsatzDarstellung = 'abs';
        darstSwitch.querySelectorAll('span').forEach(s => s.classList.remove('active'));
        btnAbs.classList.add('active'); btnWA.classList.add('disabled');
        this.bestreuungGroup?.clearLayers();
        this.activeCategories = new Set(CATEGORIES);
        this._shadowRoot.querySelectorAll('.category-toggle').forEach(t => t.classList.add('active'));
        if (this._activeFilter) { this.prepareUmsatzPLZWerte(); this.computeWKKennwerte(); }
        this.updateGeoLayer(); this.updateHeatmapLegend();
        if (this._activeFilter) {
          this.renderDataTable(this.filteredKennwerte);
          this.showOverviewPopup();
          this._rerenderActivePopup();
        }
      });

      // Umsatz-Modus
      this._on(btnUmsatz, 'click', () => {
        const isModeChange = this.currentMapMode === 'wk';
        if (isModeChange) this._flashMapTransition();
        typeSwitch.classList.remove('active-right'); typeSwitch.classList.add('active-left');
        btnUmsatz.classList.add('active'); btnWK.classList.remove('active');
        // iOS-Slider-Position: rechts
        btnUmsatz.closest('.switch-row')?.classList.add('switch-right');
        this.closeAllPopups();
        this.currentMapMode = 'umsatz-multi'; 
        if (this._activeFilter) { this.prepareUmsatzPLZWerte(); this.computeWKKennwerte(); }
        wkExtra.style.display = 'none'; umsatzOptionsRow.classList.remove('hidden');
        umsatzPanel.classList.remove('hidden');
        this._syncPanelState();
        this.umsatzDarstellung = 'abs';
        darstSwitch.querySelectorAll('span').forEach(s => s.classList.remove('active'));
        btnAbs.classList.add('active'); btnWA.classList.add('disabled');
        if (!this.showBestreuung) this.bestreuungGroup?.clearLayers();
        this.updateGeoLayer(); this.updateHeatmapLegend();
        if (this._activeFilter) {
          this.renderDataTable(this.filteredKennwerte);
          this.showOverviewPopup();
          this._rerenderActivePopup();
        }
      });

      // Umsatz-Typ (Normal / Werbung)
      this._on(typeSwitch, 'click', () => {
        const switchingToWerbung = this.umsatzMainMode === 'gesamt';
        this.umsatzMainMode = switchingToWerbung ? 'werbung' : 'gesamt';
        typeSwitch.classList.toggle('active-right', switchingToWerbung);
        typeSwitch.classList.toggle('active-left', !switchingToWerbung);
        werbeRow.style.display = switchingToWerbung ? 'flex' : 'none';
        if (switchingToWerbung) {
          btnWA.classList.remove('disabled');
          this.useWerbeUmsatz = true; this.useZusatzUmsatz = false;
          chkWerbe.checked = true;    chkMit.checked = false; chkMit.disabled = false;
          chkWerbe.disabled = false;
        } else {
          btnWA.classList.add('disabled');
          this.umsatzDarstellung = 'abs';
          darstSwitch.querySelectorAll('span').forEach(s => s.classList.remove('active'));
          btnAbs.classList.add('active');
          // Bug WA7 Fix: Wenn im Werbeanteil-Modus auf "Gesamt" gewechselt
          // wird, muss currentMapMode auf umsatz-multi zurück — sonst zeigt
          // die Karte grau (werbeAnteil=0 im Gesamt-Modus).
          if (this.currentMapMode === 'werbeanteil') {
            this.currentMapMode = 'umsatz-multi';
          }
          // Mitgekauft + Werbe wieder enabled (waren im WA-Modus disabled)
          if (chkMit)   chkMit.disabled = false;
          if (chkWerbe) chkWerbe.disabled = false;
        }
        refreshMapAndPopup();
      });

      this._on(chkWerbe, 'change', () => {
        this.useWerbeUmsatz = chkWerbe.checked;
        if (!this.useWerbeUmsatz && !this.useZusatzUmsatz) { this.useWerbeUmsatz = true; chkWerbe.checked = true; }
        refreshMapAndPopup();
      });
      this._on(chkMit, 'change', () => {
        this.useZusatzUmsatz = chkMit.checked;
        if (!this.useWerbeUmsatz && !this.useZusatzUmsatz) { this.useWerbeUmsatz = true; chkWerbe.checked = true; }
        refreshMapAndPopup();
      });

      // Darstellung
      const setDarst = (modus, mapMode, btn) => {
        this.umsatzDarstellung = modus; this.currentMapMode = mapMode; 
        darstSwitch.querySelectorAll('span').forEach(s => s.classList.remove('active'));
        btn.classList.add('active');
      };
      // Bug WA4 Fix: chkMit und chkWerbe waren im Werbeanteil-Modus disabled.
      // Beim Wechsel zurück auf Absolut/HH müssen sie wieder klickbar werden.
      const reEnableMit = () => {
        if (this.umsatzMainMode === 'werbung') {
          if (chkMit)   chkMit.disabled = false;
          if (chkWerbe) chkWerbe.disabled = false;
        }
      };
      this._on(btnAbs, 'click', () => { setDarst('abs', 'umsatz-multi', btnAbs); reEnableMit(); refreshMapAndPopup(); });
      this._on(btnHH,  'click', () => { setDarst('hh',  'umsatz-multi', btnHH);  reEnableMit(); refreshMapAndPopup(); });
      this._on(btnWA,  'click', () => {
        if (this.umsatzMainMode !== 'werbung') return;
        setDarst('werbeanteil', 'werbeanteil', btnWA);
        // Im Werbeanteil-Modus: nur Werbung relevant, kein Mitgekauft.
        // Beide Checkboxen werden auf den richtigen State erzwungen und
        // disabled, damit der User sie nicht umschalten kann.
        chkWerbe.checked = true; this.useWerbeUmsatz = true;  chkWerbe.disabled = true;
        chkMit.checked = false;  this.useZusatzUmsatz = false; chkMit.disabled = true;
        refreshMapAndPopup();
      });

      // Kategorien
      this._shadowRoot.querySelectorAll('.category-toggle').forEach(toggle => {
        this._on(toggle, 'click', () => {
          const cat = toggle.dataset.cat;
          if (!cat) return;
          const allActive = CATEGORIES.every(c => this.activeCategories.has(c));
          if (allActive) {
            this.activeCategories = new Set([cat]);
            this._shadowRoot.querySelectorAll('.category-toggle').forEach(t =>
              t.classList.toggle('active', t.dataset.cat === cat));
          } else if (this.activeCategories.has(cat)) {
            this.activeCategories.delete(cat);
            toggle.classList.remove('active');
            if (this.activeCategories.size === 0) {
              this.activeCategories = new Set(CATEGORIES);
              this._shadowRoot.querySelectorAll('.category-toggle').forEach(t => t.classList.add('active'));
            }
          } else {
            this.activeCategories.add(cat);
            toggle.classList.add('active');
          }
          // Bug WA1 Fix: nur den Umsatz-Modus erzwingen wenn nicht gerade
          // im Werbeanteil-Modus — sonst verliert der User seinen Werbeanteil-
          // State sobald er eine Kategorie umschaltet.
          if (this.currentMapMode !== 'werbeanteil') {
            this.currentMapMode = 'umsatz-multi';
          }
          refreshMapAndPopup();
        });
      });

      this._on(chkDoppel, 'change', () => {
        this.showCritical = chkDoppel.checked;
        this.updateGeoLayer(); this.updateHeatmapLegend();
        if (this._activeFilter) this.renderDataTable(this.filteredKennwerte);
      });
      this._on(chkBestreu, 'change', () => {
        this.showBestreuung = chkBestreu.checked;
        this.updateBestreuungMarkers(); this.updateHeatmapLegend();
        if (this._activeFilter) this.renderDataTable(this.filteredKennwerte);
      });

      // Mitbewerber: beide Checkboxen spiegeln denselben State
      const onCompetitorChange = (checked) => {
        this.showCompetitors = checked;
        if (chkCompetitorsWK)  chkCompetitorsWK.checked  = checked;
        if (chkCompetitorsUms) chkCompetitorsUms.checked = checked;
        this.updateCompetitorMarkers();
      };
      this._on(chkCompetitorsWK,  'change', () => onCompetitorChange(chkCompetitorsWK.checked));
      this._on(chkCompetitorsUms, 'change', () => onCompetitorChange(chkCompetitorsUms.checked));
    }


    // ── Layer-Styling ──────────────────────────────────────────────────
    // Wenn die OSM-Hintergrundkarte aktiv ist, werden die PLZ-Flächen
    // transparenter dargestellt, damit man die Hintergrundkarte
    // (Straßen, Städte) noch lesen kann. Sonst (Karte aus, weißer Hintergrund)
    // dürfen die Flächen kräftiger sein.
    _plzFillOpacity(state) {
      const tiles = !!this._tilesVisible;
      switch (state) {
        case 'value':        // PLZ mit Wert (im Radius)
          return tiles ? 0.45 : 0.72;
        case 'empty':        // PLZ ohne Wert / außer Radius
          return tiles ? 0.18 : 0.35;
        case 'hover':        // Hover-Highlight
          return tiles ? 0.55 : 0.72;
        case 'click-empty':  // Klick auf eine empty PLZ (Stammdaten-Anzeige)
          return tiles ? 0.18 : 0.3;
        default:
          return tiles ? 0.45 : 0.7;
      }
    }

    applyStyleToLayer(layer) {
      const plz = layer._plzKey
        || this._plzKey(layer._land || DEFAULT_LAND,
                        this._normalizePLZ(layer.feature?.properties?.plz, layer._land || DEFAULT_LAND));
      const v   = this.filteredPLZWerte?.[plz];
      const hasRadius = this.plzImRadius instanceof Set && this.plzImRadius.size > 0;

      let inRadius;
      if (this.currentMapMode === 'umsatz-multi' || this.currentMapMode === 'werbeanteil') {
        inRadius = !this.useRadiusFilter || !hasRadius || this.plzImRadius.has(plz);
      } else {
        inRadius = !hasRadius || this.plzImRadius.has(plz);
      }

      if (!v || !inRadius) {
        layer.setStyle({
          fillColor: '#e9ecef',
          fillOpacity: this._plzFillOpacity('empty'),
          color: '#ffffff', weight: 0.8,
        });
        this._removeCriticalMarker(plz);
        return;
      }

      layer.setStyle({
        fillColor: this.computeFillColor(plz),
        fillOpacity: this._plzFillOpacity('value'),
        color: '#ffffff',
        weight: 0.8,
      });

      // Critical-Marker für Doppelbestreuung
      // Phase-1: Multi-Modus erweitert die Trigger:
      // - showCritical: bestehende Doppelbestreuungs-Checkbox (Map-Panel)
      // - _crossGfDoppelAktiv: Cross-GF-Marker im Multi-Modus
      const showCritical    = this.currentMapMode === 'wk' && this.showCritical;
      const showCrossGfDoppel = !!this._crossGfDoppelAktiv;
      const showMarker      = showCritical || showCrossGfDoppel;
      const isCriticalIntern = !!this.filteredKennwerte?.[plz]?.isCritical;
      const isCriticalCross  = !!(this._crossErhebungPLZ?.[plz] &&
                                  Object.keys(this._crossErhebungPLZ[plz]).length > 0);
      const isCrossGfDoppel  = !!this._crossGfDoppel?.[plz];
      const isCritical = isCriticalIntern || isCriticalCross || isCrossGfDoppel;

      if (!showMarker || !isCritical) { this._removeCriticalMarker(plz); return; }

      if (!this.criticalMarkers[plz]) {
        const center = layer.getBounds().getCenter();
        const icon = L.divIcon({
          html: `<div style="font-size:18px;line-height:1;animation:criticalPulse 1.8s ease-in-out infinite;display:block;transform-origin:center;cursor:pointer;">⚠️</div>`,
          className: '', iconSize: [22, 22], iconAnchor: [11, 11]
        });
        const marker = L.marker(center, { icon, interactive: true, zIndexOffset: 2000 }).addTo(this.map);
        const mapContainer = this._shadowRoot.querySelector('.map-container');
        marker.on('mouseover', (e) => this._showDoppelTooltip(plz, e.originalEvent, mapContainer));
        marker.on('mousemove', (e) => this._moveDoppelTooltip(e.originalEvent, mapContainer));
        marker.on('mouseout',  ()  => this._hideDoppelTooltip());
        this.criticalMarkers[plz] = marker;
      }
    }

    _removeCriticalMarker(plz) {
      const m = this.criticalMarkers?.[plz];
      if (m) { this.map.removeLayer(m); delete this.criticalMarkers[plz]; }
    }

    computeFillColor(plz) {
      const v = this.filteredPLZWerte?.[plz];
      if (!v) return '#cfd4da';
      if (this.currentMapMode === 'wk')           return this.getColor(v.hz ? v.wk : v.wkPot, v.hz);
      if (this.currentMapMode === 'umsatz-multi') return this.getDynamicHeatColor(this.getUmsatzSumForPLZ(v), this._maxValueCache || 1);
      if (this.currentMapMode === 'werbeanteil')  return this.getWerbeAnteilColor(v.werbeAnteil ?? 0);
      return '#cfd4da';
    }

    computeMaxValue() {
      const plzWerte = this.filteredPLZWerte || {};
      let maxValue = 0;
      if (this.currentMapMode === 'wk') {
        for (const v of Object.values(plzWerte)) {
          const val = v.hz ? v.wk : v.wkPot;
          if (Number.isFinite(val) && val > maxValue) maxValue = val;
        }
      } else if (this.currentMapMode === 'umsatz-multi') {
        for (const v of Object.values(plzWerte)) {
          const sum = this.getUmsatzSumForPLZ(v);
          if (sum > maxValue) maxValue = sum;
        }
      } else if (this.currentMapMode === 'werbeanteil') {
        this._maxValueCache = 1; return 1;
      }
      this._maxValueCache = maxValue || 1;
      return this._maxValueCache;
    }

    getColor(value, isHZ) {
      const v = typeof value === 'number' && !isNaN(value) ? value : 0;
      if (isHZ) {
        // HZ-Modus (aktive Bestreuung): Werte sind Werbekostenquote in %.
        // Bei aktiver Bestreuung mit 0 Umsatz wäre v=0, aber das ist fachlich
        // KEIN guter Wert — es heißt "Werbung kostet, bringt nichts ein".
        // Diese PLZ soll als kritisch dargestellt werden (dunkelrot), nicht
        // als grau (= kein Datum). Daher: v=0 mit isHZ=true → max WK-Quote.
        if (v <= 0) return '#e31a1c';
        return v > 25 ? '#e31a1c' : v > 15 ? '#fd8d3c' : v > 10 ? '#ffffb2' : v > 5 ? '#78c679' : v > 2 ? '#41ab5d' : '#006837';
      }
      return v > 50 ? '#cfd4da' : v > 25 ? '#bdbdbd' : v > 15 ? '#969696' : v > 10 ? '#6baed6' : v > 5 ? '#2171b5' : v > 0 ? '#08306b' : '#cfd4da';
    }
    getDynamicHeatColor(value, max) {
      value = Number(value); max = Number(max);
      if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(max) || max <= 0) return '#cfd4da';
      const r = value / max;
      return r > .95 ? '#7a0f17' : r > .85 ? '#9d131b' : r > .75 ? '#b41821' : r > .65 ? '#d9483b' :
             r > .55 ? '#e96a3a' : r > .45 ? '#f08a3c' : r > .35 ? '#f6b65b' : r > .20 ? '#f7d77a' : '#fce9b2';
    }
    getWerbeAnteilColor(ratio) {
      if (!Number.isFinite(ratio) || ratio <= 0) return '#cfd4da';
      return ratio > .80 ? '#7a0f17' : ratio > .60 ? '#b41821' : ratio > .40 ? '#e96a3a' :
             ratio > .20 ? '#f6b65b' : ratio > .10 ? '#f7d77a' : '#fce9b2';
    }

    updateGeoLayer() {
      if (!this._geoLayer) return;
      this.computeMaxValue();
      // Single-Modus: Standard-Cross-Erhebungs-Detection wenn Doppelbestreuung
      // aktiv und WK-Modus.
      // Multi-Modus: Cross-GF-Doppel (separat schaltbar) markiert PLZs, die
      // in 2+ aktiv-kombinierten Erhebungen mit HZ=X bestreut werden.
      if (this.currentMapMode === 'wk' && this.showCritical) {
        this._computeCrossErhebungDoppel();
      } else if (this._crossErhebungPLZ && Object.keys(this._crossErhebungPLZ).length > 0) {
        // Bug DB2 Fix: bei deaktivierter Doppelbestreuung den stale State
        // wegräumen, damit kein alter Cross-Marker hängenbleibt.
        this._crossErhebungPLZ = {};
      }
      if (this._crossGfDoppelAktiv && this._activeErhebungen?.length > 1) {
        this._computeCrossGfDoppel();
      } else if (this._crossGfDoppel) {
        this._crossGfDoppel = null;
      }

      this._triggerSweepAnimation();
      if (this._layerByPLZ) {
        for (const plz of Object.keys(this._layerByPLZ)) this.applyStyleToLayer(this._layerByPLZ[plz]);
      } else {
        this._geoLayer.eachLayer(layer => this.applyStyleToLayer(layer));
      }
      this.updateBestreuungMarkers();
      this.updateHeatmapLegend();

      if (this._highlightedPLZ) {
        const layer = this._layerByPLZ?.[this._highlightedPLZ];
        if (layer) layer.setStyle({ weight: 3, color: '#f0a500', fillOpacity: layer.options.fillOpacity });
      }
    }

    _triggerSweepAnimation() {
      if (!this._geoLayer) return;
      const container = this._geoLayer.getPane?.() || this._geoLayer._map?.getPanes?.()?.overlayPane;
      if (!container) return;

      // Bestehender Fade: Pane geht kurz auf 0.1 → 1.0, damit der
      // Color-Tausch der PLZ-Flächen weich aussieht.
      container.style.transition = 'opacity 0.05s';
      container.style.opacity = '0.1';
      requestAnimationFrame(() => {
        this._setTimeout(() => {
          container.style.transition = 'opacity 0.55s var(--ease-out)';
          container.style.opacity = '1';
        }, 50);
      });

      // Zusätzlicher Sweep-Overlay: ein wandernder Gradient-Streifen über
      // die Karte. Wirkt wie ein "Scan" — kurz und filmisch. Wird nach der
      // Animation automatisch entfernt.
      const mc = this._shadowRoot.querySelector('.map-container');
      if (!mc) return;
      // Doppelte Sweeps verhindern: falls schon einer läuft, abbrechen.
      const existing = mc.querySelector('.map-sweep-overlay');
      if (existing) existing.remove();
      const sweep = document.createElement('div');
      sweep.className = 'map-sweep-overlay';
      mc.appendChild(sweep);
      // Nach Animation-Ende entfernen
      this._setTimeout(() => { try { sweep.remove(); } catch (e) {} }, 1200);
    }

    updateBestreuungMarkers() {
      this.bestreuungGroup.clearLayers();
      if (this.currentMapMode === 'wk') return;
      if (!this.showBestreuung || !this._layerByPLZ) return;
      for (const plz of Object.keys(this._layerByPLZ)) {
        const daten = this.filteredKennwerte?.[plz];
        if (!daten?.isHZ) continue;
        const layer = this._layerByPLZ[plz];
        const pulseLayer = L.geoJSON(layer.feature, {
          renderer: this._canvasRenderer,
          style: {
            fillColor: 'transparent', fill: false,
            color: '#1565c0', weight: 2.5, opacity: 0.85,
            dashArray: '6 3', className: 'bestreuung-pulse-path'
          },
          interactive: false
        });
        this.bestreuungGroup.addLayer(pulseLayer);
      }
    }

    // ── Mitbewerber-Marker (Hornbach + künftig weitere Brands) ─────────
    updateCompetitorMarkers() {
      if (!this.competitorGroup) return;
      this.competitorGroup.clearLayers();
      if (!this.showCompetitors) return;
      if (!this._competitorData?.length) return;

      // Aktive NL-Koordinaten sammeln (nur die, die gerade selektiert sind)
      const activeNLCoords = [];
      const selNLs = this._selectedNLs;
      const allSelected = !selNLs || selNLs.size === 0 ||
                          selNLs.size === (this.allNLs?.length ?? 0);
      for (const [nl, coords] of Object.entries(this.nlKoordinaten || {})) {
        if (!allSelected && !selNLs.has(nl)) continue;
        activeNLCoords.push({ lat: coords.lat, lon: coords.lon });
      }
      if (activeNLCoords.length === 0) return;

      const RADIUS_KM = 60;
      const toRad = d => d * Math.PI / 180;
      const haversine = (lat1, lon1, lat2, lon2) => {
        const R = 6371;
        const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };

      // Brand-spezifische Icon-Definitionen
      const brandConfig = {
        Hornbach: { color: '#f26522', label: 'HOR', size: 24 },
        OBI:      { color: '#f5a800', label: 'OBI', size: 24 },
        Globus:   { color: '#0066b2', label: 'GLO', size: 24 },
        Hellweg:  { color: '#e30613', label: 'HEL', size: 24 },
        Toom:     { color: '#00843d', label: 'TOO', size: 24 },
        Hagebau:  { color: '#e94e1b', label: 'HAG', size: 24 },
      };
      const defaultConfig = { color: '#888', label: '???', size: 24 };

      // Vorfilter: nur Mitbewerber im RADIUS_KM einer aktiven NL behalten
      const visible = [];
      for (const comp of this._competitorData) {
        const { lat, lon } = comp;
        if (typeof lat !== 'number' || typeof lon !== 'number') continue;
        let minDist = Infinity;
        for (const nl of activeNLCoords) {
          const d = haversine(nl.lat, nl.lon, lat, lon);
          if (d < minDist) minDist = d;
        }
        if (minDist > RADIUS_KM) continue;
        visible.push({ ...comp, minDist });
      }

      // Clustering: bei niedrigem Zoom-Level Marker zusammenfassen, die in
      // Pixel-Nähe (~40px) zueinander stehen. Einfaches Greedy-Clustering —
      // kein externes Plugin nötig. Bei zoom >= 9 wird nicht geclustert
      // (alle Marker einzeln sichtbar).
      const zoom = this.map?.getZoom() ?? 9;
      const clusterPxThreshold = 36;
      const groups = [];   // Array<{ lat, lon, items: [comp...] }>
      if (zoom < 9 && this.map) {
        const used = new Array(visible.length).fill(false);
        for (let i = 0; i < visible.length; i++) {
          if (used[i]) continue;
          used[i] = true;
          const grp = { items: [visible[i]] };
          const pi = this.map.latLngToContainerPoint([visible[i].lat, visible[i].lon]);
          for (let j = i + 1; j < visible.length; j++) {
            if (used[j]) continue;
            const pj = this.map.latLngToContainerPoint([visible[j].lat, visible[j].lon]);
            const dx = pi.x - pj.x, dy = pi.y - pj.y;
            if (Math.sqrt(dx * dx + dy * dy) < clusterPxThreshold) {
              used[j] = true;
              grp.items.push(visible[j]);
            }
          }
          // Cluster-Center = Mittelwert der Punkte
          const cLat = grp.items.reduce((s, x) => s + x.lat, 0) / grp.items.length;
          const cLon = grp.items.reduce((s, x) => s + x.lon, 0) / grp.items.length;
          grp.lat = cLat; grp.lon = cLon;
          groups.push(grp);
        }
      } else {
        for (const c of visible) groups.push({ lat: c.lat, lon: c.lon, items: [c] });
      }

      for (const grp of groups) {
        if (grp.items.length > 1) {
          // Cluster-Marker: kompakter Kreis mit Anzahl
          const size = Math.min(36, 22 + grp.items.length * 2);
          const icon = L.divIcon({
            html: `<div class="competitor-cluster" style="
              width:${size}px; height:${size}px;
              line-height:${size - 4}px;
              font-size:${Math.max(11, size / 2.4)}px;
            ">${grp.items.length}</div>`,
            className: '',
            iconSize:   [0, 0],
            iconAnchor: [0, 0],
          });
          const marker = L.marker([grp.lat, grp.lon], { icon, interactive: true, zIndexOffset: 60 });
          // Tooltip mit Liste der Mitbewerber im Cluster
          const lines = grp.items.slice(0, 8).map(c =>
            `<span style="color:${(brandConfig[c.brand] ?? defaultConfig).color}">●</span> ${escapeHtml(c.brand)} — ${escapeHtml(c.name)}`
          );
          const more = grp.items.length > 8 ? `<br><em>… ${grp.items.length - 8} weitere</em>` : '';
          marker.bindTooltip(
            `<strong>${grp.items.length} Mitbewerber</strong><br>${lines.join('<br>')}${more}`,
            { direction: 'top', offset: [0, -size / 2], className: 'competitor-tooltip' }
          );
          // Klick zoomt auf den Cluster-Bereich
          marker.on('click', () => {
            if (this.map) this.map.setView([grp.lat, grp.lon], zoom + 2, { animate: true });
          });
          this.competitorGroup.addLayer(marker);
        } else {
          const comp = grp.items[0];
          const { brand, name, lat, lon, minDist } = comp;
          const cfg = brandConfig[brand] ?? defaultConfig;
          const distLabel = minDist < 999 ? `${Math.round(minDist)} km zur nächsten NL` : '';

          const icon = L.divIcon({
            html: `<div style="
              width:${cfg.size}px; height:${cfg.size}px;
              background:${cfg.color};
              opacity:0.72;
              border-radius:50% 50% 50% 0;
              transform:rotate(-45deg);
              box-shadow:-1px 2px 4px rgba(0,0,0,0.25);
              display:flex; align-items:center; justify-content:center;
              border:1.5px solid rgba(255,255,255,0.6);
              transition: opacity 0.18s ease, transform 0.18s ease;
            "><span style="transform:rotate(45deg);font-size:8px;font-weight:700;color:white;
              font-family:system-ui;letter-spacing:-0.02em;line-height:1">${escapeHtml(cfg.label)}</span></div>`,
            className: '',
            iconSize:   [0, 0],
            iconAnchor: [0, 0],
          });

          const marker = L.marker([lat, lon], { icon, interactive: true, zIndexOffset: 50 });
          // Tooltip mit Vollname (statt nur 3-Buchstaben-Code) — bei Hover
          // sieht der User sofort welches Geschäft das ist.
          marker.bindTooltip(
            `<strong style="color:${cfg.color}">${escapeHtml(brand)}</strong><br>
             ${escapeHtml(name)}<br>
             <span style="font-size:0.85em;color:#666">${escapeHtml(distLabel)}</span>`,
            { direction: 'top', offset: [0, -cfg.size / 2], className: 'competitor-tooltip' }
          );
          this.competitorGroup.addLayer(marker);
        }
      }
    }

    initializeMapTiles() {
      if (!this.map) return;
      this._tileLayer = L.tileLayer(OSM_TILES, {
        attribution: '© OpenStreetMap', maxZoom: 19
      }).addTo(this.map);
    }
    removeMapTiles() {
      if (this.map && this._tileLayer) { this.map.removeLayer(this._tileLayer); this._tileLayer = null; }
    }
    toggleMapTiles() {
      if (this._tilesVisible) { this.removeMapTiles();     this._tilesVisible = false; }
      else                     { this.initializeMapTiles(); this._tilesVisible = true;  }
      // Tile-Toggle ändert die Default-Opacity der PLZ-Flächen → alle
      // sichtbaren Layer neu zeichnen, damit der Unterschied sofort sichtbar
      // wird (ohne dass der User Radius/Modus ändern muss).
      if (this._layerByPLZ) {
        for (const plz of Object.keys(this._layerByPLZ)) {
          this.applyStyleToLayer(this._layerByPLZ[plz]);
        }
      }
    }

    // ── Niederlassungen / Marker ───────────────────────────────────────
    createAllMarkers() {
      if (!this.filteredGroup) return;
      this.filteredGroup.clearLayers();
      this.neighbourGroup?.clearLayers();
      this.radiusGroup?.clearLayers();
      this.allMarkers = []; this.nlMarkers = [];
      if (!this.Niederlassung || !this.nlKoordinaten) return;

      const seen = new Set();
      for (const [nlKey, nlName] of Object.entries(this.Niederlassung)) {
        const coords = this.nlKoordinaten[nlKey];
        if (!coords || seen.has(nlKey)) continue;
        const marker = L.marker([coords.lat, coords.lon], {
          icon: this.createMarkerIcon(nlName, false, this._isNLInvalid(nlKey)),
          title: nlName,
          plzs: [nlKey]
        });
        marker.setZIndexOffset(1000);
        marker.on('click', () => this.toggleNLSelection(nlKey));
        this.allMarkers.push(marker);
        this.filteredGroup.addLayer(marker);
        this.nlMarkers.push({ lat: coords.lat, lng: coords.lon, marker });
        seen.add(nlKey);
      }
      if (Array.isArray(this.extraNLs)) {
        for (const { nl, lat, lon } of this.extraNLs) {
          const marker = L.marker([lat, lon], {
            icon: this.createMarkerIcon(nl, false, this._isNLInvalid(nl)), title: nl, plzs: [nl]
          });
          marker.setZIndexOffset(1000);
          marker.on('click', () => this.toggleNLSelection(nl));
          this.allMarkers.push(marker);
          this.filteredGroup.addLayer(marker);
          this.nlMarkers.push({ lat, lng: lon, marker });
        }
      }
      this.allNLs = [...Object.keys(this.Niederlassung), ...(this.extraNLs?.map(e => e.nl) ?? [])];
      this._selectedNLs = new Set(this.allNLs);
      this._nlSelectionInitialized = false;

      this.applyNLFilter([...this._selectedNLs]);
      this.updateMarkers();
      this._buildDistanceCache();
      const radius = Number(this.$('radius-slider')?.value ?? 0);
      // applyRadiusFilter ruft intern updateGeoLayer auf — kein extra-Aufruf nötig
      this.applyRadiusFilter(radius);
      this.updateCompetitorMarkers();
      this.updateNLSelectionUI?.();
    }

    applyNLFilter(selectedNLs) {
      this._selectedNLs = new Set(selectedNLs);
      if (!this.filteredData || this.filteredData.length === 0) return;
      const plzSet = new Set();
      const selNLs = this._selectedNLs;
      const data = this.filteredData;
      for (let i = 0, len = data.length; i < len; i++) {
        const row = data[i];
        const nl  = row['dimension_niederlassung_0']?.id?.trim();
        if (selNLs.size > 0 && !selNLs.has(nl)) continue;
        const __land = this._landOfRow(row); const __bare = this._normalizePLZ(row['dimension_plz_0']?.id, __land); const plz = (__bare && !this._isAggregatePlz(__bare)) ? this._plzKey(__land, __bare) : null;
        // Bug PLZ3 Fix: '00000' = Stammdaten-Aggregat ohne echte PLZ-Zuordnung.
        // Sonst landet das in filteredPLZs und verfälscht alle abgeleiteten
        // Aggregate (computeWKKennwerte etc.).
        if (plz && plz !== '00000') plzSet.add(plz);
      }
      this.filteredPLZs = [...plzSet];
      this.computeWKKennwerte();
    }

    createMarkerIcon(nl, isPhantom = false, isInvalid = false) {
      const key = nl + (isPhantom ? '_phantom' : '_active') + (isInvalid ? '_warn' : '');
      if (!this.iconCache[key]) {
        const color  = isPhantom ? '#8c9099' : '#b41821';
        const border = isPhantom ? '1.5px solid rgba(60,60,80,0.4)' : 'none';
        const shadow = isPhantom ? '-1px 2px 4px rgba(0,0,0,0.25)' : '-1px 2px 6px rgba(180,24,33,0.4)';
        const opacity = isPhantom ? 0.75 : 1;
        // Warn-Badge oben rechts am Marker. Es sitzt außerhalb der gedrehten
        // Tropfen-Form und ist gegen-gedreht, damit es aufrecht erscheint.
        // Position absolut relativ zum 30x30 Marker-Container.
        const warnBadge = isInvalid
          ? `<div style="position:absolute;top:-4px;right:-4px;width:14px;height:14px;background:#f0a500;border-radius:50%;border:1.5px solid white;display:flex;align-items:center;justify-content:center;font-size:9px;line-height:1;z-index:2;box-shadow:0 1px 3px rgba(0,0,0,0.3);" title="Diese NL hat Umsatz ohne PLZ-Zuordnung">!</div>`
          : '';
        const markerHtml = `<div style="position:relative;width:30px;height:30px;">
          <div style="width:30px;height:30px;background-color:${color};opacity:${opacity};border-radius:50% 50% 50% 0;box-shadow:${shadow};transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:white;font-family:system-ui;border:${border};"><div style="transform:rotate(45deg)">${escapeHtml(nl)}</div></div>
          ${warnBadge}
        </div>`;
        this.iconCache[key] = L.divIcon({ html: markerHtml, className: '', iconSize: [30, 30], iconAnchor: [15, 30] });
      }
      return this.iconCache[key];
    }

    // Hilfs-Check: hat diese NL ein Erfassungs-Problem (>100%)?
    // Wird zur Kennzeichnung in der NL-Tabelle UND am Karten-Marker genutzt.
    _isNLInvalid(nl) {
      const info = this.erhebungsInfo?.[nl];
      return !!(info && info.pct_erfassung > 1.005);
    }

    updateMarkers() {
      if (!this.filteredGroup || !this.allMarkers) return;
      this.filteredGroup.clearLayers();
      const data = this.filteredData || [];
      if (!data.length) return;

      const erhNLs = new Set();
      for (const row of data) {
        const nl = row['dimension_niederlassung_0']?.id?.trim();
        if (nl) erhNLs.add(nl);
      }
      const activeMarkers = [];
      for (const marker of this.allMarkers) {
        const nl = marker.options.plzs?.[0];
        if (!nl || !erhNLs.has(nl)) continue;
        this.filteredGroup.addLayer(marker);

        const isSelected = !this._selectedNLs?.size || this._selectedNLs.has(nl);
        marker.setIcon(this.createMarkerIcon(nl, !isSelected, this._isNLInvalid(nl)));
        // Alte Handler abhängen (z.B. von vorigem updateMarkers)
        marker.off('mouseover'); marker.off('mouseout');
        marker.on('mouseover', () => {
          const el = marker.getElement();
          if (el) { el.style.filter = 'brightness(1.2)'; el.style.zIndex = '10000'; }
        });
        marker.on('mouseout', () => {
          const el = marker.getElement();
          if (el) { el.style.filter = ''; el.style.zIndex = ''; }
        });
        if (isSelected) { marker.setZIndexOffset(1000); activeMarkers.push(marker); }
        else            { marker.setZIndexOffset(100); }
      }
      this.nlMarkers = activeMarkers.map(m => ({ lat: m.getLatLng().lat, lng: m.getLatLng().lng, marker: m }));
    }

    toggleNLSelection(nl) {
      if (!this._selectedNLs) this._selectedNLs = new Set();
      const allCount = this.allNLs?.length || 0;
      if (this._selectedNLs.size === allCount) {
        this._selectedNLs = new Set([nl]);
      } else if (this._selectedNLs.has(nl)) {
        this._selectedNLs.delete(nl);
        if (this._selectedNLs.size === 0) this._selectedNLs = new Set(this.allNLs);
      } else {
        this._selectedNLs.add(nl);
        if (this._selectedNLs.size === allCount) this._selectedNLs = new Set(this.allNLs);
      }
      this.updateNLSelectionUI();
      this.updateMarkers();
      this._distanceCacheNLKey = null;
      this._buildDistanceCache();
      // applyRadiusFilter ruft intern prepareUmsatzPLZWerte, computeWKKennwerte,
      // computeStreuverlust, updateGeoLayer, renderDataTable, _rerenderActivePopup auf
      const radius = Number(this.$('radius-slider').value);
      this.applyRadiusFilter(radius);
      this.updateCompetitorMarkers();
      // Nach NL-Wechsel immer Overview zeigen (überschreibt ggf. _rerenderActivePopup)
      this.showOverviewPopup();
    }

    initRadiusSlider() {
      const slider     = this.$('radius-slider');
      const valueLabel = this.$('radius-value');
      if (!slider) return;
      valueLabel.textContent = slider.value;
      const updateFill = () => {
        const min = +slider.min, max = +slider.max, val = +slider.value;
        const pct = ((val - min) / (max - min)) * 100;
        slider.style.background = `linear-gradient(90deg, var(--red) ${pct}%, var(--gray-200) ${pct}%)`;
      };
      updateFill();
      let debounceTimer = null;
      this._on(slider, 'input', () => {
        const radius = Number(slider.value);
        valueLabel.textContent = radius; updateFill();
        // Live-Preview: halbtransparente Kreise um aktive NLs während des
        // Schiebens — gibt visuelles Feedback ohne die teure Aggregation
        // erneut zu rechnen. Wird debounced angewendet (echte Filterung).
        this._showRadiusPreview(radius);
        if (debounceTimer != null) {
          clearTimeout(debounceTimer);
          this._timers.delete(debounceTimer);
          debounceTimer = null;
        }
        debounceTimer = this._setTimeout(() => {
          debounceTimer = null;
          this._hideRadiusPreview();
          this.applyRadiusFilter(radius);
          if (this._activeFilter) this.showOverviewPopup();
        }, 80);
      });
      // Bei Loslassen Preview auch wegmachen (falls noch da)
      this._on(slider, 'change', () => this._hideRadiusPreview());
      this._on(slider, 'mouseup',   () => this._hideRadiusPreview());
      this._on(slider, 'touchend',  () => this._hideRadiusPreview());
    }

    // Live-Preview-Kreise um aktive NLs während des Slider-Drags
    _showRadiusPreview(radiusKm) {
      if (!this.map || !this._activeFilter) return;
      if (!this._radiusPreviewGroup) {
        this._radiusPreviewGroup = L.layerGroup().addTo(this.map);
      }
      this._radiusPreviewGroup.clearLayers();
      const selNLs = this._selectedNLs;
      const allSelected = !selNLs || selNLs.size === 0 ||
                          selNLs.size === (this.allNLs?.length ?? 0);
      for (const [nl, coords] of Object.entries(this.nlKoordinaten || {})) {
        if (!allSelected && !selNLs.has(nl)) continue;
        if (typeof coords.lat !== 'number' || typeof coords.lon !== 'number') continue;
        const circle = L.circle([coords.lat, coords.lon], {
          radius: radiusKm * 1000,    // km → m
          color: '#b41821',
          weight: 1.5,
          opacity: 0.55,
          fillColor: '#b41821',
          fillOpacity: 0.05,
          interactive: false,
          className: 'radius-preview-circle',
        });
        this._radiusPreviewGroup.addLayer(circle);
      }
    }

    _hideRadiusPreview() {
      if (this._radiusPreviewGroup) {
        this._radiusPreviewGroup.clearLayers();
      }
    }


    // ── Side-Popups ────────────────────────────────────────────────────
    _onClosePopup(popup, { clearHighlight = true } = {}) {
      popup.classList.remove('show'); popup.classList.add('hidden');
      this._activePopupPLZ = null; this._activePopupType = null;
      if (clearHighlight && this._highlightedPLZ) {
        const l = this._layerByPLZ?.[this._highlightedPLZ];
        if (l) this.applyStyleToLayer(l);
        this._highlightedPLZ = null;
      }
      this._syncPanelState();
    }

    showPopup(feature, daten, key) {
      const __land = key ? String(key).split(':')[0] : DEFAULT_LAND;
      const bare = key ? String(key).split(':').slice(1).join(':')
                       : String(feature.properties?.plz ?? '').padStart((COUNTRY_CONFIG[__land] && COUNTRY_CONFIG[__land].plzLen) || 5, '0').trim();
      const plz = key || this._plzKey(__land, bare);
      const note = feature.properties?.note || 'Keine Notiz';
      this._activePopupPLZ = plz; this._activePopupType = 'wk';

      // Andere Popups schließen
      for (const id of ['side-popup-umsatz', 'side-popup-overview']) {
        const el = this.$(id);
        if (el) { el.classList.remove('show'); el.classList.add('hidden'); }
      }
      this._syncPanelState();

      const umsatz = this.filteredPLZWerte?.[plz] || {};
      let symbol = '📍';
      if (daten?.isCritical) symbol = '⚠️'; else if (daten?.isHZ) symbol = '✅';

      const isHZ = !!daten?.isHZ;

      // Basis-Felder immer anzeigen
      const beschreibungen = {
        value_hr_n_umsatz_0:      'Umsatz (hochgerechnet)',
        value_umsatz_p_hh_0:      'Umsatz p. HH',
        value_wk_in_percent_0:    'Werbekosten (%)',
        value_wk_nachbar_0:       'WK (%) inkl. Nachb.',
        value_hz_kosten_0:        'HZ-Werbekosten',
        value_werbeverweigerer_0: 'Werbeverweigerer (%)',
        value_haushalte_0:        'Haushalte',
        value_kaufkraft_0:        'BM-Kaufkraft-Idx',
        value_ums_erhebung_0:     'Umsatz',
        value_kd_erhebung_0:      'Anzahl Kunden',
        value_bon_erhebung_0:     'Ø-Bon',
        value_auflage_0:          'Auflage'
      };

      // Potentielle WK nur bei nicht-bestreuten PLZs anzeigen
      const beschreibungenPot = !isHZ ? {
        value_hz_potentiell_0:   'Pot. HZ-Werbekosten',
        value_wk_potentiell_0:   'Pot. WK (%)',
      } : {};

      // Lokale Kopie — nie filteredKennwerte direkt mutieren
      const d = { ...daten };
      d.value_umsatz_p_hh_0 = { raw: umsatz.umsatzProHaushalt ?? 0 };
      d.value_haushalte_0   = { raw: umsatz.haushalte ?? 0 };
      d.value_kaufkraft_0   = { raw: umsatz.kaufkraftIndex ?? 0 };
      const kd = d.value_kd_erhebung_0?.raw ?? 0;
      const ue = d.value_ums_erhebung_0?.raw ?? 0;
      d.value_bon_erhebung_0 = { raw: kd > 0 ? Number((ue / kd).toFixed(2)) : 0 };

      // Felder die als ganze Euro-Beträge angezeigt werden sollen
      const euroFields = new Set([
        'value_hr_n_umsatz_0', 'value_hz_kosten_0', 'value_ums_erhebung_0',
        'value_hz_potentiell_0', 'value_wk_potentiell_0'
      ]);
      // Pro-HH-Felder: 2 Nachkommastellen
      const hhFields = new Set(['value_umsatz_p_hh_0']);

      let rowsHtml = '';
      const renderRow = (id, label) => {
        const raw = d?.[id]?.raw;
        let wert;
        if (typeof raw !== 'number') {
          wert = '–';
        } else if (euroFields.has(id)) {
          wert = Math.round(raw).toLocaleString('de-DE');
        } else if (hhFields.has(id)) {
          wert = Number(raw).toFixed(2).replace('.', ',');
        } else {
          wert = raw.toLocaleString('de-DE');
        }
        return `<tr><td class="label-cell">${escapeHtml(label)}</td><td class="value-cell">${escapeHtml(wert)}</td></tr>`;
      };

      Object.entries(beschreibungen).forEach(([id, label], idx) => {
        if (idx === 8) rowsHtml += `<tr><td colspan="2" class="section-title">Erhebungsdaten</td></tr>`;
        rowsHtml += renderRow(id, label);
      });

      if (!isHZ && Object.keys(beschreibungenPot).length > 0) {
        rowsHtml += `<tr><td colspan="2" class="section-title" style="color:var(--red)">Potential (nicht bestreut)</td></tr>`;
        Object.entries(beschreibungenPot).forEach(([id, label]) => {
          rowsHtml += renderRow(id, label);
        });
      }

      const popup = this.$('side-popup');
      popup.innerHTML = `
        <div class="popup-header-strip">
          <span class="detail-badge">PLZ-Detail</span>
          <div class="popup-title" title="${escapeHtml(note)}">${symbol} ${escapeHtml(note)}</div>
          <div class="popup-location">PLZ ${escapeHtml(bare)}</div>
          <button class="close-btn" type="button">✕</button>
        </div>
        <table>
          <thead><tr><th colspan="2" class="subtitle-cell">Hochrechnung Jahr</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>`;
      popup.classList.remove('hidden'); void popup.offsetWidth; popup.classList.add('show');
      this._on(popup.querySelector('.close-btn'), 'click', () => this._onClosePopup(popup));
    }

    showUmsatzPopup(plz, values) {
      const bare = String(plz).split(':').slice(1).join(':') || String(plz);
      const popup = this.$('side-popup-umsatz');
      for (const id of ['side-popup', 'side-popup-overview']) {
        const el = this.$(id);
        if (el) { el.classList.remove('show'); el.classList.add('hidden'); }
      }
      this._activePopupPLZ = plz; this._activePopupType = 'umsatz';
      this._syncPanelState();

      const isWerbung = this.umsatzMainMode === 'werbung';
      const useWerbe  = this.useWerbeUmsatz === true;
      const useZusatz = this.useZusatzUmsatz === true;
      const note = this.geoNotes?.[plz] || bare;

      const pick = (base, werb, zusatz, baseHH, werbHH, zusatzHH) => {
        if (!isWerbung) return { abs: base, hh: baseHH };
        let abs = 0, hh = 0;
        if (useWerbe)  { abs += werb;   hh += werbHH;  }
        if (useZusatz) { abs += zusatz; hh += zusatzHH; }
        return { abs, hh };
      };

      const st = pick(values.umsatz,     values.umsatzWerbung,     values.umsatzZusatz,     values.umsatzProHaushalt,     values.umsatzWerbungProHaushalt,     values.umsatzZusatzProHaushalt);
      const pc = pick(values.pluscard,   values.pluscardWerbung,   values.pluscardZusatz,   values.pluscardProHaushalt,   values.pluscardWerbungProHaushalt,   values.pluscardZusatzProHaushalt);
      const ra = pick(values.ra,         values.raWerbung,         values.raZusatz,         values.raProHaushalt,         values.raWerbungProHaushalt,         values.raZusatzProHaushalt);
      const os = pick(values.onlineshop, values.onlineshopWerbung, values.onlineshopZusatz, values.onlineshopProHaushalt, values.onlineshopWerbungProHaushalt, values.onlineshopZusatzProHaushalt);

      const active = {
        stationaer: this.activeCategories.has('stationaer'),
        pluscard:   this.activeCategories.has('pluscard'),
        ra:         this.activeCategories.has('ra'),
        online:     this.activeCategories.has('online'),
      };
      const totalAbs = (active.stationaer?st.abs:0)+(active.pluscard?pc.abs:0)+(active.ra?ra.abs:0)+(active.online?os.abs:0);
      const totalHH  = (active.stationaer?st.hh :0)+(active.pluscard?pc.hh :0)+(active.ra?ra.hh :0)+(active.online?os.hh :0);

      // Bug WA9 Fix: Werbeanteil-Berechnung respektiert activeCategories
      // (analog zu prepareUmsatzPLZWerte). Sonst wäre der Popup-Werbeanteil
      // inkonsistent zum Map-Werbeanteil wenn eine Kategorie deselektiert ist.
      let tN = 0, tW = 0, tZ = 0;
      if (active.stationaer) { tN += values.umsatz;     tW += values.umsatzWerbung;     tZ += values.umsatzZusatz; }
      if (active.pluscard)   { tN += values.pluscard;   tW += values.pluscardWerbung;   tZ += values.pluscardZusatz; }
      if (active.ra)         { tN += values.ra;         tW += values.raWerbung;         tZ += values.raZusatz; }
      if (active.online)     { tN += values.onlineshop; tW += values.onlineshopWerbung; tZ += values.onlineshopZusatz; }
      const antWA = tN > 0 ? ((tW / tN) * 100).toFixed(1) : '–';

      const pct = (x, t) => t > 0 ? (x / t) * 100 : 0;
      const hl = !isWerbung ? 'Gesamtumsatz'
               : useWerbe && useZusatz ? 'Werbeumsatz + Mitgekauft'
               : useWerbe ? 'Werbeumsatz' : 'Mitgekauft';
      const dis = (key) => !active[key] ? 'opacity:0.3;filter:grayscale(1)' : '';

      popup.innerHTML = `
        <div class="popup-header">
          <div style="overflow:hidden;min-width:0">
            <span class="detail-badge">PLZ-Detail</span>
            <div title="${escapeHtml(note)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.97rem;font-weight:700;">${escapeHtml(note)}</div>
            <div style="font-size:0.68rem;opacity:0.75;font-weight:500;margin-top:2px;letter-spacing:.04em;">PLZ ${escapeHtml(bare)}</div>
          </div>
          <button class="close-btn" type="button">✕</button>
        </div>
        <div style="overflow-y:auto;flex:1;min-height:0;">
          <div class="umsatz-subheader">
            <span class="strong">${escapeHtml(hl)}: ${fmtNum(totalAbs)} €</span><br>
            <span style="font-size:0.78rem;color:var(--gray-500)">${fmtDec(totalHH)} € / HH &nbsp;·&nbsp; Werbeanteil: ${escapeHtml(antWA)} %</span>
          </div>
          <div class="umsatz-bar" style="margin:8px 14px 2px">
            <div style="background:var(--red);width:${pct(tN,tN+tW+tZ)}%"></div>
            <div style="background:#1f78b4;width:${pct(tW,tN+tW+tZ)}%"></div>
            <div style="background:#ffb000;width:${pct(tZ,tN+tW+tZ)}%"></div>
          </div>
          <div class="umsatz-legend" style="padding:2px 14px 8px">
            <span><span style="color:var(--red)">⬤</span> Normal</span>
            <span><span style="color:#1f78b4">⬤</span> Werbung</span>
            <span><span style="color:#ffb000">⬤</span> Mitgekauft</span>
          </div>

          <div class="section-title">Nach Kategorien</div>
          <div class="umsatz-grid" style="padding:6px 14px">
            <div class="label" style="font-weight:700;color:var(--gray-800)">Kategorie</div>
            <div class="value" style="font-weight:700;color:var(--gray-800)">Absolut</div>
            <div class="value" style="font-weight:700;color:var(--gray-800)">/ HH</div>
            <div class="label" style="${dis('stationaer')}">🏬 Stationär</div>
            <div class="value" style="${dis('stationaer')}">${fmtNum(st.abs)} €</div>
            <div class="value" style="${dis('stationaer')}">${fmtDec(st.hh)} €</div>
            <div class="label" style="${dis('pluscard')}">💳 Pluscard</div>
            <div class="value" style="${dis('pluscard')}">${fmtNum(pc.abs)} €</div>
            <div class="value" style="${dis('pluscard')}">${fmtDec(pc.hh)} €</div>
            <div class="label" style="${dis('ra')}">📦 R&amp;A</div>
            <div class="value" style="${dis('ra')}">${fmtNum(ra.abs)} €</div>
            <div class="value" style="${dis('ra')}">${fmtDec(ra.hh)} €</div>
            <div class="label" style="${dis('online')}">🛒 KUBE OS</div>
            <div class="value" style="${dis('online')}">${fmtNum(os.abs)} €</div>
            <div class="value" style="${dis('online')}">${fmtDec(os.hh)} €</div>
          </div>

          <div class="section-title">Umsatzanteile (Gesamt)</div>
          <div class="umsatz-bar" style="margin:8px 14px 2px">
            <div class="share-stationaer" style="width:${pct(values.umsatz,tN)}%"></div>
            <div class="share-pluscard"   style="width:${pct(values.pluscard,tN)}%"></div>
            <div class="share-ra"         style="width:${pct(values.ra,tN)}%"></div>
            <div class="share-online"     style="width:${pct(values.onlineshop,tN)}%"></div>
          </div>
          <div class="umsatz-legend" style="padding:2px 14px 8px">
            <span><span style="color:var(--red)">⬤</span> Stationär</span>
            <span><span style="color:#1f78b4">⬤</span> Pluscard</span>
            <span><span style="color:#33a02c">⬤</span> R&amp;A</span>
            <span><span style="color:#ffb000">⬤</span> KUBE OS</span>
          </div>

          <div class="section-title">PLZ-Daten</div>
          <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:3px 10px;padding:8px 14px 14px;font-size:0.82rem;">
            <div style="color:var(--gray-600);font-weight:500">Haushalte</div>
            <div style="text-align:right;font-weight:700;color:var(--gray-800)">${fmtNum(values.haushalte)}</div>
            <div style="color:var(--gray-600);font-weight:500">Werbeverweigerer</div>
            <div style="text-align:right;font-weight:700;color:var(--gray-800)">${values.werbeverweigerer > 0 ? fmtNum(values.werbeverweigerer) + ' %' : '–'}</div>
            <div style="color:var(--gray-600);font-weight:500">Kaufkraft-Index</div>
            <div style="text-align:right;font-weight:700;color:var(--gray-800)">${values.kaufkraftIndex > 0 ? fmtNum(values.kaufkraftIndex) : '–'}</div>
          </div>
        </div>`;

      popup.classList.remove('hidden'); void popup.offsetWidth; popup.classList.add('show');
      this._on(popup.querySelector('.close-btn'), 'click', () => this._onClosePopup(popup));
    }

    showEmptyUmsatzPopup(plz) {
      const bare = String(plz).split(':').slice(1).join(':') || String(plz);
      const popup = this.$('side-popup-umsatz');
      if (!popup) return;
      const note = this.geoNotes?.[plz] || '—';
      this._activePopupPLZ = plz; this._activePopupType = 'umsatz';

      popup.innerHTML = `
        <div class="popup-header">
          <div style="overflow:hidden;min-width:0">
            <span class="detail-badge">PLZ-Detail</span>
            <div title="${escapeHtml(note)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.97rem;font-weight:700;">${escapeHtml(note)}</div>
            <div style="font-size:0.68rem;opacity:0.75;font-weight:500;margin-top:2px;letter-spacing:.04em;">PLZ ${escapeHtml(bare)}</div>
          </div>
          <button class="close-btn" type="button">✕</button>
        </div>
        <div style="padding:20px 14px;text-align:center;color:#adb5bd;font-size:0.85rem">
          <div style="font-size:2rem;margin-bottom:8px;opacity:.4">📭</div>
          Keine Umsatzdaten für PLZ ${escapeHtml(bare)}
        </div>`;
      popup.classList.remove('hidden'); void popup.offsetWidth; popup.classList.add('show');
      this._on(popup.querySelector('.close-btn'), 'click',
        () => this._onClosePopup(popup, { clearHighlight: false }));
    }

    showOverviewPopup() {
      if (!this._activeFilter) return;
      const popup = this.$('side-popup-overview');
      if (!popup) return;

      for (const id of ['side-popup', 'side-popup-umsatz']) {
        const el = this.$(id);
        if (el) { el.classList.remove('show'); el.classList.add('hidden'); }
      }
      if (this._highlightedPLZ) {
        const l = this._layerByPLZ?.[this._highlightedPLZ];
        if (l) this.applyStyleToLayer(l);
        this._highlightedPLZ = null;
      }
      this._activePopupPLZ = '__overview__'; this._activePopupType = 'overview';

      const { erhID } = this._activeFilter || {};
      const selNLs = this._selectedNLs;
      const allNLs = this.allNLs || [];
      // Bug U3 Fix: bei Multi-GF alle aktiven Erhebungen im Header zeigen,
      // nicht nur die Basis. Bei NL-Filter überschreibt die NL-Liste.
      let headerTitle;
      const activeCount = this._activeErhebungen?.length || 0;
      if (activeCount >= 2) {
        const ids = this._activeErhebungen.map(e => e.erhID).join(' + ');
        headerTitle = `${ids}  (${activeCount} GF-Bereiche)`;
      } else {
        headerTitle = this._fmtGF(erhID) || 'Übersicht';
      }
      if (selNLs?.size > 0 && selNLs.size < allNLs.length) headerTitle = [...selNLs].join(', ');

      this._syncPanelState();

      const isWerbung = this.umsatzMainMode === 'werbung';
      const useWerbe  = this.useWerbeUmsatz === true;
      const useZusatz = this.useZusatzUmsatz === true;

      const aggKeys = ['umsatz','ra','onlineshop','pluscard',
        'umsatzWerbung','raWerbung','onlineshopWerbung','pluscardWerbung',
        'umsatzZusatz','raZusatz','onlineshopZusatz','pluscardZusatz',
        'umsatzErhebung','haushalte',
        'umsatzProHaushalt','raProHaushalt','onlineshopProHaushalt','pluscardProHaushalt',
        'umsatzWerbungProHaushalt','raWerbungProHaushalt','onlineshopWerbungProHaushalt','pluscardWerbungProHaushalt',
        'umsatzZusatzProHaushalt','raZusatzProHaushalt','onlineshopZusatzProHaushalt','pluscardZusatzProHaushalt'];
      const agg = Object.fromEntries(aggKeys.map(k => [k, 0]));
      let totalUmsatzHR = 0, totalHZKosten = 0, totalHaushalteWK = 0, plzCount = 0;

      const radius = this.plzImRadius;
      const hasRadius = radius && radius.size > 0;
      for (const [plz, v] of Object.entries(this.filteredPLZWerte || {})) {
        if (hasRadius && !radius.has(plz)) continue;
        for (const key of aggKeys) agg[key] += v[key] || 0;
      }
      for (const [plz, k] of Object.entries(this.filteredKennwerte || {})) {
        if (hasRadius && !radius.has(plz)) continue;
        totalUmsatzHR    += k['value_hr_n_umsatz_0']?.raw ?? 0;
        totalHZKosten    += k['value_hz_kosten_0']?.raw   ?? 0;
        totalHaushalteWK += this.filteredPLZWerte?.[plz]?.haushalte ?? 0;
        plzCount++;
      }

      const pick = (base, werb, zusatz, baseHH, werbHH, zusatzHH) => {
        if (!isWerbung) return { abs: base, hh: baseHH };
        let abs = 0, hh = 0;
        if (useWerbe)  { abs += werb;   hh += werbHH;  }
        if (useZusatz) { abs += zusatz; hh += zusatzHH; }
        return { abs, hh };
      };
      const st = pick(agg.umsatz,    agg.umsatzWerbung,    agg.umsatzZusatz,    agg.umsatzProHaushalt,    agg.umsatzWerbungProHaushalt,    agg.umsatzZusatzProHaushalt);
      const pc = pick(agg.pluscard,  agg.pluscardWerbung,  agg.pluscardZusatz,  agg.pluscardProHaushalt,  agg.pluscardWerbungProHaushalt,  agg.pluscardZusatzProHaushalt);
      const ra = pick(agg.ra,        agg.raWerbung,        agg.raZusatz,        agg.raProHaushalt,        agg.raWerbungProHaushalt,        agg.raZusatzProHaushalt);
      const os = pick(agg.onlineshop,agg.onlineshopWerbung,agg.onlineshopZusatz,agg.onlineshopProHaushalt,agg.onlineshopWerbungProHaushalt,agg.onlineshopZusatzProHaushalt);

      const active = {
        stationaer: this.activeCategories.has('stationaer'),
        pluscard:   this.activeCategories.has('pluscard'),
        ra:         this.activeCategories.has('ra'),
        online:     this.activeCategories.has('online'),
      };
      const totalAbs = (active.stationaer?st.abs:0)+(active.pluscard?pc.abs:0)+(active.ra?ra.abs:0)+(active.online?os.abs:0);
      const totalHH  = (active.stationaer?st.hh :0)+(active.pluscard?pc.hh :0)+(active.ra?ra.hh :0)+(active.online?os.hh :0);
      // Bug WA9 Fix: Werbeanteil über aktive Kategorien rechnen (analog
      // prepareUmsatzPLZWerte und showUmsatzPopup) — sonst Inkonsistenz
      // zwischen Map und Overview-Popup.
      let tN = 0, tW = 0, tZ = 0;
      if (active.stationaer) { tN += agg.umsatz;     tW += agg.umsatzWerbung;     tZ += agg.umsatzZusatz; }
      if (active.pluscard)   { tN += agg.pluscard;   tW += agg.pluscardWerbung;   tZ += agg.pluscardZusatz; }
      if (active.ra)         { tN += agg.ra;         tW += agg.raWerbung;         tZ += agg.raZusatz; }
      if (active.online)     { tN += agg.onlineshop; tW += agg.onlineshopWerbung; tZ += agg.onlineshopZusatz; }
      const antWA = tN > 0 ? ((tW / tN) * 100).toFixed(1) : '–';

      const pct = (x, t) => t > 0 ? (x / t) * 100 : 0;
      const dis = (k) => !active[k] ? 'opacity:0.3;filter:grayscale(1)' : '';
      const hl = !isWerbung ? 'Gesamtumsatz'
               : useWerbe && useZusatz ? 'Werbeumsatz + Mitgekauft'
               : useWerbe ? 'Werbeumsatz' : 'Mitgekauft';

      popup.innerHTML = `
        <div class="popup-header">
          <div style="overflow:hidden;min-width:0">
            <span class="overview-badge">Gesamt</span>
            <div style="font-size:0.97rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:6px" title="${escapeHtml(headerTitle)}">
              ${escapeHtml(headerTitle)}
            </div>
            <div style="font-size:0.68rem;opacity:0.75;font-weight:500;margin-top:2px;">
              Aggregiert über ${plzCount} PLZ${plzCount === 1 ? '' : 's'}
            </div>
          </div>
          <button class="close-btn" type="button">✕</button>
        </div>
        <div style="overflow-y:auto;flex:1;min-height:0;">
          <div class="umsatz-subheader">
            <span class="strong">${escapeHtml(hl)}: ${fmtNum(totalAbs)} €</span><br>
            <span style="font-size:0.78rem;color:var(--gray-500)">${fmtDec(totalHH)} € / HH &nbsp;·&nbsp; Werbeanteil: ${escapeHtml(antWA)} %</span>
          </div>
          <div class="umsatz-bar" style="margin:8px 14px 2px">
            <div style="background:var(--red);width:${pct(tN,tN+tW+tZ)}%"></div>
            <div style="background:#1f78b4;width:${pct(tW,tN+tW+tZ)}%"></div>
            <div style="background:#ffb000;width:${pct(tZ,tN+tW+tZ)}%"></div>
          </div>
          <div class="umsatz-legend" style="padding:2px 14px 8px">
            <span><span style="color:var(--red)">⬤</span> Normal</span>
            <span><span style="color:#1f78b4">⬤</span> Werbung</span>
            <span><span style="color:#ffb000">⬤</span> Mitgekauft</span>
          </div>

          <div class="section-title">WK-Kennwerte</div>
          <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:3px 10px;padding:8px 14px;font-size:0.82rem;">
            <div style="color:var(--gray-600);font-weight:500">Umsatz (hochgerechnet)</div>
            <div style="text-align:right;font-weight:700;color:var(--gray-800)">${fmtNum(totalUmsatzHR)} €</div>
            <div style="color:var(--gray-600);font-weight:500">HZ-Werbekosten</div>
            <div style="text-align:right;font-weight:700;color:var(--gray-800)">${fmtNum(totalHZKosten)} €</div>
            <div style="color:var(--gray-600);font-weight:500">Haushalte</div>
            <div style="text-align:right;font-weight:700;color:var(--gray-800)">${fmtNum(Math.round(totalHaushalteWK))}</div>
          </div>

          <div class="section-title">Umsatzanteile (Kategorien)</div>
          <div class="umsatz-bar" style="margin:8px 14px 2px">
            <div class="share-stationaer" style="width:${pct(agg.umsatz,tN)}%"></div>
            <div class="share-pluscard"   style="width:${pct(agg.pluscard,tN)}%"></div>
            <div class="share-ra"         style="width:${pct(agg.ra,tN)}%"></div>
            <div class="share-online"     style="width:${pct(agg.onlineshop,tN)}%"></div>
          </div>
          <div class="umsatz-legend" style="padding:2px 14px 8px">
            <span><span style="color:var(--red)">⬤</span> Stationär</span>
            <span><span style="color:#1f78b4">⬤</span> Pluscard</span>
            <span><span style="color:#33a02c">⬤</span> R&amp;A</span>
            <span><span style="color:#ffb000">⬤</span> KUBE OS</span>
          </div>

          <div class="section-title">Nach Kategorien</div>
          <div class="umsatz-grid" style="padding:6px 14px">
            <div class="label" style="font-weight:700;color:var(--gray-800)">Kategorie</div>
            <div class="value" style="font-weight:700;color:var(--gray-800)">Absolut</div>
            <div class="value" style="font-weight:700;color:var(--gray-800)">/ HH</div>
            <div class="label" style="${dis('stationaer')}">🏬 Stationär</div>
            <div class="value" style="${dis('stationaer')}">${fmtNum(st.abs)} €</div>
            <div class="value" style="${dis('stationaer')}">${fmtDec(st.hh)} €</div>
            <div class="label" style="${dis('pluscard')}">💳 Pluscard</div>
            <div class="value" style="${dis('pluscard')}">${fmtNum(pc.abs)} €</div>
            <div class="value" style="${dis('pluscard')}">${fmtDec(pc.hh)} €</div>
            <div class="label" style="${dis('ra')}">📦 R&amp;A</div>
            <div class="value" style="${dis('ra')}">${fmtNum(ra.abs)} €</div>
            <div class="value" style="${dis('ra')}">${fmtDec(ra.hh)} €</div>
            <div class="label" style="${dis('online')}">🛒 KUBE OS</div>
            <div class="value" style="${dis('online')}">${fmtNum(os.abs)} €</div>
            <div class="value" style="${dis('online')}">${fmtDec(os.hh)} €</div>
          </div>
        </div>`;

      popup.classList.remove('hidden'); void popup.offsetWidth; popup.classList.add('show');
      this._on(popup.querySelector('.close-btn'), 'click',
        () => this._onClosePopup(popup, { clearHighlight: false }));
    }

    closeAllPopups() {
      for (const id of ['side-popup', 'side-popup-umsatz', 'side-popup-overview']) {
        const el = this.$(id);
        if (el) { el.classList.remove('show'); el.classList.add('hidden'); }
      }
      if (this._highlightedPLZ) {
        const l = this._layerByPLZ?.[this._highlightedPLZ];
        if (l) this.applyStyleToLayer(l);
        this._highlightedPLZ = null;
      }
      this._activePopupPLZ = null; this._activePopupType = null;
      this._syncPanelState();
    }

    _rerenderActivePopup() {
      if (!this._activePopupPLZ) return;
      if (this._activePopupType === 'overview') { this.showOverviewPopup(); return; }
      const plz = this._activePopupPLZ;
      if (this._activePopupType === 'umsatz' ||
          this.currentMapMode === 'umsatz-multi' || this.currentMapMode === 'werbeanteil') {
        const v = this.filteredPLZWerte?.[plz];
        if (v) this.showUmsatzPopup(plz, v);
        else   this.showEmptyUmsatzPopup(plz);
      } else {
        const layer = this._layerByPLZ?.[plz];
        if (layer) this.showPopup(layer.feature, this.filteredKennwerte?.[plz] || {}, plz);
      }
    }

    _syncPanelState() {
      if (this.currentMapMode !== 'umsatz-multi' && this.currentMapMode !== 'werbeanteil') return;
      const panel = this.$('map-control-panel');
      if (!panel) return;
      const hasPopup = this._activePopupPLZ != null;
      if (hasPopup) { panel.classList.remove('panel-auto', 'panel-large'); panel.classList.add('panel-medium'); }
      else          { panel.classList.remove('panel-large', 'panel-medium'); panel.classList.add('panel-auto'); }
    }


    // ── Filter-Dropdowns ───────────────────────────────────────────────
    setupFilterDropdowns() {
      const erhSelect    = this.$('erhebung-select');
      const jahrSelect   = this.$('jahr-select');
      const nummerSelect = this.$('nummer-select');
      if (!erhSelect || !jahrSelect || !nummerSelect) return;

      const mkPlaceholder = (text) => {
        const opt = document.createElement('option');
        opt.value = ''; opt.textContent = text; opt.disabled = true; opt.selected = true;
        return opt;
      };

      // Dropdown-Optionen befüllen.
      // WICHTIG: Wenn der User schon eine Selektion getroffen hat, soll diese
      // erhalten bleiben. Wir vergleichen die aktuell gerenderten Optionen
      // mit den gewünschten und bauen nur neu, wenn sich etwas geändert hat.
      const desiredErhIDs = Object.keys(this._erhData || {}).filter(id => !isNull(id));
      const currentErhIDs = Array.from(erhSelect.options).map(o => o.value).filter(v => v !== '');
      const sameSet = desiredErhIDs.length === currentErhIDs.length &&
                      desiredErhIDs.every(id => currentErhIDs.includes(id));
      if (!sameSet) {
        const previousValue = erhSelect.value;
        erhSelect.innerHTML = '';
        erhSelect.appendChild(mkPlaceholder('– ErhebungsID wählen –'));
        for (const erhID of desiredErhIDs) {
          const opt = document.createElement('option');
          opt.value = erhID; opt.textContent = this._fmtGF(erhID);
          erhSelect.appendChild(opt);
        }
        // Vorherige Auswahl wiederherstellen, falls sie noch existiert
        if (previousValue && desiredErhIDs.includes(previousValue)) {
          erhSelect.value = previousValue;
        }
      }

      if (this._dropdownsInitialized) return;
      this._dropdownsInitialized = true;

      // ── Doppelbestreuungs-Toggle oben einsetzen ──
      const filterContainer = this._shadowRoot.querySelector('.filter-container');
      if (filterContainer && !this.$('doppel-toggle-bar')) {
        const bar = document.createElement('div');
        bar.id = 'doppel-toggle-bar';
        // Hauptmenü-Default: aufgeklappt. _resetToHome forciert das nochmal.
        bar.innerHTML = `
          <div id="doppel-toggle-header">
            <span class="doppel-toggle-icon">⚠️</span>
            <div class="doppel-toggle-title-block">
              <span class="doppel-toggle-label">Doppelbestreuung</span>
              <span class="doppel-toggle-subtitle">Erkennung von Überschneidungen</span>
            </div>
            <span class="doppel-toggle-current" id="doppel-toggle-current">Ohne</span>
            <span class="doppel-toggle-chevron">▾</span>
          </div>
          <div id="doppel-toggle-options">
            <div class="doppel-option active" id="doppel-opt-aus">
              <div class="doppel-option-radio"></div>
              <div class="doppel-option-text">
                <span class="doppel-option-name">Ohne Doppelbestreuung</span>
                <span class="doppel-option-desc">Nur eigene Erhebung · Schnellste Ladezeit</span>
              </div>
            </div>
            <div class="doppel-option" id="doppel-opt-ein">
              <div class="doppel-option-radio"></div>
              <div class="doppel-option-text">
                <span class="doppel-option-name">Mit Doppelbestreuung</span>
                <span class="doppel-option-desc">Alle Erhebungen des Zeitraums · Längere Ladezeit</span>
              </div>
            </div>
            <div id="doppel-laufend-hint">
              ⓘ <strong>Nur für Einzelerhebungen verfügbar.</strong><br>
              Das laufende Jahr (Nummer 0) läuft aus dem Cache und unterstützt keine Doppelbestreuung.
            </div>
          </div>`;
        const filterBtn = filterContainer.querySelector('#filter-button');
        // Phase 2 Bug-Fix: filter-button ist jetzt in einer .filter-button-row,
        // die wiederum in .filter-fields steckt. insertBefore muss auf dem
        // direkten Parent ausgeführt werden, sonst kommt NotFoundError.
        // Bar wird vor der Button-Row eingefügt, also als Sibling der Button-Row
        // innerhalb von .filter-fields — bewahrt die alte visuelle Reihenfolge:
        // Selects → (Bar) → Button-Row.
        const buttonRow = filterContainer.querySelector('.filter-button-row');
        const fieldsWrap = filterContainer.querySelector('.filter-fields');
        if (buttonRow && fieldsWrap && buttonRow.parentNode === fieldsWrap) {
          fieldsWrap.insertBefore(bar, buttonRow);
        } else if (filterBtn && filterBtn.parentNode) {
          // Fallback: vor dem Button in dessen Parent einfügen
          filterBtn.parentNode.insertBefore(bar, filterBtn);
        } else {
          // Letzter Fallback: ans Ende des Containers
          (fieldsWrap || filterContainer).appendChild(bar);
        }

        const header  = bar.querySelector('#doppel-toggle-header');
        const optAus  = bar.querySelector('#doppel-opt-aus');
        const optEin  = bar.querySelector('#doppel-opt-ein');
        const current = bar.querySelector('#doppel-toggle-current');
        this._doppelbestreuungAktiv = false;

        // Bug-Fix B7: ready-Klasse auch entfernen wenn Voraussetzungen fehlen
        const refreshBtn = () => {
          const btn = this.$('filter-button');
          if (!btn) return;
          if (erhSelect.value && jahrSelect.value && nummerSelect.value) {
            btn.classList.add('ready');
          } else {
            btn.classList.remove('ready');
          }
        };
        const setActive = (modeEin) => {
          const previousMode = this._doppelbestreuungAktiv;
          this._doppelbestreuungAktiv = !!modeEin;
          optEin.classList.toggle('active', !!modeEin);
          optAus.classList.toggle('active', !modeEin);
          if (current) current.textContent = modeEin ? 'Mit' : 'Ohne';
          refreshBtn();
          // Bug DB5 Fix: Wenn schon eine Erhebung aktiv ist und der User die
          // Doppelbestreuung umschaltet, automatisch neu laden — sonst zeigt
          // die Karte einen inkonsistenten Mischzustand. Nur reloaden wenn
          // sich der Modus tatsächlich geändert hat und eine Erhebung läuft.
          // Bug DB11: Doppel-Auto-Reload nur wenn nicht schon ein Reload läuft
          // (Filter-Button-Lock checken).
          if (previousMode !== this._doppelbestreuungAktiv && this._activeFilter) {
            const filterBtnLoading = this.$('filter-button')?.dataset.loading === '1';
            if (!this._renderInProgress && !filterBtnLoading) {
              const { erhID, jahr, nummer } = this._activeFilter;
              this.loadErhebung(erhID, jahr, nummer);
            }
          }
        };
        this._on(optAus, 'click', (ev) => {
          ev.stopPropagation();   // Header-Toggle nicht triggern
          setActive(false);
        });
        this._on(optEin, 'click', (ev) => {
          ev.stopPropagation();
          setActive(true);
        });
        // Header-Click klappt die Bar ein/aus
        this._on(header, 'click', () => {
          bar.classList.toggle('collapsed');
        });
      }

      jahrSelect.innerHTML = '';   jahrSelect.disabled = true;
      nummerSelect.innerHTML = ''; nummerSelect.disabled = true;
      jahrSelect.appendChild(mkPlaceholder('– Jahr wählen –'));
      nummerSelect.appendChild(mkPlaceholder('– Nummer wählen –'));

      const filterBtn = this.$('filter-button');
      const updateBtnState = () => {
        if (erhSelect.value && jahrSelect.value && nummerSelect.value) filterBtn?.classList.add('ready');
        else filterBtn?.classList.remove('ready');
      };

      // Change-Listener EINMALIG registrieren (nicht pro Render neu anhängen)
      this._on(erhSelect, 'change', () => {
        jahrSelect.innerHTML = ''; nummerSelect.innerHTML = '';
        jahrSelect.disabled = false; nummerSelect.disabled = true;
        jahrSelect.appendChild(mkPlaceholder('– Jahr wählen –'));
        for (const j of Object.keys(this._erhData?.[erhSelect.value] || {})) {
          if (isNull(j)) continue;
          const opt = document.createElement('option');
          opt.value = j; opt.textContent = j;
          jahrSelect.appendChild(opt);
        }
        nummerSelect.appendChild(mkPlaceholder('– Nummer wählen –'));
        updateBtnState();
      });
      this._on(jahrSelect, 'change', () => {
        nummerSelect.innerHTML = ''; nummerSelect.disabled = false;
        nummerSelect.appendChild(mkPlaceholder('– Nummer wählen –'));
        const set = this._erhData?.[erhSelect.value]?.[jahrSelect.value] || [];
        for (const n of Array.from(set)) {
          if (isNull(n)) continue;
          const opt = document.createElement('option');
          opt.value = n; opt.textContent = fmtNummer(n);
          nummerSelect.appendChild(opt);
        }
        updateBtnState();
      });
      this._on(nummerSelect, 'change', () => {
        updateBtnState();
        // Doppelbestreuung deaktivieren wenn Nummer 0 (laufendes Jahr = Cache)
        const isLaufend = nummerSelect.value && /^0+$/.test(nummerSelect.value);
        const optEinEl  = this.$('doppel-opt-ein');
        const hintEl    = this.$('doppel-laufend-hint');
        if (optEinEl) optEinEl.classList.toggle('disabled', !!isLaufend);
        if (hintEl)   hintEl.classList.toggle('visible', !!isLaufend);
        // Falls "Mit" aktiv war und Nummer 0 gewählt wird → auf "Ohne" zurück
        if (isLaufend && this._doppelbestreuungAktiv) {
          const optAusEl = this.$('doppel-opt-aus');
          const curEl    = this.$('doppel-toggle-current');
          this._doppelbestreuungAktiv = false;
          optEinEl?.classList.remove('active');
          optAusEl?.classList.add('active');
          if (curEl) curEl.textContent = 'Ohne';
        }
      });

      if (filterBtn) {
        this._on(filterBtn, 'click', () => {
          if (!filterBtn.classList.contains('ready')) return;
          // Bug E15 Fix: Double-Click-Schutz — Button kurz disabled markieren
          // bis loadErhebung das Token inkrementiert hat. Sonst gibt's bei
          // schnellem Doppelklick zwei parallele BW-Reloads mit konkurrierenden
          // render()-Passes.
          if (filterBtn.dataset.loading === '1') return;
          filterBtn.dataset.loading = '1';
          this.loadErhebung(erhSelect.value, jahrSelect.value, nummerSelect.value);
          // Lock nach 800ms wieder freigeben (Token ist dann längst gesetzt,
          // Cinematic-Loader sichtbar — Button visual disabled durch Loader).
          this._setTimeout(() => { delete filterBtn.dataset.loading; }, 800);
        });
      }

      // Phase 2: Der alte "↕ Erhebungsübersicht"-Button im Filter-Bereich
      // ist mit dem Sidebar-Refactor obsolet — die NL-Tabelle wird jetzt
      // über das Sidebar-Icon 📊 erreicht. Das Badge mit dem GF-Count
      // sitzt jetzt am Sidebar-Icon (siehe _updateOverviewBtnBadge).
    }

    // ── Sidebar-Icon-Badges aktualisieren (Phase 2) ─────────────────────
    // - Erhebungsübersicht-Icon (📊): zeigt GF-Count im Multi-Modus oder
    //   '+N' wenn weitere Partner verfügbar sind aber noch nicht aktiv.
    // - Erweiterte-Analyse-Icon (🔬): dezenter Punkt-Hinweis wenn Partner
    //   verfügbar sind und der User die Analyse-View noch nicht geöffnet hat.
    // Methode behält den alten Namen `_updateOverviewBtnBadge` aus Backwards-
    // Compat, kümmert sich aber jetzt um beide Icon-Badges.
    _updateOverviewBtnBadge() {
      const overviewBadge = this.$('sidebar-badge-overview');
      const analysisBadge = this.$('sidebar-badge-analysis');
      const count = this._activeErhebungen?.length || 0;
      const partners = this._getPartnerErhebungen?.() || [];

      // Reset
      [overviewBadge, analysisBadge].forEach(b => {
        if (!b) return;
        b.classList.remove('badge-hint');
        b.textContent = '';
      });

      // 📊 Erhebungsübersicht-Badge
      if (overviewBadge && count >= 2) {
        overviewBadge.textContent = String(count);
      }

      // 🔬 Erweiterte-Analyse-Badge
      if (analysisBadge) {
        if (count >= 2) {
          analysisBadge.textContent = String(count);
        } else if (count === 1 && partners.length > 0) {
          analysisBadge.textContent = `+${partners.length}`;
          analysisBadge.classList.add('badge-hint');
        }
      }

      // Info-Bar oben (sichtbar bei eingeklappter Filter-Maske)
      // bei jedem Badge-Update mit aktualisieren — auch dort steht ein
      // Multi-GF-Indikator.
      if (this._filterFieldsCollapsed) {
        this._updateFilterInfoBar();
      }
    }

    restoreDropdownSelections() {
      const { erhID, jahr, nummer } = this._activeFilter || {};
      const erhSelect    = this.$('erhebung-select');
      const jahrSelect   = this.$('jahr-select');
      const nummerSelect = this.$('nummer-select');
      if (!erhSelect || !jahrSelect || !nummerSelect) return;
      // change-Events sind nötig, damit die Folge-Dropdowns korrekt befüllt werden
      // und der Filter-Button den .ready-Status bekommt.
      if (erhID)  { erhSelect.value  = erhID;  erhSelect.dispatchEvent(new Event('change')); }
      if (jahr)   { jahrSelect.value = jahr;   jahrSelect.dispatchEvent(new Event('change')); }
      if (nummer) { nummerSelect.value = nummer; nummerSelect.dispatchEvent(new Event('change')); }
    }

    // ── Erhebungs-Info (NL-Tabelle) ────────────────────────────────────
    prepareErhebungsInfo() {
      this.erhebungsInfo = {};
      if (!this._activeFilter) return;
      // Phase-1: iteriert über alle aktiv-kombinierten Erhebungen.
      // Wenn dieselbe NL-ID in zwei Erhebungen auftaucht, werden ihre
      // Kennzahlen aufaddiert (üblicherweise sind NL-IDs aber eindeutig
      // pro GF-Bereich).
      const erhData = this._getAllActiveRows();
      if (!erhData.length) return;

      const jahresumsatz = {}, erfasst_total = {}, erfasst_valid = {};
      // Welcher NL gehört zu welcher Erhebung? Wichtig für UI-Gruppierung.
      const nlToErh = {};
      for (const row of erhData) {
        const nl = row['dimension_niederlassung_0']?.id?.trim();
        if (!nl) continue;
        const __land = this._landOfRow(row); const __bare = this._normalizePLZ(row['dimension_plz_0']?.id ?? row['dimension_plz_0']?.raw, __land); const __valid = !!(__bare && !this._isAggregatePlz(__bare));
        const uJ = row['value_hr_n_umsatz_0']?.raw ?? 0;
        const uE = row['value_ums_erhebung_0']?.raw ?? 0;
        jahresumsatz[nl]  ||= 0;
        erfasst_total[nl] ||= 0;
        erfasst_valid[nl] ||= 0;
        erfasst_total[nl] += uE;
        if (__valid) { jahresumsatz[nl] += uJ; erfasst_valid[nl] += uE; }
        if (!nlToErh[nl]) nlToErh[nl] = row['dimension_erhebung_0']?.id?.trim();
      }
      for (const nl of Object.keys(erfasst_total)) {
        const j = jahresumsatz[nl]  || 0;
        const t = erfasst_total[nl] || 0;
        const v = erfasst_valid[nl] || 0;
        this.erhebungsInfo[nl] = {
          nl, erhID: nlToErh[nl],
          jahresumsatz: j, erfasst_total: t, erfasst_valid: v,
          pct_erfassung:   j > 0 ? t / j : 0,
          pct_valid:       t > 0 ? v / t : 0,
          pct_hochrechnung: j > 0 ? v / j : 0,
        };
      }
    }

    renderErhebungsInfoTable() {
      const container = this.$('nl-info-container');
      if (!container) return;
      container.innerHTML = '';

      // Phase 2: Der Partner-Erhebungs-Picker ist mit dem Sidebar-Refactor in
      // die "Erweiterte Analyse"-View umgezogen. Die NL-Tabelle zeigt jetzt
      // nur noch die NL-Daten — sauberere Trennung von Auswertung und
      // GF-Verwaltung. Der Picker bleibt aufrufbar über das 🔬-Sidebar-Icon.

      const scroll = document.createElement('div'); scroll.classList.add('nl-info-scroll');
      const table  = document.createElement('table'); table.classList.add('nl-info-table');
      const thead  = document.createElement('thead'); const headerRow = document.createElement('tr');
      // Phase-1: Im Multi-Modus die GF-Spalte WEGLASSEN — wir verwenden
      // stattdessen GF-Gruppen-Header-Zeilen über der ganzen Breite, das
      // ist platzschonender und übersichtlicher.
      const isMulti = this._activeErhebungen && this._activeErhebungen.length > 1;
      const headers = [
        { label: 'NL' },
        { label: 'Umsatz\n(Hochrechn.)' },
        { label: 'Erfasst mit\nvalider PLZ' },
        { label: 'Abdeckung' },
      ];
      for (const h of headers) {
        const th = document.createElement('th');
        th.textContent = h.label;
        headerRow.appendChild(th);
      }
      thead.appendChild(headerRow); table.appendChild(thead);
      const tbody = document.createElement('tbody');

      // Event-Delegation
      this._on(tbody, 'click', (ev) => {
        const tr = ev.target.closest('.nl-info-row');
        if (!tr?.dataset.nl) return;
        this._nlSelectionInitialized = true;
        this.toggleNLSelection(tr.dataset.nl);
      });

      // Body-Aufbau
      if (isMulti) {
        // Im Multi-Modus: NL gruppiert nach erhID, Basis zuerst
        const byErh = {};
        for (const info of Object.values(this.erhebungsInfo)) {
          const eid = info.erhID || '(unbekannt)';
          (byErh[eid] ||= []).push(info);
        }
        // Reihenfolge: Basis-Erhebung zuerst, dann Partner in Auswahl-Order
        const order = this._activeErhebungen.map(e => e.erhID);
        for (let i = 0; i < order.length; i++) {
          const eid = order[i];
          const items = byErh[eid];
          if (!items || items.length === 0) continue;
          // Gruppen-Header-Zeile über alle Spalten
          const headTr = document.createElement('tr');
          headTr.classList.add('nl-gf-group-header');
          const headTd = document.createElement('td');
          headTd.setAttribute('colspan', headers.length);
          const isBase = (i === 0);
          headTd.innerHTML =
            `<span class="nl-gf-group-icon">${isBase ? '★' : '🔀'}</span>` +
            `<span class="nl-gf-group-name">${escapeHtml(this._fmtGF ? this._fmtGF(eid) : eid)}</span>` +
            `<span class="nl-gf-group-count">${items.length} NL${items.length === 1 ? '' : 's'}</span>`;
          headTr.appendChild(headTd);
          tbody.appendChild(headTr);
          // NL-Zeilen sortieren nach NL-Name innerhalb der Gruppe
          items.sort((a, b) => a.nl.localeCompare(b.nl));
          for (const info of items) tbody.appendChild(this._buildNLInfoRow(info, headers.length));
        }
      } else {
        // Single-Modus: einfache Liste
        for (const info of Object.values(this.erhebungsInfo)) {
          tbody.appendChild(this._buildNLInfoRow(info, headers.length));
        }
      }
      table.appendChild(tbody); scroll.appendChild(table); container.appendChild(scroll);
      this.updateNLSelectionUI();
    }

    // NL-Tabellen-Zeile bauen (extrahiert für Wiederverwendbarkeit mit GF-Gruppen)
    _buildNLInfoRow(info, colCount) {
      const tr = document.createElement('tr');
      tr.classList.add('nl-info-row');
      tr.dataset.nl = info.nl;
      // Erfassungs-Quote > 100% = Datenqualitätsproblem: die NL hat erfassten
      // Umsatz der keiner gültigen PLZ zugeordnet werden konnte (PLZ "00000"
      // im Roh-Datensatz). Visuell markieren, sodass der User die NL als
      // verdächtig erkennen kann. Aggregation bleibt unverändert.
      const erfassungInvalid = info.pct_erfassung > 1.005;
      const cells = [
        { text: info.nl, cls: '' },
        { text: Math.round(info.jahresumsatz).toLocaleString('de-DE'), cls: '' },
        {
          text: Math.round(info.erfasst_valid).toLocaleString('de-DE'),
          cls: erfassungInvalid ? 'nl-pct-invalid' : '',
          html: erfassungInvalid
            ? `<span class="nl-pct-warn" title="Erfasster Umsatz übersteigt den Jahresumsatz dieser NL — vermutlich Umsatz ohne PLZ-Zuordnung. Datenqualität dieser NL prüfen.">⚠️</span>&nbsp;${escapeHtml(Math.round(info.erfasst_valid).toLocaleString('de-DE'))}`
            : null,
        },
        { text: (info.pct_hochrechnung * 100).toFixed(1) + '%', cls: '' },
      ];
      for (const c of cells) {
        const td = document.createElement('td');
        if (c.cls) td.classList.add(c.cls);
        if (c.html) td.innerHTML = c.html;
        else td.textContent = c.text;
        tr.appendChild(td);
      }
      // Klasse auf der Zeile für optionales Row-Highlight + Sortier-Marker
      if (erfassungInvalid) tr.classList.add('nl-info-row-invalid');
      return tr;
    }

    // ── Partner-Erhebungs-Picker (Phase 1) ──────────────────────────────
    // Baut die UI für den Multi-GF-Modus: zeigt Basis-Erhebung (★, nicht
    // wegklickbar) + alle Partner-Erhebungen (gleiches Jahr+Nummer) mit
    // Checkboxes zum Dazu-/Wegschalten.
    _buildPartnerErhebungPicker() {
      const wrapper = document.createElement('div');
      wrapper.id = 'partner-erh-picker';

      const partners = this._getPartnerErhebungen();
      const activeCount = this._activeErhebungen?.length || 1;
      const totalCount  = partners.length + 1;   // +1 für Basis

      // Default-State: aufgeklappt wenn Partner aktiv sind (User sieht direkt
      // den Multi-Modus), eingeklappt wenn nur die Basis-Erhebung läuft.
      if (activeCount <= 1) wrapper.classList.add('collapsed');

      const header = document.createElement('div');
      header.id = 'partner-erh-picker-header';
      header.innerHTML = `
        <span class="partner-picker-icon">🔀</span>
        <div class="partner-picker-title-block">
          <span class="partner-picker-label">Weitere GF-Bereiche kombinieren</span>
          <span class="partner-picker-subtitle">Gleiches Jahr und gleiche Erhebungsnummer</span>
        </div>
        <span class="partner-picker-count">${activeCount}/${totalCount} aktiv</span>
        <span class="partner-picker-chevron">▾</span>
      `;
      wrapper.appendChild(header);
      this._on(header, 'click', () => wrapper.classList.toggle('collapsed'));

      const body = document.createElement('div');
      body.id = 'partner-erh-picker-body';
      wrapper.appendChild(body);

      // Basis-Erhebung (Star-Marker, nicht abwählbar)
      const base = this._activeErhebungen?.[0];
      if (base) {
        const baseRow = document.createElement('div');
        baseRow.className = 'partner-erh-row is-base';
        baseRow.innerHTML = `
          <div class="partner-erh-checkbox"></div>
          <div class="partner-erh-name">${escapeHtml(this._fmtGF ? this._fmtGF(base.erhID) : base.erhID)}</div>
          <span class="partner-erh-badge">Basis</span>
        `;
        body.appendChild(baseRow);
      }

      // Partner-Erhebungen
      if (partners.length === 0) {
        const empty = document.createElement('div');
        empty.id = 'partner-erh-empty';
        empty.textContent = 'Keine weiteren Erhebungen mit gleichem Jahr und gleicher Nummer verfügbar.';
        body.appendChild(empty);
      } else {
        // Phase 2 — Bestätigungsbutton-Workflow:
        // Statt jeden Klick sofort an BW zu schicken, sammeln wir Pending-
        // Änderungen in `this._pendingPartners`. Erst beim "Anwenden"-Klick
        // wird ein einziger BW-Roundtrip ausgelöst. Initial = aktueller State.
        if (!this._pendingPartners) {
          this._pendingPartners = new Set(this._activeErhebungen.slice(1).map(e => e.erhID));
        }

        for (const p of partners) {
          const isCurrentlyActive = this._isErhebungActive(p.erhID);
          const isPending = this._pendingPartners.has(p.erhID);
          // Visueller Status:
          //   checked + pending-add  → wird hinzugefügt (war vorher inaktiv)
          //   checked + active       → aktiv und bleibt
          //   unchecked + active     → wird entfernt
          //   unchecked + inaktiv    → inaktiv und bleibt
          const willChange = isCurrentlyActive !== isPending;
          let badgeText, classes = ['partner-erh-row'];
          if (isPending) classes.push('checked');
          if (willChange) classes.push('pending');
          if (isPending && !isCurrentlyActive) {
            classes.push('pending-add');
            badgeText = 'wird hinzugefügt';
          } else if (!isPending && isCurrentlyActive) {
            classes.push('pending-remove');
            badgeText = 'wird entfernt';
          } else if (isCurrentlyActive) {
            badgeText = 'aktiv';
          } else {
            badgeText = 'inaktiv';
          }
          const row = document.createElement('div');
          row.className = classes.join(' ');
          row.dataset.erhid = p.erhID;
          row.innerHTML = `
            <div class="partner-erh-checkbox"></div>
            <div class="partner-erh-name">${escapeHtml(this._fmtGF ? this._fmtGF(p.erhID) : p.erhID)}</div>
            <span class="partner-erh-badge">${badgeText}</span>
          `;
          // Click toggelt nur den Pending-State, kein BW-Reload
          this._on(row, 'click', () => this._togglePendingPartner(p.erhID));
          body.appendChild(row);
        }

        // Bug 10 Fix: Cross-GF-Doppelbestreuungs-Toggle nur sichtbar, wenn 2+
        // Erhebungen aktuell aktiv sind (auf Basis des realen State, nicht
        // Pending — sonst wäre die Logik mit "hat noch keine Multi-Daten"
        // inkonsistent).
        if (activeCount >= 2) {
          const crossRow = document.createElement('div');
          crossRow.className = 'partner-cross-doppel-row' + (this._crossGfDoppelAktiv ? ' checked' : '');
          crossRow.innerHTML = `
            <div class="partner-erh-checkbox"></div>
            <div class="partner-erh-name">▲ Cross-GF-Doppelbestreuung markieren</div>
          `;
          this._on(crossRow, 'click', () => {
            this._crossGfDoppelAktiv = !this._crossGfDoppelAktiv;
            crossRow.classList.toggle('checked', this._crossGfDoppelAktiv);
            // Karten-Layer neu zeichnen, ohne Daten neu zu laden
            this.updateGeoLayer();
          });
          body.appendChild(crossRow);
        }

        // ── Bestätigungsbutton-Leiste ─────────────────────────────────
        // Wird nur sichtbar, wenn sich der Pending-State vom realen State
        // unterscheidet. Bei keiner Änderung bleibt sie ausgeblendet → das
        // Standard-Aussehen des Pickers ist identisch zum vorigen Verhalten.
        const currentActiveSet = new Set(this._activeErhebungen.slice(1).map(e => e.erhID));
        const hasChanges = this._pendingPartners.size !== currentActiveSet.size
          || [...this._pendingPartners].some(id => !currentActiveSet.has(id));
        if (hasChanges) {
          const actionBar = document.createElement('div');
          actionBar.id = 'partner-erh-actions';
          // Zähle was sich ändert
          const toAdd = [...this._pendingPartners].filter(id => !currentActiveSet.has(id));
          const toRemove = [...currentActiveSet].filter(id => !this._pendingPartners.has(id));
          const parts = [];
          if (toAdd.length)    parts.push(`+${toAdd.length}`);
          if (toRemove.length) parts.push(`−${toRemove.length}`);
          actionBar.innerHTML = `
            <div class="partner-actions-info">
              <span class="partner-actions-icon">●</span>
              <span class="partner-actions-text">Änderungen ausstehend (${parts.join(', ')})</span>
            </div>
            <div class="partner-actions-buttons">
              <button type="button" class="partner-action-cancel" id="partner-action-cancel">Abbrechen</button>
              <button type="button" class="partner-action-apply" id="partner-action-apply">Anwenden</button>
            </div>
          `;
          body.appendChild(actionBar);
          this._on(actionBar.querySelector('#partner-action-cancel'), 'click', () => this._cancelPendingPartners());
          this._on(actionBar.querySelector('#partner-action-apply'),  'click', () => this._applyPendingPartners());
          // Number-Bump: bei Re-Render mit aktualisierter Zahl kurz pulsieren.
          // Da die Action-Bar ohnehin frisch gerendert wird, geht das einfach
          // mit einer .bump-Klasse die nach der Animation entfernt wird.
          const textEl = actionBar.querySelector('.partner-actions-text');
          if (textEl && (this._lastPartnerActionText !== textEl.textContent)) {
            textEl.classList.add('bump');
            this._setTimeout(() => textEl.classList.remove('bump'), 360);
          }
          this._lastPartnerActionText = textEl ? textEl.textContent : '';
        } else {
          // Keine Änderungen mehr → letzten Text-Snapshot leeren, damit der
          // nächste Bump beim Re-Erscheinen wieder triggert.
          this._lastPartnerActionText = '';
        }
      }

      return wrapper;
    }

    // ── Pending-Partner-Workflow (Phase 2) ──────────────────────────────
    // Klicks auf Partner-Zeilen toggeln nur den Pending-State, lokal.
    // Erst "Anwenden" schickt einen einzigen BW-Reload mit allen Änderungen.
    _togglePendingPartner(erhID) {
      if (!this._pendingPartners) {
        this._pendingPartners = new Set(this._activeErhebungen.slice(1).map(e => e.erhID));
      }
      if (this._pendingPartners.has(erhID)) {
        this._pendingPartners.delete(erhID);
      } else {
        this._pendingPartners.add(erhID);
      }
      // Nur Picker-UI neu rendern, kein BW-Reload
      if (this._sidebarView === 'analysis') this._renderAnalysisView();
    }

    _cancelPendingPartners() {
      // Pending-Set verwerfen → Sync mit echtem State
      this._pendingPartners = new Set(this._activeErhebungen.slice(1).map(e => e.erhID));
      if (this._sidebarView === 'analysis') this._renderAnalysisView();
    }

    async _applyPendingPartners() {
      if (!this._activeFilter || !this._activeErhebungen?.length || !this._pendingPartners) return;
      if (this._partnerToggleInProgress) {
        console.info('[PLZ-Widget] _applyPendingPartners blockiert: vorige Aktion läuft noch');
        return;
      }
      this._partnerToggleInProgress = true;
      try {
        const base = this._activeErhebungen[0];
        // Neue Liste aufbauen: Basis + alle pending-Partner
        // (Reihenfolge: Basis zuerst, dann Partner in Pending-Reihenfolge)
        const newList = [base];
        for (const pid of this._pendingPartners) {
          newList.push({ erhID: pid, jahr: base.jahr, nummer: base.nummer });
        }

        // Check: hat sich überhaupt was geändert?
        const oldIds = this._activeErhebungen.map(e => e.erhID).join('|');
        const newIds = newList.map(e => e.erhID).join('|');
        if (oldIds === newIds) {
          this._pendingPartners = null;
          if (this._sidebarView === 'analysis') this._renderAnalysisView();
          return;
        }

        this._activeErhebungen = newList;
        // Bug GF10 Fix: Cross-GF-Marker macht nur Sinn bei 2+ Erhebungen.
        // Wenn der User alle Partner deselektiert hat, das Flag auch deaktivieren,
        // damit beim nächsten Hinzufügen der User es bewusst neu einschalten muss.
        if (newList.length < 2) {
          this._crossGfDoppelAktiv = false;
        }
        // Pending-Set zurücksetzen → wird beim nächsten Render aus dem
        // neuen Active-State neu initialisiert
        this._pendingPartners = null;
        // Bug R5: Token inkrementieren, damit ein noch-laufender render()
        // der vorigen Active-Liste als stale erkannt wird.
        this._renderToken = (this._renderToken || 0) + 1;
        // Bug GF2 Fix: _totalRowCount zurücksetzen, sonst könnte die Cache-
        // Detection im Poll-Tick fälschlich greifen, falls die neue Liste
        // zufällig gleiche Zeilenzahl liefert.
        this._totalRowCount = -1;
        // Bug GF3 Fix: NL-Selektion zurücksetzen — neue Partner bringen neue
        // NLs mit, die alten _selectedNLs sind nicht mehr repräsentativ.
        // render() wird das mit dem vollen allNLs-Set neu befüllen.
        this._selectedNLs = new Set();
        this._nlSelectionInitialized = false;
        // Bug GF4 Fix: Home-Reset-Pending verwerfen falls noch aktiv
        this._homeResetPending = false;
        if (this._homeResetSafetyTimer) {
          this._clearTimeout(this._homeResetSafetyTimer);
          this._homeResetSafetyTimer = null;
        }
        // Stale State der alten Konfiguration leeren
        this.filteredPLZWerte = {};
        this.filteredKennwerte = {};
        if (this._highlightedPLZ) {
          const layer = this._layerByPLZ?.[this._highlightedPLZ];
          if (layer && this._geoLayer) this.applyStyleToLayer(layer);
          this._highlightedPLZ = null;
        }
        this._lastHighlightedLayer = null;
        // Critical-Marker der vorigen Aggregation entfernen
        this._clearDoppelMarkers?.();

        const allErhIDs = newList.map(e => e.erhID);
        const switched = this._switchToErhebungFilter(allErhIDs, base.jahr, base.nummer);

        // Index + Aggregat-Cache invalidieren (siehe Punkt-2-Bug Phase 1)
        this._erhebungIndex = null;
        this._erhebungAggregatesCache?.clear();

        if (switched) {
          this._showCinematicLoader?.();
          this._updateLoaderPhase?.(1, `${newList.length} GF-Bereiche werden geladen…`);
          // Bug GF1 Fix: Skeleton-Loading zeigen für visuelle Konsistenz
          // mit loadErhebung — PLZ-Tabelle bekommt Shimmer, Karte Pulse.
          this._showSkeletonTable?.();
          this._showSkeletonMapOverlay?.();
          this._fullDataLoaded = true;
          if (!this._renderInProgress) this._scheduleDataPoll();
        } else {
          // Fallback ohne BW
          this.filteredData = this._getAllActiveRows();
          this.applyRadiusFilter(Number(this.$('radius-slider')?.value ?? 40));
          this.updateGeoLayer();
          this.renderDataTable(this.filteredKennwerte);
        }
        // Badge sofort aktualisieren
        this._updateOverviewBtnBadge?.();
        this._renderPartnerErhebungPicker();
      } finally {
        this._setTimeout(() => { this._partnerToggleInProgress = false; }, 400);
      }
    }

    // Nur Picker-UI neu rendern (z.B. nach togglePartnerErhebung), ohne die
    // NL-Tabelle anzufassen. Die NL-Tabelle wird sowieso durch das danach
    // laufende render() neu aufgebaut.
    _renderPartnerErhebungPicker() {
      // Phase 2: Picker lebt jetzt in der Erweiterte-Analyse-View. Wenn diese
      // gerade aktiv ist, einfach komplett neu rendern (einfacher und sicherer
      // als selektives Picker-Replacement). Wenn nicht aktiv, ist nichts zu tun
      // — beim nächsten Öffnen baut _renderAnalysisView den Picker frisch auf.
      if (this._sidebarView === 'analysis') {
        this._renderAnalysisView();
      }
      // Sidebar-Icon-Badges in jedem Fall aktualisieren
      this._updateOverviewBtnBadge();
    }

    updateNLSelectionUI() {
      const rows = this._shadowRoot.querySelectorAll('.nl-info-row');
      for (const row of rows) {
        const nl = row.dataset.nl;
        if (!this._nlSelectionInitialized) { row.classList.remove('table-row-selected'); continue; }
        if (this._selectedNLs.has(nl)) row.classList.add('table-row-selected');
        else                           row.classList.remove('table-row-selected');
      }
    }

    closeNLTable() {
      // Phase 2: Im neuen Sidebar-Layout ist die NL-Tabelle ein eigener View,
      // kein Overlay mehr. Diese Methode bleibt als No-op-Stub erhalten für
      // bestehende Aufrufer, die sie defensiv aufrufen.
    }


    // ── Umsatz-Aggregation ─────────────────────────────────────────────
    prepareUmsatzPLZWerte() {
      // Phase-1-Erweiterung: iteriert über alle aktiv-kombinierten Erhebungen
      // (Multi-GF-Aggregation). Fällt für Single-Erhebung auf die Rows der
      // einen Erhebung zurück.
      if (!this._activeFilter) return;
      const rows = this._getAllActiveRows();
      if (!rows.length) return;

      const safe = (x) => {
        if (x == null) return 0;
        if (typeof x === 'string') x = x.replace(/\./g, '').replace(',', '.');
        const n = Number(x);
        return Number.isFinite(n) ? n : 0;
      };
      const parseHH = (x) => {
        if (x == null) return 0;
        if (typeof x === 'number') return Number.isFinite(x) ? x : 0;
        if (typeof x === 'string') {
          const n = Number(x.replace(/[.,\s]/g, ''));
          return Number.isFinite(n) ? n : 0;
        }
        return 0;
      };

      const aggregated = {};
      for (const row of rows) {
        const nl = row['dimension_niederlassung_0']?.id?.trim();
        if (this._selectedNLs?.size > 0 && !this._selectedNLs.has(nl)) continue;
        const __land = this._landOfRow(row); const __bare = this._normalizePLZ(row['dimension_plz_0']?.id ?? row['dimension_plz_0']?.raw, __land); const plz = (__bare && !this._isAggregatePlz(__bare)) ? this._plzKey(__land, __bare) : null;
        if (!plz || plz === '00000') continue;
        if (!aggregated[plz]) {
          aggregated[plz] = {
            _hhValues: [], _kkValues: [],
            umsatz: 0, ra: 0, onlineshop: 0, pluscard: 0,
            umsatzWerbung: 0, raWerbung: 0, onlineshopWerbung: 0, pluscardWerbung: 0,
            umsatzZusatz: 0,  raZusatz: 0,  onlineshopZusatz: 0,  pluscardZusatz: 0,
            umsatzErhebung: 0, kdErhebung: 0, auflage: 0,
            werbeverweigerer: 0, kaufkraftIdx: 0,
          };
        }
        const v = aggregated[plz];
        const hh = parseHH(row['value_haushalte_0']?.raw);
        if (hh > 0) v._hhValues.push(hh);
        v.umsatzErhebung    += safe(row['value_ums_erhebung_0']?.raw);
        v.kdErhebung        += safe(row['value_kd_erhebung_0']?.raw);
        v.auflage           += safe(row['value_auflage_0']?.raw);
        v.werbeverweigerer   = Math.max(v.werbeverweigerer, safe(row['value_werbeverweigerer_0']?.raw));
        const kk = safe(row['value_kaufkraft_0']?.raw);
        if (kk > 0) v._kkValues.push(kk);

        v.umsatz     += safe(row['value_umsatz_stationaer_0']?.raw);
        v.ra         += safe(row['value_umsatz_ra_0']?.raw);
        v.onlineshop += safe(row['value_umsatz_online_0']?.raw);
        v.pluscard   += safe(row['value_umsatz_grosskunden_0']?.raw);

        v.umsatzWerbung     += safe(row['value_umsatz_stationaer_werbung_0']?.raw);
        v.raWerbung         += safe(row['value_umsatz_ra_werbung_0']?.raw);
        v.onlineshopWerbung += safe(row['value_umsatz_online_werbung_0']?.raw);
        v.pluscardWerbung   += safe(row['value_umsatz_grosskunden_werbung_0']?.raw);

        v.umsatzZusatz     += safe(row['value_umsatz_stationaer_zusatz_0']?.raw);
        v.raZusatz         += safe(row['value_umsatz_ra_zusatz_0']?.raw);
        v.onlineshopZusatz += safe(row['value_umsatz_online_zusatz_0']?.raw);
        v.pluscardZusatz   += safe(row['value_umsatz_grosskunden_zusatz_0']?.raw);
      }

      // Durchschnitte berechnen, Per-Household-Werte ableiten
      for (const v of Object.values(aggregated)) {
        v.haushalte      = v._hhValues.length > 0 ? v._hhValues.reduce((a, b) => a + b, 0) / v._hhValues.length : 0;
        v.kaufkraftIndex = v._kkValues.length > 0 ? v._kkValues.reduce((a, b) => a + b, 0) / v._kkValues.length : 0;
        delete v._hhValues; delete v._kkValues;
        // Domain-Frage 3 (geklärt): Negative Umsätze (Stornos im Saldo) werden
        // zu 0 normalisiert. Konsistent zu computeWKKennwerte.
        const clamp = x => x > 0 ? x : 0;
        v.umsatz     = clamp(v.umsatz);
        v.ra         = clamp(v.ra);
        v.onlineshop = clamp(v.onlineshop);
        v.pluscard   = clamp(v.pluscard);
        v.umsatzWerbung     = clamp(v.umsatzWerbung);
        v.raWerbung         = clamp(v.raWerbung);
        v.onlineshopWerbung = clamp(v.onlineshopWerbung);
        v.pluscardWerbung   = clamp(v.pluscardWerbung);
        v.umsatzZusatz      = clamp(v.umsatzZusatz);
        v.raZusatz          = clamp(v.raZusatz);
        v.onlineshopZusatz  = clamp(v.onlineshopZusatz);
        v.pluscardZusatz    = clamp(v.pluscardZusatz);

        const hh = v.haushalte;
        const perHH = (val) => hh > 0 ? val / hh : 0;
        v.umsatzProHaushalt         = perHH(v.umsatz);
        v.raProHaushalt             = perHH(v.ra);
        v.onlineshopProHaushalt     = perHH(v.onlineshop);
        v.pluscardProHaushalt       = perHH(v.pluscard);
        v.umsatzWerbungProHaushalt     = perHH(v.umsatzWerbung);
        v.raWerbungProHaushalt         = perHH(v.raWerbung);
        v.onlineshopWerbungProHaushalt = perHH(v.onlineshopWerbung);
        v.pluscardWerbungProHaushalt   = perHH(v.pluscardWerbung);
        v.umsatzZusatzProHaushalt     = perHH(v.umsatzZusatz);
        v.raZusatzProHaushalt         = perHH(v.raZusatz);
        v.onlineshopZusatzProHaushalt = perHH(v.onlineshopZusatz);
        v.pluscardZusatzProHaushalt   = perHH(v.pluscardZusatz);
        // Bug WA2 Fix: werbeAnteil über aktive Kategorien rechnen — sonst
        // bleibt im Werbeanteil-Modus eine deselektierte Kategorie (z.B. Online)
        // unsichtbar in der Karten-Tooltip-Anzeige aber wirkt sich auf den
        // Werbeanteil aus. Default: alle 4 Kategorien aktiv.
        const cats = this.activeCategories ?? new Set(['stationaer','pluscard','ra','online']);
        let tN = 0, tW = 0;
        if (cats.has('stationaer')) { tN += v.umsatz;     tW += v.umsatzWerbung; }
        if (cats.has('ra'))         { tN += v.ra;         tW += v.raWerbung; }
        if (cats.has('online'))     { tN += v.onlineshop; tW += v.onlineshopWerbung; }
        if (cats.has('pluscard'))   { tN += v.pluscard;   tW += v.pluscardWerbung; }
        v.werbeAnteil = tN > 0 ? tW / tN : 0;
      }

      // Radius-Filter anwenden (nur Umsatz-Modi)
      const result = {};
      for (const [plz, v] of Object.entries(aggregated)) {
        if ((this.currentMapMode === 'umsatz-multi' || this.currentMapMode === 'werbeanteil') && this.useRadiusFilter) {
          if (this.plzImRadius instanceof Set && !this.plzImRadius.has(plz)) continue;
        }
        result[plz] = {
          ...v,
          umsatzErhebung:   v.umsatzErhebung   ?? 0,
          kdErhebung:       v.kdErhebung       ?? 0,
          auflage:          v.auflage          ?? 0,
          werbeverweigerer: v.werbeverweigerer ?? 0,
        };
      }
      this.filteredPLZWerte = result;
    }

    getUmsatzSumForPLZ(v) {
      const safe = x => Number.isFinite(x) ? x : 0;
      const isW  = this.umsatzMainMode === 'werbung';
      const useHH = this.umsatzDarstellung === 'hh';
      const pick = (b, w, z, bH, wH, zH) => {
        if (!isW) return safe(useHH ? bH : b);
        let s = 0;
        if (this.useWerbeUmsatz)  s += safe(useHH ? wH : w);
        if (this.useZusatzUmsatz) s += safe(useHH ? zH : z);
        return s;
      };
      let s = 0;
      if (this.activeCategories.has('stationaer'))
        s += pick(v.umsatz, v.umsatzWerbung, v.umsatzZusatz, v.umsatzProHaushalt, v.umsatzWerbungProHaushalt, v.umsatzZusatzProHaushalt);
      if (this.activeCategories.has('pluscard'))
        s += pick(v.pluscard, v.pluscardWerbung, v.pluscardZusatz, v.pluscardProHaushalt, v.pluscardWerbungProHaushalt, v.pluscardZusatzProHaushalt);
      if (this.activeCategories.has('ra'))
        s += pick(v.ra, v.raWerbung, v.raZusatz, v.raProHaushalt, v.raWerbungProHaushalt, v.raZusatzProHaushalt);
      if (this.activeCategories.has('online'))
        s += pick(v.onlineshop, v.onlineshopWerbung, v.onlineshopZusatz, v.onlineshopProHaushalt, v.onlineshopWerbungProHaushalt, v.onlineshopZusatzProHaushalt);
      return s;
    }

    // ── WK-Kennwerte (HZ-Kosten pro PLZ etc.) ──────────────────────────
    computeWKKennwerte() {
      if (!this.filteredData) return;
      const aggregated = {}, unfilteredUmsatzByPLZ = {}, unfilteredByPLZ = {},
            nlFilteredUmsatzByPLZ = {}, nlFilteredByPLZ = {};
      const selNLs = this._selectedNLs;
      const radius = this.plzImRadius;
      const hasNLFilter = selNLs && selNLs.size > 0;
      const hasRadius   = radius instanceof Set && radius.size > 0;
      const data = this.filteredData;

      for (let i = 0, len = data.length; i < len; i++) {
        const row = data[i];
        const __land = this._landOfRow(row); const __bare = this._normalizePLZ(row['dimension_plz_0']?.id ?? row['dimension_plz_0']?.raw, __land); const plz = (__bare && !this._isAggregatePlz(__bare)) ? this._plzKey(__land, __bare) : null;
        // Bug-Fix B38: '00000' ist Stammdaten-Aggregat ohne PLZ-Zuordnung.
        // Vorher: || '00000' als Fallback → Stammdaten landeten in den Buckets
        // und wären ohne Radius-Filter in aggregated[] gelandet (falsche WK%).
        if (!plz || plz === '00000') continue;
        const umsatz   = row['value_hr_n_umsatz_0']?.raw ?? 0;
        const hzKosten = row['value_hz_kosten_0']?.raw   ?? 0;
        const hzFlag   = row['dimension_hzflag_0']?.id?.trim() === 'X';
        const nl       = row['dimension_niederlassung_0']?.id?.trim();
        const nlPassed = !hasNLFilter || selNLs.has(nl);

        // Bucket 1: komplett ungefiltert — für isHZ/hzKosten-Fallback
        unfilteredUmsatzByPLZ[plz] = (unfilteredUmsatzByPLZ[plz] || 0) + umsatz;
        if (!unfilteredByPLZ[plz]) unfilteredByPLZ[plz] = { hzKosten: 0, hzCount: 0, hzNLs: new Set() };
        unfilteredByPLZ[plz].hzKosten += hzKosten;
        if (hzFlag && nl) {
          unfilteredByPLZ[plz].hzNLs.add(nl);
          unfilteredByPLZ[plz].hzCount = unfilteredByPLZ[plz].hzNLs.size;
        }

        // Bucket 2: nach NL-Filter, vor Radius — Nenner für WK% bei aktivem NL-Filter
        if (nlPassed) {
          nlFilteredUmsatzByPLZ[plz] = (nlFilteredUmsatzByPLZ[plz] || 0) + umsatz;
          if (!nlFilteredByPLZ[plz]) nlFilteredByPLZ[plz] = { hzKosten: 0, hzCount: 0, hzNLs: new Set() };
          nlFilteredByPLZ[plz].hzKosten += hzKosten;
          if (hzFlag && nl) {
            nlFilteredByPLZ[plz].hzNLs.add(nl);
            nlFilteredByPLZ[plz].hzCount = nlFilteredByPLZ[plz].hzNLs.size;
          }
        }

        if (!nlPassed) continue;
        if (hasRadius && !radius.has(plz)) continue;
        if (!aggregated[plz]) aggregated[plz] = { hzCount: 0, hzNLs: new Set(), umsatzNetto: 0, hzKosten: 0, potHzSum: 0, potHzCount: 0 };
        const entry = aggregated[plz];
        // Bug 3 Fix: eindeutige NL-IDs zählen, nicht Rows
        if (hzFlag && nl) {
          entry.hzNLs.add(nl);
          entry.hzCount = entry.hzNLs.size;
        }
        entry.umsatzNetto += umsatz;
        entry.hzKosten    += hzKosten;
        // potHz: NL-Rows mit 0 werden nicht mitgezählt (Datenausfälle bzw. NLs
        // die bewusst 0 als potentielle Werbekosten haben). Sonst zieht ein
        // einzelner 0-Wert den Durchschnitt fälschlich runter.
        // Annahme (siehe Domain-Antwort): potHz ist PLZ-Stammdatum, alle
        // gültigen NL-Rows liefern denselben Wert > 0.
        const potHz = row['value_hz_potentiell_0']?.raw;
        if (typeof potHz === 'number' && potHz > 0) {
          entry.potHzSum += potHz;
          entry.potHzCount++;
        }
      }

      const base = this.filteredKennwerte || {};
      const newFilteredKennwerte = {};
      const newFilteredPLZWerte  = {};

      for (const plz of Object.keys(aggregated)) {
        const entry = aggregated[plz];
        // Wenn NL-Filter aktiv: NL-gefilterte Werte als Basis (zeigt nur selektierte NLs).
        // Ohne NL-Filter: alle Rows der PLZ (unfilteredByPLZ).
        // Hintergrund: BW liefert Umsatz auf Nachbar-NL-Rows und Kosten auf HZ-NL-Row —
        // WK%-Nenner muss denselben NL-Scope haben wie der Zähler (hzKosten).
        const refBucket  = hasNLFilter ? (nlFilteredByPLZ[plz] || { hzKosten: 0, hzCount: 0 })
                                       : (unfilteredByPLZ[plz]  || { hzKosten: 0, hzCount: 0 });
        const umsatzRef  = hasNLFilter ? (nlFilteredUmsatzByPLZ[plz] ?? 0)
                                       : (unfilteredUmsatzByPLZ[plz]  ?? 0);

        // hzKosten-Fallback (B37): Wenn `entry.hzKosten` 0 ist (HZ-NL nicht im
        // NL-Filter ODER nicht im Radius), springt der Fallback auf den Scope-
        // Bucket. Im NL-Filter-Modus zeigt das die ungefilterten HZ-Kosten —
        // bewusste Designentscheidung (User-friendly, zeigt Original-WK auch
        // bei NL-Filter). Wenn das geändert werden soll: hier `entry.hzKosten`
        // direkt nehmen ohne Fallback.
        const hzKosten   = entry.hzKosten > 0 ? entry.hzKosten : refBucket.hzKosten;
        // isHZ gilt nur wenn die selektierte NL die HZ-Bestreuung hat.
        // Wenn NL-Filter aktiv und die HZ-NL rausgefiltert ist → isHZ=false,
        // PLZ erscheint als nicht bestreut → potentielle WK werden angezeigt.
        const isHZ       = entry.hzCount > 0;
        const isCritical = entry.hzCount > 1;

        // WK%-Nenner = Umsatz im gewählten NL-Scope (alle NLs oder nur selektierte)
        const umsatzGesamt = umsatzRef;
        // Domain-Frage 3 (geklärt): 0 wird angezeigt, negative Werte (Stornos
        // im Saldo) werden zu 0 normalisiert. Kein Fallback mehr auf umsatzGesamt
        // wenn entry.umsatzNetto = 0 — das hatte vorher bei NL-Filter+Radius
        // einen ungefilterten Wert eingeschmuggelt.
        const umsatzNetto = entry.umsatzNetto > 0 ? entry.umsatzNetto : 0;
        // WK% Nenner = Gesamtumsatz PLZ (inkl. Nachbar-NLs) — so wie BW-Analyse
        const wkPercent  = umsatzGesamt > 0 ? Number(((hzKosten / umsatzGesamt) * 100).toFixed(2)) : 0;
        // wkNachbarn = gleich wie wkPercent (beide auf Gesamtumsatz)
        const wkNachbarn = wkPercent;
        // Hinweis (B35): avgPotHz ist Mittelwert über NL-Rows. Annahme — analog
        // zu Haushalten (Antwort 1) — value_hz_potentiell_0 ist ein PLZ-Stammdatum,
        // d.h. jede NL-Row liefert denselben Wert. Wenn das nicht zutrifft (NL-spezifisch),
        // müsste man summieren statt mitteln.
        const avgPotHz   = entry.potHzCount > 0 ? entry.potHzSum / entry.potHzCount : 0;
        const potHzPct   = umsatzGesamt > 0 ? Number(((avgPotHz / umsatzGesamt) * 100).toFixed(2)) : 0;
        const baseEntry   = base[plz] || {};
        const old         = this.filteredPLZWerte?.[plz] || {};

        newFilteredKennwerte[plz] = {
          ...baseEntry,
          isHZ, isCritical,
          value_hr_n_umsatz_0:      { raw: umsatzNetto },
          value_wk_in_percent_0:    { raw: wkPercent },
          value_wk_nachbar_0:       { raw: wkNachbarn },
          value_hz_kosten_0:        { raw: hzKosten },
          value_hz_potentiell_0:    { raw: avgPotHz },
          value_wk_potentiell_0:    { raw: potHzPct },
          value_ums_erhebung_0:     { raw: old.umsatzErhebung ?? 0 },
          value_kd_erhebung_0:      { raw: old.kdErhebung ?? 0 },
          value_auflage_0:          { raw: old.auflage ?? 0 },
          value_kaufkraft_0:        { raw: old.kaufkraftIndex   ?? 0 },
          value_werbeverweigerer_0: { raw: old.werbeverweigerer ?? 0 },
        };
        newFilteredPLZWerte[plz] = {
          wk: wkPercent, wkPot: potHzPct, hz: isHZ,
          umsatz: old.umsatz ?? 0, ra: old.ra ?? 0, onlineshop: old.onlineshop ?? 0, pluscard: old.pluscard ?? 0,
          haushalte: old.haushalte ?? 0,
          kaufkraftIndex: old.kaufkraftIndex ?? 0, werbeverweigerer: old.werbeverweigerer ?? 0,
          umsatzProHaushalt: old.umsatzProHaushalt ?? 0,
          raProHaushalt: old.raProHaushalt ?? 0,
          onlineshopProHaushalt: old.onlineshopProHaushalt ?? 0,
          pluscardProHaushalt: old.pluscardProHaushalt ?? 0,
          umsatzWerbung: old.umsatzWerbung ?? 0,
          raWerbung: old.raWerbung ?? 0,
          onlineshopWerbung: old.onlineshopWerbung ?? 0,
          pluscardWerbung: old.pluscardWerbung ?? 0,
          umsatzZusatz: old.umsatzZusatz ?? 0,
          raZusatz: old.raZusatz ?? 0,
          onlineshopZusatz: old.onlineshopZusatz ?? 0,
          pluscardZusatz: old.pluscardZusatz ?? 0,
          umsatzWerbungProHaushalt: old.umsatzWerbungProHaushalt ?? 0,
          raWerbungProHaushalt: old.raWerbungProHaushalt ?? 0,
          onlineshopWerbungProHaushalt: old.onlineshopWerbungProHaushalt ?? 0,
          pluscardWerbungProHaushalt: old.pluscardWerbungProHaushalt ?? 0,
          umsatzZusatzProHaushalt: old.umsatzZusatzProHaushalt ?? 0,
          raZusatzProHaushalt: old.raZusatzProHaushalt ?? 0,
          onlineshopZusatzProHaushalt: old.onlineshopZusatzProHaushalt ?? 0,
          pluscardZusatzProHaushalt: old.pluscardZusatzProHaushalt ?? 0,
          werbeAnteil: old.werbeAnteil ?? 0,
        };
      }

      this.filteredKennwerte = newFilteredKennwerte;
      this.filteredPLZWerte  = newFilteredPLZWerte;
    }

    // ── Cross-Erhebungs-Doppelbestreuung ───────────────────────────────
    // ── Cross-GF-Doppelbestreuung im Multi-Modus (Phase 1) ─────────────
    // Findet PLZs, die in 2+ aktiv-kombinierten Erhebungen mit HZ=X bestreut
    // werden. Unterschied zu _computeCrossErhebungDoppel: dort werden Fremd-
    // Erhebungen GEGEN die aktive geprüft; hier alle aktiven UNTEREINANDER.
    _computeCrossGfDoppel() {
      this._crossGfDoppel = {};
      if (!this._activeErhebungen || this._activeErhebungen.length < 2) return;

      // Pro PLZ: welche ErhIDs haben HZ=X? Wenn >1, ist die PLZ cross-bestreut.
      const plzToErhSet = {};
      for (const e of this._activeErhebungen) {
        const rows = this._getErhebungRows(e.erhID, e.jahr, e.nummer);
        for (let i = 0, len = rows.length; i < len; i++) {
          const row = rows[i];
          if (row['dimension_hzflag_0']?.id?.trim() !== 'X') continue;
          const __land = this._landOfRow(row); const __bare = this._normalizePLZ(row['dimension_plz_0']?.id ?? row['dimension_plz_0']?.raw, __land); const plz = (__bare && !this._isAggregatePlz(__bare)) ? this._plzKey(__land, __bare) : null;
          if (!plz || plz === '00000') continue;
          if (!plzToErhSet[plz]) plzToErhSet[plz] = new Set();
          plzToErhSet[plz].add(e.erhID);
        }
      }
      for (const plz of Object.keys(plzToErhSet)) {
        const erhSet = plzToErhSet[plz];
        if (erhSet.size >= 2) {
          this._crossGfDoppel[plz] = [...erhSet];
        }
      }
    }

    _computeCrossErhebungDoppel() {
      this._crossErhebungPLZ = {};
      if (!this._activeFilter || !this._myDataSource?.data) return;
      const { erhID: aktErhID, jahr, nummer } = this._activeFilter;
      // Bug DB7 Fix: alle aktiven Erhebungen (Basis + Partner) gehören zum
      // "aktiven Set" — Cross-Marker dürfen nur für ANDERE Erhebungen mit
      // gleichem Jahr+Nummer gesetzt werden, nicht für aktive Partner.
      const aktSet = new Set(
        (this._activeErhebungen?.length ? this._activeErhebungen : [{ erhID: aktErhID }])
          .map(e => e.erhID)
      );

      const aktHZPLZs = new Set();
      for (const [plz, k] of Object.entries(this.filteredKennwerte || {})) {
        if (k.isHZ) aktHZPLZs.add(plz);
      }
      if (aktHZPLZs.size === 0) return;

      // Alle Fremd-Erhebungen mit gleichem Jahr+Nummer durchgehen (nur HZ=X Rows)
      const fremdRows = [];
      for (const key of Object.keys(this._erhebungIndex || {})) {
        const [rErh, rJahr, rNr] = key.split('|');
        // Aktive Erhebung (Basis ODER Partner) überspringen — die ist nicht "fremd"
        if (aktSet.has(rErh) || rJahr !== jahr || rNr !== nummer) continue;
        const rows = this._erhebungIndex[key];
        for (const r of rows) {
          if (r['dimension_hzflag_0']?.id?.trim() === 'X') fremdRows.push(r);
        }
      }
      for (const row of fremdRows) {
        const __land = this._landOfRow(row); const __bare = this._normalizePLZ(row['dimension_plz_0']?.id ?? row['dimension_plz_0']?.raw, __land); const plz = (__bare && !this._isAggregatePlz(__bare)) ? this._plzKey(__land, __bare) : null;
        if (!plz || !aktHZPLZs.has(plz)) continue;
        const rErh = row['dimension_erhebung_0']?.id?.trim();
        const rNL  = row['dimension_niederlassung_0']?.id?.trim();
        if (!this._crossErhebungPLZ[plz]) this._crossErhebungPLZ[plz] = {};
        if (!this._crossErhebungPLZ[plz][rErh]) this._crossErhebungPLZ[plz][rErh] = new Set();
        if (rNL) this._crossErhebungPLZ[plz][rErh].add(rNL);
      }

      // Eigene NL-Kontribution zu ohnehin-internen Critical-PLZs hinzufügen
      if (this.filteredData) {
        for (const row of this.filteredData) {
          const __land = this._landOfRow(row); const __bare = this._normalizePLZ(row['dimension_plz_0']?.id ?? row['dimension_plz_0']?.raw, __land); const plz = (__bare && !this._isAggregatePlz(__bare)) ? this._plzKey(__land, __bare) : null;
          if (!plz) continue;
          if (row['dimension_hzflag_0']?.id?.trim() !== 'X') continue;
          const nl = row['dimension_niederlassung_0']?.id?.trim();
          const isInternalCritical = this.filteredKennwerte?.[plz]?.isCritical;
          const hasCrossEntry = !!this._crossErhebungPLZ[plz];
          if (!isInternalCritical && !hasCrossEntry) continue;
          if (!this._crossErhebungPLZ[plz]) this._crossErhebungPLZ[plz] = {};
          if (!this._crossErhebungPLZ[plz][aktErhID]) this._crossErhebungPLZ[plz][aktErhID] = new Set();
          if (nl) this._crossErhebungPLZ[plz][aktErhID].add(nl);
        }
      }
    }

    _refreshAll() {
      this.prepareUmsatzPLZWerte();
      this.computeWKKennwerte();
      this.computeStreuverlust();
      this.updateGeoLayer();
      this.updateHeatmapLegend();
      this.renderDataTable(this.filteredKennwerte);
      if (this._activeFilter) this.showOverviewPopup();
    }

    prepareMapData(filteredData) {
      // Bug-Fix B11/B14: Bootstrap hat NL-Klarnamen aus 00000-Stammdaten gelesen.
      // Hier NICHT pauschal überschreiben, sondern nur ergänzen wo etwas fehlt.
      // Die Erhebungs-Rows enthalten denselben Namen unter dimension_nl_name_0?.label,
      // aber falls das Feld fehlt fallen wir sauber auf den Bootstrap-Wert zurück.
      const prevNL = this.Niederlassung || {};
      this.Niederlassung = {}; this.nlKoordinaten = {}; this.hzFlags = {}; this.extraNLs = [];
      const NL  = this.Niederlassung;
      const nlK = this.nlKoordinaten;
      const hzF = this.hzFlags;
      for (let i = 0, len = filteredData.length; i < len; i++) {
        const row = filteredData[i];
        const __land = this._landOfRow(row); const __bare = this._normalizePLZ(row['dimension_plz_0']?.id, __land); const plz = (__bare && !this._isAggregatePlz(__bare)) ? this._plzKey(__land, __bare) : null;
        const nlKey = row['dimension_niederlassung_0']?.id?.trim();
        const hz = row['dimension_hzflag_0']?.id?.trim() === 'X';
        if (nlKey) {
          if (!NL[nlKey]) {
            // Priorität: Erhebungs-Row > Bootstrap-Cache > nlKey selbst
            const labelHere = row['dimension_nl_name_0']?.label?.trim();
            NL[nlKey] = labelHere || prevNL[nlKey] || nlKey;
          }
          if (!nlK[nlKey]) {
            const lat = parseFloat(row['dimension_Lat_0']?.label);
            const lon = parseFloat(row['dimension_lon_0']?.label);
            if (!isNaN(lat) && !isNaN(lon)) nlK[nlKey] = { lat, lon };
          }
        }
        if (plz) {
          // Phase-1: im Multi-Modus kann dieselbe PLZ in mehreren Erhebungen
          // auftauchen. HZ=X soll "sticky" sein — sobald IRGENDEINE Erhebung
          // die PLZ bestreut, gilt die PLZ als bestreut. Sonst würde die
          // letzte iterierte Row die HZ-Info überschreiben.
          if (hz) hzF[plz] = true;
          else if (hzF[plz] === undefined) hzF[plz] = false;
        }
      }
    }


    // ── Heatmap-Legende ────────────────────────────────────────────────
    updateHeatmapLegend() {
      const legend = this.$('heatmap-legend');
      if (!legend) return;
      if (!this._activeFilter || !this.filteredPLZWerte ||
          Object.keys(this.filteredPLZWerte).length === 0 ||
          !this.currentMapMode) {
        legend.classList.add('hidden');
        return;
      }
      const row = (bg, label) =>
        `<div class="heatmap-legend-row"><div class="heatmap-legend-color" style="background:${bg}"></div><span>${label}</span></div>`;

      if (this.currentMapMode === 'wk') {
        legend.innerHTML = `<strong>Werbekosten</strong>
          <div style="font-size:0.7rem;color:#adb5bd;font-weight:600;margin:6px 0 3px;text-transform:uppercase;letter-spacing:.04em">Bestreut (% WK)</div>
          ${row('#e31a1c','&gt; 25 % &nbsp;<em style=\'opacity:.7;font-size:0.9em\'>oder bestreut ohne Umsatz</em>')}${row('#fd8d3c','15 – 25 %')}${row('#ffffb2','10 – 15 %')}${row('#78c679','5 – 10 %')}${row('#41ab5d','2 – 5 %')}${row('#006837','0 – 2 %')}
          <div style="font-size:0.7rem;color:#adb5bd;font-weight:600;margin:8px 0 3px;text-transform:uppercase;letter-spacing:.04em">Nicht bestreut (% pot. WK)</div>
          ${row('#cfd4da','&gt; 50 %')}${row('#bdbdbd','25 – 50 %')}${row('#969696','15 – 25 %')}${row('#6baed6','10 – 15 %')}${row('#2171b5','5 – 10 %')}${row('#08306b','&lt; 5 %')}`;
        legend.classList.remove('hidden'); return;
      }
      if (this.currentMapMode === 'umsatz-multi') {
        // Math.max(...values) würde bei sehr großen PLZ-Arrays (>~10k) den Stack
        // sprengen. reduce ist sicher und gleich schnell.
        let max = 0;
        for (const v of Object.values(this.filteredPLZWerte)) {
          const sum = this.getUmsatzSumForPLZ(v);
          if (sum > max) max = sum;
        }
        if (max === 0) { legend.classList.add('hidden'); return; }
        const fmt = (x) => x.toLocaleString('de-DE', { maximumFractionDigits: 0 });
        const steps = [
          { v: max,       label: `&gt; ${fmt(max*0.95)} €` },
          { v: max*.85,   label: `${fmt(max*0.75)} – ${fmt(max*0.85)} €` },
          { v: max*.65,   label: `${fmt(max*0.55)} – ${fmt(max*0.65)} €` },
          { v: max*.45,   label: `${fmt(max*0.35)} – ${fmt(max*0.45)} €` },
          { v: max*.20,   label: `${fmt(max*0.10)} – ${fmt(max*0.20)} €` },
          { v: 0,         label: `&lt; ${fmt(max*0.10)} €` },
        ];
        legend.innerHTML = `<strong>Umsatz</strong>` +
          steps.map(s => row(this.getDynamicHeatColor(s.v, max), s.label)).join('');
        legend.classList.remove('hidden'); return;
      }
      if (this.currentMapMode === 'werbeanteil') {
        legend.innerHTML = `<strong>Werbeanteil</strong>` +
          [['#7a0f17','&gt; 80 %'],['#b41821','60 – 80 %'],['#e96a3a','40 – 60 %'],
           ['#f6b65b','20 – 40 %'],['#f7d77a','10 – 20 %'],['#fce9b2','&lt; 10 %']]
           .map(([bg, l]) => row(bg, l)).join('');
        legend.classList.remove('hidden'); return;
      }
      legend.classList.add('hidden');
    }

    // ── Doppelbestreuung-Tooltip ───────────────────────────────────────
    // Phase-1: zeigt sowohl Single-Erhebung-Doppelbestreuung (crossErhebungPLZ
    // — Fremd-Erhebungen) als auch Cross-GF-Doppelbestreuung (crossGfDoppel
    // — aktive Multi-Erhebungen) an. Beide können gleichzeitig aktiv sein.
    _showDoppelTooltip(plz, event, container) {
      this._hideDoppelTooltip();
      const crossInfo = { ...(this._crossErhebungPLZ?.[plz] || {}) };
      // Sets in crossInfo sind shared mit _crossErhebungPLZ — wir wollen sie
      // nicht modifizieren. Daher kopieren wir die Sets:
      for (const eid of Object.keys(crossInfo)) {
        crossInfo[eid] = new Set(crossInfo[eid]);
      }
      const { erhID: aktErhID } = this._activeFilter || {};

      // Fallback: wenn keine Cross-Daten gecacht, aus filteredData ableiten
      if (Object.keys(crossInfo).length === 0 && aktErhID && this.filteredData) {
        crossInfo[aktErhID] = new Set();
        for (const row of this.filteredData) {
          const p = this._plzKey(this._landOfRow(row), this._normalizePLZ(row['dimension_plz_0']?.id ?? row['dimension_plz_0']?.raw, this._landOfRow(row)));
          if (p !== plz) continue;
          if (row['dimension_hzflag_0']?.id?.trim() !== 'X') continue;
          const nl = row['dimension_niederlassung_0']?.id?.trim();
          if (nl) crossInfo[aktErhID].add(nl);
        }
      }

      // Phase-1: Cross-GF-Doppel-Info ergänzen — pro PLZ alle aktiven
      // Erhebungen mit HZ=X auflisten, gruppiert pro NL.
      const crossGfErhIDs = this._crossGfDoppel?.[plz];
      if (crossGfErhIDs && this._activeErhebungen?.length >= 2) {
        for (const e of this._activeErhebungen) {
          if (!crossGfErhIDs.includes(e.erhID)) continue;
          const rows = this._getErhebungRows(e.erhID, e.jahr, e.nummer);
          for (const row of rows) {
            const p = this._plzKey(this._landOfRow(row), this._normalizePLZ(row['dimension_plz_0']?.id ?? row['dimension_plz_0']?.raw, this._landOfRow(row)));
            if (p !== plz) continue;
            if (row['dimension_hzflag_0']?.id?.trim() !== 'X') continue;
            const nl = row['dimension_niederlassung_0']?.id?.trim();
            if (!nl) continue;
            if (!crossInfo[e.erhID]) crossInfo[e.erhID] = new Set();
            crossInfo[e.erhID].add(nl);
          }
        }
      }

      // Pro Erhebung gruppiert ausgeben (übersichtlicher als flat-Liste)
      const erhIDs = Object.keys(crossInfo).filter(e => crossInfo[e]?.size > 0);
      let bodyHtml;
      if (erhIDs.length === 0) {
        bodyHtml = `<div style="color:var(--gray-500);font-size:0.76rem">Keine NL-Details verfügbar.</div>`;
      } else if (erhIDs.length === 1) {
        const nls = [...crossInfo[erhIDs[0]]].join(', ');
        bodyHtml = `<div style="color:var(--gray-500);font-size:0.76rem">
          Durch NLs: <strong style="color:var(--gray-800)">${escapeHtml(nls)}</strong>
        </div>`;
      } else {
        bodyHtml = erhIDs.map(eid => {
          const nls = [...crossInfo[eid]].join(', ');
          const gfLabel = this._fmtGF ? this._fmtGF(eid) : eid;
          return `<div style="color:var(--gray-500);font-size:0.74rem;margin-top:2px">
            <span style="color:var(--red);font-weight:600">${escapeHtml(gfLabel)}:</span>
            <strong style="color:var(--gray-800)">${escapeHtml(nls)}</strong>
          </div>`;
        }).join('');
      }

      const el = document.createElement('div');
      el.className = 'doppel-tooltip';
      el.innerHTML = `
        <div class="doppel-tooltip-title">⚠️ Doppelbestreuung · PLZ ${escapeHtml(String(plz).split(':').slice(1).join(':') || plz)}</div>
        <div class="doppel-tooltip-row">${bodyHtml}</div>`;
      el.style.position = 'absolute';
      el.style.pointerEvents = 'none';
      container?.appendChild(el);
      this._doppelTooltipEl = el;
      this._moveDoppelTooltip(event, container);
    }

    _moveDoppelTooltip(event, container) {
      if (!this._doppelTooltipEl || !container) return;
      const rect = container.getBoundingClientRect();
      let x = event.clientX - rect.left + 14;
      let y = event.clientY - rect.top - 10;
      const tw = this._doppelTooltipEl.offsetWidth  || 200;
      const th = this._doppelTooltipEl.offsetHeight || 80;
      if (x + tw > rect.width  - 10) x = event.clientX - rect.left - tw - 14;
      if (y + th > rect.height - 10) y = event.clientY - rect.top  - th - 10;
      this._doppelTooltipEl.style.left = x + 'px';
      this._doppelTooltipEl.style.top  = y + 'px';
    }

    _hideDoppelTooltip() {
      if (this._doppelTooltipEl) { this._doppelTooltipEl.remove(); this._doppelTooltipEl = null; }
    }

    _clearDoppelMarkers() {
      if (this.criticalMarkers) {
        for (const plz of Object.keys(this.criticalMarkers)) this._removeCriticalMarker(plz);
        this.criticalMarkers = {};
      }
      this._hideDoppelTooltip();
    }

    // ── Cinematic Loader ───────────────────────────────────────────────
    // ── Skeleton-Loading (Phase 2) ──────────────────────────────────────
    // Während BW-Daten laden, zeigen wir animierte Platzhalter in der PLZ-
    // Tabelle (statt leerem Container) + einen dezenten Pulse-Overlay auf
    // der Karte. Wirkt "lebendiger" und kommuniziert "etwas passiert hier".
    _showSkeletonTable() {
      const container = this.$('table-container');
      if (!container) return;
      let html = '<div class="skeleton-table">';
      for (let i = 0; i < 12; i++) {
        html += `<div class="skeleton-table-row">
          <div class="skeleton-shimmer"></div>
          <div class="skeleton-shimmer"></div>
          <div class="skeleton-shimmer"></div>
          <div class="skeleton-shimmer"></div>
        </div>`;
      }
      html += '</div>';
      container.innerHTML = html;
    }
    _showSkeletonMapOverlay() {
      const mapContainer = this._shadowRoot.querySelector('.map-container');
      if (!mapContainer) return;
      let ov = this.$('skeleton-map-overlay');
      if (!ov) {
        ov = document.createElement('div');
        ov.id = 'skeleton-map-overlay';
        ov.className = 'skeleton-map-overlay';
        ov.innerHTML = '<div class="skeleton-map-pulse"></div>';
        mapContainer.appendChild(ov);
      }
      // Reflow erzwingen damit die Transition triggert
      void ov.offsetWidth;
      ov.classList.add('active');
    }
    _hideSkeletonMapOverlay() {
      const ov = this.$('skeleton-map-overlay');
      if (!ov) return;
      ov.classList.remove('active');
      this._setTimeout(() => { try { ov.remove(); } catch (e) {} }, 250);
    }

    _showCinematicLoader() {
      this._hideCinematicLoader(true);
      const overlay = document.createElement('div');
      overlay.id = 'cinematic-loader';
      overlay.innerHTML = `
        <div class="loader-logo"><div class="loader-core"></div></div>
        <div class="loader-phase" id="loader-phase-text">Wird geladen…</div>
        <div class="loader-bar-track"><div class="loader-bar-fill" id="loader-bar"></div></div>
        <div class="loader-dots">
          <div class="loader-dot" data-phase="1"><div class="dot-circle"></div><div class="dot-label">Daten</div></div>
          <div class="loader-dot" data-phase="2"><div class="dot-circle"></div><div class="dot-label">Karte</div></div>
          <div class="loader-dot" data-phase="3"><div class="dot-circle"></div><div class="dot-label">Standorte</div></div>
          <div class="loader-dot" data-phase="4"><div class="dot-circle"></div><div class="dot-label">Kennzahlen</div></div>
        </div>
        <div class="loader-data-progress" id="loader-data-progress">
          <div class="loader-data-bar-track"><div class="loader-data-bar-fill" id="loader-data-bar"></div></div>
          <div class="loader-data-label" id="loader-data-label"></div>
        </div>`;
      const mc = this._shadowRoot.querySelector('.map-container');
      if (mc) mc.appendChild(overlay); else this._shadowRoot.appendChild(overlay);
    }

    _updateLoaderPhase(phase, text) {
      const loader = this.$('cinematic-loader');
      if (!loader) return;
      const phaseText = loader.querySelector('#loader-phase-text');
      if (phaseText) {
        phaseText.style.opacity = '0';
        this._setTimeout(() => { phaseText.textContent = text; phaseText.style.opacity = '1'; }, 140);
      }
      const bar = loader.querySelector('#loader-bar');
      const pm = { 1: 15, 2: 40, 3: 65, 4: 85, 5: 100 };
      if (bar) bar.style.width = (pm[phase] || 0) + '%';
      loader.querySelectorAll('.loader-dot').forEach(dot => {
        const p = Number(dot.dataset.phase);
        dot.classList.remove('active', 'done');
        if (p === phase) dot.classList.add('active');
        else if (p < phase) dot.classList.add('done');
      });
    }

    _updateDataLoadProgress(current, total, pct) {
      const loader = this.$('cinematic-loader');
      if (!loader) return;
      const box   = loader.querySelector('#loader-data-progress');
      const bar   = loader.querySelector('#loader-data-bar');
      const label = loader.querySelector('#loader-data-label');
      if (!box) return;
      box.style.display = 'flex';
      const percent = (pct !== undefined)
        ? Math.min(100, Math.round(pct))
        : (total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0);
      if (bar) { bar.style.animation = 'none'; bar.style.width = percent + '%'; }
      if (label) {
        if (total > 0 && current !== undefined) {
          label.textContent = current.toLocaleString('de-DE') + ' von ' + total.toLocaleString('de-DE') + ' (' + percent + ' %)';
        } else {
          label.textContent = percent + ' %';
        }
      }
    }

    _hideDataLoadProgress() {
      const box = this.$('cinematic-loader')?.querySelector('#loader-data-progress');
      if (box) box.style.display = 'none';
    }

    _hideCinematicLoader(immediate = false) {
      const loader = this.$('cinematic-loader');
      // Skeleton-Map-Overlay zusammen mit dem Cinematic-Loader weg
      this._hideSkeletonMapOverlay?.();
      if (!loader) return;
      if (immediate) { loader.remove(); return; }
      loader.classList.add('fade-out');
      this._setTimeout(() => loader.remove(), 380);
    }

    showLoadingOverlay() {
      const o = this.$('loading-spinner');
      if (!o) return;
      o.classList.remove('hidden'); o.style.opacity = '1'; o.style.pointerEvents = 'auto';
    }
    hideLoadingOverlay() {
      const o = this.$('loading-spinner');
      if (!o) return;
      o.style.transition = 'opacity 0.25s ease'; o.style.opacity = '0'; o.style.pointerEvents = 'none';
      this._setTimeout(() => o.classList.add('hidden'), 250);
    }
    showSpinner() { this.$('loading-spinner')?.classList.remove('hidden'); }
    hideSpinner() { this.$('loading-spinner')?.classList.add('hidden'); }


    // ── Preview-Animation (Hauptmenü: Cycles durch alle Erhebungen) ────
    _startPreviewAnimation() {
      if (this._activeFilter) return;
      if (!this._erhData || Object.keys(this._erhData).length === 0) return;
      if (!this.map) return;

      const allErhIDs = Object.keys(this._erhData);
      if (allErhIDs.length === 0) return;

      if (!this._previewGroup) this._previewGroup = L.layerGroup().addTo(this.map);

      // NL-Koordinaten aus Index ableiten
      const nlByErh = {};
      if (this._erhebungIndex) {
        for (const key of Object.keys(this._erhebungIndex)) {
          const rows = this._erhebungIndex[key];
          const erhID = rows[0]?.['dimension_erhebung_0']?.id?.trim();
          if (!erhID) continue;
          for (const row of rows) {
            const nl  = row['dimension_niederlassung_0']?.id?.trim();
            const lat = parseFloat(row['dimension_Lat_0']?.label);
            const lon = parseFloat(row['dimension_lon_0']?.label);
            if (!nl || isNaN(lat) || isNaN(lon)) continue;
            (nlByErh[erhID] ||= {});
            if (!nlByErh[erhID][nl]) nlByErh[erhID][nl] = { lat, lon };
          }
        }
      }

      const getOrCreateLabel = () => {
        let lbl = this.$('preview-erh-label');
        if (!lbl) {
          lbl = document.createElement('div');
          lbl.id = 'preview-erh-label';
          this._shadowRoot.querySelector('.map-container')?.appendChild(lbl);
        }
        return lbl;
      };

      let currentIdx = 0;
      const showErhebung = (erhID) => {
        this._previewGroup.clearLayers();
        const lbl = getOrCreateLabel();
        lbl.style.opacity = '0';
        this._setTimeout(() => {
          lbl.textContent = `Vorschau · ${this._fmtGF(erhID)}`;
          lbl.style.opacity = '1';
        }, 150);

        const nls = nlByErh[erhID] || {};
        const nlList = Object.entries(nls);
        if (nlList.length === 0) return;

        nlList.forEach(([nl, { lat, lon }], i) => {
          this._setTimeout(() => {
            if (this._activeFilter) return;
            const pingIcon = L.divIcon({
              html: `<div style="width:44px;height:44px;border-radius:50%;border:2px solid rgba(180,24,33,0.55);animation:previewPing 1s ease-out forwards;pointer-events:none;"></div>`,
              className: '', iconSize: [44, 44], iconAnchor: [22, 22]
            });
            const pingMarker = L.marker([lat, lon], { icon: pingIcon, interactive: false, zIndexOffset: 500 });
            this._previewGroup.addLayer(pingMarker);
            this._setTimeout(() => {
              try { this._previewGroup.removeLayer(pingMarker); } catch (e) {}
            }, 1050);

            const pinIcon = L.divIcon({
              html: `<div style="width:30px;height:30px;background:#b41821;border-radius:50% 50% 50% 0;box-shadow:-1px 2px 8px rgba(180,24,33,0.5);transform:translate(-50%,-80%) rotate(-45deg) scale(0);animation:previewFadeIn 0.4s cubic-bezier(0.16,1,0.3,1) forwards;display:flex;align-items:center;justify-content:center;pointer-events:none;"><div style="transform:rotate(45deg);font-size:9px;font-weight:700;color:white;font-family:system-ui;max-width:24px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(nl)}</div></div>`,
              className: '', iconSize: [30, 30], iconAnchor: [15, 30]
            });
            const pinMarker = L.marker([lat, lon], { icon: pinIcon, interactive: false, zIndexOffset: 1000 });
            this._previewGroup.addLayer(pinMarker);
          }, i * 300);
        });
      };

      const runCycle = () => {
        if (this._activeFilter) { this._stopPreview(); return; }
        const erhID = allErhIDs[currentIdx % allErhIDs.length];
        showErhebung(erhID);
        currentIdx++;
      };

      runCycle();
      this._previewInterval = this._setInterval(() => {
        if (this._activeFilter) { this._stopPreview(); return; }
        runCycle();
      }, 5500);
    }

    _stopPreview() {
      if (this._previewInterval) {
        this._clearInterval(this._previewInterval);
        this._previewInterval = null;
      }
      this._previewGroup?.clearLayers();
      this.$('preview-erh-label')?.remove();
    }

    // ── onCustomWidgetEvent (SAC-Hook) ─────────────────────────────────
    onCustomWidgetEvent(event) {
      if (event?.name === 'toggleTiles') this.toggleMapTiles();
    }

    // ── queryErhebungFromBW (Fallback-Path) ────────────────────────────
    async queryErhebungFromBW(erhID, jahr, nummer) {
      return this._getErhebungRows(erhID, jahr, nummer);
    }

    // ── loadErhebung ───────────────────────────────────────────────────
    async loadErhebung(erhID, jahr, nummer) {
      // Bug E19 Fix: Wenn dieselbe Erhebung bereits geladen ist UND der
      // Doppelbestreuungs-Modus unverändert ist, kein unnötiger BW-Reload.
      // Vergleich auf rohe Werte (Basis-Erhebung, ignoriert Partner-Erhebungen).
      //
      // Bug DB1 Fix: Vergleich muss auch _doppelbestreuungAktiv einbeziehen —
      // sonst wird ein Mode-Wechsel "mit↔ohne Doppelbestreuung" geskippt
      // obwohl sich das BW-Filter-Setup grundlegend ändert.
      const cur = this._activeFilter;
      const wantDoppel = !!this._doppelbestreuungAktiv;
      if (cur && cur.erhID === erhID && cur.jahr === jahr && cur.nummer === nummer
          && (this._activeErhebungen?.length || 0) <= 1
          && this._lastLoadedDoppelMode === wantDoppel) {
        console.info('[PLZ-Widget] loadErhebung: identische Erhebung — skip');
        return;
      }
      // Merken in welchem Modus wir gerade laden (für nächsten E19-Check).
      this._lastLoadedDoppelMode = wantDoppel;

      this.$('heatmap-legend')?.classList.add('hidden');
      // Phase 2: Sidebar aktivieren, Default-View = PLZ-Tabelle, Spalte
      // sichtbar machen falls vorher ausgeblendet.
      this._setSidebarEnabled(true);
      this._setLeftPaneVisible(true);
      this._switchSidebarView('plz');
      // Doppelbestreuungs-Bar collapsed während der Erhebung —
      // gibt der PLZ-Tabelle mehr vertikalen Platz.
      this.$('doppel-toggle-bar')?.classList.add('collapsed');
      this._stopPreview();
      const overlay = this.$('map-preview-overlay');
      if (overlay) overlay.innerHTML = '';
      this._rawPLZCache = {};
      this._crossErhebungPLZ = {};

      // Panel-Footer-Buttons aktivieren
      this.$('panel-home-btn')?.removeAttribute('disabled');
      this.$('panel-overview-btn')?.removeAttribute('disabled');

      this._showCinematicLoader();
      this._updateLoaderPhase(1, 'Erhebungsdaten werden geladen…');
      // Skeleton-Loading: PLZ-Tabelle mit Shimmer-Placeholders, Karten-Pulse
      this._showSkeletonTable();
      this._showSkeletonMapOverlay();

      // Bug R5 Fix: Token inkrementieren, damit ein eventuell noch laufender
      // render() der vorigen Erhebung beim nächsten yieldFrame als "stale"
      // erkannt wird und abbricht. Sonst überschreibt der alte Render-Pass
      // die UI nach dem neuen loadErhebung-Aufruf.
      this._renderToken = (this._renderToken || 0) + 1;

      this._activeFilter = { erhID, jahr, nummer };
      // Filter-Maske einklappen — _activeFilter muss vorher gesetzt sein
      this._setFilterFieldsCollapsed(true);
      // Kurze Attention-Animation auf dem Toggle-Button
      const ft = this.$('filter-fields-toggle');
      if (ft) {
        ft.classList.remove('just-visible');
        void ft.offsetWidth;
        ft.classList.add('just-visible');
        this._setTimeout(() => ft.classList.remove('just-visible'), 2500);
      }
      // Multi-Erhebungs-Modell: Liste aktiver Erhebungen mit dieser Basis-Erhebung
      // als einzigem Eintrag. Im Erhebungs-Layout kann der User weitere via
      // togglePartnerErhebung() dazu- oder wegschalten (gleiches Jahr+Nummer).
      this._activeErhebungen = [{ erhID, jahr, nummer }];
      // Doppelbestreuungs-Checkbox automatisch an den Modus koppeln:
      // Wenn der User im Hauptmenü "Mit Doppelbestreuung" gewählt hat, soll
      // der ⚠️-Marker-Toggle auto-an sein. Sonst auto-aus.
      this.showCritical = !!this._doppelbestreuungAktiv;
      const chkDoppelAuto = this.$('chk-doppelbestreuung');
      if (chkDoppelAuto) chkDoppelAuto.checked = this.showCritical;
      // Cache-Reset: bei Wechsel der Basis-Erhebung gehören alte Pre-Aggregate
      // zu einer anderen "Session". Rows-Cache darf bleiben, um schnelles Zurück
      // zu früheren Erhebungen zu ermöglichen, aber Aggregate-Cache muss frisch
      // sein weil sich Radius/NL-Filter mit der neuen Erhebung änderen können.
      this._erhebungAggregatesCache.clear();
      this._crossGfDoppelAktiv = false;
      // Pending-Partners-Set verwerfen — gehört zur alten Erhebungs-Session.
      // Beim nächsten Picker-Render wird es aus dem neuen Active-State initialisiert.
      this._pendingPartners = null;
      // Bug E2 Fix: NL-Selektion und Kategorie-Selektion zurücksetzen.
      // Andernfalls bleiben NL-IDs der alten Erhebung selektiert, die in der
      // neuen Erhebung gar nicht existieren — führt zu leeren Filter-Resultaten
      // bis der nächste render()-Pass die _selectedNLs überschreibt.
      this._selectedNLs = new Set();
      this._nlSelectionInitialized = false;
      this.activeCategories = new Set(CATEGORIES);
      // Bug E3 Fix: alle abgeleiteten Container-States invalidieren, sonst
      // greift z.B. eine alte filteredPLZWerte zwischen loadErhebung und
      // erstem render()-Pass auf alte PLZs zurück.
      this.filteredPLZWerte = {};
      this.filteredKennwerte = {};
      this.maxFilteredValue = 0;
      // Highlighted PLZ + offene Popups schließen — gehörten zur alten Erhebung
      if (this._highlightedPLZ) {
        const layer = this._layerByPLZ?.[this._highlightedPLZ];
        if (layer && this._geoLayer) this.applyStyleToLayer(layer);
        this._highlightedPLZ = null;
      }
      this._lastHighlightedLayer = null;
      this.closeAllPopups?.();
      // Bug E6 Fix: Critical-Marker (⚠️ Doppelbestreuung, ✅ HZ) der alten
      // Erhebung wegmachen — sonst hängen sie kurz auf der Karte bis der
      // nächste applyStyleToLayer-Pass durchgelaufen ist.
      this._clearDoppelMarkers?.();
      // Bestreuungs-Marker und Radius-Preview ebenfalls clearen.
      this.bestreuungGroup?.clearLayers();
      this.competitorGroup?.clearLayers();
      this._radiusPreviewGroup?.clearLayers();
      // Bug E7 Fix: falls der User vorher Home angeklickt hatte (Reset-Pending)
      // und nun direkt eine neue Erhebung lädt, das Pending-Flag verwerfen —
      // sonst würde der Poll-Tick die neue Erhebung womöglich als "abgebrochen"
      // werten oder die alte Home-Logik triggern.
      this._homeResetPending = false;
      if (this._homeResetSafetyTimer) {
        this._clearTimeout(this._homeResetSafetyTimer);
        this._homeResetSafetyTimer = null;
      }
      // Bug E8 Fix: Partner-Toggle-Lock zurücksetzen — gehörte zur alten
      // Erhebung. Falls noch ein 400ms-Reset-Timer aus _applyPendingPartners
      // läuft, der ist harmlos (setzt das Flag eh nur auf false).
      this._partnerToggleInProgress = false;
      // Bug E10 Fix: Cache-Detection im Poll-Tick (Zeile ~7525) vergleicht
      // rowCount mit _totalRowCount um "noch alte Daten"-Loops zu vermeiden.
      // Bei Erhebungs-Wechsel könnte die neue Erhebung zufällig gleiche
      // Zeilenzahl haben — dann würde der Poll fälschlich looping bleiben.
      // → _totalRowCount auf -1 zurücksetzen, damit der nächste Vergleich
      // garantiert "ungleich" ist.
      this._totalRowCount      = -1;
      this._totalRowCountErhID = null;
      this._fullDataLoaded = true;
      this._sortState = { column: null, direction: 'asc' };  // Sortierung für neue Erhebung zurücksetzen
      // Bug 28 Fix: Sidebar-Icon-Badges sofort aktualisieren — der echte
      // Render-Pass macht das später nochmal, aber so vermeidet man einen
      // kurzzeitigen "leeren Badge"-Zustand zwischen Klick und render-Ende.
      this._updateOverviewBtnBadge?.();

      const loadStart = Date.now();
      if (this._loadSecTimer) this._clearInterval(this._loadSecTimer);
      this._loadSecTimer = this._setInterval(() => {
        if (!this._fullDataLoaded) {
          this._clearInterval(this._loadSecTimer);
          this._loadSecTimer = null;
          return;
        }
        const secs = Math.floor((Date.now() - loadStart) / 1000);
        this._updateLoaderPhase(1, `Erhebungsdaten werden geladen… (${secs}s)`);
      }, 1000);

      // Index invalidieren, damit render() frisch aufbaut
      this._erhebungIndex = null;
      const switched = this._switchToErhebungFilter(erhID, jahr, nummer);

      if (switched) {
        if (!this._renderInProgress && this._fullDataLoaded) {
          this._scheduleDataPoll();
        }
      } else {
        // Fallback: DataSource-API nicht verfügbar oder Filter konnte nicht entfernt werden
        console.warn('[PLZ-Widget] _switchToErhebungFilter returned false — Fallback auf Index-Lookup. ACHTUNG: BW-Filter evtl. noch aktiv!');
        this._fullDataLoaded = false;

        const doRender = async () => {
          try {
            this._updateLoaderPhase(1, 'Erhebungsdaten werden geladen…');
            const [rawData] = await Promise.all([
              this.queryErhebungFromBW(erhID, jahr, nummer),
              this.loadGeoJson(DEFAULT_LAND),
            ]);
            this.filteredData = rawData;
            await this._ensureLandsForData(rawData);

            this._updateLoaderPhase(2, 'Karte wird vorbereitet…');
            this.prepareMapData(rawData);

            this._updateLoaderPhase(3, 'Niederlassungen werden gesetzt…');
            this.allNLs = [...Object.keys(this.Niederlassung), ...(this.extraNLs?.map(e => e.nl) ?? [])];
            this._selectedNLs = new Set(this.allNLs);
            this._nlSelectionInitialized = false;
            this.activeCategories = new Set(CATEGORIES);
            this._shadowRoot.querySelectorAll('.category-toggle').forEach(t => t.classList.add('active'));
            // Bug 2 Fix: prepareErhebungsInfo VOR createAllMarkers — damit
            // _isNLInvalid beim ersten Icon-Render korrekte Werte liefert.
            this.prepareErhebungsInfo();
            this.createAllMarkers();

            this._updateLoaderPhase(4, 'Kennwerte werden berechnet…');
            const radius = Number(this.$('radius-slider')?.value ?? 40);
            this._buildDistanceCache();
            // Bug-Fix B23: applyRadiusFilter ruft intern bereits
            // prepareUmsatzPLZWerte, computeWKKennwerte, computeStreuverlust auf.
            // Doppelaufruf entfernt — spart bei großen Erhebungen 2× O(n).
            this.applyRadiusFilter(radius);

            this.updateGeoLayer();
            this.renderDataTable(this.filteredKennwerte);
            this.zoomToFilteredPLZ();

            requestAnimationFrame(() => {
              this.prepareErhebungsInfo();
              if (this._sidebarView === 'overview') {
                this.renderErhebungsInfoTable();
              } else if (this._sidebarView === 'analysis') {
                this._renderAnalysisView();
              }
              this._updateOverviewBtnBadge();
              this.$('map-interaction-block')?.classList.add('hidden');
              this.showOverviewPopup();
              this.updateCompetitorMarkers();
              // Nach neuem Filter Labels aktualisieren (Daten-Priorität neu)
              this._scheduleLabelUpdate();
            });
          } finally {
            this._hideCinematicLoader();
          }
        };

        if (this._fullIndexReady) {
          doRender();
        } else {
          const waitStart = Date.now();
          const waitId = this._setInterval(() => {
            if (this._fullIndexReady || Date.now() - waitStart > 3000) {
              this._clearInterval(waitId);
              doRender();
            }
          }, 50);
        }
      }
    }

    // ── Hauptrender-Pipeline (Phase 2, nach Filter-Wechsel) ────────────
    async render() {
      if (!this.map) return;
      if (!this._myDataSource || this._myDataSource.state !== 'success') {
        if (!this._dataPollTimer) {
          this._updateLoaderPhase(1, 'Warte auf Daten…');
          this._scheduleDataPoll();
        }
        return;
      }
      if (!this._activeFilter) {
        console.warn('[PLZ-Widget] render() ohne _activeFilter – Bootstrap-Fallback');
        this._bootstrapFromPLZ00000(this._myDataSource.data);
        return;
      }

      const { erhID, jahr, nummer } = this._activeFilter;
      const rawData = this._myDataSource.data;
      // Token-Snapshot: wenn _resetToHome während render() klickt wird, erhöht es
      // _renderToken. Wir prüfen nach jedem yieldFrame, ob unser Snapshot noch gültig ist.
      const myToken = this._renderToken || 0;
      const isStale = () => (this._renderToken || 0) !== myToken || !this._activeFilter;
      const yieldFrame = () => new Promise(r => requestAnimationFrame(r));
      const totalRows = rawData.length;
      const progress = (phase, pct, label, rows) => {
        this._updateLoaderPhase(phase, label);
        this._updateDataLoadProgress(rows ?? totalRows, totalRows, pct);
      };

      console.group(`[PLZ-Widget] render() – ${erhID}|${jahr}|${nummer}`);
      console.info(`Rows vom BW: ${rawData.length.toLocaleString('de-DE')}`);

      // Sekundenanzeiger stoppen
      if (this._loadSecTimer) { this._clearInterval(this._loadSecTimer); this._loadSecTimer = null; }

      try {
        progress(1, 5, 'Index wird aufgebaut…', 0);
        await yieldFrame();
        if (isStale()) { console.info('[PLZ-Widget] render() abgebrochen (stale)'); console.groupEnd(); return; }

        // Phase-1: Index baut mit ALLEN aktiven Erhebungen — sonst gehen
        // Nachbar-NL-Umsätze der Partner-GFs verloren (Punkt 2-Bug).
        const activeIDs = (this._activeErhebungen?.length || 0) > 0
          ? this._activeErhebungen.map(e => e.erhID)
          : [erhID];
        this._buildErhebungIndex(activeIDs);
        this._erhData = this._cachedBootstrapStruktur ?? this.buildErhebungsStruktur(rawData);
        this.setupFilterDropdowns();
        this.restoreDropdownSelections();

        // Phase-1: filteredData enthält die Rows aller aktiv-kombinierten
        // Erhebungen (Multi-GF-Modus). Bei Single-Erhebung identisch zu
        // _getErhebungRows der Basis-Erhebung.
        const filteredData = this._getAllActiveRows();
        this.filteredData = filteredData;
        console.info(`Index: ${filteredData.length} Rows für ${this._activeErhebungen.length} aktive Erhebung(en)`);

        progress(2, 25, 'Karte wird vorbereitet…', filteredData.length);
        await yieldFrame();
        if (isStale()) { console.info('[PLZ-Widget] render() abgebrochen (stale)'); console.groupEnd(); return; }
        await this.loadGeoJson(DEFAULT_LAND);
        await this._ensureLandsForData(filteredData);
        this.prepareMapData(filteredData);

        progress(3, 50, 'Standorte werden gesetzt…', filteredData.length);
        await yieldFrame();
        if (isStale()) { console.info('[PLZ-Widget] render() abgebrochen (stale)'); console.groupEnd(); return; }
        this.allNLs = [...Object.keys(this.Niederlassung), ...(this.extraNLs?.map(e => e.nl) ?? [])];
        this._selectedNLs = new Set(this.allNLs);
        this._nlSelectionInitialized = false;
        this.activeCategories = new Set(CATEGORIES);
        this._shadowRoot.querySelectorAll('.category-toggle').forEach(t => t.classList.add('active'));
        // Bug 2 Fix: prepareErhebungsInfo VOR createAllMarkers
        this.prepareErhebungsInfo();
        this.createAllMarkers();

        progress(4, 70, 'Kennwerte werden berechnet…', filteredData.length);
        await yieldFrame();
        if (isStale()) { console.info('[PLZ-Widget] render() abgebrochen (stale)'); console.groupEnd(); return; }
        const radius = Number(this.$('radius-slider')?.value ?? 40);
        this._buildDistanceCache();
        // Bug-Fix B23: applyRadiusFilter ruft intern bereits
        // prepareUmsatzPLZWerte, computeWKKennwerte, computeStreuverlust auf.
        this.applyRadiusFilter(radius);

        progress(4, 88, 'Karte wird gerendert…', filteredData.length);
        await yieldFrame();
        if (isStale()) { console.info('[PLZ-Widget] render() abgebrochen (stale)'); console.groupEnd(); return; }
        this.updateGeoLayer();
        this.renderDataTable(this.filteredKennwerte);
        this.zoomToFilteredPLZ();

        progress(4, 100, 'Fertig!', filteredData.length);
        const e2e = this._filterSwitchTime
          ? ((Date.now() - this._filterSwitchTime) / 1000).toFixed(1)
          : '–';
        console.info(`E2E ab Filter-Switch: ${e2e}s | ${filteredData.length.toLocaleString('de-DE')} Rows`);
        console.groupEnd();

        requestAnimationFrame(() => {
          if (isStale()) return;   // Home wurde inzwischen geklickt
          this.prepareErhebungsInfo();
          // Phase 2: View-spezifisch live-aktualisieren nach BW-Reload.
          // 'overview' = NL-Tabelle, 'analysis' = Partner-Picker mit Cross-GF.
          if (this._sidebarView === 'overview') {
            this.renderErhebungsInfoTable();
          } else if (this._sidebarView === 'analysis') {
            this._renderAnalysisView();
          }
          // Badge im Erhebungsübersicht-Button aktualisieren (zeigt
          // GF-Count im Multi-Modus + Hinweis bei verfügbaren Partnern).
          this._updateOverviewBtnBadge();
          this.$('map-interaction-block')?.classList.add('hidden');
          this.showOverviewPopup();
          this.updateCompetitorMarkers();
          // Label-Update: jetzt haben wir Daten für Priorisierung
          this._scheduleLabelUpdate();
        });
      } finally {
        this._hideCinematicLoader();
        this.hideSpinner();
      }
    }

    // ── Erweiterte Analyse View rendern ────────────────────────────────
    // Sektion 1: Weitere GF-Bereiche (Partner-Picker)
    // Sektion 2: Vergleich (Phase 2, Platzhalter)
    _renderAnalysisView() {
      const container = this.$('sidebar-view-analysis');
      if (!container) return;
      // Bug 12 Fix: Open-State der Akkordeon-Sektionen über Re-Renders erhalten.
      // Default beim allerersten Aufruf: Sektion 1 (Partner) offen, Sektion 2
      // (Vergleich) geschlossen. Diese Init-Werte werden danach durch
      // User-Toggles überschrieben und bleiben gespeichert.
      this._analysisOpenState ||= { partner: true, compare: false };
      const openState = this._analysisOpenState;

      // Vor Re-Render aktuellen Zustand aus DOM lesen (falls vorhanden)
      const oldPartner = container.querySelector('.analysis-section.partner-section');
      const oldCompare = container.querySelector('.analysis-section.compare-section');
      if (oldPartner) openState.partner = oldPartner.classList.contains('open');
      if (oldCompare) openState.compare = oldCompare.classList.contains('open');

      container.innerHTML = '';

      const inner = document.createElement('div');
      inner.className = 'analysis-content';

      // ── Sektion 1: Weitere GF-Bereiche ─────────────────────────────
      const partnerSection = document.createElement('div');
      partnerSection.className = 'analysis-section partner-section' + (openState.partner ? ' open' : '');
      partnerSection.innerHTML = `
        <div class="analysis-section-header">
          <span class="analysis-section-icon">🔀</span>
          <span class="analysis-section-title">Weitere GF-Bereiche</span>
          <span class="analysis-section-chevron">▾</span>
        </div>
        <div class="analysis-section-body" id="analysis-partner-body"></div>`;
      inner.appendChild(partnerSection);
      // Accordion-Toggle für Sektion
      const partnerHeader = partnerSection.querySelector('.analysis-section-header');
      this._on(partnerHeader, 'click', () => {
        partnerSection.classList.toggle('open');
        openState.partner = partnerSection.classList.contains('open');
      });

      // Partner-Picker-Inhalte einfügen
      const partnerBody = partnerSection.querySelector('#analysis-partner-body');
      if (this._activeErhebungen?.length > 0) {
        const picker = this._buildPartnerErhebungPicker();
        // Im neuen View immer aufgeklappt — Wrapper-Toggle macht das Accordion
        picker.classList.remove('collapsed');
        // Bug 8 Fix: Picker hat einen eigenen klickbaren Header mit eigenem
        // Collapse. Im Analyse-View ist der Picker schon in einer Accordion-
        // Sektion — Doppel-Toggle wäre verwirrend. Header daher ausblenden,
        // die äußere Sektion übernimmt das Ein-/Ausklappen.
        picker.classList.add('embedded-in-section');
        partnerBody.appendChild(picker);
      } else {
        partnerBody.innerHTML = `<div class="analysis-empty">Erst eine Erhebung laden, dann sind weitere GF-Bereiche dazuschaltbar.</div>`;
      }

      // ── Sektion 2: Vergleich (Phase 2 – Platzhalter) ────────────────
      const compareSection = document.createElement('div');
      compareSection.className = 'analysis-section compare-section' + (openState.compare ? ' open' : '');
      compareSection.innerHTML = `
        <div class="analysis-section-header">
          <span class="analysis-section-icon">📈</span>
          <span class="analysis-section-title">Vergleich</span>
          <span class="analysis-section-status">In Entwicklung</span>
          <span class="analysis-section-chevron">▾</span>
        </div>
        <div class="analysis-section-body">
          <div class="analysis-empty">
            Hier kommt der <strong>Vergleichs-Modus</strong> hin: zwei oder mehr
            Erhebungen mit unterschiedlichem Jahr/Nummer/GF-Bereich nebeneinander
            mit Diff-Heatmap auf der Karte und A/B/Δ-Spalten in der Tabelle.
            <br><br>
            Geplante Funktionen:
            <ul style="margin-top:6px;padding-left:18px;">
              <li>Erhebung A vs. Erhebung B auswählen</li>
              <li>Diff-Heatmap (rot = verschlechtert, grün = verbessert)</li>
              <li>Bestreuungs-Differential (4-Farben-Karte)</li>
              <li>Tabelle mit A/B/Δ-Spalten</li>
            </ul>
          </div>
        </div>`;
      inner.appendChild(compareSection);
      const cmpHeader = compareSection.querySelector('.analysis-section-header');
      this._on(cmpHeader, 'click', () => {
        compareSection.classList.toggle('open');
        openState.compare = compareSection.classList.contains('open');
      });

      container.appendChild(inner);
    }

    // ── Anleitung View rendern ─────────────────────────────────────────
    // 4 Sub-Akkordeons: Schnellstart / Streuplan & Streupartner /
    // Rechnungslogik / Funktionen im Detail
    _renderDocsView() {
      const container = this.$('sidebar-view-docs');
      if (!container) return;
      container.innerHTML = '';

      const inner = document.createElement('div');
      inner.className = 'docs-content-wrap';

      // ── Schlichter Header ─────────────────────────────────────────────
      const hero = document.createElement('div');
      hero.className = 'docs-hero';
      hero.innerHTML = `<div class="docs-hero-title" style="font-size:1.05rem;padding:8px 0 4px">PLZ-Analyse</div>`;
      inner.appendChild(hero);

      // ── Sub-Akkordeons: alle standardmäßig eingeklappt ────────────────
      const quickstart = this._buildDocsAccordion(
        '⚡', 'Schnellstart', false,
        `<ol style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px;">
           <li>Im Filter-Bereich <strong>GF-Bereich</strong> wählen.</li>
           <li><strong>Jahr</strong> auswählen → <strong>Erhebungsnummer</strong> auswählen.</li>
           <li><strong>Anzeigen</strong>-Button klicken.</li>
           <li>Wahlweise <strong>📋 PLZ-Tabelle</strong>, <strong>📊 Erhebungsübersicht</strong> oder <strong>🔬 Erweiterte Analyse</strong> über die Sidebar-Icons öffnen.</li>
           <li>Auf Karte oder Tabelle klicken für PLZ-Details im Side-Popup.</li>
         </ol>
         <div class="docs-key-block" style="margin-top:8px;">
           <strong>💡 Tipp:</strong> Erneuter Klick auf ein aktives Sidebar-Icon schaltet
           den Inhalt aus → die Karte wird breiter. Sehr nützlich für die Karten-Inspektion.
         </div>`);
      inner.appendChild(quickstart);

      // ── Sub-Akkordeon: Streuplan & Streupartner ────────────────────
      const streuplan = this._buildDocsAccordion(
        '📍', 'Streuplan & Streuverbünde', false,
        `<div id="streuplan-content"><div class="analysis-empty">Daten werden geladen…</div></div>`);
      inner.appendChild(streuplan);

      // ── Sub-Akkordeon: Rechnungslogik ──────────────────────────────
      const rechnung = this._buildDocsAccordion(
        '🧮', 'Rechnungslogik', false, this._buildRechnungslogikHtml());
      inner.appendChild(rechnung);

      // ── Sub-Akkordeon: Funktionen im Detail ────────────────────────
      const detail = this._buildDocsAccordion(
        '📖', 'Funktionen im Detail', false, this._buildFunktionenDetailHtml());
      inner.appendChild(detail);

      container.appendChild(inner);

      // Streuplan-Daten lazy laden (leise scheitern bei Fehler)
      this._loadAndRenderStreuplan();
    }

    // Helper: ein Sub-Akkordeon-Element bauen
    _buildDocsAccordion(icon, title, openByDefault, contentHtml) {
      const section = document.createElement('div');
      section.className = 'docs-accordion' + (openByDefault ? ' open' : '');
      section.innerHTML = `
        <div class="docs-accordion-header">
          <span class="docs-accordion-icon">${icon}</span>
          <span class="docs-accordion-title">${escapeHtml(title)}</span>
          <span class="docs-accordion-chevron">▾</span>
        </div>
        <div class="docs-accordion-body">
          <div class="docs-accordion-inner">${contentHtml}</div>
        </div>`;
      const header = section.querySelector('.docs-accordion-header');
      this._on(header, 'click', () => section.classList.toggle('open'));
      return section;
    }

    _buildRechnungslogikHtml() {
      return `
        <h4>Hochrechnung</h4>
        <p>
          Aus der laufenden Kassenbon-Erfassung wird der Gesamt-Brutto-Umsatz einer PLZ
          hochgerechnet. Grundlage ist das Verhältnis zwischen erfasstem und gültig
          zugeordnetem Umsatz über alle Niederlassungen der Erhebung. Das Ergebnis
          erscheint in der Tabelle als <em>Umsatz (Hochger.)</em>. Ohne Hochrechnung
          würden nur die erfasste Stichprobe gezeigt, nicht der echte Markt.
        </p>

        <h4>Werbekosten-Berechnung</h4>
        <p>
          Die Werbekosten eines Streuverbundes werden anteilig auf die einzelnen
          Niederlassungen verteilt – je nach deren Umsatzanteil am Gesamtumsatz der
          Streueinheit. Innerhalb einer Niederlassung werden die Kosten dann weiter
          auf die einzelnen Postleitzahlen aufgeteilt – proportional zur Anzahl der
          Haushalte je PLZ im Verhältnis zu allen aktiv bestreuten Haushalten der
          Niederlassung.
        </p>
        <div class="docs-key-block">
          <strong>Wichtig:</strong> Teilen sich Niederlassungen eine Auflage und
          PLZ-Gebiete, so werden zur Darstellung die Werbekosten einer einzelnen
          Niederlassung zugeordnet. Diese finden Sie unter
          <em>Streuplan &amp; Streupartner</em>.
        </div>

        <h4>Werbekosten-Anteil (WK %)</h4>
        <p>
          WK % = Werbekosten / Gesamtumsatz × 100. Der Nenner ist der
          <strong>Gesamtumsatz aller Niederlassungen in dieser PLZ</strong> — inklusive
          Nachbar-Niederlassungen, die nicht selbst beworben haben. So zeigt der WK %
          die echte Werbe-Effizienz im Markt: Wenn Nachbar-Niederlassungen vom
          Marketing der werbenden Niederlassung profitieren, sinkt der WK % — das
          ist gewollt.
        </p>
        <div class="docs-key-block">
          <strong>Beispiel:</strong> NL Köln macht 60.000 € Umsatz und 800 € Werbekosten,
          Nachbar-NL Bonn macht 25.000 € Umsatz ohne Werbung in derselben PLZ.<br>
          WK % = 800 / (60.000 + 25.000) = <strong>0,94 %</strong>.
        </div>

        <h4>Potentielle Werbekosten</h4>
        <p>
          Für nicht-bestreute PLZs werden potentielle Werbekosten geschätzt — also
          was die Bestreuung kosten würde, wenn man sie zusätzlich bewerben würde.
          Der Wert wird als Durchschnitt über alle Niederlassungen einer PLZ berechnet
          und in der Karte als Heatmap im WK-Modus dargestellt (blau = nicht bestreut).
        </p>

        <h4>Streuverlust</h4>
        <p>
          Umsatz, der <strong>außerhalb</strong> des aktuellen Radius angefallen ist —
          also Kunden die außerhalb des Einzugsgebiets wohnen aber trotzdem kaufen.
          Streuverlust % = Umsatz außerhalb Radius / Gesamtumsatz × 100.
        </p>

        <h4>Werbeanteil</h4>
        <p>
          Werbeanteil = Werbeumsatz / Gesamtumsatz × 100. Zeigt welcher Anteil des
          Umsatzes direkt auf die beworbenen Kunden zurückgeht. Der Mitkauf-Umsatz
          fließt nur in die absolute Anzeige ein, nicht in den Werbeanteil.
        </p>

        <h4>Stornos und negative Umsätze</h4>
        <p>
          Storno-Buchungen fließen mit negativem Vorzeichen korrekt in die Aggregation
          ein. Wenn der Saldo einer PLZ oder Kategorie am Ende negativ wird, wird er
          für die Anzeige auf 0 gesetzt — es erscheinen keine negativen Beträge.
        </p>`;
    }

    _buildFunktionenDetailHtml() {
      return `
        <h4>Filter-Bereich (oben links)</h4>
        <p>
          ErhebungsID → Jahr → Erhebungsnummer wählen, dann <strong>Anzeigen</strong>.
          Die Doppelbestreuungs-Bar darunter lädt zusätzlich alle anderen Erhebungen
          mit gleichem Jahr/Nummer, um Cross-Erhebungs-Überschneidungen zu erkennen
          (langsamer, mehr Daten).
        </p>

        <h4>Sidebar (links)</h4>
        <ul>
          <li><strong>📖 Anleitung</strong> — Dieser Bereich.</li>
          <li><strong>📋 PLZ-Tabelle</strong> — sortierbare Tabelle aller PLZs im
            Radius mit WK%, Umsatz und HZ-Status.</li>
          <li><strong>📊 Erhebungsübersicht</strong> — NL-Tabelle mit Erfassungs-
            Kennzahlen. Klick auf eine NL filtert Karte und Berechnungen.</li>
          <li><strong>🔬 Erweiterte Analyse</strong> — Multi-GF-Aggregation und
            (bald) Vergleichs-Modus.</li>
        </ul>
        <p>
          Klick auf ein aktives Icon deaktiviert es → der Hauptinhalt verschwindet,
          die Karte wird breiter.
        </p>

        <h4>Analyse-Modi (Karten-Panel rechts unten)</h4>
        <ul>
          <li><strong>📊 WK</strong> — Heatmap nach Werbekosten-Anteil. Grün =
            HZ-bestreut, Blau = nicht bestreut (potentielle WK), Grau = keine Daten.</li>
          <li><strong>💶 Umsatz</strong> — Heatmap nach Umsatzhöhe. Im Panel
            schaltbar: Umsatz/Werbeumsatz, Absolut/pro HH/Werbeanteil,
            Kategorie-Toggles (Stationär/Pluscard/R&amp;A/KUBE OS).</li>
        </ul>

        <h4>Karten-Tools</h4>
        <ul>
          <li><strong>🔴 Radius-Slider</strong> (oben Mitte): 10–100 km
            Einzugsgebiet um aktive NLs.</li>
          <li><strong>🗺️ Kartenstil</strong> (rechts unten): OpenStreetMap-
            Hintergrund ein/aus.</li>
          <li><strong>☰ Legende</strong> (links unten): Farbskala für die
            aktuelle Heatmap.</li>
          <li><strong>Mitbewerber-Checkbox</strong>: zeigt bekannte Standorte
            (Hornbach/OBI/Globus/Hellweg/Toom/Hagebau) als 🔨-Marker.</li>
        </ul>

        <h4>Tipps für die Praxis</h4>
        <ul>
          <li>Bei vielen NLs in einer Erhebung Radius auf 20–30 km reduzieren —
            sonst überlappen sich Einzugsgebiete stark.</li>
          <li>Im Umsatz-Modus / Werbeanteil zeigt sich die Effizienz einer
            Kampagne pro PLZ.</li>
          <li>Beim Wechsel zwischen Erhebungen bleiben Radius- und Kategorie-
            Einstellungen erhalten, Modus wird auf WK zurückgesetzt.</li>
        </ul>

        <h4>Bei Problemen</h4>
        <p>
          Erhebung neu auswählen oder Browser-Tab neu laden. Konsolen-Log mit
          Präfix <code>[PLZ-Widget]</code> zeigt Bootstrap- und Lade-Status.
        </p>`;
    }

    // ── Streuplan-JSON laden und in den Anleitung-View rendern ────────
    // Leise scheitern bei Fehler (laut User-Vorgabe).
    async _loadAndRenderStreuplan() {
      const target = this.$('streuplan-content');
      if (!target) return;
      const url = 'https://raw.githubusercontent.com/Benne2000/PLZAnalyse/main/streuplan.json';
      try {
        const resp = await fetch(url, { cache: 'no-cache' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        target.innerHTML = this._renderStreuplanHtml(data);
      } catch (err) {
        console.warn('[PLZ-Widget] Streuplan-Datei nicht verfügbar:', err.message);
        // Fallback auf eingebettete Daten (analog Mitbewerber-Fallback)
        target.innerHTML = this._renderStreuplanHtml(STREUPLAN_FALLBACK);
      }
    }

    _renderStreuplanHtml(data) {
      const termine = Array.isArray(data?.termine) ? data.termine : [];
      const partner = Array.isArray(data?.partner) ? data.partner : [];
      let html = '';

      if (termine.length > 0) {
        html += `<h4>Streutermine</h4>`;
        const sorted = [...termine].sort((a, b) => (a.datum || '').localeCompare(b.datum || ''));
        const today = new Date().toISOString().slice(0, 10);
        html += `<ul class="streuplan-termine-list">`;
        for (const t of sorted) {
          const datum = t.datum ? this._fmtStreudatum(t.datum) : '–';
          const done = t.datum && t.datum <= today;
          const kw = t.kw ? `<span class="streu-kw${done ? ' done' : ''}">KW ${t.kw}</span>` : '';
          const beschr = t.beschreibung ? escapeHtml(t.beschreibung) : '';
          html += `<li${done ? ' class="done"' : ''}>
            <span class="streu-datum">${datum}</span>
            ${kw}
            <span class="streu-beschr">${beschr}</span>
          </li>`;
        }
        html += `</ul>`;
      } else {
        html += `<div class="analysis-empty">Keine Streutermine erfasst.</div>`;
      }

      if (partner.length > 0) {
        html += `<h4 style="margin-top:14px">Streupartner-Zusammenschlüsse</h4>`;
        html += `<p style="margin:4px 0 8px;font-size:0.74rem;color:var(--gray-600);">
          Diese NL-Gruppen bestreuen gemeinsam PLZs. In der Auswertung werden die
          Umsätze der Haupt-NL zugeordnet.
        </p>`;
        html += `<table class="streuplan-partner-table">
          <thead><tr><th>Haupt-NL</th><th>Partner-NLs</th></tr></thead>
          <tbody>`;
        for (const p of partner) {
          // partner_nls kann Array von Strings ODER Array von {id, name}-Objekten sein
          const partnerNLs = Array.isArray(p.partner_nls)
            ? p.partner_nls.map(x => typeof x === 'object' ? `${x.id} (${x.name || ''})`.trim() : x).join(', ')
            : '';
          html += `<tr>
            <td><strong>${escapeHtml(p.haupt_nl_id ? `${p.haupt_nl_id} (${p.haupt_nl || '–'})` : (p.haupt_nl || '–'))}</strong></td>
            <td>${escapeHtml(partnerNLs)}</td>
          </tr>`;
        }
        html += `</tbody></table>`;
      } else {
        html += `<div class="analysis-empty" style="margin-top:10px;">Keine Streupartner-Zusammenschlüsse hinterlegt.</div>`;
      }
      return html;
    }

    _fmtStreudatum(iso) {
      // ISO "2025-03-14" → "14.03.2025"
      const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return iso;
      return `${m[3]}.${m[2]}.${m[1]}`;
    }

    // ── Sidebar-View-Management (Phase 2) ──────────────────────────────
    // Steuert den Hauptinhalt der linken Spalte. Genau ein View muss immer
    // aktiv sein, solange die linke Spalte überhaupt sichtbar ist. Klick auf
    // das "👁 Ausblenden"-Tab blendet die ganze Spalte aus (orthogonal zur
    // View-Auswahl) — über _setLeftPaneVisible().
    //
    // Views:
    //   'docs'     = Anleitung (mit Sub-Akkordeons)
    //   'plz'      = PLZ-Tabelle
    //   'overview' = Erhebungsübersicht (NL-Tabelle, GF-gruppiert)
    //   'analysis' = Erweiterte Analyse (Partner-Picker, Vergleich-Platzhalter)
    _setupSidebarHandlers() {
      // Tab-Bar-Click: View wechseln (oder ausblenden-Aktion).
      const rail = this.$('sidebar-rail');
      if (rail) {
        delete rail.dataset.bound;
        this._on(rail, 'click', (ev) => {
          const btn = ev.target.closest('.sidebar-icon');
          if (!btn || btn.disabled) return;
          // Spezial-Aktion: linke Spalte komplett ausblenden
          if (btn.dataset.action === 'hide-pane') {
            this._setLeftPaneVisible(false);
            return;
          }
          const view = btn.dataset.view;
          if (!view) return;
          // Genau ein View muss aktiv sein: Klick auf aktives Tab macht
          // nichts. Wechsel nur bei anderem View.
          if (this._sidebarView === view) return;
          this._switchSidebarView(view);
        });
        rail.dataset.bound = '1';
      }

      // Reopen-Button auf der Karte → blendet die linke Spalte wieder ein
      const reopenBtn = this.$('left-pane-reopen-btn');
      if (reopenBtn) {
        delete reopenBtn.dataset.bound;
        this._on(reopenBtn, 'click', () => this._setLeftPaneVisible(true));
        reopenBtn.dataset.bound = '1';
      }

      // Filter-Maske ein-/ausklappen-Button (rechts neben "Anzeigen")
      const fieldsToggle = this.$('filter-fields-toggle');
      if (fieldsToggle) {
        delete fieldsToggle.dataset.bound;
        this._on(fieldsToggle, 'click', () => this._setFilterFieldsCollapsed(true));
        fieldsToggle.dataset.bound = '1';
      }

      // Info-Bar "▾" Button → Filter wieder einblenden
      const infoExpand = this.$('filter-info-expand');
      if (infoExpand) {
        delete infoExpand.dataset.bound;
        this._on(infoExpand, 'click', () => this._setFilterFieldsCollapsed(false));
        infoExpand.dataset.bound = '1';
      }
    }

    _switchSidebarView(key) {
      // Tab "ausblenden" ist kein View → blockiere falsche Werte
      if (!['docs', 'plz', 'overview', 'analysis'].includes(key)) return;
      // Early-Return wenn View schon aktiv — sonst läuft die Crossfade-
      // Animation unnötig durch (View kurz auf opacity 0 dann wieder 1)
      // und im 'overview'/'analysis'-Fall würden unnötige Re-Renders laufen.
      if (this._sidebarView === key) return;
      this._sidebarView = key;
      const views = ['docs', 'plz', 'overview', 'analysis'];

      // Views ein/ausblenden
      for (const k of views) {
        const el = this.$('sidebar-view-' + k);
        if (el) el.classList.toggle('active', k === key);
      }
      // Tab-Bar-Icons: active-Klasse setzen (nur auf data-view-Tabs,
      // nicht auf das hide-pane-Tab)
      const icons = this._shadowRoot.querySelectorAll('.sidebar-icon');
      for (const icon of icons) {
        if (icon.dataset.action === 'hide-pane') continue;
        icon.classList.toggle('active', icon.dataset.view === key);
      }

      // Beim Wechsel zu einem View: ggf. Inhalt neu rendern
      if (key === 'overview') {
        this.prepareErhebungsInfo?.();
        this.renderErhebungsInfoTable?.();
      } else if (key === 'analysis') {
        this._renderAnalysisView?.();
      } else if (key === 'docs') {
        if (!this._docsViewInitialized) {
          this._renderDocsView?.();
          this._docsViewInitialized = true;
        }
      }

      // Leaflet bemerkt Container-Größen-Änderungen nicht automatisch.
      // Nach dem CSS-Transition-Ende (~320ms) invalidateSize aufrufen.
      if (this.map) {
        this._setTimeout(() => {
          try { this.map.invalidateSize({ animate: false }); } catch (e) { /* swallow */ }
        }, 340);
      }
    }

    // ── Linke Spalte ein/ausblenden (orthogonal zur View-Auswahl) ───────
    // Wenn ausgeblendet: Filter-Container schrumpft auf 0, Karte Vollbild.
    // Reopen via Map-Overlay-Button #left-pane-reopen-btn.
    _setLeftPaneVisible(visible) {
      this._leftPaneVisible = !!visible;
      const filter = this._shadowRoot.querySelector('.filter-container');
      const mapContainer = this._shadowRoot.querySelector('.map-container');
      if (filter) filter.classList.toggle('pane-collapsed', !visible);
      if (mapContainer) mapContainer.classList.toggle('left-pane-hidden', !visible);
      // Leaflet invalidieren nach Transition
      if (this.map) {
        this._setTimeout(() => {
          try { this.map.invalidateSize({ animate: false }); } catch (e) { /* swallow */ }
        }, 340);
      }
    }

    // ── Filter-Maske ein/ausklappen (Sub-State innerhalb der linken Spalte)
    // Eingeklappt: Filter-Felder verschwinden, Info-Bar oben erscheint
    // mit kompakter Anzeige der aktuellen Erhebungs-Auswahl.
    _setFilterFieldsCollapsed(collapsed) {
      // Nur sinnvoll wenn eine Erhebung geladen ist — sonst gibt's nichts
      // zu zeigen im Info-Bar.
      if (collapsed && !this._activeFilter) return;
      this._filterFieldsCollapsed = !!collapsed;
      const filter = this._shadowRoot.querySelector('.filter-container');
      const infoBar = this.$('filter-info-bar');
      if (filter) filter.classList.toggle('fields-collapsed', !!collapsed);
      if (infoBar) {
        if (collapsed) {
          this._updateFilterInfoBar();
          infoBar.classList.remove('hidden');
        } else {
          infoBar.classList.add('hidden');
        }
      }
    }

    // Info-Bar-Inhalt aus _activeFilter und _activeErhebungen aufbauen.
    // Zeigt dasselbe Format wie der Filter (GF-Bereich XYZ · Jahr · 1. 20.04–03.05),
    // damit der User die Auswahl 1:1 wiedererkennt.
    _updateFilterInfoBar() {
      const textEl  = this.$('filter-info-text');
      const badgeEl = this.$('filter-info-badge');
      if (!textEl) return;
      const f = this._activeFilter;
      if (!f) { textEl.textContent = '—'; if (badgeEl) badgeEl.textContent = ''; return; }
      // Identisches Format wie im Filter-Dropdown:
      // - ErhID via _fmtGF → "GF-Bereich XYZ"
      // - Nummer via fmtNummer → "1. 20.04–03.05" (siehe Modul-Top)
      const gfLabel = this._fmtGF ? this._fmtGF(f.erhID) : f.erhID;
      const nrLabel = (typeof fmtNummer === 'function') ? fmtNummer(f.nummer) : f.nummer;
      textEl.textContent = `${gfLabel} · ${f.jahr} · ${nrLabel}`;
      // Multi-GF-Badge: bei aktiven Partnern "+N"
      const count = this._activeErhebungen?.length || 0;
      if (badgeEl) {
        badgeEl.textContent = count >= 2 ? `+${count - 1}` : '';
      }
    }

    // Sidebar-Icons aktivieren/deaktivieren (z.B. nach Erhebungs-Load)
    _setSidebarEnabled(enabled) {
      const icons = this._shadowRoot.querySelectorAll('.sidebar-icon');
      // Welche Tabs gerade von disabled → enabled wechseln? Diese kriegen
      // einen Pulse-Hint, damit der User sieht "hier kannst du jetzt hin".
      const newlyEnabled = [];
      for (const icon of icons) {
        // Anleitung ist immer verfügbar; der "Ausblenden"-Button auch.
        if (icon.dataset.view === 'docs')           { icon.disabled = false; continue; }
        if (icon.dataset.action === 'hide-pane')    { icon.disabled = false; continue; }
        const wasDisabled = icon.disabled;
        icon.disabled = !enabled;
        if (wasDisabled && enabled) newlyEnabled.push(icon);
      }
      // Pulse-Hint anwenden + nach Animation-Ende wieder entfernen
      if (newlyEnabled.length) {
        for (const icon of newlyEnabled) {
          icon.classList.remove('just-enabled');   // reset falls schon dran
          // Reflow erzwingen, damit re-add die Animation neu startet
          void icon.offsetWidth;
          icon.classList.add('just-enabled');
        }
        this._setTimeout(() => {
          for (const icon of newlyEnabled) icon.classList.remove('just-enabled');
        }, 3300);   // 2 × 1.6s + Buffer
      }
      // Defensive: wenn die Sidebar deaktiviert wird und der gerade aktive
      // View ist einer der nun-disabled, erzwinge Wechsel auf 'docs'.
      if (!enabled && this._sidebarView && this._sidebarView !== 'docs') {
        this._switchSidebarView('docs');
      }
      // Filter-Maske-Toggle-Button nur aktivieren wenn eine Erhebung läuft —
      // im Hauptmenü gibt's nichts zu verbergen.
      const fieldsToggle = this.$('filter-fields-toggle');
      if (fieldsToggle) fieldsToggle.classList.toggle('disabled', !enabled);
    }

    // ── Home-Reset ─────────────────────────────────────────────────────
    _resetToHome() {
      // Token erhöhen, damit eine eventuell laufende render()-Pipeline merkt,
      // dass sie abgebrochen wurde und keine späten DOM-Updates mehr macht.
      this._renderToken = (this._renderToken || 0) + 1;

      this._activeFilter       = null;
      // Multi-Erhebungs-Reset: Liste der aktiven Erhebungen, Cross-GF-Flag.
      // Rows-Cache bleibt für schnelles Zurück zu vorigen Erhebungen erhalten.
      this._activeErhebungen     = [];
      this._crossGfDoppelAktiv   = false;
      this._pendingPartners      = null;
      this._erhebungAggregatesCache?.clear();
      this.filteredData        = null;
      this.filteredKennwerte   = {};
      this.filteredPLZWerte    = {};
      this._rawPLZCache        = {};
      this._crossErhebungPLZ   = {};
      this.streuverlust        = null;
      this.plzImRadius         = new Set();
      this._activePopupPLZ     = null;
      this._activePopupType    = null;
      this._highlightedPLZ     = null;
      this._nlSelectionInitialized = false;

      this.closeAllPopups();
      // Phase 2: Sidebar zurück auf Anleitung, andere Views disablen.
      // closeNLTable() ist im neuen Layout nicht mehr nötig (NL-Tabelle ist
      // eigener View, kein Overlay), aber wir rufen sie defensiv mit auf,
      // falls noch alte Klassen hängen.
      this.closeNLTable();
      this._setSidebarEnabled(false);
      this._switchSidebarView('docs');
      // Pane-State: Spalte sichtbar und Filter ausgeklappt (sonst wäre der
      // User nach Home-Reset in einem ungewollten kollabierten Zustand).
      this._setLeftPaneVisible(true);
      this._setFilterFieldsCollapsed(false);
      this.$('heatmap-legend')?.classList.add('hidden');
      this.$('map-control-panel')?.classList.remove('panel-large', 'panel-medium');
      // Doppelbestreuungs-Bar im Hauptmenü wieder aufklappen + Default "Ohne"
      this.$('doppel-toggle-bar')?.classList.remove('collapsed');
      // Bug DB6 Fix: Auswahl-State + UI auf Default "Ohne" zurücksetzen,
      // sonst bleibt der Wert vom letzten Erhebungs-Lauf hängen und der
      // nächste Erhebungs-Load würde unbeabsichtigt im falschen Modus starten.
      this._doppelbestreuungAktiv = false;
      this._lastLoadedDoppelMode = null;
      const optAusReset = this.$('doppel-opt-aus');
      const optEinReset = this.$('doppel-opt-ein');
      const currentReset = this.$('doppel-toggle-current');
      if (optAusReset) optAusReset.classList.add('active');
      if (optEinReset) optEinReset.classList.remove('active');
      if (currentReset) currentReset.textContent = 'Ohne';
      // Erhebungsübersicht-Badge zurücksetzen
      this._updateOverviewBtnBadge();
      this.filteredGroup?.clearLayers();
      this.neighbourGroup?.clearLayers();
      this.radiusGroup?.clearLayers();
      this.bestreuungGroup?.clearLayers();
      this.competitorGroup?.clearLayers();
      this._radiusPreviewGroup?.clearLayers();
      this._clearDoppelMarkers();

      if (this._geoLayer) {
        const op = this._plzFillOpacity('empty');
        this._geoLayer.eachLayer(layer => {
          layer.setStyle({ fillColor: '#e9ecef', fillOpacity: op, color: '#ffffff', weight: 0.8 });
        });
      }
      // Click-Handler bleiben gebunden – _handlePolygonClick prüft _activeFilter

      this.activeCategories = new Set(CATEGORIES);
      this._shadowRoot.querySelectorAll('.category-toggle').forEach(t => t.classList.add('active'));
      this.currentMapMode = 'wk'; 
      this.umsatzMainMode = 'gesamt'; this.umsatzDarstellung = 'abs';
      // Bug WA10 Fix: Werbe/Mitgekauft-States sowohl logisch als auch UI-mäßig
      // auf Default zurücksetzen. Im Werbeanteil-Modus waren diese disabled,
      // beim nächsten Erhebungs-Load müssen sie wieder klickbar sein.
      this.useWerbeUmsatz = true;
      this.useZusatzUmsatz = false;
      const chkWerbeReset = this.$('chk-werbeumsatz');
      const chkMitReset   = this.$('chk-mitgekauft');
      if (chkWerbeReset) { chkWerbeReset.checked = true;  chkWerbeReset.disabled = false; }
      if (chkMitReset)   { chkMitReset.checked   = false; chkMitReset.disabled   = false; }
      // Werbeanteil-Button (in der Darstellung-Switch-Leiste) wieder als "disabled" markieren
      // — er ist nur im Werbung-Modus aktiv.
      this._shadowRoot.querySelector('.mode-werbeanteil')?.classList.add('disabled');
      // Werbe-Optionen-Row im Umsatz-Panel verstecken (wird erst im Werbung-Modus sichtbar)
      const werbeRowReset = this.$('werbe-options-row');
      if (werbeRowReset) werbeRowReset.style.display = 'none';
      this.$('btn-wk')?.classList.add('active');
      this.$('btn-umsatz')?.classList.remove('active');
      // iOS-Slider-Position: links (Default)
      this.$('btn-wk')?.closest('.switch-row')?.classList.remove('switch-right');
      this.$('umsatz-panel')?.classList.add('hidden');
      const wkExtra = this.$('wk-extra');
      if (wkExtra?.style) wkExtra.style.display = '';
      this._startPreviewAnimation();
      this.renderDataTableFromEntries([]);
      const box = this.$('streuverlust-box');
      if (box) box.innerHTML = '';
      this.map?.setView([51.2, 12.5], 6);
      this.$('map-interaction-block')?.classList.remove('hidden');

      // Filter zurücksetzen
      this._fullDataLoaded  = false;
      this._bootstrapDone   = false;
      this._fullIndexReady  = false;
      if (this._loadSecTimer) { this._clearInterval(this._loadSecTimer); this._loadSecTimer = null; }

      // Dropdowns zurücksetzen
      for (const id of ['erhebung-select', 'jahr-select', 'nummer-select']) {
        const sel = this.$(id);
        if (!sel) continue;
        sel.innerHTML = '';
        const ph = document.createElement('option');
        ph.textContent = id === 'erhebung-select' ? '– ErhebungsID wählen –'
                       : id === 'jahr-select'     ? '– Jahr wählen –'
                       : '– Nummer wählen –';
        ph.disabled = true; ph.selected = true;
        sel.appendChild(ph);
        if (id !== 'erhebung-select') sel.disabled = true;
      }
      this.$('filter-button')?.classList.remove('ready');

      const ds = this._getDataSource();
      if (ds) {
        try {
          this._removeAllErhebungFilters(ds);
          const knownKey = this._plzFilterKey ? [this._plzFilterKey] : [];
          const keysToTry = [...knownKey, ...PLZ_FILTER_KEYS.filter(k => k !== this._plzFilterKey)];
          for (const key of keysToTry) {
            try { ds.setDimensionFilter(key, ['00000']); this._plzFilterKey = key; break; } catch (e) {}
          }
          console.info('[PLZ-Widget] Home: Filter zurückgesetzt → PLZ=00000');
          // Lock aufheben — Home-Reset soll sofort reagieren
          this._filterSwitchLockUntil = null;
          this._lastRowCountSinceSwitch = undefined;
          this.$('panel-home-btn')?.setAttribute('disabled', '');
          this.$('panel-overview-btn')?.setAttribute('disabled', '');
        } catch (e) {
          console.warn('[PLZ-Widget] Home: Filter-Reset fehlgeschlagen:', e);
        }
      }

      // Bootstrap aus Cache wieder hochfahren
      if (this._cachedBootstrapRows?.length > 0) {
        console.info(`[PLZ-Widget] Home: Bootstrap aus Cache (${this._cachedBootstrapRows.length} Rows)`);
        this._setTimeout(() => {
          this._bootstrapDone = false;
          this._bootstrapFromPLZ00000(this._cachedBootstrapRows);
          this._scheduleLabelUpdate();
        }, 50);
      } else {
        this._homeResetPending = true;
        // Bug-Fix B9: Safety-Timeout — falls Poll-Tick das Flag nie zurücksetzt
        // (Tick läuft nicht, BW antwortet nicht), bleibt sonst _homeResetPending
        // dauerhaft hängen und blockiert spätere Bootstraps.
        if (this._homeResetSafetyTimer) {
          this._clearTimeout(this._homeResetSafetyTimer);
        }
        this._homeResetSafetyTimer = this._setTimeout(() => {
          this._homeResetSafetyTimer = null;
          if (this._homeResetPending) {
            console.warn('[PLZ-Widget] Home-Reset Safety-Timeout — Flag forciert zurückgesetzt');
            this._homeResetPending = false;
          }
        }, 30000);
        if (!this._dataPollTimer) this._scheduleDataPoll();
      }
    }


    // ── SAC DataSource-Setter (Phase 1: Bootstrap, Phase 2: Render) ────
    set myDataSource(dataBinding) {
      this._myDataSource = dataBinding;
      // Caches invalidieren – neue Daten könnten anderes PLZ-Format haben
      this._erhebungIndex = null;
      this._plzNormCache  = null;

      // Allerersten Setter-Aufruf nutzen, um PLZ=00000-Filter zu setzen.
      // Sonst bekommt der Bootstrap die vollen 27k Erhebungs-Rows statt 161 Stammdaten.
      if (!this._plzFilterInitialized) {
        this._plzFilterInitialized = true;
        this._applyPLZ00000Filter();
        if (!this.map) { this._pendingRender = true; return; }
        return; // SAC triggert mit neuem Filter ohnehin neuen Setter-Aufruf
      }

      if (!this.map) { this._pendingRender = true; return; }

      if (!this._myDataSource || this._myDataSource.state !== 'success') {
        this._scheduleDataPoll();
        return;
      }

      // ── Phase 1: Bootstrap (PLZ=00000-Daten) ──
      // Guard: nur wenn KEINE Erhebung aktiv ist. _fullDataLoaded=false allein
      // reicht nicht — render() setzt es auf false auch während eine Erhebung
      // aktiv ist, was sonst fälschlich Bootstrap triggert.
      if (!this._fullDataLoaded && !this._activeFilter) {
        if (!this._bootstrapDone) this._bootstrapFromPLZ00000(this._myDataSource.data);
        return;
      }
      // Wenn Erhebung aktiv aber _fullDataLoaded=false (render läuft oder hat
      // gerade fertig): neuen Poll starten der auf die echten Daten wartet.
      if (!this._fullDataLoaded && this._activeFilter) {
        if (!this._dataPollTimer && !this._renderInProgress) this._scheduleDataPoll();
        return;
      }

      // ── Phase 2: Echte Erhebungsdaten ──
      const rowCount = this._myDataSource?.data?.length ?? 0;
      const e2e = this._filterSwitchTime
        ? ((Date.now() - this._filterSwitchTime) / 1000).toFixed(1) + 's'
        : '–';

      // Lock-Fenster: in den ersten 2s nach Filter-Switch ignoriert der Setter
      // alle Aufrufe. SAC schickt durch das "dirty"-Marking sofort einen
      // Re-Render der noch den alten gecachten Datenstand liefert. Der Poll-
      // Tick hat mehr Kontrolle und verwendet die D4-Detection korrekt.
      if (this._filterSwitchLockUntil && Date.now() < this._filterSwitchLockUntil) {
        const remaining = ((this._filterSwitchLockUntil - Date.now()) / 1000).toFixed(1);
        console.info(`[PLZ-Widget] Setter-Lock (${remaining}s verbleibend, ${rowCount} Rows) – ignoriere`);
        if (!this._dataPollTimer) this._scheduleDataPoll();
        return;
      }

      // Cache-Detection 1: gleiche Zeilenzahl wie vorheriger Render —
      // aber nur im aktiven Filter-Switch-Fenster (30s). Danach sind gleiche
      // Row-Anzahlen kein Cache-Indikator mehr sondern echte neue Daten.
      if (rowCount === (this._totalRowCount ?? -1) && rowCount > 0 && msSinceSwitch < 30000) {
        if (!this._dataPollTimer) this._scheduleDataPoll();
        return;
      }
      // Cache-Detection 2: gleiche Zeilenzahl wie Bootstrap → SAC hat noch
      // die alten PLZ=00000-Daten gecacht, echte Erhebungsdaten kommen später.
      // Nur in den ersten 10s nach Filter-Switch aktiv (Schutz gegen den
      // theoretischen Fall dass eine Erhebung zufällig gleich viele Rows hat).
      const bootstrapCount = this._cachedBootstrapRows?.length ?? 0;
      const msSinceSwitch = this._filterSwitchTime ? Date.now() - this._filterSwitchTime : 99999;
      if (bootstrapCount > 0 && rowCount === bootstrapCount && msSinceSwitch < 10000) {
        console.info(`[PLZ-Widget] SAC-Bootstrap-Cache (${rowCount} = Bootstrap-Rows, ${(msSinceSwitch/1000).toFixed(1)}s) – warte auf echte Daten`);
        if (!this._dataPollTimer) this._scheduleDataPoll();
        return;
      }
      // Cache-Detection 3: erste Row gehört zu anderer ErhID → alte Daten.
      // Nur innerhalb des 30s-Fensters und nur im Single-GF-Modus prüfen —
      // im Multi-GF-Modus sind fremde ErhIDs in den Rows normal.
      const isMultiGf = (this._activeErhebungen?.length ?? 0) > 1;
      if (!isMultiGf && msSinceSwitch < 30000 && this._activeFilter && rowCount > 0) {
        const staleErh = this._isDataFromDifferentErhebung(this._myDataSource.data);
        if (staleErh) {
          if (!this._dataPollTimer) this._scheduleDataPoll();
          return;
        }
      }
      // Cache-Detection 4: Row-Anzahl hat sich seit Filter-Switch nicht geändert.
      // SAC liefert gecachte Daten → _lastRowCountSinceSwitch trackt was wir
      // bei jedem Tick/Setter nach dem Switch gesehen haben. Erst wenn sich
      // die Row-Anzahl ändert (SAC hat neuen BW-Datenstand) akzeptieren wir.
      // Sicherheits-Timeout: nach 30s akzeptieren wir was auch immer kommt.
      if (msSinceSwitch < 30000) {
        if (this._lastRowCountSinceSwitch === undefined) {
          this._lastRowCountSinceSwitch = rowCount;
          console.info(`[PLZ-Widget] SAC-Post-Switch (${rowCount} Rows, ${(msSinceSwitch/1000).toFixed(1)}s) – warte auf Änderung`);
          if (!this._dataPollTimer) this._scheduleDataPoll();
          return;
        }
        if (rowCount === this._lastRowCountSinceSwitch) {
          console.info(`[PLZ-Widget] SAC-Post-Switch unverändert (${rowCount} Rows, ${(msSinceSwitch/1000).toFixed(1)}s) – warte weiter`);
          if (!this._dataPollTimer) this._scheduleDataPoll();
          return;
        }
        // Row-Anzahl hat sich verändert → neue BW-Daten
        console.info(`[PLZ-Widget] SAC-Post-Switch: Row-Änderung ${this._lastRowCountSinceSwitch} → ${rowCount} (${(msSinceSwitch/1000).toFixed(1)}s) ✓`);
        this._lastRowCountSinceSwitch = undefined;
      }
      if (this._renderInProgress) {
        console.info(`[PLZ-Widget] render läuft – ignoriere SAC-Refresh (${rowCount} Rows)`);
        return;
      }

      console.info(`[PLZ-Widget] Phase 2: ${rowCount} Rows | E2E ${e2e} | ${this._doppelbestreuungAktiv ? 'mit' : 'ohne'} Doppelbestreuung`);
      this._totalRowCount      = rowCount;
      this._totalRowCountErhID = this._activeFilter?.erhID ?? null;
      this._fullDataLoaded  = false;
      this._renderInProgress = true;
      // Filter-Switch-Fenster schließen: nach akzeptierten Daten sollen
      // D1-D4 nicht mehr gelten — sonst Endlosschleife bei Post-render-Setter.
      this._filterSwitchTime = null;
      this._lastRowCountSinceSwitch = undefined;
      this.render().finally(() => { this._renderInProgress = false; });
    }

    // Hilfsfunktion: prüft ob die gelieferten BW-Rows zu einer anderen ErhID
    // gehören als die aktuell angeforderte. SAC cached nach Filter-Wechsel
    // häufig den vorigen Datenstand — Symptom: render() findet 0 Rows im Index.
    // Gibt die gefundene ErhID zurück (für Log), oder null wenn Daten passen.
    _isDataFromDifferentErhebung(data) {
      if (!this._activeFilter || !data?.length) return null;
      const expectedErhID = this._activeFilter.erhID;
      const sample = Math.min(data.length, 5);
      let mismatchErh = null, matchCount = 0;
      for (let i = 0; i < sample; i++) {
        const rowErh = data[i]['dimension_erhebung_0']?.id?.trim();
        if (!rowErh || rowErh === expectedErhID) { matchCount++; continue; }
        const plz = data[i]['dimension_plz_0']?.id?.trim();
        if (plz === '00000' || plz === '0') continue;
        mismatchErh = rowErh;
      }
      return (matchCount === 0 && mismatchErh) ? mismatchErh : null;
    }

    // ── Cache-Overflow / Timeout-Fehlermeldung ─────────────────────────
    _showCacheOverflowError() {
      const loader = this.$('cinematic-loader');
      if (!loader) return;
      // Loader in Fehlerzustand versetzen
      loader.querySelector('#loader-phase-text')?.remove();
      loader.querySelector('.loader-bar-track')?.remove();
      loader.querySelector('.loader-dots')?.remove();
      loader.querySelector('#loader-data-progress')?.remove();

      const errBox = document.createElement('div');
      errBox.style.cssText = 'text-align:center;max-width:320px;padding:0 16px;';
      errBox.innerHTML = `
        <div style="font-size:2rem;margin-bottom:12px">⚠️</div>
        <div style="font-size:0.95rem;font-weight:700;color:var(--gray-800);margin-bottom:8px">
          Daten konnten nicht geladen werden
        </div>
        <div style="font-size:0.78rem;color:var(--gray-500);line-height:1.55;margin-bottom:20px">
          Die angefragten Daten überschreiten die maximale Cache-Größe von SAC.<br>
          Bitte wähle weniger GF-Bereiche oder deaktiviere die Doppelbestreuung.
        </div>
        <button id="cache-error-home-btn" type="button" style="
          padding:9px 20px;background:var(--red);color:white;border:none;
          border-radius:var(--radius-md);font-size:0.87rem;font-weight:600;
          font-family:var(--font);cursor:pointer;
          transition:background 0.18s,transform 0.12s;
        ">← Zurück zum Hauptmenü</button>`;
      loader.appendChild(errBox);

      const btn = errBox.querySelector('#cache-error-home-btn');
      if (btn) {
        btn.onmouseenter = () => { btn.style.background = 'var(--red-dark)'; btn.style.transform = 'translateY(-1px)'; };
        btn.onmouseleave = () => { btn.style.background = 'var(--red)'; btn.style.transform = ''; };
        btn.onclick = () => this._resetToHome();
      }
    }

    // ── Daten-Poll (Fallback, wenn DataSource noch nicht bereit) ───────
    _scheduleDataPoll() {
      if (this._dataPollTimer) return;
      this._updateLoaderPhase(1, 'Warte auf Daten…');
      const start = Date.now();
      // Snapshot zum Zeitpunkt des Poll-Starts: _fullDataLoaded kann sich
      // ändern während der Poll läuft (render() setzt es auf false) — wir
      // frieren den Mode ein damit der Tick immer korrekt entscheidet.
      const isBootstrapPoll = !this._fullDataLoaded;
      const mode = isBootstrapPoll
        ? 'Phase 1 – Bootstrap'
        : (this._doppelbestreuungAktiv ? 'Phase 2 – mit Doppelbestreuung' : 'Phase 2 – ohne Doppelbestreuung');
      console.info(`[PLZ-Widget] ⏳ Poll gestartet [${mode}]`);

      const tick = () => {
        if (this._myDataSource?.state === 'success') {
          const rowCount = this._myDataSource?.data?.length ?? 0;

          if (!isBootstrapPoll) {
            // ── Phase-2-Poll: Cache-Detections ──────────────────────────
            const msSinceSwitch = this._filterSwitchTime ? Date.now() - this._filterSwitchTime : 99999;
            // D1: gleiche Row-Anzahl → SAC-Cache — nur im Switch-Fenster prüfen
            if (rowCount === (this._totalRowCount ?? -1) && rowCount > 0 && msSinceSwitch < 30000) {
              return;
            }
            // D2: Bootstrap-Row-Count → SAC hat noch 00000-Daten
            const bootstrapCount = this._cachedBootstrapRows?.length ?? 0;
            if (bootstrapCount > 0 && rowCount === bootstrapCount && msSinceSwitch < 10000) {
              console.info(`[PLZ-Widget] Tick: Bootstrap-Cache (${rowCount} Rows, ${(msSinceSwitch/1000).toFixed(1)}s) – warte`);
              return;
            }
            // D3: erste Row gehört zu anderer ErhID — nur Single-GF + 30s-Fenster
            const isMultiGf = (this._activeErhebungen?.length ?? 0) > 1;
            if (!isMultiGf && msSinceSwitch < 30000 && this._activeFilter && rowCount > 0) {
              const staleErh = this._isDataFromDifferentErhebung(this._myDataSource.data);
              if (staleErh) {
                console.info(`[PLZ-Widget] Tick: ErhID-Cache ("${staleErh}" ≠ "${this._activeFilter.erhID}", ${(msSinceSwitch/1000).toFixed(1)}s) – warte`);
                return;
              }
            }
            // D4: Row-Anzahl hat sich seit Filter-Switch noch nicht geändert.
            // Sicherheits-Timeout: nach Lock-Ablauf + BW-Mindest-Wartezeit
            // akzeptieren wir die Daten auch wenn Row-Anzahl gleich geblieben.
            // BW braucht typisch 5-15s — wir warten mindestens 4s nach Lock-Ende.
            const lockEnd = this._filterSwitchLockUntil ?? (this._filterSwitchTime + 2000);
            const msSinceLockEnd = Date.now() - lockEnd;
            const minBWWait = 4000;  // 4s Mindest-Wartezeit nach Lock
            if (msSinceSwitch < 30000 && msSinceLockEnd < minBWWait) {
              if (this._lastRowCountSinceSwitch === undefined) {
                this._lastRowCountSinceSwitch = rowCount;
                console.info(`[PLZ-Widget] Tick: Post-Switch (${rowCount} Rows, ${(msSinceSwitch/1000).toFixed(1)}s) – warte auf Änderung`);
                return;
              }
              if (rowCount === this._lastRowCountSinceSwitch) {
                const secs = Math.floor(msSinceSwitch / 1000);
                if (secs !== this._lastPollSecs) {
                  this._lastPollSecs = secs;
                  console.info(`[PLZ-Widget] Tick: Post-Switch unverändert (${rowCount} Rows, ${secs}s, Lock+${(msSinceLockEnd/1000).toFixed(1)}s) – warte`);
                }
                return;
              }
              console.info(`[PLZ-Widget] Tick: Row-Änderung ${this._lastRowCountSinceSwitch} → ${rowCount} (${(msSinceSwitch/1000).toFixed(1)}s) ✓`);
              this._lastRowCountSinceSwitch = undefined;
            } else if (msSinceSwitch < 30000 && rowCount === this._lastRowCountSinceSwitch) {
              // Lock abgelaufen + Mindest-Wartezeit abgelaufen + Row-Anzahl NOCH gleich
              // → Beide Erhebungen haben wahrscheinlich gleich viele Rows. Akzeptieren.
              console.info(`[PLZ-Widget] Tick: Mindest-BW-Wait abgelaufen (${(msSinceSwitch/1000).toFixed(1)}s) → akzeptiere ${rowCount} Rows`);
              this._lastRowCountSinceSwitch = undefined;
            }
          } else {
            // ── Bootstrap-Poll: Home-Reset-Detection ────────────────────
            if (this._homeResetPending) {
              if (rowCount > 200) return;
              this._homeResetPending = false;
            }
          }

          this._clearInterval(this._dataPollTimer);
          this._dataPollTimer = null;

          const waited = ((Date.now() - start) / 1000).toFixed(1);
          console.info(`[PLZ-Widget] ✅ BW-Daten empfangen [${mode}] – ${rowCount} Rows in ${waited}s`);

          if (isBootstrapPoll) {
            if (!this._bootstrapDone) this._bootstrapFromPLZ00000(this._myDataSource.data);
          } else {
            if (!this._renderInProgress) {
              this._hideDataLoadProgress();
              this._totalRowCount      = rowCount;
              this._totalRowCountErhID = this._activeFilter?.erhID ?? null;
              this._fullDataLoaded  = false;
              this._renderInProgress = true;
              // Filter-Switch-Fenster schließen
              this._filterSwitchTime = null;
              this._lastRowCountSinceSwitch = undefined;
              this.render().finally(() => { this._renderInProgress = false; });
            }
          }
        } else {
          const secs = Math.floor((Date.now() - start) / 1000);
          if (secs !== this._lastPollSecs) {
            this._lastPollSecs = secs;
            if (isBootstrapPoll) {
              this._updateLoaderPhase(1, `Warte auf Daten… (${secs}s)`);
            } else {
              const currentRows = this._myDataSource?.data?.length ?? 0;
              const totalRows   = this._totalRowCount ?? 0;
              this._updateLoaderPhase(1, 'Erhebungsdaten werden geladen…');
              this._updateDataLoadProgress(currentRows, totalRows);
            }
          }
          // Nach 90s ohne Daten: Timeout-Fehlermeldung anzeigen.
          // Häufigste Ursache: SAC-Cache-Overflow bei zu vielen kombinierten Daten.
          if (!isBootstrapPoll && secs >= 90) {
            this._clearInterval(this._dataPollTimer);
            this._dataPollTimer = null;
            this._showCacheOverflowError();
          }
        }
      };

      this._dataPollTimer = this._setInterval(tick, 300);
    }

    // ── Distanz-Helfer (für externe Aufrufer) ──────────────────────────
    getDistanceKm(lat1, lon1, lat2, lon2) {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    getPolygonCenter(layer) { return layer.getBounds().getCenter(); }
  }

  // Custom-Element registrieren (idempotent gegenüber HMR)
  if (!customElements.get('geo-map-widget')) {
    customElements.define('geo-map-widget', GeoMapWidget);
  }
})();
