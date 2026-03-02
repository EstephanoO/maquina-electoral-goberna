/**
 * WhatsApp Goberna Helper - Content Script
 * Detecta mensajes entrantes y palabras clave
 */

const KEYWORDS = [
  "sí", "si", "confirmo", "confirmado", "apoyo", "voto",
  "de acuerdo", "ok", "perfecto", "entendido",
  "me interesa", "quiero", "contigo", "contar",
  "no", "no puedo", "no quiero", "gracias",
  "llamo después", "hablamos después", "luego"
];

const SCORE_KEYWORDS = {
  positivo: ["sí", "si", "confirmo", "confirmado", "apoyo", "voto", "de acuerdo", "ok", "perfecto", "entendido", "me interesa", "quiero", "contar contigo", "contigo"],
  negativo: ["no", "no puedo", "no quiero", "gracias pero no"],
  pendiente: ["llamo después", "hablamos después", "luego", "después"]
};

let lastMessageCount = 0;
let processedMessages = new Set();

function getChatPhone() {
  // Extraer número del chat actual desde la URL
  const match = window.location.href.match(/send\?phone=(\d+)/);
  return match ? match[1] : null;
}

function extractMessageText(element) {
  // Buscar el texto del mensaje en el elemento
  const textElement = element.querySelector("span[class*='copyable']") || element;
  return textElement?.innerText?.trim() || "";
}

function getMessages() {
  // Seleccionar mensajes entrantes (verde左边)
  // WhatsApp usa: div.message-in
  return Array.from(document.querySelectorAll("div.message-in"));
}

function classifyMessage(text) {
  const lower = text.toLowerCase();
  
  for (const keyword of SCORE_KEYWORDS.positivo) {
    if (lower.includes(keyword)) return { type: "positivo", keyword };
  }
  for (const keyword of SCORE_KEYWORDS.negativo) {
    if (lower.includes(keyword)) return { type: "negativo", keyword };
  }
  for (const keyword of SCORE_KEYWORDS.pendiente) {
    if (lower.includes(keyword)) return { type: "pendiente", keyword };
  }
  
  return { type: "neutro", keyword: null };
}

function sendToBackend(event) {
  const payload = {
    phone: event.phone,
    message: event.message,
    type: event.type,
    keyword: event.keyword,
    timestamp: new Date().toISOString(),
    url: window.location.href
  };

  console.log("[WhatsApp Goberna] Evento:", payload);

  // Enviar al backend
  fetch("https://api.goberna.us/api/whatsapp/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Nota: En producción, obtener token del storage
    },
    body: JSON.stringify(payload)
  }).catch(err => {
    console.error("[WhatsApp Goberna] Error enviando evento:", err);
  });
}

function observeMessages() {
  const messages = getMessages();
  
  messages.forEach((msg) => {
    // Usar ID único del mensaje para no procesar dos veces
    const msgId = msg.getAttribute("data-id") || msg.innerText.substring(0, 50);
    
    if (processedMessages.has(msgId)) return;
    processedMessages.add(msgId);

    const text = extractMessageText(msg);
    if (!text) return;

    const classification = classifyMessage(text);
    
    if (classification.type !== "neutro") {
      sendToBackend({
        phone: getChatPhone(),
        message: text,
        type: classification.type,
        keyword: classification.keyword
      });
    }
  });

  lastMessageCount = messages.length;
}

// MutationObserver para detectar nuevos mensajes
const observer = new MutationObserver(() => {
  const currentCount = getMessages().length;
  if (currentCount !== lastMessageCount) {
    observeMessages();
  }
});

// Iniciar observación
function init() {
  // Esperar a que cargue WhatsApp
  if (document.querySelector("div.message-in") || document.querySelector("[data-testid='messagelist']")) {
    observeMessages();
    observer.observe(document.body, { 
      childList: true, 
      subtree: true 
    });
  } else {
    setTimeout(init, 1000);
  }
}

// Iniciar cuando el DOM esté listo
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// También observar cambios de chat (URL)
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    processedMessages.clear(); // Limpiar para nuevo chat
    setTimeout(observeMessages, 2000); // Esperar carga
  }
}).observe(document.body, { childList: true, subtree: true });
