import fs from "node:fs";
import path from "node:path";
import { dateTimeLabel, pct } from "@/lib/format";

export const dynamic = "force-dynamic";

type LeagueRow = {
  code: string;
  name: string;
  country: string;
  matches: number;
  accuracy: number;
  brier: number;
  logLoss: number;
  over25Accuracy: number;
  over25Brier: number;
  bttsAccuracy: number;
  bttsBrier: number;
  marketAccuracy: number | null;
  marketBrier: number | null;
};

type Backtest = {
  generatedAt: string;
  method: string;
  warmupSeason: string;
  testSeason: string;
  overall: {
    matches: number;
    accuracy: number;
    brier: number;
    logLoss: number;
    over25Accuracy: number;
    over25Brier: number;
    bttsAccuracy: number;
    bttsBrier: number;
    homeRate: number;
    marketAccuracy: number | null;
    marketBrier: number | null;
  };
  leagues: LeagueRow[];
};

function loadBacktest(): Backtest | null {
  try {
    const file = path.join(process.cwd(), "data", "backtest.json");
    return JSON.parse(fs.readFileSync(file, "utf8")) as Backtest;
  } catch {
    return null;
  }
}

function Metric({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "warn";
}) {
  const color =
    tone === "good" ? "text-mint-400" : tone === "warn" ? "text-amber-400" : "text-white";
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 p-4">
      <div className="text-[10px] uppercase tracking-wide text-mist-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint ? <div className="mt-1 text-[10px] leading-relaxed text-mist-500">{hint}</div> : null}
    </div>
  );
}

