// excel-loader.js — Carga contactos desde un archivo Excel (.xlsx / .xls / .csv)
// Columnas esperadas: teléfono + nombre (auto-detecta headers)
// No persiste entre sesiones — se sube cada vez.

import * as XLSX from 'xlsx';

// ── State ─────────────────────────────────────────────────────────────
let _contacts = [];       // [{id, nombre, telefono}]
let _fileName = null;
let _loadError = null;

// ── Column detection ──────────────────────────────────────────────────
// Auto-detect which column is phone and which is name.
const PHONE_HINTS = ['telefono', 'teléfono', 'celular', 'cel', 'phone', 'número', 'numero', 'movil', 'móvil', 'whatsapp', 'wa', 'nro', 'tel'];
const NAME_HINTS  = ['nombre', 'name', 'nombres', 'contacto', 'persona', 'nombres y apellidos', 'nombre completo', 'nombre_completo'];
const DEPT_HINTS  = ['departamento', 'depto', 'dept', 'region', 'región'];
const PROV_HINTS  = ['provincia', 'prov'];
const DIST_HINTS  = ['distrito', 'dist', 'localidad', 'ciudad'];
const ENC_HINTS   = ['encuestador', 'brigadista', 'promotor', 'referente', 'colaborador', 'responsable'];
const APELL_HINTS = ['apellido', 'apellidos', 'surname', 'last_name', 'lastname'];

function _normalizeHeader(h) {
  return String(h || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function _detectColumn(headers, hints) {
  const normalized = headers.map(_normalizeHeader);
  // Exact match first
  for (const hint of hints) {
    const idx = normalized.indexOf(hint);
    if (idx !== -1) return idx;
  }
  // Partial match
  for (const hint of hints) {
    const idx = normalized.findIndex(h => h.includes(hint));
    if (idx !== -1) return idx;
  }
  return -1;
}

// ── Phone normalization ───────────────────────────────────────────────
function _normalizePhone(raw) {
  if (!raw) return null;
  // Remove all non-digits
  let digits = String(raw).replace(/\D/g, '');
  if (!digits || digits.length < 9) return null;
  // Remove leading country code 51 (Peru) if present and number is 11+ digits
  if (digits.length >= 11 && digits.startsWith('51')) {
    digits = digits.slice(2);
  }
  return digits;
}

// ── Parse Excel ───────────────────────────────────────────────────────
export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    _contacts = [];
    _fileName = null;
    _loadError = null;

    if (!file) {
      _loadError = 'No se seleccionó archivo';
      reject(_loadError);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      _loadError = 'Error al leer el archivo';
      reject(_loadError);
    };

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        // Use first sheet
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          _loadError = 'El archivo no tiene hojas';
          reject(_loadError);
          return;
        }

        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (rows.length < 2) {
          _loadError = 'El archivo está vacío o solo tiene headers';
          reject(_loadError);
          return;
        }

        // First row = headers
        const headers = rows[0].map(h => String(h || ''));
        const phoneCol = _detectColumn(headers, PHONE_HINTS);
        const nameCol  = _detectColumn(headers, NAME_HINTS);
        const deptCol  = _detectColumn(headers, DEPT_HINTS);
        const provCol  = _detectColumn(headers, PROV_HINTS);
        const distCol  = _detectColumn(headers, DIST_HINTS);
        const encCol   = _detectColumn(headers, ENC_HINTS);
        const apellCol = _detectColumn(headers, APELL_HINTS);

        if (phoneCol === -1) {
          _loadError = 'No se encontró columna de teléfono. Headers: ' + headers.join(', ');
          reject(_loadError);
          return;
        }

        // Parse data rows
        const contacts = [];
        const seenPhones = new Set();

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const rawPhone = row[phoneCol];
          const phone = _normalizePhone(rawPhone);
          if (!phone) continue; // skip invalid phones
          if (seenPhones.has(phone)) continue; // dedup
          seenPhones.add(phone);

          const rawName   = nameCol  !== -1 ? String(row[nameCol]  || '').trim() : '';
          const rawApell  = apellCol !== -1 ? String(row[apellCol] || '').trim() : '';
          const rawDept   = deptCol  !== -1 ? String(row[deptCol]  || '').trim() : '';
          const rawProv   = provCol  !== -1 ? String(row[provCol]  || '').trim() : '';
          const rawDist   = distCol  !== -1 ? String(row[distCol]  || '').trim() : '';
          const rawEnc    = encCol   !== -1 ? String(row[encCol]   || '').trim() : '';

          contacts.push({
            id: `xl_${i}_${phone}`,  // synthetic ID
            nombre: rawName || '',
            apellidos: rawApell || '',
            telefono: phone,
            departamento: rawDept || '',
            provincia: rawProv || '',
            distrito: rawDist || '',
            encuestador: rawEnc || '',
            cms_status: 'nuevo',
            heat_score: 1,
          });
        }

        if (!contacts.length) {
          _loadError = 'No se encontraron teléfonos válidos en el archivo';
          reject(_loadError);
          return;
        }

        _contacts = contacts;
        _fileName = file.name;
        _loadError = null;
        const detected = [
          `phone=${phoneCol}`,
          nameCol !== -1 ? `name=${nameCol}` : null,
          deptCol !== -1 ? `dept=${deptCol}` : null,
          provCol !== -1 ? `prov=${provCol}` : null,
          distCol !== -1 ? `dist=${distCol}` : null,
          encCol  !== -1 ? `enc=${encCol}`   : null,
        ].filter(Boolean).join(', ');
        console.log(`[EXCEL] Cargados ${contacts.length} contactos de "${file.name}" (${detected})`);
        resolve({ contacts, fileName: file.name, phoneCol: headers[phoneCol], nameCol: nameCol !== -1 ? headers[nameCol] : null });
      } catch (err) {
        _loadError = 'Error parseando archivo: ' + err.message;
        console.error('[EXCEL] Parse error:', err);
        reject(_loadError);
      }
    };

    reader.readAsArrayBuffer(file);
  });
}

// ── Getters ───────────────────────────────────────────────────────────
export function getExcelContacts() { return _contacts; }
export function getExcelFileName() { return _fileName; }
export function getExcelError() { return _loadError; }
export function getExcelContactCount() { return _contacts.length; }
export function hasExcelContacts() { return _contacts.length > 0; }

// ── Clear ─────────────────────────────────────────────────────────────
export function clearExcelContacts() {
  _contacts = [];
  _fileName = null;
  _loadError = null;
}
