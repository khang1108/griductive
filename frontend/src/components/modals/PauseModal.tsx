import React, { useId } from "react";
import { Clock, Pause, Play, ShieldAlert } from "lucide-react";
import { ModalFrame } from "./ModalFrame";

export interface PauseModalProps {
  isOpen: boolean;
  elapsedSeconds: number;
  onResume: () => void;
}

function formatClock(secs: number): string {
  const safe = Math.max(0, Math.floor(secs));
  const m = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const s = (safe % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  isOpen,
  elapsedSeconds,
  onResume,
}) => {
  const titleId = useId();
  const descId = useId();

  return (
    <ModalFrame
      isOpen={isOpen}
      onClose={onResume}
      labelledBy={titleId}
      describedBy={descId}
      closeOnBackdropClick={false}
      containerClassName="w-full max-w-[390px]"
    >
      <div className="rounded-2xl border border-[#4A3B2F] bg-[#1D1814] text-[#F2E9D8] p-6 sm:p-7 flex flex-col items-center text-center lamp-panel-shadow">
        <div className="w-12 h-12 rounded-full border border-[#E5BC74]/60 bg-[#2C241B] flex items-center justify-center mb-4">
          <Pause className="w-5 h-5 text-[#E5BC74]" aria-hidden="true" />
        </div>

        <h2
          id={titleId}
          className="font-serif text-2xl font-bold tracking-tight text-[#F2E9D8]"
        >
          Investigation Paused
        </h2>

        <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#3A2E25] bg-[#16130F] font-mono text-sm font-bold text-[#E5BC74] tabular-nums">
          <Clock className="w-4 h-4" aria-hidden="true" />
          <span>Shift Timer: {formatClock(elapsedSeconds)}</span>
        </div>

        <div
          id={descId}
          className="mt-4 rounded-xl border border-[#3A2E25] bg-[#241E18] px-3.5 py-2.5 text-xs leading-relaxed text-[#C5B69E] flex items-start gap-2 text-left"
        >
          <ShieldAlert
            className="w-4 h-4 text-[#E5BC74] shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <span>
            Any verdict or AI request already sent to the server will complete safely.
          </span>
        </div>

        <button
          type="button"
          onClick={onResume}
          className="mt-6 w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl bg-[#E5BC74] hover:bg-[#EECA8A] text-[#171512] text-sm font-bold transition-colors cursor-pointer"
        >
          <Play className="w-4 h-4 fill-current" aria-hidden="true" />
          <span>Resume Shift</span>
        </button>
      </div>
    </ModalFrame>
  );
};
