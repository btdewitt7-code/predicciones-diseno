import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb } from "./db";

export type UserRow = {
  id: number;
  email: string;
  name: string | null;
  isAdmin: boolean;
  createdAt: string;
};

/** Contraseña cifrada con scrypt (incluido en Node, sin dependencias). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  try {
    const test = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    if (test.length !== expected.length) return false;
    return timingSafeEqual(test, expected);
  } catch {
    return false;
  }
}

export async function countUsers(): Promise<number> {
  const db = getDb();
  const res = await db.execute("SELECT COUNT(*) AS n FROM users");
  return Number(res.rows[0]?.n ?? 0);
}

export async function findUserByEmail(email: string): Promise<
  | (UserRow & { passwordHash: string })
  | null
> {
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT id, email, name, password_hash, is_admin, created_at
          FROM users WHERE lower(email) = lower(?) LIMIT 1`,
    args: [email.trim()],
  });
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    email: String(row.email),
    name: row.name === null ? null : String(row.name),
    passwordHash: String(row.password_hash),
    isAdmin: Number(row.is_admin) === 1,
    createdAt: String(row.created_at),
  };
}

export async function createUser(options: {
  email: string;
  name?: string | null;
  password: string;
  isAdmin?: boolean;
}): Promise<number> {
  const db = getDb();
  const res = await db.execute({
    sql: `INSERT INTO users (email, name, password_hash, is_admin, created_at)
          VALUES (?,?,?,?,?)`,
    args: [
      options.email.trim(),
      options.name?.trim() || null,
      hashPassword(options.password),
      options.isAdmin ? 1 : 0,
      new Date().toISOString(),
    ],
  });
  return Number(res.lastInsertRowid ?? 0);
}

export async function listUsers(): Promise<UserRow[]> {
  const db = getDb();
  const res = await db.execute(
    `SELECT id, email, name, is_admin, created_at FROM users ORDER BY id`,
  );
  return res.rows.map((row) => ({
    id: Number(row.id),
    email: String(row.email),
    name: row.name === null ? null : String(row.name),
    isAdmin: Number(row.is_admin) === 1,
    createdAt: String(row.created_at),
  }));
}

export type UserWithStats = UserRow & { plays: number };

export async function listUsersWithStats(): Promise<UserWithStats[]> {
  const db = getDb();
  const res = await db.execute(
    `SELECT u.id, u.email, u.name, u.is_admin, u.created_at,
            (SELECT COUNT(*) FROM saved_combos s WHERE s.user_id = u.id) AS plays
     FROM users u
     ORDER BY u.id`,
  );
  return res.rows.map((row) => ({
    id: Number(row.id),
    email: String(row.email),
    name: row.name === null ? null : String(row.name),
    isAdmin: Number(row.is_admin) === 1,
    createdAt: String(row.created_at),
    plays: Number(row.plays ?? 0),
  }));
}

export async function getUserById(id: number): Promise<UserRow | null> {
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT id, email, name, is_admin, created_at FROM users WHERE id = ? LIMIT 1`,
    args: [id],
  });
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    email: String(row.email),
    name: row.name === null ? null : String(row.name),
    isAdmin: Number(row.is_admin) === 1,
    createdAt: String(row.created_at),
  };
}

export async function countAdmins(): Promise<number> {
  const db = getDb();
  const res = await db.execute("SELECT COUNT(*) AS n FROM users WHERE is_admin = 1");
  return Number(res.rows[0]?.n ?? 0);
}

export async function updateUser(
  id: number,
  fields: {
    email?: string;
    name?: string | null;
    isAdmin?: boolean;
    password?: string;
  },
): Promise<void> {
  const db = getDb();
  const sets: string[] = [];
  const args: (string | number | null)[] = [];

  if (fields.email !== undefined) {
    sets.push("email = ?");
    args.push(fields.email.trim());
  }
  if (fields.name !== undefined) {
    sets.push("name = ?");
    args.push(fields.name?.trim() || null);
  }
  if (fields.isAdmin !== undefined) {
    sets.push("is_admin = ?");
    args.push(fields.isAdmin ? 1 : 0);
  }
  if (fields.password) {
    sets.push("password_hash = ?");
    args.push(hashPassword(fields.password));
  }
  if (sets.length === 0) return;

  args.push(id);
  await db.execute({
    sql: `UPDATE users SET ${sets.join(", ")} WHERE id = ?`,
    args,
  });
}

/** Borra el usuario, sus sesiones y sus jugadas guardadas. */
export async function deleteUser(id: number): Promise<void> {
  const db = getDb();
  await db.batch(
    [
      { sql: "DELETE FROM sessions WHERE user_id = ?", args: [id] },
      { sql: "DELETE FROM saved_combos WHERE user_id = ?", args: [id] },
      { sql: "DELETE FROM users WHERE id = ?", args: [id] },
    ],
    "write",
  );
}

export async function setUserPassword(
  email: string,
  password: string,
): Promise<boolean> {
  const db = getDb();
  const res = await db.execute({
    sql: `UPDATE users SET password_hash = ? WHERE lower(email) = lower(?)`,
    args: [hashPassword(password), email.trim()],
  });
  return res.rowsAffected > 0;
}

/** Las jugadas guardadas antes de existir usuarios pasan al primer admin. */
export async function assignLegacyCombos(userId: number): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `UPDATE saved_combos SET user_id = ? WHERE user_id IS NULL`,
    args: [userId],
  });
}
