import { NextResponse } from "next/server";
import { spawn, type ChildProcess } from "node:child_process";
import { ensureSchemaOnce } from "@/lib/db";
import { currentUser } from "@/lib/session";

let child: ChildProcess | null = null;
let log: string[] = [];
let startedAt: string | null = null;
let finishedAt: string | null = null;
let exitCode: number | null = null;

export async function POST() {
  await ensureSchemaOnce();
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  }
  if (!user.isAdmin) {
    return NextResponse.json({ error: "Solo el administrador" }, { status: 403 });
  }

  if (child) {
    return NextResponse.json({ running: true, startedAt });
  }

  log = [];
  startedAt = new Date().toISOString();
  finishedAt = null;
  exitCode = null;

  const proc = spawn("npm", ["run", "refresh"], {
    cwd: process.cwd(),
    shell: true,
    env: process.env,
  });

  child = proc;

  const push = (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      const clean = line.trim();
      if (clean) log.push(clean);
    }
    if (log.length > 100) log = log.slice(-100);
  };

  proc.stdout?.on("data", push);
  proc.stderr?.on("data", push);

  proc.on("exit", (code) => {
    exitCode = code;
    finishedAt = new Date().toISOString();
    child = null;
  });

  return NextResponse.json({ running: true, startedAt });
}

export async function GET() {
  await ensureSchemaOnce();
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  }
  if (!user.isAdmin) {
    return NextResponse.json({ error: "Solo el administrador" }, { status: 403 });
  }

  return NextResponse.json({
    running: Boolean(child),
    startedAt,
    finishedAt,
    exitCode,
    log: log.slice(-10),
  });
}
