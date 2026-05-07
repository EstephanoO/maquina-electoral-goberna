import { Router, type Request } from "express";
import {
  comparePassword, createUser, findUserByEmail, requireAuth, signToken,
  type AuthedRequest,
} from "../auth.js";

export const authRouter = Router();

authRouter.post("/auth/register", async (req, res) => {
  const { email, password, name, phone } = req.body ?? {};
  if (!email || !password || !name) return res.status(400).json({ error: "email_password_name_required" });
  if (String(password).length < 6) return res.status(400).json({ error: "password_too_short" });
  const existing = await findUserByEmail(email);
  if (existing) return res.status(409).json({ error: "email_already_registered" });
  const user = await createUser({ email, password, name, phone });
  const token = signToken(user.id);
  res.status(201).json({ token, user });
});

authRouter.post("/auth/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: "email_password_required" });
  const u = await findUserByEmail(email);
  if (!u || u.disabled) return res.status(401).json({ error: "invalid_credentials" });
  const ok = await comparePassword(password, u.password_hash);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });
  const { password_hash: _ph, ...user } = u;
  res.json({ token: signToken(u.id), user });
});

authRouter.get("/auth/me", requireAuth, (req: AuthedRequest, res) => {
  res.json(req.user);
});
