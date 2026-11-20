# Fotos del carrusel

Las tarjetas usan una foto de fondo si existe el archivo. Prioridad:

1. **Partido exacto**: `local-visitante.ext`
2. **Equipo local**: `local.ext`
3. **Equipo visitante**: `visitante.ext`
4. **Liga**: `liga-<código>.ext`
5. Sin foto: la tarjeta queda con el diseño normal.

Así una foto guardada por equipo se reutiliza en todos sus partidos hasta que
haya una específica del encuentro.

Los nombres se arman sin acentos, en minúsculas y con guiones:
`São Paulo vs Fluminense` → `sao-paulo-fluminense.jpg`.

## Descarga automática (recomendado)

```bash
npm run fotos -- --auto 20
```

Busca **fotos de los equipos** (fanart / banner, 1280×720) en TheSportsDB para los
partidos de **hoy y mañana**, y las guarda una sola vez. Si el archivo ya existe, no
lo vuelve a bajar.

- `--force` para volver a bajarlas todas.
- TheSportsDB tiene límite de peticiones: si responde **429**, espera unos minutos y
  vuelve a ejecutar. Las que ya bajaste se conservan.

Se puede definir una clave propia en `.env.local`:

```
SPORTSDB_KEY=tu_clave
```

## Modo lista (para los que no tienen foto)

```bash
npm run fotos -- --listar
```

Genera/actualiza `fuentes.json` con los partidos de hoy y mañana así:

```json
[
  { "home": "Aarhus", "away": "Lyngby", "buscar": "Aarhus Lyngby festejo jugadores", "url": "" }
]
```

Pegas la URL de una foto de cualquiera de los dos equipos en `url` y ejecutas:

```bash
npm run fotos
```

Baja solo las que faltan y anota la fuente en `creditos.txt`.

## Tamaño recomendado

- Horizontal, 1280×720 o similar.
- Menos de 300 KB (JPG calidad 80 / WebP).
- Lo importante (jugadores, celebración) arriba o al centro: abajo va el degradado.

## De dónde sacar las fotos

- **TheSportsDB**: fanart de clubes (lo usa el modo automático).
- **Unsplash / Pexels**: ambiente de fútbol, gratis.
- **Prensa oficial del club**: ideal para uso personal.
- **Google Imágenes**: para un proyecto personal es tu decisión; evita publicarlo así.

## Notas técnicas

- Las fotos se sirven por `/api/foto/<archivo>`, que lee la carpeta al vuelo:
  puedes agregar o borrar imágenes **sin recompilar**.
- `fuentes.json` y `creditos.txt` son de apoyo; no se muestran en la app.
