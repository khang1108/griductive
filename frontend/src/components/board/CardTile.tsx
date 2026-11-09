import React from "react";
import type { CellData } from "../../types";

interface CardTileProps {
  cell: CellData;
  isHighlighted: boolean;
  darkMode: boolean;
  onClick: (cell: CellData) => void;
  onClueClick: (cell: CellData) => void;
}

export const CardTile: React.FC<CardTileProps> = ({
  cell,
  isHighlighted,
  darkMode,
  onClick,
  onClueClick,
}) => {
  const isRevealed = cell.is_revealed;
  const isCriminal = cell.status === "CRIMINAL";
  const isInnocent = cell.status === "INNOCENT";

  const handleClick = () => {
    if (!isRevealed) {
      onClick(cell);
    } else if (cell.clue_text) {
      onClueClick(cell);
    }
  };

  // Base card surface colors
  let cardSurfaceClass = darkMode
    ? "bg-[#241E1A] border-[#3A312B] text-[#E2D7C8]"
    : "bg-[#FFFBF5] border-[#DDD0BF] text-[#292524]";

  if (isRevealed) {
    if (isCriminal) {
      cardSurfaceClass = darkMode
        ? "bg-[#281817] border-red-500/80 text-[#F6EFE6] shadow-[0_0_12px_rgba(239,68,68,0.25)]"
        : "bg-[#FFF1F2] border-red-500/80 text-[#1C1917] shadow-[0_0_12px_rgba(239,68,68,0.15)]";
    } else if (isInnocent) {
      cardSurfaceClass = darkMode
        ? "bg-[#17241A] border-emerald-500/80 text-[#F6EFE6] shadow-[0_0_12px_rgba(34,197,94,0.25)]"
        : "bg-[#F0FDF4] border-emerald-500/80 text-[#1C1917] shadow-[0_0_12px_rgba(34,197,94,0.15)]";
    }
  }

  // Highlight / Spotlight glow overlay
  if (isHighlighted) {
    cardSurfaceClass += darkMode
      ? " ring-2 ring-amber-400 bg-[#362714] shadow-[0_0_20px_rgba(245,158,11,0.5)] border-amber-400"
      : " ring-2 ring-amber-500 bg-[#FEF3C7] shadow-[0_0_20px_rgba(217,119,6,0.4)] border-amber-500";
  }

  return (
    <div
      onClick={handleClick}
      className={`group relative w-[146px] h-[174px] rounded-xl border p-2.5 flex flex-col items-center justify-between cursor-pointer select-none transition-all duration-300 ease-out transform hover:-translate-y-1 hover:shadow-lg active:scale-95 ${cardSurfaceClass}`}
    >
      {/* Top row: Coordinate + Status Pill */}
      <div className="w-full flex items-center justify-between text-[11px] font-mono leading-none">
        <span className="font-bold opacity-75">{cell.coord}</span>
        {isRevealed ? (
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold tracking-wider border ${
              isCriminal
                ? "bg-red-500/20 text-red-400 border-red-500/40"
                : "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
            }`}
          >
            {isCriminal ? "🔴 CRIMINAL" : "🟢 INNOCENT"}
          </span>
        ) : (
          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-white/5 opacity-60">
            ?
          </span>
        )}
      </div>

      {/* Center: Suspect Avatar with rounded ring */}
      <div className="relative my-0.5">
        <div
          className={`w-[68px] h-[68px] rounded-xl overflow-hidden border p-0.5 transition-all duration-300 group-hover:scale-105 ${
            isHighlighted
              ? "border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
              : darkMode
              ? "border-[#4A3E35] bg-[#1A1513]"
              : "border-[#DDD0BF] bg-[#ECE3D6]"
          }`}
        >
          <img
            src={cell.avatar_url}
            alt={cell.name}
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              isRevealed ? "opacity-100" : "opacity-85"
            }`}
            loading="lazy"
          />
        </div>
      </div>

      {/* Bottom: Name & Subtitle / Statement */}
      <div className="w-full text-center flex flex-col justify-end">
        <h3 className="font-serif text-[13.5px] font-bold tracking-tight leading-tight">
          {cell.name}
        </h3>
        {isRevealed && cell.clue_text ? (
          <p className="text-[9.5px] font-semibold text-amber-400 line-clamp-2 leading-snug mt-0.5">
            🔍 {cell.clue_text}
          </p>
        ) : (
          <p className="text-[10px] italic opacity-70 truncate mt-0.5">
            {cell.profession}
          </p>
        )}
      </div>
    </div>
  );
};

