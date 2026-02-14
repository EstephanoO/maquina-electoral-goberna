import { doublePrecision, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const forms = pgTable(
  "forms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    nombre: text("nombre").notNull(),
    telefono: text("telefono").notNull(),
    fecha: timestamp("fecha", { withTimezone: true }).notNull(),
    x: doublePrecision("x").notNull(),
    y: doublePrecision("y").notNull(),
    zona: text("zona").notNull(),
    candidate: text("candidate").notNull().default(""),
    encuestador: text("encuestador").notNull(),
    encuestadorId: text("encuestador_id").notNull(),
    candidatoPreferido: text("candidato_preferido").notNull(),
    clientId: text("client_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    homeMapsUrl: text("home_maps_url"),
    pollingPlaceUrl: text("polling_place_url"),
    comentarios: text("comentarios"),
  },
  (table) => [
    uniqueIndex("uq_forms_client_id").on(table.clientId),
    index("idx_forms_created_at").on(table.createdAt),
    index("idx_forms_encuestador_created_at").on(table.encuestadorId, table.createdAt),
  ],
);
