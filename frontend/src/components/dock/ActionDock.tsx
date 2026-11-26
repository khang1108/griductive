import React from "react";
import {
  Eraser,
  Lightbulb,
  Loader2,
  RotateCcw,
  Sparkles,
  Square,
  StepForward,
} from "lucide-react";

export interface ActionDockProps {
  isSolved: boolean;
  isContradicted: boolean;
  actionsDisabled: boolean;
  isHintPending: boolean;
  isStepPending: boolean;
  isAutoSolving: boolean;
  isAutoSolveStopping: boolean;
  hasClueFocus: boolean;
  onHint: () => void | Promise<void>;
  onStepAi: () => void | Promise<void>;
  onStartAutoSolve: () => void;
  onStopAutoSolve: () => void | Promise<void>;
  onRestart: () => void;
  onClearClueFocus: () => void;
}

export const ActionDock: React.FC<ActionDockProps> = ({
  isSolved,
  isContradicted,
  actionsDisabled,
  isHintPending,
  isStepPending,
  isAutoSolving,
  isAutoSolveStopping,
  hasClueFocus,
  onHint,
  onStepAi,
  onStartAutoSolve,
  onStopAutoSolve,
  onRestart,
  onClearClueFocus,
}) => {
  const solverLocked = actionsDisabled || isSolved || isContradicted;

  return (
    <footer
      aria-label="Investigation controls"
      className="pointer-events-none fixed bottom-3.5 sm:bottom-4 inset-x-3 z-30 flex justify-center select-none"
    >
      <div className="pointer-events-auto hud-glass rounded-full border border-[#D1A45D]/22 p-1.5 flex items-center gap-1 sm:gap-1.5">
        {/* Hint */}
        <button
          type="button"
          onClick={() => void onHint()}
          disabled={solverLocked || isHintPending}
          className="btn-tactile inline-flex items-center justify-center gap-1.5 h-[38px] px-3.5 rounded-full text-xs font-semibold text-[#F4ECDD] hover:bg-white/[0.07] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-ring-amber"
        >
          {isHintPending ? (
            <Loader2
              className="w-3.5 h-3.5 text-[#E5BC74] animate-spin"
              aria-hidden="true"
            />
          ) : (
            <Lightbulb className="w-3.5 h-3.5 text-[#E5BC74]" aria-hidden="true" />
          )}
          <span>Hint</span>
        </button>

        {/* AI Step */}
        <button
          type="button"
          onClick={() => void onStepAi()}
          disabled={solverLocked || isStepPending}
          title="Execute one proven SAT deduction step"
          className="btn-tactile inline-flex items-center justify-center gap-1.5 h-[38px] px-3.5 rounded-full text-xs font-semibold text-[#F4ECDD] hover:bg-white/[0.07] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-ring-amber"
        >
          {isStepPending ? (
            <Loader2
              className="w-3.5 h-3.5 text-[#E5BC74] animate-spin"
              aria-hidden="true"
            />
          ) : (
            <StepForward className="w-3.5 h-3.5 text-[#C8B9A1]" aria-hidden="true" />
          )}
          <span>AI Step</span>
        </button>

        {/* Auto-Solve / Stop */}
        <button
          type="button"
          onClick={() => {
            if (isAutoSolving) void onStopAutoSolve();
            else onStartAutoSolve();
          }}
          disabled={isAutoSolveStopping || (!isAutoSolving && solverLocked)}
          aria-label={
            isAutoSolveStopping
              ? "Stopping auto-solve"
              : isAutoSolving
                ? "Stop auto-solve"
                : "Auto-solve case"
          }
          className={`btn-tactile inline-flex items-center justify-center gap-1.5 h-[38px] px-4 rounded-full text-xs font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-ring-amber ${
            isAutoSolving
              ? "bg-[#7A241D] text-[#F4ECDD] border border-[#E88B81]/50 hover:bg-[#8E2B23]"
              : "bg-[#E5BC74]/16 text-[#F4ECDD] border border-[#E5BC74]/35 hover:bg-[#E5BC74]/26"
          }`}
        >
          {isAutoSolving ? (
            <Square
              className="w-3 h-3 fill-current text-[#F4B1A8]"
              aria-hidden="true"
            />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-[#E5BC74]" aria-hidden="true" />
          )}
          <span>
            {isAutoSolveStopping
              ? "Stopping…"
              : isAutoSolving
                ? "Stop"
                : "Auto-Solve"}
          </span>
        </button>

        <span
          aria-hidden="true"
          className="w-px h-5 bg-[#D1A45D]/20 mx-0.5 shrink-0"
        />

        {/* Clear Clue Spotlight (shown ONLY when active) */}
        {hasClueFocus && (
          <button
            type="button"
            onClick={onClearClueFocus}
            aria-label="Clear board highlight"
            title="Clear board highlight"
            className="btn-tactile inline-flex items-center justify-center w-[38px] h-[38px] rounded-full text-[#E5BC74] hover:bg-white/[0.08] cursor-pointer focus-ring-amber"
          >
            <Eraser className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}

        {/* Restart Case */}
        <button
          type="button"
          onClick={onRestart}
          disabled={actionsDisabled}
          aria-label="Restart case"
          title="Restart case"
          className="btn-tactile inline-flex items-center justify-center w-[38px] h-[38px] rounded-full text-[#C8B9A1] hover:text-[#F4ECDD] hover:bg-white/[0.07] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-ring-amber"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </footer>
  );
};
