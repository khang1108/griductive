import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BoardLayoutMetrics } from "../../layout/boardLayout";
import type {
  ActiveClue,
  CellData,
  PlayerNote,
  VerdictAssessmentType,
} from "../../types";
import { CardTile } from "./CardTile";
import { EvidenceOverlay } from "./EvidenceOverlay";

export interface InvestigationBoardProps {
  sessionKey?: string;
  size: number;
  cells: CellData[];
  layout: BoardLayoutMetrics;
  selectedCellCoord: string | null;
  highlightedCoords: string[];
  selectedClue: ActiveClue | null;
  pinnedClues: ActiveClue[];
  pendingCoord: string | null;
  stampAnimatingCoord: string | null;
  rejectedCoord: string | null;
  rejectedAssessment?: VerdictAssessmentType | null;
  rejectRunId?: number;
  hintedCellCoord: string | null;
  notes: Record<string, PlayerNote>;
  actionsDisabled: boolean;
  reducedMotion: boolean;
  onSelectCell: (coord: string) => void;
  onClosePanel?: () => void;
  registerFocusRef?: (fn: (coord: string) => void) => void;
}

export const InvestigationBoard: React.FC<InvestigationBoardProps> = ({
  sessionKey = "default",
  size,
  cells,
  layout,
  selectedCellCoord,
  highlightedCoords,
  selectedClue,
  pinnedClues,
  pendingCoord,
  stampAnimatingCoord,
  rejectedCoord,
  rejectedAssessment = null,
  rejectRunId = 0,
  hintedCellCoord,
  notes,
  actionsDisabled,
  reducedMotion,
  onSelectCell,
  onClosePanel,
  registerFocusRef,
}) => {
  const safeRows = Math.max(1, layout.rows || size);
  const safeCols = Math.max(1, layout.cols || size);

  const { cellByPos, cellByCoord, orderedCells } = useMemo(() => {
    const byPos = new Map<string, CellData>();
    const byCoord = new Map<string, CellData>();
    for (const cell of cells) {
      byPos.set(`${cell.row},${cell.col}`, cell);
      byCoord.set(cell.coord, cell);
    }
    const ordered = [...cells].sort(
      (a, b) => a.row - b.row || a.col - b.col
    );
    return { cellByPos: byPos, cellByCoord: byCoord, orderedCells: ordered };
  }, [cells]);

  const highlightedSet = useMemo(
    () => new Set(highlightedCoords),
    [highlightedCoords]
  );

  const firstCoord = orderedCells[0]?.coord ?? null;

  const [focusedCoord, setFocusedCoord] = useState<string | null>(
    selectedCellCoord ?? firstCoord
  );

  useEffect(() => {
    if (selectedCellCoord && cellByCoord.has(selectedCellCoord)) {
      setFocusedCoord(selectedCellCoord);
    }
  }, [selectedCellCoord, cellByCoord]);

  const effectiveFocusedCoord = useMemo(() => {
    if (focusedCoord && cellByCoord.has(focusedCoord)) {
      return focusedCoord;
    }
    if (selectedCellCoord && cellByCoord.has(selectedCellCoord)) {
      return selectedCellCoord;
    }
    return firstCoord;
  }, [focusedCoord, selectedCellCoord, cellByCoord, firstCoord]);

  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const setButtonRef = useCallback(
    (coord: string) => (el: HTMLButtonElement | null) => {
      if (el) {
        buttonRefs.current.set(coord, el);
      } else {
        buttonRefs.current.delete(coord);
      }
    },
    []
  );

  const focusCell = useCallback(
    (coord: string) => {
      const targetCoord = cellByCoord.has(coord) ? coord : firstCoord;
      if (!targetCoord) return;
      setFocusedCoord(targetCoord);
      const el = buttonRefs.current.get(targetCoord);
      if (el) {
        el.focus({ preventScroll: true });
      } else {
        requestAnimationFrame(() => {
          buttonRefs.current.get(targetCoord)?.focus({ preventScroll: true });
        });
      }
    },
    [cellByCoord, firstCoord]
  );

  useEffect(() => {
    registerFocusRef?.(focusCell);
  }, [registerFocusRef, focusCell]);

  // Keyboard arrow navigation stays instantaneous (0ms motion on high-frequency input)
  const handleCellKeyDown = useCallback(
    (row: number, col: number) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Escape") {
        if (onClosePanel) {
          e.preventDefault();
          onClosePanel();
        }
        return;
      }

      let nextRow = row;
      let nextCol = col;
      let handled = true;

      switch (e.key) {
        case "ArrowUp":
          nextRow = Math.max(0, row - 1);
          break;
        case "ArrowDown":
          nextRow = Math.min(safeRows - 1, row + 1);
          break;
        case "ArrowLeft":
          nextCol = Math.max(0, col - 1);
          break;
        case "ArrowRight":
          nextCol = Math.min(safeCols - 1, col + 1);
          break;
        case "Home":
          if (e.ctrlKey || e.metaKey) {
            nextRow = 0;
            nextCol = 0;
          } else {
            nextCol = 0;
          }
          break;
        case "End":
          if (e.ctrlKey || e.metaKey) {
            nextRow = safeRows - 1;
            nextCol = safeCols - 1;
          } else {
            nextCol = safeCols - 1;
          }
          break;
        default:
          handled = false;
      }

      if (!handled) return;
      e.preventDefault();

      const targetCell = cellByPos.get(`${nextRow},${nextCol}`);
      if (targetCell) {
        focusCell(targetCell.coord);
      }
    },
    [safeRows, safeCols, cellByPos, focusCell, onClosePanel]
  );

  const activeHighlightCell =
    (selectedCellCoord && cellByCoord.get(selectedCellCoord)) ||
    (effectiveFocusedCoord && cellByCoord.get(effectiveFocusedCoord)) ||
    null;

  const colLetters = useMemo(
    () =>
      Array.from({ length: safeCols }, (_, idx) =>
        String.fromCharCode(65 + idx)
      ),
    [safeCols]
  );
  const rowNumbers = useMemo(
    () => Array.from({ length: safeRows }, (_, idx) => String(idx + 1)),
    [safeRows]
  );

  return (
    <div
      style={{
        width: layout.totalWidth,
        height: layout.totalHeight,
      }}
      className="relative rounded-xl border border-[#D1A45D]/22 bg-[#1B1612]/94 select-none shadow-[inset_1px_1px_0_rgba(229,188,116,0.10),0_16px_34px_rgba(5,4,3,0.62)]"
    >
      {/* Column Headers (A..E) */}
      <div
        aria-hidden="true"
        style={{
          left: layout.gridOffsetX,
          top: layout.padding,
          width: layout.gridWidth,
          height: layout.colHeaderHeight,
        }}
        className="pointer-events-none absolute"
      >
        {colLetters.map((letter, colIdx) => {
          const isActiveCol = activeHighlightCell?.col === colIdx;
          return (
            <div
              key={letter}
              style={{
                left: colIdx * (layout.cardWidth + layout.gap),
                top: 0,
                width: layout.cardWidth,
                height: layout.colHeaderHeight,
              }}
              className={`absolute flex items-center justify-center font-mono text-[11px] font-bold tracking-widest transition-colors duration-150 ${
                isActiveCol ? "text-[#E5BC74]" : "text-[#C8B9A1]/65"
              }`}
            >
              {letter}
            </div>
          );
        })}
      </div>

      {/* Row Headers (1..N) */}
      <div
        aria-hidden="true"
        style={{
          left: layout.padding,
          top: layout.gridOffsetY,
          width: layout.rowHeaderWidth,
          height: layout.gridHeight,
        }}
        className="pointer-events-none absolute"
      >
        {rowNumbers.map((num, rowIdx) => {
          const isActiveRow = activeHighlightCell?.row === rowIdx;
          return (
            <div
              key={num}
              style={{
                left: 0,
                top: rowIdx * (layout.cardHeight + layout.gap),
                width: layout.rowHeaderWidth,
                height: layout.cardHeight,
              }}
              className={`absolute flex items-center justify-end pr-1.5 font-mono text-[11px] font-bold transition-colors duration-150 ${
                isActiveRow ? "text-[#E5BC74]" : "text-[#C8B9A1]/65"
              }`}
            >
              {num}
            </div>
          );
        })}
      </div>

      {/* Interactive Suspect Grid (keyed by sessionKey so new cases deal onto the desk) */}
      <div
        key={sessionKey}
        role="grid"
        aria-label={`${safeCols} by ${safeRows} suspect investigation board`}
        aria-rowcount={safeRows}
        aria-colcount={safeCols}
        style={{
          left: layout.gridOffsetX,
          top: layout.gridOffsetY,
          width: layout.gridWidth,
          height: layout.gridHeight,
        }}
        className="absolute z-10"
      >
        {rowNumbers.map((_, rowIdx) => (
          <div
            key={`row-${rowIdx}`}
            role="row"
            aria-rowindex={rowIdx + 1}
            style={{
              left: 0,
              top: rowIdx * (layout.cardHeight + layout.gap),
              width: layout.gridWidth,
              height: layout.cardHeight,
            }}
            className="absolute"
          >
            {colLetters.map((__, colIdx) => {
              const cell = cellByPos.get(`${rowIdx},${colIdx}`);
              const leftPx = colIdx * (layout.cardWidth + layout.gap);

              if (!cell) {
                return (
                  <div
                    key={`empty-${rowIdx}-${colIdx}`}
                    role="gridcell"
                    aria-colindex={colIdx + 1}
                    style={{
                      left: leftPx,
                      top: 0,
                      width: layout.cardWidth,
                      height: layout.cardHeight,
                    }}
                    className="absolute"
                  />
                );
              }

              // Brisk diagonal deal stagger capped under 210ms total per choreograph skill
              const dealDelayMs = Math.min(210, rowIdx * 28 + colIdx * 22);

              return (
                <div
                  key={cell.coord}
                  role="gridcell"
                  aria-colindex={colIdx + 1}
                  style={{
                    left: leftPx,
                    top: 0,
                    width: layout.cardWidth,
                    height: layout.cardHeight,
                  }}
                  className="absolute"
                >
                  <CardTile
                    cell={cell}
                    layout={layout}
                    dealDelayMs={dealDelayMs}
                    isSelected={selectedCellCoord === cell.coord}
                    isReferenced={highlightedSet.has(cell.coord)}
                    isHinted={hintedCellCoord === cell.coord}
                    isPending={pendingCoord === cell.coord}
                    isStampAnimating={stampAnimatingCoord === cell.coord}
                    isRejected={rejectedCoord === cell.coord}
                    rejectedAssessment={
                      rejectedCoord === cell.coord ? rejectedAssessment : null
                    }
                    rejectRunId={rejectRunId}
                    note={notes[cell.coord]}
                    actionsDisabled={actionsDisabled}
                    tabIndex={effectiveFocusedCoord === cell.coord ? 0 : -1}
                    buttonRef={setButtonRef(cell.coord)}
                    onSelect={onSelectCell}
                    onFocusCell={setFocusedCoord}
                    onKeyDown={handleCellKeyDown(rowIdx, colIdx)}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Clean SVG Evidence Overlay */}
      <EvidenceOverlay
        layout={layout}
        cells={cells}
        selectedClue={selectedClue}
        pinnedClues={pinnedClues}
        hintedCellCoord={hintedCellCoord}
        reducedMotion={reducedMotion}
      />
    </div>
  );
};
