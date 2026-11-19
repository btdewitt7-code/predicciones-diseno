import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/** Sirve las fotos de public/carousel sin tener que recompilar. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string[] }> },
) {
  const { file } = await params;
  const name = file.join("/");
  if (!name || name.includes("..") || name.startsWith("/")) {
    return new NextResponse("Ruta inválida", { status: 400 });
  }

  const full = path.join(process.cwd(), "public", "carousel", name);
  const type = TYPES[path.extname(full).toLowerCase()];
  if (!type) return new NextResponse("No encontrada", { status: 404 });

  try {
    const data = await fs.readFile(full);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new NextResponse("No encontrada", { status: 404 });
  }
}
