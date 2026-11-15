const STOP_TOKENS = new Set(["fc", "cf", "sc", "ac", "afc", "club", "de", "del", "the"]);

const ALIASES: Record<string, string> = {
  // Nombres ESPN -> nombres de nuestra base
  "internazionale": "inter",
  "ac milan": "milan",
  "as roma": "roma",
  "ss lazio": "lazio",
  "ssc napoli": "napoli",
  "juventus fc": "juventus",
  "fc internazionale milano": "inter",
  "manchester united": "man united",
  "manchester city": "man city",
  "athletic club": "ath bilbao",
  "nottingham forest": "nottm forest",
  "wolverhampton": "wolves",
  "wolverhampton wanderers": "wolves",
  "sporting cp": "sp lisbon",
  "sporting lisbon": "sp lisbon",
  "stade rennais": "rennes",
  "espanyol": "espanol",
  "deportivo": "la coruna",
  "fc cologne": "fc koln",
  "cologne": "koln",
  "fortuna sittard": "for sittard",
  "sint truiden": "st truiden",
  "sint truidense": "st truiden",
  "stvv": "st truiden",
  "oh leuven": "oud heverlee leuven",
  "sporting gijon": "sp gijon",
  "tottenham hotspur": "tottenham",
  "newcastle united": "newcastle",
  "brighton and hove albion": "brighton",
  "west ham united": "west ham",
  "lafc": "los angeles fc",
  "la galaxy": "los angeles galaxy",
  "red bull new york": "new york red bulls",
  "real betis": "betis",
  "real sociedad": "sociedad",
  "atletico madrid": "ath madrid",
  "athletic bilbao": "ath bilbao",
  "paris saint germain": "paris sg",
  "bayern munich": "bayern munich",
  "borussia dortmund": "dortmund",
  "borussia monchengladbach": "mgladbach",
  "bayer leverkusen": "leverkusen",
  "eintracht frankfurt": "ein frankfurt",
  "rb leipzig": "rb leipzig",

  // Argentina
  "estudiantes de la plata": "estudiantes lp",
  "instituto cordoba": "instituto",
  "belgrano cordoba": "belgrano",
  "central cordoba santiago del estero": "central cordoba",
  "atletico tucuman": "atl tucuman",
  "argentinos juniors": "argentinos jrs",
  "independiente rivadavia": "ind rivadavia",
  "gimnasia la plata": "gimnasia lp",
  "deportivo riestra": "dep riestra",

  // Brasil
  "red bull bragantino": "bragantino",
  "atletico mineiro": "atletico mg",
  "atletico goianiense": "atletico go",
  "athletico paranaense": "athletico pr",
  "vasco da gama": "vasco",
  chapecoense: "chapecoense sc",
  flamengo: "flamengo rj",
  botafogo: "botafogo rj",

  // Perú
  "adc juan pablo ii college": "juan pablo ii",
  "juan pablo ii college": "juan pablo ii",

  // México
  "atletico de san luis": "atl san luis",
  "atletico san luis": "atl san luis",
  "santos": "santos laguna",
  "guadalajara": "guadalajara chivas",
  "chivas": "guadalajara chivas",

  // Dinamarca
  "ac horsens": "horsens",
  "agf": "aarhus",
  "brondby if": "brondby",
  "fc kobenhavn": "fc copenhagen",
  "fc midtjylland": "midtjylland",
  "fc nordsjaelland": "nordsjaelland",
  "lyngby boldklub": "lyngby",
  "odense boldklub": "odense",
  "silkeborg if": "silkeborg",
  "sonderjyske fodbold": "sonderjyske",
  "viborg ff": "viborg",
  "vfb stuttgart": "stuttgart",
  "kaa gent": "gent",
  // Copas: nombres ESPN -> nombres de liga
  "aek athens": "aek",
  "olympiacos": "olympiakos",
  "as monaco": "monaco",
  "ajax amsterdam": "ajax",
  "feyenoord rotterdam": "feyenoord",
  "braga": "sp braga",
  "celta vigo": "celta",
  "rayo vallecano": "vallecano",
  "brighton hove albion": "brighton",
  "tsg hoffenheim": "hoffenheim",
  "racing genk": "genk",
  "union st gilloise": "st gilloise",
  "nec nijmegen": "nijmegen",
  "heart of midlothian": "hearts",
  "rb salzburg": "salzburg",
  "sk sturm graz": "sturm graz",
  "fc basel": "basel",
  "fc lugano": "lugano",
  "fc thun": "thun",
  "lausanne sports": "lausanne",
  "bk hacken": "hacken",
  "mjallby aif": "mjallby",
  // Suecia
  "kalmar ff": "kalmar",
  "ik sirius": "sirius",
  "halmstads bk": "halmstad",
  "hammarby if": "hammarby",
  "if elfsborg": "elfsborg",
  "degerfors if": "degerfors",
  "orgryte is": "orgryte",
  "ifk goteborg": "goteborg",
  "djurgardens if": "djurgarden",
  "if brommapojkarna": "brommapojkarna",
  "osters if": "oster",
  // Austria
  "rapid vienna": "sk rapid",
  "austria lustenau": "a lustenau",
  "sv josko ried": "ried",
  "lask linz": "lask",
  "tsv hartberg": "hartberg",
  "sc rheindorf altach": "altach",
  "wsg swarovski tirol": "tirol",
  "blau weiss linz": "bw linz",
  // Suiza
  "grasshopper zurich": "grasshoppers",
  "fc zurich": "zurich",
  "fc st gallen": "st gallen",
  "fc sion": "sion",
  "fc luzern": "luzern",
  "fc vaduz": "vaduz",
  "fc winterthur": "winterthur",
};

export function normalizeTeam(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/['.]/g, "")
    .replace(/-/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const aliased = ALIASES[base] ?? base;
  return aliased
    .split(" ")
    .map((token) => (token === "utd" ? "united" : token))
    .filter((token) => token && !STOP_TOKENS.has(token))
    .join(" ");
}

/** Similitud tolerante: exacta, prefijo ("inter"/"internazionale") o tokens. */
export function teamSimilarity(a: string, b: string): number {
  const x = normalizeTeam(a);
  const y = normalizeTeam(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.startsWith(y) || y.startsWith(x)) return 0.9;

  const setA = new Set(x.split(" "));
  const setB = new Set(y.split(" "));
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection++;
  if (intersection === 0) return 0;

  const union = new Set([...setA, ...setB]).size;
  const jaccard = intersection / union;
  const contained = intersection === Math.min(setA.size, setB.size) ? 0.85 : jaccard;
  return Math.max(jaccard, contained);
}

export function pickSide(teamName: string, homeTeam: string, awayTeam: string): "home" | "away" {
  return teamSimilarity(teamName, homeTeam) >= teamSimilarity(teamName, awayTeam) ? "home" : "away";
}
