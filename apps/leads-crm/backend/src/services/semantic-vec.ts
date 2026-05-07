/**
 * Operaciones sobre vectores en JS — usadas por el intent mining (clustering
 * greedy de inbounds sin matchear). Para sets grandes preferimos pgvector
 * server-side; este módulo solo cubre lo que necesita correr en Node.
 */

/** Cosine similarity entre dos vectores number[]. Retorna 0 si alguno es zero-vec. */
export function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** Promedio de vectores (centroid del cluster). Asume todos misma dimensión. */
export function vecMean(vecs: number[][]): number[] {
  const dims = vecs[0].length;
  const out = new Array(dims).fill(0);
  for (const v of vecs) for (let i = 0; i < dims; i++) out[i] += v[i];
  for (let i = 0; i < dims; i++) out[i] /= vecs.length;
  return out;
}

/** Parse el formato pgvector text '[0.1,0.2,...]' a number[]. */
export function parsePgVector(s: string): number[] {
  return s.replace(/^\[|\]$/g, "").split(",").map(Number);
}
