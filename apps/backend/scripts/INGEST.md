# Ingesta de datos externos

Schema `datos_externos.*` (creado por migration `072_datos_externos.sql`):
- `poblacion_electoral` — cortes históricos del padrón (append-only)
- `presupuesto_municipal` — PIM/PIA del MEF Transparencia Económica (UPSERT)

## 1. Pre-requisitos

```bash
cd apps/backend
bun run migrate   # corre todas las migrations pendientes (incl. 072)
```

Las tablas joinean contra `geografia_politica.{departamento, provincia, distrito}` por UBIGEO 6 dígitos (ya seedeadas con `seed-geografia-pe.ts`).

---

## 2. Frente A — Presupuesto Municipal (MEF Transparencia)

### 2.1 Descargar el CSV

1. Ir a https://apps5.mineco.gob.pe/transparencia/Navegador/default.aspx
2. Navegar: Nivel de Gobierno **M: GOBIERNOS LOCALES** → Departamento → Provincia → Municipalidades.
3. Click "Descargar" (botón con icono ↓). Te baja un Excel.
4. Abrir el Excel y guardar como **CSV (delimitado por comas, UTF-8)**.
5. Editá el header de la primera línea para que coincida exactamente con:

   ```csv
   codigo_pliego,codigo_unidad_ejecutora,nombre_entidad,pia,pim,certificacion,compromiso,devengado,girado
   ```

   - El `codigo_pliego` tiene que ser el UBIGEO de 6 dígitos del distrito. En el portal aparece como "150106-301255: MUNICIPALIDAD DISTRITAL DE CARABAYLLO" → tomá los primeros 6 dígitos (`150106`).
   - Si el MEF te da un código de 5 dígitos (típico Lima Metropolitana), padealo a 6 (ej `15010` → `150100`).
   - Los montos van en Soles, con comas de miles toleradas (`148,417,544`) o números puros (`148417544`).

### 2.2 Correr el ingest

```bash
cd apps/backend
bun scripts/ingest-mef-presupuesto.ts \
  --file ./data/mef-2026-distritos.csv \
  --anio 2026 \
  --fuente-url "https://apps5.mineco.gob.pe/transparencia/Navegador/Navegar_15.aspx"
```

Output esperado:
```
[mef] 1879 filas en /Users/.../mef-2026-distritos.csv
[mef] OK · upsert=1875 skip=2 unmatched=2
```

- `upsert` = filas insertadas o actualizadas.
- `skip` = código pliego inválido (no es UBIGEO numérico).
- `unmatched` = UBIGEO no encontrado en `geografia_politica.distrito` (avisos en stderr).

### 2.3 Re-correr cuando MEF actualice

Cuando publiquen nueva ejecución (mensual usualmente), descargás el CSV nuevo y volvés a correr el script. El UNIQUE (id_distrito, anio, codigo_unidad_ejecutora) hace UPSERT → el PIM/devengado se actualiza in-place.

---

## 3. Frente B — Población Electoral (ONPE / JNE / RENIEC / INEI)

### 3.1 Preparar el CSV

Header esperado:

```csv
ambito,ubigeo,nombre,poblacion_total,poblacion_electoral,votos_emitidos
distrito,150106,CARABAYLLO,344362,231482,168329
provincia,1501,LIMA,9485405,7012345,5234567
departamento,15,LIMA,11200000,8345678,
```

- `ambito` ∈ {`distrito`, `provincia`, `departamento`}.
- `ubigeo`:
  - distrito → 6 dígitos (matchea `distrito.id`).
  - provincia → 4 dígitos (matchea `provincia.id`, ej `1501` para Lima).
  - departamento → 1-2 dígitos (matchea `departamento.id`, ej `15` para Lima).
- Si no tenés UBIGEO, dejá `ubigeo` vacío y rellená `nombre`. El script hace lookup case-insensitive contra `geografia_politica.*.nombre`.
- Campos numéricos vacíos → NULL en la DB.

### 3.2 Correr el ingest

```bash
bun scripts/ingest-poblacion-electoral.ts \
  --file ./data/onpe-elecciones-generales-2021.csv \
  --anio 2021 \
  --fuente "ONPE" \
  --tipo-eleccion "general" \
  --fuente-url "https://www.web.onpe.gob.pe/elecciones/2021/EG-2021-2da-vuelta/" \
  --fecha-corte 2021-06-06
```

Output:
```
[poblacion] 1879 filas en /Users/.../onpe-elecciones-generales-2021.csv · fuente=ONPE anio=2021
[poblacion] OK · insert=1875 unmatched=4
```

### 3.3 Agregar más cortes

El script **no deduplica** por (geo, año, fuente) — está hecho así a propósito para preservar historial completo. Si querés cargar el corte del padrón ONPE de 2021 1ra vuelta y 2da vuelta por separado, corrés el script 2 veces con distintos `--tipo-eleccion`.

Si por error cargás dos veces el mismo corte, borralo con:
```sql
DELETE FROM datos_externos.poblacion_electoral
WHERE anio = 2021 AND fuente = 'ONPE' AND tipo_eleccion = 'general'
  AND ingestado_en > now() - interval '10 minutes';
```

---

## 4. Verificar que los datos están

```sql
-- ¿Cuántos distritos tienen presupuesto cargado para 2026?
SELECT COUNT(*) FROM datos_externos.presupuesto_municipal WHERE anio = 2026;

-- Top 10 distritos por PIM en 2026
SELECT d.nombre, p.pim
FROM datos_externos.presupuesto_municipal p
JOIN geografia_politica.distrito d ON d.id = p.id_distrito
WHERE p.anio = 2026
ORDER BY p.pim DESC NULLS LAST
LIMIT 10;

-- Historial del padrón de Carabayllo
SELECT anio, fuente, tipo_eleccion, poblacion_electoral, votos_emitidos
FROM datos_externos.poblacion_electoral
WHERE id_distrito = 150106
ORDER BY anio DESC, fuente;
```

---

## 5. Próximo paso

Una vez con datos cargados, el deck Fase 2 los va a consumir automáticamente:
- **SlideVotosNecesarios**: padron del candidato vendrá de `poblacion_electoral` (último año disponible) en vez de pedirlo al consultor.
- **Slide nueva "Contexto territorial"**: PIM del distrito + ranking nacional como contexto del presupuesto disponible.
