# Guia de Conexion QGIS - Goberna

## Objetivo

Conectar QGIS directamente a la base de datos PostgreSQL/PostGIS del VPS para:

1. **Visualizar** capas geograficas del Peru (departamentos, provincias, distritos)
2. **Editar** zonas prioritarias de candidatos (marcar/desmarcar departamentos, provincias, distritos)
3. **Dibujar** zonas personalizadas (sectores, subsectores) con poligonos
4. **Analizar** datos de formularios en contexto geografico

Los cambios en QGIS se reflejan automaticamente en el mapa web (~5 segundos).

---

## Requisitos

- QGIS 3.x instalado (recomendado QGIS 3.28+)
- Acceso a internet al VPS `161.132.39.165`
- Puerto 5432 abierto (ya expuesto)

---

## 1. Conexion a PostgreSQL

### Datos de Conexion

| Campo         | Valor                                              |
| ------------- | -------------------------------------------------- |
| Host          | `161.132.39.165`                                   |
| Puerto        | `5432`                                             |
| Base de datos | `appdb`                                            |
| Usuario       | `appuser`                                          |
| Contrasena    | `c0d656d332708d03053cc9fe4f3b868a01b44f361856ddb8` |
| SSL           | Desactivado                                        |

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
Contrasena: c0d656d332708d03053cc9fe4f3b868a01b44f361856ddb8
```

5. Marcar **"Tambien listar tablas sin geometria"** y **"Tambien listar vistas"**
6. Click en **Probar conexion** — debe decir "Conexion exitosa"
7. Click en **Aceptar**

---

## 2. IDs de Candidatos

```sql
-- Consultar en DB Manager > SQL Window
SELECT id, name, slug FROM campaigns;
```

| Candidato           | campaign_id                            | slug                |
| ------------------- | -------------------------------------- | ------------------- |
| Cesar Vasquez       | `eece49d5-a315-4764-83f9-681cabae5c51` | cesar-vasques       |
| Giovanna Castagnino | `27b0f27f-23fc-4382-b9f2-53db1bb83a5d` | giovanna-castagnino |
| Guillermo Aliaga    | `c72e7b14-a796-4853-86f8-e97de2c3cc24` | guillermo-aliaga    |
| Rocio Porras        | `00f81464-350d-4a01-9d63-98461613a894` | rocio-porras        |

---

## 3. Zonas Prioritarias (departamentos/provincias/distritos)

### Como funciona

Las zonas prioritarias son **referencias** a la cartografia base del Peru. No tienen geometria propia — usan los poligonos de `peru_departamentos`, `peru_provincias` y `peru_distritos`.

Hay **vistas editables** que permiten marcar/desmarcar zonas directamente en QGIS:

| Vista                    | Descripcion                  | Uso                                   |
| ------------------------ | ---------------------------- | ------------------------------------- |
| `v_qgis_dep_priority`   | Departamentos x campana      | Marcar departamentos prioritarios     |
| `v_qgis_prov_priority`  | Provincias x campana         | Marcar provincias prioritarias        |
| `v_qgis_dist_priority`  | Distritos x campana          | Marcar distritos prioritarios         |

Cada vista tiene un campo `is_priority` (true/false) y `priority` (1-5) que puedes editar.

### Paso a paso: Marcar zonas prioritarias para Cesar Vasquez

#### 1. Cargar la vista de departamentos

1. **Capa > Administrador de fuentes de datos > PostgreSQL**
2. Seleccionar conexion "Goberna VPS" > **Conectar**
3. Buscar vista `v_qgis_dep_priority` en `public`
4. Seleccionarla > **Agregar**
5. La capa aparece con todos los departamentos del Peru (por cada campana)

#### 2. Filtrar por candidato

1. Click derecho en la capa > **Filtrar...**
2. Escribir: `"campaign_name" = 'Cesar Vásquez'`
3. Click **Aceptar**
4. Ahora ves solo los 25 departamentos de Cesar

#### 3. Estilizar para ver que esta marcado

1. Click derecho > **Propiedades > Simbologia**
2. Seleccionar **Basado en reglas** o **Categorizado**
3. Campo: `is_priority`
4. Colores:
   - `true` → Rojo semi-transparente (rgba 239,68,68,0.35)
   - `false` → Gris claro (rgba 200,200,200,0.1)

#### 4. Marcar un departamento como prioritario

1. Click derecho en la capa > **Alternar modo de edicion** (lapiz)
2. Seleccionar el departamento que quieres marcar (click en mapa o tabla de atributos)
3. Abrir **Tabla de atributos** (F6)
4. Cambiar `is_priority` de `false` a `true`
5. Cambiar `priority` al valor deseado (1=muy alta, 5=baja)
6. Click en **Guardar cambios** (boton disquete)
7. Desactivar edicion

#### 5. Verificar en web

1. Esperar ~5 segundos (cache de tiles)
2. Ir a: `https://maquina-electoral-goberna-web.vercel.app/candidatos/cesar-vasques/tierra`
3. El departamento aparece en rojo en el mapa

