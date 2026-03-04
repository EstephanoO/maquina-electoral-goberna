// sidebar/utils.js — Funciones utilitarias puras
// Depende de: (ninguna)
// Expone: WSPP.esc, WSPP.cap, WSPP.fmtDate, WSPP.fmtPhone, WSPP.normPhone, WSPP.drow, WSPP.showErr
(function () {
  'use strict';
  window.WSPP = window.WSPP || {};

  /** Escapa HTML para prevenir XSS */
  WSPP.esc = function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  /** Capitaliza primera letra */
  WSPP.cap = function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  /** Formatea fecha ISO o timestamp numérico. Incluye año si es distinto al actual. */
  WSPP.fmtDate = function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    const opts = { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('es', opts);
  };

  /** Formatea número de teléfono peruano */
  WSPP.fmtPhone = function fmtPhone(num) {
    const s = String(num || '');
    if (s.length === 11 && s.startsWith('51')) return '+51 ' + s.slice(2, 5) + ' ' + s.slice(5, 8) + ' ' + s.slice(8);
    if (s.length === 9) return s.slice(0, 3) + ' ' + s.slice(3, 6) + ' ' + s.slice(6);
    return s;
  };

  /**
   * Normaliza un número de teléfono a formato 51XXXXXXXXX (11 dígitos peruano).
   * Elimina todo lo que no sea dígito. Si quedan 9 dígitos, añade prefijo 51.
   * Devuelve '' si no hay dígitos suficientes.
   */
  WSPP.normPhone = function normPhone(raw) {
    const d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    return d.length === 9 ? '51' + d : d;
  };

  /** Genera una fila de detalle (label/valor) */
  WSPP.drow = function drow(label, val) {
    return `<div class="w-drow"><span class="w-dlabel">${label}</span><span class="w-dval">${WSPP.esc(String(val))}</span></div>`;
  };

  /** Muestra un mensaje de error en un elemento DOM */
  WSPP.showErr = function showErr(el, msg) {
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  };
})();
