let neighbours = true;
  let hasTriggeredClick = false;
  (function () {
    const template = document.createElement('template');
    template.innerHTML = `
    <style>
      /* ═══════════════════════════════════════════════════
         DESIGN TOKENS
      ═══════════════════════════════════════════════════ */
      :host {
        --red:          #b41821;
        --red-dark:     #8e1219;
        --red-light:    #d42030;
        --red-bg:       #fdf2f2;
        --red-bg-hover: #fce8e8;
        --red-border:   rgba(180,24,33,0.2);
        --red-shadow:   rgba(180,24,33,0.15);
        --white:        #ffffff;
        --gray-50:      #f8f9fa;
        --gray-100:     #f1f3f5;
        --gray-200:     #e9ecef;
        --gray-300:     #dee2e6;
        --gray-400:     #ced4da;
        --gray-500:     #adb5bd;
        --gray-600:     #6c757d;
        --gray-700:     #495057;
        --gray-800:     #343a40;
        --gray-900:     #212529;
        --shadow-xs:  0 1px 3px rgba(0,0,0,0.06);
        --shadow-sm:  0 2px 8px rgba(0,0,0,0.08);
        --shadow-md:  0 4px 16px rgba(0,0,0,0.10);
        --shadow-lg:  0 8px 32px rgba(0,0,0,0.12);
        --shadow-red: 0 4px 16px rgba(180,24,33,0.25);
        --radius-sm:  5px;
        --radius-md:  8px;
        --radius-lg:  12px;
        --radius-xl:  16px;
        --font:       'Segoe UI', system-ui, -apple-system, sans-serif;
        --ease-out:   cubic-bezier(0.16, 1, 0.3, 1);
        --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
        display: block; height: 100%; width: 100%; box-sizing: border-box;
        font-family: var(--font);
      }
      *, *::before, *::after { box-sizing: border-box; }

      .layout { display: flex; height: 100%; width: 100%; background: var(--gray-50); }

      .filter-container {
        width: 30%; padding: 14px 12px; box-sizing: border-box;
        font-family: var(--font); background: var(--white);
        border-right: 1px solid var(--gray-200);
        display: flex; flex-direction: column; height: 100%;
        position: relative; z-index: 2;
        box-shadow: 2px 0 12px rgba(0,0,0,0.04);
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
        font-family: var(--font); border: 1.5px solid var(--gray-200);
        border-radius: var(--radius-md); background: var(--gray-50); color: var(--gray-800);
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' fill='none'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236c757d' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
        background-repeat: no-repeat; background-position: right 10px center;
        cursor: pointer;
        transition: border-color 0.18s var(--ease-in-out), box-shadow 0.18s var(--ease-in-out), background 0.18s var(--ease-in-out);
        outline: none;
      }
      .filter-container select:hover:not(:disabled) { border-color: var(--red-border); background-color: var(--white); }
      .filter-container select:focus { border-color: var(--red); box-shadow: 0 0 0 3px var(--red-shadow); background-color: var(--white); }
      .filter-container select:disabled { opacity: 0.45; cursor: not-allowed; }

      #filter-button {
        width: 100%; margin-top: 10px; padding: 9px 16px; font-size: 0.87rem;
        font-family: var(--font); font-weight: 600; color: var(--white);
        background: var(--gray-300); border: none; border-radius: var(--radius-md);
        cursor: not-allowed; position: relative; overflow: hidden;
        transition: background 0.22s var(--ease-in-out), transform 0.12s, box-shadow 0.18s;
        opacity: 0.6;
      }
      #filter-button.ready {
        background: var(--red); cursor: pointer; opacity: 1;
      }
      #filter-button.ready::after {
        content: ''; position: absolute; inset: 0;
        background: linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 100%);
        pointer-events: none;
      }
      #filter-button.ready:hover { background: var(--red-light); box-shadow: var(--shadow-red); transform: translateY(-1px); }
      #filter-button.ready:active { transform: translateY(0); box-shadow: none; }

      .info-toggle-btn {
        width: 100%; margin-top: 8px; padding: 7px 12px; font-size: 0.8rem;
        font-family: var(--font); font-weight: 600; color: var(--red);
        background: transparent; border: 1.5px solid var(--red-border);
        border-radius: var(--radius-md); cursor: pointer;
        transition: background 0.18s, border-color 0.18s;
        display: flex; align-items: center; justify-content: center; gap: 6px;
      }
      .info-toggle-btn:hover { background: var(--red-bg); border-color: var(--red); }

      .table-container {
        margin-top: 10px; background: var(--white); border-radius: var(--radius-lg);
        border: 1px solid var(--gray-200); box-shadow: var(--shadow-xs);
        font-family: var(--font); position: relative; overflow: hidden;
        display: flex; flex-direction: column; flex: 1; min-height: 0;
        transition: box-shadow 0.2s;
      }
      .table-container:hover { box-shadow: var(--shadow-sm); }
      .table-wrapper {
        flex: 1; display: flex; flex-direction: column; min-height: 0;
        transition: transform 0.36s var(--ease-out); overflow: hidden;
      }
      .table-scroll {
        flex: 1; overflow-y: auto; min-height: 0;
        scrollbar-width: thin; scrollbar-color: var(--red) var(--gray-100);
      }
      .table-scroll::-webkit-scrollbar { width: 5px; }
      .table-scroll::-webkit-scrollbar-track { background: var(--gray-100); }
      .table-scroll::-webkit-scrollbar-thumb { background: var(--red); border-radius: 10px; }
      .table-container table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      .table-container thead { position: sticky; top: 0; z-index: 2; }
      .table-container th {
        background: var(--red); color: var(--white); padding: 8px 10px;
        text-align: left; font-size: 0.72rem; font-weight: 700;
        letter-spacing: 0.05em; text-transform: uppercase; white-space: pre-line;
        border-bottom: none; cursor: pointer; user-select: none; transition: background 0.15s;
      }
      .table-container th:hover { background: var(--red-dark); }
      .table-container td {
        padding: 6px 10px; border-bottom: 1px solid var(--gray-100);
        text-align: left; font-size: 0.8rem; color: var(--gray-700);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        transition: background 0.12s;
        border-left: none; border-right: none;
      }
      .table-container tbody tr { transition: background 0.12s; cursor: pointer; }
      .table-container tbody tr:hover td { background: var(--red-bg); color: var(--gray-900); }

      .table-row-selected td {
        background: #fff3f3 !important;
        border-left: none !important;
      }
      .table-row-selected td:first-child {
        border-left: 3px solid var(--red) !important;
      }

      #streuverlust-box {
        flex-shrink: 0; background: var(--red-bg); border-top: 2px solid var(--red);
        padding: 8px 12px; font-size: 0.8rem; color: var(--gray-700);
        display: flex; justify-content: space-between; align-items: center; gap: 8px;
      }
      #streuverlust-box strong { color: var(--red); }

      #nl-info-container {
        position: absolute; left: 0; right: 0; bottom: 0;
        height: 100%; max-height: 100%;
        background: var(--white); border-top: 2px solid var(--red);
        box-shadow: 0 -4px 20px rgba(0,0,0,0.1);
        transform: translateY(102%); opacity: 0;
        transition: transform 0.36s var(--ease-out), opacity 0.28s ease;
        display: flex; flex-direction: column; overflow: hidden; z-index: 10;
        border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      }
      #nl-info-container.show { transform: translateY(0); opacity: 1; }
      .nl-info-scroll {
        flex: 1; min-height: 0; overflow-y: auto;
        scrollbar-width: thin; scrollbar-color: var(--red) var(--gray-100);
      }
      .nl-info-scroll::-webkit-scrollbar { width: 5px; }
      .nl-info-scroll::-webkit-scrollbar-thumb { background: var(--red); border-radius: 10px; }
      .nl-info-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 0.78rem; }
      .nl-info-table th {
        background: var(--red); color: white; padding: 8px;
        position: sticky; top: 0; z-index: 2; white-space: pre-line;
        border-right: 1px solid rgba(255,255,255,0.2);
        font-size: 0.7rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
      }
      .nl-info-table td {
        padding: 6px 8px; border-bottom: 1px solid var(--gray-100);
        font-size: 0.78rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        color: var(--gray-700); transition: background 0.12s;
      }
      .nl-info-row { cursor: pointer; transition: background 0.12s; }
      .nl-info-row:hover td { background: var(--red-bg); }
      .nl-info-row.table-row-selected td { background: #fff3f3; border-left: none; }
      .nl-info-row.table-row-selected td:first-child { border-left: 3px solid var(--red); }
      .nl-col-nl   { width: 30px; } .nl-col-jahr { width: 70px; } .nl-col-erf  { width: 58px; }
      .nl-col-pct1 { width: 30px; } .nl-col-val  { width: 55px; } .nl-col-pct2 { width: 30px; } .nl-col-abd  { width: 55px; }
      .filter-container.nl-info-active .table-wrapper { transform: translateY(-100%); }

      .map-container { width: 70%; height: 100%; position: relative; z-index: 10; isolation: isolate; }
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
      @keyframes spin { 0% { transform: translate(-50%,-50%) rotate(0deg); } 100% { transform: translate(-50%,-50%) rotate(360deg); } }
      #loading-spinner.hidden { display: none; }

      .note-label {
        background: rgba(255,255,255,0.92); border: 1px solid var(--gray-300);
        padding: 2px 7px; font-size: 10px; color: var(--gray-700); border-radius: 4px;
        font-family: var(--font); box-shadow: var(--shadow-xs); backdrop-filter: blur(4px);
      }

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
        border-radius: 2px; background: linear-gradient(90deg, var(--red) 0%, var(--gray-200) 0%);
        cursor: pointer; outline: none;
      }
      #radius-slider::-webkit-slider-thumb {
        -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%;
        background: var(--white); border: 2.5px solid var(--red);
        box-shadow: 0 1px 4px rgba(0,0,0,0.18); cursor: pointer;
        transition: transform 0.12s, box-shadow 0.12s;
      }
      #radius-slider::-webkit-slider-thumb:hover { transform: scale(1.15); box-shadow: 0 2px 6px var(--red-shadow); }
      #radius-slider::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: var(--white); border: 2.5px solid var(--red); cursor: pointer; }

      #map-tile-toggle-btn {
        position: absolute;
        bottom: 20px; right: calc(26% + 14px);
        width: 48px; height: 48px;
        background: var(--white); border-radius: 50%;
        box-shadow: var(--shadow-md); cursor: pointer;
        z-index: 50;
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
        max-height: none; overflow: visible; font-size: 11.5px; font-family: var(--font);
        z-index: 9998; box-shadow: var(--shadow-lg); pointer-events: none;
        transform-origin: bottom left;
        transition: opacity 0.22s ease, transform 0.22s var(--ease-out), visibility 0.22s;
      }
      #heatmap-legend.hidden { opacity: 0; transform: scale(0.94); visibility: hidden; }
      #heatmap-legend strong {
        font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase;
        color: var(--gray-500); font-weight: 700; display: block; margin-bottom: 8px;
      }
      .heatmap-legend-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; color: var(--gray-700); }
      .heatmap-legend-color { width: 18px; height: 11px; border-radius: 3px; border: 1px solid rgba(0,0,0,0.08); flex-shrink: 0; }

      .side-popup {
        position: absolute; right: 0; top: 0;
        width: 26%;
        height: calc(100% - 26% - 10px);
        max-height: 68%;
        background: var(--white); border-left: 3px solid var(--red);
        border-top-left-radius: var(--radius-xl); border-bottom-left-radius: var(--radius-xl);
        padding: 0; font-family: var(--font); box-sizing: border-box;
        overflow-y: auto; z-index: 99999; box-shadow: -4px 0 24px rgba(0,0,0,0.12);
        scrollbar-width: thin; scrollbar-color: var(--red) var(--gray-100);
        opacity: 0; transform: translateX(16px);
        transition: opacity 0.28s ease, transform 0.28s var(--ease-out);
      }
      .side-popup::-webkit-scrollbar { width: 5px; }
      .side-popup::-webkit-scrollbar-thumb { background: var(--red); border-radius: 10px; }
      .side-popup.show { opacity: 1; transform: translateX(0); }
      .side-popup.hidden { opacity: 0; transform: translateX(16px); pointer-events: none; }
      .popup-header-strip {
        background: linear-gradient(135deg, var(--red) 0%, var(--red-light) 100%);
        color: white; padding: 12px 14px 10px;
        border-radius: var(--radius-xl) 0 0 0; position: relative;
      }
      .popup-header-strip .popup-location { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.8; margin-bottom: 2px; }
      .popup-header-strip .popup-title { font-size: 1rem; font-weight: 700; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 32px; }
      .side-popup .close-btn {
        position: absolute; top: 10px; right: 10px; width: 26px; height: 26px;
        background: rgba(255,255,255,0.2); color: white; border: 1.5px solid rgba(255,255,255,0.35);
        border-radius: 50%; font-size: 13px; cursor: pointer; display: flex;
        align-items: center; justify-content: center;
        transition: background 0.15s, transform 0.15s; line-height: 1;
      }
      .side-popup .close-btn:hover { background: rgba(255,255,255,0.35); transform: scale(1.1); }
      .side-popup table { width: 100%; table-layout: fixed; border-collapse: collapse; margin: 0; }
      .side-popup th { background: var(--red); color: white; font-weight: 600; padding: 7px 12px; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: none; font-size: 0.8rem; }
      .side-popup th.subtitle-cell { background: var(--gray-50); color: var(--gray-600); font-weight: 600; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; border-bottom: 1px solid var(--gray-200); }
      .side-popup td { font-size: 0.82rem; padding: 6px 12px; color: var(--gray-700); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: none; border-bottom: 1px solid var(--gray-100); transition: background 0.1s; }
      .side-popup tbody tr:hover td { background: var(--red-bg); }
      .side-popup td.label-cell { width: 62%; text-align: left; color: var(--gray-600); font-weight: 500; }
      .side-popup td.value-cell { width: 38%; text-align: right; font-weight: 700; color: var(--gray-800); font-variant-numeric: tabular-nums; }
      .side-popup .section-title { background: var(--gray-50); color: var(--gray-500); font-weight: 700; font-size: 0.68rem; letter-spacing: 0.08em; text-transform: uppercase; padding: 6px 12px; border-top: 1px solid var(--gray-200); border-bottom: 1px solid var(--gray-200); }

      #side-popup-umsatz {
        display: flex; flex-direction: column;
      }
      #side-popup-umsatz.show { display: flex; flex-direction: column; }
      #side-popup-umsatz .popup-header {
        background: linear-gradient(135deg, var(--red) 0%, var(--red-light) 100%);
        color: white; padding: 12px 14px 10px; font-size: 0.97rem; font-weight: 700;
        display: flex; justify-content: space-between; align-items: flex-start;
        border-radius: var(--radius-xl) 0 0 0; line-height: 1.3; flex-shrink: 0;
      }
      #side-popup-umsatz .popup-header .close-btn {
        position: static; flex-shrink: 0; width: 26px; height: 26px;
        background: rgba(255,255,255,0.2); color: white; border: 1.5px solid rgba(255,255,255,0.35);
        border-radius: 50%; font-size: 13px; cursor: pointer; display: flex;
        align-items: center; justify-content: center;
        transition: background 0.15s, transform 0.15s; margin-left: 8px; margin-top: 2px;
      }
      #side-popup-umsatz .popup-header .close-btn:hover { background: rgba(255,255,255,0.35); transform: scale(1.1); }
      .umsatz-subheader { padding: 12px 14px 6px; font-size: 0.87rem; line-height: 1.55; background: var(--red-bg); border-bottom: 1px solid var(--red-border); }
      .umsatz-subheader .strong { font-weight: 700; color: var(--gray-900); }
      .section-title { margin: 0; padding: 6px 14px; background: var(--gray-50); border-top: 1px solid var(--gray-200); border-bottom: 1px solid var(--gray-200); font-weight: 700; font-size: 0.68rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--gray-500); }
      .umsatz-grid { display: grid; grid-template-columns: 1.3fr 0.9fr 0.9fr; gap: 5px 10px; padding: 8px 14px; align-items: center; }
      .umsatz-grid .label { font-weight: 500; color: var(--gray-600); font-size: 0.82rem; }
      .umsatz-grid .value { text-align: right; font-weight: 700; color: var(--gray-800); font-size: 0.82rem; font-variant-numeric: tabular-nums; }
      .umsatz-bar { height: 10px; border-radius: 5px; overflow: hidden; display: flex; margin: 6px 14px; background: var(--gray-100); }
      .umsatz-bar > div { transition: width 0.5s var(--ease-out); }
      .share-stationaer { background: var(--red); } .share-pluscard { background: #1f78b4; } .share-ra { background: #33a02c; } .share-online { background: #ffb000; }
      .umsatz-legend { display: flex; gap: 10px; flex-wrap: wrap; padding: 4px 14px 10px; font-size: 0.78rem; color: var(--gray-600); }
      .umsatz-legend > span { display: flex; align-items: center; gap: 4px; }
      .disabled-cell { opacity: 0.3; filter: grayscale(1); }

      #side-popup-overview {
        display: flex; flex-direction: column;
      }

      #map-control-panel {
        position: absolute; right: 0; bottom: 0; width: 26%; height: 25%; max-height: 58%;
        overflow-y: auto; background: rgba(255,255,255,0.97); backdrop-filter: blur(8px);
        border-left: 1px solid var(--gray-200); border-top: 1px solid var(--gray-200);
        border-top-left-radius: var(--radius-xl); padding: 14px; box-sizing: border-box;
        font-family: var(--font); z-index: 20; display: flex; flex-direction: column; gap: 12px;
        transition: height 0.32s var(--ease-out);
        box-shadow: -2px -2px 16px rgba(0,0,0,0.08);
        scrollbar-width: thin; scrollbar-color: var(--red) var(--gray-100);
      }
      #map-control-panel.panel-large  { height: 58%; }
      #map-control-panel.panel-medium { height: 30%; }
      #map-control-panel::before {
        content: ''; display: block; position: absolute; top: 0; left: 24px; right: 0; height: 2px;
        background: linear-gradient(90deg, var(--red), transparent);
        pointer-events: none;
      }
      .panel-card {
        background: var(--white); border: 1px solid var(--gray-200); border-radius: var(--radius-lg);
        padding: 12px; box-shadow: var(--shadow-xs); display: flex; flex-direction: column; gap: 10px;
        animation: panelCardIn 0.3s var(--ease-out) both;
      }
      @keyframes panelCardIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      .panel-title { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--gray-400); margin-bottom: 2px; }
      .switch-row { display: flex; gap: 6px; }
      .switch-btn {
        flex: 1; padding: 8px 10px; border-radius: var(--radius-md);
        border: 1.5px solid var(--gray-200); background: var(--white); color: var(--gray-600);
        font-weight: 600; font-size: 0.83rem; font-family: var(--font); cursor: pointer;
        transition: all 0.18s var(--ease-in-out); display: flex; align-items: center; justify-content: center; gap: 5px;
      }
      .switch-btn:hover:not(.active) { border-color: var(--red-border); background: var(--red-bg); color: var(--red); }
      .switch-btn.active { background: var(--red); border-color: var(--red); color: var(--white); box-shadow: 0 2px 8px var(--red-shadow); }
      .option-row { display: flex; gap: 10px; font-size: 0.82rem; color: var(--gray-600); align-items: center; }
      .option-row label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
      .option-row input[type=checkbox] { accent-color: var(--red); cursor: pointer; width: 14px; height: 14px; }
      .compact-switch {
        display: flex; background: var(--gray-100); border-radius: var(--radius-md); padding: 3px;
        gap: 2px; cursor: pointer; user-select: none; border: 1px solid var(--gray-200);
      }
      .compact-switch span {
        flex: 1; text-align: center; padding: 5px 4px; font-size: 0.76rem; font-weight: 600;
        border-radius: 5px; transition: all 0.18s var(--ease-in-out); color: var(--gray-500);
      }
      .compact-switch span:hover { color: var(--red); }
      .compact-switch.active-left .mode-left { background: var(--white); color: var(--red); box-shadow: var(--shadow-xs); }
      .compact-switch.active-right .mode-right { background: var(--white); color: var(--red); box-shadow: var(--shadow-xs); }
      .switch-label { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--gray-400); margin-bottom: 1px; }
      .big-check { display: flex; align-items: center; gap: 7px; padding: 6px 10px; border: 1.5px solid var(--gray-200); border-radius: var(--radius-md); background: var(--white); font-size: 0.82rem; font-weight: 600; cursor: pointer; transition: border-color 0.18s, background 0.18s; color: var(--gray-700); }
      .big-check:hover { border-color: var(--red-border); background: var(--red-bg); }
      .big-check input { transform: scale(1.2); accent-color: var(--red); }
      .triple-switch { display: flex; background: var(--gray-100); border-radius: var(--radius-md); padding: 3px; gap: 2px; user-select: none; border: 1px solid var(--gray-200); }
      .triple-switch span { flex: 1; text-align: center; padding: 5px 2px; font-size: 0.74rem; font-weight: 600; border-radius: 5px; cursor: pointer; transition: all 0.18s var(--ease-in-out); color: var(--gray-500); }
      .triple-switch span.active { background: var(--white); color: var(--red); box-shadow: var(--shadow-xs); }
      .triple-switch span.disabled { opacity: 0.35; cursor: not-allowed; }
      .category-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
      .category-toggle { padding: 7px 8px; border-radius: var(--radius-md); border: 1.5px solid var(--gray-200); background: var(--white); color: var(--gray-600); font-size: 0.78rem; font-weight: 600; font-family: var(--font); text-align: center; cursor: pointer; transition: all 0.18s var(--ease-in-out); }
      .category-toggle:hover:not(.active) { border-color: var(--red-border); background: var(--red-bg); color: var(--red); }
      .category-toggle.active { background: var(--red-bg); border-color: var(--red); color: var(--red); font-weight: 700; box-shadow: 0 0 0 3px var(--red-shadow); }

      @keyframes criticalPulse {
        0%, 100% { transform: scale(1);    filter: drop-shadow(0 0 0px rgba(240,165,0,0)); }
        50%       { transform: scale(1.6);  filter: drop-shadow(0 0 6px rgba(240,165,0,0.7)); }
      }

      @keyframes bestreuungPulse {
        0%   { opacity: 0.9; stroke-width: 2.5; }
        50%  { opacity: 0.35; stroke-width: 1.5; }
        100% { opacity: 0.9; stroke-width: 2.5; }
      }
      .bestreuung-pulse-path {
        fill: none;
        stroke: #1565c0;
        stroke-width: 2.5;
        stroke-dasharray: 6 3;
        animation: bestreuungPulse 2s ease-in-out infinite;
        pointer-events: none;
      }

      #cinematic-loader {
        position: absolute; inset: 0; z-index: 99999;
        background: rgba(255,255,255,0.96); backdrop-filter: blur(6px);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        font-family: var(--font); animation: loaderFadeIn 0.25s ease;
      }
      @keyframes loaderFadeIn { from { opacity: 0; } to { opacity: 1; } }
      #cinematic-loader .loader-logo { width: 64px; height: 64px; margin-bottom: 28px; position: relative; }
      #cinematic-loader .loader-logo::before { content: ''; position: absolute; inset: 0; border-radius: 50%; border: 3px solid rgba(180,24,33,0.12); border-top-color: var(--red); border-right-color: var(--red); animation: spinSlow 1.6s linear infinite; }
      #cinematic-loader .loader-logo::after { content: ''; position: absolute; inset: 10px; border-radius: 50%; border: 2px solid rgba(180,24,33,0.08); border-bottom-color: rgba(180,24,33,0.4); animation: spinFast 0.85s linear infinite reverse; }
      #cinematic-loader .loader-core { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 12px; height: 12px; border-radius: 50%; background: var(--red); box-shadow: 0 0 16px rgba(180,24,33,0.35); animation: corePulse 1.6s ease-in-out infinite; }
      @keyframes spinSlow  { to { transform: rotate(360deg); } }
      @keyframes spinFast  { to { transform: rotate(360deg); } }
      @keyframes corePulse { 0%,100% { transform: translate(-50%,-50%) scale(1); opacity: 1; } 50% { transform: translate(-50%,-50%) scale(1.35); opacity: 0.7; } }
      #cinematic-loader .loader-phase { color: var(--gray-700); font-size: 0.95rem; font-weight: 600; letter-spacing: 0.02em; margin-bottom: 4px; min-height: 1.4em; text-align: center; transition: opacity 0.22s ease; }
      #cinematic-loader .loader-bar-track { width: 240px; height: 3px; background: var(--gray-200); border-radius: 2px; margin-top: 18px; overflow: hidden; }
      #cinematic-loader .loader-bar-fill { height: 100%; background: linear-gradient(90deg, var(--red), #e96a3a); border-radius: 2px; width: 0%; transition: width 0.48s var(--ease-in-out); }
      #cinematic-loader .loader-dots { display: flex; gap: 20px; margin-top: 22px; }
      #cinematic-loader .loader-dot { display: flex; flex-direction: column; align-items: center; gap: 6px; opacity: 0.25; transition: opacity 0.35s ease; }
      #cinematic-loader .loader-dot.active { opacity: 1; } #cinematic-loader .loader-dot.done { opacity: 0.5; }
      #cinematic-loader .dot-circle { width: 8px; height: 8px; border-radius: 50%; background: var(--red); transition: transform 0.28s var(--ease-out), box-shadow 0.28s; }
      #cinematic-loader .loader-dot.active .dot-circle { transform: scale(1.5); box-shadow: 0 0 8px var(--red-shadow); }
      #cinematic-loader .dot-label { font-size: 0.62rem; color: var(--gray-400); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; }
      #cinematic-loader.fade-out { animation: loaderFadeOut 0.35s ease forwards; }
      @keyframes loaderFadeOut { to { opacity: 0; pointer-events: none; } }

      @keyframes plzHighlightPulse {
        0%   { opacity: 1; }
        50%  { opacity: 0.7; }
        100% { opacity: 1; }
      }

      @keyframes plzSweepIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      .geo-layer-animating path {
        animation: plzSweepIn 0.4s var(--ease-out) both;
      }

      @keyframes markerPing {
        0%   { transform: translate(-50%,-50%) scale(0.3); opacity: 1; }
        100% { transform: translate(-50%,-50%) scale(2.2); opacity: 0; }
      }
      @keyframes markerAppear {
        from { transform: rotate(-45deg) scale(0); opacity: 0; }
        to   { transform: rotate(-45deg) scale(1); opacity: 1; }
      }
      @keyframes radiusExpand {
        0%   { transform: translate(-50%,-50%) scale(0); opacity: 0.7; }
        70%  { opacity: 0.3; }
        100% { transform: translate(-50%,-50%) scale(1); opacity: 0; }
      }

      #overview-toggle-btn {
        position: absolute; top: 12px; right: 14px;
        background: var(--white); border: 1.5px solid var(--gray-200);
        border-radius: 100px; padding: 6px 14px 6px 10px;
        font-size: 0.78rem; font-weight: 600; color: var(--gray-600);
        cursor: pointer; z-index: 99990; display: none;
        align-items: center; gap: 6px;
        box-shadow: var(--shadow-sm);
        transition: border-color 0.18s, background 0.18s, color 0.18s, transform 0.15s;
        font-family: var(--font);
      }
      #overview-toggle-btn:hover { border-color: var(--red); background: var(--red-bg); color: var(--red); }
      #overview-toggle-btn.visible { display: flex; }

      #back-to-home-btn {
        position: absolute; top: 12px; left: 14px;
        background: var(--white); border: 1.5px solid var(--gray-200);
        border-radius: 100px; padding: 6px 14px 6px 10px;
        font-size: 0.78rem; font-weight: 600; color: var(--gray-600);
        cursor: pointer; z-index: 9999; display: none;
        align-items: center; gap: 6px;
        box-shadow: var(--shadow-sm);
        transition: border-color 0.18s, background 0.18s, color 0.18s, transform 0.15s;
        font-family: var(--font);
      }
      #back-to-home-btn:hover { border-color: var(--red); background: var(--red-bg); color: var(--red); transform: translateX(-2px); }
      #back-to-home-btn.visible { display: flex; }

      .doppel-tooltip {
        position: absolute; z-index: 99999;
        background: var(--white); border: 1.5px solid var(--red-border);
        border-radius: var(--radius-md); padding: 8px 11px;
        font-size: 0.76rem; font-family: var(--font);
        box-shadow: var(--shadow-md);
        pointer-events: none;
        max-width: 220px;
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
      .doppel-tooltip-dot {
        width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
      }
      .hidden { display: none; }

      @keyframes rowFadeIn {
        from { opacity: 0; transform: translateX(-6px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      .table-row-animated { animation: rowFadeIn 0.2s var(--ease-out) both; }
    </style>

    <div class="layout">

      <div class="filter-container">
        <label for="erhebung-select">ErhebungsID</label>
        <select id="erhebung-select"></select>
        <label for="jahr-select">Jahr</label>
        <select id="jahr-select" disabled></select>
        <label for="nummer-select">Erhebungsnummer</label>
        <select id="nummer-select" disabled></select>
        <button id="filter-button">Anzeigen</button>
        <div class="table-container">
          <div class="table-wrapper" id="table-container">
            <div id="streuverlust-box"></div>
          </div>
          <div id="nl-info-container"></div>
        </div>
      </div>

      <div class="map-container">
      <div id="map-interaction-block"></div>
        <button id="back-to-home-btn" title="Zurück zum Hauptmenü">
          ← Hauptmenü
        </button>
        <button id="overview-toggle-btn" title="Gesamt-Übersicht">
          📊 Übersicht
        </button>
        <div id="map-preview-overlay" style="position:absolute;inset:0;z-index:400;pointer-events:none;overflow:hidden;"></div>
        <div id="loading-spinner" class="spinner hidden"></div>
        <div id="radius-slider-container">
          <label>Radius: <span id="radius-value">40</span> km</label>
          <input type="range" id="radius-slider" min="10" max="100" value="40" step="5">
        </div>
        <div id="map"></div>
        <div id="legend-toggle-btn" title="Legende"></div>
        <div id="heatmap-legend" class="heatmap-legend hidden"></div>
        <div id="umsatz-overview" class="hidden"></div>
      </div>

      <div id="side-popup" class="side-popup hidden"></div>
      <div id="side-popup-umsatz" class="side-popup hidden"></div>
      <div id="side-popup-overview" class="side-popup hidden"></div>
    </div>

    <div id="map-tile-toggle-btn" title="Kartenstil wechseln"></div>
    <div id="map-control-panel">
      <div class="panel-card">
        <div class="panel-title">Analyse-Modus</div>
        <div class="switch-row">
          <button id="btn-wk" class="switch-btn active">📊 WK</button>
          <button id="btn-umsatz" class="switch-btn">💶 Umsatz</button>
        </div>
        <div id="wk-extra" class="option-row">
          <label><input type="checkbox" id="chk-doppelbestreuung" checked> Doppelbestreuung</label>
        </div>
        <div id="umsatz-options-row" class="option-row hidden">
          <label><input type="checkbox" id="chk-bestreuung"> 📍 Bestreuung</label>
        </div>
      </div>
      <div id="umsatz-panel" class="panel-card hidden">
        <div class="panel-title">Umsatz-Einstellungen</div>
        <div class="switch-label">Umsatztyp</div>
        <div id="umsatz-type-switch" class="compact-switch">
          <span class="mode-left">Umsatz</span><span class="mode-right">Werbeumsatz</span>
        </div>
        <div id="werbe-options-row" class="option-row hidden">
          <label class="big-check"><input type="checkbox" id="chk-werbeumsatz" checked> Werbeumsatz</label>
          <label class="big-check"><input type="checkbox" id="chk-mitgekauft"> Mitgekauft</label>
        </div>
        <div class="switch-label">Darstellung</div>
        <div id="umsatz-analysis-switch" class="triple-switch">
          <span class="mode-abs active">Absolut</span>
          <span class="mode-hh">pro HH</span>
          <span class="mode-werbeanteil">Werbeanteil</span>
        </div>
        <div class="category-grid">
          <div class="category-toggle active" data-cat="stationaer">🏬 Stationär</div>
          <div class="category-toggle" data-cat="pluscard">💳 Pluscard</div>
          <div class="category-toggle" data-cat="ra">📦 R&amp;A</div>
          <div class="category-toggle" data-cat="online">🛒 KUBE OS</div>
        </div>
      </div>
    </div>
    `;

class GeoMapWidget extends HTMLElement {
  constructor() {
    super();
    this.neighbours = true;
    this._rawPLZCache = {};
    this._crossErhebungPLZ = {};
    this._doppelTooltipEl = null;
    this._shadowRoot = this.attachShadow({ mode: 'open' });
    this._shadowRoot.appendChild(template.content.cloneNode(true));
    this.map = null; this._tileLayer = null; this._geoLayer = null; this._geoData = null;
    this._myDataSource = null; this._tilesVisible = false;
    this._sortState = { column: null, direction: "asc" };
    this.currentMapMode = "wk"; this.activeCategories = new Set(["stationaer"]);
    this.umsatzMainMode = "gesamt"; this.useWerbeUmsatz = true; this.useZusatzUmsatz = false;
    this.useRadiusFilter = true; this._selectedNLs = new Set();
    this._nlSelectionInitialized = false;
    this._activePopupPLZ = null;
    this._activePopupType = null;
  }

  // ═══════════════════════════════════════════════════════════════
  // FIX 2: Zentrale PLZ-Normalisierung
  // BW liefert char(10) z.B. "0000069151" → letzte 5 Stellen = "69151"
  // Normale 5-stellige PLZs werden mit padStart(5,"0") aufgefüllt.
  // ═══════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════
  // PERF: PLZ-Normalisierung mit LRU-Cache (vermeidet wiederholte
  // String-Operationen in tight loops über tausende Rows).
  // BW char(10): "0000069151" → slice(-5) → "69151"
  // ═══════════════════════════════════════════════════════════════
  _normalizePLZ(raw) {
    if (raw == null) return null;
    // Fast path: number direkt als String
    const key = raw;
    if (this._plzNormCache) {
      const cached = this._plzNormCache.get(key);
      if (cached !== undefined) return cached;
    } else {
      this._plzNormCache = new Map();
    }
    let s = String(raw);
    // Whitespace nur entfernen wenn vorhanden (seltener Fall)
    if (s.includes(" ")) s = s.replace(/\s/g, "");
    let result;
    if (!s || s === "@NullMember") {
      result = null;
    } else if (s.length > 5) {
      result = s.slice(-5);
    } else {
      result = s.padStart(5, "0");
    }
    // Cache begrenzen auf 20k Einträge (verhindert Memory Leak)
    if (this._plzNormCache.size > 20000) this._plzNormCache.clear();
    this._plzNormCache.set(key, result);
    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // PERF: Erhebungs-Index aufbauen – ein einziger Scan über alle
  // Rohdaten beim ersten Zugriff. Alle nachfolgenden Methoden
  // (queryErhebungFromBW, prepareUmsatzPLZWerte, prepareErhebungsInfo,
  // _computeCrossErhebungDoppel) greifen nur noch auf den Index zu
  // statt _myDataSource.data erneut zu scannen.
  //
  // Struktur: this._erhebungIndex = {
  //   "erhID|jahr|nummer": [ row, row, ... ],
  //   ...
  // }
  // ═══════════════════════════════════════════════════════════════
  _buildErhebungIndex() {
    const data = this._myDataSource?.data;
    if (!data || !Array.isArray(data)) { this._erhebungIndex = {}; return; }
    const idx = {};
    for (let i = 0, len = data.length; i < len; i++) {
      const row = data[i];
      const eID = row["dimension_erhebung_0"]?.id;
      const yr  = row["dimension_jahr_0"]?.id;
      const nr  = row["dimension_erhebungsnummer_0"]?.id;
      if (!eID || eID === "@NullMember" || !yr || yr === "@NullMember" || !nr || nr === "@NullMember") continue;
      const k = eID + "|" + yr + "|" + nr;
      if (!idx[k]) idx[k] = [];
      idx[k].push(row);
    }
    this._erhebungIndex = idx;
  }

  _getErhebungRows(erhID, jahr, nummer) {
    if (!this._erhebungIndex) this._buildErhebungIndex();
    return this._erhebungIndex[erhID + "|" + jahr + "|" + nummer] || [];
  }

  connectedCallback() {
    // Loader sofort zeigen – bleibt bis render() fertig ist (FIX 1)
    this._showCinematicLoader();
    this._updateLoaderPhase(1, "Leaflet wird geladen…");
    if (!window.L) {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      const script = document.createElement('script'); script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => {
        this._updateLoaderPhase(2, "Karte wird initialisiert…");
        this.initializeMapBase();
      };
      this._shadowRoot.appendChild(link); this._shadowRoot.appendChild(script);
    } else {
      this._updateLoaderPhase(2, "Karte wird initialisiert…");
      this.initializeMapBase();
    }
  }

  showSpinner() { const s = this._shadowRoot.getElementById('loading-spinner'); if (s) s.classList.remove('hidden'); }
  hideSpinner() { const s = this._shadowRoot.getElementById('loading-spinner'); if (s) s.classList.add('hidden'); }

  buildErhebungsStruktur(data) {
    // PERF: _erhebungIndex bereits aufgebaut – direkt daraus ableiten
    // statt nochmal über alle Rohdaten zu iterieren
    if (this._erhebungIndex) {
      const struktur = {};
      const keys = Object.keys(this._erhebungIndex);
      for (let i = 0; i < keys.length; i++) {
        const [erhID, jahr, nummer] = keys[i].split("|");
        if (!struktur[erhID]) struktur[erhID] = {};
        if (!struktur[erhID][jahr]) struktur[erhID][jahr] = new Set();
        struktur[erhID][jahr].add(nummer);
      }
      return struktur;
    }
    // Fallback: normaler Scan
    const struktur = {};
    for (let i = 0, len = data.length; i < len; i++) {
      const row   = data[i];
      const erhID = row["dimension_erhebung_0"]?.id?.trim();
      const jahr  = row["dimension_jahr_0"]?.id?.trim();
      const nummer= row["dimension_erhebungsnummer_0"]?.id?.trim();
      if (!erhID||erhID==="@NullMember"||!jahr||jahr==="@NullMember"||!nummer||nummer==="@NullMember") continue;
      if (!struktur[erhID]) struktur[erhID] = {};
      if (!struktur[erhID][jahr]) struktur[erhID][jahr] = new Set();
      struktur[erhID][jahr].add(nummer);
    }
    return struktur;
  }

  async loadGeoJson() {
    if (this._geoLayer) return; // bereits geladen – sofort zurück
    try {
      // Cache-Control: max-age mitschicken damit der Browser das GeoJSON cached
      const response = await fetch("https://raw.githubusercontent.com/Benne2000/PLZAnalyse/main/PLZ.geojson", { cache: "force-cache" });
      this._geoData = await response.json();
      this.geoNotes = {};
      const features = this._geoData.features || [];
      // Einmalig alle Notes indexieren
      for (let i = 0; i < features.length; i++) {
        const p = features[i].properties;
        if (p?.plz && p?.note) this.geoNotes[p.plz.trim()] = p.note.trim();
      }
      // GeoJSON mit Canvas-Renderer – kein SVG-DOM-Overhead beim Zoomen
      this._geoLayer = L.geoJSON(this._geoData, {
        renderer: this._canvasRenderer,
        style: () => ({ fillColor: "#e9ecef", weight: 0.8, opacity: 1, color: "white", fillOpacity: 0.35 }),
      }).addTo(this.map);
      // layerByPLZ Index aufbauen
      this._layerByPLZ = {};
      this._geoLayer.eachLayer(layer => {
        const plz = String(layer.feature?.properties?.plz ?? "").padStart(5, "0");
        this._layerByPLZ[plz] = layer;
      });
    } catch (err) { console.error("GeoJSON Fehler:", err); }
  }

  applyMapMode(mode) { this.currentMapMode = mode; this.updateGeoLayer(); }

  renderDataTable(data) {
    let entries = Object.entries(data || {})
      .map(([plz, v]) => [String(plz).padStart(5, "0"), v])
      .filter(([plz]) => plz !== "00000");

    if (this.plzImRadius && this.plzImRadius.size > 0) {
      entries = entries.filter(([plz]) => this.plzImRadius.has(plz));
    }

    if (!this._sortState || this._sortState.column == null) {
      entries = entries.sort(([a], [b]) => a.localeCompare(b));
    }

    this.renderDataTableFromEntries(entries);
    this.updateStreuverlustFooter();
  }

  updateStreuverlustFooter() {
    const box = this._shadowRoot.getElementById("streuverlust-box");
    if (!box) return;
    if (!this.streuverlust) { box.innerHTML = ""; return; }
    let totalInRadius = 0;
    if (this.filteredKennwerte) {
      Object.entries(this.filteredKennwerte).forEach(([plz, k]) => {
        if (!this.plzImRadius || this.plzImRadius.size === 0 || this.plzImRadius.has(plz)) {
          totalInRadius += k["value_hr_n_umsatz_0"]?.raw ?? 0;
        }
      });
    }
    box.innerHTML = `<span><strong>Streuverlust:</strong> ${this.streuverlust.umsatz.toLocaleString("de-DE")} € &nbsp;·&nbsp; ${(this.streuverlust.anteil*100).toFixed(1)} %</span><span style="font-weight:700;color:var(--red);white-space:nowrap">Ges.: ${totalInRadius.toLocaleString("de-DE")} €</span>`;
  }

  computeStreuverlust() {
    if (!this.filteredData) return;
    let streuverlustUmsatz = 0, totalErhebungUmsatz = 0;
    const selNLs  = this._selectedNLs;
    const radius  = this.plzImRadius;
    const hasNL   = selNLs && selNLs.size > 0;
    const hasRad  = radius instanceof Set && radius.size > 0;
    const data    = this.filteredData;
    // PERF: for-loop statt forEach – kein Closure-Overhead pro Row
    for (let i = 0, len = data.length; i < len; i++) {
      const row  = data[i];
      const nl   = row["dimension_niederlassung_0"]?.id?.trim();
      if (hasNL && !selNLs.has(nl)) continue;
      const rawPLZ = row["dimension_plz_0"]?.id ?? row["dimension_plz_0"]?.raw;
      const plz    = this._normalizePLZ(rawPLZ);
      if (!plz) continue;
      const umsatz = row["value_hr_n_umsatz_0"]?.raw ?? 0;
      totalErhebungUmsatz += umsatz;
      if (!hasRad || !radius.has(plz)) streuverlustUmsatz += umsatz;
    }
    this.streuverlust = {
      umsatz: streuverlustUmsatz,
      anteil: totalErhebungUmsatz > 0 ? streuverlustUmsatz / totalErhebungUmsatz : 0
    };
  }

  sortTableByColumn(columnIndex) {
    if (!this.filteredKennwerte) return;

    if (this._sortState.column === columnIndex) {
      this._sortState.direction = this._sortState.direction === "asc" ? "desc" : "asc";
    } else {
      this._sortState.column = columnIndex;
      this._sortState.direction = "desc";
    }
    const dir = this._sortState.direction === "asc" ? 1 : -1;
    const entries = Object.entries(this.filteredKennwerte);
    const sorted = entries.sort(([plzA, a], [plzB, b]) => {
      let valA, valB;
      switch (columnIndex) {
        case 0: valA = plzA; valB = plzB; break;
        case 1: valA = this.geoNotes?.[plzA] || ""; valB = this.geoNotes?.[plzB] || ""; break;
        case 2:
          valA = a.isCritical ? 2 : (a.isHZ ? 1 : 0);
          valB = b.isCritical ? 2 : (b.isHZ ? 1 : 0);
          break;
        case 3: valA = a["value_hr_n_umsatz_0"]?.raw ?? -999999; valB = b["value_hr_n_umsatz_0"]?.raw ?? -999999; break;
        case 4: valA = a["value_wk_nachbar_0"]?.raw ?? -999999;  valB = b["value_wk_nachbar_0"]?.raw ?? -999999; break;
        default: return 0;
      }
      if (typeof valA === "string") return valA.localeCompare(valB) * dir;
      return (valA - valB) * dir;
    });
    this.renderDataTableFromEntries(sorted);
  }

  renderDataTableFromEntries(entries) {
    const container = this._shadowRoot.getElementById('table-container');
    container.innerHTML = '';
    container.style.cssText = 'display:flex;flex-direction:column;height:100%;min-height:0;';
    entries = entries.filter(([plz]) => plz !== "00000");
    if (this.plzImRadius && this.plzImRadius.size > 0) entries = entries.filter(([plz]) => this.plzImRadius.has(plz));

    if (!this._activeFilter) {
      const guide = document.createElement('div');
      guide.style.cssText = 'padding:20px 14px;flex:1;display:flex;flex-direction:column;gap:14px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--red) var(--gray-100);';
      guide.innerHTML = `
        <div style="text-align:center;padding:12px 0 6px;">
          <div style="font-size:2.2rem;margin-bottom:6px;">🗺️</div>
          <div style="font-size:0.9rem;font-weight:700;color:var(--gray-700);margin-bottom:3px;">Willkommen zur PLZ-Analyse</div>
          <div style="font-size:0.76rem;color:var(--gray-500);line-height:1.6;">
            Wähle oben <strong style="color:var(--gray-700)">ErhebungsID → Jahr → Nummer</strong>
            und klicke auf <strong style="color:var(--red)">Anzeigen</strong> um zu starten.
          </div>
        </div>

        <div style="background:var(--red-bg);border:1px solid var(--red-border);border-radius:var(--radius-md);padding:8px 11px;font-size:0.74rem;color:var(--gray-600);line-height:1.6;">
          <strong style="color:var(--red);display:block;margin-bottom:3px;">⚡ Schnellstart</strong>
          <ol style="margin:0;padding-left:16px;display:flex;flex-direction:column;gap:2px;">
            <li>ErhebungsID im ersten Dropdown wählen</li>
            <li>Jahr auswählen → Erhebungsnummer auswählen</li>
            <li><strong>Anzeigen</strong> klicken</li>
            <li>PLZ auf der Karte oder in der Tabelle anklicken</li>
          </ol>
        </div>

        <div style="font-size:0.68rem;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:var(--gray-400);margin-top:2px;margin-bottom:2px;">
          Analyse-Modi
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;">
          ${[
            ['📊','WK-Analyse','Werbekosten-Anteile je PLZ. Grün = HZ-bestreut (gut), Blau = potentiell nicht bestreut. Klicke auf eine PLZ für Detailwerte wie Umsatz, WK%, Haushalte und Auflage.'],
            ['💶','Umsatz-Analyse','Umsatzverteilung nach Kategorien (Stationär, Pluscard, R&A, KUBE OS). Wechsle zwischen Absolut-, Pro-HH- und Werbeanteil-Darstellung.'],
            ['⚠️','Doppelbestreuung','Im WK-Modus: zeigt PLZs, die von mehreren Erhebungen (gleicher Jahr/Nummer) gleichzeitig bestreut werden. Hover über das Symbol für Details.'],
            ['📍','Bestreuungs-Overlay','Im Umsatz-Modus: blendet pulsierende Konturen für HZ-bestreute Gebiete ein.'],
          ].map(([icon, title, desc]) => `
            <div style="display:flex;gap:9px;align-items:flex-start;padding:7px 9px;background:var(--gray-50);border-radius:var(--radius-md);border:1px solid var(--gray-100);">
              <div style="font-size:1rem;flex-shrink:0;margin-top:1px;">${icon}</div>
              <div>
                <div style="font-size:0.76rem;font-weight:700;color:var(--gray-700);">${title}</div>
                <div style="font-size:0.7rem;color:var(--gray-500);margin-top:2px;line-height:1.45;">${desc}</div>
              </div>
            </div>`).join('')}
        </div>

        <div style="font-size:0.68rem;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:var(--gray-400);margin-top:2px;margin-bottom:2px;">
          Werkzeuge
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;">
          ${[
            ['🔴','Radius-Slider','Oben in der Mitte: Einzugsgebiet in km festlegen. Nur PLZs im Radius werden ausgewertet. Der Streuverlust (unten) zeigt den Anteil außerhalb.'],
            ['🏢','NL-Filter','↕ Erhebungsübersicht: alle Niederlassungen mit Umsatz-Kennzahlen. Klick auf eine NL → Karte und Tabelle filtern auf diese NL. Mehrfachauswahl möglich.'],
            ['🗺️','Kartenebenen','Karten-Button (unten Mitte): OpenStreetMap-Hintergrund ein-/ausblenden. Legende-Button (unten links): Farbskala anzeigen.'],
            ['📋','Tabelle sortieren','Klick auf Spalten-Header sortiert die PLZ-Liste. Klick auf eine Tabellenzeile markiert die PLZ auf der Karte und öffnet das Detail-Popup.'],
          ].map(([icon, title, desc]) => `
            <div style="display:flex;gap:9px;align-items:flex-start;padding:7px 9px;background:var(--gray-50);border-radius:var(--radius-md);border:1px solid var(--gray-100);">
              <div style="font-size:1rem;flex-shrink:0;margin-top:1px;">${icon}</div>
              <div>
                <div style="font-size:0.76rem;font-weight:700;color:var(--gray-700);">${title}</div>
                <div style="font-size:0.7rem;color:var(--gray-500);margin-top:2px;line-height:1.45;">${desc}</div>
              </div>
            </div>`).join('')}
        </div>

        <div style="padding:8px 10px;background:var(--gray-50);border-radius:var(--radius-md);border:1px solid var(--gray-100);font-size:0.7rem;color:var(--gray-500);line-height:1.5;margin-top:2px;">
          💡 <strong style="color:var(--gray-600)">Tipp:</strong> Nach dem Laden einer Erhebung erscheint oben links der
          <strong style="color:var(--gray-600)">← Hauptmenü</strong>-Button, um jederzeit zurückzukehren.
        </div>`;
      container.appendChild(guide);
      return;
    }

    if (!entries.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:24px;text-align:center;color:#adb5bd;font-size:0.85rem;';
      empty.textContent = 'Keine Daten vorhanden';
      container.appendChild(empty);
      const footer = document.createElement("div"); footer.id = "streuverlust-box"; container.appendChild(footer);
      return;
    }

    const scrollWrapper = document.createElement("div"); scrollWrapper.classList.add("table-scroll");
    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;table-layout:fixed;';

    const isUmsatzMode = this.currentMapMode === "umsatz-multi" || this.currentMapMode === "werbeanteil";
    const lastColLabel = isUmsatzMode ? 'Umsatz-\nAnteil' : 'WK (%)';
    const headers = [
      { label: 'PLZ', width: '44px' }, { label: 'Gemeinde', width: '88px' },
      { label: 'HZ', width: '22px' }, { label: 'Netto-Umsatz\n(Jahr)', width: '58px' },
      { label: lastColLabel, width: '46px' }
    ];
    const thead = document.createElement('thead'); const headerRow = document.createElement('tr');
    headers.forEach(({ label, width }, i) => {
      const th = document.createElement('th');
      th.innerHTML = `${label} <span class="sort-icon" style="font-size:9px;opacity:0.7"></span>`;
      th.style.width = width; th.style.whiteSpace = 'pre-line';
      th.addEventListener('click', () => this.sortTableByColumn(i));
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow); table.appendChild(thead);

    const totalUmsatz = isUmsatzMode
      ? Object.values(this.filteredPLZWerte || {}).reduce((s, v) => s + this.getUmsatzSumForPLZ(v), 0)
      : 0;

    const tbody = document.createElement('tbody');
    entries.forEach(([plz, kennwerte], idx) => {
      const tr = document.createElement('tr');
      tr.classList.add('table-row-animated');
      tr.style.animationDelay = `${Math.min(idx * 18, 200)}ms`;
      tr.style.cursor = "pointer";
      tr.dataset.plz = plz;
      tr.addEventListener("click", () => {
        const popupOV=this._shadowRoot.getElementById("side-popup-overview");
        if(popupOV){popupOV.classList.remove("show");popupOV.classList.add("hidden");}
        this.highlightMapArea(plz);
        this.openPopupFromTable(plz);
        this.highlightTableRow(tr);
      });
      let note = (this.geoNotes?.[plz] || "").replace(/^\d{4,5}\s*[-–]?\s*/, "").trim() || "—";
      let symbol = "●", symbolColor = "#dee2e6";
      if (this.filteredKennwerte[plz]?.isCritical) { symbol = "▲"; symbolColor = "#f0a500"; }
      else if (this.filteredKennwerte[plz]?.isHZ)  { symbol = "●"; symbolColor = "#33a02c"; }

      const umsatz = kennwerte["value_hr_n_umsatz_0"]?.raw?.toLocaleString('de-DE') ?? '–';

      let lastColVal;
      if (isUmsatzMode) {
        const plzUmsatz = this.getUmsatzSumForPLZ(this.filteredPLZWerte?.[plz] || {});
        lastColVal = totalUmsatz > 0
          ? (plzUmsatz / totalUmsatz * 100).toFixed(1) + ' %'
          : '–';
      } else {
        lastColVal = (kennwerte["value_wk_in_percent_0"]?.raw?.toFixed(1) ?? '–') + ' %';
      }

      [[plz,  'font-variant-numeric:tabular-nums;font-size:0.78rem;color:#495057;'],
       [note, 'color:#6c757d;'],
       [null,  'text-align:center;'],
       [umsatz,'text-align:right;font-variant-numeric:tabular-nums;'],
       [lastColVal,'text-align:right;font-variant-numeric:tabular-nums;']
      ].forEach(([text, style], i) => {
        const td = document.createElement('td');
        if (i === 2) td.innerHTML = `<span style="color:${symbolColor};font-size:10px">${symbol}</span>`;
        else td.textContent = text;
        if (style) td.style.cssText += style;
        td.style.width = headers[i].width;
        td.style.padding = '6px 8px'; td.style.borderBottom = '1px solid #f1f3f5';
        td.style.fontSize = '0.8rem'; td.style.whiteSpace = 'nowrap';
        td.style.overflow = 'hidden'; td.style.textOverflow = 'ellipsis';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody); scrollWrapper.appendChild(table); container.appendChild(scrollWrapper);
    const footer = document.createElement("div"); footer.id = "streuverlust-box"; container.appendChild(footer);
    if (this._sortState?.column != null) this.updateSortIcons(this._sortState.column);
    this.updateStreuverlustFooter();
    if (this._activePopupPLZ) {
      const rows = container.querySelectorAll('tbody tr');
      rows.forEach(row => { if (row.dataset.plz === this._activePopupPLZ) this.highlightTableRow(row); });
    }
  }

  highlightTableRow(rowElement) {
    if (this._lastHighlightedRow) this._lastHighlightedRow.classList.remove("table-row-selected");
    rowElement.classList.add("table-row-selected");
    this._lastHighlightedRow = rowElement;
  }

  highlightTableRowByPLZ(plz) {
    const container = this._shadowRoot.getElementById("table-container");
    const rows = container.querySelectorAll("tbody tr");
    rows.forEach(row => { if (row.dataset.plz === plz || row.children[0]?.textContent?.trim() === plz) this.highlightTableRow(row); });
  }

  openPopupFromTable(plz) {
    if (!this._layerByPLZ) return;
    const targetLayer = this._layerByPLZ[plz]; if (!targetLayer) return;
    const popupWK = this._shadowRoot.getElementById("side-popup");
    const popupUmsatz = this._shadowRoot.getElementById("side-popup-umsatz");
    const popupOV = this._shadowRoot.getElementById("side-popup-overview");
    popupWK?.classList.remove("show"); popupWK?.classList.add("hidden");
    popupUmsatz?.classList.remove("show"); popupUmsatz?.classList.add("hidden");
    if (popupOV) { popupOV.classList.remove("show"); popupOV.classList.add("hidden"); }
    if (this.currentMapMode === "umsatz-multi" || this.currentMapMode === "werbeanteil") {
      const values = this.filteredPLZWerte?.[plz];
      values ? this.showUmsatzPopup(plz, values) : this.showEmptyUmsatzPopup(plz);
      return;
    }
    const kennwerte = this.filteredKennwerte?.[plz] || {};
    this.showPopup(targetLayer.feature, kennwerte);
  }

  _buildDistanceCache() {
    if (!this._layerByPLZ || !this.nlMarkers || this.nlMarkers.length === 0) return;

    const nlFingerprint = this.nlMarkers.map(m => m.lat.toFixed(4) + "," + m.lng.toFixed(4)).join("|");
    if (this._distanceCacheNLKey === nlFingerprint && this._distanceCache && Object.keys(this._distanceCache).length > 0) {
      return;
    }
    this._distanceCacheNLKey = nlFingerprint;
    this._distanceCache = {};
    if (!this._plzCenterCache) this._plzCenterCache = {};

    // Alle NL-Koordinaten als Array für schnellen Zugriff
    const nls = this.nlMarkers.map(m => ({ lat: m.lat, lng: m.lng }));
    const nlLen = nls.length;
    const plzList = Object.keys(this._layerByPLZ);
    const cache = this._distanceCache;
    const centerCache = this._plzCenterCache;
    const layerByPLZ = this._layerByPLZ;

    // Haversine inline (kein this.getDistanceKm() Overhead)
    const R = 6371;
    const toRad = d => d * Math.PI / 180;

    // Alles synchron aber mit gecachten Centern – keine Async nötig,
    // getBounds().getCenter() war der eigentliche Flaschenhals
    for (let i = 0, len = plzList.length; i < len; i++) {
      const plz = plzList[i];
      if (!centerCache[plz]) {
        const b = layerByPLZ[plz].getBounds();
        centerCache[plz] = { lat: (b._southWest.lat + b._northEast.lat) / 2, lng: (b._southWest.lng + b._northEast.lng) / 2 };
      }
      const { lat: lat1, lng: lng1 } = centerCache[plz];
      const rlat1 = toRad(lat1);
      let minDist = Infinity;
      for (let j = 0; j < nlLen; j++) {
        const { lat: lat2, lng: lng2 } = nls[j];
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lng2 - lng1);
        const a = Math.sin(dLat/2)**2 + Math.cos(rlat1) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
        const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        if (d < minDist) minDist = d;
      }
      cache[plz] = minDist;
    }
  }

  highlightMapArea(plz) {
    if (!this._layerByPLZ) return;
    const targetLayer = this._layerByPLZ[plz];
    if (!targetLayer) return;
    if (this._lastHighlightedLayer && this._lastHighlightedLayer !== targetLayer) {
      this.applyStyleToLayer(this._lastHighlightedLayer);
    }
    this._highlightedPLZ = plz;
    targetLayer.setStyle({ weight: 3, color: "#f0a500", fillOpacity: 0.72 });
    this._lastHighlightedLayer = targetLayer;
  }

  updateSortIcons(activeIndex) {
    const headerCells = this._shadowRoot.querySelectorAll("th .sort-icon");
    headerCells.forEach((icon, i) => { icon.textContent = i===activeIndex ? (this._sortState.direction==="asc"?"▲":"▼") : ""; });
  }

  zoomToFilteredPLZ() {
    if (!this._layerByPLZ || !this.plzImRadius || this.plzImRadius.size === 0) return;
    const bounds = L.latLngBounds([]);
    // layerByPLZ statt eachLayer – direkte O(radius) statt O(allPLZ) Iteration
    this.plzImRadius.forEach(plz => {
      const layer = this._layerByPLZ[plz];
      if (layer) { const lb = layer.getBounds?.(); if (lb) bounds.extend(lb); }
    });
    if (bounds.isValid()) this.map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
  }

  initializeMapBase() {
    const $ = id => this._shadowRoot.getElementById(id);
    const mapContainer = $("map"); if (!mapContainer) return;
    // Canvas-Renderer: alle ~8000 PLZ-Polygone in einem einzigen GPU-Paint statt
    // tausenden einzelner SVG-DOM-Elemente – eliminiert den Zoom-Lag
    this._canvasRenderer = L.canvas({ padding: 0.5 });
    this.map = L.map(mapContainer, {
      preferCanvas: true,
      renderer: this._canvasRenderer,
      zoomAnimation: true,
      markerZoomAnimation: true,
    }).setView([49.4, 8.7], 7);
    this.currentMapMode = "wk"; this.activePopupType = "wk"; this.umsatzDarstellung = "abs";
    this.umsatzMainMode = "gesamt"; this.useWerbeUmsatz = true; this.useZusatzUmsatz = false;
    this.activeCategories = new Set(["stationaer"]); this.showBestreuung = false; this.useRadiusFilter = true;
    this.filteredGroup = L.layerGroup().addTo(this.map); this.neighbourGroup = L.layerGroup().addTo(this.map);
    this.radiusGroup = L.layerGroup().addTo(this.map); this.bestreuungGroup = L.layerGroup().addTo(this.map);

    // Karte ist jetzt bereit. Wenn Daten bereits vorlagen (_pendingRender),
    // sofort render() aufrufen – sonst normaler render()-Aufruf (der bei
    // fehlendem dataSource nichts tut).
    if (this._pendingRender) {
      this._pendingRender = false;
      if (this._myDataSource?.state === "success") {
        this.render();
      } else if (this._myDataSource) {
        this._scheduleDataPoll();
      }
      // Falls noch kein myDataSource gesetzt wurde: render() wird vom Setter ausgelöst
    } else {
      this.render();
    }
    this.initRadiusSlider();

    const panel=$("map-control-panel"),btnWK=$("btn-wk"),btnUmsatz=$("btn-umsatz"),umsatzPanel=$("umsatz-panel");
    const wkExtra=$("wk-extra"),umsatzOptionsRow=$("umsatz-options-row"),typeSwitch=$("umsatz-type-switch");
    const darstellungSwitch=$("umsatz-analysis-switch");
    const btnAbs=darstellungSwitch?.querySelector(".mode-abs"),btnHH=darstellungSwitch?.querySelector(".mode-hh"),btnWA=darstellungSwitch?.querySelector(".mode-werbeanteil");
    const werbeRow=$("werbe-options-row"),chkWerbe=$("chk-werbeumsatz"),chkMit=$("chk-mitgekauft");
    const chkBestreuung=$("chk-bestreuung"),chkDoppel=$("chk-doppelbestreuung");
    this.showCritical = chkDoppel.checked;

    $("map-tile-toggle-btn")?.addEventListener("click", () => this.toggleMapTiles());
    $("legend-toggle-btn")?.addEventListener("click", () => $("heatmap-legend").classList.toggle("hidden"));
    $("back-to-home-btn")?.addEventListener("click", () => this._resetToHome());
    $("overview-toggle-btn")?.addEventListener("click", () => this.showOverviewPopup());
    btnWA?.classList.add("disabled");

    const updateSliderFill = (slider) => {
      if (!slider) return;
      const pct = ((+slider.value - +slider.min) / (+slider.max - +slider.min)) * 100;
      slider.style.background = `linear-gradient(90deg, var(--red) ${pct}%, var(--gray-200) ${pct}%)`;
    };
    updateSliderFill($("radius-slider"));

    const refreshMapAndPopup = () => {
      this._refreshAll();
      this._rerenderActivePopup();
    };

    btnWK?.addEventListener("click", () => {
      this.closeAllPopups();
      btnWK.classList.add("active"); btnUmsatz.classList.remove("active");
      this.currentMapMode = "wk"; this.activePopupType = "wk";
      wkExtra.style.display = ""; umsatzOptionsRow.classList.add("hidden");
      umsatzPanel.classList.add("hidden"); panel.classList.remove("panel-large","panel-medium");
      this.showCritical = chkDoppel.checked;
      this.umsatzDarstellung = "abs";
      darstellungSwitch.querySelectorAll("span").forEach(s => s.classList.remove("active"));
      btnAbs.classList.add("active"); btnWA.classList.add("disabled");
      this.bestreuungGroup?.clearLayers();
      if (this._activeFilter) { this.prepareUmsatzPLZWerte(); this.computeWKKennwerte(); }
      this.updateGeoLayer(); this.updateHeatmapLegend();
      if (this._activeFilter) { this.renderDataTable(this.filteredKennwerte); this.showOverviewPopup(); }
    });

    btnUmsatz?.addEventListener("click", () => {
      typeSwitch.classList.remove("active-right");
      typeSwitch.classList.add("active-left");
      btnUmsatz.classList.add("active"); btnWK.classList.remove("active");
      this.closeAllPopups(); this.currentMapMode = "umsatz-multi"; this.activePopupType = "umsatz";
      if (this._activeFilter) { this.prepareUmsatzPLZWerte(); this.computeWKKennwerte(); }
      wkExtra.style.display = "none"; umsatzOptionsRow.classList.remove("hidden");
      umsatzPanel.classList.remove("hidden"); panel.classList.remove("panel-medium"); panel.classList.add("panel-large");
      this.umsatzDarstellung = "abs";
      darstellungSwitch.querySelectorAll("span").forEach(s => s.classList.remove("active"));
      btnAbs.classList.add("active"); btnWA.classList.add("disabled");
      if (!this.showBestreuung) this.bestreuungGroup?.clearLayers();
      this.updateGeoLayer(); this.updateHeatmapLegend();
      if (this._activeFilter) { this.renderDataTable(this.filteredKennwerte); this.showOverviewPopup(); }
    });

    typeSwitch?.addEventListener("click", () => {
      const isWerbung = this.umsatzMainMode === "gesamt"; this.umsatzMainMode = isWerbung ? "werbung" : "gesamt";
      typeSwitch.classList.toggle("active-right", isWerbung); typeSwitch.classList.toggle("active-left", !isWerbung);
      werbeRow.style.display = isWerbung ? "flex" : "none";
      if (isWerbung) { btnWA.classList.remove("disabled"); this.useWerbeUmsatz=true; this.useZusatzUmsatz=false; chkWerbe.checked=true; chkMit.checked=false; chkMit.disabled=false; }
      else { btnWA.classList.add("disabled"); this.umsatzDarstellung="abs"; darstellungSwitch.querySelectorAll("span").forEach(s=>s.classList.remove("active")); btnAbs.classList.add("active"); }
      refreshMapAndPopup();
    });

    chkWerbe?.addEventListener("change", () => {
      this.useWerbeUmsatz = chkWerbe.checked;
      if (!this.useWerbeUmsatz && !this.useZusatzUmsatz) { this.useWerbeUmsatz=true; chkWerbe.checked=true; }
      refreshMapAndPopup();
    });
    chkMit?.addEventListener("change", () => {
      this.useZusatzUmsatz = chkMit.checked;
      if (!this.useWerbeUmsatz && !this.useZusatzUmsatz) { this.useWerbeUmsatz=true; chkWerbe.checked=true; }
      refreshMapAndPopup();
    });

    const setDarst = (modus, mapMode, btn) => {
      this.umsatzDarstellung=modus; this.currentMapMode=mapMode; this.activePopupType="umsatz";
      darstellungSwitch.querySelectorAll("span").forEach(s=>s.classList.remove("active")); btn.classList.add("active");
    };
    btnAbs?.addEventListener("click", () => { setDarst("abs","umsatz-multi",btnAbs); refreshMapAndPopup(); });
    btnHH?.addEventListener("click",  () => { setDarst("hh","umsatz-multi",btnHH);  refreshMapAndPopup(); });
    btnWA?.addEventListener("click", () => {
      if (this.umsatzMainMode !== "werbung") return;
      setDarst("werbeanteil","werbeanteil",btnWA);
      chkWerbe.checked=true; this.useWerbeUmsatz=true; chkMit.checked=false; chkMit.disabled=true; this.useZusatzUmsatz=false;
      refreshMapAndPopup();
    });

    this._shadowRoot.querySelectorAll(".category-toggle").forEach(toggle => {
      toggle.addEventListener("click", () => {
        const cat = toggle.dataset.cat; if (!cat) return;
        if (this.activeCategories.has(cat)) { this.activeCategories.delete(cat); toggle.classList.remove("active"); }
        else { this.activeCategories.add(cat); toggle.classList.add("active"); }
        this.currentMapMode = "umsatz-multi"; this.activePopupType = "umsatz";
        refreshMapAndPopup();
      });
    });

    chkDoppel?.addEventListener("change", () => { this.showCritical=chkDoppel.checked; this.updateGeoLayer(); this.updateHeatmapLegend(); });
    chkBestreuung?.addEventListener("change", () => { this.showBestreuung=chkBestreuung.checked; this.updateBestreuungMarkers(); this.updateHeatmapLegend(); });
  }

  _rerenderActivePopup() {
    if (!this._activePopupPLZ) return;
    const plz = this._activePopupPLZ;
    if (this._activePopupType === 'umsatz' || this.currentMapMode === 'umsatz-multi' || this.currentMapMode === 'werbeanteil') {
      const values = this.filteredPLZWerte?.[plz];
      if (values) this.showUmsatzPopup(plz, values);
      else this.showEmptyUmsatzPopup(plz);
    } else {
      const layer = this._layerByPLZ?.[plz];
      if (layer) {
        const kennwerte = this.filteredKennwerte?.[plz] || {};
        this.showPopup(layer.feature, kennwerte);
      }
    }
  }

  _computeCrossErhebungDoppel() {
    this._crossErhebungPLZ = {};
    if (!this._activeFilter || !this._myDataSource?.data) return;
    const { erhID: aktErhID, jahr, nummer } = this._activeFilter;

    const aktHZPLZs = new Set(
      Object.entries(this.filteredKennwerte || {})
        .filter(([, k]) => k.isHZ)
        .map(([plz]) => plz)
    );
    if (aktHZPLZs.size === 0) return;

    // PERF: Index nutzen – alle Erhebungen mit gleichem Jahr+Nummer direkt abrufen
    // statt linearen Scan über alle Rohdaten
    const allKeys = Object.keys(this._erhebungIndex || {});
    const fremdRows = [];
    for (const k of allKeys) {
      const [rErhID, rJahr, rNummer] = k.split("|");
      if (rErhID === aktErhID || rJahr !== jahr || rNummer !== nummer) continue;
      const rows = this._erhebungIndex[k];
      for (let i = 0; i < rows.length; i++) {
        if (rows[i]["dimension_hzflag_0"]?.id?.trim() === "X") fremdRows.push(rows[i]);
      }
    }

    fremdRows.forEach(row => {
      const rawPLZ = row["dimension_plz_0"]?.id ?? row["dimension_plz_0"]?.raw;
      // FIX 2: _normalizePLZ verwenden
      const plz = this._normalizePLZ(rawPLZ);
      if (!plz) return;
      if (!aktHZPLZs.has(plz)) return;

      const rErhID = row["dimension_erhebung_0"]?.id?.trim();
      const rNL    = row["dimension_niederlassung_0"]?.id?.trim();

      if (!this._crossErhebungPLZ[plz]) this._crossErhebungPLZ[plz] = {};
      if (!this._crossErhebungPLZ[plz][rErhID]) {
        this._crossErhebungPLZ[plz][rErhID] = new Set();
      }
      if (rNL) this._crossErhebungPLZ[plz][rErhID].add(rNL);
    });

    if (this.filteredData) {
      this.filteredData.forEach(row => {
        const rawPLZ = row["dimension_plz_0"]?.id ?? row["dimension_plz_0"]?.raw;
        // FIX 2: _normalizePLZ verwenden
        const plz = this._normalizePLZ(rawPLZ);
        if (!plz) return;
        const isHZ = row["dimension_hzflag_0"]?.id?.trim() === "X";
        if (!isHZ) return;
        const nl = row["dimension_niederlassung_0"]?.id?.trim();

        const isInternalCritical = this.filteredKennwerte?.[plz]?.isCritical;
        const hasCrossEntry = !!this._crossErhebungPLZ[plz];

        if (!isInternalCritical && !hasCrossEntry) return;

        if (!this._crossErhebungPLZ[plz]) this._crossErhebungPLZ[plz] = {};
        if (!this._crossErhebungPLZ[plz][aktErhID]) {
          this._crossErhebungPLZ[plz][aktErhID] = new Set();
        }
        if (nl) this._crossErhebungPLZ[plz][aktErhID].add(nl);
      });
    }
  }

  updateBestreuungMarkers() {
    this.bestreuungGroup.clearLayers();
    if (this.currentMapMode === "wk") return;
    if (!this.showBestreuung || !this._layerByPLZ) return;
    Object.keys(this._layerByPLZ).forEach(plz => {
      const daten = this.filteredKennwerte?.[plz];
      if (!daten?.isHZ) return;
      const layer = this._layerByPLZ[plz];
      const pulseLayer = L.geoJSON(layer.feature, {
        renderer: this._canvasRenderer,
        style: {
          fillColor: 'transparent', fill: false,
          color: '#1565c0', weight: 2.5,
          opacity: 0.85, dashArray: '6 3',
          className: 'bestreuung-pulse-path'
        },
        interactive: false
      });
      this.bestreuungGroup.addLayer(pulseLayer);
    });
  }

  initializeMapTiles() { if (!this.map) return; this._tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(this.map); }
  removeMapTiles() { if (this.map && this._tileLayer) { this.map.removeLayer(this._tileLayer); this._tileLayer = null; } }
  toggleMapTiles() { if (this._tilesVisible) { this.removeMapTiles(); this._tilesVisible=false; } else { this.initializeMapTiles(); this._tilesVisible=true; } }
  toggleNeighbours() { if (this.map.hasLayer(this.neighbourGroup)) this.map.removeLayer(this.neighbourGroup); else this.map.addLayer(this.neighbourGroup); }

  createAllMarkers() {
    if (!this.filteredGroup) return;
    this.filteredGroup.clearLayers(); this.neighbourGroup?.clearLayers(); this.radiusGroup?.clearLayers();
    this.allMarkers = []; this.nlMarkers = [];
    if (!this.Niederlassung || !this.nlKoordinaten) return;
    const seen = new Set();
    Object.entries(this.Niederlassung).forEach(([nlKey, nlName]) => {
      const coords = this.nlKoordinaten[nlKey]; if (!coords || seen.has(nlKey)) return;
      const marker = L.marker([coords.lat, coords.lon], { icon: this.createMarkerIcon(nlName), title: nlName, plzs: [nlKey] });
      marker.setZIndexOffset(1000); marker.on("click", () => this.toggleNLSelection(nlKey));
      this.allMarkers.push(marker); this.filteredGroup.addLayer(marker);
      this.nlMarkers.push({ lat: coords.lat, lng: coords.lon, marker }); seen.add(nlKey);
    });
    if (Array.isArray(this.extraNLs)) {
      this.extraNLs.forEach(({ nl, lat, lon }) => {
        const marker = L.marker([lat, lon], { icon: this.createMarkerIcon(nl), title: nl, plzs: [nl] });
        marker.setZIndexOffset(1000); marker.on("click", () => this.toggleNLSelection(nl));
        this.allMarkers.push(marker); this.filteredGroup.addLayer(marker); this.nlMarkers.push({ lat, lng: lon, marker });
      });
    }
    this.allNLs = [...Object.keys(this.Niederlassung), ...(this.extraNLs?.map(e=>e.nl)??[])];
    this._selectedNLs = new Set(this.allNLs);
    this._nlSelectionInitialized = false;

    this.applyNLFilter([...this._selectedNLs]);
    const radius = Number(this._shadowRoot.getElementById("radius-slider")?.value??0);
    this.applyRadiusFilter(radius); this.updateGeoLayer(); this.updateNLSelectionUI?.(); this._buildDistanceCache();
  }

  applyNLFilter(selectedNLs) {
    if (!this._selectedNLs) this._selectedNLs = new Set();
    this._selectedNLs = new Set(selectedNLs);
    if (!this.filteredData || this.filteredData.length === 0) return;
    // PERF: kombinierter for-loop statt filter().map().filter()
    const _plzSet = new Set();
    const _selNLs = this._selectedNLs;
    const _data   = this.filteredData;
    for (let i = 0, len = _data.length; i < len; i++) {
      const row = _data[i];
      const nl  = row["dimension_niederlassung_0"]?.id?.trim();
      if (_selNLs.size > 0 && !_selNLs.has(nl)) continue;
      const plz = this._normalizePLZ(row["dimension_plz_0"]?.id);
      if (plz) _plzSet.add(plz);
    }
    this.filteredPLZs = [..._plzSet];
    this.updateMarkers(); this.computeWKKennwerte();
    const radius = Number(this._shadowRoot.getElementById("radius-slider").value);
    this.currentRadius = radius; this.applyRadiusFilter(radius); this.prepareUmsatzPLZWerte(); this.computeStreuverlust();
    // Kein _rerenderActivePopup hier – toggleNLSelection/showOverviewPopup übernimmt das
  }

  createMarkerIcon(nl, isPhantom = false) {
    if (!this.iconCache) this.iconCache = {};
    const key = nl + (isPhantom ? "_phantom" : "_active");
    if (!this.iconCache[key]) {
      const color = isPhantom ? "#8c9099" : "#b41821";
      const border = isPhantom ? "1.5px solid rgba(60,60,80,0.4)" : "none";
      const shadow = isPhantom ? "-1px 2px 4px rgba(0,0,0,0.25)" : "-1px 2px 6px rgba(180,24,33,0.4)";
      const opacity = isPhantom ? 0.75 : 1;
      const markerHtml = `<div style="width:30px;height:30px;background-color:${color};opacity:${opacity};border-radius:50% 50% 50% 0;box-shadow:${shadow};transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:white;font-family:system-ui;border:${border};"><div style="transform:rotate(45deg)">${nl}</div></div>`;
      this.iconCache[key] = L.divIcon({ html: markerHtml, className: "", iconSize: [30, 30], iconAnchor: [15, 30] });
    }
    return this.iconCache[key];
  }

  showPopup(feature, daten) {
    const plz = String(feature.properties?.plz??"").padStart(5,"0").trim();
    const note = feature.properties?.note || "Keine Notiz";
    this._activePopupPLZ = plz; this._activePopupType = 'wk';

    const popupUmsatz = this._shadowRoot.getElementById("side-popup-umsatz");
    if (popupUmsatz) { popupUmsatz.classList.remove("show"); popupUmsatz.classList.add("hidden"); }
    const panel = this._shadowRoot.getElementById("map-control-panel");
    panel.classList.remove("panel-large"); panel.classList.add("panel-medium");
    const umsatz = this.filteredPLZWerte?.[plz] || {};
    let symbol = "📍";
    if (daten?.isCritical) symbol = "⚠️"; else if (daten?.isHZ) symbol = "✅";
    const beschreibungen = {
      value_hr_n_umsatz_0:"Netto-Umsatz (Jahr)",value_umsatz_p_hh_0:"Umsatz p. HH",
      value_wk_in_percent_0:"Werbekosten (%)",value_wk_nachbar_0:"WK (%) inkl. Nachb.",
      value_hz_kosten_0:"HZ-Werbekosten",value_werbeverweigerer_0:"Werbeverweigerer (%)",
      value_haushalte_0:"Haushalte",value_kaufkraft_0:"BM-Kaufkraft-Idx",
      value_ums_erhebung_0:"Umsatz",value_kd_erhebung_0:"Anzahl Kunden",
      value_bon_erhebung_0:"Ø-Bon",value_auflage_0:"Auflage"
    };
    // Bug-Fix: lokale Kopie statt direkter Mutation von filteredKennwerte
    const d = { ...daten };
    d.value_umsatz_p_hh_0 = { raw: umsatz.umsatzProHaushalt ?? 0 };
    d.value_haushalte_0   = { raw: umsatz.haushalte ?? 0 };
    d.value_kaufkraft_0   = { raw: umsatz.kaufkraftIndex ?? 0 };
    const kd = d.value_kd_erhebung_0?.raw ?? 0, ue = d.value_ums_erhebung_0?.raw ?? 0;
    d.value_bon_erhebung_0 = { raw: kd > 0 ? Number((ue / kd).toFixed(2)) : 0 };
    let rows = "";
    Object.entries(beschreibungen).forEach(([id, label], index) => {
      const rawValue=d?.[id]?.raw, wert=typeof rawValue==="number"?rawValue.toLocaleString("de-DE"):"–";
      if (index===8) rows += `<tr><td colspan="2" class="section-title">Erhebungsdaten</td></tr>`;
      rows += `<tr><td class="label-cell">${label}</td><td class="value-cell">${wert}</td></tr>`;
    });
    const sidePopup = this._shadowRoot.getElementById("side-popup");
    sidePopup.innerHTML = `
      <div class="popup-header-strip">
        <div class="popup-location">PLZ ${plz}</div>
        <div class="popup-title" title="${note}">${symbol} ${note}</div>
        <button class="close-btn">✕</button>
      </div>
      <table><thead><tr><th colspan="2" class="subtitle-cell">Hochrechnung Jahr</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
    sidePopup.classList.remove("hidden"); void sidePopup.offsetWidth; sidePopup.classList.add("show");
    sidePopup.querySelector(".close-btn").onclick = () => {
      sidePopup.classList.remove("show"); sidePopup.classList.add("hidden");
      this._activePopupPLZ = null; this._activePopupType = null;
      if (this._highlightedPLZ) { const l = this._layerByPLZ?.[this._highlightedPLZ]; if (l) this.applyStyleToLayer(l); this._highlightedPLZ = null; }
    };
  }

  showUmsatzPopup(plz, values) {
    const popup = this._shadowRoot.getElementById("side-popup-umsatz");
    const popupWK = this._shadowRoot.getElementById("side-popup");
    if (popupWK) { popupWK.classList.remove("show"); popupWK.classList.add("hidden"); }
    this._activePopupPLZ = plz; this._activePopupType = 'umsatz';

    const panel = this._shadowRoot.getElementById("map-control-panel");
    panel.classList.remove("panel-large"); panel.classList.add("panel-medium");

    const isWerbungMode = this.umsatzMainMode === "werbung";
    const useWerbe  = this.useWerbeUmsatz  === true;
    const useZusatz = this.useZusatzUmsatz === true;
    const note = this.geoNotes?.[plz] || plz;

    const pick = (base, werb, zusatz, baseHH, werbHH, zusatzHH) => {
      if (!isWerbungMode) return { abs: base, hh: baseHH };
      let abs = 0, hh = 0;
      if (useWerbe)  { abs += werb;   hh += werbHH;  }
      if (useZusatz) { abs += zusatz; hh += zusatzHH; }
      return { abs, hh };
    };

    const st = pick(values.umsatz,    values.umsatzWerbung,    values.umsatzZusatz,    values.umsatzProHaushalt,    values.umsatzWerbungProHaushalt,    values.umsatzZusatzProHaushalt);
    const pc = pick(values.pluscard,  values.pluscardWerbung,  values.pluscardZusatz,  values.pluscardProHaushalt,  values.pluscardWerbungProHaushalt,  values.pluscardZusatzProHaushalt);
    const ra = pick(values.ra,        values.raWerbung,        values.raZusatz,        values.raProHaushalt,        values.raWerbungProHaushalt,        values.raZusatzProHaushalt);
    const os = pick(values.onlineshop,values.onlineshopWerbung,values.onlineshopZusatz,values.onlineshopProHaushalt,values.onlineshopWerbungProHaushalt,values.onlineshopZusatzProHaushalt);

    const active = {
      stationaer: this.activeCategories.has("stationaer"),
      pluscard:   this.activeCategories.has("pluscard"),
      ra:         this.activeCategories.has("ra"),
      online:     this.activeCategories.has("online"),
    };

    const totalAbs = (active.stationaer?st.abs:0)+(active.pluscard?pc.abs:0)+(active.ra?ra.abs:0)+(active.online?os.abs:0);
    const totalHH  = (active.stationaer?st.hh:0) +(active.pluscard?pc.hh:0) +(active.ra?ra.hh:0) +(active.online?os.hh:0);

    const tN = values.umsatz    + values.pluscard    + values.ra    + values.onlineshop;
    const tW = values.umsatzWerbung + values.pluscardWerbung + values.raWerbung + values.onlineshopWerbung;
    const tZ = values.umsatzZusatz  + values.pluscardZusatz  + values.raZusatz  + values.onlineshopZusatz;
    const antWA = tN > 0 ? ((tW / tN) * 100).toFixed(1) : "–";

    const fA  = x => Number(x||0).toLocaleString("de-DE");
    const fH  = x => Number(x||0).toFixed(2);
    const pct = (x, t) => t > 0 ? (x / t) * 100 : 0;

    const hl = !isWerbungMode ? "Gesamtumsatz"
             : useWerbe && useZusatz ? "Werbeumsatz + Mitgekauft"
             : useWerbe ? "Werbeumsatz"
             : "Mitgekauft";

    const dis = (key) => !active[key] ? 'opacity:0.3;filter:grayscale(1)' : '';

    popup.innerHTML = `
      <div class="popup-header" style="flex-shrink:0">
        <span title="${note}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${note}</span>
        <button class="close-btn" style="flex-shrink:0">✕</button>
      </div>

      <div style="overflow-y:auto;flex:1;min-height:0;">

        <div class="umsatz-subheader">
          <span class="strong">${hl}: ${fA(totalAbs)} €</span><br>
          <span style="font-size:0.78rem;color:var(--gray-500)">${fH(totalHH)} € / HH &nbsp;·&nbsp; Werbeanteil: ${antWA} %</span>
        </div>

        <div class="umsatz-bar" style="margin:8px 14px 2px">
          <div style="background:var(--red);width:${pct(tN,tN+tW+tZ)}%;transition:width .5s ease"></div>
          <div style="background:#1f78b4;width:${pct(tW,tN+tW+tZ)}%;transition:width .5s ease"></div>
          <div style="background:#ffb000;width:${pct(tZ,tN+tW+tZ)}%;transition:width .5s ease"></div>
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
          <div class="value" style="${dis('stationaer')}">${fA(st.abs)} €</div>
          <div class="value" style="${dis('stationaer')}">${fH(st.hh)} €</div>

          <div class="label" style="${dis('pluscard')}">💳 Pluscard</div>
          <div class="value" style="${dis('pluscard')}">${fA(pc.abs)} €</div>
          <div class="value" style="${dis('pluscard')}">${fH(pc.hh)} €</div>

          <div class="label" style="${dis('ra')}">📦 R&amp;A</div>
          <div class="value" style="${dis('ra')}">${fA(ra.abs)} €</div>
          <div class="value" style="${dis('ra')}">${fH(ra.hh)} €</div>

          <div class="label" style="${dis('online')}">🛒 KUBE OS</div>
          <div class="value" style="${dis('online')}">${fA(os.abs)} €</div>
          <div class="value" style="${dis('online')}">${fH(os.hh)} €</div>
        </div>

        <div class="section-title">Umsatzanteile (Gesamt)</div>
        <div class="umsatz-bar" style="margin:8px 14px 2px">
          <div class="share-stationaer" style="width:${pct(values.umsatz,tN)}%;transition:width .5s ease"></div>
          <div class="share-pluscard"   style="width:${pct(values.pluscard,tN)}%;transition:width .5s ease"></div>
          <div class="share-ra"         style="width:${pct(values.ra,tN)}%;transition:width .5s ease"></div>
          <div class="share-online"     style="width:${pct(values.onlineshop,tN)}%;transition:width .5s ease"></div>
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
          <div style="text-align:right;font-weight:700;color:var(--gray-800)">${Number(values.haushalte||0).toLocaleString("de-DE")}</div>

          <div style="color:var(--gray-600);font-weight:500">Werbeverweigerer</div>
          <div style="text-align:right;font-weight:700;color:var(--gray-800)">${values.werbeverweigerer > 0 ? Number(values.werbeverweigerer).toLocaleString("de-DE") + ' %' : '–'}</div>

          <div style="color:var(--gray-600);font-weight:500">Kaufkraft-Index</div>
          <div style="text-align:right;font-weight:700;color:var(--gray-800)">${values.kaufkraftIndex > 0 ? Number(values.kaufkraftIndex).toLocaleString("de-DE") : '–'}</div>
        </div>

      </div>`;

    popup.classList.remove("hidden"); void popup.offsetWidth; popup.classList.add("show");
    popup.querySelector(".close-btn").onclick = () => {
      popup.classList.remove("show"); popup.classList.add("hidden");
      this._activePopupPLZ = null; this._activePopupType = null;
      if (this._highlightedPLZ) {
        const l = this._layerByPLZ?.[this._highlightedPLZ];
        if (l) this.applyStyleToLayer(l);
        this._highlightedPLZ = null;
      }
    };
  }

  getUmsatzSumForPLZ(v) {
    const safe=x=>Number.isFinite(x)?x:0,isW=this.umsatzMainMode==="werbung",useHH=this.umsatzDarstellung==="hh";
    const pick=(b,w,z,bH,wH,zH)=>{ if(!isW)return safe(useHH?bH:b); let s=0; if(this.useWerbeUmsatz)s+=safe(useHH?wH:w); if(this.useZusatzUmsatz)s+=safe(useHH?zH:z); return s; };
    let s=0;
    if(this.activeCategories.has("stationaer"))s+=pick(v.umsatz,v.umsatzWerbung,v.umsatzZusatz,v.umsatzProHaushalt,v.umsatzWerbungProHaushalt,v.umsatzZusatzProHaushalt);
    if(this.activeCategories.has("pluscard"))  s+=pick(v.pluscard,v.pluscardWerbung,v.pluscardZusatz,v.pluscardProHaushalt,v.pluscardWerbungProHaushalt,v.pluscardZusatzProHaushalt);
    if(this.activeCategories.has("ra"))        s+=pick(v.ra,v.raWerbung,v.raZusatz,v.raProHaushalt,v.raWerbungProHaushalt,v.raZusatzProHaushalt);
    if(this.activeCategories.has("online"))    s+=pick(v.onlineshop,v.onlineshopWerbung,v.onlineshopZusatz,v.onlineshopProHaushalt,v.onlineshopWerbungProHaushalt,v.onlineshopZusatzProHaushalt);
    return s;
  }

  updateNeighbours(filteredData) {}

  extractPLZWerte(data) {
    const plzWerte = {};
    // PERF: for-loop statt forEach
    for (let i = 0, len = data.length; i < len; i++) {
      const row = data[i];
      const plz = this._normalizePLZ(row["dimension_plz_0"]?.id);
      if (!plz) continue;
      const wk    = row["value_wk_in_percent_0"]?.raw;
      const wkPot = row["value_wk_potentiell_0"]?.raw;
      plzWerte[plz] = {
        wk:    typeof wk    === "number" ? wk    : 0,
        wkPot: typeof wkPot === "number" ? wkPot : 0,
        hz:    row["dimension_hzflag_0"]?.id?.trim() === "X"
      };
    }
    return plzWerte;
  }

  getFilteredData() {
    if (!this._myDataSource||this._myDataSource.state!=="success") return [];
    const {erhID,jahr,nummer}=this._activeFilter||{};
    // PERF: Index-Lookup statt Full-Scan
    const filtered = this._getErhebungRows(erhID, jahr, nummer);
    const filteredKennwerte={};
    for (let i = 0, len = filtered.length; i < len; i++) {
      const row = filtered[i];
      const rawPLZ = row["dimension_plz_0"]?.id ?? row["dimension_plz_0"]?.raw;
      const plz = this._normalizePLZ(rawPLZ);
      if (plz) filteredKennwerte[plz] = row;
    }
    this.filteredKennwerte=filteredKennwerte;
    return filtered;
  }

  getColor(value, isHZ) {
    const v=typeof value==="number"&&!isNaN(value)?value:0;
    if(isHZ) return v>25?"#e31a1c":v>15?"#fd8d3c":v>10?"#ffffb2":v>5?"#78c679":v>2?"#41ab5d":v>0?"#006837":"#cfd4da";
    return v>50?"#cfd4da":v>25?"#bdbdbd":v>15?"#969696":v>10?"#6baed6":v>5?"#2171b5":v>0?"#08306b":"#cfd4da";
  }

  updateGeoLayer() {
    if (!this._geoLayer) return;
    this.computeMaxValue();
    if (this.currentMapMode === "wk" && this.showCritical) {
      this._computeCrossErhebungDoppel();
    }
    this._triggerSweepAnimation();
    const index = this._layerByPLZ;
    if (index) { const plzList=Object.keys(index); for(let i=0;i<plzList.length;i++) this.applyStyleToLayer(index[plzList[i]]); }
    else this._geoLayer.eachLayer(layer => this.applyStyleToLayer(layer));
    this.updateBestreuungMarkers();
    this.updateHeatmapLegend();
    if (this._highlightedPLZ) {
      const layer = this._layerByPLZ?.[this._highlightedPLZ];
      if (layer) layer.setStyle({ weight: 3, color: "#f0a500", fillOpacity: layer.options.fillOpacity });
    }
  }

  computeFillColor(plz) {
    const v=this.filteredPLZWerte?.[plz]; if(!v) return "#cfd4da";
    if(this.currentMapMode==="wk") return this.getColor(v.hz?v.wk:v.wkPot,v.hz);
    if(this.currentMapMode==="umsatz-multi") return this.getDynamicHeatColor(this.getUmsatzSumForPLZ(v),this._maxValueCache||1);
    if(this.currentMapMode==="werbeanteil") return this.getWerbeAnteilColor(v.werbeAnteil??0);
    return "#cfd4da";
  }

  computeMaxValue() {
    const plzWerte=this.filteredPLZWerte||{}; let maxValue=0;
    if(this.currentMapMode==="wk") Object.values(plzWerte).forEach(v=>{ const val=v.hz?v.wk:v.wkPot; if(Number.isFinite(val)&&val>maxValue) maxValue=val; });
    if(this.currentMapMode==="umsatz-multi") Object.values(plzWerte).forEach(v=>{ const sum=this.getUmsatzSumForPLZ(v); if(sum>maxValue) maxValue=sum; });
    if(this.currentMapMode==="werbeanteil"){this._maxValueCache=1;return 1;}
    this._maxValueCache=maxValue||1; return this._maxValueCache;
  }

  applyStyleToLayer(layer) {
    const plz=String(layer.feature?.properties?.plz??"").padStart(5,"0");
    const v=this.filteredPLZWerte?.[plz];
    layer.options.interactive=true;
    if(layer._path) layer._path.setAttribute("pointer-events","auto");
    const hasRadius=this.plzImRadius instanceof Set&&this.plzImRadius.size>0;
    let inRadius=true;
    if(this.currentMapMode==="umsatz-multi"||this.currentMapMode==="werbeanteil") inRadius=!this.useRadiusFilter||!hasRadius||this.plzImRadius.has(plz);
    else inRadius=!hasRadius||this.plzImRadius.has(plz);
    if(!v||!inRadius) {
      layer.setStyle({fillColor:"#e9ecef",fillOpacity:0.35,color:"#ffffff",weight:0.8});
      layer.options.interactive=true;
      if(layer._path) layer._path.setAttribute("pointer-events","auto");
      layer.off("click");
      layer.on("click",()=>{
        const popupWK=this._shadowRoot.getElementById("side-popup"),popupU=this._shadowRoot.getElementById("side-popup-umsatz");
        const popupOV=this._shadowRoot.getElementById("side-popup-overview");
        popupWK?.classList.remove("show");popupWK?.classList.add("hidden");popupU?.classList.remove("show");popupU?.classList.add("hidden");
        if(popupOV){popupOV.classList.remove("show");popupOV.classList.add("hidden");}
        if(this.currentMapMode==="umsatz-multi"||this.currentMapMode==="werbeanteil"){this.activePopupType="umsatz";this.showEmptyUmsatzPopup(plz);return;}
        this.activePopupType="wk";this.showPopup(layer.feature,{});
      });
      this._removeCriticalMarker(plz); return;
    }
    const fillColor=this.computeFillColor(plz);
    layer.setStyle({fillColor,fillOpacity:0.72,color:"#ffffff",weight:0.8});
    layer.options.interactive=true;
    if(layer._path) layer._path.setAttribute("pointer-events","auto");
    layer.off("click");
    layer.on("click",()=>{
      const values=this.filteredPLZWerte?.[plz];
      const popupWK=this._shadowRoot.getElementById("side-popup"),popupU=this._shadowRoot.getElementById("side-popup-umsatz");
      const popupOV=this._shadowRoot.getElementById("side-popup-overview");
      popupWK?.classList.remove("show");popupWK?.classList.add("hidden");popupU?.classList.remove("show");popupU?.classList.add("hidden");
      if(popupOV){popupOV.classList.remove("show");popupOV.classList.add("hidden");}
      this.highlightMapArea(plz); this.highlightTableRowByPLZ(plz);
      if(this.currentMapMode==="umsatz-multi"||this.currentMapMode==="werbeanteil"){
        this.activePopupType="umsatz"; values?this.showUmsatzPopup(plz,values):this.showEmptyUmsatzPopup(plz); return;
      }
      this.activePopupType="wk";this.showPopup(layer.feature,this.filteredKennwerte?.[plz]||{});
    });

    const showCritical=this.currentMapMode==="wk"&&this.showCritical;
    const isCriticalIntern = this.filteredKennwerte?.[plz]?.isCritical;
    const isCriticalCross  = !!(this._crossErhebungPLZ?.[plz] && Object.keys(this._crossErhebungPLZ[plz]).length > 0);
    const isCritical = isCriticalIntern || isCriticalCross;
    if(!showCritical||!isCritical){this._removeCriticalMarker(plz);return;}
    if(!this.criticalMarkers) this.criticalMarkers={};
    if(!this.criticalMarkers[plz]) {
      const center=layer.getBounds().getCenter();
      const crossInfo = this._crossErhebungPLZ?.[plz];
      const isCrossErhebung = crossInfo && Object.keys(crossInfo).length > 0;

      const icon=L.divIcon({
        html:`<div style="font-size:18px;line-height:1;animation:criticalPulse 1.8s ease-in-out infinite;display:block;transform-origin:center;cursor:pointer;" title="">⚠️</div>`,
        className:"",iconSize:[22,22],iconAnchor:[11,11]
      });
      const marker = L.marker(center,{icon,interactive:true,zIndexOffset:2000}).addTo(this.map);

      if (isCrossErhebung || true) {
        const mapContainer = this._shadowRoot.querySelector(".map-container");
        marker.on("mouseover", (e) => {
          this._showDoppelTooltip(plz, e.originalEvent, mapContainer);
        });
        marker.on("mouseout", () => {
          this._hideDoppelTooltip();
        });
        marker.on("mousemove", (e) => {
          this._moveDoppelTooltip(e.originalEvent, mapContainer);
        });
      }

      this.criticalMarkers[plz]=marker;
    }
  }

  _removeCriticalMarker(plz) {
    if(this.criticalMarkers?.[plz]){this.map.removeLayer(this.criticalMarkers[plz]);delete this.criticalMarkers[plz];}
  }

  getDynamicHeatColor(value, max) {
    value=Number(value);max=Number(max);
    if(!Number.isFinite(value)||value<=0||!Number.isFinite(max)||max<=0) return "#cfd4da";
    const r=value/max;
    return r>.95?"#7a0f17":r>.85?"#9d131b":r>.75?"#b41821":r>.65?"#d9483b":r>.55?"#e96a3a":r>.45?"#f08a3c":r>.35?"#f6b65b":r>.20?"#f7d77a":"#fce9b2";
  }
  getWerbeAnteilColor(ratio) {
    if(!Number.isFinite(ratio)||ratio<=0) return "#cfd4da";
    return ratio>.80?"#7a0f17":ratio>.60?"#b41821":ratio>.40?"#e96a3a":ratio>.20?"#f6b65b":ratio>.10?"#f7d77a":"#fce9b2";
  }

  updateMarkers() {
    if(!this.filteredGroup||!this.allMarkers) return;
    this.filteredGroup.clearLayers();
    const filteredData=this.filteredData||[]; if(!filteredData.length) return;
    const erhNLs=new Set(filteredData.map(row=>row["dimension_niederlassung_0"]?.id?.trim()).filter(Boolean));
    const activeMarkers=[];
    this.allMarkers.forEach(marker=>{
      const nl=marker.options.plzs?.[0]; if(!nl||!erhNLs.has(nl)) return;
      this.filteredGroup.addLayer(marker);
      const isSelected=!this._selectedNLs?.size||this._selectedNLs.has(nl);
      marker.setIcon(this.createMarkerIcon(nl,!isSelected));
      marker.off("mouseover"); marker.off("mouseout");
      marker.on("mouseover",()=>{
        const el=marker.getElement();
        if(el){ el.style.filter="brightness(1.2)"; el.style.zIndex="10000"; }
      });
      marker.on("mouseout",()=>{
        const el=marker.getElement();
        if(el){ el.style.filter=""; el.style.zIndex=""; }
      });
      if(isSelected){marker.setZIndexOffset(1000);activeMarkers.push(marker);}
      else marker.setZIndexOffset(100);
    });
    this.nlMarkers=activeMarkers.map(m=>({lat:m.getLatLng().lat,lng:m.getLatLng().lng,marker:m}));
  }

  onMarkerClick(nl) {
    if(this._selectedNLs.has(nl)) this._selectedNLs.delete(nl); else this._selectedNLs.add(nl);
    this.updateNLSelectionUI(); this.applyNLFilter([...this._selectedNLs]);
    const radius=Number(this._shadowRoot.getElementById("radius-slider").value);
    this.applyRadiusFilter(radius); this.updateGeoLayer(); this.renderDataTable(this.filteredKennwerte);
  }

  // Einheitliche Formatierung: "5" → "GF-Bereich 5"
  _fmtGF(id) { return id ? `GF-Bereich ${id}` : id; }

  setupFilterDropdowns() {
    if (this._dropdownsInitialized) {
      const erhSelect = this._shadowRoot.getElementById("erhebung-select");
      if (erhSelect) {
        erhSelect.innerHTML = "";
        const createPlaceholder = (text) => {
          const opt = document.createElement("option");
          opt.value = ""; opt.textContent = text; opt.disabled = true; opt.selected = true;
          return opt;
        };
        erhSelect.appendChild(createPlaceholder("Bitte auswählen"));
        Object.keys(this._erhData).forEach(erhID => {
          if (erhID !== "@NullMember") {
            const opt = document.createElement("option");
            opt.value = erhID; opt.textContent = this._fmtGF(erhID);
            erhSelect.appendChild(opt);
          }
        });
      }
      return;
    }
    this._dropdownsInitialized = true;
    const erhSelect=this._shadowRoot.getElementById("erhebung-select");
    const jahrSelect=this._shadowRoot.getElementById("jahr-select");
    const nummerSelect=this._shadowRoot.getElementById("nummer-select");
    if(!erhSelect||!jahrSelect||!nummerSelect) return;
    erhSelect.innerHTML="";jahrSelect.innerHTML="";nummerSelect.innerHTML="";
    jahrSelect.disabled=true;nummerSelect.disabled=true;

    const createPlaceholder=(text)=>{ const opt=document.createElement("option"); opt.value="";opt.textContent=text;opt.disabled=true;opt.selected=true; return opt; };
    erhSelect.appendChild(createPlaceholder("Bitte auswählen"));
    Object.keys(this._erhData).forEach(erhID=>{ if(erhID!=="@NullMember"){const opt=document.createElement("option");opt.value=erhID;opt.textContent=this._fmtGF(erhID);erhSelect.appendChild(opt);}});

    const filterBtn = this._shadowRoot.getElementById("filter-button");
    const updateBtnState = () => {
      const allSelected = erhSelect.value && jahrSelect.value && nummerSelect.value;
      if (allSelected) filterBtn?.classList.add("ready");
      else filterBtn?.classList.remove("ready");
    };

    erhSelect.addEventListener("change",()=>{
      jahrSelect.innerHTML="";nummerSelect.innerHTML="";jahrSelect.disabled=false;nummerSelect.disabled=true;
      jahrSelect.appendChild(createPlaceholder("Bitte auswählen"));
      Object.keys(this._erhData[erhSelect.value]||{}).filter(j=>j!=="@NullMember").forEach(j=>{const opt=document.createElement("option");opt.value=j;opt.textContent=j;jahrSelect.appendChild(opt);});
      updateBtnState();
    });
    jahrSelect.addEventListener("change",()=>{
      nummerSelect.innerHTML="";nummerSelect.disabled=false;
      nummerSelect.appendChild(createPlaceholder("Bitte auswählen"));
      Array.from(this._erhData[erhSelect.value]?.[jahrSelect.value]||[]).filter(n=>n!=="@NullMember").forEach(n=>{const opt=document.createElement("option");opt.value=n;opt.textContent=n;nummerSelect.appendChild(opt);});
      updateBtnState();
    });
    nummerSelect.addEventListener("change", updateBtnState);

    const filterButton=this._shadowRoot.getElementById("filter-button");
    if(filterButton){
      filterButton.addEventListener("click",()=>{
        if(!filterButton.classList.contains("ready")) return;
        const sID=erhSelect.value,sJ=jahrSelect.value,sN=nummerSelect.value;
        if(sID&&sJ&&sN) this.loadErhebung(sID,sJ,sN);
      });
    }

    let existingBtn=this._shadowRoot.getElementById("info-toggle-btn");
    if(!existingBtn){
      const infoBtn=document.createElement("button"); infoBtn.id="info-toggle-btn"; infoBtn.className="info-toggle-btn";
      infoBtn.innerHTML=`↕ Erhebungsübersicht`;
      infoBtn.addEventListener("click",()=>{
        const nlBox=this._shadowRoot.getElementById("nl-info-container"),filter=this._shadowRoot.querySelector(".filter-container");
        if(!nlBox) return;
        if(nlBox.classList.contains("show")){nlBox.classList.remove("show");filter.classList.remove("nl-info-active");}
        else{this.prepareErhebungsInfo();this.renderErhebungsInfoTable();nlBox.classList.add("show");filter.classList.add("nl-info-active");}
      });
      this._shadowRoot.querySelector(".filter-container").appendChild(infoBtn);
    }
  }

  restoreFilterUI() {
    const container=this._shadowRoot.querySelector(".filter-container"); if(!container) return;
    container.innerHTML=`<label for="erhebung-select">ErhebungsID</label><select id="erhebung-select"></select><label for="jahr-select">Jahr</label><select id="jahr-select" disabled></select><label for="nummer-select">Erhebungsnummer</label><select id="nummer-select" disabled></select><button id="filter-button">Anzeigen</button><div class="table-container"><div class="table-wrapper" id="table-container"></div><div id="streuverlust-box"></div></div>`;
  }

  renderErhebungsInfoTable() {
    const container=this._shadowRoot.getElementById("nl-info-container"); container.innerHTML="";
    const scroll=document.createElement("div"); scroll.classList.add("nl-info-scroll");
    const table=document.createElement("table"); table.classList.add("nl-info-table");
    const thead=document.createElement("thead"); const headerRow=document.createElement("tr");
    const headers=[{label:'NL',class:'nl-col-nl'},{label:'Umsatz\n(Hochrechi.)',class:'nl-col-jahr'},{label:'Erfasst',class:'nl-col-erf'},{label:'%',class:'nl-col-pct1'},{label:'Valide',class:'nl-col-val'},{label:'Abdeckung',class:'nl-col-abd'}];
    headers.forEach(h=>{const th=document.createElement("th");th.textContent=h.label;th.classList.add(h.class);headerRow.appendChild(th);});
    thead.appendChild(headerRow);table.appendChild(thead);
    const tbody=document.createElement("tbody");
    Object.values(this.erhebungsInfo).forEach(info=>{
      const tr=document.createElement("tr");tr.classList.add("nl-info-row");tr.dataset.nl=info.nl;
      [this._fmtGF(info.nl),Math.round(info.jahresumsatz).toLocaleString("de-DE"),Math.round(info.erfasst_total).toLocaleString("de-DE"),(info.pct_erfassung*100).toFixed(1)+"%",Math.round(info.erfasst_valid).toLocaleString("de-DE"),(info.pct_hochrechnung*100).toFixed(1)+"%"]
        .forEach((val,i)=>{const td=document.createElement("td");td.textContent=val;td.classList.add(headers[i].class);tr.appendChild(td);});
      tr.addEventListener("click",()=>{
        this._nlSelectionInitialized = true;
        this.toggleNLSelection(info.nl);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);scroll.appendChild(table);container.appendChild(scroll);
    this.updateNLSelectionUI();
  }

  updateNLSelectionUI() {
    const rows=this._shadowRoot.querySelectorAll(".nl-info-row");
    rows.forEach(row=>{
      const nl=row.dataset.nl;
      if(!this._nlSelectionInitialized) { row.classList.remove("table-row-selected"); return; }
      if(this._selectedNLs.has(nl)) row.classList.add("table-row-selected");
      else row.classList.remove("table-row-selected");
    });
  }

  restoreDropdownSelections() {
    const { erhID, jahr, nummer } = this._activeFilter || {};
    const erhSelect    = this._shadowRoot.getElementById("erhebung-select");
    const jahrSelect   = this._shadowRoot.getElementById("jahr-select");
    const nummerSelect = this._shadowRoot.getElementById("nummer-select");
    if (!erhSelect || !jahrSelect || !nummerSelect) return;

    if (erhID) {
      erhSelect.value = erhID;
      erhSelect.dispatchEvent(new Event("change"));
    }
    if (jahr) {
      jahrSelect.value = jahr;
      jahrSelect.dispatchEvent(new Event("change"));
    }
    if (nummer) {
      nummerSelect.value = nummer;
    }
  }

  prepareErhebungsInfo() {
    this.erhebungsInfo={};
    const{erhID,jahr,nummer}=this._activeFilter||{}; if(!erhID) return;
    // PERF: Index-Lookup statt Full-Scan
    const erhData=this._getErhebungRows(erhID,jahr,nummer); if(!erhData.length) return;
    const jahresumsatz={},erfasst_total={},erfasst_valid={};
    erhData.forEach(row=>{
      const nl=row["dimension_niederlassung_0"]?.id?.trim(); if(!nl) return;
      // FIX 2: _normalizePLZ verwenden
      const rawPLZ=row["dimension_plz_0"]?.id??row["dimension_plz_0"]?.raw;
      const plz = this._normalizePLZ(rawPLZ) || "00000";
      const uJ=row["value_hr_n_umsatz_0"]?.raw??0,uE=row["value_ums_erhebung_0"]?.raw??0;
      if(!jahresumsatz[nl])jahresumsatz[nl]=0;if(!erfasst_total[nl])erfasst_total[nl]=0;if(!erfasst_valid[nl])erfasst_valid[nl]=0;
      erfasst_total[nl]+=uE;
      if(plz!=="00000"){jahresumsatz[nl]+=uJ;erfasst_valid[nl]+=uE;}
    });
    Object.keys(erfasst_total).forEach(nl=>{
      const j=jahresumsatz[nl]||0,t=erfasst_total[nl]||0,v=erfasst_valid[nl]||0;
      this.erhebungsInfo[nl]={nl,jahresumsatz:j,erfasst_total:t,erfasst_valid:v,pct_erfassung:j>0?t/j:0,pct_valid:t>0?v/t:0,pct_hochrechnung:j>0?v/j:0};
    });
  }

  prepareUmsatzPLZWerte() {
    const{erhID,jahr,nummer}=this._activeFilter||{}; if(!erhID||!jahr||!nummer) return;
    // PERF: Index-Lookup statt Full-Scan
    const rows=this._getErhebungRows(erhID,jahr,nummer); if(!rows.length) return;
    const safe=x=>{ if(x==null)return 0; if(typeof x==="string")x=x.replace(/\./g,"").replace(",","."); const n=Number(x); return Number.isFinite(n)?n:0; };
    const parseHH=x=>{ if(x==null)return 0; if(typeof x==="number")return Number.isFinite(x)?x:0; if(typeof x==="string"){const n=Number(x.replace(/[.,\s]/g,""));return Number.isFinite(n)?n:0;} return 0; };
    const aggregated={};
    rows.forEach(row=>{
      const nl=row["dimension_niederlassung_0"]?.id?.trim();
      if(this._selectedNLs?.size>0&&!this._selectedNLs.has(nl)) return;
      // FIX 2: _normalizePLZ verwenden
      const rawPLZ=row["dimension_plz_0"]?.id??row["dimension_plz_0"]?.raw;
      const plz = this._normalizePLZ(rawPLZ);
      if (!plz || plz === "00000") return;
      if(!aggregated[plz]) aggregated[plz]={_hhValues:[],_kkValues:[],umsatz:0,ra:0,onlineshop:0,pluscard:0,umsatzWerbung:0,raWerbung:0,onlineshopWerbung:0,pluscardWerbung:0,umsatzZusatz:0,raZusatz:0,onlineshopZusatz:0,pluscardZusatz:0,umsatzErhebung:0,kdErhebung:0,auflage:0,werbeverweigerer:0,kaufkraftIdx:0};
      const v=aggregated[plz];
      const hh=parseHH(row["value_haushalte_0"]?.raw); if(hh>0) v._hhValues.push(hh);
      v.umsatzErhebung+=safe(row["value_ums_erhebung_0"]?.raw);v.kdErhebung+=safe(row["value_kd_erhebung_0"]?.raw);v.auflage+=safe(row["value_auflage_0"]?.raw);v.werbeverweigerer=Math.max(v.werbeverweigerer,safe(row["value_werbeverweigerer_0"]?.raw));
      const kk=safe(row["value_kaufkraft_0"]?.raw);if(kk>0)v._kkValues.push(kk);
      v.umsatz+=safe(row["value_umsatz_stationaer_0"]?.raw);v.ra+=safe(row["value_umsatz_ra_0"]?.raw);v.onlineshop+=safe(row["value_umsatz_online_0"]?.raw);v.pluscard+=safe(row["value_umsatz_grosskunden_0"]?.raw);
      v.umsatzWerbung+=safe(row["value_umsatz_stationaer_werbung_0"]?.raw);v.raWerbung+=safe(row["value_umsatz_ra_werbung_0"]?.raw);v.onlineshopWerbung+=safe(row["value_umsatz_online_werbung_0"]?.raw);v.pluscardWerbung+=safe(row["value_umsatz_grosskunden_werbung_0"]?.raw);
      v.umsatzZusatz+=safe(row["value_umsatz_stationaer_zusatz_0"]?.raw);v.raZusatz+=safe(row["value_umsatz_ra_zusatz_0"]?.raw);v.onlineshopZusatz+=safe(row["value_umsatz_online_zusatz_0"]?.raw);v.pluscardZusatz+=safe(row["value_umsatz_grosskunden_zusatz_0"]?.raw);
    });
    Object.entries(aggregated).forEach(([plz,v])=>{
      v.haushalte=v._hhValues.length>0?v._hhValues.reduce((a,b)=>a+b,0)/v._hhValues.length:0;
      v.kaufkraftIndex=v._kkValues.length>0?v._kkValues.reduce((a,b)=>a+b,0)/v._kkValues.length:0;
      delete v._hhValues; delete v._kkValues;
      const hh=v.haushalte,perHH=val=>hh>0?val/hh:0;
      v.umsatzProHaushalt=perHH(v.umsatz);v.raProHaushalt=perHH(v.ra);v.onlineshopProHaushalt=perHH(v.onlineshop);v.pluscardProHaushalt=perHH(v.pluscard);
      v.umsatzWerbungProHaushalt=perHH(v.umsatzWerbung);v.raWerbungProHaushalt=perHH(v.raWerbung);v.onlineshopWerbungProHaushalt=perHH(v.onlineshopWerbung);v.pluscardWerbungProHaushalt=perHH(v.pluscardWerbung);
      v.umsatzZusatzProHaushalt=perHH(v.umsatzZusatz);v.raZusatzProHaushalt=perHH(v.raZusatz);v.onlineshopZusatzProHaushalt=perHH(v.onlineshopZusatz);v.pluscardZusatzProHaushalt=perHH(v.pluscardZusatz);
      const tN=v.umsatz+v.ra+v.onlineshop+v.pluscard,tW=v.umsatzWerbung+v.raWerbung+v.onlineshopWerbung+v.pluscardWerbung;
      v.werbeAnteil=tN>0?tW/tN:0;
    });
    const result={};
    Object.entries(aggregated).forEach(([plz,v])=>{
      if((this.currentMapMode==="umsatz-multi"||this.currentMapMode==="werbeanteil")&&this.useRadiusFilter) {
        if(this.plzImRadius instanceof Set&&!this.plzImRadius.has(plz)) return;
      }
      result[plz]={...v,umsatzErhebung:v.umsatzErhebung??0,kdErhebung:v.kdErhebung??0,auflage:v.auflage??0,werbeverweigerer:v.werbeverweigerer??0};
    });
    this.filteredPLZWerte=result;
  }

  _refreshAll() {
    this.prepareUmsatzPLZWerte(); this.computeWKKennwerte(); this.computeStreuverlust();
    this.updateGeoLayer(); this.updateHeatmapLegend();
    this.renderDataTable(this.filteredKennwerte);
  }

  getColorForPLZ(plz) {
    const data=this.filteredPLZWerte?.[plz]; if(!data) return "#cfd4da";
    return this.getColor(data.hz===true?data.wk??0:data.wkPot??0,data.hz===true);
  }

  getFilteredDataWithRadius() {
    if(!this.filteredData) return [];
    const result=[],aggregated={},unfilteredUmsatzByPLZ={};
    this.filteredData.forEach(row=>{
      // FIX 2: _normalizePLZ verwenden
      const rawPLZ=row["dimension_plz_0"]?.id??row["dimension_plz_0"]?.raw;
      const plz = this._normalizePLZ(rawPLZ) || "00000";
      const umsatz=row["value_hr_n_umsatz_0"]?.raw??0;
      unfilteredUmsatzByPLZ[plz]=(unfilteredUmsatzByPLZ[plz]||0)+umsatz;
    });
    let totalErhebungUmsatz=0;
    const streuverlust={sum:{umsatzNetto:0,hzKosten:0},avgArrays:{werbeverweigerer:[],haushalte:[],kaufkraft:[]}};
    this.filteredData.forEach(row=>{
      const nl=row["dimension_niederlassung_0"]?.id?.trim();
      // FIX 2: _normalizePLZ verwenden
      const rawPLZ=row["dimension_plz_0"]?.id??row["dimension_plz_0"]?.raw;
      const plz = this._normalizePLZ(rawPLZ) || "00000";
      if(this._selectedNLs.size>0&&!this._selectedNLs.has(nl)) return;
      totalErhebungUmsatz+=row["value_hr_n_umsatz_0"]?.raw??0;
      const isInRadius=this.plzImRadius instanceof Set?this.plzImRadius.has(plz):true;
      if(!isInRadius){streuverlust.sum.umsatzNetto+=row["value_hr_n_umsatz_0"]?.raw??0;return;}
      result.push(row);
      if(!aggregated[plz]) aggregated[plz]={hzCount:0,sum:{umsatzNetto:0,hzKosten:0,umsatzErhebung:0,kdErhebung:0,auflage:0},avgArrays:{werbeverweigerer:[],haushalte:[],kaufkraft:[],potHzKosten:[]}};
      const entry=aggregated[plz],hz=row["dimension_hzflag_0"]?.id?.trim()==="X";
      if(hz) entry.hzCount++;
      entry.sum.umsatzNetto+=row["value_hr_n_umsatz_0"]?.raw??0;entry.sum.hzKosten+=row["value_hz_kosten_0"]?.raw??0;
      const potHz=row["value_hz_potentiell_0"]?.raw;if(typeof potHz==="number")entry.avgArrays.potHzKosten.push(potHz);
      const hh2=row["value_haushalte_0"]?.raw;if(typeof hh2==="number")entry.avgArrays.haushalte.push(hh2);
    });
    const avg=arr=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0,mergedPLZWerte={};
    Object.entries(aggregated).forEach(([plz,entry])=>{
      const sum=entry.sum,avgPotHz=avg(entry.avgArrays.potHzKosten),umsatzNetto=sum.umsatzNetto,hzKosten=sum.hzKosten;
      const wkPercent=umsatzNetto>0?Number(((hzKosten/umsatzNetto)*100).toFixed(1)):0;
      const unfU=unfilteredUmsatzByPLZ[plz]??0,wkNachbarn=unfU>0?Number(((hzKosten/unfU)*100).toFixed(1)):0;
      const potHzPercent=umsatzNetto>0?Number(((avgPotHz/umsatzNetto)*100).toFixed(1)):0;
      const isHZ=entry.hzCount>0,isCritical=entry.hzCount>1;
      this.filteredKennwerte[plz]={isHZ,isCritical,value_hr_n_umsatz_0:{raw:umsatzNetto},value_wk_in_percent_0:{raw:wkPercent},value_wk_nachbar_0:{raw:wkNachbarn},value_hz_kosten_0:{raw:hzKosten},value_ums_erhebung_0:{raw:sum.umsatzErhebung},value_kd_erhebung_0:{raw:sum.kdErhebung},value_bon_erhebung_0:{raw:sum.kdErhebung>0?Number((sum.umsatzErhebung/sum.kdErhebung).toFixed(2)):0},value_auflage_0:{raw:sum.auflage},value_wk_potentiell_0:{raw:potHzPercent}};
      const old=this.filteredPLZWerte?.[plz]||{};
      mergedPLZWerte[plz]={wk:wkPercent,wkNachbarn,wkPot:potHzPercent,hz:isHZ,umsatz:old.umsatz??0,ra:old.ra??0,onlineshop:old.onlineshop??0,pluscard:old.pluscard??0,haushalte:old.haushalte??0,umsatzProHaushalt:old.umsatzProHaushalt??0,raProHaushalt:old.raProHaushalt??0,onlineshopProHaushalt:old.onlineshopProHaushalt??0,pluscardProHaushalt:old.pluscardProHaushalt??0};
    });
    this.filteredPLZWerte=mergedPLZWerte;
    this.streuverlust={umsatz:streuverlust.sum.umsatzNetto,anteil:totalErhebungUmsatz>0?streuverlust.sum.umsatzNetto/totalErhebungUmsatz:0};
    return result;
  }

  closeNLTable() { this._shadowRoot.getElementById("nl-info-container")?.classList.remove("show"); this._shadowRoot.querySelector(".filter-container")?.classList.remove("nl-info-active"); }

  showEmptyUmsatzPopup(plz) {
    const popup=this._shadowRoot.getElementById("side-popup-umsatz"); if(!popup) return;
    const note=this.geoNotes?.[plz]||"—";
    this._activePopupPLZ=plz;this._activePopupType='umsatz';
    popup.innerHTML=`<div class="popup-header"><span title="${note}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${note}</span><button class="close-btn" style="flex-shrink:0">✕</button></div><div style="padding:20px 14px;text-align:center;color:#adb5bd;font-size:0.85rem"><div style="font-size:2rem;margin-bottom:8px;opacity:.4">📭</div>Keine Umsatzdaten für PLZ ${plz}</div>`;
    popup.classList.remove("hidden");void popup.offsetWidth;popup.classList.add("show");
    popup.querySelector(".close-btn").onclick=()=>{popup.classList.remove("show");popup.classList.add("hidden");this._activePopupPLZ=null;this._activePopupType=null;};
  }

  prepareDropdownData(data) {
    const erhSelect=this._shadowRoot.getElementById("erhebung-select"),jahrSelect=this._shadowRoot.getElementById("jahr-select"),nummerSelect=this._shadowRoot.getElementById("nummer-select");
    if(!erhSelect||!jahrSelect||!nummerSelect) return;
    erhSelect.innerHTML="";jahrSelect.innerHTML="";nummerSelect.innerHTML="";jahrSelect.disabled=true;nummerSelect.disabled=true;
    this._erhData={};
    data.forEach(row=>{const erhID=row["dimension_erhebung_0"]?.id?.trim(),jahr=row["dimension_jahr_0"]?.id?.trim(),nummer=row["dimension_erhebungsnummer_0"]?.id?.trim();if(!erhID||!jahr||!nummer) return;this._erhData[erhID]=this._erhData[erhID]||{};this._erhData[erhID][jahr]=this._erhData[erhID][jahr]||new Set();this._erhData[erhID][jahr].add(nummer);});
    Object.keys(this._erhData).forEach(erhID=>{const opt=document.createElement("option");opt.value=erhID;opt.textContent=erhID;erhSelect.appendChild(opt);});
    erhSelect.addEventListener("change",()=>{jahrSelect.innerHTML="";nummerSelect.innerHTML="";jahrSelect.disabled=false;nummerSelect.disabled=true;Object.keys(this._erhData[erhSelect.value]||{}).forEach(j=>{const opt=document.createElement("option");opt.value=j;opt.textContent=j;jahrSelect.appendChild(opt);});});
    jahrSelect.addEventListener("change",()=>{nummerSelect.innerHTML="";nummerSelect.disabled=false;Array.from(this._erhData[erhSelect.value]?.[jahrSelect.value]||[]).forEach(n=>{const opt=document.createElement("option");opt.value=n;opt.textContent=n;nummerSelect.appendChild(opt);});});
    const filterButton=this._shadowRoot.getElementById("filter-button");
    if(filterButton){filterButton.addEventListener("click",()=>this.loadErhebung(erhSelect.value,jahrSelect.value,nummerSelect.value));}
  }

  async render() {
    if(!this.map) return;
    if(!this._myDataSource || this._myDataSource.state!=="success") {
      this._updateLoaderPhase(1, "Warte auf Daten…");
      this._scheduleDataPoll();
      return;
    }
    const rawData=this._myDataSource.data;
    this._buildErhebungIndex();
    this._erhData=this.buildErhebungsStruktur(rawData);
    this.setupFilterDropdowns();
    const isFiltered=!!this._activeFilter;
    const filteredData=isFiltered?this.getFilteredData():rawData;
    // GeoJSON und Datenverarbeitung parallel
    const [_] = await Promise.all([
      this.loadGeoJson(),
      Promise.resolve().then(() => {
        this.prepareMapData(filteredData);
        this.prepareUmsatzPLZWerte(); this.computeWKKennwerte(); this.computeStreuverlust();
      })
    ]);
    this.updateGeoLayer(); this.createAllMarkers();
    const filteredPLZs=isFiltered?filteredData.map(d=>{
      const rawPLZ=d["dimension_plz_0"]?.id?.trim();
      return this._normalizePLZ(rawPLZ);
    }).filter(p=>p!==null):Object.keys(this.allMarkers||{});
    this.updateMarkers(filteredPLZs); this.renderDataTable(this.filteredKennwerte);
    this._hideCinematicLoader();
    if (!isFiltered) {
      setTimeout(() => this._startPreviewAnimation(), 200);
    } else {
      this._stopPreview?.();
    }
    this.hideSpinner();
  }

  updateHeatmapLegend() {
    const legend=this._shadowRoot.getElementById("heatmap-legend"); if(!legend) return;
    if(!this._activeFilter||!this.filteredPLZWerte||Object.keys(this.filteredPLZWerte).length===0){legend.classList.add("hidden");return;}
    if(!this.currentMapMode){legend.classList.add("hidden");return;}
    const mkRow=(bg,label)=>`<div class="heatmap-legend-row"><div class="heatmap-legend-color" style="background:${bg}"></div><span>${label}</span></div>`;
    if(this.currentMapMode==="wk"){
      legend.innerHTML=`<strong>Werbekosten</strong>
        <div style="font-size:0.7rem;color:#adb5bd;font-weight:600;margin:6px 0 3px;text-transform:uppercase;letter-spacing:.04em">Bestreut (% WK)</div>
        ${mkRow('#e31a1c','&gt; 25 %')}${mkRow('#fd8d3c','15 – 25 %')}${mkRow('#ffffb2','10 – 15 %')}${mkRow('#78c679','5 – 10 %')}${mkRow('#41ab5d','2 – 5 %')}${mkRow('#006837','0 – 2 %')}
        <div style="font-size:0.7rem;color:#adb5bd;font-weight:600;margin:8px 0 3px;text-transform:uppercase;letter-spacing:.04em">Nicht bestreut (% pot. WK)</div>
        ${mkRow('#cfd4da','&gt; 50 %')}${mkRow('#bdbdbd','25 – 50 %')}${mkRow('#969696','15 – 25 %')}${mkRow('#6baed6','10 – 15 %')}${mkRow('#2171b5','5 – 10 %')}${mkRow('#08306b','&lt; 5 %')}`;
      legend.classList.remove("hidden");return;
    }
    if(this.currentMapMode==="umsatz-multi"){
      const values=Object.values(this.filteredPLZWerte).map(v=>this.getUmsatzSumForPLZ(v)).filter(v=>v>0),max=values.length>0?Math.max(...values):0;
      if(max===0){legend.classList.add("hidden");return;}
      const steps=[
        {v:max,      label:`&gt; ${(max*0.95).toLocaleString("de-DE",{maximumFractionDigits:0})} €`},
        {v:max*.85,  label:`${(max*0.75).toLocaleString("de-DE",{maximumFractionDigits:0})} – ${(max*0.85).toLocaleString("de-DE",{maximumFractionDigits:0})} €`},
        {v:max*.65,  label:`${(max*0.55).toLocaleString("de-DE",{maximumFractionDigits:0})} – ${(max*0.65).toLocaleString("de-DE",{maximumFractionDigits:0})} €`},
        {v:max*.45,  label:`${(max*0.35).toLocaleString("de-DE",{maximumFractionDigits:0})} – ${(max*0.45).toLocaleString("de-DE",{maximumFractionDigits:0})} €`},
        {v:max*.20,  label:`${(max*0.10).toLocaleString("de-DE",{maximumFractionDigits:0})} – ${(max*0.20).toLocaleString("de-DE",{maximumFractionDigits:0})} €`},
        {v:0,        label:`&lt; ${(max*0.10).toLocaleString("de-DE",{maximumFractionDigits:0})} €`},
      ];
      legend.innerHTML=`<strong>Umsatz</strong>`+steps.map(s=>mkRow(this.getDynamicHeatColor(s.v,max),s.label)).join("");
      legend.classList.remove("hidden");return;
    }
    if(this.currentMapMode==="werbeanteil"){
      legend.innerHTML=`<strong>Werbeanteil</strong>`+
        [['#7a0f17','&gt; 80 %'],['#b41821','60 – 80 %'],['#e96a3a','40 – 60 %'],['#f6b65b','20 – 40 %'],['#f7d77a','10 – 20 %'],['#fce9b2','&lt; 10 %']].map(([bg,l])=>mkRow(bg,l)).join("");
      legend.classList.remove("hidden");return;
    }
    legend.classList.add("hidden");
  }

  getUmsatzValueForLegend(v) {
    let sum=0; for(const cat of this.activeCategories){if(v[cat]!=null)sum+=v[cat];}
    if(this.umsatzMainMode==="werbung"){sum=0;if(this.useWerbeUmsatz)sum+=v.werbung??0;if(this.useZusatzUmsatz)sum+=v.zusatz??0;}
    if(this.umsatzDarstellung==="hh"){const hh=v.haushalte||1;sum=sum/hh;}
    return sum;
  }

  async loadErhebung(erhID, jahr, nummer) {
    const legend=this._shadowRoot.getElementById("heatmap-legend"); legend?.classList.add("hidden");
    this.closeNLTable?.();
    this._stopPreview?.();
    const overlay = this._shadowRoot.getElementById("map-preview-overlay");
    if (overlay) overlay.innerHTML = '';
    this._rawPLZCache = {};
    this._crossErhebungPLZ = {};
    this._showCinematicLoader();
    try {
      this._updateLoaderPhase(1,"Erhebungsdaten werden geladen…");
      // GeoJSON-Fetch und Datenaufbereitung PARALLEL starten
      const [rawData] = await Promise.all([
        this.queryErhebungFromBW(erhID, jahr, nummer),
        this.loadGeoJson()  // bereits gecacht nach erstem Laden
      ]);
      this._activeFilter={erhID,jahr,nummer}; this.filteredData=rawData;

      this._updateLoaderPhase(2,"Karte wird vorbereitet…");
      this.prepareMapData(rawData);

      this._updateLoaderPhase(3,"Niederlassungen werden gesetzt…");
      this.allNLs=[...Object.keys(this.Niederlassung),...(this.extraNLs?.map(e=>e.nl)??[])];
      this._selectedNLs=new Set(this.allNLs); this._nlSelectionInitialized=false;
      this.createAllMarkers();

      this._updateLoaderPhase(4,"Kennwerte werden berechnet…");
      const radius=Number(this._shadowRoot.getElementById("radius-slider")?.value??40);
      this._buildDistanceCache(); this.applyRadiusFilter(radius);
      this.prepareUmsatzPLZWerte(); this.computeWKKennwerte(); this.computeStreuverlust();
      this.updateGeoLayer(); this.renderDataTable(this.filteredKennwerte); this.zoomToFilteredPLZ();

      // Nicht-kritische Operationen nach dem ersten Paint ausführen
      requestAnimationFrame(() => {
        this.prepareErhebungsInfo();
        const block = this._shadowRoot.getElementById("map-interaction-block");
        if (block) block.classList.add("hidden");
        this._shadowRoot.getElementById("back-to-home-btn")?.classList.add("visible");
        this._shadowRoot.getElementById("overview-toggle-btn")?.classList.add("visible");
        this.showOverviewPopup();
      });
    } finally {
      this._hideCinematicLoader();
    }
  }

  _showCinematicLoader() {
    this._hideCinematicLoader(true);
    const overlay=document.createElement("div"); overlay.id="cinematic-loader";
    overlay.innerHTML=`<div class="loader-logo"><div class="loader-core"></div></div><div class="loader-phase" id="loader-phase-text">Wird geladen…</div><div class="loader-bar-track"><div class="loader-bar-fill" id="loader-bar"></div></div><div class="loader-dots"><div class="loader-dot" data-phase="1"><div class="dot-circle"></div><div class="dot-label">Daten</div></div><div class="loader-dot" data-phase="2"><div class="dot-circle"></div><div class="dot-label">Karte</div></div><div class="loader-dot" data-phase="3"><div class="dot-circle"></div><div class="dot-label">Standorte</div></div><div class="loader-dot" data-phase="4"><div class="dot-circle"></div><div class="dot-label">Kennzahlen</div></div></div>`;
    const mc=this._shadowRoot.querySelector(".map-container");
    if(mc) mc.appendChild(overlay); else this._shadowRoot.appendChild(overlay);
  }

  _updateLoaderPhase(phase, text) {
    const loader=this._shadowRoot.getElementById("cinematic-loader"); if(!loader) return;
    const phaseText=loader.querySelector("#loader-phase-text");
    if(phaseText){phaseText.style.opacity="0";setTimeout(()=>{phaseText.textContent=text;phaseText.style.opacity="1";},140);}
    const bar=loader.querySelector("#loader-bar"),pm={1:15,2:40,3:65,4:85,5:100};
    if(bar) bar.style.width=(pm[phase]||0)+"%";
    loader.querySelectorAll(".loader-dot").forEach(dot=>{
      const p=Number(dot.dataset.phase);dot.classList.remove("active","done");
      if(p===phase)dot.classList.add("active");else if(p<phase)dot.classList.add("done");
    });
  }

  _hideCinematicLoader(immediate=false) {
    const loader=this._shadowRoot.getElementById("cinematic-loader"); if(!loader) return;
    if(immediate){loader.remove();return;}
    loader.classList.add("fade-out"); setTimeout(()=>loader.remove(),380);
  }

  _startPreviewAnimation() {
    if (this._activeFilter) return;
    if (!this._erhData || Object.keys(this._erhData).length === 0) return;
    if (!this.map) return;

    const allErhIDs = Object.keys(this._erhData);
    if (allErhIDs.length === 0) return;

    if (!this._previewGroup) {
      this._previewGroup = L.layerGroup().addTo(this.map);
    }

    if (!this._shadowRoot.getElementById('preview-anim-style')) {
      const style = document.createElement('style');
      style.id = 'preview-anim-style';
      style.textContent = `
        @keyframes previewPing {
          0%   { transform: translate(-50%,-50%) scale(0.2); opacity: 0.9; }
          100% { transform: translate(-50%,-50%) scale(2.5); opacity: 0; }
        }
        @keyframes previewRadius {
          0%   { transform: translate(-50%,-50%) scale(0); opacity: 0.6; }
          70%  { opacity: 0.25; }
          100% { transform: translate(-50%,-50%) scale(1); opacity: 0; }
        }
        @keyframes previewFadeIn {
          from { opacity: 0; transform: translate(-50%,-80%) rotate(-45deg) scale(0.3); }
          to   { opacity: 1; transform: translate(-50%,-80%) rotate(-45deg) scale(1); }
        }
      `;
      this._shadowRoot.appendChild(style);
    }

    let currentIdx = 0;

    // PERF: NL-Koordinaten direkt aus dem Erhebungs-Index ableiten
    // statt erneut über alle Rohdaten zu iterieren
    const nlByErh = {};
    if (this._erhebungIndex) {
      const keys = Object.keys(this._erhebungIndex);
      for (let ki = 0; ki < keys.length; ki++) {
        const rows = this._erhebungIndex[keys[ki]];
        const erhID = rows[0]?.["dimension_erhebung_0"]?.id?.trim();
        if (!erhID) continue;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const nl  = row["dimension_niederlassung_0"]?.id?.trim();
          const lat = parseFloat(row["dimension_Lat_0"]?.label);
          const lon = parseFloat(row["dimension_lon_0"]?.label);
          if (!nl || isNaN(lat) || isNaN(lon)) continue;
          if (!nlByErh[erhID]) nlByErh[erhID] = {};
          if (!nlByErh[erhID][nl]) nlByErh[erhID][nl] = { lat, lon };
        }
      }
    } else {
      const rawData = this._myDataSource?.data || [];
      for (let i = 0; i < rawData.length; i++) {
        const row   = rawData[i];
        const erhID = row["dimension_erhebung_0"]?.id?.trim();
        const nl    = row["dimension_niederlassung_0"]?.id?.trim();
        const lat   = parseFloat(row["dimension_Lat_0"]?.label);
        const lon   = parseFloat(row["dimension_lon_0"]?.label);
        if (!erhID || !nl || isNaN(lat) || isNaN(lon)) continue;
        if (!nlByErh[erhID]) nlByErh[erhID] = {};
        if (!nlByErh[erhID][nl]) nlByErh[erhID][nl] = { lat, lon };
      }
    }

    const getOrCreateLabel = () => {
      let lbl = this._shadowRoot.getElementById('preview-erh-label');
      if (!lbl) {
        lbl = document.createElement('div');
        lbl.id = 'preview-erh-label';
        lbl.style.cssText = `
          position:absolute;top:58px;left:50%;transform:translateX(-50%);
          background:rgba(255,255,255,0.93);border:1px solid var(--gray-200);
          border-radius:100px;padding:5px 16px;font-size:0.72rem;font-weight:700;
          color:var(--gray-500);letter-spacing:.06em;text-transform:uppercase;
          pointer-events:none;box-shadow:var(--shadow-sm);z-index:9000;
          transition:opacity 0.3s ease;`;
        this._shadowRoot.querySelector('.map-container')?.appendChild(lbl);
      }
      return lbl;
    };

    const showErhebung = (erhID) => {
      this._previewGroup.clearLayers();

      const lbl = getOrCreateLabel();
      lbl.style.opacity = '0';
      setTimeout(() => { lbl.textContent = `Vorschau · ${this._fmtGF(erhID)}`; lbl.style.opacity = '1'; }, 150);

      const nls = nlByErh[erhID] || {};
      const nlList = Object.entries(nls);
      if (nlList.length === 0) return;

      nlList.forEach(([nl, { lat, lon }], i) => {
        setTimeout(() => {
          if (this._activeFilter) return;

          const pingIcon = L.divIcon({
            html: `<div style="
              width:44px;height:44px;border-radius:50%;
              border:2px solid rgba(180,24,33,0.55);
              animation:previewPing 1s ease-out forwards;
              pointer-events:none;"></div>`,
            className: '',
            iconSize: [44, 44],
            iconAnchor: [22, 22]
          });
          const pingMarker = L.marker([lat, lon], { icon: pingIcon, interactive: false, zIndexOffset: 500 });
          this._previewGroup.addLayer(pingMarker);
          setTimeout(() => { try { this._previewGroup.removeLayer(pingMarker); } catch(e){} }, 1050);

          const pinIcon = L.divIcon({
            html: `<div style="
              width:30px;height:30px;background:#b41821;
              border-radius:50% 50% 50% 0;
              box-shadow:-1px 2px 8px rgba(180,24,33,0.5);
              transform:translate(-50%,-80%) rotate(-45deg) scale(0);
              animation:previewFadeIn 0.4s cubic-bezier(0.16,1,0.3,1) forwards;
              display:flex;align-items:center;justify-content:center;pointer-events:none;">
              <div style="transform:rotate(45deg);font-size:9px;font-weight:700;color:white;
                font-family:system-ui;max-width:24px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${nl}
              </div>
            </div>`,
            className: '',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
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
    this._previewInterval = setInterval(() => {
      if (this._activeFilter) { this._stopPreview(); return; }
      runCycle();
    }, 5500);
  }

  _stopPreview() {
    if (this._previewInterval) { clearInterval(this._previewInterval); this._previewInterval = null; }
    if (this._previewGroup)    { this._previewGroup.clearLayers(); }
    const lbl = this._shadowRoot.getElementById('preview-erh-label');
    if (lbl) lbl.remove();
  }

  _triggerSweepAnimation() {
    if (!this._geoLayer) return;
    const container = this._geoLayer.getPane?.() || this._geoLayer._map?.getPanes?.()?.overlayPane;
    if (!container) return;
    container.style.transition = 'opacity 0.05s';
    container.style.opacity = '0.1';
    requestAnimationFrame(() => {
      setTimeout(() => {
        container.style.transition = 'opacity 0.35s var(--ease-out)';
        container.style.opacity = '1';
      }, 50);
    });
  }

  showLoadingOverlay() { const o=this._shadowRoot.getElementById("loading-spinner"); if(!o)return; o.classList.remove("hidden");o.style.opacity="1";o.style.pointerEvents="auto"; }
  hideLoadingOverlay() { const o=this._shadowRoot.getElementById("loading-spinner"); if(!o)return; o.style.transition="opacity 0.25s ease";o.style.opacity="0";o.style.pointerEvents="none";setTimeout(()=>o.classList.add("hidden"),250); }

  async queryErhebungFromBW(erhID, jahr, nummer) {
    // PERF: Index-Lookup statt Full-Scan über alle Rohdaten
    return this._getErhebungRows(erhID, jahr, nummer);
  }

  _resetToHome() {
    this._activeFilter = null;
    this.filteredData = null;
    this.filteredKennwerte = {};
    this.filteredPLZWerte = {};
    this._rawPLZCache = {};
    this._crossErhebungPLZ = {};
    this.streuverlust = null;
    this.plzImRadius = new Set();
    this._activePopupPLZ = null;
    this._activePopupType = null;
    this._highlightedPLZ = null;
    this._nlSelectionInitialized = false;

    this.closeAllPopups();
    this.closeNLTable?.();
    this._shadowRoot.getElementById("heatmap-legend")?.classList.add("hidden");
    const panel = this._shadowRoot.getElementById("map-control-panel");
    panel?.classList.remove("panel-large", "panel-medium");
    this.filteredGroup?.clearLayers();
    this.neighbourGroup?.clearLayers();
    this.radiusGroup?.clearLayers();
    this.bestreuungGroup?.clearLayers();
    this._clearDoppelMarkers();
    if (this._geoLayer) {
      this._geoLayer.eachLayer(layer => {
        layer.setStyle({ fillColor: "#e9ecef", fillOpacity: 0.3, color: "#ffffff", weight: 0.8 });
        layer.off("click");
      });
    }
    if (this.criticalMarkers) {
      Object.keys(this.criticalMarkers).forEach(plz => this._removeCriticalMarker(plz));
    }
    this._shadowRoot.getElementById("back-to-home-btn")?.classList.remove("visible");
    this._shadowRoot.getElementById("overview-toggle-btn")?.classList.remove("visible");
    this._startPreviewAnimation();
    this.renderDataTableFromEntries([]);
    const box = this._shadowRoot.getElementById("streuverlust-box");
    if (box) box.innerHTML = "";
    this.map?.setView([49.4, 8.7], 7);
    const block = this._shadowRoot.getElementById("map-interaction-block");
    if (block) block.classList.remove("hidden");
  }

  _showDoppelTooltip(plz, event, container) {
    this._hideDoppelTooltip();
    const crossInfo = this._crossErhebungPLZ?.[plz] || {};
    const { erhID: aktErhID } = this._activeFilter || {};
    const note = this.geoNotes?.[plz] || `PLZ ${plz}`;

    if (Object.keys(crossInfo).length === 0 && aktErhID && this.filteredData) {
      crossInfo[aktErhID] = new Set();
      this.filteredData.forEach(row => {
        // FIX 2: _normalizePLZ verwenden
        const rawPLZ = row["dimension_plz_0"]?.id ?? row["dimension_plz_0"]?.raw;
        const p = this._normalizePLZ(rawPLZ);
        if (p !== plz) return;
        if (row["dimension_hzflag_0"]?.id?.trim() !== "X") return;
        const nl = row["dimension_niederlassung_0"]?.id?.trim();
        if (nl) crossInfo[aktErhID].add(nl);
      });
    }

    const allNLs = [...new Set(Object.values(crossInfo).flatMap(s => [...s]))].join(", ") || "—";

    const el = document.createElement("div");
    el.className = "doppel-tooltip";
    el.innerHTML = `
      <div class="doppel-tooltip-title">⚠️ Doppelbestreuung · PLZ ${plz}</div>
      <div class="doppel-tooltip-row">
        <div style="color:var(--gray-500);font-size:0.76rem">Durch NLs: <strong style="color:var(--gray-800)">${allNLs}</strong></div>
      </div>
    `;
    el.style.position = "absolute";
    el.style.pointerEvents = "none";
    container?.appendChild(el);
    this._doppelTooltipEl = el;
    this._moveDoppelTooltip(event, container);
  }

  _moveDoppelTooltip(event, container) {
    if (!this._doppelTooltipEl || !container) return;
    const rect = container.getBoundingClientRect();
    let x = event.clientX - rect.left + 14;
    let y = event.clientY - rect.top - 10;
    const tw = this._doppelTooltipEl.offsetWidth || 200;
    const th = this._doppelTooltipEl.offsetHeight || 80;
    if (x + tw > rect.width - 10)  x = event.clientX - rect.left - tw - 14;
    if (y + th > rect.height - 10) y = event.clientY - rect.top  - th - 10;
    this._doppelTooltipEl.style.left = x + "px";
    this._doppelTooltipEl.style.top  = y + "px";
  }

  _hideDoppelTooltip() {
    if (this._doppelTooltipEl) {
      this._doppelTooltipEl.remove();
      this._doppelTooltipEl = null;
    }
  }

  _clearDoppelMarkers() {
    if (this.criticalMarkers) {
      Object.keys(this.criticalMarkers).forEach(plz => this._removeCriticalMarker(plz));
      this.criticalMarkers = {};
    }
    if (this._doppelTooltipEl) {
      this._doppelTooltipEl.remove();
      this._doppelTooltipEl = null;
    }
  }

  closeAllPopups() {
    this._shadowRoot.getElementById("side-popup-umsatz")?.classList.add("hidden");
    this._shadowRoot.getElementById("side-popup")?.classList.add("hidden");
    const ov = this._shadowRoot.getElementById("side-popup-overview");
    if (ov) { ov.classList.remove("show"); ov.classList.add("hidden"); }
    this._activePopupPLZ=null; this._activePopupType=null;
  }

  showOverviewPopup() {
    if (!this._activeFilter) return;
    const popup = this._shadowRoot.getElementById("side-popup-overview");
    if (!popup) return;

    // Andere Popups schließen
    this._shadowRoot.getElementById("side-popup")?.classList.remove("show");
    this._shadowRoot.getElementById("side-popup")?.classList.add("hidden");
    this._shadowRoot.getElementById("side-popup-umsatz")?.classList.remove("show");
    this._shadowRoot.getElementById("side-popup-umsatz")?.classList.add("hidden");
    this._activePopupPLZ = null; this._activePopupType = null;

    // Header-Titel: Erhebungsname oder gefilterte NLs
    const { erhID } = this._activeFilter || {};
    const selNLs = this._selectedNLs;
    const allNLs = this.allNLs || [];
    let headerTitle = this._fmtGF(erhID) || "Übersicht";
    if (selNLs && selNLs.size > 0 && selNLs.size < allNLs.length) {
      headerTitle = [...selNLs].map(nl => this._fmtGF(nl)).join(", ");
    }

    const panel = this._shadowRoot.getElementById("map-control-panel");
    panel?.classList.remove("panel-large"); panel?.classList.add("panel-medium");

    // ── Gemeinsame Aggregation ──
    const isWerbungMode = this.umsatzMainMode === "werbung";
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

    Object.entries(this.filteredPLZWerte || {}).forEach(([plz, v]) => {
      if (this.plzImRadius && this.plzImRadius.size > 0 && !this.plzImRadius.has(plz)) return;
      for (const key of aggKeys) { agg[key] += v[key] || 0; }
    });
    Object.entries(this.filteredKennwerte || {}).forEach(([plz, k]) => {
      if (this.plzImRadius && this.plzImRadius.size > 0 && !this.plzImRadius.has(plz)) return;
      totalUmsatzHR  += k["value_hr_n_umsatz_0"]?.raw ?? 0;
      totalHZKosten  += k["value_hz_kosten_0"]?.raw   ?? 0;
      totalHaushalteWK += this.filteredPLZWerte?.[plz]?.haushalte ?? 0;
      plzCount++;
    });

    const pick = (base, werb, zusatz, baseHH, werbHH, zusatzHH) => {
      if (!isWerbungMode) return { abs: base, hh: baseHH };
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
      stationaer: this.activeCategories.has("stationaer"),
      pluscard:   this.activeCategories.has("pluscard"),
      ra:         this.activeCategories.has("ra"),
      online:     this.activeCategories.has("online"),
    };
    const totalAbs = (active.stationaer?st.abs:0)+(active.pluscard?pc.abs:0)+(active.ra?ra.abs:0)+(active.online?os.abs:0);
    const totalHH  = (active.stationaer?st.hh:0) +(active.pluscard?pc.hh:0) +(active.ra?ra.hh:0) +(active.online?os.hh:0);
    const tN = agg.umsatz + agg.pluscard + agg.ra + agg.onlineshop;
    const tW = agg.umsatzWerbung + agg.pluscardWerbung + agg.raWerbung + agg.onlineshopWerbung;
    const tZ = agg.umsatzZusatz  + agg.pluscardZusatz  + agg.raZusatz  + agg.onlineshopZusatz;
    const antWA = tN > 0 ? ((tW / tN) * 100).toFixed(1) : "–";
    const wkGesamt = totalUmsatzHR > 0 ? ((totalHZKosten / totalUmsatzHR) * 100).toFixed(1) : "–";

    const fA  = x => Number(x||0).toLocaleString("de-DE");
    const fH  = x => Number(x||0).toFixed(2);
    const pct = (x, t) => t > 0 ? (x / t) * 100 : 0;
    const dis = (key) => !active[key] ? 'opacity:0.3;filter:grayscale(1)' : '';
    const hl = !isWerbungMode ? "Gesamtumsatz" : useWerbe && useZusatz ? "Werbeumsatz + Mitgekauft" : useWerbe ? "Werbeumsatz" : "Mitgekauft";

    popup.innerHTML = `
      <div style="flex-shrink:0;background:linear-gradient(135deg,var(--red) 0%,var(--red-light) 100%);color:white;padding:12px 14px 10px;display:flex;justify-content:space-between;align-items:flex-start;border-radius:var(--radius-xl) 0 0 0;line-height:1.3;">
        <div style="overflow:hidden;min-width:0">
          <div style="font-size:0.68rem;opacity:0.8;font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin-bottom:2px;">Gesamt-Ansicht · ${plzCount} PLZs</div>
          <div style="font-size:0.97rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:6px" title="${headerTitle}">${headerTitle}</div>
        </div>
        <button class="close-btn" style="position:static;flex-shrink:0;width:26px;height:26px;background:rgba(255,255,255,0.2);color:white;border:1.5px solid rgba(255,255,255,0.35);border-radius:50%;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;margin-left:8px;margin-top:2px;transition:background .15s,transform .15s">✕</button>
      </div>

      <div style="overflow-y:auto;flex:1;min-height:0;">

        <div class="umsatz-subheader">
          <span class="strong">${hl}: ${fA(totalAbs)} €</span><br>
          <span style="font-size:0.78rem;color:var(--gray-500)">${fH(totalHH)} € / HH &nbsp;·&nbsp; Werbeanteil: ${antWA} %</span>
        </div>

        <div class="umsatz-bar" style="margin:8px 14px 2px">
          <div style="background:var(--red);width:${pct(tN,tN+tW+tZ)}%;transition:width .5s ease"></div>
          <div style="background:#1f78b4;width:${pct(tW,tN+tW+tZ)}%;transition:width .5s ease"></div>
          <div style="background:#ffb000;width:${pct(tZ,tN+tW+tZ)}%;transition:width .5s ease"></div>
        </div>
        <div class="umsatz-legend" style="padding:2px 14px 8px">
          <span><span style="color:var(--red)">⬤</span> Normal</span>
          <span><span style="color:#1f78b4">⬤</span> Werbung</span>
          <span><span style="color:#ffb000">⬤</span> Mitgekauft</span>
        </div>

        <div class="section-title">WK-Kennwerte</div>
        <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:3px 10px;padding:8px 14px;font-size:0.82rem;">
          <div style="color:var(--gray-600);font-weight:500">Netto-Umsatz (HR)</div>
          <div style="text-align:right;font-weight:700;color:var(--gray-800)">${fA(totalUmsatzHR)} €</div>
          <div style="color:var(--gray-600);font-weight:500">HZ-Werbekosten</div>
          <div style="text-align:right;font-weight:700;color:var(--gray-800)">${fA(totalHZKosten)} €</div>
          <div style="color:var(--gray-600);font-weight:500">Haushalte</div>
          <div style="text-align:right;font-weight:700;color:var(--gray-800)">${fA(Math.round(totalHaushalteWK))}</div>
        </div>

        <div class="section-title">Umsatzanteile (Kategorien)</div>
        <div class="umsatz-bar" style="margin:8px 14px 2px">
          <div class="share-stationaer" style="width:${pct(agg.umsatz,tN)}%;transition:width .5s ease"></div>
          <div class="share-pluscard"   style="width:${pct(agg.pluscard,tN)}%;transition:width .5s ease"></div>
          <div class="share-ra"         style="width:${pct(agg.ra,tN)}%;transition:width .5s ease"></div>
          <div class="share-online"     style="width:${pct(agg.onlineshop,tN)}%;transition:width .5s ease"></div>
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
          <div class="value" style="${dis('stationaer')}">${fA(st.abs)} €</div>
          <div class="value" style="${dis('stationaer')}">${fH(st.hh)} €</div>
          <div class="label" style="${dis('pluscard')}">💳 Pluscard</div>
          <div class="value" style="${dis('pluscard')}">${fA(pc.abs)} €</div>
          <div class="value" style="${dis('pluscard')}">${fH(pc.hh)} €</div>
          <div class="label" style="${dis('ra')}">📦 R&amp;A</div>
          <div class="value" style="${dis('ra')}">${fA(ra.abs)} €</div>
          <div class="value" style="${dis('ra')}">${fH(ra.hh)} €</div>
          <div class="label" style="${dis('online')}">🛒 KUBE OS</div>
          <div class="value" style="${dis('online')}">${fA(os.abs)} €</div>
          <div class="value" style="${dis('online')}">${fH(os.hh)} €</div>
        </div>

      </div>`;

    popup.classList.remove("hidden"); void popup.offsetWidth; popup.classList.add("show");
    popup.querySelector(".close-btn").onclick = () => {
      popup.classList.remove("show"); popup.classList.add("hidden");
    };
  }

  showNotesOnMap() {
    if(!this._geoLayer) return;
    const zoomLevel=this.map.getZoom(),bounds=this.map.getBounds();
    this._geoLayer.eachLayer(layer=>{
      const note=layer.feature?.properties?.note,center=layer.getBounds?.().getCenter?.();
      if(zoomLevel>=12&&note&&center&&bounds.contains(center)){if(!layer.getTooltip())layer.bindTooltip(note,{permanent:true,direction:'center',className:'note-label'}).openTooltip();else layer.openTooltip();}
      else{if(layer.getTooltip())layer.closeTooltip();}
    });
  }

  prepareMapData(filteredData) {
    this.Niederlassung={};this.nlKoordinaten={};this.hzFlags={};this.extraNLs=[];
    // PERF: for-loop + lokale Refs auf this-Properties reduzieren Property-Lookup-Overhead
    const NL  = this.Niederlassung;
    const nlK = this.nlKoordinaten;
    const hzF = this.hzFlags;
    for (let i = 0, len = filteredData.length; i < len; i++) {
      const row    = filteredData[i];
      const rawPLZ = row["dimension_plz_0"]?.id;
      const plz    = this._normalizePLZ(rawPLZ);
      const nlKey  = row["dimension_niederlassung_0"]?.id?.trim();
      const hz     = row["dimension_hzflag_0"]?.id?.trim() === "X";
      if (nlKey) {
        NL[nlKey] = nlKey;
        if (!nlK[nlKey]) {
          const lat = parseFloat(row["dimension_Lat_0"]?.label);
          const lon = parseFloat(row["dimension_lon_0"]?.label);
          if (!isNaN(lat) && !isNaN(lon)) nlK[nlKey] = { lat, lon };
        }
      }
      if (plz) hzF[plz] = hz;
    }
  }

  getDistanceKm(lat1,lon1,lat2,lon2) {
    const R=6371,dLat=(lat2-lat1)*Math.PI/180,dLon=(lon2-lon1)*Math.PI/180;
    const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }
  getPolygonCenter(layer){return layer.getBounds().getCenter();}

  applyRadiusFilter(radiusKm) {
    if(!this._layerByPLZ) return;
    if(!this._distanceCache||Object.keys(this._distanceCache).length===0) this._buildDistanceCache();
    const plzImRadius=new Set(),cache=this._distanceCache,plzList=Object.keys(this._layerByPLZ);
    for(let i=0;i<plzList.length;i++){const plz=plzList[i];if((cache[plz]??Infinity)<=radiusKm)plzImRadius.add(plz);}
    this.plzImRadius=plzImRadius;
    this.prepareUmsatzPLZWerte();
    this.computeWKKennwerte();this.computeStreuverlust();this.updateGeoLayer();this.renderDataTable(this.filteredKennwerte);
    this._rerenderActivePopup();
  }

  computeWKKennwerte() {
    if (!this.filteredData) return;
    const aggregated = {}, unfilteredUmsatzByPLZ = {};
    // PERF: Zwei Loops zu einem zusammengeführt – spart einen kompletten
    // Durchlauf über filteredData (kann tausende Rows sein)
    const selNLs = this._selectedNLs;
    const radius = this.plzImRadius;
    const hasNLFilter = selNLs && selNLs.size > 0;
    const hasRadius   = radius instanceof Set && radius.size > 0;
    const data = this.filteredData;
    for (let i = 0, len = data.length; i < len; i++) {
      const row = data[i];
      const rawPLZ = row["dimension_plz_0"]?.id ?? row["dimension_plz_0"]?.raw;
      const plz = this._normalizePLZ(rawPLZ) || "00000";
      const umsatz = row["value_hr_n_umsatz_0"]?.raw ?? 0;
      // Immer für unfilteredUmsatz zählen (für WK-Nachbar-Berechnung)
      unfilteredUmsatzByPLZ[plz] = (unfilteredUmsatzByPLZ[plz] || 0) + umsatz;
      // Gefilterte Aggregation
      const nl = row["dimension_niederlassung_0"]?.id?.trim();
      if (hasNLFilter && !selNLs.has(nl)) continue;
      if (hasRadius && !radius.has(plz)) continue;
      if (!aggregated[plz]) aggregated[plz] = { hzCount: 0, umsatzNetto: 0, hzKosten: 0, potHzKosten: [] };
      const entry = aggregated[plz];
      if (row["dimension_hzflag_0"]?.id?.trim() === "X") entry.hzCount++;
      entry.umsatzNetto += umsatz;
      entry.hzKosten    += row["value_hz_kosten_0"]?.raw ?? 0;
      const potHz = row["value_hz_potentiell_0"]?.raw;
      if (typeof potHz === "number") entry.potHzKosten.push(potHz);
    }

    const base = this.filteredKennwerte || {},
          newFilteredKennwerte = {},
          newFilteredPLZWerte  = {};

    Object.entries(aggregated).forEach(([plz, entry]) => {
      const umsatzNetto  = entry.umsatzNetto,
            hzKosten     = entry.hzKosten,
            wkPercent    = umsatzNetto > 0 ? Number(((hzKosten / umsatzNetto) * 100).toFixed(1)) : 0,
            unfU         = unfilteredUmsatzByPLZ[plz] ?? 0,
            wkNachbarn   = unfU > 0 ? Number(((hzKosten / unfU) * 100).toFixed(1)) : 0,
            avgPotHz     = entry.potHzKosten.length > 0
                            ? entry.potHzKosten.reduce((a, b) => a + b, 0) / entry.potHzKosten.length
                            : 0,
            potHzPercent = umsatzNetto > 0 ? Number(((avgPotHz / umsatzNetto) * 100).toFixed(1)) : 0,
            isHZ         = entry.hzCount > 0,
            isCritical   = entry.hzCount > 1,
            baseEntry    = base[plz] || {},
            old          = this.filteredPLZWerte?.[plz] || {};

      newFilteredKennwerte[plz] = {
        ...baseEntry,
        isHZ, isCritical,
        value_hr_n_umsatz_0:      { raw: umsatzNetto },
        value_wk_in_percent_0:    { raw: wkPercent },
        value_wk_nachbar_0:       { raw: wkNachbarn },
        value_hz_kosten_0:        { raw: hzKosten },
        value_hz_potentiell_0:    { raw: avgPotHz },
        value_wk_potentiell_0:    { raw: potHzPercent },
        value_ums_erhebung_0:     { raw: old.umsatzErhebung ?? 0 },
        value_kd_erhebung_0:      { raw: old.kdErhebung ?? 0 },
        value_auflage_0:          { raw: old.auflage ?? 0 },
        value_kaufkraft_0:        { raw: old.kaufkraftIndex   ?? 0 },
        value_werbeverweigerer_0: { raw: old.werbeverweigerer ?? 0 },
      };

      newFilteredPLZWerte[plz] = {
        wk: wkPercent, wkPot: potHzPercent, hz: isHZ,
        umsatz:        old.umsatz        ?? 0,
        ra:            old.ra            ?? 0,
        onlineshop:    old.onlineshop    ?? 0,
        pluscard:      old.pluscard      ?? 0,
        haushalte:     old.haushalte     ?? 0,
        kaufkraftIndex:   old.kaufkraftIndex   ?? 0,
        werbeverweigerer: old.werbeverweigerer ?? 0,
        umsatzProHaushalt:         old.umsatzProHaushalt         ?? 0,
        raProHaushalt:             old.raProHaushalt             ?? 0,
        onlineshopProHaushalt:     old.onlineshopProHaushalt     ?? 0,
        pluscardProHaushalt:       old.pluscardProHaushalt       ?? 0,
        umsatzWerbung:             old.umsatzWerbung             ?? 0,
        raWerbung:                 old.raWerbung                 ?? 0,
        onlineshopWerbung:         old.onlineshopWerbung         ?? 0,
        pluscardWerbung:           old.pluscardWerbung           ?? 0,
        umsatzZusatz:              old.umsatzZusatz              ?? 0,
        raZusatz:                  old.raZusatz                  ?? 0,
        onlineshopZusatz:          old.onlineshopZusatz          ?? 0,
        pluscardZusatz:            old.pluscardZusatz            ?? 0,
        umsatzWerbungProHaushalt:  old.umsatzWerbungProHaushalt  ?? 0,
        raWerbungProHaushalt:      old.raWerbungProHaushalt      ?? 0,
        onlineshopWerbungProHaushalt: old.onlineshopWerbungProHaushalt ?? 0,
        pluscardWerbungProHaushalt:   old.pluscardWerbungProHaushalt  ?? 0,
        umsatzZusatzProHaushalt:   old.umsatzZusatzProHaushalt   ?? 0,
        raZusatzProHaushalt:       old.raZusatzProHaushalt       ?? 0,
        onlineshopZusatzProHaushalt: old.onlineshopZusatzProHaushalt ?? 0,
        pluscardZusatzProHaushalt:   old.pluscardZusatzProHaushalt   ?? 0,
        werbeAnteil: old.werbeAnteil ?? 0,
      };
    });

    this.filteredKennwerte = newFilteredKennwerte;
    this.filteredPLZWerte  = newFilteredPLZWerte;
  }

  toggleNLSelection(nl) {
    if (!this._selectedNLs) this._selectedNLs = new Set();
    const allCount = this.allNLs?.length || 0;

    if (this._selectedNLs.size === allCount) {
      this._selectedNLs = new Set([nl]);
    } else if (this._selectedNLs.has(nl)) {
      this._selectedNLs.delete(nl);
      if (this._selectedNLs.size === 0) {
        this._selectedNLs = new Set(this.allNLs);
      }
    } else {
      this._selectedNLs.add(nl);
      if (this._selectedNLs.size === allCount) {
        this._selectedNLs = new Set(this.allNLs);
      }
    }

    this.updateNLSelectionUI();
    this.applyNLFilter([...this._selectedNLs]);
    const radius = Number(this._shadowRoot.getElementById("radius-slider").value);
    this.applyRadiusFilter(radius);
    this.updateGeoLayer();
    this.renderDataTable(this.filteredKennwerte);
    this.prepareUmsatzPLZWerte();
    this.showOverviewPopup();
  }

  initRadiusSlider() {
    const slider=this._shadowRoot.getElementById("radius-slider"),valueLabel=this._shadowRoot.getElementById("radius-value");
    if(!slider) return;
    valueLabel.textContent=slider.value;
    const updateFill=()=>{const min=+slider.min,max=+slider.max,val=+slider.value,pct=((val-min)/(max-min))*100;slider.style.background=`linear-gradient(90deg, var(--red) ${pct}%, var(--gray-200) ${pct}%)`;};
    updateFill();
    let debounceTimer=null;
    slider.addEventListener("input",()=>{
      const radius=Number(slider.value);valueLabel.textContent=radius;updateFill();
      clearTimeout(debounceTimer);debounceTimer=setTimeout(()=>{this.applyRadiusFilter(radius);this.renderDataTable(this.filteredKennwerte);},80);
    });
  }

  onCustomWidgetEvent(event) { if(event.name==="toggleTiles") this.toggleMapTiles(); }

  set myDataSource(dataBinding) {
    this._myDataSource = dataBinding;
    // Index + Cache invalidieren bei neuen Daten
    this._erhebungIndex = null;
    this._plzNormCache = null;

    // Sofort versuchen zu rendern – wenn Karte noch nicht bereit, einmaligen
    // Map-ready-Callback registrieren statt polling-Loop
    if (!this.map) {
      this._pendingRender = true; // render() wird von initializeMapBase() aufgerufen
      return;
    }
    // Daten noch nicht bereit (z.B. state === "loading")
    if (!this._myDataSource || this._myDataSource.state !== "success") {
      this._scheduleDataPoll();
      return;
    }
    this.render();
  }

  _scheduleDataPoll() {
    if (this._dataPollTimer) return; // läuft bereits, kein zweiter starten
    this._updateLoaderPhase(1, "Warte auf Daten…");
    const start = Date.now();
    this._dataPollTimer = setInterval(() => {
      if (this._myDataSource?.state === "success") {
        clearInterval(this._dataPollTimer);
        this._dataPollTimer = null;
        this.render();
      } else {
        // Fortschritt anzeigen damit User sieht dass etwas passiert
        const secs = ((Date.now() - start) / 1000).toFixed(0);
        this._updateLoaderPhase(1, `Warte auf Daten… (${secs}s)`);
      }
    }, 50);
  }
}

    if (!customElements.get('geo-map-widget')) {
      customElements.define('geo-map-widget', GeoMapWidget);
    }
  })();
