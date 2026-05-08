/**
 * Firebase Phone Auth wrapper.
 *
 * Auto-inits via @react-native-firebase/app reading GoogleService-Info.plist
 * (iOS) and google-services.json (Android) at native build time. No JS init
 * call needed.
 *
 * Flow:
 *   1. sendOtp(+51XXXXXXXXX) → SMS dispatched, returns ConfirmationResult
 *   2. confirmOtp(confirmation, "123456") → returns Firebase idToken
 *   3. POST /api/auth/firebase-verify with idToken → backend JWT cookie
 *   4. Firebase session is then dropped (signOut) — backend JWT is the
 *      source of truth, we don't keep two parallel sessions.
 */

import auth, { type FirebaseAuthTypes } from '@react-native-firebase/auth';

export type FirebaseConfirmation = FirebaseAuthTypes.ConfirmationResult;

export type SendOtpResult =
  | { ok: true; confirmation: FirebaseConfirmation }
  | { ok: false; error: string; code: string };

/**
 * Send SMS OTP to a phone number (E.164 format, e.g. +51987654321).
 * Returns a confirmation result that must be passed to confirmOtp() with
 * the user's 6-digit code.
 */
export async function sendOtp(phoneE164: string): Promise<SendOtpResult> {
  try {
    const confirmation = await auth().signInWithPhoneNumber(phoneE164);
    return { ok: true, confirmation };
  } catch (error) {
    const code = (error as { code?: string })?.code ?? 'unknown';
    const message = (error as { message?: string })?.message;
    return { ok: false, code, error: translateFirebaseError(code, message) };
  }
}

export type ConfirmOtpResult =
  | { ok: true; idToken: string }
  | { ok: false; error: string; code: string };

/**
 * Verify the SMS code. Returns a Firebase ID token to send to the backend.
 * Signs out of Firebase immediately afterwards — we don't keep the Firebase
 * session, only mint our backend JWT from the verified idToken.
 */
export async function confirmOtp(
  confirmation: FirebaseConfirmation,
  code: string,
): Promise<ConfirmOtpResult> {
  try {
    const credential = await confirmation.confirm(code);
    if (!credential?.user) {
      return { ok: false, code: 'no-user', error: 'No se pudo verificar el código.' };
    }
    const idToken = await credential.user.getIdToken();
    // Drop the Firebase session — backend JWT is the only auth state we keep.
    await auth().signOut().catch(() => {});
    return { ok: true, idToken };
  } catch (error) {
    const code = (error as { code?: string })?.code ?? 'unknown';
    const message = (error as { message?: string })?.message;
    return { ok: false, code, error: translateFirebaseError(code, message) };
  }
}

/**
 * Format a Peru phone number to E.164 (+51XXXXXXXXX).
 *
 * Accepts:
 *   - "987654321"     (9 digits starting with 9) → "+51987654321"
 *   - "51987654321"   (with country code, no +)  → "+51987654321"
 *   - "+51987654321"  (already E.164)            → returned as-is
 */
export function toE164PhonePeru(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('+')) return trimmed;
  const cleaned = trimmed.replace(/\s+/g, '');
  if (cleaned.length === 9 && cleaned.startsWith('9')) {
    return `+51${cleaned}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith('51')) {
    return `+${cleaned}`;
  }
  return `+${cleaned}`;
}

function translateFirebaseError(code: string, fallback?: string): string {
  switch (code) {
    case 'auth/invalid-phone-number':
      return 'Número inválido. Verificá los 9 dígitos.';
    case 'auth/missing-phone-number':
      return 'Falta el número de teléfono.';
    case 'auth/quota-exceeded':
      return 'Demasiados envíos por hoy. Intentá mañana.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Esperá unos minutos.';
    case 'auth/invalid-verification-code':
      return 'Código incorrecto. Revisá los 6 dígitos.';
    case 'auth/code-expired':
    case 'auth/session-expired':
      return 'El código expiró. Pedí uno nuevo.';
    case 'auth/network-request-failed':
      return 'Sin conexión. Verificá tu red.';
    case 'auth/captcha-check-failed':
      return 'No pudimos verificar tu dispositivo. Intentá de nuevo.';
    case 'auth/user-disabled':
      return 'Este número fue deshabilitado.';
    case 'auth/operation-not-allowed':
      return 'Login por SMS no habilitado. Contactá soporte.';
    default:
      return fallback ?? 'Error verificando el código. Intentá de nuevo.';
  }
}
