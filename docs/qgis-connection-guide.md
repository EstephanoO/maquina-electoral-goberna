# Guia de Conexion QGIS - Goberna

## Objetivo

Conectar QGIS directamente a la base de datos PostgreSQL/PostGIS del VPS para:
1. **Visualizar** capas geograficas del Peru (departamentos, provincias, distritos)
2. **Editar** zonas personalizadas de candidatos (sectors, subsectores)
3. **Analizar** datos de formularios en contexto geografico

---

## Requisitos

- QGIS 3.x instalado (recomendado QGIS 3.28+)
- Acceso a internet al VPS `161.132.39.165`
- Puerto 5432 abierto (ya expuesto)

---

## 1. Conexion a PostgreSQL

### Datos de Conexion

| Campo | Valor |
|-------|-------|
| Host | `161.132.39.165` |
| Puerto | `5432` |
| Base de datos | `appdb` |
| Usuario | `appuser` |
| Contraseña | `c0d656d332708d03053cc9fe4f3b868a01b44f361856ddb8` |
| SSL | Desactivado |

### Pasos en QGIS

1. Abrir QGIS
2. Ir a **Capa > Administrador de fuentes de datos > PostgreSQL**
3. Click en **Nueva** para crear conexion
4. Llenar los datos:

```
Nombre: Goberna VPS
Host: 161.132.39.165
Puerto: 5432
Base de datos: appdb
Usuario: appuser
Contraseña: c0c656d332708d03053cc9fe4f3b868a01b44f361856ddb8
```

5. Click en **Probar conexion** — debe decir "Conexion exitosa"
6. Click en **Aceptar**
7. En la lista de tablas, seleccionar las capas a cargar:
   - `peru_departamentos`
   - `peru_provincias`
   - `peru_distritos`
   - `campaign_custom_zones` (para editar zonas)
   - `campaign_priority_zones` (para editar prioridades)
   - `forms` (datos de formularios)
8. Click en **Agregar**

---

## 2. Tablas Disponibles

### Tablas de Referencia (solo lectura)

| Tabla | Descripcion | CRS |
|-------|-------------|-----|
| `peru_departamentos` | 24 departamentos del Peru | EPSG:4326 |
| `peru_provincias` | 196 provincias del Peru | EPSG:4326 |
| `peru_distritos` | 1,874 distritos del Peru | EPSG:4326 |

### Tablas Editables

| Tabla | Descripcion | CRS |
|-------|-------------|-----|
| `campaign_priority_zones` | Referencias a zonas del Peru (departamento/provincia/distrito) | - |
| `campaign_custom_zones` | Zonas personalizadas con geometria propia (poligonos) | EPSG:4326 |
| `forms` | Datos de formularios capturados | - |

---

## 3. Estructura de Tablas Editables

### campaign_priority_zones

Referencias ligeras a la base cartografica del Peru.

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `id` | SERIAL | ID interno |
| `campaign_id` | UUID | ID de la campana (obligatorio) |
| `zone_level` | TEXT | Nivel: `departamento`, `provincia`, `distrito` |
| `zone_code` | TEXT | Codigo geografico: CODDEP (2), CODDEP+CODPROV (4), UBIGEO (6) |
| `priority` | INT | Prioridad (1=muy alta, 5=baja) |
| `metadata` | JSONB | Metadatos extra |
| `created_at` | TIMESTAMPTZ | Fecha de creacion |

**Ejemplo de insercion manual:**

```sql
-- Agregar Lima como zona prioritaria para Cesar Vasquez
INSERT INTO campaign_priority_zones (campaign_id, zone_level, zone_code, priority)
VALUES ('eece49d5-a315-4764-83f9-681cabae5c51', 'departamento', '15', 1);
```

### campaign_custom_zones

Zonas personalizadas con geometria propia (poligonos que dibujas en QGIS).

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `id` | SERIAL | ID interno |
| `campaign_id` | UUID | ID de la campana (obligatorio) |
| `zone_level` | TEXT | Nivel: `sector` o `subsector` |
| `zone_code` | TEXT | UBIGEO del distrito padre (6 digitos) |
| `zone_name` | TEXT | Nombre de la zona (opcional) |
| `sector` | INT | Numero de sector (1, 2, 3...) |
| `subsector` | INT | Numero de subsector (si aplica) |
| `parent_code` | TEXT | UBIGEO del distrito containing |
| `population` | INT | Poblacion estimada (opcional) |
| `metadata` | JSONB | Metadatos extra |
| `geom` | GEOMETRY | Poligono en EPSG:4326 |
| `source` | TEXT | Origen: `import`, `arcgis`, `qgis`, `manual` |
| `created_at` | TIMESTAMPTZ | Fecha de creacion |

