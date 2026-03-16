// ═══════════════════════════════════════════════════════════════════════
// BACKGROUND ENTRY POINT
// Orden de importación: de menos dependencias a más dependencias
// ═══════════════════════════════════════════════════════════════════════

// 1. Bootstrap: constantes globales y storage session setup
import './background/bootstrap.js';

// 2. Clasificador de mensajes (sin dependencias)
import './background/classifier.js';

// 3. Adaptive scoring (sin dependencias de módulos propios)
import './background/adaptive-scoring.js';

// 4. API client (sin dependencias de módulos propios)
import './background/api-client.js';

// 5. Validation client (depende de api-client)
import './background/validation-client.js';

// 6. Gemini fallback (depende de classifier, adaptive-scoring, api-client)
import './background/gemini-fallback.js';

// 7. Message aggregator (depende de gemini-fallback)
import './background/message-aggregator.js';

// 8. Spam detector (depende de api-client) — inicia setIntervals
import './background/spam-detector.js';

// 9. Classification reporter (depende de api-client)
import './background/classification-reporter.js';

// 10. Received handler (depende de message-aggregator, gemini-fallback, api-client,
//     validation-client, classification-reporter)
import './background/received-handler.js';

// 11. Chat opened handler (depende de validation-client)
import './background/chat-opened-handler.js';

// 12. Classify handler (depende de validation-client, adaptive-scoring, classification-reporter)
import './background/classify-handler.js';

// 13. Audio catalog handlers (depende de api-client)
import './background/audio-catalog-handlers.js';

// 14. Sent handler (depende de api-client, spam-detector, gemini-fallback, received-handler)
import './background/sent-handler.js';

// 15. Blast handlers (depende de api-client)
import './background/blast-handlers.js';

// 16. WA Validator handlers — validación de números sin enviar mensajes
import './background/wa-validator-handlers.js';

// 17. Scorer bootstrap — precalienta el conversation-scorer con historial del backend.
//     Fire-and-forget: no bloquea el SW. Los handlers de mensajes ya están registrados.
//     Si el usuario no está logueado todavía, el bootstrap reintentará en el próximo SW wake-up.
import { bootstrapScorer } from './background/scorer-bootstrap.js';
bootstrapScorer();
