import { existsSync, mkdirSync } from "node:fs";
import { extname } from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";

/**
 * Multer config para uploads de imágenes de templates. Persiste en
 * UPLOADS_DIR (default `/app/uploads`, montado como volume del container).
 * Filename: `<timestamp>_<uuid8>.<ext>` para evitar colisiones.
 *
 * Validación: solo content-type image/*, cap 10 MB. Lo público (sin auth) lo
 * sirve express.static — son flyer/temarios que el bot manda directo al lead.
 */

export const UPLOADS_DIR = process.env.UPLOADS_DIR || "/app/uploads";

if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

export const uploadMiddleware = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      const ext = (extname(file.originalname) || ".jpg").toLowerCase();
      cb(null, `${Date.now()}_${randomUUID().slice(0, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /^image\//.test(file.mimetype));
  },
});
