function addLog(text, type = '') {
  const log = document.getElementById('log');
  const line = document.createElement('div');
  line.className = 'line ' + type;
  line.textContent = text;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

function updateUI(result) {
  const storeEl   = document.getElementById('store-found');
  const modEl     = document.getElementById('mod-id');
  const keysEl    = document.getElementById('store-keys');

  if (result.storeFound) {
    storeEl.textContent = '✅ Sí';
    storeEl.className   = 'val ok';
    modEl.textContent   = result.modId || result.storeLabel || '—';
    keysEl.textContent  = (result.storeKeys || []).slice(0, 6).join(', ');
    addLog('✓ Store encontrado: ' + (result.modId || result.storeLabel || 'built'), 'ok');
    addLog('Keys: ' + (result.storeKeys || []).join(', '), 'ok');
    if (result.me) {
      document.getElementById('me-name').textContent = result.me.pushname || '—';
      addLog(`👤 ${result.me.pushname} (${result.me.platform})`, 'ok');
    }
  } else {
    storeEl.textContent = '❌ No encontrado';
    storeEl.className   = 'val err';
    addLog('✗ Store no encontrado aún', 'err');
  }

  if (result.registrySize !== undefined) {
    addLog(`registry: ${result.registrySize} módulos capturados`, result.registrySize > 0 ? 'ok' : 'err');
  }
}

async function doScan() {
  const btn = document.getElementById('scan-btn');
  btn.disabled = true;
  btn.textContent = 'Escaneando...';
  addLog('--- Scan iniciado ---', 'info');

  try {
    // Obtener tab activa
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url?.includes('whatsapp.com')) {
      addLog('⚠ Abre WhatsApp Web primero', 'err');
      btn.disabled = false;
      btn.textContent = 'Escanear Store ahora';
      return;
    }

    // Enviar mensaje al content script
    const result = await chrome.tabs.sendMessage(tab.id, { action: 'scan' });
    if (result) {
      updateUI(result);
    } else {
      addLog('Sin respuesta del content script', 'err');
    }
  } catch(e) {
    addLog('Error: ' + e.message, 'err');
  }

  btn.disabled = false;
  btn.textContent = 'Escanear Store ahora';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('log').textContent = '';
  document.getElementById('scan-btn').addEventListener('click', doScan);

  // Leer último resultado guardado en storage
  chrome.storage.local.get(['wspp_store_found', 'wspp_store_name', 'wspp_timestamp'], (data) => {
    if (data.wspp_store_found) {
      document.getElementById('store-found').textContent = '✅ Sí (previo)';
      document.getElementById('store-found').className = 'val ok';
      document.getElementById('mod-id').textContent = data.wspp_store_name || '—';
      addLog('Último scan: store encontrado en ' + data.wspp_store_name, 'ok');
    } else {
      addLog('Sin scan previo. Pulsa Escanear.', '');
    }
  });
});
