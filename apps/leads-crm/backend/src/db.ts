/**
 * Backwards-compat shim. La lógica vive partida por dominio en `db/`. Imports
 * existentes (`from "./db.js"`) siguen funcionando — esto solo re-exporta lo
 * que el index original exponía.
 *
 * Migración progresiva: nuevo código debería importar específico desde
 * `./db/<domain>.js`. Ver `db/index.ts` para la composición del object legacy.
 */
export {
  db,
  invalidatePrefixCache,
  classifyMessage,
  type Stage,
  type Priority,
  type Lead,
  type LeadInput,
  type InteractionKind,
  type Interaction,
  type Template,
  type SendStatus,
  type Send,
  type Operator,
} from "./db/index.js";
