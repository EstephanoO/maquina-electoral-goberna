# WhatsApp Goberna Helper

Extension de Chrome para la integracion de WhatsApp Web con el dashboard de Goberna.

## Funcionalidades

- **Una sola pestana** — Todos los links de WhatsApp del dashboard se abren en una misma pestana de WhatsApp Web, sin duplicados.
- **Navegacion sin recarga** — Al abrir un chat desde el dashboard, la extension navega dentro de WhatsApp Web via DOM (click "Nuevo chat", buscar numero, Enter). Sin recargar la pagina.
- **Deteccion de mensajes enviados** — Detecta cuando el operador envia un mensaje en WhatsApp Web y lo notifica al dashboard via `goberna:messageSent` CustomEvent.
- **Sincronizacion con CMS** — El dashboard recibe los eventos y actualiza el estado del contacto en el CMS automaticamente.

## Instalacion

1. Abre Chrome y navega a `chrome://extensions/`
2. Activa el **"Modo de desarrollador"** (esquina superior derecha)
3. Haz clic en **"Cargar descomprimida"**
4. Selecciona la carpeta `extensions/whatsapp-helper`

## Arquitectura

```
whatsapp-helper/
  manifest.json      # Manifest V3 — permisos limitados a WA + dashboard
  background.js      # Service worker — orquesta navegacion multi-step en WA Web
  content.js         # Content script en web.whatsapp.com — detecta mensajes enviados
  interceptor.js     # Content script en dashboard — intercepta links WA + relay eventos
  popup.html/js      # Popup de la extension — status + abrir WA
  icons/             # Iconos de la extension
```

### Flujo de datos

```
Dashboard (click link WA)
  → interceptor.js intercepta click/window.open
  → background.js recibe "openChat"
  → background.js reutiliza tab WA existente
  → background.js inyecta scripts DOM multi-step:
      1. Click "Nuevo chat" (ISOLATED)
      2. Poll hasta que aparece search input (ISOLATED)
      3. Escribir numero de telefono (MAIN world, execCommand)
      4. Poll hasta que aparecen resultados (ISOLATED)
      5. Enter para seleccionar primer resultado (MAIN)
      6. Poll hasta que se abre el chat (ISOLATED)
      7. Pre-fill mensaje si fue proporcionado (MAIN)

WhatsApp Web (operador envia mensaje)
  → content.js detecta via MutationObserver en #main
  → content.js notifica a background.js ("messageSent")
  → background.js relay a todas las tabs del dashboard
  → interceptor.js despacha CustomEvent "goberna:messageSent"
  → React app del dashboard escucha y actualiza estado CMS
```

### Mundos de ejecucion (ISOLATED vs MAIN)

WhatsApp Web usa React con contenteditable inputs. `document.execCommand("insertText")` solo funciona en MAIN world (donde vive React). Sin embargo, MAIN world no puede retornar Promises ni valores async.

| Operacion | Mundo | Razon |
|-----------|-------|-------|
| Click botones, leer DOM | ISOLATED | Retorna valores, `.click()` funciona en buttons |
| Escribir en inputs | MAIN | `execCommand` necesario para React contenteditable |
| Validar estado | ISOLATED | Necesita retornar resultado |

### Permisos

| Permiso | Uso |
|---------|-----|
| `tabs` | Buscar/reutilizar tab de WhatsApp Web |
| `storage` | Persistir configuracion (reservado) |
| `activeTab` | Acceso a la tab activa para scripting |
| `scripting` | Inyectar steps DOM en WhatsApp Web |

`host_permissions` limitados a: `web.whatsapp.com`, `wa.me`, `api.whatsapp.com`, `dashboard.grupogoberna.com`, `localhost:3000/3001`.

## Debugging

Para activar logs detallados, cambiar `DEBUG = true` en cada archivo JS. Los logs aparecen con el prefijo `[Goberna WA]`.

## Notas

- La extension solo lee el DOM de WhatsApp Web y navega via clicks/keyboard — no automatiza envio de mensajes.
- Compatible con Manifest V3.
- Polling adaptativo en lugar de sleeps fijos para mayor robustez en conexiones lentas.
- Fallback progresivo: numero local → numero completo → +prefijo → URL (recarga).
