/**
 * Composición del `db` object para backwards-compat con código que importa
 * `import { db } from "./db.js"` y llama `db.list()`, `db.findByPhone()`, etc.
 *
 * Nuevo código debería importar funciones específicas desde sus repositories:
 *
 *   import { findByPhone } from "../db/leads.js";
 *   import { searchLearnedReplies } from "../db/learned-replies.js";
 *
 * El `db` object queda como surface api estable mientras migramos. Eventualmente
 * lo deprecamos pero por ahora cubre los 132 handlers existentes sin tocar.
 */

import * as leads from "./leads.js";
import * as interactions from "./interactions.js";
import * as templates from "./templates.js";
import * as embeddings from "./embeddings.js";
import * as learnedReplies from "./learned-replies.js";
import * as intentMining from "./intent-mining.js";
import * as sends from "./sends.js";
import * as settings from "./settings.js";
import * as stats from "./stats.js";
import * as users from "./users.js";

// Re-exports de tipos
export type {
  Stage, Priority, Lead, LeadInput, InteractionKind, Interaction,
  Template, SendStatus, Send, Operator,
} from "./types.js";

// Re-exports de helpers/utilities expuestos al resto del codebase
export { invalidatePrefixCache } from "./shared.js";
export { classifyMessage } from "./classify.js";

// El object `db` mantiene el api legacy. Cada método delega a la función
// específica del repository correspondiente.
export const db = {
  // ── Leads ────────────────────────────────────────────────────────
  list: leads.list,
  count: leads.count,
  get: leads.get,
  findByPhone: leads.findByPhone,
  create: leads.create,
  update: leads.update,
  remove: leads.remove,
  delete: leads.remove,                        // alias legacy
  recordMessage: leads.recordMessage,

  // ── Interactions ─────────────────────────────────────────────────
  listInteractions: interactions.listInteractions,
  addInteraction: interactions.addInteraction,
  addInteractionsBulk: interactions.addInteractionsBulk,
  backfillActivity: interactions.backfillActivity,

  // ── Templates ────────────────────────────────────────────────────
  listTemplates: templates.listTemplates,
  getTemplate: templates.getTemplate,
  createTemplate: templates.createTemplate,
  updateTemplate: templates.updateTemplate,
  removeTemplate: templates.removeTemplate,

  // ── Embeddings + semantic search ─────────────────────────────────
  setTemplateEmbedding: embeddings.setTemplateEmbedding,
  getTemplatesNeedingEmbed: embeddings.getTemplatesNeedingEmbed,
  searchTemplatesSemantic: embeddings.searchTemplatesSemantic,
  setRuleEmbedding: embeddings.setRuleEmbedding,
  getRulesNeedingEmbed: embeddings.getRulesNeedingEmbed,
  searchRulesSemantic: embeddings.searchRulesSemantic,
  setInteractionEmbedding: embeddings.setInteractionEmbedding,
  searchInteractionsSemantic: embeddings.searchInteractionsSemantic,

  // ── Learned replies ──────────────────────────────────────────────
  createLearnedReply: learnedReplies.createLearnedReply,
  searchLearnedReplies: learnedReplies.searchLearnedReplies,
  incrementLearnedReplyHits: learnedReplies.incrementLearnedReplyHits,

  // ── Intent mining + mining-derived pairs ─────────────────────────
  getUnclassifiedInteractions: intentMining.getUnclassifiedInteractions,
  createMiningCandidate: intentMining.createMiningCandidate,
  listMiningCandidates: intentMining.listMiningCandidates,
  promoteMiningCandidate: intentMining.promoteMiningCandidate,
  rejectMiningCandidate: intentMining.rejectMiningCandidate,
  getInboundOutboundPairs: intentMining.getInboundOutboundPairs,

  // ── Sends ────────────────────────────────────────────────────────
  listSends: sends.listSends,
  createSend: sends.createSend,
  createSendsMulti: sends.createSendsMulti,
  updateSend: sends.updateSend,
  cancelSend: sends.cancelSend,
  pendingSends: sends.pendingSends,

  // ── Settings ─────────────────────────────────────────────────────
  getSetting: settings.getSetting,
  setSetting: settings.setSetting,

  // ── Stats ────────────────────────────────────────────────────────
  stats: stats.stats,

  // ── Users ────────────────────────────────────────────────────────
  listOperators: users.listOperators,
};
