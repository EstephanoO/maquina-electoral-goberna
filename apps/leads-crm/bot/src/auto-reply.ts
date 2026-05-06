/** Auto-response templates by detected product */

import { CONFIG } from "./config.js";

interface AutoResponse {
  message: string;
  delayMs: number;
}

const TEMPLATES: Record<string, AutoResponse> = {
  "Oratoria": {
    message: `¡Hola! 👋 Gracias por tu interés en *El Poder de la Oratoria*.

📚 Este libro te enseñará las técnicas más efectivas para hablar en público con seguridad y persuasión.

¿Te gustaría recibir más información sobre el contenido y cómo adquirirlo?`,
    delayMs: 3000,
  },
  "Consultor Político": {
    message: `¡Hola! 👋 Gracias por tu interés en el *Diploma Internacional del Consultor Político*.

🎓 Este programa forma consultores políticos con herramientas prácticas de estrategia, comunicación y campañas electorales.

¿Quieres que te envíe la información completa del programa, fechas y costos?`,
    delayMs: 3000,
  },
  "Inteligencia Emocional": {
    message: `¡Hola! 👋 Gracias por tu interés en nuestro curso de *Inteligencia Emocional*.

🧠 Aprenderás a gestionar tus emociones y mejorar tu liderazgo personal y profesional.

¿Te envío los detalles del programa?`,
    delayMs: 3000,
  },
  "Marketing Político": {
    message: `¡Hola! 👋 Gracias por tu interés en *Marketing Político*.

📊 Nuestro programa cubre estrategia digital, campañas electorales y comunicación política efectiva.

¿Quieres más información sobre fechas y costos?`,
    delayMs: 3000,
  },
  "Liderazgo": {
    message: `¡Hola! 👋 Gracias por tu interés en nuestro programa de *Liderazgo*.

🏆 Desarrolla habilidades de liderazgo efectivo para destacar en tu campo profesional.

¿Te envío la información completa?`,
    delayMs: 3000,
  },
  "Comunicación Política": {
    message: `¡Hola! 👋 Gracias por tu interés en *Comunicación Política*.

🎯 Aprende las técnicas de comunicación estratégica que usan los mejores consultores.

¿Quieres que te envíe más detalles?`,
    delayMs: 3000,
  },
  "Gobernabilidad": {
    message: `¡Hola! 👋 Gracias por tu interés en nuestro programa de *Gobernabilidad y Gestión Pública*.

🏛️ Formación especializada para profesionales del sector público.

¿Te envío la información del programa?`,
    delayMs: 3000,
  },
};

const GREETING: AutoResponse = {
  message: `¡Hola! 👋 Gracias por comunicarte con *Goberna*.

Somos especialistas en formación política y desarrollo profesional. ¿En qué podemos ayudarte?

📚 Oratoria · 🎓 Consultoría Política · 🧠 Inteligencia Emocional · 📊 Marketing Político · 🏆 Liderazgo`,
  delayMs: 2000,
};

const OUT_OF_HOURS: AutoResponse = {
  message: `¡Hola! 👋 Gracias por tu mensaje.

En este momento estamos fuera de horario de atención. Te responderemos a primera hora.

⏰ Horario: Lunes a Viernes, 9:00 AM - 6:00 PM (hora Perú)`,
  delayMs: 1000,
};

export function getAutoResponse(products: string[], isNewLead: boolean): AutoResponse | null {
  if (products.length > 0 && TEMPLATES[products[0]]) return TEMPLATES[products[0]];
  if (isNewLead) return GREETING;
  return null;
}

export function getOutOfHoursResponse(): AutoResponse {
  return OUT_OF_HOURS;
}

export function isWithinHours(): boolean {
  const now = new Date();
  const peruHour = (now.getUTCHours() - 5 + 24) % 24;
  const day = now.getUTCDay();
  if (day === 0) return false; // Sunday
  if (day === 6) return peruHour >= CONFIG.hoursStart && peruHour < CONFIG.hoursSatEnd;
  return peruHour >= CONFIG.hoursStart && peruHour < CONFIG.hoursEnd;
}
