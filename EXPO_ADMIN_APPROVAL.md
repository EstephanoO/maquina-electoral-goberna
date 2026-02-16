# Aprobación de Solicitudes desde App Expo (Admin)

## 📱 Flujo de Usuario Admin

### 1. Login como Admin
```typescript
// El admin se loguea normalmente
const response = await fetch('http://161.132.39.165/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@goberna.pe',
    password: 'Admin1234!'
  })
});

const { user, tokens, campaigns } = await response.json();
// user.role === 'admin'
// tokens.access_token para usar en headers
```

### 2. Listar Solicitudes Pendientes
```typescript
// Endpoint mobile-friendly que solo devuelve pending
const response = await fetch('http://161.132.39.165/api/access-requests/pending', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }
});

const { pending_requests } = await response.json();
// pending_requests es un array de solicitudes
```

### Estructura de una Solicitud Pendiente
```typescript
{
  id: "uuid",                          // ID de la solicitud
  user_id: "uuid",                     // ID del usuario
  campaign_id: "uuid",                 // ID del candidato
  status: "pending",                   // Estado (pending/approved/rejected)
  requested_at: "2024-01-15T10:30:00Z", // Fecha de solicitud
  resolved_at: null,                   // null si está pending
  resolved_by: null,                   // null si está pending
  note: null,                          // Nota del admin (null inicialmente)
  perm_tierra: true,                   // Permiso de campo solicitado
  perm_digital: true,                  // Permiso digital solicitado
  // Datos del usuario (joined)
  user_email: "juan@example.com",
  user_full_name: "Juan Perez",
  // Datos del candidato (joined)
  campaign_name: "Rocío Porras",
  campaign_cargo: "Consejera Regional",
  campaign_numero: 18
}
```

### 3. Aprobar o Rechazar Solicitud
```typescript
// Para aprobar
const response = await fetch(`http://161.132.39.165/api/access-requests/${requestId}`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    status: 'approved',
    note: 'Bienvenido al equipo' // Opcional
  })
});

// Para rechazar
const response = await fetch(`http://161.132.39.165/api/access-requests/${requestId}`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    status: 'rejected',
    note: 'No cumple requisitos' // Opcional
  })
});

const { access_request } = await response.json();
```

## 🎯 Qué Pasa Cuando Apruebas

1. **La solicitud cambia de estado** a `approved`
2. **Se crea automáticamente** una relación en `user_campaigns`:
   - El usuario queda asignado al candidato
   - Se le da rol `agent`
   - Se le asignan los permisos `perm_tierra` y `perm_digital` que pidió
   - El usuario puede ahora hacer login y ver datos de ese candidato

3. **El usuario puede volver a hacer login** y ahora tendrá:
   ```typescript
   {
     user: { ... },
     tokens: { ... },
     campaigns: [
       {
         campaign_id: "uuid-del-candidato",
         campaign_name: "Rocío Porras",
         campaign_slug: "rocio-porras",
         campaign_config: {},
         role: "agent"
       }
     ]
   }
   ```

## 🔐 Permisos Requeridos

- Solo usuarios con `role: "admin"` pueden:
  - Ver lista de solicitudes pendientes
  - Aprobar o rechazar solicitudes
- Si un usuario sin rol admin intenta, recibe `403 Forbidden`

## 📊 Ejemplo Completo de UI Expo

```typescript
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface PendingRequest {
  id: string;
  user_full_name: string;
  user_email: string;
  campaign_name: string;
  campaign_cargo: string;
  campaign_numero: number;
  requested_at: string;
  perm_tierra: boolean;
  perm_digital: boolean;
}

