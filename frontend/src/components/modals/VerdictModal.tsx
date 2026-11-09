import React from "react";
import type { CellData } from "../../types";

interface VerdictModalProps {
  cell: CellData | null;
  darkMode: boolean;
  onSelectVerdict: (coord: string, status: "CRIMINAL" | "INNOCENT") => void;
  onClose: () => void;
}

export const VerdictModal: React.FC<VerdictModalProps> = ({
  cell,
  darkMode,
  onSelectVerdict,
  onClose,
}) => {
  if (!cell) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`w-full max-w-[380px] rounded-2xl border p-6 flex flex-col items-center text-center shadow-2xl transform transition-all duration-300 scale-100 ${
          darkMode
            ? "bg-[#241E1A] border-[#3A312B] text-[#F6EFE6]"
            : "bg-[#FFFBF5] border-[#DDD0BF] text-[#1C1917]"
        }`}
      >
        {/* Large Avatar */}
        <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-amber-500/40 shadow-lg p-0.5 mb-3.5">
          <img
            src={cell.avatar_url}
            alt={cell.name}
            className="w-full h-full object-cover rounded-xl"
          />
        </div>

        {/* Suspect Name */}
        <h2 className="font-serif text-2xl font-bold tracking-tight">
          {cell.name}
        </h2>

        {/* Coord & Profession */}
        <p className="font-mono text-xs font-semibold opacity-75 mt-0.5">
          {cell.coord} · {cell.profession}
        </p>

        {/* Deduction guidance */}
        <p className="text-xs italic opacity-65 my-4 px-2 leading-relaxed">
          Only lock a verdict the revealed statements actually prove.
          A correct call flips the card and reveals the next lead.
        </p>

        {/* Action Buttons */}
        <div className="w-full grid grid-cols-2 gap-3 mb-4">
          <button
            onClick={() => onSelectVerdict(cell.coord, "INNOCENT")}
            className="w-full py-2.5 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 bg-emerald-500/15 hover:bg-emerald-500 hover:text-white border-emerald-500 text-emerald-400 cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <span>INNOCENT</span>
          </button>

          <button
            onClick={() => onSelectVerdict(cell.coord, "CRIMINAL")}
            className="w-full py-2.5 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 bg-red-500/15 hover:bg-red-500 hover:text-white border-red-500 text-red-400 cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
            <span>CRIMINAL</span>
          </button>
        </div>

        {/* Cancel Button */}
        <button
          onClick={onClose}
          className="text-xs font-semibold opacity-60 hover:opacity-100 transition-opacity cursor-pointer p-1"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

