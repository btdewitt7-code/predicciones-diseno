# Fotos del carrusel

Las tarjetas de "próximos partidos" usan una foto de fondo si existe el archivo.
No hay base de datos: se busca por nombre.

## Descarga automática (una sola vez)

1. Edita `public/carousel/fuentes.json` y agrega las fotos que quieras:

```json
[
  { "home": "Sao Paulo", "away": "Fluminense", "url": "https://..." },
  { "home": "Boca Juniors", "away": "River Plate", "url": "https://..." }
]
```

2. Ejecuta:

```bash
npm run fotos
```

Baja solo las que faltan, las guarda como `local-visitante.jpg` y anota la fuente en
`creditos.txt`. Con `npm run fotos -- --force` las vuelve a bajar todas.

También existe el modo automático, que busca imágenes de club en TheSportsDB:

```bash
npm run fotos -- --auto 10
```

Ese servicio tiene límite de peticiones (responde 429 si te pasas), así que el modo
lista es el más confiable.

## Prioridad

1. **Partido exacto**: `local-visitante.ext`
2. **Liga**: `liga-<código>.ext`
3. Si no hay ninguna, la tarjeta queda con el diseño normal (sin foto).

## Cómo se arma el nombre

Sin acentos, en minúsculas y con guiones:

| Equipo / liga | Archivo |
|---|---|
| São Paulo vs Fluminense | `sao-paulo-fluminense.jpg` |
| Vasco vs Internacional | `vasco-internacional.jpg` |
| LaLiga | `liga-sp1.jpg` |
| Major League Soccer | `liga-mls.jpg` |

Los códigos de liga son los de `src/lib/leagues.ts` (por ejemplo `E0`, `SP1`, `MLS`).
Extensiones válidas: `.jpg`, `.jpeg`, `.png`, `.webp`.

## Tamaño recomendado

- **1200 × 800 px** o similar, horizontal.
- Menos de 300 KB (JPG calidad 80 o WebP).
- Lo importante (jugadores, celebración) arriba o al centro: la parte baja queda
  oscurecida por el degradado.

## De dónde sacar las fotos

- **Unsplash / Pexels**: gratis, uso comercial.
- **Prensa oficial del club**: sirve para un proyecto personal, no para vender.
- **Flickr / Wikimedia**: revisa la licencia; el script anota la fuente en `creditos.txt`.
- **API-Football `/venues`**: si tu plan lo incluye, trae foto del estadio.

No uses imágenes de Google ni capturas de casas de apuestas si vas a publicar el
proyecto: tienen derechos. Para uso personal es tu decisión.

## Notas técnicas

- Las fotos se sirven por `/api/foto/<archivo>`, que lee la carpeta al vuelo:
  puedes agregar o borrar imágenes **sin recompilar**.
- `fuentes.json` y `creditos.txt` son solo de apoyo; no se muestran en la app.
