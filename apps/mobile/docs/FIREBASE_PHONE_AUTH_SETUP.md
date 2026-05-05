# Firebase Phone Auth — Setup

Estado: **scaffold listo, sin enchufar al login** (Paquete 1, mayo 2026).

El backend ya valida ID tokens de Firebase en `POST /api/auth/firebase-verify`.
Lo que falta para encender el flujo en mobile son los pasos manuales abajo.

---

## 1. Firebase Console

1. Crear (o reusar) project Firebase: `goberna-electoral` o el que prefieras.
2. **Authentication → Sign-in method → Phone**: enable.
3. **Authentication → Settings → SMS regions**: agregar `+51` (Perú). Asegurate de
   que el quota mensual sea suficiente (10k SMS gratis en el free tier global).
4. **Project Settings → General → Your apps**:
   - Add iOS app: bundle ID `com.estephano.gobernaterritory02`. Descargar `GoogleService-Info.plist`.
   - Add Android app: package `com.estephano.gobernaterritory02`. Descargar `google-services.json`.
   - Subir el SHA-1 del keystore de release (lo da `eas credentials`).

## 2. Backend env vars

Setear en el `.env` del backend (prod en server):

```
FIREBASE_PROJECT_ID=<el project id de Firebase, ej: goberna-electoral>
```

Sin esto, el endpoint `/api/auth/firebase-verify` responde 503.

## 3. Mobile deps

Cuando vayan a encender el flujo:

```bash
cd apps/mobile
bunx expo install @react-native-firebase/app @react-native-firebase/auth
```

Editar `app.json` para agregar el config plugin:

```jsonc
{
  "expo": {
    "plugins": [
      "@react-native-firebase/app",
      "@react-native-firebase/auth",
      // ...resto
    ]
  }
}
```

Copiar los archivos de credenciales:

- `apps/mobile/GoogleService-Info.plist` (iOS)
- `apps/mobile/google-services.json` (Android)

(no commitearlos — agregar a `.gitignore` si todavía no están).

Luego rebuild de EAS:

```bash
eas build --platform ios --profile production
eas build --platform android --profile production
```

## 4. Flujo de login mobile (cuando se enchufa)

```ts
import auth, { FirebaseAuthTypes } from "@react-native-firebase/auth";

// 1. Pedir SMS al número del usuario
const confirmation = await auth().signInWithPhoneNumber("+51986394450");

// 2. Usuario tipea el código de 6 dígitos
const userCred = await confirmation.confirm("123456");

// 3. Sacar el ID token y mandarlo a nuestro backend
const idToken = await userCred.user.getIdToken();
const res = await fetch(`${API_BASE}/auth/firebase-verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id_token: idToken }),
});
const data = await res.json();
// data.matched_user existe si el phone ya está en users
// data.firebase.phone_number siempre viene si el flow fue OTP de Phone
```

## 5. Conectar al login real

Pendiente para Paquete 2. La idea:

- Si `matched_user` existe → emitir nuestros access/refresh tokens del JWT propio,
  setear cookies como hace `loginWithUser` actualmente.
- Si no existe → flow de "completar registro" (pedir nombre + access code).

Por ahora `firebase-verify` es read-only: confirma que el SMS llegó al usuario
correcto y que tiene control del número. El paso de "convertir esto en sesión"
se agrega cuando el flow OTP esté estable.

---

## Notas

- Quota free tier: 10k verifs/mes globalmente, sobra para el piloto.
- Costos: si pasamos los 10k, `$0.06` USD por SMS adicional (Perú está en la
  región intermedia, varía).
- La verificación backend usa `jose` directo contra el JWKS público de Google,
  no `firebase-admin`. Eso evita la dependencia gigante (5MB+) y mantiene el
  bundle del backend liviano.
