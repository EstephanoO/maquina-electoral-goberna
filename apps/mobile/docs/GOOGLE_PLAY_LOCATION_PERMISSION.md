# Google Play - Solicitud de Permiso de Ubicación en Segundo Plano

> **Contexto:** Respuestas para la declaración de permisos de ubicación en Google Play Console.
> **App:** Goberna Mobile (agentes de campo)
> **Fecha:** Febrero 2026

---

## 1. Objetivo principal de la aplicación

```
Goberna es una aplicación de gestión territorial para campañas políticas en Perú. Permite a los coordinadores de campo registrar visitas domiciliarias, recopilar datos de ciudadanos mediante formularios dinámicos, y coordinar equipos de trabajo en zonas con conectividad intermitente. La app funciona offline-first, guardando datos localmente y sincronizando automáticamente cuando hay conexión. Los supervisores pueden monitorear el avance del equipo en tiempo real desde un dashboard web.
```

**Caracteres:** 490/500

---

## 2. Función basada en la ubicación (background location)

```
Rastreo de agentes de campo para supervisión operativa. Los coordinadores de campaña necesitan saber la ubicación de su equipo mientras realizan visitas domiciliarias en zonas rurales de Perú. El tracking en segundo plano permite:
- Verificar que los agentes están en las zonas asignadas
- Optimizar rutas de trabajo en tiempo real
- Coordinar equipos dispersos geográficamente
- Registrar automáticamente la cobertura territorial

El usuario inicia el tracking manualmente desde el dashboard y puede detenerlo en cualquier momento. Se muestra una notificación persistente indicando que el tracking está activo.
```

**Caracteres:** 498/500

---

## 3. Video de demostración (YouTube)

### Qué debe mostrar el video (1-2 minutos):

| Paso | Pantalla | Duración |
|------|----------|----------|
| 1 | Splash → Login con credenciales | 10s |
| 2 | Dashboard principal de la app | 5s |
| 3 | Tap en botón "Iniciar Tracking" | 5s |
| 4 | **Prominent Disclosure** (modal explicativo) | 15s |
| 5 | Diálogo de permisos del sistema ("Allow all the time") | 10s |
| 6 | Notificación persistente de tracking activo | 10s |
| 7 | Navegar a otras pantallas (mostrar que sigue activo) | 10s |
| 8 | Dashboard web mostrando la ubicación del agente | 15s |
| 9 | Detener tracking desde la app | 5s |

### Script sugerido para el video:

> "Esta es Goberna, una app de gestión territorial para campañas políticas.
> 
> El agente de campo inicia sesión y accede a su dashboard.
> 
> Al iniciar el tracking, primero se muestra un aviso explicando que la ubicación se compartirá con los supervisores de la campaña para coordinar el trabajo de campo.
> 
> El usuario acepta y otorga el permiso de ubicación.
> 
> Una notificación persistente indica que el tracking está activo.
> 
> En el dashboard web, el supervisor puede ver la ubicación del agente en tiempo real.
> 
> El agente puede detener el tracking en cualquier momento desde la app."

---

## 4. Prominent Disclosure (Aviso Destacado)

### Requisitos de Google:

Antes de solicitar el permiso de ubicación, se DEBE mostrar un aviso que explique:

1. **Qué datos se recopilan**
2. **Para qué se usan**
3. **Con quién se comparten**

### Texto sugerido para el modal:

```
AVISO DE UBICACIÓN

Esta aplicación recopila datos de ubicación para permitir que los supervisores de tu campaña coordinen el trabajo de campo, incluso cuando la app está en segundo plano o cerrada.

Tu ubicación será visible para:
• Coordinadores de la campaña a la que perteneces
• Supervisores asignados a tu zona

Puedes detener el tracking en cualquier momento desde el dashboard.

[Continuar]  [Cancelar]
```

### Implementación requerida:

El modal debe mostrarse:
- **ANTES** de llamar a `requestBackgroundPermissionsAsync()`
- Solo si el usuario acepta ("Continuar"), se procede a pedir el permiso del sistema
- Si cancela, no se solicita el permiso y el tracking no se inicia

---

## 5. Checklist antes de enviar

- [ ] Prominent disclosure implementado en la app
- [ ] Notificación persistente con texto claro ("Goberna Tracking - Registrando ubicación")
- [ ] Video subido a YouTube (público o no listado)
- [ ] Política de privacidad actualizada mencionando el uso de ubicación
- [ ] El usuario puede detener el tracking fácilmente
- [ ] El tracking solo se inicia por acción explícita del usuario (no automático)

---

## 6. Política de Privacidad

Asegurarse de que la política de privacidad incluya:

```
DATOS DE UBICACIÓN

Nuestra aplicación recopila datos de ubicación GPS cuando el usuario 
activa la función de tracking. Estos datos incluyen:
- Coordenadas geográficas (latitud, longitud)
- Precisión del GPS
- Velocidad y dirección de movimiento
- Nivel de batería del dispositivo

Los datos de ubicación se utilizan para:
- Permitir la supervisión del trabajo de campo
- Coordinar equipos en tiempo real
- Verificar la cobertura territorial

Los datos son visibles únicamente para los supervisores de la campaña 
a la que el usuario pertenece. No vendemos ni compartimos datos de 
ubicación con terceros.

El usuario puede desactivar el tracking en cualquier momento desde 
la aplicación.
```

---

## 7. Referencias

- [Google Play Policy: Background Location](https://support.google.com/googleplay/android-developer/answer/9799150)
- [Prominent Disclosure Requirements](https://support.google.com/googleplay/android-developer/answer/11150561)
- [Background Location Checklist](https://developer.android.com/develop/sensors-and-location/location/permissions#background-location-checklist)
