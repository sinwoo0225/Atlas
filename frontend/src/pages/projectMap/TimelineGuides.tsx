import { useEffect, useMemo, useState } from 'react';
import type { Core } from 'cytoscape';
import {
  LANE_HEIGHT,
  LANE_Y,
  TIMELINE_LANES,
  generateTimelineTicks,
  type TimeWindow,
} from './layouts';

interface Props {
  cyRef: React.RefObject<Core | null>;
  cyVersion: number;
  window: TimeWindow | null;
}

type Viewport = { panX: number; panY: number; zoom: number };

export function TimelineGuides({ cyRef, cyVersion, window: tlWindow }: Props) {
  const [viewport, setViewport] = useState<Viewport>({ panX: 0, panY: 0, zoom: 1 });

  // Subscribe to cy viewport changes; re-subscribe whenever cy is rebuilt.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    let rafId: number | null = null;
    const update = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const p = cy.pan();
        setViewport({ panX: p.x, panY: p.y, zoom: cy.zoom() });
      });
    };
    update();
    cy.on('pan zoom resize', update);
    return () => {
      cy.off('pan zoom resize', update);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [cyRef, cyVersion]);

  const ticks = useMemo(() => (tlWindow ? generateTimelineTicks(tlWindow) : []), [tlWindow]);

  const { panX, panY, zoom } = viewport;
  const laneHeightPx = LANE_HEIGHT * zoom;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[1]">
      {/* Lane bands */}
      {TIMELINE_LANES.map((lane) => {
        const top = panY + (LANE_Y[lane.key] - LANE_HEIGHT / 2) * zoom;
        return (
          <div
            key={`band-${lane.key}`}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top,
              height: laneHeightPx,
              backgroundColor: lane.bgColor,
              borderTop: '1px dashed var(--border-default)',
              borderBottom: '1px dashed var(--border-default)',
            }}
          />
        );
      })}

      {/* Lane labels — pinned to the left edge of the viewport */}
      {TIMELINE_LANES.map((lane) => {
        const centerY = panY + LANE_Y[lane.key] * zoom;
        return (
          <div
            key={`label-${lane.key}`}
            style={{
              position: 'absolute',
              left: 12,
              top: centerY,
              transform: 'translateY(-50%)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.04em',
              color: lane.strokeColor,
              padding: '2px 8px',
              borderRadius: 4,
              backgroundColor: 'var(--bg-surface-2)',
              border: '1px solid var(--border-default)',
              whiteSpace: 'nowrap',
            }}
          >
            {lane.label}
          </div>
        );
      })}

      {/* Vertical tick lines spanning the lane area */}
      {ticks.map((t) => {
        const x = panX + t.worldX * zoom;
        const top = panY + (LANE_Y.wbs - LANE_HEIGHT / 2) * zoom;
        const height = (LANE_Y.dev + LANE_HEIGHT / 2 - (LANE_Y.wbs - LANE_HEIGHT / 2)) * zoom;
        return (
          <div
            key={`tick-${t.iso}`}
            style={{
              position: 'absolute',
              left: x,
              top,
              height,
              width: 0,
              borderLeft: t.major
                ? '1px solid var(--border-strong)'
                : '1px dashed var(--border-default)',
              opacity: t.major ? 0.6 : 0.4,
            }}
          />
        );
      })}

      {/* Tick labels — pinned to the top of the viewport */}
      {ticks.map((t) => {
        const x = panX + t.worldX * zoom;
        return (
          <div
            key={`tick-label-${t.iso}`}
            style={{
              position: 'absolute',
              left: x,
              top: 8,
              transform: 'translateX(-50%)',
              fontSize: t.major ? 11 : 10,
              fontWeight: t.major ? 700 : 500,
              color: t.major ? 'var(--text-secondary)' : 'var(--text-muted)',
              padding: '1px 6px',
              borderRadius: 3,
              backgroundColor: 'var(--bg-surface-2)',
              border: '1px solid var(--border-default)',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </div>
        );
      })}
    </div>
  );
}
