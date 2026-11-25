import React, { useId, useMemo } from "react";
import { getCellRect } from "../../layout/boardLayout";
import type { BoardLayoutMetrics, CellRect } from "../../layout/boardLayout";
import type { ActiveClue, CellData } from "../../types";

export interface EvidenceOverlayProps {
  layout: BoardLayoutMetrics;
  cells: CellData[];
  selectedClue: ActiveClue | null;
  pinnedClues: ActiveClue[];
  hintedCellCoord?: string | null;
  reducedMotion?: boolean;
}

interface OverlayStyle {
  slotKey: "selected" | "pinned0" | "pinned1";
  layerIndex: number;
  stroke: string;
  pillBorder: string;
  pillText: string;
  dashArray?: string;
  strokeWidth: number;
  fillOpacity: number;
}

const SELECTED_STYLE: OverlayStyle = {
  slotKey: "selected",
  layerIndex: 0,
  stroke: "#E5BC74",
  pillBorder: "#E5BC74",
  pillText: "#F5DEB0",
  strokeWidth: 2.2,
  fillOpacity: 0.07,
};

const PINNED_STYLES: [OverlayStyle, OverlayStyle] = [
  {
    slotKey: "pinned0",
    layerIndex: 1,
    stroke: "#7EA6BE",
    pillBorder: "#7EA6BE",
    pillText: "#C7DFEE",
    dashArray: "6 4",
    strokeWidth: 1.85,
    fillOpacity: 0.045,
  },
  {
    slotKey: "pinned1",
    layerIndex: 2,
    stroke: "#C9896B",
    pillBorder: "#C9896B",
    pillText: "#ECC5B3",
    dashArray: "3 3.5",
    strokeWidth: 1.85,
    fillOpacity: 0.045,
  },
];

function parseFallbackCoord(
  coord: string,
  size: number
): { row: number; col: number } | null {
  const trimmed = coord.trim().toUpperCase();
  if (trimmed.length < 2) return null;
  const col = trimmed.charCodeAt(0) - 65;
  const row = Number.parseInt(trimmed.slice(1), 10) - 1;
  if (
    !Number.isFinite(row) ||
    !Number.isFinite(col) ||
    row < 0 ||
    col < 0 ||
    row >= size ||
    col >= size
  ) {
    return null;
  }
  return { row, col };
}

function resolveCoordRect(
  coord: string,
  cellMap: Map<string, CellData>,
  layout: BoardLayoutMetrics
): { row: number; col: number; rect: CellRect } | null {
  const cell = cellMap.get(coord);
  if (cell) {
    return {
      row: cell.row,
      col: cell.col,
      rect: getCellRect(layout, cell.row, cell.col),
    };
  }
  const parsed = parseFallbackCoord(coord, layout.size);
  if (!parsed) return null;
  return {
    row: parsed.row,
    col: parsed.col,
    rect: getCellRect(layout, parsed.row, parsed.col),
  };
}

function intersectRectPerimeter(
  rect: CellRect,
  fromX: number,
  fromY: number,
  margin = 2
): { x: number; y: number } {
  const dx = fromX - rect.cx;
  const dy = fromY - rect.cy;
  if (dx === 0 && dy === 0) {
    return { x: rect.cx, y: rect.y - margin };
  }
  const halfW = rect.width / 2 + margin;
  const halfH = rect.height / 2 + margin;
  const scaleX = dx !== 0 ? Math.abs(halfW / dx) : Number.POSITIVE_INFINITY;
  const scaleY = dy !== 0 ? Math.abs(halfH / dy) : Number.POSITIVE_INFINITY;
  const t = Math.min(scaleX, scaleY);
  return {
    x: rect.cx + dx * t,
    y: rect.cy + dy * t,
  };
}

function buildCurvedPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  bowSign = -1
): {
  d: string;
  midX: number;
  midY: number;
} {
  const dx = endX - startX;
  const dy = endY - startY;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist;
  const ny = dx / dist;
  const bow = Math.min(30, Math.max(12, dist * 0.18)) * bowSign;
  const ctrlX = (startX + endX) / 2 + nx * bow;
  const ctrlY = (startY + endY) / 2 + ny * bow;
  const midX = 0.25 * startX + 0.5 * ctrlX + 0.25 * endX;
  const midY = 0.25 * startY + 0.5 * ctrlY + 0.25 * endY;
  return {
    d: `M ${startX.toFixed(1)} ${startY.toFixed(1)} Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}`,
    midX,
    midY,
  };
}

/**
 * Returns a compact mathematical badge ONLY when it adds non-obvious count/parity clarity
 * on regional/relational clues — NEVER covering faces with verbose "Fact: Criminal" text.
 */
function getCompactBadge(clue: ActiveClue): string | null {
  const desc = clue.descriptor;
  const kind = (desc?.kind ?? clue.type ?? "").toUpperCase();

  if (kind === "SAME") return "=";
  if (kind === "DIFFERENT") return "≠";
  if (kind === "EXACTLY") {
    return typeof desc?.k === "number" ? `=${desc.k}` : null;
  }
  if (kind === "ATLEAST") {
    return typeof desc?.k === "number" ? `≥${desc.k}` : null;
  }
  if (kind === "ATMOST") {
    return typeof desc?.k === "number" ? `≤${desc.k}` : null;
  }
  if (kind === "PARITY") {
    const parity = desc?.parity?.toUpperCase();
    if (parity === "EVEN") return "Even";
    if (parity === "ODD") return "Odd";
  }
  return null;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

const SvgBadge: React.FC<{
  x: number;
  y: number;
  label: string;
  style: OverlayStyle;
  gridWidth: number;
  gridHeight: number;
  compact: boolean;
}> = ({ x, y, label, style, gridWidth, gridHeight, compact }) => {
  const fontSize = compact ? 9.5 : 10;
  const charWidth = compact ? 6.2 : 6.8;
  const pillHeight = compact ? 16 : 18;
  const pillWidth = Math.max(22, Math.round(label.length * charWidth + 10));

  const clampedX = clamp(
    x - pillWidth / 2,
    2,
    Math.max(2, gridWidth - pillWidth - 2)
  );
  const clampedY = clamp(
    y - pillHeight / 2,
    -8,
    Math.max(-8, gridHeight - pillHeight + 6)
  );

  return (
    <g transform={`translate(${clampedX.toFixed(1)}, ${clampedY.toFixed(1)})`}>
      <rect
        x={0}
        y={0}
        width={pillWidth}
        height={pillHeight}
        rx={pillHeight / 2}
        fill="#16120E"
        fillOpacity={0.94}
        stroke={style.pillBorder}
        strokeWidth={1.3}
      />
      <text
        x={pillWidth / 2}
        y={pillHeight / 2}
        fill={style.pillText}
        fontSize={fontSize}
        fontWeight={700}
        fontFamily="var(--font-mono)"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {label}
      </text>
    </g>
  );
};

const CornerBrackets: React.FC<{
  rect: CellRect;
  pad: number;
  len: number;
  style: OverlayStyle;
}> = ({ rect, pad, len, style }) => {
  const x1 = rect.x - pad;
  const y1 = rect.y - pad;
  const x2 = rect.x + rect.width + pad;
  const y2 = rect.y + rect.height + pad;
  const bracketLen = Math.min(len, rect.width * 0.26, rect.height * 0.26);

  const d = [
    `M ${x1} ${y1 + bracketLen} L ${x1} ${y1} L ${x1 + bracketLen} ${y1}`,
    `M ${x2 - bracketLen} ${y1} L ${x2} ${y1} L ${x2} ${y1 + bracketLen}`,
    `M ${x1} ${y2 - bracketLen} L ${x1} ${y2} L ${x1 + bracketLen} ${y2}`,
    `M ${x2 - bracketLen} ${y2} L ${x2} ${y2} L ${x2} ${y2 - bracketLen}`,
  ].join(" ");

  return (
    <g>
      <rect
        x={x1}
        y={y1}
        width={x2 - x1}
        height={y2 - y1}
        rx={8}
        fill={style.stroke}
        fillOpacity={style.fillOpacity * 0.75}
        stroke="none"
      />
      <path
        d={d}
        fill="none"
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={style.dashArray}
      />
    </g>
  );
};

export const EvidenceOverlay: React.FC<EvidenceOverlayProps> = ({
  layout,
  cells,
  selectedClue,
  pinnedClues,
  hintedCellCoord = null,
  reducedMotion = false,
}) => {
  const rawId = useId();
  const uid = rawId.replace(/:/g, "");

  const cellMap = useMemo(() => {
    const map = new Map<string, CellData>();
    for (const cell of cells) {
      map.set(cell.coord, cell);
    }
    return map;
  }, [cells]);

  const activeEntries = useMemo(() => {
    const entries: Array<{ clue: ActiveClue; style: OverlayStyle }> = [];
    pinnedClues.slice(0, 2).forEach((clue, idx) => {
      if (selectedClue && clue.clue_id === selectedClue.clue_id) {
        return;
      }
      entries.push({ clue, style: PINNED_STYLES[idx] });
    });
    if (selectedClue) {
      entries.push({ clue: selectedClue, style: SELECTED_STYLE });
    }
    return entries;
  }, [pinnedClues, selectedClue]);

  const hintedResolved = useMemo(() => {
    if (!hintedCellCoord) return null;
    return resolveCoordRect(hintedCellCoord, cellMap, layout);
  }, [hintedCellCoord, cellMap, layout]);

  if (layout.gridWidth <= 0 || layout.gridHeight <= 0 || cells.length === 0) {
    return null;
  }

  const arrowSelectedId = `arrow-selected-${uid}`;
  const arrowPinned0Id = `arrow-pinned0-${uid}`;
  const arrowPinned1Id = `arrow-pinned1-${uid}`;
  const glowFilterId = `amber-glow-${uid}`;

  const getArrowMarkerId = (slotKey: OverlayStyle["slotKey"]) => {
    if (slotKey === "selected") return arrowSelectedId;
    if (slotKey === "pinned0") return arrowPinned0Id;
    return arrowPinned1Id;
  };

  const compactOverlay = layout.compact || layout.cardWidth < 116;

  return (
    <svg
      aria-hidden="true"
      width={layout.gridWidth}
      height={layout.gridHeight}
      viewBox={`0 0 ${layout.gridWidth} ${layout.gridHeight}`}
      style={{
        left: layout.gridOffsetX,
        top: layout.gridOffsetY,
        width: layout.gridWidth,
        height: layout.gridHeight,
      }}
      className="pointer-events-none absolute z-20 overflow-visible"
    >
      <defs>
        <filter id={glowFilterId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow
            dx="0"
            dy="0"
            stdDeviation="2.2"
            floodColor="#E5BC74"
            floodOpacity="0.4"
          />
        </filter>

        {[
          { id: arrowSelectedId, color: SELECTED_STYLE.stroke },
          { id: arrowPinned0Id, color: PINNED_STYLES[0].stroke },
          { id: arrowPinned1Id, color: PINNED_STYLES[1].stroke },
        ].map((marker) => (
          <marker
            key={marker.id}
            id={marker.id}
            viewBox="0 0 10 10"
            refX="8.5"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 1 1.5 L 9 5 L 1 8.5 z" fill={marker.color} />
          </marker>
        ))}
      </defs>

      {hintedResolved && (
        <CornerBrackets
          rect={hintedResolved.rect}
          pad={4}
          len={13}
          style={SELECTED_STYLE}
        />
      )}

      {activeEntries.map(({ clue, style }) => {
        const desc = clue.descriptor;
        const kind = (desc?.kind ?? clue.type ?? "").toUpperCase();
        const badge = getCompactBadge(clue);
        const ownerResolved = resolveCoordRect(clue.owner_coord, cellMap, layout);
        const isSelectedLayer = style.slotKey === "selected";
        const groupFilter =
          isSelectedLayer && !reducedMotion ? `url(#${glowFilterId})` : undefined;
        const drawClass =
          !reducedMotion && !style.dashArray ? "animate-evidence-draw" : "";

        const ownerPin = ownerResolved ? (
          <circle
            cx={ownerResolved.rect.x + 5}
            cy={ownerResolved.rect.y + 5}
            r={3.5}
            fill={style.stroke}
            stroke="#16120E"
            strokeWidth={1.2}
          />
        ) : null;

        // 1. FACT Clue (clean connector arrow + target brackets — no face-covering pill)
        if (kind === "FACT") {
          const targetCoord =
            desc?.targets?.[0] ?? clue.referenced_coords[0] ?? clue.owner_coord;
          const targetResolved = resolveCoordRect(targetCoord, cellMap, layout);

          if (!targetResolved) {
            return <g key={clue.clue_id}>{ownerPin}</g>;
          }

          const isSelfFact = targetCoord === clue.owner_coord || !ownerResolved;
          if (isSelfFact) {
            return (
              <g key={clue.clue_id} filter={groupFilter}>
                <CornerBrackets
                  rect={targetResolved.rect}
                  pad={3 + style.layerIndex * 2.5}
                  len={11}
                  style={style}
                />
                {ownerPin}
              </g>
            );
          }

          const startPt = intersectRectPerimeter(
            ownerResolved.rect,
            targetResolved.rect.cx,
            targetResolved.rect.cy,
            1
          );
          const endPt = intersectRectPerimeter(
            targetResolved.rect,
            ownerResolved.rect.cx,
            ownerResolved.rect.cy,
            3
          );
          const curve = buildCurvedPath(
            startPt.x,
            startPt.y,
            endPt.x,
            endPt.y,
            style.layerIndex % 2 === 0 ? -1 : 1
          );

          return (
            <g key={clue.clue_id} filter={groupFilter}>
              <CornerBrackets
                rect={targetResolved.rect}
                pad={3 + style.layerIndex * 2.5}
                len={11}
                style={style}
              />
              <path
                d={curve.d}
                pathLength={1}
                fill="none"
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
                strokeDasharray={style.dashArray ?? (reducedMotion ? undefined : "1")}
                strokeLinecap="round"
                markerEnd={`url(#${getArrowMarkerId(style.slotKey)})`}
                className={drawClass}
              />
              {ownerPin}
            </g>
          );
        }

        // 2. SAME / DIFFERENT Clues
        if (kind === "SAME" || kind === "DIFFERENT") {
          const targetCoords =
            desc?.targets && desc.targets.length >= 2
              ? desc.targets
              : clue.referenced_coords;
          const resolvedA = targetCoords[0]
            ? resolveCoordRect(targetCoords[0], cellMap, layout)
            : null;
          const resolvedB = targetCoords[1]
            ? resolveCoordRect(targetCoords[1], cellMap, layout)
            : null;

          if (!resolvedA || !resolvedB) {
            return (
              <g key={clue.clue_id}>
                {resolvedA && (
                  <CornerBrackets
                    rect={resolvedA.rect}
                    pad={3 + style.layerIndex * 2.5}
                    len={11}
                    style={style}
                  />
                )}
                {ownerPin}
              </g>
            );
          }

          const startPt = intersectRectPerimeter(
            resolvedA.rect,
            resolvedB.rect.cx,
            resolvedB.rect.cy,
            2
          );
          const endPt = intersectRectPerimeter(
            resolvedB.rect,
            resolvedA.rect.cx,
            resolvedA.rect.cy,
            2
          );
          const curve = buildCurvedPath(
            startPt.x,
            startPt.y,
            endPt.x,
            endPt.y,
            style.layerIndex % 2 === 0 ? -1 : 1
          );
          const pad = 3 + style.layerIndex * 2.5;

          return (
            <g key={clue.clue_id} filter={groupFilter}>
              <CornerBrackets
                rect={resolvedA.rect}
                pad={pad}
                len={11}
                style={style}
              />
              <CornerBrackets
                rect={resolvedB.rect}
                pad={pad}
                len={11}
                style={style}
              />
              <path
                d={curve.d}
                pathLength={1}
                fill="none"
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
                strokeDasharray={style.dashArray ?? (reducedMotion ? undefined : "1")}
                strokeLinecap="round"
                className={drawClass}
              />
              <circle cx={startPt.x} cy={startPt.y} r={2.8} fill={style.stroke} />
              <circle cx={endPt.x} cy={endPt.y} r={2.8} fill={style.stroke} />
              {ownerPin}
              {badge && (
                <SvgBadge
                  x={curve.midX}
                  y={curve.midY}
                  label={badge}
                  style={style}
                  gridWidth={layout.gridWidth}
                  gridHeight={layout.gridHeight}
                  compact={compactOverlay}
                />
              )}
            </g>
          );
        }

        // 3. Regional Clues: EXACTLY / ATLEAST / ATMOST / PARITY
        const uniqueResolved = new Map<
          string,
          { row: number; col: number; rect: CellRect }
        >();
        for (const coord of clue.referenced_coords) {
          const item = resolveCoordRect(coord, cellMap, layout);
          if (item) {
            uniqueResolved.set(`${item.row},${item.col}`, item);
          }
        }
        const regionCells = Array.from(uniqueResolved.values());

        if (regionCells.length === 0) {
          return <g key={clue.clue_id}>{ownerPin}</g>;
        }

        let minRow = Number.POSITIVE_INFINITY;
        let maxRow = Number.NEGATIVE_INFINITY;
        let minCol = Number.POSITIVE_INFINITY;
        let maxCol = Number.NEGATIVE_INFINITY;
        for (const item of regionCells) {
          if (item.row < minRow) minRow = item.row;
          if (item.row > maxRow) maxRow = item.row;
          if (item.col < minCol) minCol = item.col;
          if (item.col > maxCol) maxCol = item.col;
        }

        const expectedCount =
          (maxRow - minRow + 1) * (maxCol - minCol + 1);
        const isContiguous = regionCells.length === expectedCount;

        if (isContiguous) {
          const tl = getCellRect(layout, minRow, minCol);
          const br = getCellRect(layout, maxRow, maxCol);
          const pad = 4 + style.layerIndex * 3;
          const boxX = tl.x - pad;
          const boxY = tl.y - pad;
          const boxW = br.x + br.width - tl.x + pad * 2;
          const boxH = br.y + br.height - tl.y + pad * 2;

          const badgeX =
            style.layerIndex === 1
              ? boxX + Math.min(32, boxW * 0.2)
              : boxX + boxW - Math.min(28, boxW * 0.16);
          const badgeY = style.layerIndex === 2 ? boxY + boxH : boxY;

          return (
            <g key={clue.clue_id} filter={groupFilter}>
              <rect
                x={boxX}
                y={boxY}
                width={boxW}
                height={boxH}
                rx={10}
                fill={style.stroke}
                fillOpacity={style.fillOpacity}
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
                strokeDasharray={style.dashArray}
              />
              {ownerPin}
              {badge && (
                <SvgBadge
                  x={badgeX}
                  y={badgeY}
                  label={badge}
                  style={style}
                  gridWidth={layout.gridWidth}
                  gridHeight={layout.gridHeight}
                  compact={compactOverlay}
                />
              )}
            </g>
          );
        }

        // Non-contiguous region: corner brackets per cell
        const pad = 3 + style.layerIndex * 2.5;
        const sortedByTopRight = [...regionCells].sort(
          (a, b) => a.row - b.row || b.col - a.col
        );
        const topAnchorCell = sortedByTopRight[0];

        return (
          <g key={clue.clue_id} filter={groupFilter}>
            {regionCells.map((item) => (
              <CornerBrackets
                key={`${item.row}-${item.col}`}
                rect={item.rect}
                pad={pad}
                len={11}
                style={style}
              />
            ))}
            {ownerPin}
            {badge && (
              <SvgBadge
                x={topAnchorCell.rect.x + topAnchorCell.rect.width * 0.78}
                y={topAnchorCell.rect.y - pad}
                label={badge}
                style={style}
                gridWidth={layout.gridWidth}
                gridHeight={layout.gridHeight}
                compact={compactOverlay}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
};
