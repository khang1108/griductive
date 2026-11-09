import React, { useEffect } from "react";
import confetti from "canvas-confetti";
import { Trophy, Clock, CheckCircle, RotateCcw } from "lucide-react";

interface VictoryModalProps {
  isOpen: boolean;
  elapsedSeconds: number;
  solvedCount: number;
  darkMode: boolean;
  onRestart: () => void;
  onNextStage?: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  isOpen,
  elapsedSeconds,
  solvedCount,
  darkMode,
  onRestart,
  onNextStage,
}) => {
  useEffect(() => {
    if (isOpen) {
      // Fire confetti burst
      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {
        // Ignore if confetti not supported
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div
        className={`w-full max-w-[420px] rounded-3xl border p-8 flex flex-col items-center text-center shadow-2xl transition-all scale-100 ${
          darkMode
            ? "bg-[#241E1A] border-amber-500/50 text-[#F6EFE6]"
            : "bg-[#FFFBF5] border-amber-500/50 text-[#1C1917]"
        }`}
      >
        {/* Trophy Icon Badge */}
        <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border-2 border-amber-500 flex items-center justify-center mb-4 shadow-lg shadow-amber-500/20 animate-bounce">
          <Trophy className="w-8 h-8 text-amber-400" />
        </div>

        {/* Title */}
        <h2 className="font-serif text-3xl font-extrabold tracking-tight mb-2">
          Mystery Solved!
        </h2>
        <p className="text-xs opacity-75 mb-6">
          Outstanding deduction! Every suspect on the board has been classified with pure propositional logic.
        </p>

        {/* Stats Row */}
        <div className="w-full grid grid-cols-2 gap-3 mb-6">
          <div
            className={`p-3 rounded-xl border flex flex-col items-center ${
              darkMode ? "bg-[#1A1513] border-[#3A312B]" : "bg-[#ECE3D6] border-[#DDD0BF]"
            }`}
          >
            <Clock className="w-4 h-4 text-amber-500 mb-1" />
            <span className="text-[10px] uppercase font-bold opacity-60">Time</span>
            <span className="font-mono text-sm font-extrabold">{formatTime(elapsedSeconds)}</span>
          </div>

          <div
            className={`p-3 rounded-xl border flex flex-col items-center ${
              darkMode ? "bg-[#1A1513] border-[#3A312B]" : "bg-[#ECE3D6] border-[#DDD0BF]"
            }`}
          >
            <CheckCircle className="w-4 h-4 text-emerald-500 mb-1" />
            <span className="text-[10px] uppercase font-bold opacity-60">Classified</span>
            <span className="font-mono text-sm font-extrabold">{solvedCount} Suspects</span>
          </div>
        </div>

        {/* Buttons */}
        <div className="w-full flex flex-col gap-2.5">
          {onNextStage && (
            <button
              onClick={onNextStage}
              className="w-full py-3 px-6 rounded-xl font-bold text-sm bg-[#E07A5F] hover:bg-[#F08C73] text-white flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer"
            >
              Play Next Mystery Case
            </button>
          )}

          <button
            onClick={onRestart}
            className={`w-full py-2.5 px-4 rounded-xl font-semibold text-xs border flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer ${
              darkMode
                ? "bg-[#1A1513] border-[#3A312B] hover:bg-[#2E2722]"
                : "bg-[#ECE3D6] border-[#DDD0BF] hover:bg-[#F8EFE4]"
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Play Again</span>
          </button>
        </div>
      </div>
    </div>
  );
};

