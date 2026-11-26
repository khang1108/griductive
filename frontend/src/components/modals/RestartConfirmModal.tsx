import React, { useId } from "react";
import { Eraser, Pencil, RotateCcw, X } from "lucide-react";
import { ModalFrame } from "./ModalFrame";

export interface RestartConfirmModalProps {
  isOpen: boolean;
  noteCount?: number;
  onRestartKeepNotes: () => void;
  onRestartClearNotes: () => void;
  onCancel: () => void;
}

export const RestartConfirmModal: React.FC<RestartConfirmModalProps> = ({
  isOpen,
  noteCount,
  onRestartKeepNotes,
  onRestartClearNotes,
  onCancel,
}) => {
  const titleId = useId();
  const descId = useId();

  return (
    <ModalFrame
      isOpen={isOpen}
      onClose={onCancel}
      labelledBy={titleId}
      describedBy={descId}
      containerClassName="w-full max-w-[400px]"
    >
      <div className="rounded-2xl border border-[#4A3B2F] bg-[#1D1814] text-[#F2E9D8] p-6 flex flex-col lamp-panel-shadow">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl border border-[#E5BC74]/60 bg-[#2C241B] flex items-center justify-center shrink-0">
              <Pencil className="w-4 h-4 text-[#E5BC74]" aria-hidden="true" />
            </div>
            <h2
              id={titleId}
              className="font-serif text-xl font-bold text-[#F2E9D8]"
            >
              Keep Personal Notes?
            </h2>
          </div>

          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel restart"
            className="inline-flex items-center justify-center min-h-[36px] min-w-[36px] rounded-lg text-[#C5B69E] hover:text-[#F2E9D8] hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <p
          id={descId}
          className="mt-3 text-xs sm:text-[13px] leading-relaxed text-[#C5B69E]"
        >
          You have{" "}
          {typeof noteCount === "number" && noteCount > 0
            ? `${noteCount} local pencil ${noteCount === 1 ? "note" : "notes"}`
            : "local pencil notes"}{" "}
          saved for this puzzle. Would you like to preserve your scratchpad notes when restarting?
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onRestartKeepNotes}
            className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-[#E5BC74] hover:bg-[#EECA8A] text-[#171512] text-xs font-bold transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            <span>Restart & Keep Notes</span>
          </button>

          <button
            type="button"
            onClick={onRestartClearNotes}
            className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl border border-[#AD5147]/80 bg-[#5A1E19] hover:bg-[#742620] text-[#F2E9D8] text-xs font-bold transition-colors cursor-pointer"
          >
            <Eraser className="w-4 h-4" aria-hidden="true" />
            <span>Restart & Clear Notes</span>
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="w-full inline-flex items-center justify-center min-h-[42px] px-4 rounded-xl border border-[#3A2E25] bg-[#241E18] hover:bg-[#2F2720] text-[#C5B69E] hover:text-[#F2E9D8] text-xs font-semibold transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalFrame>
  );
};
