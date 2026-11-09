import React, { useState } from "react";
import type { ActiveClue, LogEntry } from "../../types";
import { Search, Sparkles } from "lucide-react";

interface CaseEvidenceProps {
  clues: ActiveClue[];
  logs: LogEntry[];
  darkMode: boolean;
  highlightedCoords: string[];
  onHighlight: (coords: string[]) => void;
  onClearHighlight: () => void;
}

export const CaseEvidence: React.FC<CaseEvidenceProps> = ({
  clues,
  logs,
  darkMode,
  highlightedCoords,
  onHighlight,
  onClearHighlight,
}) => {
  const [activeTab, setActiveTab] = useState<"clues" | "log">("clues");

  return (
    <aside
      className={`w-[350px] shrink-0 border-l flex flex-col transition-colors duration-200 select-none ${
        darkMode
          ? "bg-[#1C1714] border-[#3A312B] text-[#E2D7C8]"
          : "bg-[#ECE3D6] border-[#DDD0BF] text-[#292524]"
      }`}
    >
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-amber-500" />
          <h2 className="font-serif text-sm font-extrabold tracking-wider uppercase">
            Case Evidence
          </h2>
        </div>

        {highlightedCoords.length > 0 && (
          <button
            onClick={onClearHighlight}
            className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-all active:scale-95 ${
              darkMode
                ? "bg-[#241E1A] border-[#3A312B] hover:bg-[#2E2722] text-amber-300"
                : "bg-[#FFFBF5] border-[#DDD0BF] hover:bg-[#F8EFE4] text-amber-700"
            }`}
          >
            Clear Glow
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b px-3 pt-2 gap-1 text-xs font-bold">
        <button
          onClick={() => setActiveTab("clues")}
          className={`px-3 py-1.5 rounded-t-lg transition-colors border-b-2 ${
            activeTab === "clues"
              ? "border-[#E07A5F] text-[#E07A5F] bg-white/5"
              : "border-transparent opacity-60 hover:opacity-100"
          }`}
        >
          Active Clues ({clues.length})
        </button>
        <button
          onClick={() => setActiveTab("log")}
          className={`px-3 py-1.5 rounded-t-lg transition-colors border-b-2 ${
            activeTab === "log"
              ? "border-[#E07A5F] text-[#E07A5F] bg-white/5"
              : "border-transparent opacity-60 hover:opacity-100"
          }`}
        >
          Deduction Log
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === "clues" ? (
          <div className="flex flex-col gap-2.5">
            <p className="text-[10.5px] italic opacity-60 mb-1">
              Click any statement below to spotlight its referenced region on the board.
            </p>

            {clues.length === 0 ? (
              <div className="text-center py-10 opacity-50 text-xs italic">
                No active clues revealed yet.
              </div>
            ) : (
              clues.map((clue) => {
                const isSelected =
                  clue.referenced_coords.length > 0 &&
                  clue.referenced_coords.every((c) =>
                    highlightedCoords.includes(c)
                  );

                return (
                  <div
                    key={clue.clue_id}
                    onClick={() => onHighlight(clue.referenced_coords)}
                    className={`p-2.5 rounded-xl border cursor-pointer transition-all duration-200 group ${
                      isSelected
                        ? "border-amber-400 bg-amber-500/10 shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                        : darkMode
                        ? "bg-[#241E1A] border-[#3A312B] hover:bg-[#2E2722] hover:border-[#55483F]"
                        : "bg-[#FFFBF5] border-[#DDD0BF] hover:bg-[#F8EFE4] hover:border-[#BDB09E]"
                    }`}
                  >
                    {/* Clue Item Header */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <img
                          src={clue.owner_avatar_url}
                          alt={clue.owner_name}
                          className="w-5 h-5 rounded-full object-cover border border-amber-500/40"
                        />
                        <span className="font-mono text-xs font-bold">
                          {clue.owner_coord}
                        </span>
                        <span className="text-[11px] font-medium opacity-70">
                          ({clue.owner_name})
                        </span>
                      </div>
                      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-[#E07A5F]/15 text-[#E07A5F]">
                        {clue.type}
                      </span>
                    </div>

                    {/* Statement Body */}
                    <p className="text-xs font-semibold leading-relaxed">
                      {clue.text}
                    </p>

                    {/* Referenced coords */}
                    {clue.referenced_coords.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] font-mono opacity-65">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        <span>References: {clue.referenced_coords.join(", ")}</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="font-mono text-[11px] flex flex-col gap-1.5 leading-relaxed">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`p-1.5 rounded ${
                  log.type === "success"
                    ? "text-emerald-400 bg-emerald-950/30"
                    : log.type === "error"
                    ? "text-red-400 bg-red-950/30"
                    : "opacity-80"
                }`}
              >
                <span className="opacity-40 text-[9.5px] mr-1.5">{log.time}</span>
                {log.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};

