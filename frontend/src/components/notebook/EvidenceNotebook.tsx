import React, { useId, useState } from "react";
import {
  Activity,
  BookOpen,
  Eraser,
  Pin,
  Sparkles,
  X,
} from "lucide-react";
import type {
  ActiveClue,
  LogEntry,
  RunMetrics,
  TraceStep,
} from "../../types";
import { ModalFrame } from "../modals/ModalFrame";

export interface EvidenceNotebookProps {
  clues: ActiveClue[];
  logs: LogEntry[];
  selectedClueId: string | null;
  pinnedClueIds: string[];
  newClueIds: string[];
  hintedClueIds: string[];
  lastMetrics: RunMetrics | null;
  lastStep: TraceStep | null;
  hasClueFocus?: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSelectClue: (clueId: string | null) => void;
  onTogglePinClue: (clueId: string) => void;
  onClearFocus: () => void;
}

export const EvidenceNotebook: React.FC<EvidenceNotebookProps> = ({
  clues,
  logs,
  selectedClueId,
  pinnedClueIds,
  newClueIds,
  hintedClueIds,
  lastMetrics,
  lastStep,
  hasClueFocus = false,
  isMobile,
  isTablet,
  isOpen,
  onClose,
  onSelectClue,
  onTogglePinClue,
  onClearFocus,
}) => {
  const [showSatTrace, setShowSatTrace] = useState(false);
  const headingId = useId();
  const isDrawerMode = isMobile || isTablet;

  if (!isOpen) return null;

  const panelContent = (
    <div className="flex flex-col max-h-[inherit] text-[#F4ECDD] select-none overflow-hidden">
      {/* Minimal Header */}
      <div className="shrink-0 px-3.5 py-2.5 border-b border-[#D1A45D]/15 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen
            className="w-3.5 h-3.5 text-[#E5BC74] shrink-0"
            aria-hidden="true"
          />
          <h2
            id={headingId}
            className="font-serif text-[15px] font-bold tracking-wide text-[#F4ECDD] truncate"
          >
            {showSatTrace ? "SAT Solver Trace" : "Clues"}
          </h2>
          {!showSatTrace && (
            <span className="font-mono text-[11px] font-semibold text-[#C8B9A1]">
              {clues.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {hasClueFocus && !showSatTrace && (
            <button
              type="button"
              onClick={onClearFocus}
              aria-label="Clear highlighted clues"
              title="Clear highlight"
              className="btn-tactile inline-flex items-center justify-center w-7 h-7 rounded-full text-[#E5BC74] hover:bg-white/[0.08] cursor-pointer"
            >
              <Eraser className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowSatTrace((v) => !v)}
            aria-pressed={showSatTrace}
            aria-label={showSatTrace ? "Show clues" : "Show SAT solver trace"}
            title={showSatTrace ? "Back to clues" : "SAT solver trace"}
            className={`btn-tactile inline-flex items-center justify-center w-7 h-7 rounded-full cursor-pointer ${
              showSatTrace
                ? "bg-[#E5BC74]/22 text-[#E5BC74]"
                : "text-[#C8B9A1] hover:text-[#F4ECDD] hover:bg-white/[0.08]"
            }`}
          >
            <Activity className="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Hide clues panel"
            title="Hide panel"
            className="btn-tactile inline-flex items-center justify-center w-7 h-7 rounded-full text-[#C8B9A1] hover:text-[#F4ECDD] hover:bg-white/[0.08] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2">
        {!showSatTrace ? (
          clues.length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 text-center text-xs text-[#C8B9A1]">
              No clues revealed yet.
            </div>
          ) : (
            clues.map((clue) => {
              const isSelected = selectedClueId === clue.clue_id;
              const pinIndex = pinnedClueIds.indexOf(clue.clue_id);
              const isPinned = pinIndex >= 0;
              const isNew = newClueIds.includes(clue.clue_id);
              const isHinted = hintedClueIds.includes(clue.clue_id);

              return (
                <div
                  key={clue.clue_id}
                  className={`animate-clue-in group relative rounded-xl border transition-colors duration-150 ${
                    isSelected
                      ? "bg-[#E5BC74]/[0.13] border-[#E5BC74]/75"
                      : isPinned
                        ? pinIndex === 0
                          ? "bg-[#7EA6BE]/[0.12] border-[#7EA6BE]/70"
                          : "bg-[#C9896B]/[0.12] border-[#C9896B]/70"
                        : "bg-white/[0.03] border-white/[0.07] hover:border-[#D1A45D]/35 hover:bg-white/[0.05]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      onSelectClue(isSelected ? null : clue.clue_id)
                    }
                    aria-pressed={isSelected}
                    className="w-full text-left p-2.5 pr-9 cursor-pointer rounded-xl"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <img
                        src={clue.owner_avatar_url}
                        alt=""
                        className="w-4.5 h-4.5 rounded-full object-cover border border-[#D1A45D]/45 shrink-0"
                      />
                      <span className="font-mono text-[11px] font-bold text-[#E5BC74]">
                        {clue.owner_coord}
                      </span>
                      <span className="text-xs font-semibold text-[#C8B9A1] truncate">
                        {clue.owner_name}
                      </span>
                      {isNew && (
                        <span
                          title="Newly revealed clue"
                          className="w-1.5 h-1.5 rounded-full bg-[#E5BC74] shrink-0"
                        />
                      )}
                      {isHinted && (
                        <Sparkles
                          className="w-3 h-3 text-[#E5BC74] shrink-0"
                          aria-hidden="true"
                        />
                      )}
                    </div>

                    <p className="text-[13.5px] leading-snug font-medium text-[#F4ECDD] select-text">
                      {clue.text}
                    </p>
                  </button>

                  {/* Discrete Pin Toggle */}
                  <button
                    type="button"
                    onClick={() => onTogglePinClue(clue.clue_id)}
                    aria-pressed={isPinned}
                    aria-label={
                      isPinned
                        ? `Unpin clue from ${clue.owner_coord}`
                        : `Pin clue from ${clue.owner_coord}`
                    }
                    title={isPinned ? "Unpin clue" : "Pin clue on board"}
                    className={`btn-tactile absolute top-2 right-2 inline-flex items-center justify-center w-6 h-6 rounded-full cursor-pointer ${
                      isPinned
                        ? pinIndex === 0
                          ? "bg-[#7EA6BE]/25 text-[#C7DFEE]"
                          : "bg-[#C9896B]/25 text-[#ECC5B3]"
                        : "text-[#988974] opacity-65 group-hover:opacity-100 hover:text-[#F4ECDD] hover:bg-white/[0.08]"
                    }`}
                  >
                    <Pin className="w-3 h-3" aria-hidden="true" />
                  </button>
                </div>
              );
            })
          )
        ) : (
          /* Compact Optional SAT Telemetry & Log View */
          <div className="flex flex-col gap-2.5">
            {(lastMetrics || lastStep) && (
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-2.5 font-mono text-[11px] grid grid-cols-2 gap-x-3 gap-y-1">
                <div className="flex justify-between">
                  <span className="text-[#C8B9A1]">Queries</span>
                  <span className="font-bold text-[#F4ECDD]">
                    {lastMetrics?.sat_queries ?? lastStep?.sat_queries ?? 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#C8B9A1]">Clauses</span>
                  <span className="font-bold text-[#F4ECDD]">
                    {lastStep?.clause_count ?? lastMetrics?.max_clauses ?? 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#C8B9A1]">Propagations</span>
                  <span className="font-bold text-[#F4ECDD]">
                    {lastMetrics?.propagations ??
                      lastStep?.stats.propagations ??
                      0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#C8B9A1]">Time</span>
                  <span className="font-bold text-[#8CE0CE]">
                    {(
                      lastMetrics?.solver_runtime_ms ??
                      lastStep?.stats.runtime_ms ??
                      0
                    ).toFixed(2)}
                    ms
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5 font-mono text-[11px]">
              {logs
                .slice(-14)
                .reverse()
                .map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-1.5 text-[#DFD4C2] leading-relaxed break-words"
                  >
                    <span className="text-[10px] text-[#988974] mr-1.5">
                      {entry.time}
                    </span>
                    <span>
                      {entry.text.replace(/^\[[A-Z0-9_]+\]\s*/, "")}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (isDrawerMode) {
    return (
      <ModalFrame
        isOpen={isOpen}
        onClose={onClose}
        labelledBy={headingId}
        variant="drawer"
        backdropClassName="bg-black/60"
        containerClassName="w-full h-[78vh] md:h-full md:w-[340px] rounded-t-2xl md:rounded-none overflow-hidden border-t md:border-t-0 md:border-l border-[#D1A45D]/20 hud-glass"
      >
        {panelContent}
      </ModalFrame>
    );
  }

  return (
    <aside
      aria-labelledby={headingId}
      className="animate-panel-in fixed top-[66px] right-4 z-20 w-[290px] xl:w-[306px] max-h-[calc(100vh-9.5rem)] rounded-2xl border border-[#D1A45D]/20 hud-glass flex flex-col overflow-hidden"
    >
      {panelContent}
    </aside>
  );
};
