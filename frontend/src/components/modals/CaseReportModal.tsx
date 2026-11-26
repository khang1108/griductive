import React, { useId } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileSearch,
  Lightbulb,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { RunMetrics, SolveModeUsed } from "../../types";
import { ModalFrame } from "./ModalFrame";

export interface CaseReportModalProps {
  isOpen: boolean;
  stageName: string;
  solveModeUsed: SolveModeUsed;
  elapsedSeconds: number;
  solvedCount: number;
  totalCells: number;
  clueCount: number;
  lastMetrics: RunMetrics | null;
  reducedMotion: boolean;
  onNextStage?: () => void;
  onRestart: () => void;
  onClose: () => void;
}

function formatClock(secs: number): string {
  const safe = Math.max(0, Math.floor(secs));
  const m = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const s = (safe % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const OUTCOME_METADATA: Record<
  SolveModeUsed,
  {
    badge: string;
    description: string;
    badgeClass: string;
  }
> = {
  manual: {
    badge: "Verified Manual Deduction",
    description:
      "Solved via manual investigation (server verified each submitted verdict against deductive proof).",
    badgeClass: "border-[#1E5D50] bg-[#1E5D50]/12 text-[#1E5D50]",
  },
  hint: {
    badge: "Hint-Assisted Deduction",
    description: "Solved with investigative hints used during the shift.",
    badgeClass: "border-[#8C621B] bg-[#D1A45D]/20 text-[#5C3E0C]",
  },
  ai: {
    badge: "DPLL SAT AI Assisted",
    description: "Solved with DPLL SAT AI assistance.",
    badgeClass: "border-[#3B5164] bg-[#526575]/15 text-[#2B3D4D]",
  },
};

export const CaseReportModal: React.FC<CaseReportModalProps> = ({
  isOpen,
  stageName,
  solveModeUsed,
  elapsedSeconds,
  solvedCount,
  totalCells,
  clueCount,
  lastMetrics,
  reducedMotion,
  onNextStage,
  onRestart,
  onClose,
}) => {
  const titleId = useId();
  const outcome = OUTCOME_METADATA[solveModeUsed];

  return (
    <ModalFrame
      isOpen={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      containerClassName="w-full max-w-[460px] max-h-[90vh] flex flex-col"
    >
      <div className="rounded-2xl border border-[#4A3B2F] bg-[#1D1814] overflow-hidden flex flex-col lamp-panel-shadow">
        {/* Top Archival Header */}
        <div className="px-5 py-3.5 bg-[#221D18] border-b border-[#3A2E25] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5B69E]">
              Midnight Archive · Final Dossier
            </div>
            <h2
              id={titleId}
              className="font-serif text-xl font-bold text-[#F2E9D8] break-words"
            >
              {stageName}
            </h2>
          </div>

          <div
            className={`shrink-0 px-3 py-1 rounded border-2 border-[#1E5D50] bg-[#E9DDC5] text-[#1E5D50] font-mono text-xs font-extrabold tracking-[0.15em] uppercase shadow-sm ${
              reducedMotion
                ? "transition-opacity duration-200 opacity-100"
                : "animate-stamp-slam"
            }`}
          >
            CASE CLOSED
          </div>
        </div>

        {/* Paper Dossier Body */}
        <div className="flex-1 overflow-y-auto paper-fiber text-[#211D18] p-5 flex flex-col gap-4">
          {/* Honest Outcome Summary */}
          <div className="rounded-xl border border-[#B5A284] bg-[#F4ECDC] p-3.5 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-bold ${outcome.badgeClass}`}
              >
                {solveModeUsed === "manual" ? (
                  <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                ) : solveModeUsed === "hint" ? (
                  <Lightbulb className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>{outcome.badge}</span>
              </span>
            </div>

            <p className="text-sm leading-relaxed text-[#211D18] font-medium">
              {outcome.description}
            </p>
          </div>

          {/* Core Case Stats */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-xl border border-[#B5A284] bg-[#F4ECDC] p-3 flex flex-col items-center text-center">
              <Clock className="w-4 h-4 text-[#574938] mb-1" aria-hidden="true" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#4D4337]">
                Shift Time
              </span>
              <span className="font-mono text-sm font-extrabold text-[#211D18] tabular-nums mt-0.5">
                {formatClock(elapsedSeconds)}
              </span>
            </div>

            <div className="rounded-xl border border-[#B5A284] bg-[#F4ECDC] p-3 flex flex-col items-center text-center">
              <CheckCircle2 className="w-4 h-4 text-[#1E5D50] mb-1" aria-hidden="true" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#4D4337]">
                Classified
              </span>
              <span className="font-mono text-sm font-extrabold text-[#211D18] tabular-nums mt-0.5">
                {solvedCount}/{totalCells}
              </span>
            </div>

            <div className="rounded-xl border border-[#B5A284] bg-[#F4ECDC] p-3 flex flex-col items-center text-center">
              <FileSearch className="w-4 h-4 text-[#574938] mb-1" aria-hidden="true" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#4D4337]">
                Active Clues
              </span>
              <span className="font-mono text-sm font-extrabold text-[#211D18] tabular-nums mt-0.5">
                {clueCount}
              </span>
            </div>
          </div>

          {/* Optional SAT Telemetry Summary */}
          {lastMetrics && (
            <section
              aria-label="SAT solver summary"
              className="rounded-xl border border-[#B5A284] bg-[#EFE3CA] p-3.5 flex flex-col gap-2"
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#211D18]">
                <Activity className="w-3.5 h-3.5 text-[#574938]" aria-hidden="true" />
                <span>SAT Solver Telemetry</span>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-[#3B3227]">
                <div className="flex justify-between">
                  <dt>Steps:</dt>
                  <dd className="font-bold text-[#211D18]">
                    {lastMetrics.deduction_steps}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>SAT queries:</dt>
                  <dd className="font-bold text-[#211D18]">
                    {lastMetrics.sat_queries}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Decisions:</dt>
                  <dd className="font-bold text-[#211D18]">
                    {lastMetrics.decisions}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Propagations:</dt>
                  <dd className="font-bold text-[#211D18]">
                    {lastMetrics.propagations}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Backtracks:</dt>
                  <dd className="font-bold text-[#211D18]">
                    {lastMetrics.backtracks}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Solver ms:</dt>
                  <dd className="font-bold text-[#1E5D50]">
                    {lastMetrics.solver_runtime_ms.toFixed(2)} ms
                  </dd>
                </div>
              </dl>
            </section>
          )}
        </div>

        {/* Dark Archival Footer Buttons */}
        <div className="px-5 py-4 bg-[#171410] border-t border-[#3A2E25] flex flex-col gap-2">
          {onNextStage && (
            <button
              type="button"
              onClick={onNextStage}
              className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-[#E5BC74] hover:bg-[#EECA8A] text-[#171512] text-sm font-bold transition-colors cursor-pointer"
            >
              <span>Next Case</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onRestart}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-[#3A2E25] bg-[#241E18] hover:bg-[#2F2720] text-[#F2E9D8] text-xs font-bold transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#E5BC74]" aria-hidden="true" />
              <span>Restart Case</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-[#548D80]/70 bg-[#132823] hover:bg-[#19362F] text-[#8CE0CE] text-xs font-bold transition-colors cursor-pointer"
            >
              <FileSearch className="w-3.5 h-3.5" aria-hidden="true" />
              <span>View Board & Log</span>
            </button>
          </div>
        </div>
      </div>
    </ModalFrame>
  );
};
