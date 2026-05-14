# Ingesta de datos externos en `onboarding_fase1`

Esta carpeta concentra los scripts que escriben en
`onboarding_fase1.datos_externos.*`. Es la **fuente de verdad** del
enriquecimiento que potencia la presentación fase-2 (slides
SlideContextoTerritorial, SlideVotosNecesarios, SlideAnalisisElectoral).

**Importante**: estos scripts NO escriben en `appdb` (la DB principal del
producto). Apuntan exclusivamente a `onboarding_fase1` via la env
`ONBOARDING_DATABASE_URL`.

## Pre-requisitos

```bash
cd apps/backend
# Asegurate de tener ONBOARDING_DATABASE_URL en .env
bun run migrate:onboarding   # aplica migrations-onboarding/*.sql
bun scripts/onboarding-fase1/seed-elecciones.ts   # catálogo base
```

Las tablas `datos_externos.*` FKean contra `geografia_politica.peru_*`
(las tablas del geógrafo). El `id` de `peru_distritos` es **secuencial
(1..1891), NO UBIGEO**. Por eso los scripts hacen lookup nombre+provincia.

---

## Frente A — Presupuesto Municipal (MEF Transparencia)

### A.1 Descargar el CSV

1. Ir a https://apps5.mineco.gob.pe/transparencia/Navegador/default.aspx
2. Navegar: Nivel de Gobierno **M: GOBIERNOS LOCALES** → Departamento → Provincia → Municipalidades.
3. Click "Descargar". Te baja un Excel.
4. Guardar como **CSV (delimitado por comas, UTF-8)**.
5. Editar el header para que coincida exactamente con:

   ```csv
   codigo_pliego,codigo_unidad_ejecutora,nombre_entidad,provincia,departamento,pia,pim,certificacion,compromiso,devengado,girado
   ```

   - `nombre_entidad` típicamente `"MUNICIPALIDAD DISTRITAL DE CARABAYLLO"`.
   - `provincia` y `departamento` son opcionales pero ayudan a desambiguar
     distritos con nombres duplicados (e.g. "Santiago" existe en varios
     departamentos).
   - Montos en Soles, con comas de miles toleradas (`148,417,544`).

### A.2 Correr el ingest

```bash
cd apps/backend
bun scripts/onboarding-fase1/ingest-mef-presupuesto.ts \
  --file ./data/mef-2026-distritos.csv \
  --anio 2026 \
  --fuente-url "https://apps5.mineco.gob.pe/transparencia/Navegador/Navegar_15.aspx"
```

Output esperado:

```
[mef] 1879 filas en /Users/.../mef-2026-distritos.csv
[mef] OK · upsert=1850 skip=12 unmatched=17
```

- `upsert`: filas insertadas o actualizadas.
- `skip`: nombre_entidad no era "MUNICIPALIDAD DISTRITAL DE ..." (p.ej. municipalidad provincial → no aplica).
- `unmatched`: nombre del distrito no se pudo matchear contra `peru_distritos` (avisos en stderr).

### A.3 Re-correr cuando MEF actualice

El portal MEF actualiza ejecución mensual. Volvé a descargar el CSV y a
correr el script — el UNIQUE (id_distrito, anio, codigo_unidad_ejecutora)
dispara UPSERT y actualiza PIM/devengado in-place.

---

## Frente B — Padrón electoral (ONPE / JNE / RENIEC)

### B.1 Preparar el CSV

Header esperado:

```csv
ambito,nombre,provincia,departamento,poblacion_total,poblacion_electoral,votos_emitidos
distrito,CARABAYLLO,LIMA,LIMA,344362,231482,168329
provincia,LIMA,,LIMA,9485405,7012345,5234567
departamento,LIMA,,,11200000,8345678,
```

- `ambito` ∈ {`distrito`, `provincia`, `departamento`}.
- `nombre` = nombre del lugar (case+tilde-insensitive).
- `provincia`/`departamento` opcionales (necesarios cuando hay
  ambigüedad — e.g. "Lima" distrito existe en provincia Lima).

### B.2 Correr el ingest

```bash
bun scripts/onboarding-fase1/ingest-padron-onpe.ts \
  --file ./data/onpe-eg2021-2v.csv \
  --eleccion EG2021_2V \
  --fuente ONPE \
  --fuente-url "https://www.web.onpe.gob.pe/elecciones/2021/EG-2021-2da-vuelta/" \
  --fecha-corte 2021-06-06
```

Output:

```
[padron] 1879 filas · eleccion=EG2021_2V fuente=ONPE
[padron] OK · insert=1860 unmatched=15 skip=4
```

### B.3 Agregar más cortes

El script **no deduplica** — está hecho a propósito para preservar
historial completo. Para cargar 1ra y 2da vuelta por separado: corré 2
veces con `--eleccion EG2021_1V` y `--eleccion EG2021_2V`.

Si por error cargás dos veces el mismo corte:

```sql
DELETE FROM datos_externos.padron_electoral
WHERE id_eleccion = (SELECT id FROM datos_externos.eleccion WHERE codigo='EG2021_2V')
  AND fuente = 'ONPE'
  AND ingestado_en > now() - interval '10 minutes';
```

---

## Verificar la data cargada

```sql
-- ¿Cuántos distritos tienen presupuesto cargado para 2026?
SELECT COUNT(*) FROM datos_externos.presupuesto_municipal WHERE anio = 2026;

-- Top 10 distritos por PIM en 2026 (con nombre)
SELECT d.distrito, p.pim
FROM datos_externos.presupuesto_municipal p
JOIN geografia_politica.peru_distritos d ON d.id = p.id_distrito
WHERE p.anio = 2026
ORDER BY p.pim DESC NULLS LAST
LIMIT 10;

-- Historial del padrón de Carabayllo (id=845)
SELECT e.codigo, e.fecha_eleccion, p.fuente, p.poblacion_electoral, p.votos_emitidos
FROM datos_externos.padron_electoral p
JOIN datos_externos.eleccion e ON e.id = p.id_eleccion
WHERE p.id_distrito = 845
ORDER BY e.fecha_eleccion DESC, p.fuente;
```

---

## Próximos pasos

Una vez con data cargada, las siguientes slides la van a consumir
automáticamente:

- **SlideVotosNecesarios**: padrón vendrá de `padron_electoral` (último corte
  por distrito) en vez de pedirlo al consultor.
- **SlideContextoTerritorial**: PIM del distrito + ranking nacional + mapa
  con maplibre.
- **SlideAnalisisElectoral**: resultados de últimas elecciones del distrito
  desde `resultado_electoral`.