#### 6. Desmarcar un departamento

1. Activar edicion
2. Cambiar `is_priority` de `true` a `false`
3. Guardar
4. La zona desaparece del mapa web automaticamente

### Lo mismo funciona para provincias y distritos

- Provincias: cargar `v_qgis_prov_priority`, filtrar por `campaign_name`
- Distritos: cargar `v_qgis_dist_priority`, filtrar por `campaign_name`

---

## 4. Zonas Personalizadas (sectores/subsectores)

Para zonas mas granulares que un distrito, puedes **dibujar poligonos** directamente.

### Tabla: campaign_custom_zones

| Campo         | Tipo        | Descripcion                                   |
| ------------- | ----------- | --------------------------------------------- |
| `campaign_id` | UUID        | ID de la campana (obligatorio)                |
| `zone_level`  | TEXT        | `sector` o `subsector`                        |
| `zone_code`   | TEXT        | Codigo unico (ej: `S-LIMA-01`)                |
| `zone_name`   | TEXT        | Nombre descriptivo                            |
| `sector`      | INT         | Numero de sector (1, 2, 3...)                 |
| `subsector`   | INT         | Numero de subsector (si aplica)               |
| `parent_code` | TEXT        | UBIGEO del distrito padre (6 digitos)         |
| `population`  | INT         | Poblacion estimada (opcional)                 |
| `geom`        | GEOMETRY    | MultiPolygon en EPSG:4326                     |
| `source`      | TEXT        | Origen: `qgis`, `import`, `arcgis`, `manual`  |

### Paso a paso: Dibujar un sector

#### 1. Cargar la capa

1. **Capa > Administrador de fuentes de datos > PostgreSQL**
2. Seleccionar `campaign_custom_zones` > **Agregar**

#### 2. Habilitar edicion

1. Click derecho > **Alternar modo de edicion**

#### 3. Dibujar el poligono

1. Click en boton **Agregar poligono** (toolbar de edicion)
2. Dibujar el poligono en el mapa (clicks en vertices, doble-click para terminar)
3. Llenar los atributos en el formulario emergente:

| Campo       | Valor ejemplo                          |
| ----------- | -------------------------------------- |
| campaign_id | `eece49d5-a315-4764-83f9-681cabae5c51` |
| zone_level  | `sector`                               |
| zone_code   | `S-150101-01`                          |
| zone_name   | `Sector Lima Centro`                   |
| sector      | `1`                                    |
| subsector   | (vacio)                                |
| parent_code | `150101`                               |
| population  | `5000`                                 |
| source      | `qgis`                                 |

4. Click **OK**
5. Click en **Guardar cambios** (disquete)

#### 4. Verificar en web

En el mapa web, los sectores aparecen cuando haces zoom hasta nivel de distrito (drill-down: Dep > Prov > Dist > Sectores).

### Copiar geometria de un distrito existente

