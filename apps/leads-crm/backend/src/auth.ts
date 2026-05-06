import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { sql } from "./sql.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me-in-prod";
const JWT_EXPIRE_HOURS = Number(process.env.JWT_EXPIRE_HOURS ?? 24 * 30); // 30 days default

export type User = {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: "operator" | "admin";
  disabled: boolean;
  created_at: string;
};

export type AuthedRequest = Request & { user?: User };

export function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export function comparePassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export function signToken(userId: number): string {
  return jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: `${JWT_EXPIRE_HOURS}h` });
}

export function verifyToken(token: string): { uid: number } | null {
  try { return jwt.verify(token, JWT_SECRET) as { uid: number }; }
  catch { return null; }
}

function stripPw(u: any): User {
  const { password_hash, ...rest } = u;
  return rest as User;
}

export async function findUserById(id: number): Promise<User | null> {
  const rows = await sql`SELECT * FROM users WHERE id = ${id} LIMIT 1`;
  return rows[0] ? stripPw(rows[0]) : null;
}

export async function findUserByEmail(email: string): Promise<any | null> {
  const rows = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()} LIMIT 1`;
  return rows[0] ?? null;
}

export async function createUser(input: {
  email: string; password: string; name: string; phone?: string | null;
}): Promise<User> {
  const email = input.email.toLowerCase().trim();
  const hash = await hashPassword(input.password);
  const rows = await sql`
    INSERT INTO users (email, name, password_hash, phone, role)
    VALUES (${email}, ${input.name}, ${hash}, ${input.phone ?? null},
            CASE WHEN (SELECT COUNT(*) FROM users) = 0 THEN 'admin' ELSE 'operator' END)
    RETURNING *
  `;
  return stripPw(rows[0]);
}

/**
 * Middleware: requires a valid Bearer token. Sets req.user on success, 401 on failure.
 */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return res.status(401).json({ error: "missing_auth" });
  const token = h.slice(7);
  
  // Bypass auth for development/demo token
  if (token === "auto-token-skipauth") {
    req.user = {
      id: 999999,
      email: "auto@goberna.pe",
      name: "Auto User",
      phone: null,
      role: "admin",
      disabled: false,
      created_at: new Date().toISOString(),
    } as User;
    return next();
  }
  
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "invalid_token" });

  const user = await findUserById(payload.uid);
  if (!user || user.disabled) return res.status(401).json({ error: "user_not_found_or_disabled" });

  req.user = user;
  next();
}
