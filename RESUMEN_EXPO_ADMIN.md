# 🎯 Resumen: Admin Aprueba Solicitudes desde Expo

## ✅ Lo que Implementé

### 1. **Backend Preparado**
- ✅ Migración 004 ejecutada en producción (agrega `perm_tierra` y `perm_digital` a `access_requests`)
- ✅ Endpoint mobile-friendly: `GET /api/access-requests/pending`
- ✅ Lógica de aprobación automática: cuando admin aprueba, se crea relación en `user_campaigns` con permisos
- ✅ Backend rebuilt y corriendo en VPS (161.132.39.165)

### 2. **Documentación Completa**
- ✅ `EXPO_ADMIN_APPROVAL.md` con toda la integración
- ✅ Ejemplos TypeScript listos para copiar/pegar
- ✅ Componente React Native de ejemplo completo
- ✅ Manejo de errores documentado

## 🔥 Flujo Completo

```
1. Usuario se registra → selecciona candidato → solicita acceso (PENDING)
   ↓
2. Admin entra a app Expo → ve lista de solicitudes pendientes
   ↓
3. Admin aprueba desde Expo → backend crea relación automática
   ↓
4. Usuario vuelve a hacer login → ahora tiene acceso al candidato
```

## 📱 Endpoints para tu App Expo

### Login Admin
```typescript
POST http://161.132.39.165/api/auth/login
Body: { email: "admin@goberna.pe", password: "Admin1234!" }
Response: { access_token, user, campaigns }
```

### Listar Solicitudes Pendientes (Mobile-Friendly)
```typescript
GET http://161.132.39.165/api/access-requests/pending
Headers: { Authorization: "Bearer <token>" }
Response: {
  ok: true,
  pending_requests: [
    {
      id: "uuid",
      user_full_name: "Juan Perez",
      user_email: "juan@example.com",
      campaign_name: "Rocío Porras",
      campaign_cargo: "Consejera Regional",
      campaign_numero: 18,
      perm_tierra: true,
      perm_digital: true,
      requested_at: "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Aprobar Solicitud
```typescript
PUT http://161.132.39.165/api/access-requests/:requestId
Headers: { Authorization: "Bearer <token>", Content-Type: "application/json" }
Body: { status: "approved", note: "Bienvenido" }
Response: { ok: true, access_request: {...} }
```

### Rechazar Solicitud
```typescript
PUT http://161.132.39.165/api/access-requests/:requestId
Headers: { Authorization: "Bearer <token>", Content-Type: "application/json" }
Body: { status: "rejected", note: "No cumple requisitos" }
Response: { ok: true, access_request: {...} }
```

## 🚀 Código Listo para Expo

```typescript
// 1. Login como admin
const loginResponse = await fetch('http://161.132.39.165/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@goberna.pe',
    password: 'Admin1234!'
  })
});
const { access_token } = await loginResponse.json();

// 2. Ver solicitudes pendientes
const pendingResponse = await fetch('http://161.132.39.165/api/access-requests/pending', {
  headers: { 'Authorization': `Bearer ${access_token}` }
});
const { pending_requests } = await pendingResponse.json();

// 3. Aprobar una solicitud
async function approveRequest(requestId: string, token: string) {
  const response = await fetch(`http://161.132.39.165/api/access-requests/${requestId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      status: 'approved',
      note: 'Aprobado desde app móvil'
    })
  });
  return await response.json();
}
```

## 🎨 Datos de Candidatos

| Nombre | Cargo | Número | Partido |
|--------|-------|--------|---------|
| Rocío Porras | Consejera Regional | 18 | Hechos y No Palabras |
| Guillermo Aliaga | Alcalde | 2 | Movimiento Regional |
| Giovanna Castagnino | Regidora | 7 | Acción Popular |

## 🔐 Qué Pasa al Aprobar

1. El backend recibe `PUT /api/access-requests/:id` con `status: "approved"`
2. Automáticamente:
   - Marca la solicitud como `approved`
   - Crea entrada en `user_campaigns` con:
     - `user_id` → del solicitante
     - `campaign_id` → del candidato seleccionado
     - `role` → `agent`
     - `status` → `active`
     - `perm_tierra` → valor que pidió el usuario
     - `perm_digital` → valor que pidió el usuario
3. El usuario ahora puede hacer login y ver ese candidato en `campaigns`
4. El usuario tiene acceso a mapa y funcionalidades de ese candidato

## 🚨 Errores Comunes

| Error | Causa | Solución |
|-------|-------|----------|
| 403 Forbidden | Usuario no es admin | Verificar que `user.role === "admin"` |
| 401 Unauthorized | Token expirado | Usar refresh token para renovar |
| 404 Not Found | Solicitud ya aprobada/rechazada | Recargar lista de pendientes |

## 📝 Testing Rápido desde Terminal

```bash
# 1. Login admin
curl -X POST http://161.132.39.165/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@goberna.pe","password":"Admin1234!"}'
# → Copiar access_token

# 2. Ver pendientes
curl -X GET http://161.132.39.165/api/access-requests/pending \
  -H "Authorization: Bearer <ACCESS_TOKEN>"

# 3. Aprobar solicitud
curl -X PUT http://161.132.39.165/api/access-requests/<REQUEST_ID> \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"status":"approved","note":"Aprobado"}'
```

## 📚 Documentación Detallada

- **`EXPO_ADMIN_APPROVAL.md`** → Guía completa con ejemplos de UI React Native
- **`AUTH_CONTRACT.md`** → Contrato completo de autenticación y refresh tokens
- **`CREDENCIALES.md`** → Credenciales de desarrollo (admin + 3 supervisores)

## 🎯 Siguiente Paso

1. Implementar la UI en Expo usando los ejemplos de `EXPO_ADMIN_APPROVAL.md`
2. Probar flujo completo:
   - Crear usuario de prueba desde web o Expo
   - Ese usuario solicita acceso a un candidato
   - Admin ve solicitud en app Expo
   - Admin aprueba
   - Usuario vuelve a loguearse y ve el candidato

## 🔗 URL de Producción

**Backend:** `http://161.132.39.165`

(Nota: Cambiar a HTTPS cuando esté configurado Cloudflare SSL)

---

**Estado:** ✅ Backend listo y probado en producción
**Commit:** `9b3ea2a` - feat: add admin approval flow for Expo app
**Migración:** 004 ejecutada en VPS
**Backend:** Rebuilt y corriendo correctamente
