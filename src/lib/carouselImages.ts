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
    const full = path.join(dir, file);
    if (fs.existsSync(full)) {
      // La versión evita que el navegador muestre una foto vieja con el mismo nombre.
      const version = Math.round(fs.statSync(full).mtimeMs);
      return `/api/foto/${file}?v=${version}`;
    }
  }
  return null;
}

/**
 * Foto de fondo del carrusel. Prioridad:
 * 1. Partido exacto: `local-visitante.jpg`
 * 2. Equipo local: `local.jpg`
 * 3. Equipo visitante: `visitante.jpg`
 * 4. Liga: `liga-<código>.jpg`
 * 5. Sin imagen.
 */
export function carouselImage(
  homeTeam: string,
  awayTeam: string,
  leagueCode: string,
): string | null {
  return (
    findFile(`${imageSlug(homeTeam)}-${imageSlug(awayTeam)}`) ??
    findFile(imageSlug(homeTeam)) ??
    findFile(imageSlug(awayTeam)) ??
    findFile(`liga-${leagueCode.toLowerCase()}`) ??
    null
  );
}