1. Seleccionar poligono en `peru_distritos`
2. **Edit > Copiar**
3. Seleccionar capa `campaign_custom_zones`
4. **Edit > Pegar como > Nueva geometria**
5. Ajustar los atributos (campaign_id, zone_level, etc.)
6. Guardar

---

## 5. Capas de Visualizacion (solo lectura)

### Tablas base del Peru

| Tabla                | Descripcion               | CRS       |
| -------------------- | ------------------------- | --------- |
| `peru_departamentos` | 25 departamentos del Peru | EPSG:4326 |
| `peru_provincias`    | 196 provincias del Peru   | EPSG:4326 |
| `peru_distritos`     | 1,874 distritos del Peru  | EPSG:4326 |

### Vistas de datos

| Vista                  | Descripcion                                         |
| ---------------------- | --------------------------------------------------- |
| `v_forms_geo`          | Formularios con geometria (puntos lat/lng)          |
| `v_agents_live_geo`    | Posiciones actuales de agentes de campo             |
| `v_meets_geo`          | Reuniones con ubicacion                             |
| `v_cobertura_distritos`| Cobertura de formularios por distrito/campana       |

---

## 6. Arquitectura del Flujo

```
QGIS                          PostgreSQL                      Tegola                    Web Map
────────                       ──────────                      ──────                    ───────
UPDATE v_qgis_dep_priority  →  INSTEAD OF trigger           →  (cache 5s)            →  tiles
SET is_priority = true          INSERT campaign_priority_zones   genera nuevo MVT tile     renderiza zona roja

Dibujar poligono            →  INSERT campaign_custom_zones  →  (cache 5s)            →  tiles
en campaign_custom_zones        (geometria propia)              genera nuevo MVT tile     renderiza sector
```

Tiempo de propagacion: **~5 segundos** desde que guardas en QGIS hasta que aparece en el mapa web.

---

## 7. Solucion de Problemas

### "Connection refused" o timeout

- Verificar que el puerto 5432 este expuesto: `docker ps | grep postgres`
- Probar: `psql -h 161.132.39.165 -U appuser -d appdb -c "SELECT 1"`

### No aparecen las vistas

- En la conexion QGIS, marcar **"Tambien listar vistas"**
- Refrescar conexion (boton actualizar)

### Error al editar is_priority

- Asegurar que `campaign_id` sea un UUID valido (no el nombre)
- Filtrar la vista por campaign_name antes de editar

### Error al guardar poligono custom

- Verificar que `campaign_id` sea un UUID valido
- Verificar que `zone_level` sea `sector` o `subsector`
- Verificar que `source` sea `qgis`, `import`, `arcgis` o `manual`
- La geometria debe ser MultiPolygon en EPSG:4326

### El mapa web no muestra las zonas

- Zonas prioritarias aparecen al zoom apropiado (dep=zoom 3+, prov=zoom 5+, dist=zoom 8+)
- Sectores custom aparecen al drill-down (zoom 10+, dentro de un distrito)
- Refrescar la pagina web (Ctrl+Shift+R) si han pasado mas de 5 segundos

### Los nombres de departamentos estan vacios

- Conocido: el campo `nomdep` de `peru_departamentos` esta vacio. Usa `coddep` como referencia.
- Los codigos son: 01=Amazonas, 02=Ancash, 03=Apurimac, 04=Arequipa, 05=Ayacucho, 06=Cajamarca,
  07=Callao, 08=Cusco, 09=Huancavelica, 10=Huanuco, 11=Ica, 12=Junin, 13=La Libertad,
  14=Lambayeque, 15=Lima, 16=Loreto, 17=Madre de Dios, 18=Moquegua, 19=Pasco, 20=Piura,
  21=Puno, 22=San Martin, 23=Tacna, 24=Tumbes, 25=Ucayali

---

## 8. Respaldar antes de editar

```sql
-- Respaldar tablas de zonas
CREATE TABLE campaign_custom_zones_backup AS SELECT * FROM campaign_custom_zones;
CREATE TABLE campaign_priority_zones_backup AS SELECT * FROM campaign_priority_zones;
```