export default async function ModelPage() {
  const data = loadBacktest();

  if (!data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-white">Modelo</h1>
        <div className="card p-5 text-sm text-mist-400">
          Todavía no hay backtest. Ejecuta{" "}
          <code className="rounded bg-ink-800 px-1.5 py-0.5 text-mint-400">npm run backtest</code>{" "}
          para entrenar con la temporada 24/25 y evaluar contra la 25/26.
        </div>
      </div>
    );
  }

  const { overall } = data;
  const beatsMarket =
    overall.marketBrier !== null ? overall.brier < overall.marketBrier : null;

  return (
    <div className="space-y-7">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          El modelo, sin humo
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-mist-400">
          Validación walk-forward sobre {overall.matches.toLocaleString("es-ES")} partidos de la
          temporada {data.testSeason.slice(0, 2)}/{data.testSeason.slice(2)}. Cada mes el modelo se
          reentrena solo con partidos anteriores y predice el mes siguiente: nunca ve el futuro.
        </p>
        <p className="text-xs text-mist-500">
          Última evaluación: {dateTimeLabel(data.generatedAt)}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Acierto 1X2"
          value={pct(overall.accuracy, 1)}
          hint="Elegir siempre el resultado más probable."
          tone={overall.accuracy > 0.5 ? "good" : "default"}
        />
        <Metric
          label="Brier 1X2"
          value={overall.brier.toFixed(4)}
          hint="Error cuadrático. Más bajo es mejor. 0.667 = azar."
        />
        <Metric
          label="Log-loss"
          value={overall.logLoss.toFixed(4)}
          hint="Penaliza la confianza mal puesta."
        />
        <Metric
          label="Acierto Over 2.5"
          value={pct(overall.over25Accuracy, 1)}
          hint="Umbral del 50% de probabilidad."
          tone={overall.over25Accuracy > 0.55 ? "good" : "default"}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Brier Over 2.5"
          value={overall.over25Brier.toFixed(4)}
          hint="Referencia: 0.25 es no saber nada."
        />
        <Metric
          label="Acierto BTTS"
          value={pct(overall.bttsAccuracy, 1)}
          hint="Ambos equipos marcan."
        />
        <Metric
          label="Brier BTTS"
          value={overall.bttsBrier.toFixed(4)}
          hint="Referencia: 0.25 es no saber nada."
        />
        <Metric
          label="Línea base: solo local"
          value={pct(overall.homeRate, 1)}
          hint="Apostar siempre al equipo de casa. Si el modelo no la supera, no sirve."
        />
        <Metric
          label="Mercado (cierre)"
          value={overall.marketAccuracy !== null ? pct(overall.marketAccuracy, 1) : "—"}
          hint={
            overall.marketBrier !== null
              ? `Brier del mercado: ${overall.marketBrier.toFixed(4)}`
              : "Sin cuotas suficientes"
          }
          tone={beatsMarket ? "warn" : "default"}
        />
      </section>

      {beatsMarket !== null ? (
        <div
          className={`rounded-xl border p-4 text-xs leading-relaxed ${
            beatsMarket
              ? "border-amber-400/30 bg-amber-400/5 text-amber-400"
              : "border-ink-700 bg-ink-850 text-mist-400"
          }`}
        >
          {beatsMarket ? (
            <>
              <strong className="font-semibold">El modelo supera al mercado en Brier.</strong> Antes de
              emocionarte: en una sola temporada puede ser suerte. Solo se confirma con varias
              temporadas y midiendo el valor de la línea de cierre (CLV).
            </>
          ) : (
            <>
              <strong className="font-semibold text-mist-300">El mercado gana al modelo.</strong> Es lo
              normal y esperado. El valor de esta herramienta no es adivinar más que las casas, sino
              detectar cuándo una cuota concreta está mal puesta y mantener disciplina.
            </>
          )}
        </div>
      ) : null}

      <section className="card overflow-hidden">
        <div className="hidden grid-cols-[1.5fr_repeat(5,0.7fr)] gap-2 border-b border-ink-800 px-4 py-2.5 text-[10px] uppercase tracking-wide text-mist-500 sm:grid">
          <span>Liga</span>
          <span className="text-right">Partidos</span>
          <span className="text-right">Acierto</span>
          <span className="text-right">Brier</span>
          <span className="text-right">O2.5</span>
          <span className="text-right">BTTS</span>
        </div>
        {data.leagues.map((league) => (
          <div
            key={league.code}
            className="grid grid-cols-2 gap-2 border-b border-ink-800/60 px-4 py-2.5 text-xs last:border-0 sm:grid-cols-[1.5fr_repeat(5,0.7fr)]"
          >
            <span className="col-span-2 font-medium text-mist-300 sm:col-span-1">
              {league.name} <span className="text-mist-500">· {league.country}</span>
            </span>
            <span className="text-right tabular-nums text-mist-400">
              {league.matches.toLocaleString("es-ES")}
            </span>
            <span className="text-right tabular-nums text-white">{pct(league.accuracy, 1)}</span>
            <span className="text-right tabular-nums text-mist-400">{league.brier.toFixed(4)}</span>
            <span className="text-right tabular-nums text-mist-400">{pct(league.over25Accuracy, 1)}</span>
            <span className="text-right tabular-nums text-mist-400">{pct(league.bttsAccuracy, 1)}</span>
          </div>
        ))}
      </section>

      <section className="card space-y-3 p-5 text-sm leading-relaxed text-mist-400">
        <h2 className="text-sm font-semibold text-white">Cómo se calcula</h2>
        <ol className="list-decimal space-y-2 pl-5 text-xs">
          <li>
            <span className="text-mist-300">Dos lecturas por equipo.</span> Se calculan fuerzas con
            goles y también con tiros al arco (más estables que el gol). El modelo promedia las dos
            probabilidades: acierta más que cualquiera por separado.
          </li>
          <li>
            <span className="text-mist-300">Ponderación temporal.</span> Cada partido pesa la mitad
            cada 180 días: la forma reciente manda más que lo de hace dos años.
          </li>
          <li>
            <span className="text-mist-300">Goles esperados.</span> Ataque del local × defensa del
            visitante × media de la liga, da los goles esperados de cada lado.
          </li>
          <li>
            <span className="text-mist-300">Binomial negativa con ajuste Dixon-Coles.</span> De la
            matriz de marcadores salen 1X2, over/under, BTTS y marcador exacto. La binomial negativa
            engorda las colas y evita la sobreconfianza del Poisson puro.
          </li>
          <li>
            <span className="text-mist-300">Ajuste de totales.</span> Los goles esperados se
            reescalan según cuántos goles suelen haber en los partidos de cada equipo, que es más
            estable que la calidad ofensiva aislada.
          </li>
          <li>
            <span className="text-mist-300">Forma reciente (solo informativa).</span> Se muestra en la
            ficha, pero no entra en el cálculo: al probarla en 11.301 partidos mejoraba el 1X2 en 0.1
            puntos (ruido) y empeoraba BTTS.
          </li>
          <li>
            <span className="text-mist-300">Córners, remates, tiros al arco y tarjetas.</span> Misma
            lógica de fuerzas con las medias específicas de cada estadística (incluye rojas en el
            conteo de tarjetas).
          </li>
        </ol>
        <p className="text-[11px] text-mist-500">
          Los equipos nuevos en la liga empiezan con fuerza media y se marcan con una etiqueta: su
          confianza baja un 40% porque no hay historial en la división. El modelo tampoco conoce
          lesiones ni alineaciones.
        </p>
      </section>
    </div>
  );
}
