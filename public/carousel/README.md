# Fotos del carrusel

Las tarjetas de "próximos partidos" usan una foto de fondo si encuentran el archivo.
No hay base de datos: se busca por nombre de archivo.

## Prioridad

1. **Partido exacto**: `local-visitante.ext`
2. **Liga**: `liga-<código>.ext`
3. Si no hay ninguna, la tarjeta queda con el diseño normal (sin foto).

## Cómo se arma el nombre

Se toma el nombre tal como está en la base, sin acentos, en minúsculas y con guiones:

| Equipo / liga | Archivo |
|---|---|
| São Paulo vs Fluminense | `sao-paulo-fluminense.jpg` |
| Vasco vs Internacional | `vasco-internacional.jpg` |
| Serie A (Brasil) | `liga-e0.jpg` |
| LaLiga | `liga-e0.jpg` (ver abajo) |
| Major League Soccer | `liga-mls.jpg` |

> Los códigos de liga son los mismos de `src/lib/leagues.ts` (por ejemplo `E0`, `SP1`, `MLS`).

Extensiones válidas: `.jpg`, `.jpeg`, `.png`, `.webp`.

## Tamaño recomendado

- **1200 × 800 px** o similar, horizontal.
- Peso ideal menor a 300 KB (usa JPG calidad 80 o WebP).
- La parte baja de la foto queda oscurecida por el degradado, así que lo importante
  (jugadores, celebración) conviene que esté en el centro o arriba.

## De dónde sacar las fotos

- **Unsplash / Pexels**: gratis, uso comercial, sin atribución obligatoria.
- **Prensa oficial del club**: sirve para un proyecto personal, no para vender.
- **API-Football**: si tu plan incluye `/venues`, trae fotos del estadio real.

No uses imágenes de Google ni capturas de casas de apuestas: tienen derechos.
