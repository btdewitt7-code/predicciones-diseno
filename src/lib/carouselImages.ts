import fs from "node:fs";
import path from "node:path";

const EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

/** Convierte "São Paulo" en "sao-paulo" para usarlo como nombre de archivo. */
export function imageSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function findFile(baseName: string): string | null {
  const dir = path.join(process.cwd(), "public", "carousel");
  for (const extension of EXTENSIONS) {
    const file = `${baseName}${extension}`;
    if (fs.existsSync(path.join(dir, file))) return `/api/foto/${file}`;
  }
  return null;
}

/**
 * Foto de fondo del carrusel. Prioridad:
 * 1. Partido exacto: `local-visitante.jpg`
 * 2. Liga: `liga-<código>.jpg`
 * 3. Sin imagen.
 */
export function carouselImage(
  homeTeam: string,
  awayTeam: string,
  leagueCode: string,
): string | null {
  return (
    findFile(`${imageSlug(homeTeam)}-${imageSlug(awayTeam)}`) ??
    findFile(`liga-${leagueCode.toLowerCase()}`) ??
    null
  );
}
