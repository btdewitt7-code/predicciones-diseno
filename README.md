# Predicciones

App web personal de análisis pre-partido: probabilidades de **1X2, goles, BTTS, córners, remates y tiros al arco** para 25 ligas de Europa y América, calculadas con un modelo estadístico propio.

Incluye una página de **valor** que cruza el modelo con las cuotas de mercado y marca los partidos donde hay ventaja.

No es una casa de apuestas. No hay dinero, ni usuarios, ni apuestas. Solo datos y probabilidades.

## Requisitos

- Node.js 22 o superior (probado con 24.20)
- Windows, macOS o Linux

## Instalación

```bash
npm install
npm run setup     # descarga 3 temporadas, entrena y evalúa el modelo
npm run dev       # http://localhost:3000
```

`npm run setup` tarda unos 3-4 minutos porque descarga ~63 archivos CSV de football-data.co.uk.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en `localhost:3000` |
| `npm run build` | Compila para producción |
| `npm run start` | Sirve la versión compilada |
| `npm run setup` | Pipeline completo: descarga + entrena + backtest |
| `npm run refresh` | Solo próximos partidos + reentrenar (uso diario) |
| `npm run ingest` | Vuelve a descargar todo el histórico |
| `npm run train` | Recalcula fuerzas y predicciones |
| `npm run backtest` | Validación walk-forward sobre la temporada 25/26 |
| `npm run calibrate` | Tabla de calibración por rangos de probabilidad |
| `npx tsx scripts/tune-halflife.ts` | Compara vidas medias (peso de la forma reciente) |
| `npx tsx scripts/tune.ts` | Búsqueda de hiperparámetros (dispersión, rho) |

## Zona horaria

Las horas se guardan en UTC y se muestran en **America/Lima** por defecto. Para cambiarla:

```bash
set APP_TIMEZONE=America/Mexico_City
npm run dev
```

## Bajas (lesiones y sanciones)

Se obtienen de **API-Football** y aparecen en la ficha del partido. Necesita una key gratuita:

1. Crea una cuenta en <https://dashboard.api-football.com/register>
2. Copia tu **API Key** (no la Base URL)
3. Pégala en `.env.local`:

```bash
API_FOOTBALL_KEY=tu_key_aqui
```

Luego:

```bash
npm run injuries
```

⚠️ **Limitación del plan gratuito:** el endpoint `/injuries` solo permite fechas dentro de
una ventana de ~3 días (ayer, hoy y mañana). Para partidos más lejanos no hay datos. El plan
Pro ($19/mes) amplía el acceso.

`npm run refresh` incluye automáticamente la descarga de bajas.

## Actualización diaria (Windows)

Programador de tareas → Crear tarea básica → Diariamente:

```
Programa:   C:\Program Files\nodejs\npm.cmd
Argumentos: run refresh
Iniciar en: C:\Users\PC\Documents\predicciones
```

## Estructura

```
src/
  app/
    page.tsx              Lista de partidos con predicciones
    partido/[id]/page.tsx Ficha completa del partido
    valor/                Partidos con ventaja frente a la cuota
    ligas/                Promedios por liga y fuerzas por equipo
    modelo/               Métricas del backtest y explicación
  components/ui.tsx       Componentes visuales
  lib/
    model.ts              Modelo Dixon-Coles + binomial negativa
    value.ts              Cálculo de ventaja modelo vs. mercado
    csv.ts                Descarga y parseo de football-data.co.uk
    db.ts                 SQLite (libSQL) y esquema
    queries.ts            Consultas
scripts/
  ingest.ts               Descarga CSV históricos y fixtures
  train.ts                Calcula ratings y genera predicciones
  backtest.ts             Validación walk-forward mensual
  calibrate.ts            Diagnóstico de calibración
  tune.ts                 Búsqueda de hiperparámetros
```

## El modelo

1. **Dos lecturas por equipo**: fuerzas calculadas con goles y con tiros al arco (más estables), comparadas con la media de su liga.
2. **Ponderación temporal**: cada partido pesa la mitad cada 180 días.
3. **Goles esperados**: ataque local × defensa visitante × media de la liga, promediando las dos lecturas.
4. **Ajuste de totales**: los goles esperados se reescalan según la "temperatura" de los partidos de cada equipo.
5. **Binomial negativa + Dixon-Coles**: de la matriz de marcadores salen todos los mercados.
6. **Córners, remates y tiros al arco**: misma lógica de fuerzas con las medias específicas de cada estadística.
7. **Recién ascendidos**: si un equipo no estaba en la división la temporada anterior se marca con
   una etiqueta y su confianza baja un 40% (no hay historial para estimar su nivel real).

### Vida media: ¿cuánto pesa la temporada actual?

Se probaron 10 valores con backtest walk-forward sobre 11.301 partidos:

| Vida media | Acierto 1X2 | Brier 1X2 | Acierto O2.5 | Brier O2.5 |
|---|---|---|---|---|
| 60 días | 47.0% | 0.6282 | 52.7% | 0.2500 |
| 90 días | 47.4% | 0.6250 | 53.2% | 0.2495 |
| 120 días | 47.6% | 0.6235 | 53.5% | 0.2492 |
| **180 días** | **47.7%** | **0.6223** | **53.6%** | **0.2490** |
| 270 días | 47.5% | 0.6218 | 54.1% | 0.2489 |
| 365 días | 47.4% | 0.6217 | 54.1% | 0.2489 |

Conclusión: darle *más* peso a la temporada actual **empeora** el modelo. Con 3-4 meses de
temporada hay pocos partidos y el ruido pesa más que la señal. 180 días es el equilibrio; la
temporada actual ya cuenta más que la anterior por construcción.

## Resultados del backtest (temporada 25/26, walk-forward)

| Métrica | Modelo | Referencia |
|---|---|---|
| Acierto 1X2 | ~48.5% | 43.0% (solo local) · 51.0% (mercado) |
| Brier 1X2 | ~0.619 | 0.597 (mercado) |
| Acierto Over 2.5 | ~54.2% | — |
| Acierto BTTS | ~52.5% | — |

Comparativa de las dos lecturas del modelo (misma validación):

| Métrica base | Acierto 1X2 | Brier 1X2 |
|---|---|---|
| Solo goles | 47.7% | 0.6223 |
| Solo tiros al arco | 48.4% | 0.6200 |
| **Mezcla (goles + tiros)** | **48.5%** | **0.6186** |

**El mercado gana al modelo.** Es lo normal. La utilidad no está en adivinar más que las casas, sino en detectar cuotas mal puestas y mantener disciplina.

## Limitaciones

- Los equipos recién ascendidos empiezan con fuerza media (no tienen historial en la división).
  Se detectan automáticamente y se marcan con una etiqueta; su confianza baja un 40%.
- No conoce lesiones, alineaciones ni sanciones.
- Córners, remates, tarjetas y tiros al arco están completos en las 21 divisiones europeas.
  En Argentina, Brasil y Perú se cargaron desde ESPN para las últimas 2 temporadas (los partidos
  más antiguos pueden no tener estadísticas). MLS solo tiene goles y cuotas.
- MLS: los próximos partidos se obtienen de ESPN (API pública no oficial) porque
  football-data.co.uk no publica fixtures de ligas extra. Si ESPN falla, la liga sigue funcionando
  con su histórico.
- Las cuotas de `fixtures.csv` son medias de mercado, no de una casa concreta.

## Fuente de datos

[football-data.co.uk](https://www.football-data.co.uk/) — gratuita para uso privado. No redistribuir ni usar comercialmente.
