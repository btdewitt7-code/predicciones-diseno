import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";

export const SESSION_COOKIE = "pred_sesion";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: number;
  email: string;
  name: string | null;
  isAdmin: boolean;
};

export async function createSession(
  userId: number,
  expiresAt?: Date,
): Promise<string> {
  const db = getDb();
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expires = expiresAt ?? new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db.execute({
    sql: `INSERT INTO sessions (token, user_id, created_at, expires_at)
          VALUES (?,?,?,?)`,
    args: [token, userId, now.toISOString(), expires.toISOString()],
  });
  return token;
}

/** Acceso temporal de invitado: se corta solo cuando vence el token. */
function demoVencido(email: string): boolean {
  const demoEmail = process.env.DEMO_EMAIL;
  if (!demoEmail || email.toLowerCase() !== demoEmail.toLowerCase()) return false;
  const until = process.env.DEMO_UNTIL;
  if (!process.env.DEMO_TOKEN || !until) return true;
  const time = Date.parse(until);
  return !Number.isFinite(time) || Date.now() > time;
}

export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = getDb();
  const res = await db.execute({
    sql: `SELECT u.id, u.email, u.name, u.is_admin
          FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token = ? AND s.expires_at > ?`,
    args: [token, new Date().toISOString()],
  });
  const row = res.rows[0];
  if (!row) return null;
  const email = String(row.email);
  if (demoVencido(email)) return null;
  return {
    id: Number(row.id),
    email,
    name: row.name === null ? null : String(row.name),
    isAdmin: Number(row.is_admin) === 1,
  };
}

export async function destroySession(token: string): Promise<void> {
  const db = getDb();
  await db.execute({ sql: `DELETE FROM sessions WHERE token = ?`, args: [token] });
}

/** Limpia sesiones vencidas (se llama al iniciar sesión). */
export async function cleanExpiredSessions(): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `DELETE FROM sessions WHERE expires_at <= ?`,
    args: [new Date().toISOString()],
  });
}
