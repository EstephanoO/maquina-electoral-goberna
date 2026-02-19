# Registro Regional + Aprobacion por Zona

**Fecha:** 2026-02-19  
**Estado:** Aprobado  
**Alcance:** Mobile (registro) + Backend (filtro access-requests)

---

## Resumen

Sistema de registro desde mobile con campo de region (departamento) obligatorio. Los brigadistas zonales solo ven solicitudes de su region; admin/jefe_campana/consultor ven todas.

## Campos de Registro

1. **Nombres y Apellidos** - TextInput
2. **Telefono** - TextInput (phone-pad)
3. **Contrasena** - TextInput (secureTextEntry)
4. **Region** - Bottom Sheet con buscador (25 departamentos)
5. **Candidato** - Busqueda + seleccion (ya existe)

## Flujo

```
Usuario abre app → Register
    ↓
Llena formulario (nombre, telefono, password, region, candidato)
    ↓
POST /api/auth/register { email, password, full_name, phone, region, campaign_id }
    ↓
Backend crea user + access_request con region
    ↓
Usuario ve pantalla "Pendiente de Aprobacion"
    ↓
Brigadista zonal de esa region (o admin/jefe) aprueba
    ↓
Usuario obtiene acceso a la campana
```

## Componentes

### 1. RegionPicker (nuevo)

Bottom sheet con:
- Handle visual
- Titulo "Selecciona tu region"
- Campo de busqueda
- Lista filtrable de 25 departamentos
- Radio buttons
- Boton confirmar

Usa `@gorhom/bottom-sheet` (ya instalado).

### 2. Constante departamentos.ts (nuevo)

```typescript
export const DEPARTAMENTOS = [
  { code: 'AMAZONAS', name: 'Amazonas' },
  { code: 'ANCASH', name: 'Ancash' },
  // ... 25 total
];
```

### 3. Modificacion register.tsx

- Agregar campo telefono antes de password
- Agregar RegionPicker despues de password
- Enviar phone y region en el POST

## Backend

### POST /api/auth/register

Ya acepta `phone` y `region`. Verificar que:
- Guarda en tabla `users`
- Crea `access_request` con la region

### GET /api/access-requests

Logica de filtro:
- Si `user.role === 'brigadista_zonal'` → filtrar por `region = user.region`
- Si `user.role in ['admin', 'consultor', 'jefe_campana']` → sin filtro

## Archivos a modificar

| Archivo | Accion |
|---------|--------|
| `apps/mobile/lib/constants/departamentos.ts` | Crear |
| `apps/mobile/components/RegionPicker.tsx` | Crear |
| `apps/mobile/app/(auth)/register.tsx` | Modificar |
| `apps/backend/src/modules/access-requests/routes.ts` | Verificar filtro |

## Definition of Done

- [ ] Mobile: Campo telefono funciona
- [ ] Mobile: RegionPicker abre, busca, selecciona
- [ ] Mobile: Registro envia phone + region
- [ ] Backend: access_request guarda region
- [ ] Backend: GET access-requests filtra por region para brigadistas
- [ ] Usuario pendiente ve pantalla correcta
- [ ] Brigadista zonal solo ve solicitudes de su region
