import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getDb } from "./db";

export const SESSION_COOKIE = "pred_sesion";
export const DEMO_COOKIE = "pred_demo";
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

/** El token de invitado está activo: coincide y no venció. */
export function demoTokenValid(token: string | null | undefined): boolean {
  const expected = process.env.DEMO_TOKEN;
  const until = process.env.DEMO_UNTIL;
  if (!expected || !until || !token || token !== expected) return false;
  const time = Date.parse(until);
  return Number.isFinite(time) && Date.now() <= time;
}

/** Acceso de invitado por cookie, encabezado o `?acceso=` (lo inyecta el proxy). */
async function demoUser(): Promise<SessionUser | null> {
  if (!demoTokenValid(process.env.DEMO_TOKEN ?? null)) return null;

  const store = await cookies();
  const headerList = await headers();
  const fromCookie = store.get(DEMO_COOKIE)?.value;
  const fromHeader = headerList.get("x-demo-token");
  const ok = fromCookie === process.env.DEMO_TOKEN || fromHeader === process.env.DEMO_TOKEN;
  if (!ok) return null;

  const email = process.env.DEMO_EMAIL ?? "invitado@dogebets.win";
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT id, name FROM users WHERE email = ?`,
    args: [email],
  });

  let id: number;
  let name = "Invitado IA";
  if (res.rows.length > 0) {
    id = Number(res.rows[0].id);
    if (res.rows[0].name !== null) name = String(res.rows[0].name);
    await db.execute({ sql: `UPDATE users SET is_admin = 0 WHERE id = ?`, args: [id] });
  } else {
    const inserted = await db.execute({
      sql: `INSERT INTO users (email, name, password_hash, is_admin, created_at)
            VALUES (?,?,?,?,?)`,
      args: [email, name, randomBytes(32).toString("hex"), 0, new Date().toISOString()],
    });
    id = Number(inserted.lastInsertRowid);
  }

  return { id, email, name, isAdmin: false };
}

/** Acceso temporal de invitado: se corta solo cuando vence el token. */
function demoVencido(email: string): boolean {
  const demoEmail = process.env.DEMO_EMAIL;
  if (!demoEmail || email.toLowerCase() !== demoEmail.toLowerCase()) return false;
  return !demoTokenValid(process.env.DEMO_TOKEN ?? null);
}

export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return demoUser();

  const db = getDb();
  const res = await db.execute({
    sql: `SELECT u.id, u.email, u.name, u.is_admin
          FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token = ? AND s.expires_at > ?`,
    args: [token, new Date().toISOString()],
  });
  const row = res.rows[0];
  if (!row) return demoUser();
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
