# Copia para mejora de diseño

Esta carpeta es una copia del proyecto **solo para trabajo de diseño visual**.
No incluye la base de datos, claves, `node_modules`, `.next` ni los scripts del modelo.

## Qué incluye

- `src/app/` — páginas, layout y `globals.css`.
- `src/components/` — componentes visibles de la interfaz.
- `src/lib/` — tipos, formato, ligas y utilidades que usan las páginas.
- `public/` — logos e imágenes.
- `design/` y `preview/` — referencias visuales.
- `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `README.md`.

## Archivos clave de diseño

- `src/app/globals.css` — tema Warm Light, modo oscuro y variables de color.
- `src/app/layout.tsx` — estructura general y navegación.
- `src/app/page.tsx` — página principal.
- `src/app/partido/[id]/page.tsx` — página de partido.
- `src/components/` — tarjetas, cupón, tabs y componentes reutilizables.

## Reglas para la IA de diseño

1. **No cambiar la lógica de predicciones, probabilidades, cuotas ni resultados.**
2. **No modificar** `src/lib/model.ts`, `src/lib/recommendations.ts`, `src/lib/combos.ts`, `src/lib/comboEval.ts` ni `src/lib/resultsSync.ts`.
3. Se puede cambiar **solo** lo visual: colores, tipografía, espaciado, bordes, sombras, animaciones y estructura de presentación.
4. Mantener el español de la interfaz y el tono actual.
5. Mantener el modo claro por defecto y el modo oscuro con el botón existente.
6. No introducir librerías de UI nuevas sin consultarlo.

## Para ejecutarla

No incluye `data/predicciones.db` ni `.env.local` por privacidad.

```bash
npm install
# colocar una base en data/predicciones.db y crear .env.local a partir de .env.example
npm run dev
```

Sin base de datos, algunas páginas mostrarán estados vacíos o errores de datos; para revisar el diseño alcanza con el código y las referencias visuales.
