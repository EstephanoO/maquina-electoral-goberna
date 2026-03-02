# WhatsApp Goberna Helper

Extensión de Chrome para optimizar la gestión de WhatsApp Web en campañas electorales.

## Características

- ✅ **Una sola pestaña** - Reutiliza la pestaña de WhatsApp Web en lugar de abrir múltiples
- ✅ **Detección de respuestas** - Detecta automáticamente mensajes entrantes
- ✅ **Palabras clave** - Clasifica mensajes como positivo/negativo/pendiente
- ✅ **Webhook al backend** - Envía eventos al API de Goberna

## Instalación

1. Abre Chrome y navega a `chrome://extensions/`
2. Activa el **"Modo de desarrollador"** (esquina superior derecha)
3. Haz clic en **"Cargar descomprimida"**
4. Selecciona la carpeta `extensions/whatsapp-helper`

## Uso

### Desde el Dashboard Goberna

El botón de WhatsApp debe usar:

```javascript
// En lugar de window.open()
chrome.runtime.sendMessage({
  action: "openChat",
  phone: "935700540"
});
```

### Desde la extensión

1. Haz clic en el ícono de la extensión
2. Click en "Abrir WhatsApp"
3. Usa normalmente WhatsApp Web

## Estructura

```
whatsapp-helper/
├── manifest.json      # Configuración de la extensión
├── background.js      # Gestor de pestaña única
├── content.js        # Detector de mensajes
├── popup.html/js     # Interfaz de la extensión
└── icons/            # Íconos de la extensión
```

## Palabras clave detectadas

| Tipo | Palabras |
|------|----------|
| Positivo | sí, confirmo, apoyo, voto, ok, perfecto, me interesa, quiero |
| Negativo | no, no puedo, no quiero, gracias pero no |
| Pendiente | llamo después, hablamos después, luego |

## API

La extensión envía eventos POST a:

```
POST https://api.goberna.us/api/whatsapp/events
{
  "phone": "935700540",
  "message": "Sí, te apoyo",
  "type": "positivo",
  "keyword": "sí",
  "timestamp": "2026-03-02T12:00:00Z"
}
```

## Backend requerido

El backend debe tener el endpoint `/api/whatsapp/events` para recibir los eventos.

## Notas

- Esta extensión solo **lee** el DOM de WhatsApp Web pasivamente
- No automatiza el envío de mensajes
- Riesgo de bloqueo: prácticamente nulo
- Compatible con manifest v3
