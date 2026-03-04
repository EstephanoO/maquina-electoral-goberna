// sidebar/views/detail.js — Vista de detalle de lead + editor de tags + notas
// Depende de: constants.js, store.js, ui.js, utils.js, api.js, chat.js
// Expone: WSPP.renderDetail, WSPP.buildTagEditor, WSPP.wireTagEditor,
//         WSPP.doStatusAction, WSPP.saveTags, WSPP.saveNote
(function () {
  'use strict';
  window.WSPP = window.WSPP || {};

  // ── Status Actions ─────────────────────────────────────────────

  WSPP.doStatusAction = async function doStatusAction(id, action) {
    const { S, apiFetch, render, updateMsgBadge } = WSPP;
    const lead        = S.leads.find(l => l.id === id) || S.activeLead;
    const endpointMap = { hablado: 'hablado', respondieron: 'respondieron', archivar: 'archive', revert: 'revert' };
    const statusMap   = { hablado: 'hablado', respondieron: 'respondieron', archivar: 'archivado', revert: 'nuevo' };
    const ep          = endpointMap[action];
    if (!ep) return;
    const newStatus = statusMap[action];

    // Actualización optimista en store
    if (lead)               lead.cms_status = newStatus;
    if (S.activeLead?.id === id) S.activeLead.cms_status = newStatus;

    // Si marcamos como respondieron o archivamos, limpiar del mapa de pendientes
    // usando el teléfono del lead (normalizado a 11 dígitos con prefijo 51)
    if (action === 'respondieron' || action === 'archivar') {
      const { normPhone } = WSPP;
      const tel = normPhone(lead?.telefono || lead?.data?.telefono || '');
      if (tel && S.pendingMap[tel]) {
        delete S.pendingMap[tel];
        updateMsgBadge();
      }
    }

    render();

    try {
      // Usar apiFetch (PUT → bgFetch vía background, maneja CORS y 401→refresh)
      await apiFetch(`/api/cms/contacts/${id}/${ep}`, { method: 'PUT', body: {} });
    } catch (e) {
      console.warn('[WSPP CRM] status action error:', e);
      // No hay rollback limpio del optimistic update aquí;
      // el SSE va a re-sincronizar el estado real desde el servidor.
    }
  };

  WSPP.saveTags = async function saveTags(id, tagObjects) {
    const { S, apiFetch, buildTagEditor, wireTagEditor } = WSPP;
    try {
      const tags = tagObjects.map(t => typeof t === 'object' ? t.name : t);
      await apiFetch(`/api/cms/contacts/${id}/tags`, { method: 'PUT', body: { tags } });
      if (S.activeLead?.id === id) S.activeLead.cms_tags = tagObjects;
      const lead = S.leads.find(l => l.id === id);
      if (lead) lead.cms_tags = tagObjects;
      const panel   = document.getElementById('wspp-crm-panel');
      const section = panel?.querySelector('#w-tags-section');
      if (section) {
        section.innerHTML = buildTagEditor(tagObjects);
        wireTagEditor(tagObjects, id);
      }
    } catch (e) { console.warn('[WSPP CRM] saveTags:', e); }
  };

  WSPP.saveNote = async function saveNote(id, comentarios) {
    const { apiFetch } = WSPP;
    const panel = document.getElementById('wspp-crm-panel');
    const btn   = panel?.querySelector('#w-save-note');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
    try {
      await apiFetch(`/api/cms/contacts/${id}/notes`, { method: 'PUT', body: { comentarios } });
      if (btn) {
        btn.textContent = '✓ Guardado';
        setTimeout(() => { if (btn) { btn.disabled = false; btn.textContent = 'Guardar notas'; } }, 1800);
      }
    } catch (_) {
      if (btn) { btn.disabled = false; btn.textContent = 'Error — reintentar'; }
    }
  };

  // ── Tag Editor ─────────────────────────────────────────────────

  /**
   * Genera el HTML del editor de etiquetas.
   * Chips de tags actuales + campo de búsqueda/creación.
   */
  WSPP.buildTagEditor = function buildTagEditor(tags) {
    const { esc, C } = WSPP;
    const tagNames = tags.map(t => typeof t === 'object' ? t.name : t);
    const chips    = tagNames.map((name, i) => {
      const t     = tags[i];
      const color = typeof t === 'object' ? (t.color || C.gold) : C.gold;
      return `<span class="w-tag-chip" style="color:${color};background:${color}18;border-color:${color}44" data-tag-chip="${esc(name)}">
        <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color};flex-shrink:0"></span>
        ${esc(name)}
        <button class="w-tag-rm" data-tag="${esc(name)}" title="Quitar" type="button">×</button>
      </span>`;
    }).join('');

    return `
      <div class="w-tags-list" id="w-tag-chips">${chips || '<span style="font-size:11px;color:var(--wspp-text-muted,#4a6a85);font-style:italic">Sin etiquetas</span>'}</div>
      <div class="w-tag-select-wrap" id="w-tag-select-wrap">
        <span class="w-tag-search-icon">🏷</span>
        <input class="w-tag-search" id="w-tag-search" placeholder="Buscar o crear etiqueta..." autocomplete="off" spellcheck="false" />
        <div class="w-tag-dropdown" id="w-tag-dropdown" style="display:none"></div>
      </div>`;
  };

  /**
   * Conecta la interactividad del editor de etiquetas.
   *
   * Mejoras vs versión anterior:
   * - "Crear" abre un mini-panel inline con picker de color: un click elige color Y confirma
   * - Enter en el input crea el tag directamente con el color activo
   * - Los tags disponibles muestran el badge de color como preview
   * - El input no se limpia al elegir color (mejor feedback)
   * - Custom color input funciona correctamente (no position:absolute)
   */
  WSPP.wireTagEditor = function wireTagEditor(tags, leadId) {
    const { S, C, TAG_COLORS, esc, saveTags } = WSPP;
    const panel = document.getElementById('wspp-crm-panel');

    let tagNames   = tags.map(t => typeof t === 'object' ? t.name : t);
    let tagObjects = tags.map(t => typeof t === 'object' ? t : { name: t, color: C.gold });

    // Estado del picker de creación
    let pickerColor = TAG_COLORS[0]; // color seleccionado mientras se crea

    const wrap      = panel?.querySelector('#w-tag-select-wrap');
    const searchInp = panel?.querySelector('#w-tag-search');
    const dropdown  = panel?.querySelector('#w-tag-dropdown');
    const chipsList = panel?.querySelector('#w-tag-chips');

    if (!wrap || !searchInp || !dropdown || !chipsList) return;

    // ── Remover tag ───────────────────────────────────────────────
    chipsList.querySelectorAll('.w-tag-rm').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const name = btn.dataset.tag;
        tagNames   = tagNames.filter(n => n !== name);
        tagObjects = tagObjects.filter(o => o.name !== name);
        await saveTags(leadId, tagObjects);
      });
    });

    // ── Dropdown helpers ──────────────────────────────────────────
    function openDropdown() {
      dropdown.style.display = 'block';
      renderDropdown(searchInp.value);
    }

    function closeDropdown() {
      dropdown.style.display = 'none';
    }

    /**
     * Renderiza el contenido del dropdown.
     *
     * Estructura:
     *  1. Tags disponibles que coinciden con la búsqueda (no asignados aún)
     *  2. Si hay query sin match exacto: sección "Crear nueva etiqueta"
     *     con picker de color integrado. Un click en swatch = elegir color.
     *     Botón "Crear" (o Enter) confirma con el color activo.
     */
    function renderDropdown(query) {
      const q         = (query || '').trim().toLowerCase();
      const available = S.availableTags.map(t => typeof t === 'object' ? t : { name: t, color: C.gold });
      const filtered  = available.filter(t =>
        !tagNames.includes(t.name) && (!q || t.name.toLowerCase().includes(q))
      );
      const exactMatch = available.some(t => t.name.toLowerCase() === q);

      let html = '';

      // ── Tags existentes ────────────────────────────────────────
      if (filtered.length > 0) {
        html += filtered.slice(0, 10).map(t => `
          <div class="w-tag-dropdown-item" data-pick="${esc(t.name)}" data-color="${esc(t.color || C.gold)}">
            <span class="t-dot" style="background:${t.color || C.gold}"></span>
            <span class="t-name">${esc(t.name)}</span>
          </div>`).join('');
      } else if (!q) {
        html += `<div style="padding:10px 12px;font-size:11px;color:${C.textMuted};text-align:center">Escribe para buscar o crear</div>`;
      }

      // ── Crear nueva etiqueta ───────────────────────────────────
      if (q && !exactMatch) {
        const swatches = TAG_COLORS.map(c =>
          `<span class="w-color-swatch${pickerColor === c ? ' sel' : ''}" style="background:${c};cursor:pointer" data-color="${c}" title="${c}"></span>`
        ).join('');

        html += `
          <div class="w-tag-create-section">
            <div class="w-tag-create-label">
              <span>Crear</span>
              <strong style="color:${pickerColor}">"${esc(q)}"</strong>
            </div>
            <div class="w-tag-color-row">
              <span class="w-tag-color-label">Color:</span>
              ${swatches}
              <label class="w-color-custom-label" title="Color personalizado">
                <input type="color" id="w-custom-color" value="${pickerColor}" style="width:22px;height:22px;border:none;background:none;cursor:pointer;border-radius:50%;padding:0" />
              </label>
            </div>
            <div class="w-tag-confirm-row">
              <button class="w-tag-confirm-btn" id="w-tag-do-create" type="button">✓ Crear etiqueta</button>
            </div>
          </div>`;
      }

      dropdown.innerHTML = html;

      // ── Listeners: pick tag existente ─────────────────────────
      dropdown.querySelectorAll('[data-pick]').forEach(item => {
        item.addEventListener('mousedown', async (e) => {
          e.preventDefault();
          const name  = item.dataset.pick;
          const color = item.dataset.color || C.gold;
          if (!tagNames.includes(name)) {
            tagNames.push(name);
            tagObjects.push({ name, color });
            await saveTags(leadId, tagObjects);
          }
          searchInp.value = '';
          closeDropdown();
        });
      });

      // ── Listeners: color swatches ─────────────────────────────
      dropdown.querySelectorAll('.w-color-swatch').forEach(sw => {
        sw.addEventListener('mousedown', (e) => {
          e.preventDefault();
          pickerColor = sw.dataset.color;
          renderDropdown(searchInp.value); // re-render para actualizar selección
        });
      });

      // ── Listener: custom color ────────────────────────────────
      const customColor = dropdown.querySelector('#w-custom-color');
      if (customColor) {
        customColor.addEventListener('input', (e) => {
          pickerColor = e.target.value;
          // Actualizar el texto de preview sin re-renderizar todo
          const label = dropdown.querySelector('.w-tag-create-label strong');
          if (label) label.style.color = pickerColor;
        });
      }

      // ── Listener: confirmar creación ──────────────────────────
      const doCreate = dropdown.querySelector('#w-tag-do-create');
      if (doCreate) {
        doCreate.addEventListener('mousedown', async (e) => {
          e.preventDefault();
          await createTag(q);
        });
      }
    }

    // ── Crear tag y guardar ───────────────────────────────────────
    async function createTag(name) {
      if (!name || tagNames.includes(name)) return;
      const color = pickerColor || C.gold;
      tagNames.push(name);
      tagObjects.push({ name, color });
      // Agregar a disponibles si no existe
      if (!S.availableTags.find(t => (typeof t === 'object' ? t.name : t) === name)) {
        S.availableTags.push({ name, color });
      }
      await saveTags(leadId, tagObjects);
      searchInp.value = '';
      pickerColor     = TAG_COLORS[0]; // resetear color para la próxima creación
      closeDropdown();
    }

    // ── Eventos del input ─────────────────────────────────────────
    searchInp.addEventListener('focus', () => openDropdown());

    searchInp.addEventListener('input', () => {
      // No resetear pickerColor al tipear — mantiene la selección
      renderDropdown(searchInp.value);
    });

    searchInp.addEventListener('keydown', async (e) => {
      if (e.key === 'Escape') {
        closeDropdown();
        searchInp.blur();
        return;
      }
      // Enter: si hay query sin match exacto → crear; si hay un único resultado → asignar
      if (e.key === 'Enter') {
        e.preventDefault();
        const q = searchInp.value.trim();
        if (!q) return;

        const available  = S.availableTags.map(t => typeof t === 'object' ? t : { name: t, color: C.gold });
        const exactMatch = available.find(t => t.name.toLowerCase() === q.toLowerCase());

        if (exactMatch && !tagNames.includes(exactMatch.name)) {
          // Asignar tag existente directamente
          tagNames.push(exactMatch.name);
          tagObjects.push({ name: exactMatch.name, color: exactMatch.color || C.gold });
          await saveTags(leadId, tagObjects);
          searchInp.value = '';
          closeDropdown();
        } else if (!exactMatch) {
          await createTag(q);
        }
      }
    });

    // Cerrar al hacer click fuera
    document.addEventListener('click', function handler(e) {
      if (!wrap.contains(e.target)) {
        closeDropdown();
        document.removeEventListener('click', handler);
      }
    });
  };

  // ── Render ─────────────────────────────────────────────────────

  WSPP.renderDetail = function renderDetail() {
    const { S, C, esc, fmtPhone, fmtDate, drow, navBar, sseBar, buildTagEditor, wireTagEditor,
            doStatusAction, saveNote, openChat, render, wireNav } = WSPP;
    const panel = document.getElementById('wspp-crm-panel');
    const L = S.activeLead;
    if (!L) { S.view = 'leads'; return render(); }

    const nombre = L.nombre || L.data?.nombre || 'Sin nombre';
    const tel    = (L.telefono || L.data?.telefono || '').replace(/\D/g, '');
    const zona   = L.zona || L.data?.zona || '—';
    const dist   = L.distrito || L.data?.distrito || '—';
    const enc    = L.encuestador || L.data?.encuestador || '—';
    const cand   = L.candidato_preferido || L.data?.candidato_preferido || '—';
    const status = L.cms_status || 'nuevo';
    const notas  = L.cms_operator_notes?.comentarios || '';
    const tags   = L.cms_tags || [];
    const waNum  = tel.length === 9 ? '51' + tel : tel;
    const hasTel = waNum.length >= 11;

    panel.innerHTML = `
      <div class="w-hdr">
        <button class="w-back" id="w-back">←</button>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(nombre)}</div>
          <div style="font-size:10px;color:${C.textSub}">${status}</div>
        </div>
        <div class="w-status-dot ${status}" style="width:9px;height:9px;flex-shrink:0;margin-left:4px"></div>
      </div>
      ${navBar()}
      ${sseBar()}
      <div class="w-detail">
        <div class="w-detail-hero">
          <div class="w-detail-av">${nombre.charAt(0).toUpperCase()}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:15px">${esc(nombre)}</div>
            <div style="font-size:11px;color:${C.textSub};margin-top:2px">${tel ? fmtPhone(tel) : 'Sin teléfono'}</div>
          </div>
        </div>

        <div class="w-actions">
          <button class="w-action-btn btn-hablado ${status === 'hablado' ? 'active-status' : ''}" data-action="hablado">🗣 Hablado</button>
          <button class="w-action-btn btn-respondieron ${status === 'respondieron' ? 'active-status' : ''}" data-action="respondieron">💬 Respondió</button>
          <button class="w-action-btn btn-archivar ${status === 'archivado' ? 'active-status' : ''}" data-action="archivar">🗂 Archivar</button>
        </div>

        <button class="w-open-btn" id="w-open" ${!hasTel ? 'disabled' : ''}>
          💬 Abrir en WhatsApp${hasTel ? '' : ' (sin teléfono)'}
        </button>

        ${status !== 'nuevo' ? `
          <div style="text-align:center;padding:2px 12px 8px">
            <button class="w-revert-btn" data-action="revert">↩ Revertir estado</button>
          </div>` : ''}

        <div class="w-drows">
          ${drow('📱 Teléfono', tel || '—')}
          ${drow('📍 Zona', zona)}
          ${drow('🏘 Distrito', dist)}
          ${drow('👤 Encuestador', enc)}
          ${drow('🗳 Cand. pref.', cand)}
          ${L.cms_hablado_at      ? drow('✅ Hablado el',   fmtDate(L.cms_hablado_at))     : ''}
          ${L.cms_respondieron_at ? drow('💬 Respondió el', fmtDate(L.cms_respondieron_at)) : ''}
        </div>

        <div class="w-section-title">Etiquetas</div>
        <div class="w-tags-wrap" id="w-tags-section">
          ${buildTagEditor(tags)}
        </div>

        <div class="w-section-title">Notas del operador</div>
        <div class="w-notes-wrap">
          <textarea class="w-note" id="w-note" placeholder="Escribe notas sobre este contacto...">${esc(notas)}</textarea>
          <button class="w-save-btn" id="w-save-note">Guardar notas</button>
        </div>
      </div>`;

    wireNav();
    panel.querySelector('#w-back').addEventListener('click', () => { S.view = 'leads'; render(); });
    panel.querySelector('#w-open')?.addEventListener('click', () => openChat(tel, L.id));
    panel.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const a = btn.dataset.action;
        if (a === 'hablado')      await doStatusAction(L.id, 'hablado');
        if (a === 'respondieron') await doStatusAction(L.id, 'respondieron');
        if (a === 'archivar')     await doStatusAction(L.id, 'archivar');
        if (a === 'revert')       await doStatusAction(L.id, 'revert');
      });
    });
    panel.querySelector('#w-save-note')?.addEventListener('click', async () => {
      await saveNote(L.id, panel.querySelector('#w-note')?.value || '');
    });
    wireTagEditor(tags, L.id);
  };
})();
