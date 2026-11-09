import React from "react";
import type { CellData } from "../../types";
import { CardTile } from "./CardTile";

interface BoardProps {
  size: number;
  cells: CellData[];
  highlightedCoords: string[];
  darkMode: boolean;
  onCardClick: (cell: CellData) => void;
  onClueClick: (cell: CellData) => void;
}

export const Board: React.FC<BoardProps> = ({
  size,
  cells,
  highlightedCoords,
  darkMode,
  onCardClick,
  onClueClick,
}) => {
  const colLetters = Array.from({ length: size }, (_, i) =>
    String.fromCharCode(65 + i)
  );
  const rowNumbers = Array.from({ length: size }, (_, i) => String(i + 1));

  // Build grid map by (row, col)
  const cellMap = new Map<string, CellData>();
  cells.forEach((c) => cellMap.set(`${c.row},${c.col}`, c));

  return (
    <div className="flex flex-col items-center justify-center p-6 select-none overflow-auto">
      {/* Column Headers Row */}
      <div className="flex items-center mb-2">
        {/* Top-left spacer for row numbers */}
        <div className="w-8 h-6" />
        <div className="flex gap-3">
          {colLetters.map((letter) => (
            <div
              key={letter}
              className="w-[146px] text-center font-mono text-xs font-extrabold opacity-60 tracking-wider"
            >
              {letter}
            </div>
          ))}
        </div>
      </div>

      {/* Grid Rows with Row Headers */}
      <div className="flex flex-col gap-3">
        {rowNumbers.map((rowNum, r) => (
          <div key={rowNum} className="flex items-center">
            {/* Row Header Number */}
            <div className="w-8 h-[174px] flex items-center justify-end pr-2 font-mono text-xs font-extrabold opacity-60">
              {rowNum}
            </div>

            {/* Cells in this row */}
            <div className="flex gap-3">
              {colLetters.map((_, c) => {
                const cell = cellMap.get(`${r},${c}`);
                if (!cell) return <div key={c} className="w-[146px] h-[174px]" />;
                const isHigh = highlightedCoords.includes(cell.coord);
                return (
                  <CardTile
                    key={cell.coord}
                    cell={cell}
                    isHighlighted={isHigh}
                    darkMode={darkMode}
                    onClick={onCardClick}
                    onClueClick={onClueClick}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

