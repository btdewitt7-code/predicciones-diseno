import fs from "node:fs";
import path from "node:path";

const EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const MAX_VARIANTS = 5;
const DIR = path.join(process.cwd(), "public", "carousel");

/**
 * Equipos que se llaman igual en ligas distintas y no deben compartir foto.
 * Clave: código de liga → nombre normalizado del equipo → nombre del archivo.
 * Ej.: el Liverpool uruguayo usa `liverpool-montevideo.*` y no el del Premier.
 */
const TEAM_ALIASES: Record<string, Record<string, string>> = {
  uru: {
    liverpool: "liverpool-montevideo",
    "montevideo-wanderers": "wanderers",
  },
};

/** Convierte "São Paulo" en "sao-paulo" para usarlo como nombre de archivo. */
export function imageSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Nombre de archivo de un equipo. Aplica alias por liga para los homónimos
 * (por ejemplo, Liverpool inglés vs. Liverpool uruguayo).
 */
export function teamImageSlug(value: string, leagueCode?: string): string {
  const base = imageSlug(value);
  const alias = leagueCode
    ? TEAM_ALIASES[leagueCode.toLowerCase()]?.[base]
    : undefined;
  return alias ?? base;
}

/**
 * Todas las variantes de un nombre: `base.jpg`, `base-2.jpg`, `base-3.jpg`…
 * Así un equipo puede tener varias fotos y se elige una al azar.
 */
function findFiles(baseName: string): string[] {
  const files: string[] = [];
  for (const extension of EXTENSIONS) {
    const first = `${baseName}${extension}`;
    if (fs.existsSync(path.join(DIR, first))) files.push(first);
    for (let index = 2; index <= MAX_VARIANTS; index += 1) {
      const variant = `${baseName}-${index}${extension}`;
      if (fs.existsSync(path.join(DIR, variant))) files.push(variant);
    }
  }
  return files;
}

function pick(files: string[]): string | null {
  if (files.length === 0) return null;
  const file = files[Math.floor(Math.random() * files.length)];
  const version = Math.round(fs.statSync(path.join(DIR, file)).mtimeMs);
  return `/api/foto/${file}?v=${version}`;
}

/**
 * Foto de fondo del carrusel. Prioridad:
 * 1. Partido exacto: `local-visitante.jpg`
 * 2. Equipo local: `local.jpg`
 * 3. Equipo visitante: `visitante.jpg`
 * 4. Liga: `liga-<código>.jpg`
 * 5. Sin imagen.
 *
 * Si hay varias variantes (`...-2.jpg`), se elige una al azar.
 */
export function carouselImage(
  homeTeam: string,
  awayTeam: string,
  leagueCode: string,
): string | null {
  const home = teamImageSlug(homeTeam, leagueCode);
  const away = teamImageSlug(awayTeam, leagueCode);
  return (
    pick(findFiles(`${home}-${away}`)) ??
    pick(findFiles(home)) ??
    pick(findFiles(away)) ??
    pick(findFiles(`liga-${leagueCode.toLowerCase()}`)) ??
    null
  );
}
