import { doublePrecision, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
    clientId: text("client_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    homeMapsUrl: text("home_maps_url"),
    pollingPlaceUrl: text("polling_place_url"),
    comentarios: text("comentarios"),
  },
  (table) => [index("forms_client_id_idx").on(table.clientId)],
);
