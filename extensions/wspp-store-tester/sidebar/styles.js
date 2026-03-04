// sidebar/styles.js — CSS del panel CRM inyectado en la página
// Depende de: constants.js
// Expone: WSPP.injectStyles()
(function () {
  'use strict';
  window.WSPP = window.WSPP || {};

  const { C, PANEL_WIDTH } = WSPP;

  WSPP.CSS = `
    #wspp-toggle,
    #wspp-crm-panel,
    #wspp-crm-panel * {
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
    }

    /* ── Toggle ─────────────────────────── */
    #wspp-toggle {
      position: fixed; right: 0; top: 50%; transform: translateY(-50%);
      z-index: 2147483647; width: 22px; height: 56px;
      background: ${C.blue}; border: none; border-radius: 8px 0 0 8px;
      color: ${C.gold}; font-size: 11px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: -2px 0 12px rgba(0,0,0,.5); transition: background .15s;
    }
    #wspp-toggle:hover { background: ${C.blueHi}; }

    /* ── Panel ──────────────────────────── */
    #wspp-crm-panel {
      position: fixed; right: 0; top: 0; height: 100vh; width: ${PANEL_WIDTH}px;
      z-index: 2147483646; background: ${C.bg}; color: ${C.text};
      font-size: 13px; display: flex; flex-direction: column;
      border-left: 1px solid ${C.border};
      box-shadow: -6px 0 32px rgba(0,0,0,.6);
      transition: transform .2s ease; overflow: hidden;
    }
    #wspp-crm-panel.wspp-hidden { transform: translateX(100%); }

    /* ── Header ─────────────────────────── */
    .w-hdr {
      background: ${C.blue}; padding: 12px 14px 10px;
      display: flex; align-items: center; gap: 9px;
      flex-shrink: 0;
    }
    .w-hdr-logo { font-size: 11px; font-weight: 800; letter-spacing: 2px; color: ${C.gold}; flex: 1; }
    .w-hdr-sub  { font-size: 10px; color: rgba(255,255,255,.5); margin-top: 1px; }
    .w-hdr-user {
      font-size: 10px; background: rgba(255,200,0,.12); border: 1px solid rgba(255,200,0,.25);
      color: ${C.gold}; border-radius: 20px; padding: 2px 9px; font-weight: 600;
      max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .w-hdr-logout { background: none; border: none; color: ${C.textMuted}; cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 4px; }
    .w-hdr-logout:hover { color: ${C.red}; }

    /* ── Nav ────────────────────────────── */
    .w-nav { background: ${C.surface}; display: flex; border-bottom: 1px solid ${C.border}; flex-shrink: 0; }
    .w-nav-btn {
      flex: 1; padding: 9px 4px; border: none; background: none;
      color: ${C.textSub}; font-size: 10px; font-weight: 700; cursor: pointer;
      text-transform: uppercase; letter-spacing: .5px;
      border-bottom: 2px solid transparent; transition: all .15s; position: relative;
    }
    .w-nav-btn.on { color: ${C.gold}; border-bottom-color: ${C.gold}; }
    .w-nav-btn:hover:not(.on) { color: ${C.text}; }
    .w-badge {
      display: inline-block; background: ${C.red}; color: #fff;
      border-radius: 99px; font-size: 9px; padding: 1px 4px;
      margin-left: 3px; vertical-align: middle; font-weight: 700;
    }
    .w-badge.gold { background: ${C.goldBg}; color: ${C.gold}; border: 1px solid ${C.goldDim}; }

    /* ── Campaign bar ────────────────────── */
    .w-camp-bar {
      background: ${C.surface}; padding: 8px 12px; border-bottom: 1px solid ${C.border};
      flex-shrink: 0; display: flex; align-items: center; gap: 6px;
    }
    .w-camp-label { font-size: 10px; color: ${C.gold}; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; white-space: nowrap; }
    .w-select { flex: 1; padding: 5px 9px; border-radius: 7px; background: ${C.surface2}; border: 1px solid ${C.border}; color: ${C.text}; font-size: 12px; outline: none; }
    .w-select:focus { border-color: ${C.gold}; }

    /* ── Filters ─────────────────────────── */
    .w-filters {
      background: ${C.surface}; padding: 8px 10px;
      display: flex; flex-direction: column; gap: 6px;
      border-bottom: 1px solid ${C.border}; flex-shrink: 0;
    }
    .w-search-wrap { position: relative; display: flex; align-items: center; }
    .w-search-icon { position: absolute; left: 9px; font-size: 12px; opacity: .45; pointer-events: none; }
    .w-search {
      width: 100%; padding: 7px 9px 7px 28px; border-radius: 8px;
      background: ${C.surface2}; border: 1px solid ${C.border};
      color: ${C.text}; font-size: 12px; outline: none; transition: border-color .15s;
    }
    .w-search:focus { border-color: ${C.gold}; }
    .w-search::placeholder { color: ${C.textMuted}; }

    .w-tabs { display: flex; gap: 3px; }
    .w-tab {
      flex: 1; padding: 5px 2px; border-radius: 6px; border: none;
      background: ${C.surface2}; color: ${C.textSub};
      font-size: 10px; font-weight: 700; cursor: pointer;
      text-transform: uppercase; letter-spacing: .3px; transition: all .15s;
    }
    .w-tab.on { background: ${C.blue}; color: ${C.gold}; border: 1px solid ${C.goldDim}; }
    .w-tab:hover:not(.on) { background: ${C.surface3}; color: ${C.text}; }

    /* Tag pills filter bar */
    .w-tag-bar { display: flex; gap: 3px; flex-wrap: wrap; }
    .w-tag-pill {
      padding: 2px 8px; border-radius: 99px; font-size: 10px; font-weight: 600;
      border: 1px solid ${C.border}; background: ${C.surface2}; color: ${C.textSub};
      cursor: pointer; transition: all .12s;
    }
    .w-tag-pill.on { background: ${C.goldBg}; color: ${C.gold}; border-color: ${C.goldDim}; }
    .w-tag-pill:hover:not(.on) { border-color: ${C.borderHi}; color: ${C.text}; }

    /* ── List ────────────────────────────── */
    .w-list { flex: 1; overflow-y: auto; }
    .w-list::-webkit-scrollbar { width: 3px; }
    .w-list::-webkit-scrollbar-thumb { background: ${C.surface3}; border-radius: 2px; }

    .w-lead {
      padding: 10px 12px; border-bottom: 1px solid ${C.border};
      cursor: pointer; display: flex; align-items: flex-start; gap: 10px;
      transition: background .1s;
    }
    .w-lead:hover { background: ${C.surface}; }
    .w-lead:active { background: ${C.surface2}; }

    .w-av {
      width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
      background: ${C.surface2}; border: 2px solid ${C.border};
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 14px; color: ${C.textSub};
    }
    .w-info { flex: 1; min-width: 0; }
    .w-name { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .w-sub  { font-size: 11px; color: ${C.textSub}; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .w-tags-row { display: flex; gap: 3px; flex-wrap: wrap; margin-top: 3px; }
    .w-tag-sm {
      font-size: 9px; padding: 1px 6px; border-radius: 99px;
      border: 1px solid; font-weight: 600;
    }
    .w-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
    .w-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .w-status-dot.nuevo        { background: ${C.textMuted}; }
    .w-status-dot.hablado      { background: ${C.orange}; box-shadow: 0 0 4px ${C.orange}55; }
    .w-status-dot.respondieron { background: ${C.green};  box-shadow: 0 0 4px ${C.green}55; }
    .w-status-dot.archivado    { background: ${C.red}; }
    .w-wa-btn {
      background: ${C.blue}; border: 1px solid ${C.goldDim}; border-radius: 5px;
      color: ${C.gold}; font-size: 10px; font-weight: 700;
      padding: 3px 7px; cursor: pointer; transition: all .15s;
    }
    .w-wa-btn:hover { background: ${C.blueHi}; border-color: ${C.gold}; }

    /* ── Empty / spinner ─────────────────── */
    .w-empty { padding: 44px 20px; text-align: center; color: ${C.textSub}; display: flex; flex-direction: column; align-items: center; gap: 10px; }
    .w-empty-icon { font-size: 32px; opacity: .3; }
    .w-spin-wrap { display: flex; align-items: center; justify-content: center; padding: 40px; }
    .w-spin { width: 24px; height: 24px; border: 3px solid ${C.surface3}; border-top-color: ${C.gold}; border-radius: 50%; animation: wspp-spin .7s linear infinite; }
    @keyframes wspp-spin { to { transform: rotate(360deg); } }

    .w-more { padding: 12px; text-align: center; color: ${C.gold}; font-size: 11px; cursor: pointer; font-weight: 600; border-top: 1px solid ${C.border}; }
    .w-more:hover { text-decoration: underline; }

    .w-footer { background: ${C.surface}; padding: 4px 12px; font-size: 10px; color: ${C.textMuted}; text-align: center; border-top: 1px solid ${C.border}; flex-shrink: 0; }

    /* ── Login ───────────────────────────── */
    .w-login { flex: 1; display: flex; flex-direction: column; padding: 28px 20px; gap: 12px; justify-content: center; }
    .w-login-logo { text-align: center; font-size: 13px; font-weight: 800; letter-spacing: 3px; color: ${C.gold}; margin-bottom: 4px; }
    .w-login-title { font-size: 16px; font-weight: 700; text-align: center; }
    .w-login-sub   { font-size: 12px; color: ${C.textSub}; text-align: center; }
    .w-inp { width: 100%; padding: 10px 12px; border-radius: 8px; background: ${C.surface}; border: 1px solid ${C.border}; color: ${C.text}; font-size: 13px; outline: none; transition: border-color .15s; }
    .w-inp:focus { border-color: ${C.gold}; }
    .w-btn { width: 100%; padding: 11px; border-radius: 8px; border: none; background: ${C.gold}; color: #0f1a0f; font-size: 13px; font-weight: 800; cursor: pointer; letter-spacing: .3px; transition: opacity .15s, transform .1s; }
    .w-btn:hover { opacity: .88; }
    .w-btn:active { transform: scale(.98); }
    .w-btn:disabled { opacity: .45; cursor: default; transform: none; }
    .w-err { background: rgba(232,83,74,.12); color: ${C.red}; padding: 8px 10px; border-radius: 6px; font-size: 11px; border: 1px solid rgba(232,83,74,.25); display: none; }

    /* ── Detail ──────────────────────────── */
    .w-detail { flex: 1; overflow-y: auto; }
    .w-detail::-webkit-scrollbar { width: 3px; }
    .w-detail::-webkit-scrollbar-thumb { background: ${C.surface3}; }
    .w-back { background: none; border: none; color: ${C.gold}; cursor: pointer; font-size: 20px; line-height: 1; padding: 0 4px 0 0; }
    .w-detail-hero { background: linear-gradient(135deg, ${C.blue} 0%, ${C.surface} 100%); padding: 16px 14px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid ${C.border}; }
    .w-detail-av { width: 50px; height: 50px; border-radius: 50%; flex-shrink: 0; background: ${C.surface2}; border: 2px solid ${C.goldDim}; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 19px; color: ${C.gold}; }
    .w-drows { padding: 0 12px 6px; }
    .w-drow { display: flex; justify-content: space-between; align-items: baseline; padding: 7px 0; border-bottom: 1px solid ${C.border}; font-size: 12px; }
    .w-drow:last-child { border-bottom: none; }
    .w-dlabel { color: ${C.textSub}; }
    .w-dval { font-weight: 600; text-align: right; max-width: 58%; word-break: break-all; }
    .w-actions { display: flex; gap: 6px; padding: 10px 12px; border-bottom: 1px solid ${C.border}; }
    .w-action-btn { flex: 1; padding: 8px 4px; border-radius: 7px; border: 1px solid ${C.border}; background: ${C.surface2}; color: ${C.textSub}; font-size: 10px; font-weight: 700; cursor: pointer; text-align: center; text-transform: uppercase; letter-spacing: .3px; transition: all .15s; }
    .w-action-btn.active-status { border-color: currentColor; }
    .w-action-btn.btn-hablado.active-status      { background: rgba(245,166,35,.12); color: ${C.orange}; }
    .w-action-btn.btn-respondieron.active-status { background: rgba(34,199,138,.12); color: ${C.green}; }
    .w-action-btn.btn-archivar.active-status     { background: rgba(232,83,74,.1);  color: ${C.red}; }
    .w-action-btn:hover:not(.active-status) { background: ${C.surface3}; color: ${C.text}; }
    .w-open-btn { width: calc(100% - 24px); margin: 10px 12px; padding: 11px; border-radius: 9px; border: none; background: ${C.gold}; color: #0f1a0f; font-size: 13px; font-weight: 800; cursor: pointer; transition: opacity .15s, transform .1s; }
    .w-open-btn:hover { opacity: .88; }
    .w-open-btn:active { transform: scale(.98); }
    .w-open-btn:disabled { opacity: .35; cursor: default; transform: none; }
    .w-section-title { font-size: 10px; color: ${C.textMuted}; text-transform: uppercase; font-weight: 700; letter-spacing: .5px; padding: 10px 12px 4px; }
    .w-revert-btn { background: none; border: 1px solid ${C.border}; color: ${C.textSub}; border-radius: 5px; font-size: 10px; cursor: pointer; padding: 3px 7px; margin-top: 4px; transition: all .12s; }
    .w-revert-btn:hover { border-color: ${C.gold}; color: ${C.gold}; }

    /* ── Tag editor — searchable dropdown ── */
    .w-tags-wrap { padding: 0 12px 10px; }
    .w-tags-list { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 7px; min-height: 22px; }
    .w-tag-chip {
      display: inline-flex; align-items: center; gap: 3px;
      padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 600;
      border: 1px solid;
    }
    .w-tag-rm { background: none; border: none; color: inherit; cursor: pointer; font-size: 13px; line-height: 1; padding: 0; opacity: .6; }
    .w-tag-rm:hover { opacity: 1; }

    /* Searchable tag select */
    .w-tag-select-wrap { position: relative; }
    .w-tag-search {
      width: 100%; padding: 7px 9px 7px 28px; border-radius: 8px;
      background: ${C.surface2}; border: 1px solid ${C.border};
      color: ${C.text}; font-size: 12px; outline: none; transition: border-color .15s;
    }
    .w-tag-search:focus { border-color: ${C.gold}; }
    .w-tag-search::placeholder { color: ${C.textMuted}; }
    .w-tag-search-icon { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); font-size: 11px; opacity: .4; pointer-events: none; }
    .w-tag-dropdown {
      position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 9999;
      background: ${C.surface2}; border: 1px solid ${C.borderHi};
      border-radius: 8px; max-height: 200px; overflow-y: auto;
      box-shadow: 0 8px 24px rgba(0,0,0,.5);
    }
    .w-tag-dropdown::-webkit-scrollbar { width: 3px; }
    .w-tag-dropdown::-webkit-scrollbar-thumb { background: ${C.surface3}; }
    .w-tag-dropdown-item {
      display: flex; align-items: center; gap: 8px; padding: 8px 10px;
      cursor: pointer; font-size: 12px; transition: background .1s;
    }
    .w-tag-dropdown-item:hover { background: ${C.surface3}; }
    .w-tag-dropdown-item .t-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .w-tag-dropdown-item .t-name { flex: 1; }
    .w-tag-dropdown-item .t-used { font-size: 10px; color: ${C.textMuted}; }
    /* ── Sección "Crear nueva etiqueta" dentro del dropdown ── */
    .w-tag-create-section {
      border-top: 1px solid ${C.border};
      padding: 8px 10px 6px;
    }
    .w-tag-create-label {
      font-size: 11px; color: ${C.textSub}; margin-bottom: 7px;
      display: flex; align-items: center; gap: 5px;
    }
    .w-tag-create-label strong { font-weight: 700; }

    .w-tag-color-row {
      display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-bottom: 7px;
    }
    .w-tag-color-label { font-size: 10px; color: ${C.textMuted}; flex-shrink: 0; margin-right: 2px; }
    .w-color-swatch {
      width: 18px; height: 18px; border-radius: 50%; cursor: pointer;
      border: 2px solid transparent; transition: border-color .1s, transform .1s; flex-shrink: 0;
    }
    .w-color-swatch:hover { transform: scale(1.15); }
    .w-color-swatch.sel   { border-color: #fff; box-shadow: 0 0 0 1px rgba(255,255,255,.5); }
    .w-color-custom-label {
      width: 18px; height: 18px; border-radius: 50%; cursor: pointer;
      border: 1px dashed ${C.borderHi}; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; overflow: hidden;
    }
    .w-color-custom-label input[type="color"] {
      width: 22px; height: 22px; border: none; cursor: pointer; padding: 0;
      background: none; margin: -2px;
    }
    .w-tag-confirm-row { display: flex; gap: 5px; }
    .w-tag-confirm-btn {
      flex: 1; padding: 7px; border-radius: 6px; border: none;
      background: ${C.gold}; color: #0f1a0f; font-size: 11px; font-weight: 800; cursor: pointer;
      transition: opacity .15s;
    }
    .w-tag-confirm-btn:hover { opacity: .85; }

    /* Tag filter (buscador cuando hay > 6 tags) */
    .w-tag-filter-wrap { position: relative; }
    .w-tag-filter-inp  { padding-left: 28px !important; }
    .w-tag-filter-clear {
      position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
      background: none; border: none; color: ${C.textMuted}; font-size: 16px;
      cursor: pointer; line-height: 1; padding: 0;
    }
    .w-tag-filter-clear:hover { color: ${C.text}; }
    .w-tag-filter-dropdown { top: calc(100% + 4px); }

    /* Notes */
    .w-notes-wrap { padding: 0 12px 14px; }
    .w-note { width: 100%; padding: 9px 11px; background: ${C.surface}; border: 1px solid ${C.border}; border-radius: 8px; color: ${C.text}; font-size: 12px; resize: none; outline: none; min-height: 70px; transition: border-color .15s; line-height: 1.5; }
    .w-note:focus { border-color: ${C.gold}; }
    .w-save-btn { width: 100%; margin-top: 6px; padding: 8px; border-radius: 7px; border: 1px solid ${C.border}; background: ${C.surface2}; color: ${C.text}; font-size: 11px; font-weight: 700; cursor: pointer; transition: all .15s; }
    .w-save-btn:hover { background: ${C.surface3}; border-color: ${C.gold}; color: ${C.gold}; }
    .w-save-btn:disabled { opacity: .5; cursor: default; }

    /* ── Metrics ─────────────────────────── */
    .w-metrics { flex: 1; overflow-y: auto; padding: 12px; }
    .w-metrics::-webkit-scrollbar { width: 3px; }
    .w-metrics::-webkit-scrollbar-thumb { background: ${C.surface3}; }
    .w-global-banner { background: linear-gradient(135deg, ${C.blue} 0%, ${C.surface} 100%); border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; border: 1px solid ${C.borderHi}; }
    .w-global-title  { font-size: 10px; color: ${C.gold}; text-transform: uppercase; font-weight: 700; margin-bottom: 10px; letter-spacing: .8px; }
    .w-global-nums   { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    .w-global-item   { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .w-global-val    { font-size: 26px; font-weight: 800; color: ${C.text}; line-height: 1; }
    .w-global-val.gold   { color: ${C.gold}; }
    .w-global-val.green  { color: ${C.green}; }
    .w-global-val.orange { color: ${C.orange}; }
    .w-global-val.red    { color: ${C.red}; }
    .w-global-lbl { font-size: 9px; color: ${C.textSub}; text-transform: uppercase; text-align: center; }
    .w-progress { height: 4px; background: ${C.surface2}; border-radius: 99px; overflow: hidden; margin-top: 8px; }
    .w-progress-fill { height: 100%; background: linear-gradient(90deg, ${C.gold} 0%, ${C.green} 100%); border-radius: 99px; transition: width .5s ease; }
    .w-card { background: ${C.surface}; border-radius: 10px; padding: 12px 14px; margin-bottom: 9px; border: 1px solid ${C.border}; }
    .w-card-title { font-size: 10px; color: ${C.textSub}; margin-bottom: 8px; text-transform: uppercase; font-weight: 700; letter-spacing: .5px; }
    .w-card-grid  { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .w-card-item  { display: flex; flex-direction: column; gap: 2px; }
    .w-card-val   { font-size: 22px; font-weight: 700; color: ${C.text}; }
    .w-card-lbl   { font-size: 10px; color: ${C.textSub}; }
    .w-card-val.green  { color: ${C.green}; }
    .w-card-val.orange { color: ${C.orange}; }
    .w-card-val.gold   { color: ${C.gold}; font-size: 13px; }
    .w-phones-title { font-size: 10px; color: ${C.textMuted}; text-transform: uppercase; font-weight: 700; margin-bottom: 6px; letter-spacing: .5px; }
    .w-phone-card { background: ${C.surface}; border-radius: 10px; padding: 10px 12px; margin-bottom: 7px; border: 1px solid ${C.border}; display: flex; align-items: flex-start; gap: 10px; }
    .w-phone-card.is-me { border-color: ${C.goldDim}; }
    .w-phone-icon { font-size: 18px; flex-shrink: 0; margin-top: 2px; }
    .w-phone-info { flex: 1; min-width: 0; }
    .w-phone-num  { font-size: 12px; font-weight: 700; color: ${C.text}; font-family: 'SF Mono', 'Fira Code', monospace; display: flex; align-items: center; gap: 6px; }
    .w-phone-me-badge { font-size: 9px; padding: 1px 6px; border-radius: 99px; background: ${C.goldBg}; color: ${C.gold}; border: 1px solid ${C.goldDim}; }
    .w-phone-stats { display: flex; gap: 10px; margin-top: 6px; flex-wrap: wrap; }
    .w-phone-stat { display: flex; flex-direction: column; align-items: center; gap: 1px; }
    .w-phone-stat-val { font-size: 15px; font-weight: 700; }
    .w-phone-stat-val.green  { color: ${C.green}; }
    .w-phone-stat-val.orange { color: ${C.orange}; }
    .w-phone-stat-val.red    { color: ${C.red}; }
    .w-phone-stat-lbl { font-size: 9px; color: ${C.textSub}; }
    .w-phone-bar { width: 100%; height: 3px; background: ${C.surface2}; border-radius: 99px; overflow: hidden; margin-top: 6px; }
    .w-phone-bar-fill { height: 100%; background: ${C.gold}; border-radius: 99px; }

    /* ── Messages / No contestados ──────── */
    .w-msgs { flex: 1; overflow-y: auto; }
    .w-msgs::-webkit-scrollbar { width: 3px; }
    .w-msgs::-webkit-scrollbar-thumb { background: ${C.surface3}; }

    /* Sub-tabs */
    .w-msg-subtabs { display: flex; background: ${C.surface}; border-bottom: 1px solid ${C.border}; flex-shrink: 0; }
    .w-msg-stab {
      flex: 1; padding: 8px 4px; border: none; background: none;
      color: ${C.textSub}; font-size: 10px; font-weight: 700; cursor: pointer;
      text-transform: uppercase; letter-spacing: .4px;
      border-bottom: 2px solid transparent; transition: all .15s;
    }
    .w-msg-stab.on { color: ${C.gold}; border-bottom-color: ${C.gold}; }
    .w-msg-stab:hover:not(.on) { color: ${C.text}; }

    /* Pending card */
    .w-pending-card {
      padding: 10px 12px; border-bottom: 1px solid ${C.border};
      display: flex; align-items: center; gap: 10px;
      border-left: 3px solid ${C.orange};
      transition: background .1s;
    }
    .w-pending-card:hover { background: ${C.surface}; }
    .w-pending-card.urgent {
      border-left-color: ${C.red};
      background: rgba(232,83,74,.04);
    }
    .w-pending-card.urgent:hover { background: rgba(232,83,74,.08); }
    .w-pending-av {
      width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 15px;
      background: rgba(245,166,35,.15); color: ${C.orange};
      border: 1px solid rgba(245,166,35,.3);
    }
    .w-pending-card.urgent .w-pending-av {
      background: rgba(232,83,74,.15); color: ${C.red};
      border-color: rgba(232,83,74,.3);
    }
    .w-pending-info { flex: 1; min-width: 0; }
    .w-pending-row1 { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
    .w-pending-name { font-weight: 700; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${C.text}; }
    .w-pending-ago        { font-size: 10px; color: ${C.textMuted}; flex-shrink: 0; }
    .w-pending-ago.urgent { color: ${C.red}; font-weight: 700; }
    .w-pending-phone { font-size: 10px; color: ${C.textMuted}; font-family: 'SF Mono','Fira Code',monospace; margin-top: 1px; }
    .w-pending-body  { font-size: 11px; color: ${C.textSub}; margin-top: 3px; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .w-pending-actions { display: flex; flex-direction: column; gap: 4px; flex-shrink: 0; }

    /* Badge de no-leídos en pending cards */
    .w-unread-badge {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 18px; height: 18px; padding: 0 5px;
      background: ${C.green}; color: #000;
      border-radius: 99px; font-size: 10px; font-weight: 800;
      line-height: 1; flex-shrink: 0;
    }
    .w-reply-btn {
      background: ${C.gold}; color: #0f1a0f; border: none;
      border-radius: 8px; font-size: 16px; font-weight: 800;
      width: 34px; height: 34px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: opacity .15s; flex-shrink: 0;
    }
    .w-reply-btn:hover { opacity: .85; }
    .w-view-lead-btn {
      background: none; border: 1px solid ${C.border}; color: ${C.textSub};
      border-radius: 8px; font-size: 14px; width: 34px; height: 28px;
      cursor: pointer; transition: all .12s;
      display: flex; align-items: center; justify-content: center;
    }
    .w-view-lead-btn:hover { border-color: ${C.gold}; color: ${C.gold}; }

    /* Message log (all messages) */
    .w-msg-item {
      padding: 10px 12px; border-bottom: 1px solid ${C.border};
      display: flex; align-items: flex-start; gap: 9px;
    }
    .w-msg-item.incoming { border-left: 3px solid ${C.green}; }
    .w-msg-item.outgoing { border-left: 3px solid ${C.gold}; opacity: .8; }
    .w-msg-av {
      width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 12px;
      background: rgba(34,199,138,.15); color: ${C.green};
      border: 1px solid rgba(34,199,138,.3);
    }
    .w-msg-av.me {
      background: rgba(255,200,0,.12); color: ${C.gold};
      border-color: rgba(255,200,0,.25); font-size: 9px;
    }
    .w-msg-bubble { flex: 1; min-width: 0; }
    .w-msg-meta { display: flex; align-items: baseline; gap: 5px; margin-bottom: 3px; flex-wrap: wrap; }
    .w-msg-sender { font-weight: 700; font-size: 12px; color: ${C.text}; }
    .w-msg-ago    { font-size: 10px; color: ${C.textMuted}; margin-left: auto; flex-shrink: 0; }
    .w-msg-body   { font-size: 12px; color: ${C.textSub}; line-height: 1.4; word-break: break-word; }
    .w-msg-badge  { font-size: 9px; padding: 1px 5px; border-radius: 99px; font-weight: 700; flex-shrink: 0; }
    .w-msg-badge.in  { background: rgba(34,199,138,.12); color: ${C.green}; }
    .w-msg-badge.out { background: rgba(255,200,0,.1);   color: ${C.gold}; }
    .w-msg-lead-btn {
      margin-top: 5px; padding: 3px 8px; border-radius: 5px;
      background: none; border: 1px solid ${C.border}; color: ${C.textSub};
      font-size: 10px; cursor: pointer; transition: all .12s;
    }
    .w-msg-lead-btn:hover { border-color: ${C.gold}; color: ${C.gold}; }

    /* ── WA label filter bar ────────────────── */
    .w-wa-label-bar {
      display: flex; align-items: center; gap: 3px; flex-wrap: wrap;
      padding-top: 2px;
    }
    .w-wa-label-pill { font-size: 10px; }
    .w-wa-lbl { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

    /* ── Conversaciones section ──────────────── */
    .w-conv-grid {
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 7px; margin-bottom: 10px;
    }
    .w-conv-card {
      background: ${C.surface}; border: 1px solid ${C.border};
      border-radius: 10px; padding: 11px 12px;
      display: flex; flex-direction: column; gap: 2px;
    }
    .w-conv-card.alert { border-color: rgba(245,166,35,.4); background: rgba(245,166,35,.05); }
    .w-conv-card.ok    { border-color: rgba(34,199,138,.3); }
    .w-conv-val {
      font-size: 30px; font-weight: 800; line-height: 1; color: ${C.text};
    }
    .w-conv-val.orange { color: ${C.orange}; }
    .w-conv-val.green  { color: ${C.green}; }
    .w-conv-val.gold   { color: ${C.gold}; }
    .w-conv-val.muted  { color: ${C.textSub}; }
    .w-conv-lbl  { font-size: 11px; font-weight: 700; color: ${C.text}; margin-top: 3px; }
    .w-conv-hint { font-size: 9px; color: ${C.textMuted}; }

    .w-conv-bar-wrap {
      background: ${C.surface}; border: 1px solid ${C.border};
      border-radius: 10px; padding: 10px 12px; margin-bottom: 10px;
    }
    .w-conv-bar-labels {
      display: flex; justify-content: space-between;
      font-size: 11px; color: ${C.textSub};
    }

    .w-conv-pending-wrap {
      background: rgba(245,166,35,.06); border: 1px solid rgba(245,166,35,.25);
      border-radius: 10px; padding: 10px 12px; margin-bottom: 10px;
    }
    .w-conv-pending-hdr {
      display: flex; justify-content: space-between; align-items: center;
      font-size: 11px; font-weight: 700; color: ${C.orange}; margin-bottom: 8px;
    }
    .w-conv-ver-btn {
      background: none; border: 1px solid rgba(245,166,35,.4);
      color: ${C.orange}; border-radius: 5px; font-size: 10px;
      font-weight: 700; padding: 2px 8px; cursor: pointer; transition: all .12s;
    }
    .w-conv-ver-btn:hover { background: rgba(245,166,35,.12); }
    .w-conv-pending-row {
      display: grid;
      grid-template-columns: 8px 1fr auto;
      grid-template-rows: auto auto;
      column-gap: 7px; row-gap: 0;
      padding: 5px 0; border-top: 1px solid rgba(245,166,35,.15);
      align-items: center;
    }
    .w-conv-pending-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: ${C.orange}; grid-row: 1 / 3; align-self: center;
    }
    .w-conv-pending-name { font-size: 12px; font-weight: 700; color: ${C.text}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .w-conv-pending-ago  { font-size: 10px; color: ${C.textMuted}; text-align: right; }
    .w-conv-pending-body { font-size: 10px; color: ${C.textSub}; grid-column: 2 / 4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .w-conv-pending-more { font-size: 10px; color: ${C.orange}; text-align: center; padding-top: 6px; font-weight: 600; }

    .w-conv-total-wa {
      display: flex; justify-content: space-between; align-items: center;
      background: ${C.surface}; border: 1px solid ${C.border};
      border-radius: 8px; padding: 8px 12px;
      font-size: 11px; color: ${C.textMuted};
      margin-bottom: 4px;
    }

    /* ── SSE bar ──────────────────────────── */
    .w-sse-bar { background: ${C.surface}; padding: 3px 12px; font-size: 10px; color: ${C.textMuted}; border-bottom: 1px solid ${C.border}; flex-shrink: 0; display: flex; align-items: center; gap: 5px; }
    .w-sse-dot { width: 6px; height: 6px; border-radius: 50%; background: ${C.textMuted}; flex-shrink: 0; }
    .w-sse-dot.live { background: ${C.green}; box-shadow: 0 0 4px ${C.green}88; animation: wspp-pulse 2s ease infinite; }
    .w-sse-dot.err  { background: ${C.red}; }
    @keyframes wspp-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

    /* ── Pending badge on nav ─────────────── */
    .w-pending-indicator {
      display: inline-block; background: ${C.orange}; color: #000;
      border-radius: 99px; font-size: 9px; padding: 1px 4px;
      margin-left: 3px; vertical-align: middle; font-weight: 800;
    }

    /* ── Ranking / Leaderboard ───────────── */
    .w-ranking-title {
      font-size: 10px; color: ${C.textMuted}; text-transform: uppercase;
      font-weight: 700; margin-bottom: 6px; letter-spacing: .5px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .w-ranking-title span { color: ${C.textSub}; font-weight: 400; text-transform: none; font-size: 9px; letter-spacing: 0; }
    .w-rank-row {
      background: ${C.surface}; border-radius: 9px; padding: 9px 11px;
      margin-bottom: 6px; border: 1px solid ${C.border};
      display: flex; align-items: center; gap: 9px;
      transition: border-color .15s;
    }
    .w-rank-row.is-me { border-color: ${C.goldDim}; background: linear-gradient(90deg, rgba(255,200,0,.06) 0%, ${C.surface} 100%); }
    .w-rank-pos {
      width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 800;
      background: ${C.surface2}; color: ${C.textSub};
    }
    .w-rank-pos.top1 { background: linear-gradient(135deg,#c9a227,#f5e27e); color: #0f1a0f; }
    .w-rank-pos.top2 { background: linear-gradient(135deg,#8a9faa,#c2d0d8); color: #0f1a0f; }
    .w-rank-pos.top3 { background: linear-gradient(135deg,#9c6a3f,#d4a97e); color: #0f1a0f; }
    .w-rank-info { flex: 1; min-width: 0; }
    .w-rank-name {
      font-size: 12px; font-weight: 700; color: ${C.text};
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      display: flex; align-items: center; gap: 5px;
    }
    .w-rank-me-badge {
      font-size: 9px; padding: 1px 5px; border-radius: 99px;
      background: ${C.goldBg}; color: ${C.gold}; border: 1px solid ${C.goldDim};
      font-weight: 700; flex-shrink: 0;
    }
    .w-rank-sub {
      font-size: 10px; color: ${C.textSub}; margin-top: 2px;
      display: flex; align-items: center; gap: 8px;
    }
    .w-rank-sub b { font-weight: 700; }
    .w-rank-bar-wrap { width: 100%; height: 3px; background: ${C.surface2}; border-radius: 99px; overflow: hidden; margin-top: 5px; }
    .w-rank-bar-fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, ${C.gold} 0%, ${C.green} 100%); }
    .w-rank-total { flex-shrink: 0; text-align: right; }
    .w-rank-total-val { font-size: 18px; font-weight: 800; color: ${C.text}; line-height: 1; }
    .w-rank-total-lbl { font-size: 9px; color: ${C.textMuted}; margin-top: 1px; }
    .w-rank-empty { font-size: 12px; color: ${C.textSub}; text-align: center; padding: 14px 0; }
  `;

  /** Inyecta el CSS en el <head> del documento */
  WSPP.injectStyles = function injectStyles() {
    if (document.getElementById('wspp-styles')) return;
    const styleEl = document.createElement('style');
    styleEl.id = 'wspp-styles';
    styleEl.textContent = WSPP.CSS;
    document.head.appendChild(styleEl);
  };
})();
