import React, { useState } from "react";
import { Activity, ChevronDown, ChevronUp, Cpu } from "lucide-react";
import type { RunMetrics, TraceStep } from "../../types";

export interface BenchmarkHudProps {
  metrics: RunMetrics | null;
  lastStep: TraceStep | null;
  isAutoSolving: boolean;
  isStepPending: boolean;
  isSolved: boolean;
  isDrawerMode: boolean;
}

function formatMs(value: number): string {
  if (value < 10) return `${value.toFixed(2)} ms`;
  if (value < 100) return `${value.toFixed(1)} ms`;
  return `${Math.round(value)} ms`;
}

export const BenchmarkHud: React.FC<BenchmarkHudProps> = ({
  metrics,
  lastStep,
  isAutoSolving,
  isStepPending,
  isSolved,
  isDrawerMode,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(() => !isDrawerMode);
  const isActive = isAutoSolving || isStepPending;

  const primaryVars = metrics ? metrics.max_primary_vars : 0;
  const auxVars = metrics ? metrics.max_aux_vars : 0;
  const clauses = metrics ? metrics.max_clauses : 0;
  const satQueries = metrics ? metrics.sat_queries : 0;
  const decisions = metrics ? metrics.decisions : 0;
  const propagations = metrics ? metrics.propagations : 0;
  const backtracks = metrics ? metrics.backtracks : 0;
  const deductionSteps = metrics ? metrics.deduction_steps : 0;
  const solverMs = metrics ? formatMs(metrics.solver_runtime_ms) : "0.00 ms";
  const wallMs = metrics ? formatMs(metrics.wall_time_ms) : "0.00 ms";

  const containerPosition = isDrawerMode
    ? "fixed left-3 top-[64px] z-20 max-w-[calc(100vw-1.5rem)]"
    : "fixed left-4 bottom-4 z-20 w-[284px]";

  return (
    <section
      aria-label="Live SAT benchmark metrics"
      className={`pointer-events-auto ${containerPosition} select-none`}
    >
      <div className="hud-glass rounded-xl border border-[#D1A45D]/22 overflow-hidden shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          className="w-full px-3 py-2 flex items-center justify-between gap-2 hover:bg-white/[0.04] transition-colors cursor-pointer focus-ring-amber"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`inline-flex h-2 w-2 rounded-full shrink-0 ${
                isActive
                  ? "bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.9)]"
                  : isSolved && metrics
                    ? "bg-emerald-400"
                    : "bg-[#D1A45D]/60"
              }`}
            />
            <Cpu className="w-3.5 h-3.5 text-[#D1A45D] shrink-0" />
            <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#F4ECDD] font-semibold truncate">
              SAT Benchmark
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isExpanded && (
              <span className="text-[11px] font-mono tabular-nums text-[#D1A45D]">
                {satQueries}q · {solverMs}
              </span>
            )}
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#A49B8E]" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5 text-[#A49B8E]" />
            )}
          </div>
        </button>

        {isExpanded && (
          <div className="px-3 pb-2.5 pt-1 border-t border-white/[0.06] space-y-2">
            {/* Live step status */}
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="inline-flex items-center gap-1 text-[#A49B8E]">
                <Activity className="w-3 h-3 text-[#D1A45D]" />
                {isActive
                  ? "Solving..."
                  : isSolved && metrics
                    ? "Solved"
                    : metrics
                      ? "Paused / Ready"
                      : "Awaiting AI Step"}
              </span>
              {lastStep ? (
                <span className="text-[#E6DEC8] tabular-nums">
                  #{lastStep.step} → {lastStep.verdict_cell}{" "}
                  <span
                    className={
                      lastStep.verdict_status === "CRIMINAL"
                        ? "text-rose-300"
                        : "text-emerald-300"
                    }
                  >
                    {lastStep.verdict_status}
                  </span>
                </span>
              ) : (
                <span className="text-[#78716C]">—</span>
              )}
            </div>

            {/* Primary metrics grid (6 benchmark dimensions) */}
            <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono">
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wider text-[#A49B8E]">
                  Vars (P/A)
                </div>
                <div className="text-[#F4ECDD] font-semibold tabular-nums mt-0.5">
                  {primaryVars}
                  <span className="text-[#A49B8E] font-normal">
                    /{auxVars}
                  </span>
                </div>
              </div>

              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wider text-[#A49B8E]">
                  Clauses
                </div>
                <div className="text-[#F4ECDD] font-semibold tabular-nums mt-0.5">
                  {clauses.toLocaleString()}
                </div>
              </div>

              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wider text-[#A49B8E]">
                  SAT Calls
                </div>
                <div className="text-[#D1A45D] font-semibold tabular-nums mt-0.5">
                  {satQueries.toLocaleString()}
                </div>
              </div>

              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wider text-[#A49B8E]">
                  Decisions
                </div>
                <div className="text-[#F4ECDD] font-semibold tabular-nums mt-0.5">
                  {decisions.toLocaleString()}
                </div>
              </div>

              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wider text-[#A49B8E]">
                  Propagate
                </div>
                <div className="text-[#F4ECDD] font-semibold tabular-nums mt-0.5">
                  {propagations.toLocaleString()}
                </div>
              </div>

              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wider text-[#A49B8E]">
                  Backtracks
                </div>
                <div className="text-[#F4ECDD] font-semibold tabular-nums mt-0.5">
                  {backtracks.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Deduction steps & runtime */}
            <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono">
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wider text-[#A49B8E]">
                  Steps
                </div>
                <div className="text-[#F4ECDD] font-semibold tabular-nums mt-0.5">
                  {deductionSteps}
                </div>
              </div>

              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wider text-[#A49B8E]">
                  Solver
                </div>
                <div className="text-emerald-300 font-semibold tabular-nums mt-0.5">
                  {solverMs}
                </div>
              </div>

              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wider text-[#A49B8E]">
                  Wall
                </div>
                <div className="text-[#E6DEC8] font-semibold tabular-nums mt-0.5">
                  {wallMs}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