export function AdminApprovalScreen() {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPendingRequests();
  }, []);

  async function loadPendingRequests() {
    try {
      const token = await AsyncStorage.getItem('access_token');
      const response = await fetch('http://161.132.39.165/api/access-requests/pending', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setRequests(data.pending_requests);
    } catch (error) {
      console.error('Error loading requests:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(requestId: string) {
    try {
      const token = await AsyncStorage.getItem('access_token');
      await fetch(`http://161.132.39.165/api/access-requests/${requestId}`, {
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
      // Recargar lista
      await loadPendingRequests();
    } catch (error) {
      console.error('Error approving request:', error);
    }
  }

  async function handleReject(requestId: string) {
    try {
      const token = await AsyncStorage.getItem('access_token');
      await fetch(`http://161.132.39.165/api/access-requests/${requestId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'rejected',
          note: 'Rechazado desde app móvil'
        })
      });
      // Recargar lista
      await loadPendingRequests();
    } catch (error) {
      console.error('Error rejecting request:', error);
    }
  }

  return (
    <View>
      <Text style={styles.title}>Solicitudes Pendientes</Text>
      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.userName}>{item.user_full_name}</Text>
              <Text style={styles.userEmail}>{item.user_email}</Text>
              <Text style={styles.campaign}>
                {item.campaign_name} - {item.campaign_cargo} #{item.campaign_numero}
              </Text>
              <View style={styles.permissions}>
                {item.perm_tierra && <Text>✓ Campo</Text>}
                {item.perm_digital && <Text>✓ Digital</Text>}
              </View>
              <Text style={styles.date}>
                Solicitado: {new Date(item.requested_at).toLocaleDateString()}
              </Text>
              <View style={styles.actions}>
                <Button
                  title="Aprobar"
                  onPress={() => handleApprove(item.id)}
                  color="#28a745"
                />
                <Button
                  title="Rechazar"
                  onPress={() => handleReject(item.id)}
                  color="#dc3545"
                />
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}
```

## 🚨 Manejo de Errores

### Error 403 - Forbidden
```json
{
  "ok": false,
  "error_code": "FORBIDDEN",
  "message": "acceso denegado"
}
```
**Causa:** El usuario no tiene rol `admin`

### Error 404 - Not Found
```json
{
  "ok": false,
  "error_code": "ACCESS_REQUEST_NOT_FOUND",
  "message": "solicitud no encontrada o ya resuelta"
}
```
**Causa:** La solicitud ya fue aprobada/rechazada o no existe

### Error 401 - Unauthorized
```json
{
  "ok": false,
  "error_code": "UNAUTHORIZED",
  "message": "token invalido o expirado"
}
```
**Causa:** Token expirado. Usar refresh token para obtener uno nuevo.

## 🔄 Flujo Completo

```
┌──────────────────────────────────────────────────────────────┐
│ 1. Usuario nuevo se registra                                 │
│    POST /api/auth/register                                   │
│    { email, password, full_name }                            │
└────────────────────────────────┬─────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. Usuario selecciona candidato en onboarding                │
│    POST /api/access-requests                                 │
│    { campaign_id, perm_tierra: true, perm_digital: true }    │
│    → Estado: PENDING                                         │
└────────────────────────────────┬─────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. Admin ve lista de pendientes en app Expo                  │
│    GET /api/access-requests/pending                          │
│    → Ve: nombre, email, candidato, permisos solicitados      │
└────────────────────────────────┬─────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────┐
│ 4. Admin aprueba desde app Expo                              │
│    PUT /api/access-requests/:id                              │
│    { status: "approved", note: "..." }                       │
│    → Backend crea relación en user_campaigns                 │
│    → Usuario queda activo en ese candidato                   │
└────────────────────────────────┬─────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────┐
│ 5. Usuario vuelve a hacer login                              │
│    POST /api/auth/login                                      │
│    → Ahora recibe campaigns con el candidato aprobado        │
│    → Puede acceder a mapa y funcionalidad de ese candidato   │
└──────────────────────────────────────────────────────────────┘
```

## 📝 Notas Importantes

1. **Una solicitud por candidato**: Un usuario solo puede tener una solicitud `pending` por candidato. Si intenta crear otra, el backend devuelve 409 Conflict.

2. **Permisos se guardan en la solicitud**: Cuando el usuario solicita acceso, especifica qué permisos quiere (`perm_tierra`, `perm_digital`). Cuando el admin aprueba, esos permisos se copian a `user_campaigns`.

3. **Rechazar no bloquea**: Si el admin rechaza una solicitud, el usuario puede volver a solicitar acceso más tarde.

4. **Admin ve todos los candidatos**: Después de login, el admin recibe `campaigns` con todos los candidatos activos (porque en seed se le asignaron todos).

5. **Expo debe manejar refresh tokens**: El access token expira en 15min. Implementar refresh automático según `AUTH_CONTRACT.md`.

## 🎨 Datos de Candidatos para Testing

```typescript
// Candidatos disponibles en producción:
const candidates = [
  {
    id: "uuid-rocio",
    name: "Rocío Porras",
    cargo: "Consejera Regional",
    numero: 18,
    partido: "Hechos y No Palabras",
    foto_url: "/rocio-porras.jpg"
  },
  {
    id: "uuid-guillermo",
    name: "Guillermo Aliaga",
    cargo: "Alcalde",
    numero: 2,
    partido: "Movimiento Regional",
    foto_url: "/guillermo-aliaga.jpg"
  },
  {
    id: "uuid-giovanna",
    name: "Giovanna Castagnino",
    cargo: "Regidora",
    numero: 7,
    partido: "Acción Popular",
    foto_url: "/giovanna-castagnino.jpg"
  }
];
```

## 🔗 Endpoints Relacionados

| Método | Endpoint | Requiere Admin | Descripción |
|--------|----------|----------------|-------------|
| GET | `/api/access-requests/pending` | ✅ | Lista solo pendientes (mobile-friendly) |
| GET | `/api/access-requests?status=pending` | ✅ | Lista con filtro (web) |
| GET | `/api/access-requests` | ✅ | Lista todas las solicitudes |
| GET | `/api/access-requests/mine` | ❌ | Usuario ve sus propias solicitudes |
| POST | `/api/access-requests` | ❌ | Usuario solicita acceso a candidato |
| PUT | `/api/access-requests/:id` | ✅ | Admin aprueba/rechaza solicitud |

## 🚀 Testing Rápido

```bash
# 1. Login como admin
curl -X POST http://161.132.39.165/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@goberna.pe","password":"Admin1234!"}'

# 2. Listar pendientes (usar token del paso 1)
curl -X GET http://161.132.39.165/api/access-requests/pending \
  -H "Authorization: Bearer <ACCESS_TOKEN>"

# 3. Aprobar solicitud
curl -X PUT http://161.132.39.165/api/access-requests/<REQUEST_ID> \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"status":"approved","note":"Aprobado"}'
```
