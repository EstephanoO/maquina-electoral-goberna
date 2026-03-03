/**
 * WhatsApp Goberna Helper — Popup Script (v2)
 *
 * Handles:
 *   - Status check (is WhatsApp Web tab open?)
 *   - Open/focus WhatsApp Web
 *   - Version display from manifest
 *
 * All chrome.runtime.sendMessage calls handle lastError and
 * undefined responses gracefully.
 */

document.addEventListener("DOMContentLoaded", () => {
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const openWaBtn = document.getElementById("openWa");
  const versionEl = document.getElementById("version");

  // ── Display extension version ──
  try {
    const manifest = chrome.runtime.getManifest();
    if (versionEl && manifest.version) {
      versionEl.textContent = `v${manifest.version}`;
    }
  } catch {
    // Non-critical
  }

  // ── Helpers ──

  function sendMessage(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { error: "No response" });
        });
      } catch (err) {
        resolve({ error: err.message });
      }
    });
  }

  function setStatus(active, text) {
    if (active) {
      statusDot.classList.add("active");
    } else {
      statusDot.classList.remove("active");
    }
    statusText.textContent = text;
  }

  function setButtonLoading(btn, loading) {
    btn.disabled = loading;
    if (loading) {
      btn.dataset.originalText = btn.textContent;
      btn.textContent = "...";
    } else if (btn.dataset.originalText) {
      btn.textContent = btn.dataset.originalText;
    }
  }

  // ── Check WhatsApp status ──

  async function checkStatus() {
    const response = await sendMessage({ action: "getStatus" });
    if (response.error) {
      setStatus(false, "Error de conexion");
      return;
    }
    setStatus(response.open, response.open ? "WhatsApp abierto" : "WhatsApp cerrado");
  }

  // ── Open / Focus WhatsApp ──

  openWaBtn.addEventListener("click", async () => {
    setButtonLoading(openWaBtn, true);

    const response = await sendMessage({ action: "openChat" });

    setButtonLoading(openWaBtn, false);

    if (response.error) {
      setStatus(false, "Error: " + response.error);
      return;
    }

    const statusMsg = response.reused
      ? "Pestana reutilizada"
      : "Nueva pestana creada";
    setStatus(true, statusMsg);

    // Close popup after a brief delay
    setTimeout(() => window.close(), 800);
  });

  // ── Initial status check ──
  checkStatus();
});
