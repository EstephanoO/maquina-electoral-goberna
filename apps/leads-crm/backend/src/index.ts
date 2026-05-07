// Entrypoint del backend. La lógica vive en server.ts (boot + listen) y app.ts
// (express setup). Esta indirección permite tests/scripts importar `createApp`
// sin levantar el listener.
import "./server.js";
