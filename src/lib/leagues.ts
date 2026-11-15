export type League = {
  code: string;
  name: string;
  country: string;
  tag: string;
  hasStats: boolean;
  /** 1 = primera división, 2 = segunda, 3 = tercera o inferior. */
  tier: number;
  /** Archivo de liga "extra" en football-data.co.uk (new/<archivo>.csv). */
  extraFile?: string;
  /** Temporada por año natural (MLS, Liga MX) en vez de agosto-mayo. */
  calendarSeason?: boolean;
  /** Slug de ESPN (resultados en vivo y fixtures de ligas sin CSV). */
  espnSlug?: string;
  /** Días de histórico a reconstruir desde ESPN (ligas sin CSV). */
  espnHistoryDays?: number;
  /** Copa sin modelo propio: se muestran partidos y stats, sin predicciones. */
  noModel?: boolean;
  /** Estadísticas incompletas: se omiten córners, remates y tiros al arco. */
  limitedStats?: boolean;
  /** Zona de la que vienen las horas del CSV (por defecto, Londres). */
  sourceTimeZone?: string;
};

/**
 * Orden = orden en la web: primero Europa (primeras, segundas e inferiores)
 * y al final las ligas americanas.
 */
export const LEAGUES: League[] = [
  // Europa · primeras divisiones
  { code: "E0", name: "Premier League", country: "Inglaterra", tag: "ENG", hasStats: true, tier: 1, espnSlug: "eng.1" },
  { code: "SP1", name: "LaLiga", country: "España", tag: "ESP", hasStats: true, tier: 1, espnSlug: "esp.1" },
  { code: "I1", name: "Serie A", country: "Italia", tag: "ITA", hasStats: true, tier: 1, espnSlug: "ita.1" },
  { code: "D1", name: "Bundesliga", country: "Alemania", tag: "GER", hasStats: true, tier: 1, espnSlug: "ger.1" },
  { code: "F1", name: "Ligue 1", country: "Francia", tag: "FRA", hasStats: true, tier: 1, espnSlug: "fra.1" },
  { code: "N1", name: "Eredivisie", country: "Países Bajos", tag: "NED", hasStats: true, tier: 1, espnSlug: "ned.1" },
  { code: "B1", name: "Jupiler Pro League", country: "Bélgica", tag: "BEL", hasStats: true, tier: 1, espnSlug: "bel.1" },
  { code: "P1", name: "Primeira Liga", country: "Portugal", tag: "POR", hasStats: true, tier: 1, espnSlug: "por.1" },
  { code: "T1", name: "Süper Lig", country: "Turquía", tag: "TUR", hasStats: true, tier: 1, espnSlug: "tur.1" },
  { code: "G1", name: "Super League", country: "Grecia", tag: "GRE", hasStats: true, tier: 1, espnSlug: "gre.1" },
  { code: "SC0", name: "Premiership", country: "Escocia", tag: "SCO", hasStats: true, tier: 1, espnSlug: "sco.1" },
  { code: "NOR", name: "Eliteserien", country: "Noruega", tag: "NOR", hasStats: true, tier: 1, calendarSeason: true, espnSlug: "nor.1", espnHistoryDays: 550 },
  {
    code: "DNK",
    name: "Superliga",
    country: "Dinamarca",
    tag: "DEN",
    hasStats: true,
    tier: 1,
    extraFile: "DNK",
    espnSlug: "den.1",
    sourceTimeZone: "Europe/London",
  },
  {
    code: "SWE",
    name: "Allsvenskan",
    country: "Suecia",
    tag: "SWE",
    hasStats: true,
    tier: 1,
    extraFile: "SWE",
    calendarSeason: true,
    espnSlug: "swe.1",
    sourceTimeZone: "Europe/London",
  },
  {
    code: "SWZ",
    name: "Super League",
    country: "Suiza",
    tag: "SUI",
    hasStats: true,
    tier: 1,
    extraFile: "SWZ",
    espnSlug: "sui.1",
    sourceTimeZone: "Europe/London",
  },
  {
    code: "AUT",
    name: "Bundesliga",
    country: "Austria",
    tag: "AUT",
    hasStats: true,
    tier: 1,
    extraFile: "AUT",
    espnSlug: "aut.1",
    sourceTimeZone: "Europe/London",
  },

  // Europa · segundas divisiones
  { code: "E1", name: "Championship", country: "Inglaterra", tag: "ENG", hasStats: true, tier: 2, espnSlug: "eng.2" },
  { code: "SC1", name: "Championship", country: "Escocia", tag: "SCO", hasStats: true, tier: 2, espnSlug: "sco.2" },
  { code: "D2", name: "2. Bundesliga", country: "Alemania", tag: "GER", hasStats: true, tier: 2, espnSlug: "ger.2" },
  { code: "I2", name: "Serie B", country: "Italia", tag: "ITA", hasStats: true, tier: 2, espnSlug: "ita.2" },
  { code: "SP2", name: "LaLiga 2", country: "España", tag: "ESP", hasStats: true, tier: 2, espnSlug: "esp.2" },
  { code: "F2", name: "Ligue 2", country: "Francia", tag: "FRA", hasStats: true, tier: 2, espnSlug: "fra.2" },

  // Europa · inferiores
  { code: "E2", name: "League One", country: "Inglaterra", tag: "ENG", hasStats: true, tier: 3, espnSlug: "eng.3" },
  { code: "E3", name: "League Two", country: "Inglaterra", tag: "ENG", hasStats: true, tier: 3, espnSlug: "eng.4" },
  { code: "EC", name: "National League", country: "Inglaterra", tag: "ENG", hasStats: true, tier: 3, espnSlug: "eng.5" },
  { code: "SC2", name: "League One", country: "Escocia", tag: "SCO", hasStats: true, tier: 3, espnSlug: "sco.3" },

  // Copas (sin modelo propio)
  { code: "UCL", name: "Champions League", country: "Europa", tag: "UCL", hasStats: true, tier: 1, espnSlug: "uefa.champions", espnHistoryDays: 730, noModel: true },
  { code: "UEL", name: "Europa League", country: "Europa", tag: "UEL", hasStats: true, tier: 1, espnSlug: "uefa.europa", espnHistoryDays: 730, noModel: true },
  { code: "UECL", name: "Conference League", country: "Europa", tag: "UECL", hasStats: true, tier: 2, espnSlug: "uefa.europa.conf", espnHistoryDays: 730, noModel: true },
  { code: "LIB", name: "Copa Libertadores", country: "Sudamérica", tag: "LIB", hasStats: true, tier: 1, espnSlug: "conmebol.libertadores", espnHistoryDays: 1400, noModel: true },
  { code: "SUD", name: "Copa Sudamericana", country: "Sudamérica", tag: "SUD", hasStats: true, tier: 2, espnSlug: "conmebol.sudamericana", espnHistoryDays: 1400, noModel: true },
  { code: "UEN", name: "UEFA Nations League", country: "Europa", tag: "UEN", hasStats: true, tier: 1, espnSlug: "uefa.nations", espnHistoryDays: 730, noModel: true },

  // América
  {
    code: "MLS",
    name: "Major League Soccer",
    country: "Estados Unidos",
    tag: "USA",
    hasStats: true,
    tier: 1,
    extraFile: "USA",
    calendarSeason: true,
    espnSlug: "usa.1",
    sourceTimeZone: "Europe/London",
  },
  {
    code: "MEX",
    name: "Liga MX",
    country: "México",
    tag: "MEX",
    hasStats: true,
    tier: 1,
    extraFile: "MEX",
    calendarSeason: true,
    espnSlug: "mex.1",
    sourceTimeZone: "Europe/London",
  },
  {
    code: "CHI",
    name: "Primera División",
    country: "Chile",
    tag: "CHI",
    hasStats: true,
    tier: 1,
    calendarSeason: true,
    espnSlug: "chi.1",
    espnHistoryDays: 550,
  },
  {
    code: "ECU",
    name: "LigaPro",
    country: "Ecuador",
    tag: "ECU",
    hasStats: true,
    tier: 1,
    calendarSeason: true,
    espnSlug: "ecu.1",
    espnHistoryDays: 550,
    limitedStats: true,
  },
  {
    code: "COL",
    name: "Primera A",
    country: "Colombia",
    tag: "COL",
    hasStats: true,
    tier: 1,
    calendarSeason: true,
    espnSlug: "col.1",
    espnHistoryDays: 550,
  },
  {
    code: "URU",
    name: "Primera División",
    country: "Uruguay",
    tag: "URU",
    hasStats: true,
    tier: 1,
    calendarSeason: true,
    espnSlug: "uru.1",
    espnHistoryDays: 550,
    limitedStats: true,
  },
  {
    code: "ARG",
    name: "Liga Profesional",
    country: "Argentina",
    tag: "ARG",
    hasStats: true,
    tier: 1,
    extraFile: "ARG",
    calendarSeason: true,
    espnSlug: "arg.1",
    sourceTimeZone: "Europe/London",
  },
  {
    code: "BRA",
    name: "Serie A",
    country: "Brasil",
    tag: "BRA",
    hasStats: true,
    tier: 1,
    extraFile: "BRA",
    calendarSeason: true,
    espnSlug: "bra.1",
    sourceTimeZone: "Europe/London",
  },
  {
    code: "PER",
    name: "Liga 1",
    country: "Perú",
    tag: "PER",
    hasStats: true,
    tier: 1,
    calendarSeason: true,
    espnSlug: "per.1",
    espnHistoryDays: 550,
  },
  {
    code: "BOL",
    name: "Liga Profesional",
    country: "Bolivia",
    tag: "BOL",
    hasStats: true,
    tier: 1,
    calendarSeason: true,
    espnSlug: "bol.1",
    espnHistoryDays: 550,
  },
  {
    code: "SAU",
    name: "Saudi Pro League",
    country: "Arabia Saudita",
    tag: "KSA",
    hasStats: true,
    tier: 1,
    espnSlug: "ksa.1",
    espnHistoryDays: 550,
  },
];

export const LEAGUE_BY_CODE: Record<string, League> = Object.fromEntries(
  LEAGUES.map((league) => [league.code, league]),
);

/** Copas: competiciones sin modelo propio (se muestran datos, sin predicción). */
export const CUP_CODES: string[] = LEAGUES.filter((league) => league.noModel).map(
  (league) => league.code,
);

/** Lista de copas lista para SQL: `'UCL', 'UEL', ...`. */
export const CUP_CODES_SQL = CUP_CODES.map((code) => `'${code}'`).join(", ");

export function isCupLeague(code: string): boolean {
  return CUP_CODES.includes(code);
}
