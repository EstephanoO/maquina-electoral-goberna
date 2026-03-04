// sidebar/constants.js — Constantes globales del CRM
// Expone: WSPP.API_BASE, WSPP.PANEL_WIDTH, WSPP.C, WSPP.TAG_COLORS
(function () {
  'use strict';
  window.WSPP = window.WSPP || {};

  WSPP.API_BASE    = 'https://api.goberna.us';
  WSPP.PANEL_WIDTH = 390;

  // Paleta de colores corporativa
  WSPP.C = {
    bg:        '#0e1e2e',
    surface:   '#14273a',
    surface2:  '#1c3248',
    surface3:  '#213a54',
    border:    '#1e3550',
    borderHi:  '#2a4a6a',
    blue:      '#163960',
    blueHi:    '#1e4d7e',
    blueLt:    '#2a6299',
    gold:      '#FFC800',
    goldDim:   '#8a6e00',
    goldBg:    '#2a2000',
    text:      '#e8eef4',
    textSub:   '#7a9bb5',
    textMuted: '#4a6a85',
    green:     '#22c78a',
    orange:    '#f5a623',
    red:       '#e8534a',
  };

  // ── Lock de campaña por número de WA ─────────────────────────
  // Si el número WA del operador está en esta lista, el selector de campaña
  // se oculta y queda fijo en CAMPAIGN_LOCK_ID. No puede cambiarse.
  WSPP.CAMPAIGN_LOCK_NUMBERS = new Set([
    '51906218514',
    '51906175778',
    '51930700661',
    '51901938157',
  ]);
  WSPP.CAMPAIGN_LOCK_ID = 'eece49d5-a315-4764-83f9-681cabae5c51'; // César Vásquez

  // ── Aliases de celulares de campaña (César Vásquez) ──────────────
  // Mapea wa_number → nombre para mostrar en métricas.
  // Para agregar el 5to celular: añadir '51XXXXXXXXX': 'Celular 5'
  WSPP.WA_PHONE_ALIASES = {
    '51906218514': 'Celular 1',
    '51906175778': 'Celular 2',
    '51930700661': 'Celular 3',
    '51901938157': 'Celular 4',
    // '51XXXXXXXXX': 'Celular 5',  ← agregar cuando esté disponible
  };

  // Colores preset para etiquetas nuevas
  WSPP.TAG_COLORS = [
    '#FFC800', '#22c78a', '#f5a623', '#e8534a',
    '#60a5fa', '#c084fc', '#fb923c', '#34d399',
    '#f472b6', '#a78bfa',
  ];
})();
