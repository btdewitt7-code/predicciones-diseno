/**
 * Alias solo para mostrar. No cambia los nombres internos que usan
 * el modelo, ESPN ni el emparejamiento de equipos.
 */
const DISPLAY_ALIASES: Record<string, string> = {
  Internazionale: "Inter de Milán",
  "FC Internazionale Milano": "Inter de Milán",
  "Internazionale Milano": "Inter de Milán",
};

const KEYS = Object.keys(DISPLAY_ALIASES).sort((a, b) => b.length - a.length);

export function displayTeam(name: string): string {
  return DISPLAY_ALIASES[name] ?? name;
}

/** Reemplaza alias dentro de textos como "Internazionale vs Sporting CP". */
export function displayText(text: string): string {
  let out = text;
  for (const key of KEYS) {
    out = out.split(key).join(DISPLAY_ALIASES[key]);
  }
  return out;
}
