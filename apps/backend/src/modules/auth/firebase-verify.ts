/**
 * Firebase Phone Auth — verificador de ID tokens.
 *
 * Recibe un ID token emitido por Firebase Auth desde mobile (después del flujo
 * SMS OTP de @react-native-firebase/auth) y lo valida contra los certificados
 * públicos de Google. Si el token es válido, devuelve el `phone_number` y `uid`
 * del usuario verificado.
 *
 * No depende de firebase-admin — usa `jose` (ya en uso por el resto del backend)
 * + el JWKS de securetoken.system.gserviceaccount.com. Esto evita meter la
 * dependencia gigante de firebase-admin para una sola operación.
 *
 * Validaciones requeridas (según docs Firebase):
 *   - Algorithm: RS256
 *   - audience  = projectId
 *   - issuer    = `https://securetoken.google.com/${projectId}`
 *   - exp       en el futuro
 *   - iat       en el pasado
 *   - sub       no vacío (es el uid)
 *   - auth_time en el pasado
 */

import { createRemoteJWKSet, jwtVerify } from "jose";

// JWKS endpoint público de Google. createRemoteJWKSet cachea + rota llaves.
const FIREBASE_JWKS_URL = new URL(
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
);

// Lazy + module-scoped: una sola instancia para toda la vida del proceso.
const firebaseJWKS = createRemoteJWKSet(FIREBASE_JWKS_URL, {
  // Cooldown corto entre fetches del JWKS para no martillar Google si llegan
  // muchas requests con tokens cuyo kid todavía no rotó.
  cooldownDuration: 30_000,
});

export type FirebaseVerifiedUser = {
  uid: string;
  phone_number: string | null;
  email: string | null;
  email_verified: boolean;
  auth_time: number;
};

/**
 * Verifica el ID token contra Firebase. Lanza si el token es inválido.
 * No persiste nada — el caller decide qué hacer con el usuario verificado
 * (matchear contra users por phone, crear cuenta, etc.).
 */
export async function verifyFirebaseIdToken(
  idToken: string,
  projectId: string,
): Promise<FirebaseVerifiedUser> {
  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID no configurado");
  }

  const { payload } = await jwtVerify(idToken, firebaseJWKS, {
    algorithms: ["RS256"],
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });

  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("token inválido: sub vacío");
  }

  // Firebase mete los claims user-facing en `firebase.identities` para SMS:
  // { firebase: { identities: { phone: ["+51..."] }, sign_in_provider: "phone" } }
  const fb = (payload.firebase ?? {}) as {
    identities?: { phone?: string[]; email?: string[] };
    sign_in_provider?: string;
  };

  const phoneFromIdentities = fb.identities?.phone?.[0] ?? null;
  // Algunos flows también ponen phone_number top-level.
  const phoneTopLevel = typeof payload.phone_number === "string" ? payload.phone_number : null;

  return {
    uid: payload.sub,
    phone_number: phoneFromIdentities ?? phoneTopLevel,
    email: typeof payload.email === "string" ? payload.email : null,
    email_verified: payload.email_verified === true,
    auth_time: typeof payload.auth_time === "number" ? payload.auth_time : 0,
  };
}
