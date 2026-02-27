# Guia de Conexion QGIS — Goberna

> **Ultima actualizacion:** 2026-02-27
> **Audiencia:** Geografo de Goberna
> **Tiempo de propagacion:** < 5 segundos (QGIS save → mapa web actualizado)

---

## Objetivo

Conectar QGIS directamente a la base de datos PostgreSQL/PostGIS del VPS para:

1. **Visualizar** capas geograficas del Peru (departamentos, provincias, distritos)
2. **Editar** zonas prioritarias por campana (marcar/desmarcar departamentos, provincias, distritos)
3. **Dibujar** zonas personalizadas (sectores, subsectores) con poligonos
4. **Verificar en vivo** — el dashboard se actualiza automaticamente en < 5 segundos

### Como funciona el flujo completo

```
QGIS (tu maquina)                          Servidor
──────────────────                          ────────────────────────────────────

  Guardas cambio (Ctrl+S)
         │
         ▼
  PostgreSQL actualiza                      ← conexion directa al VPS
         │
         ├─ INSTEAD OF trigger              (vistas de priority zones)
         │  o INSERT/UPDATE directo         (custom zones)
         │
         ▼
  pg_notify('geo_change')                   ← trigger automatico
         │
         ▼
  Backend recibe notificacion               ← LISTEN en canal 'geo_change'
         │
         ├─ Bump version en Redis           (invalida cache de tiles)
         └─ Push SSE a dashboards           (navegadores conectados)
                │
                ▼
  Dashboard recibe evento SSE
         │
         ▼
  Browser recarga tiles automaticamente     ← sin refrescar pagina
         │
         ▼
  Mapa muestra el cambio                    ← en < 5 segundos total
```

**El geografo NO necesita hacer nada extra** — guardar en QGIS es suficiente.

---

## Requisitos

