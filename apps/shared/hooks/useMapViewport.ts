"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

/**
 * Shared zoom / pan controller for the 1000x1000 SVG stadium maps.
 * Keeps the map fully usable on desktop (wheel + drag) and touch
 * (single-finger drag, double-tap zoom) without fighting node clicks.
 */
export interface MapViewport {
  scale: number;
  x: number;
  y: number;
}

export interface MapPoint2D {
  x: number;
  y: number;
}

const VIEWBOX_SIZE = 1000;
const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DEFAULT_VIEW: MapViewport = { scale: 1, x: 0, y: 0 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampViewport(view: MapViewport): MapViewport {
  const scale = clamp(view.scale, MIN_SCALE, MAX_SCALE);
  const maxOffset = (scale - 1) * VIEWBOX_SIZE * 0.5 + 320;
  return {
    scale,
    x: clamp(view.x, -maxOffset, maxOffset),
    y: clamp(view.y, -maxOffset, maxOffset),
  };
}

function clientToViewBox(
  el: SVGSVGElement,
  clientX: number,
  clientY: number
): MapPoint2D {
  const rect = el.getBoundingClientRect();
  const size = Math.max(1, Math.min(rect.width, rect.height));
  const offsetX = (rect.width - size) / 2;
  const offsetY = (rect.height - size) / 2;
  return {
    x: ((clientX - rect.left - offsetX) / size) * VIEWBOX_SIZE,
    y: ((clientY - rect.top - offsetY) / size) * VIEWBOX_SIZE,
  };
}

function zoomAround(
  view: MapViewport,
  point: MapPoint2D,
  factor: number
): MapViewport {
  const scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
  const ratio = scale / view.scale;
  return clampViewport({
    scale,
    x: point.x - (point.x - view.x) * ratio,
    y: point.y - (point.y - view.y) * ratio,
  });
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
}

export function useMapViewport(
  svgRef: RefObject<SVGSVGElement | null>
) {
  const [viewport, setViewport] = useState<MapViewport>(DEFAULT_VIEW);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const movedRef = useRef(false);

  const reset = useCallback(() => {
    setViewport(DEFAULT_VIEW);
    setIsDragging(false);
  }, []);

  const zoomIn = useCallback(() => {
    setViewport((view) => zoomAround(view, { x: 500, y: 500 }, 1.3));
  }, []);

  const zoomOut = useCallback(() => {
    setViewport((view) => zoomAround(view, { x: 500, y: 500 }, 1 / 1.3));
  }, []);

  const zoomAtClient = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const point = clientToViewBox(svg, clientX, clientY);
      setViewport((view) => zoomAround(view, point, factor));
    },
    [svgRef]
  );

  const fitTo = useCallback((points: MapPoint2D[]) => {
    if (points.length === 0) {
      setViewport(DEFAULT_VIEW);
      return;
    }
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = Math.max(maxX - minX, 140);
    const height = Math.max(maxY - minY, 140);
    const padding = 110;
    const scale = clamp(
      Math.min(
        (VIEWBOX_SIZE - padding * 2) / width,
        (VIEWBOX_SIZE - padding * 2) / height
      ),
      MIN_SCALE,
      3.2
    );
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setViewport(
      clampViewport({
        scale,
        x: 500 - centerX * scale,
        y: 500 - centerY * scale,
      })
    );
  }, []);

  // Wheel needs a non-passive native listener so page scroll is suppressed
  // only while the cursor is over the map.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.16 : 1 / 1.16;
      const point = clientToViewBox(svg, event.clientX, event.clientY);
      setViewport((view) => zoomAround(view, point, factor));
    };
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [svgRef]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (event.button !== 0) return;
      movedRef.current = false;
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: viewport.x,
        originY: viewport.y,
        moved: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [viewport.x, viewport.y]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const screenDx = event.clientX - drag.startX;
      const screenDy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(screenDx, screenDy) < 5) return;
      drag.moved = true;
      setIsDragging(true);

      const rect = event.currentTarget.getBoundingClientRect();
      const size = Math.max(1, Math.min(rect.width, rect.height));
      const dx = (screenDx / size) * VIEWBOX_SIZE;
      const dy = (screenDy / size) * VIEWBOX_SIZE;
      setViewport(
        clampViewport({
          scale: viewport.scale,
          x: drag.originX + dx,
          y: drag.originY + dy,
        })
      );
    },
    [viewport.scale]
  );

  const endDrag = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    movedRef.current = drag.moved;
    dragRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  /** Returns true when the last gesture was a pan and the click should be ignored. */
  const consumeDragClick = useCallback(() => {
    if (!movedRef.current) return false;
    movedRef.current = false;
    return true;
  }, []);

  return {
    viewport,
    isDragging,
    isZoomed: viewport.scale > 1.001,
    zoomPercent: Math.round(viewport.scale * 100),
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onDoubleClick: (event: React.MouseEvent<SVGSVGElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const size = Math.max(1, Math.min(rect.width, rect.height));
      const offsetX = (rect.width - size) / 2;
      const offsetY = (rect.height - size) / 2;
      const point = {
        x: ((event.clientX - rect.left - offsetX) / size) * VIEWBOX_SIZE,
        y: ((event.clientY - rect.top - offsetY) / size) * VIEWBOX_SIZE,
      };
      setViewport((view) => zoomAround(view, point, 1.55));
    },
    consumeDragClick,
    zoomIn,
    zoomOut,
    zoomAtClient,
    fitTo,
    reset,
  };
}