---

## 4. Flujo de Trabajo: Dibujar Zonas

### Paso 1: Obtener el campaign_id

```sql
-- Listar candidatos y sus IDs
SELECT id, name, slug FROM campaigns;
```

Ejemplo para **Cesar Vasquez**:
- `campaign_id`: `eece49d5-a315-4764-83f9-681cabae5c51`

### Paso 2: Habilitar edicion en QGIS

1. Click derecho sobre `campaign_custom_zones` > **Alternar modo de edicion**
2. O click derecho > **Abrir tabla de atributos**

### Paso 3: Dibujar un sector

1. Click en boton **Agregar poligono** (toolbar de edicion)
2. Dibujar el poligono en el mapa
3. Llenar los atributos:

| Campo | Valor ejemplo |
|-------|---------------|
| campaign_id | `eece49d5-a315-4764-83f9-681cabae5c51` |
| zone_level | `sector` |
| zone_code | `150101` (UBIGEO de Lima) |
| zone_name | `Sector Centro` |
| sector | `1` |
| subsector | (vacio) |
| parent_code | `150101` |
| population | `5000` |
| source | `qgis` |

4. Click en **Guardar** (boton guardar cambios)

### Paso 4: Verificar en Web

1. Ir a `https://goberna.pe/candidatos/[slug]/tierra`
2. Las zonas dibujadas aparecen automaticamente en el mapa
3. Click en una zona para ver sus datos

---

## 5. IDs de Candidatos (Ejemplos)

| Candidato | campaign_id | slug |
|-----------|-------------|------|
| Cesar Vasquez | `eece49d5-a315-4764-83f9-681cabae5c51` | cesar-vasques |
| Giovanna | (ver en DB) | (ver en DB) |
| Rocio | (ver en DB) | (ver en DB) |

Para obtener todos los candidatos:

```sql
SELECT id, name, slug FROM campaigns;
```

---

## 6. Tips y Trucos

### Ver formas en el mapa

Los formularios capturados tienen coordenadas UTM. QGIS no los muestra directamente, pero puedes crear una vista:

```sql
-- Crear vista con formas en lat/lng
CREATE OR REPLACE VIEW forms_geo AS
SELECT 
  id,
  nombre,
  telefono,
  ST_X(ST_Transform(ST_SetSRID(ST_MakePoint(x, y), 32718), 4326)) AS lng,
  ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint(x, y), 32718), 4326)) AS lat,
  zona,
  campaign_id,
  created_at
FROM forms
WHERE x IS NOT NULL AND y IS NOT NULL;
```

Luego agregar esta vista en QGIS como capa.

### Copiar geometria de otra capa

1. Seleccionar poligono en `peru_distritos`
2. Edit > Copiar
3. Edit > Pegar en `campaign_custom_zones`
4. Ajustar atributos

### Respaldar antes de editar

```sql
-- Respaldar tablas de zonas
CREATE TABLE campaign_custom_zones_backup AS SELECT * FROM campaign_custom_zones;
CREATE TABLE campaign_priority_zones_backup AS SELECT * FROM campaign_priority_zones;
```

---

## 7. Solucion de Problemas

### "Connection refused" o timeout

- Verificar que el puerto 5432 este expuesto: `docker ps | grep postgres`
- Ver firewall: `iptables -L -n | grep 5432`

### No aparecen las tablas

- Verificar que tienes acceso: `psql -h 161.132.39.165 -U appuser -d appdb -c "SELECT 1"`
- Refrescar conexion en QGIS (boton actualizar)

### Error al guardar poligono

- Verificar que `campaign_id` sea un UUID valido
- Verificar que `zone_level` sea `sector` o `subsector`
- Verificar que `geom` no sea NULL

### El mapa web no muestra las zonas

- Verificar que la zona tenga `campaign_id` correcto
- Verificar que `zone_level` y `zone_code` coincidan con ubigeos validos
- Refrescar la pagina web (Crtl+Shift+R)

---

## Contacto

Para soporte, revisar los logs del backend:

```bash
ssh deploy@161.132.39.165
docker compose logs -f backend
```