- QGIS 3.28+ instalado (descargar de https://qgis.org)
- Acceso a internet al VPS `161.132.39.165`
- Puerto 5432 accesible (PostgreSQL)

---

## 1. Configurar la Conexion

### Datos de Conexion

| Campo         | Valor                                              |
| ------------- | -------------------------------------------------- |
| Host          | `161.132.39.165`                                   |
| Puerto        | `5432`                                             |
| Base de datos | `appdb`                                            |
| Usuario       | `appuser`                                          |
| Contrasena    | *(pedir a EstephanoO — no se guarda en repositorio)* |
| SSL           | Desactivado                                        |

### Pasos en QGIS

1. Abrir QGIS
2. Ir a **Capa > Administrador de fuentes de datos > PostgreSQL**
3. Click en **Nueva** para crear conexion
4. Llenar los datos:

```
Nombre:        Goberna VPS
Host:          161.132.39.165
Puerto:        5432
Base de datos: appdb
Autenticacion: Basic (usuario + contrasena)
```

5. Marcar estas dos casillas:
   - **"Tambien listar tablas sin geometria"**
   - **"Tambien listar vistas"**
6. Click en **Probar conexion** — debe decir "Conexion exitosa"
7. Click en **Aceptar**

### Verificar conexion

Despues de conectar, deberias ver en el panel de fuentes de datos:

```
public
  ├── peru_departamentos        (tabla, MultiPolygon)
  ├── peru_provincias           (tabla, MultiPolygon)
  ├── peru_distritos            (tabla, MultiPolygon)
  ├── campaign_custom_zones     (tabla, MultiPolygon)
  ├── campaign_priority_zones   (tabla, sin geometria)
  ├── brigadista_locations      (tabla, Point)
  ├── v_qgis_dep_priority       (vista, MultiPolygon)
  ├── v_qgis_prov_priority      (vista, MultiPolygon)
  └── v_qgis_dist_priority      (vista, MultiPolygon)
```

---

## 2. Identificar Campanas

Cada candidato tiene un `campaign_id` (UUID) que se usa para asociar zonas.

```sql
-- Ejecutar en QGIS: Base de Datos > DB Manager > SQL Window
SELECT id, name, slug FROM campaigns;
```

| Candidato           | campaign_id                            | slug                |
| ------------------- | -------------------------------------- | ------------------- |
| Cesar Vasquez       | `eece49d5-a315-4764-83f9-681cabae5c51` | cesar-vasquez       |
| Giovanna Castagnino | `27b0f27f-23fc-4382-b9f2-53db1bb83a5d` | giovanna-castagnino |
| Guillermo Aliaga    | `c72e7b14-a796-4853-86f8-e97de2c3cc24` | guillermo-aliaga    |
| Rocio Porras        | `00f81464-350d-4a01-9d63-98461613a894` | rocio-porras        |

> **Nota:** Si hay campanas nuevas, ejecutar el query para obtener los IDs actualizados.

---

## 3. Zonas Prioritarias (departamentos / provincias / distritos)

### Que son

Las zonas prioritarias son **referencias** a la cartografia base del Peru. No tienen geometria propia — usan los poligonos existentes de `peru_departamentos`, `peru_provincias` y `peru_distritos`.

Se editan via **vistas editables** con triggers `INSTEAD OF`:

| Vista                   | Nivel        | Zoom web | Filtro drill-down |
| ----------------------- | ------------ | -------- | ----------------- |
| `v_qgis_dep_priority`  | Departamento | 3+       | Siempre visible   |
| `v_qgis_prov_priority` | Provincia    | 5+       | Dentro del dep seleccionado |
| `v_qgis_dist_priority` | Distrito     | 8+       | Dentro de la prov seleccionada |

Cada vista tiene estos campos editables:

| Campo         | Tipo    | Descripcion                          |
| ------------- | ------- | ------------------------------------ |
| `is_priority` | boolean | `true` = prioritario, `false` = no   |
| `priority`    | integer | Nivel de prioridad (1=muy alta, 5=baja) |

### Paso a paso: Marcar zonas prioritarias

#### 1. Cargar la vista

1. **Capa > Administrador de fuentes de datos > PostgreSQL**
2. Seleccionar conexion **"Goberna VPS"** > **Conectar**
3. Buscar `v_qgis_dep_priority` en el esquema `public`
4. Seleccionarla > **Agregar**
5. Aparecen todos los departamentos de Peru (uno por campana)

#### 2. Filtrar por candidato

1. Click derecho en la capa > **Filtrar...**
2. Escribir el filtro:

```
"campaign_name" = 'Cesar Vásquez'
```

3. Click **Aceptar**
4. Ahora ves solo los 25 departamentos de ese candidato

> **Importante:** Siempre filtrar por candidato antes de editar. Si no filtras, puedes
> estar editando zonas de otro candidato sin darte cuenta.

#### 3. Estilizar para ver que esta marcado

1. Click derecho en la capa > **Propiedades > Simbologia**
2. Seleccionar **Categorizado**
3. Campo: `is_priority`
4. Click **Clasificar**
5. Colores sugeridos:
   - `true` → Rojo semi-transparente: `rgba(239, 68, 68, 0.35)`
   - `false` → Gris claro: `rgba(200, 200, 200, 0.10)`

#### 4. Editar

1. Click derecho en la capa > **Alternar modo de edicion** (icono de lapiz)
2. Abrir **Tabla de atributos** (F6)
3. Ubicar el departamento que quieres marcar
4. Cambiar `is_priority` de `false` a `true`
5. Cambiar `priority` al nivel deseado (1-5)
6. Click en **Guardar cambios** (icono de disquete en la toolbar)
7. Desactivar modo de edicion

#### 5. Verificar en el dashboard

1. Abrir el dashboard del candidato en el navegador:
   ```
   https://dashboard.grupogoberna.com/candidatos/cesar-vasquez/tierra
   ```
2. **No necesitas refrescar la pagina** — el mapa se actualiza automaticamente en < 5 segundos
3. El departamento marcado aparece en rojo en el mapa

#### 6. Desmarcar una zona

1. Activar edicion
2. Cambiar `is_priority` de `true` a `false`
3. Guardar
4. La zona desaparece del mapa web automaticamente

### Repetir para provincias y distritos

El proceso es identico para los otros niveles:

- **Provincias:** cargar `v_qgis_prov_priority`, filtrar por `"campaign_name" = '...'`
- **Distritos:** cargar `v_qgis_dist_priority`, filtrar por `"campaign_name" = '...'`

---

## 4. Zonas Personalizadas (sectores / subsectores)

Para zonas mas granulares que un distrito, puedes **dibujar poligonos** directamente en la tabla `campaign_custom_zones`.

### Tabla: campaign_custom_zones

| Campo         | Tipo             | Obligatorio | Descripcion                                   |
| ------------- | ---------------- | ----------- | --------------------------------------------- |
| `campaign_id` | UUID             | Si          | ID de la campana (copiar de seccion 2)        |
| `zone_level`  | TEXT             | Si          | `sector` o `subsector`                        |
| `zone_code`   | TEXT             | Si          | Codigo unico (ej: `S-150101-01`)              |
| `zone_name`   | TEXT             | Si          | Nombre descriptivo (ej: `Sector Lima Centro`) |
| `sector`      | INT              | Si          | Numero de sector (1, 2, 3...)                 |
| `subsector`   | INT              | No          | Numero de subsector (si aplica)               |
| `parent_code` | TEXT             | Si          | UBIGEO del distrito padre (6 digitos)         |
| `population`  | INT              | No          | Poblacion estimada                            |
| `geom`        | MultiPolygon     | Si          | Geometria en EPSG:4326                        |
| `source`      | TEXT             | Si          | Siempre usar `qgis`                           |

> **Nota:** La columna `geom_3857` se calcula automaticamente por un trigger. No necesitas llenarla.

### Convencion de codigos

```
zone_code:   S-{UBIGEO}-{numero_sector}
             SS-{UBIGEO}-{sector}-{subsector}

Ejemplos:
  S-150101-01      → Sector 1 del distrito Lima (150101)
  S-150101-02      → Sector 2 del distrito Lima
  SS-150101-01-01  → Subsector 1 del sector 1
```

### Paso a paso: Dibujar un sector

#### 1. Cargar la capa

1. **Capa > Administrador de fuentes de datos > PostgreSQL**
2. Seleccionar `campaign_custom_zones` en `public` > **Agregar**

#### 2. (Opcional) Cargar distrito base como referencia

Para tener referencia visual al dibujar:

1. Cargar tambien `peru_distritos`
2. Filtrar: `"ubigeo" = '150101'` (o el distrito que necesites)
3. Poner esta capa debajo de `campaign_custom_zones` en el panel de capas

#### 3. Habilitar edicion

1. Click derecho en `campaign_custom_zones` > **Alternar modo de edicion**

#### 4. Dibujar el poligono

1. Click en **Agregar poligono** (toolbar de edicion)
2. Dibujar el poligono en el mapa:
   - Click en cada vertice
   - **Doble-click** para terminar
3. Llenar los atributos en el formulario:

| Campo         | Valor ejemplo                            |
| ------------- | ---------------------------------------- |
| `campaign_id` | `eece49d5-a315-4764-83f9-681cabae5c51`   |
| `zone_level`  | `sector`                                 |
| `zone_code`   | `S-150101-01`                            |
| `zone_name`   | `Sector Lima Centro`                     |
| `sector`      | `1`                                      |
| `subsector`   | *(dejar vacio para sectores)*            |
| `parent_code` | `150101`                                 |
| `population`  | `5000`                                   |
| `source`      | `qgis`                                   |

4. Click **OK**
5. **Guardar cambios** (icono disquete)

#### 5. Verificar en el dashboard

Los sectores aparecen en el mapa web cuando haces drill-down:
**Departamento → Provincia → Distrito → Sectores** (zoom 10+)

#### 6. Editar un sector existente

1. Activar edicion en `campaign_custom_zones`
2. Usar la herramienta **Mover vertices** para ajustar el poligono
3. O editar atributos en la tabla de atributos (F6)
4. Guardar

#### 7. Eliminar un sector

1. Activar edicion
2. Seleccionar el poligono
3. Presionar **Supr** (Delete)
4. Guardar

### Copiar geometria desde un distrito existente

Atajo para crear un sector que cubra todo un distrito:

1. Seleccionar el poligono en `peru_distritos`
2. **Editar > Copiar**
3. Seleccionar la capa `campaign_custom_zones`
4. **Editar > Pegar como > Nueva geometria**
5. Llenar los atributos (`campaign_id`, `zone_level`, `zone_code`, etc.)
6. Guardar

---

## 5. Ubicaciones de Brigadistas (puntos domicilio / trabajo)

Para cada brigadista se pueden marcar **dos puntos**: su domicilio y su centro de trabajo.
Los puntos se diferencian por **rol** (agente de campo vs agente digital) y **tipo de ubicacion**.

### Tabla: brigadista_locations

| Campo         | Tipo    | Obligatorio | Descripcion                                        |
| ------------- | ------- | ----------- | -------------------------------------------------- |
| `campaign_id` | UUID    | Si          | ID de la campana (copiar de seccion 2)             |
| `agent_name`  | TEXT    | Si          | Nombre del brigadista (ej: `Juan Perez`)           |
| `agent_role`  | TEXT    | Si          | `agente_campo` o `agente_digital`                  |
| `location_type`| TEXT   | Si          | `domicilio` o `centro_trabajo`                     |
| `notes`       | TEXT    | No          | Notas adicionales (direccion, referencia, etc.)    |
| `geom`        | Point   | Si          | Punto en EPSG:4326 (clic en el mapa)               |

> **Nota:** La columna `geom_3857` se calcula automaticamente por un trigger. No necesitas llenarla.

### Colores en el dashboard

| Capa | Color | Descripcion |
| ---- | ----- | ----------- |
| Domicilio - Campo | Ambar oscuro (#d97706) | Casa del agente de campo |
| Trabajo - Campo | Ambar claro (#f59e0b) | Trabajo del agente de campo |
| Domicilio - Digital | Violeta oscuro (#7c3aed) | Casa del agente digital |
| Trabajo - Digital | Violeta claro (#a78bfa) | Trabajo del agente digital |

### Paso a paso: Agregar ubicacion de brigadista

#### 1. Cargar la capa

1. **Capa > Administrador de fuentes de datos > PostgreSQL**
2. Seleccionar `brigadista_locations` en `public` > **Agregar**

#### 2. Filtrar por candidato

1. Click derecho en la capa > **Filtrar...**
2. Escribir: `"campaign_id" = 'eece49d5-a315-4764-83f9-681cabae5c51'` (reemplazar con el UUID)
3. Click **Aceptar**

#### 3. Estilizar por tipo

1. Click derecho en la capa > **Propiedades > Simbologia**
2. Seleccionar **Categorizado**
3. Campo: `agent_role`
4. Click **Clasificar**
5. Colores sugeridos:
   - `agente_campo` → Ambar: `#d97706`
   - `agente_digital` → Violeta: `#7c3aed`

#### 4. Agregar un punto

1. Click derecho en la capa > **Alternar modo de edicion**
2. Click en **Agregar punto** (toolbar de edicion)
3. Click en el mapa donde esta la ubicacion
4. Llenar los atributos:

| Campo          | Valor ejemplo                            |
| -------------- | ---------------------------------------- |
| `campaign_id`  | `eece49d5-a315-4764-83f9-681cabae5c51`   |
| `agent_name`   | `Juan Perez`                             |
| `agent_role`   | `agente_campo`                           |
| `location_type`| `domicilio`                              |
| `notes`        | `Av. Arequipa 1234, Lince`              |

5. Click **OK**
6. **Guardar cambios** (Ctrl+S)
7. El punto aparece en el dashboard automaticamente (< 5 segundos)

#### 5. Verificar en el dashboard

Los puntos de brigadistas aparecen desde **zoom 8+** en el mapa de tierra.
Las etiquetas con el nombre aparecen desde **zoom 11+**.

#### 6. Editar/mover un punto

1. Activar edicion
2. Usar la herramienta **Mover punto** para reposicionar
3. O editar atributos en la tabla de atributos (F6)
4. Guardar

#### 7. Eliminar un punto

1. Activar edicion
2. Seleccionar el punto
3. Presionar **Supr** (Delete)
4. Guardar

---

## 6. Capas de Visualizacion (solo lectura)

Estas capas se pueden cargar para analisis visual en QGIS pero **no se deben editar**:

### Cartografia base

| Tabla                | Rows  | CRS       | Descripcion               |
| -------------------- | ----- | --------- | ------------------------- |
| `peru_departamentos` | 25    | EPSG:4326 | Departamentos del Peru    |
| `peru_provincias`    | 196   | EPSG:4326 | Provincias del Peru       |
| `peru_distritos`     | 1,874 | EPSG:4326 | Distritos del Peru        |

### Vistas de datos operativos

| Vista                   | Descripcion                                   |
| ----------------------- | --------------------------------------------- |
| `v_forms_geo`           | Formularios de campo con punto lat/lng        |
| `v_agents_live_geo`     | Posiciones actuales de agentes de campo       |
| `v_meets_geo`           | Reuniones de campo con ubicacion              |
| `v_cobertura_distritos` | Cobertura de formularios por distrito/campana |

> **Tip:** Cargar `v_forms_geo` con filtro `"campaign_id" = '<uuid>'` para
> ver los formularios recolectados sobre el mapa de zonas priority.

---

## 7. Workflow Recomendado (Setup Optimo)

### Proyecto QGIS sugerido por candidato

Crear un proyecto `.qgz` con estas capas (en este orden, de abajo hacia arriba):

```
Capas (panel de capas):
  ├── [base] peru_departamentos       (fill gris, linea gris oscuro)
  ├── [base] peru_provincias          (linea gris, sin fill)
  ├── [base] peru_distritos           (linea gris claro, sin fill)
  ├── [priority] v_qgis_dep_priority  (filtrado por campaign_name, categorizado por is_priority)
  ├── [priority] v_qgis_prov_priority (filtrado, categorizado)
  ├── [priority] v_qgis_dist_priority (filtrado, categorizado)
  ├── [custom] campaign_custom_zones  (filtrado por campaign_id, linea roja)
  ├── [brigadistas] brigadista_locations (filtrado por campaign_id, categorizado por agent_role)
  └── [datos] v_forms_geo             (filtrado por campaign_id, puntos azules)
```

### Flujo de trabajo diario

```
1. Abrir proyecto QGIS
2. Las capas se conectan automaticamente al VPS

3. Para marcar zonas prioritarias:
   a. Activar edicion en la vista de priority (dep/prov/dist)
   b. Cambiar is_priority en la tabla de atributos
   c. Guardar (Ctrl+S)
   d. (El dashboard se actualiza solo)

4. Para dibujar sectores nuevos:
   a. Activar edicion en campaign_custom_zones
   b. Dibujar poligono
   c. Llenar atributos
   d. Guardar (Ctrl+S)
   e. (El dashboard se actualiza solo)

5. Verificar en segundo monitor:
   Dashboard abierto en el navegador — los cambios aparecen en < 5s
```

### Verificacion en dos monitores

```
Monitor 1: QGIS                          Monitor 2: Dashboard
──────────────────                        ────────────────────────────────
  Marca priority = true ──────────────→   Zona se pinta de rojo
  Dibuja poligono sector ─────────────→   Sector aparece en drill z10+
  Edita vertices ─────────────────────→   Forma se actualiza
  Elimina zona ───────────────────────→   Zona desaparece
```

---

## 8. Aislamiento entre Campanas (Seguridad)

Cada campana **solo puede ver sus propias zonas** en el mapa web:

- Los tiles MVT se filtran en el backend por `campaign_id` antes de enviarse al navegador
- Un usuario del dashboard de Cesar Vasquez **no puede ver** las zonas de Giovanna Castagnino
- El filtrado es server-side (protobuf decode/filter/encode) — no depende del navegador

> **En QGIS** ves todas las campanas porque te conectas directo a la base de datos.
> **Siempre filtrar por candidato** antes de editar para no modificar datos de otra campana.

---

## 9. Solucion de Problemas

### "Connection refused" o timeout

```bash
# Verificar que PostgreSQL esta corriendo en el VPS
docker ps | grep postgres

# Probar conexion directa
psql -h 161.132.39.165 -U appuser -d appdb -c "SELECT 1"
```

- Si no conecta, verificar que el puerto 5432 esta expuesto en `docker-compose.yml`
- Verificar que no haya firewall bloqueando el puerto

### No aparecen las vistas en QGIS

1. En las propiedades de la conexion, verificar que esten marcadas:
   - "Tambien listar tablas sin geometria"
   - "Tambien listar vistas"
2. Click derecho en la conexion > **Refrescar**
3. Si aun no aparecen, verificar que la migracion `010_qgis_priority_views.sql` se ejecuto

### Error al editar `is_priority`

- Asegurar que la vista esta **filtrada por campaign_name** antes de editar
- El trigger `INSTEAD OF` maneja la logica; si hay error, revisar los logs del trigger:
  ```sql
  -- En DB Manager
  SELECT * FROM pg_catalog.pg_stat_activity WHERE state = 'idle in transaction';
  ```

### Error al guardar poligono custom

Verificar que todos los campos obligatorios estan llenos:

| Campo         | Validacion                                          |
| ------------- | --------------------------------------------------- |
| `campaign_id` | UUID valido (copiar de la tabla de seccion 2)       |
| `zone_level`  | Solo `sector` o `subsector`                         |
| `source`      | Solo `qgis`, `import`, `arcgis` o `manual`          |
| `geom`        | Debe ser MultiPolygon en EPSG:4326                  |
| `parent_code` | UBIGEO de 6 digitos (verificar en `peru_distritos`) |

### El mapa web no muestra los cambios

1. **Verificar zoom:** Las zonas aparecen en niveles especificos:
   - Priority departamentos: zoom 3+
   - Priority provincias: zoom 5+
   - Priority distritos: zoom 8+
   - Sectores custom: zoom 10+ (dentro del distrito via drill-down)

2. **Si pasan mas de 10 segundos sin actualizarse:**
   - Hacer hard refresh en el navegador (Ctrl+Shift+R)
   - Verificar que el backend esta corriendo: `curl https://api.goberna.us/api/health`
   - Verificar Redis: el backend necesita Redis para la invalidacion de cache

3. **Si la zona se guardo pero no aparece en el mapa:**
   ```sql
   -- Verificar que la zona existe
   SELECT * FROM campaign_priority_zones WHERE campaign_id = '<uuid>';
   SELECT * FROM campaign_custom_zones WHERE campaign_id = '<uuid>';
   ```

### Los nombres de departamentos estan vacios

Conocido: el campo `nomdep` puede estar vacio en algunas filas. Referencia de codigos INEI:

```
01=Amazonas, 02=Ancash, 03=Apurimac, 04=Arequipa, 05=Ayacucho,
06=Cajamarca, 07=Callao, 08=Cusco, 09=Huancavelica, 10=Huanuco,
11=Ica, 12=Junin, 13=La Libertad, 14=Lambayeque, 15=Lima,
16=Loreto, 17=Madre de Dios, 18=Moquegua, 19=Pasco, 20=Piura,
21=Puno, 22=San Martin, 23=Tacna, 24=Tumbes, 25=Ucayali
```

---

## 10. Seguridad: Firewall UFW para Puerto PostgreSQL

El puerto 5432 esta expuesto al exterior para la conexion QGIS directa.
**Se DEBE asegurar con UFW** para que solo IPs autorizadas puedan conectar.

### Configuracion en el VPS (ejecutar como root/sudo)

```bash
# 1. Verificar estado actual de UFW
sudo ufw status numbered

# 2. Permitir el IP del geografo (reemplazar con su IP real)
sudo ufw allow from <IP_GEOGRAFO> to any port 5432 proto tcp comment "QGIS geografo"

# 3. Permitir localhost (para conexiones internas Docker)
sudo ufw allow from 127.0.0.1 to any port 5432 proto tcp comment "localhost PG"

# 4. Denegar todo lo demas al puerto 5432 (si UFW esta en default deny, esto ya aplica)
# Si UFW no esta activo:
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# 5. Verificar reglas
sudo ufw status verbose
```

### Cuando el geografo cambia de IP

```bash
# Ver reglas numeradas
sudo ufw status numbered

# Eliminar la regla vieja (por numero)
sudo ufw delete <numero_regla>

# Agregar la nueva IP
sudo ufw allow from <NUEVA_IP> to any port 5432 proto tcp comment "QGIS geografo"
```

### Nota importante sobre Docker y UFW

Docker modifica iptables directamente y puede saltarse UFW.
Para que UFW controle el puerto 5432 expuesto por Docker:

```bash
# Opcion 1: Editar /etc/docker/daemon.json
echo '{ "iptables": false }' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker

# Opcion 2 (recomendada): Usar DOCKER-USER chain
sudo iptables -I DOCKER-USER -p tcp --dport 5432 -j DROP
sudo iptables -I DOCKER-USER -p tcp --dport 5432 -s <IP_GEOGRAFO> -j ACCEPT
sudo iptables -I DOCKER-USER -p tcp --dport 5432 -s 127.0.0.1 -j ACCEPT

# Persistir reglas iptables
sudo apt install iptables-persistent
sudo netfilter-persistent save
```

> **IMPORTANTE:** Probar la conectividad QGIS despues de configurar el firewall.
> Si no conecta, verificar que la IP del geografo sea correcta con `curl ifconfig.me`.

---

## 11. Importar Zonas desde GeoJSON (Alternativa a QGIS)

Para importaciones masivas, existe un script CLI:

```bash
cd apps/backend

# Importar zonas priority desde GeoJSON
bun run scripts/import_priority_zones.ts \
  --campaign=cesar-vasquez \
  --level=departamento \
  --file=./data/priority_deps.geojson

# Importar sectores custom desde GeoJSON
bun run scripts/import_priority_zones.ts \
  --campaign=cesar-vasquez \
  --level=sector \
  --file=./data/sectors_lima.geojson

# Opciones utiles
--dry-run     # Ver que se importaria sin escribir en DB
--replace     # Reemplazar zonas existentes (en vez de agregar)
--validate    # Solo validar el GeoJSON contra la cartografia base
```

---

## 12. Respaldar Antes de Editar

Antes de una sesion de edicion grande, crear backup:

```sql
-- Ejecutar en DB Manager > SQL Window
CREATE TABLE campaign_priority_zones_backup AS SELECT * FROM campaign_priority_zones;
CREATE TABLE campaign_custom_zones_backup AS SELECT * FROM campaign_custom_zones;
CREATE TABLE brigadista_locations_backup AS SELECT * FROM brigadista_locations;
```

Para restaurar si algo sale mal:

```sql
-- CUIDADO: esto borra los datos actuales y restaura el backup
TRUNCATE campaign_priority_zones;
INSERT INTO campaign_priority_zones SELECT * FROM campaign_priority_zones_backup;

TRUNCATE campaign_custom_zones;
INSERT INTO campaign_custom_zones SELECT * FROM campaign_custom_zones_backup;

TRUNCATE brigadista_locations;
INSERT INTO brigadista_locations SELECT * FROM brigadista_locations_backup;
```

---

## Referencia Rapida

| Accion | Donde | Capa/Vista | Resultado en web |
| ------ | ----- | ---------- | ---------------- |
| Marcar dep. prioritario | QGIS | `v_qgis_dep_priority` | Zona roja en zoom 3+ |
| Marcar prov. prioritaria | QGIS | `v_qgis_prov_priority` | Zona roja en zoom 5+ |
| Marcar dist. prioritario | QGIS | `v_qgis_dist_priority` | Zona roja en zoom 8+ |
| Dibujar sector | QGIS | `campaign_custom_zones` | Sector en zoom 10+ (drill-down) |
| Agregar domicilio brigadista | QGIS | `brigadista_locations` | Punto ambar/violeta en zoom 8+ |
| Agregar trabajo brigadista | QGIS | `brigadista_locations` | Punto ambar/violeta en zoom 8+ |
| Importar GeoJSON | Terminal | `import_priority_zones.ts` | Segun nivel importado |
