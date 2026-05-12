import { useEffect, useState } from 'react';
import type { Core } from 'cytoscape';

interface Props {
  cyRef: React.RefObject<Core | null>;
  cyVersion: number;
}

type NodeDot = { x: number; y: number; color: string; size: number };
type Bbox = { x1: number; y1: number; x2: number; y2: number; w: number; h: number };
type Viewport = { panX: number; panY: number; zoom: number; cw: number; ch: number };

const W = 160;
const H = 110;
const PAD = 4;

export function MiniMap({ cyRef, cyVersion }: Props) {
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [dots, setDots] = useState<NodeDot[]>([]);
  const [view, setView] = useState<Viewport | null>(null);

  // Capture node positions once per cy rebuild.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const refreshLayout = () => {
      const bb = cy.elements().boundingBox({ includeLabels: false, includeOverlays: false });
      setBbox({ x1: bb.x1, y1: bb.y1, x2: bb.x2, y2: bb.y2, w: bb.w, h: bb.h });
      const ns: NodeDot[] = cy.nodes().map((n) => {
        const p = n.position();
        const color = String(n.style('background-color') ?? '#888');
        const size = Number(n.data('size') ?? 32);
        return { x: p.x, y: p.y, color, size };
      });
      setDots(ns);
    };

    refreshLayout();

    let rafId: number | null = null;
    const refreshView = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const c = cy.container();
        if (!c) return;
        const p = cy.pan();
        setView({ panX: p.x, panY: p.y, zoom: cy.zoom(), cw: c.clientWidth, ch: c.clientHeight });
      });
    };
    refreshView();

    cy.on('pan zoom resize', refreshView);
    return () => {
      cy.off('pan zoom resize', refreshView);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [cyRef, cyVersion]);

  if (!bbox || !view || dots.length === 0) return null;

  // Map world coords → mini coords, preserving aspect.
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const scale = Math.min(innerW / Math.max(1, bbox.w), innerH / Math.max(1, bbox.h));
  const offsetX = PAD + (innerW - bbox.w * scale) / 2;
  const offsetY = PAD + (innerH - bbox.h * scale) / 2;
  const worldToMini = (wx: number, wy: number) => ({
    mx: offsetX + (wx - bbox.x1) * scale,
    my: offsetY + (wy - bbox.y1) * scale,
  });

  // Viewport rect in world coords:
  //   screen = pan + world * zoom   →   world = (screen - pan) / zoom
  const wxTL = (0 - view.panX) / view.zoom;
  const wyTL = (0 - view.panY) / view.zoom;
  const wxBR = (view.cw - view.panX) / view.zoom;
  const wyBR = (view.ch - view.panY) / view.zoom;
  const tl = worldToMini(wxTL, wyTL);
  const br = worldToMini(wxBR, wyBR);
  const rectX = Math.min(tl.mx, br.mx);
  const rectY = Math.min(tl.my, br.my);
  const rectW = Math.abs(br.mx - tl.mx);
  const rectH = Math.abs(br.my - tl.my);

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const cy = cyRef.current;
    if (!cy) return;
    const target = e.currentTarget;
    const r = target.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    // mini → world
    const wx = bbox.x1 + (mx - offsetX) / scale;
    const wy = bbox.y1 + (my - offsetY) / scale;
    const c = cy.container();
    if (!c) return;
    // Center the clicked world point in the viewport.
    cy.pan({ x: c.clientWidth / 2 - wx * cy.zoom(), y: c.clientHeight / 2 - wy * cy.zoom() });
  };

  return (
    <div
      className="absolute bottom-3 right-3 z-[2] rounded-md border border-strong bg-surface-2/90 backdrop-blur shadow-lg pointer-events-auto"
      style={{ width: W, height: H }}
    >
      <svg
        width={W}
        height={H}
        onClick={handleClick}
        style={{ cursor: 'pointer', display: 'block' }}
      >
        {dots.map((d, i) => {
          const { mx, my } = worldToMini(d.x, d.y);
          const r = Math.max(1.2, Math.min(3.5, d.size * scale * 0.5));
          return <circle key={i} cx={mx} cy={my} r={r} fill={d.color} opacity={0.85} />;
        })}
        <rect
          x={rectX}
          y={rectY}
          width={Math.max(2, rectW)}
          height={Math.max(2, rectH)}
          fill="none"
          stroke="#fbbf24"
          strokeWidth={1.2}
          pointerEvents="none"
        />
      </svg>
    </div>
  );
}
