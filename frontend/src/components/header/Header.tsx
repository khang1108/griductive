import React from "react";
import {
  Pause,
  RotateCcw,
  Lightbulb,
  Zap,
  Sun,
  Moon,
  ChevronDown,
  Square,
} from "lucide-react";
import type { StageInfo } from "../../types";

interface HeaderProps {
  currentStage: string;
  availableStages: string[];
  stageCatalog?: StageInfo[];
  solvedCount: number;
  totalCells: number;
  elapsedSeconds: number;
  darkMode: boolean;
  onStageChange: (stage: string) => void;
  onPause: () => void | Promise<void>;
  onRestart: () => void;
  onHint: () => void;
  onAutoSolve: () => void;
  onStopAutoSolve: () => void | Promise<void>;
  isAutoSolving: boolean;
  isStopping: boolean;
  actionsDisabled: boolean;
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentStage,
  availableStages,
  stageCatalog,
  solvedCount,
  totalCells,
  elapsedSeconds,
  darkMode,
  onStageChange,
  onPause,
  onRestart,
  onHint,
  onAutoSolve,
  onStopAutoSolve,
  isAutoSolving,
  isStopping,
  actionsDisabled,
  onToggleTheme,
}) => {
  const pauseDisabled = isStopping || (actionsDisabled && !isAutoSolving);
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const stageMap = React.useMemo(() => {
    const map = new Map<string, StageInfo>();
    if (stageCatalog) {
      stageCatalog.forEach((s) => map.set(s.puzzle_id, s));
    }
    return map;
  }, [stageCatalog]);

  const groups = React.useMemo(() => {
    const g3: { id: string; label: string }[] = [];
    const g4: { id: string; label: string }[] = [];
    const g5: { id: string; label: string }[] = [];

    availableStages.forEach((stg) => {
      const info = stageMap.get(stg);
      const name = info?.name || stg.replace(/_/g, " ").replace(".json", "");
      const diff = info?.difficulty ? ` [${info.difficulty.toUpperCase()}]` : "";
      const label = `${name}${diff}`;

      if (info) {
        if (info.size === 3) g3.push({ id: stg, label });
        else if (info.size === 4) g4.push({ id: stg, label });
        else if (info.size === 5) g5.push({ id: stg, label });
        else g3.push({ id: stg, label });
      } else {
        if (stg.includes("3x3")) g3.push({ id: stg, label });
        else if (stg.includes("4x4")) g4.push({ id: stg, label });
        else if (stg.includes("5x5")) g5.push({ id: stg, label });
        else g3.push({ id: stg, label });
      }
    });

    const list = [];
    if (g3.length > 0) list.push({ label: "3×3 Daily Grids", items: g3 });
    if (g4.length > 0) list.push({ label: "4×4 Mystery Cases", items: g4 });
    if (g5.length > 0) list.push({ label: "5×5 Master Investigations", items: g5 });
    return list;
  }, [availableStages, stageMap]);

  return (
    <header
      className={`px-5 py-3 border-b flex items-center justify-between transition-colors duration-200 select-none ${
        darkMode
          ? "bg-[#1A1513] border-[#3A312B] text-[#F6EFE6]"
          : "bg-[#ECE3D6] border-[#DDD0BF] text-[#1C1917]"
      }`}
    >
      {/* Left: Branding & Stage selector */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 cursor-pointer group">
          <span className="text-sm font-semibold opacity-60 group-hover:opacity-100 transition-opacity">
            &lsaquo;
          </span>
          <h1 className="font-serif text-xl font-extrabold tracking-wide">
            Griductive
          </h1>
        </div>

        {/* Stage Selector Dropdown */}
        <div className="relative">
          <select
            value={currentStage}
            onChange={(e) => onStageChange(e.target.value)}
            disabled={actionsDisabled}
            className={`appearance-none pl-3 pr-8 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer outline-none transition-colors ${
              darkMode
                ? "bg-[#241E1A] border-[#3A312B] text-[#E2D7C8] hover:border-[#55483F]"
                : "bg-[#FFFBF5] border-[#DDD0BF] text-[#292524] hover:border-[#BDB09E]"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {groups.map((grp) => (
              <optgroup
                key={grp.label}
                label={grp.label}
                className={darkMode ? "bg-[#1A1513] text-[#C2B29F] font-bold" : "bg-[#EDE5D8] text-[#4E4438] font-bold"}
              >
                {grp.items.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                    className={darkMode ? "bg-[#241E1A] text-white" : "bg-white text-black"}
                  >
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 opacity-60 pointer-events-none" />
        </div>

        {/* Solved Progress Pill */}
        <div
          className={`text-xs font-bold px-3 py-1 rounded-full border transition-colors ${
            darkMode
              ? "bg-[#241E1A] border-[#3A312B] text-[#E2D7C8]"
              : "bg-[#FFFBF5] border-[#DDD0BF] text-[#292524]"
          }`}
        >
          {solvedCount}/{totalCells} Solved
        </div>
      </div>

      {/* Right: Timer & Action Controls */}
      <div className="flex items-center gap-2.5">
        {/* Timer */}
        <div className="font-mono text-sm font-bold opacity-90 px-2 tracking-wider">
          {formatTime(elapsedSeconds)}
        </div>

        {/* Pause Button */}
        <button
          onClick={onPause}
          disabled={pauseDisabled}
          title="Pause game"
          className={`p-2 rounded-lg border transition-all active:scale-95 ${
            darkMode
              ? "bg-[#241E1A] border-[#3A312B] hover:bg-[#2E2722] text-[#E2D7C8]"
              : "bg-[#FFFBF5] border-[#DDD0BF] hover:bg-[#F8EFE4] text-[#292524]"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <Pause className="w-3.5 h-3.5 fill-current" />
        </button>

        <div className={`h-4 w-px mx-1 ${darkMode ? "bg-[#3A312B]" : "bg-[#DDD0BF]"}`} />

        {/* Restart */}
        <button
          onClick={onRestart}
          disabled={actionsDisabled}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all active:scale-95 ${
            darkMode
              ? "bg-[#241E1A] border-[#3A312B] hover:bg-[#2E2722] text-[#E2D7C8]"
              : "bg-[#FFFBF5] border-[#DDD0BF] hover:bg-[#F8EFE4] text-[#292524]"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Restart</span>
        </button>

        {/* Hint */}
        <button
          onClick={onHint}
          disabled={actionsDisabled}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all active:scale-95 ${
            darkMode
              ? "bg-[#241E1A] border-[#3A312B] hover:bg-[#2E2722] text-[#E2D7C8]"
              : "bg-[#FFFBF5] border-[#DDD0BF] hover:bg-[#F8EFE4] text-[#292524]"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
          <span>Hint</span>
        </button>

        {/* Auto Solve */}
        <button
          onClick={() => {
            if (isAutoSolving) void onStopAutoSolve();
            else onAutoSolve();
          }}
          disabled={isStopping || (!isAutoSolving && actionsDisabled)}
          aria-label={
            isStopping
              ? "Stopping auto solve"
              : isAutoSolving
              ? "Stop auto solve"
              : "Start auto solve"
          }
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all active:scale-95 ${
            darkMode
              ? "bg-[#241E1A] border-[#3A312B] hover:bg-[#2E2722] text-[#E2D7C8]"
              : "bg-[#FFFBF5] border-[#DDD0BF] hover:bg-[#F8EFE4] text-[#292524]"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isAutoSolving ? (
            <Square className="w-3 h-3 fill-current text-red-400" />
          ) : (
            <Zap className="w-3.5 h-3.5 text-amber-400" />
          )}
          <span>
            {isStopping ? "Stopping…" : isAutoSolving ? "Stop" : "Auto Solve"}
          </span>
        </button>

        {/* Theme Toggle */}
        <button
          onClick={onToggleTheme}
          title="Toggle Theme (Dark / Light)"
          className={`p-2 rounded-lg border transition-all active:scale-95 ${
            darkMode
              ? "bg-[#241E1A] border-[#3A312B] hover:bg-[#2E2722] text-amber-300"
              : "bg-[#FFFBF5] border-[#DDD0BF] hover:bg-[#F8EFE4] text-amber-600"
          }`}
        >
          {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>
      </div>
    </header>
  );
};

