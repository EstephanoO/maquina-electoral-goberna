import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL not set. Copy .env.example to .env and fill it in, " +
    "or start the dev db with `npm run db:up`."
  );
}

export const sql = postgres(url, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
  onnotice: () => {}, // silence NOTICE spam
});
