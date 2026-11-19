# Regla de tipografía

Objetivo: que el tamaño de letra no se decida a ojo en cada tarjeta. Toda la app usa esta escala.

## Escala oficial

| Token | Tamaño | Uso |
|---|---|---|
| `text-ui-micro` | **12 px** | Solo etiquetas de badge, leyendas y datos auxiliares muy cortos |
| `text-ui-caption` | **12 px** | Metadatos: fechas, horas, fuentes, notas secundarias |
| `text-ui-body-sm` | **13 px** | Texto compacto de tarjetas, descripciones y avisos |
| `text-ui-body` | **14 px** | Texto principal, filas de tablas y párrafos |
| `text-ui-card-title` | **17 px** | Título de tarjeta |
| `text-ui-section` | **19 px** | Título de sección |
| `text-ui-page` | **24 px** | Título de página |
| `text-ui-hero` | **30 px** | Números grandes y marcadores |

## Reglas

1. **Nada de texto de contenido por debajo de 12 px.**  
   Si no cabe, se cambia el layout, no se achica la letra.
2. **Títulos de tarjeta:** 17 px.
3. **Títulos de sección:** 19 px.
4. **Títulos de página:** 24 px (en móvil puede bajar a 22 px excepcionalmente).
5. **Texto de tarjetas y avisos:** 13–14 px.
6. **Metadatos y leyendas:** 12 px.
7. **Badges:** 12 px. Nunca 9–10 px para algo que el usuario necesite leer.
8. **Números KPI:** 24–30 px según el espacio.
9. **Modo claro y oscuro usan la misma escala.**
10. **No usar `text-[10px]` ni `text-[11px]` en contenido nuevo.**  
    Si se toca una tarjeta vieja, migrarla a los tokens.

## Cómo se usa

```tsx
<h2 className="text-ui-card-title font-semibold text-white">Tarjetas recientes</h2>
<p className="text-ui-body-sm text-mist-500">
  Últimos 8 partidos de cada equipo.
</p>
```

## Excepciones

- Iconos y contadores dentro de badges muy pequeños pueden usar 11 px.
- Marcadores de escudos o números decorativos pueden ser mayores, pero no menores.
- No se permite reducir la letra para “que entre” una tabla: se usa scroll horizontal o se ocultan columnas.

## Revisión

Antes de cerrar un cambio visual:

- ¿El texto de contenido tiene 12 px o más?
- ¿El título de la tarjeta es 16 px?
- ¿El aviso usa 13 px?
- ¿Se usó un token (`text-ui-*`) en vez de un valor arbitrario?

Si la respuesta es no, se corrige antes de publicar.
