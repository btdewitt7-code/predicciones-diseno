"use client";

import { useEffect, useRef, type MouseEvent, type PointerEvent, type ReactNode } from "react";

/**
 * Fila horizontal sin barra de scroll que se arrastra con el cursor,
 * con inercia y frenado suave al soltar.
 */
export function DragScroll({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, startLeft: 0, moved: false });
  const velocity = useRef(0);
  const lastPoint = useRef({ x: 0, time: 0 });
  const glide = useRef<number | null>(null);

  useEffect(() => () => cancelGlide(), []);

  function cancelGlide() {
    if (glide.current !== null) {
      cancelAnimationFrame(glide.current);
      glide.current = null;
    }
  }

  function startGlide() {
    const run = () => {
      const el = ref.current;
      if (!el) return;
      const v = velocity.current;
      if (Math.abs(v) < 0.03) {
        velocity.current = 0;
        glide.current = null;
        return;
      }
      el.scrollLeft += v * 16;
      velocity.current = v * 0.92;
      glide.current = requestAnimationFrame(run);
    };
    cancelGlide();
    glide.current = requestAnimationFrame(run);
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" || event.button !== 0) return;
    const el = ref.current;
    if (!el) return;
    cancelGlide();
    velocity.current = 0;
    lastPoint.current = { x: event.clientX, time: performance.now() };
    drag.current = {
      active: true,
      startX: event.clientX,
      startLeft: el.scrollLeft,
      moved: false,
    };
    try {
      el.setPointerCapture(event.pointerId);
    } catch {
      /* puntero sintetico */
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || !drag.current.active) return;
    const now = performance.now();
    const dt = now - lastPoint.current.time;
    if (dt > 0) velocity.current = -(event.clientX - lastPoint.current.x) / dt;
    lastPoint.current = { x: event.clientX, time: now };
    const delta = event.clientX - drag.current.startX;
    if (Math.abs(delta) > 5) drag.current.moved = true;
    el.scrollLeft = drag.current.startLeft - delta;
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!drag.current.active) return;
    drag.current.active = false;
    try {
      if (el?.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
    } catch {
      /* puntero sintetico */
    }
    if (drag.current.moved && Math.abs(velocity.current) > 0.12) startGlide();
  };

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!drag.current.moved) return;
    event.preventDefault();
    event.stopPropagation();
    drag.current.moved = false;
  };

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={endDrag}
      onClickCapture={onClickCapture}
      onDragStart={(event) => event.preventDefault()}
      className={`cursor-grab select-none overflow-x-auto active:cursor-grabbing [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {children}
    </div>
  );
}
