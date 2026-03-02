/**
 * WhatsApp Goberna Helper - Popup Script
 */

document.addEventListener("DOMContentLoaded", () => {
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const openWaBtn = document.getElementById("openWa");
  const testEventBtn = document.getElementById("testEvent");

  // Verificar estado
  function checkStatus() {
    chrome.runtime.sendMessage({ action: "getStatus" }, (response) => {
      if (response.open) {
        statusDot.classList.add("active");
        statusText.textContent = "WhatsApp abierto";
      } else {
        statusDot.classList.remove("active");
        statusText.textContent = "WhatsApp cerrado";
      }
    });
  }

  // Abrir WhatsApp
  openWaBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "openChat" }, (response) => {
      if (response.error) {
        alert("Error: " + response.error);
      } else {
        statusDot.classList.add("active");
        statusText.textContent = response.reused ? "Pestaña reutilizada" : "Nueva pestaña creada";
      }
    });
  });

  // Probar evento
  testEventBtn.addEventListener("click", () => {
    fetch("https://api.goberna.us/api/whatsapp/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "999999999",
        message: "Test desde extensión",
        type: "test",
        keyword: null,
        timestamp: new Date().toISOString()
      })
    }).then(() => {
      alert("Evento de prueba enviado");
    }).catch(() => {
      alert("Error enviando evento (ver consola)");
    });
  });

  checkStatus();
});
