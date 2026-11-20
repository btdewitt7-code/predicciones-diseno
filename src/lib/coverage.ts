import { LEAGUE_BY_CODE } from "./leagues";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer";

type EspnEvent = {
  competitions?: {
    status?: { type?: { state?: string } };
  }[];
};

async function countDay(slug: string, date: string): Promise<number> {
  try {
    const res = await fetch(`${ESPN}/${slug}/scoreboard?dates=${date}`, {
      cache: "no-store",
      headers: { "User-Agent": "dogebets/1.0" },
    });
    if (!res.ok) return 0;
    const json = (await res.json()) as { events?: EspnEvent[] };
    return (json.events ?? []).filter((event) => {
      const state = event.competitions?.[0]?.status?.type?.state;
      return state === "pre" || state === "in";
    }).length;
  } catch {
    return 0;
  }
}

/** Partidos que ESPN tiene programados en los próximos días para una liga. */
export async function espnUpcoming(code: string, days = 14): Promise<number | null> {
  const league = LEAGUE_BY_CODE[code];
  if (!league?.espnSlug) return null;

  const dates: string[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    dates.push(
      new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10).replace(/-/g, ""),
    );
  }

  // De a 4 consultas en paralelo para no saturar ESPN.
  let total = 0;
  for (let index = 0; index < dates.length; index += 4) {
    const chunk = dates.slice(index, index + 4);
    const counts = await Promise.all(chunk.map((date) => countDay(league.espnSlug!, date)));
    total += counts.reduce((acc, value) => acc + value, 0);
  }
  return total;
}
