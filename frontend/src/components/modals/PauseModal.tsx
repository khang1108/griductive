import React from "react";
import { Play } from "lucide-react";

interface PauseModalProps {
  isOpen: boolean;
  elapsedSeconds: number;
  darkMode: boolean;
  onResume: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  isOpen,
  elapsedSeconds,
  darkMode,
  onResume,
}) => {
  if (!isOpen) return null;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`w-full max-w-[360px] rounded-2xl border p-8 flex flex-col items-center text-center shadow-2xl transition-all ${
          darkMode
            ? "bg-[#241E1A] border-[#3A312B] text-[#F6EFE6]"
            : "bg-[#FFFBF5] border-[#DDD0BF] text-[#1C1917]"
        }`}
      >
        {/* Pause Icon */}
        <div className="w-14 h-14 rounded-full border-2 border-current opacity-70 flex items-center justify-center mb-4">
          <span className="font-mono text-2xl font-bold tracking-tighter">⏸</span>
        </div>

        {/* Title */}
        <h2 className="font-serif text-3xl font-bold tracking-tight mb-2">
          Paused
        </h2>

        {/* Time Spent */}
        <p className="text-xs opacity-75 mb-6">
          You've spent <b className="font-mono">{formatTime(elapsedSeconds)}</b> on this grid. Take your time.
        </p>

        {/* Resume Button */}
        <button
          onClick={onResume}
          className="w-full py-3 px-6 rounded-xl font-bold text-sm bg-[#E07A5F] hover:bg-[#F08C73] text-white flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>Resume</span>
        </button>
      </div>
    </div>
  );
};

