import React, { useMemo } from "react";
import {
  BookOpen,
  ChevronDown,
  Loader2,
  Pause,
  Settings,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { StageInfo } from "../../types";

export interface HeaderProps {
  currentStage: string;
  availableStages: string[];
  stageCatalog?: StageInfo[];
  solvedCount: number;
  totalCells: number;
  elapsedSeconds: number;
  clueCount: number;
  newClueCount?: number;
  muted: boolean;
  isPaused: boolean;
  actionsDisabled: boolean;
  isAutoSolving?: boolean;
  isAutoSolveStopping?: boolean;
  isStageLoading?: boolean;
  isNotebookOpen: boolean;
  onStageChange: (stage: string) => void;
  onToggleMute: () => void;
  onPause: () => void | Promise<void>;
  onOpenSettings: () => void;
  onToggleNotebook: () => void;
}

function formatClock(secs: number): string {
  const safe = Math.max(0, Math.floor(secs));
  const m = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const s = (safe % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatStageLabel(stageId: string, info?: StageInfo): string {
  const rawName = (
    info?.name || stageId.replace(/_/g, " ").replace(/\.json$/i, "")
  ).trim();
  const sizeStr = info?.size ? `${info.size}×${info.size}` : "";
  const alreadyHasSize =
    /\b[345]\s*[x×]\s*[345]\b/i.test(rawName);
  if (!sizeStr || alreadyHasSize) {
    return rawName.replace(/\b([345])x([345])\b/gi, "$1×$2");
  }
  return `${rawName} · ${sizeStr}`;
}

export const Header: React.FC<HeaderProps> = ({
  currentStage,
  availableStages,
  stageCatalog,
  solvedCount,
  totalCells,
  elapsedSeconds,
  clueCount,
  newClueCount = 0,
  muted,
  isPaused,
  actionsDisabled,
  isAutoSolving = false,
  isAutoSolveStopping = false,
  isStageLoading = false,
  isNotebookOpen,
  onStageChange,
  onToggleMute,
  onPause,
  onOpenSettings,
  onToggleNotebook,
}) => {
  const pauseDisabled =
    isPaused ||
    isAutoSolveStopping ||
    isStageLoading ||
    (actionsDisabled && !isAutoSolving);

  const stageGroups = useMemo(() => {
    const infoMap = new Map<string, StageInfo>();
    if (stageCatalog) {
      for (const entry of stageCatalog) {
        infoMap.set(entry.puzzle_id, entry);
      }
    }

    const g3: { id: string; label: string }[] = [];
    const g4: { id: string; label: string }[] = [];
    const g5: { id: string; label: string }[] = [];
    const gOther: { id: string; label: string }[] = [];

    const stageIds =
      availableStages.length > 0
        ? availableStages
        : stageCatalog?.map((s) => s.puzzle_id) ?? [];

    for (const stageId of stageIds) {
      const info = infoMap.get(stageId);
      const label = formatStageLabel(stageId, info);
      const inferredSize =
        info?.size ??
        (stageId.includes("3x3")
          ? 3
          : stageId.includes("4x4")
            ? 4
            : stageId.includes("5x5")
              ? 5
              : 0);

      if (inferredSize === 3) g3.push({ id: stageId, label });
      else if (inferredSize === 4) g4.push({ id: stageId, label });
      else if (inferredSize === 5) g5.push({ id: stageId, label });
      else gOther.push({ id: stageId, label });
    }

    const groups: { label: string; items: { id: string; label: string }[] }[] =
      [];
    if (g3.length > 0) groups.push({ label: "3×3", items: g3 });
    if (g4.length > 0) groups.push({ label: "4×4", items: g4 });
    if (g5.length > 0) groups.push({ label: "5×5", items: g5 });
    if (gOther.length > 0) groups.push({ label: "Cases", items: gOther });
    return groups;
  }, [availableStages, stageCatalog]);

  return (
    <header className="pointer-events-none fixed top-3 inset-x-3 sm:top-4 sm:inset-x-5 z-30 flex items-center justify-between gap-2 select-none">
      {/* Left Floating Capsule: Wordmark + Clean Case Selector */}
      <div className="pointer-events-auto hud-glass rounded-full border border-[#D1A45D]/20 pl-3.5 pr-1.5 py-1 flex items-center gap-2.5 min-w-0 max-w-[58vw] sm:max-w-none">
        <h1 className="hidden sm:block font-serif text-[17px] font-bold tracking-wide text-[#F4ECDD] shrink-0">
          Griductive
        </h1>
        <span
          aria-hidden="true"
          className="hidden sm:block w-px h-4 bg-[#D1A45D]/20 shrink-0"
        />

        <div className="relative min-w-0 w-[165px] sm:w-[215px]">
          <select
            aria-label="Select investigation case"
            value={currentStage}
            onChange={(e) => onStageChange(e.target.value)}
            disabled={actionsDisabled}
            aria-busy={isStageLoading}
            className="w-full appearance-none pl-2.5 pr-7 py-1 min-h-[34px] text-xs font-semibold rounded-full bg-transparent text-[#F4ECDD] hover:bg-white/[0.04] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed truncate focus-ring-amber"
          >
            {stageGroups.map((grp) => (
              <optgroup
                key={grp.label}
                label={grp.label}
                className="bg-[#171310] text-[#C8B9A1] font-bold"
              >
                {grp.items.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                    className="bg-[#211B16] text-[#F4ECDD]"
                  >
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {isStageLoading ? (
            <Loader2
              className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-[#E5BC74] animate-spin pointer-events-none"
              aria-hidden="true"
            />
          ) : (
            <ChevronDown
              className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-[#C8B9A1] pointer-events-none"
              aria-hidden="true"
            />
          )}
        </div>
      </div>

      {/* Right Floating Capsule: Quiet Progress + Timer + Utility Icons + Clues Toggle */}
      <div className="pointer-events-auto hud-glass rounded-full border border-[#D1A45D]/20 px-1.5 py-1 flex items-center gap-1">
        {/* Solved Fraction + Clock */}
        <div className="flex items-center gap-2.5 px-2.5 py-1 text-xs font-mono tabular-nums">
          <span
            aria-label={`Progress: ${solvedCount} of ${totalCells} suspects confirmed`}
            className="inline-flex items-center gap-1.5 font-bold text-[#E5BC74]"
            title={`${solvedCount} of ${totalCells} confirmed`}
          >
            <span
              aria-hidden="true"
              className="w-1.5 h-1.5 rounded-full bg-[#E5BC74]"
            />
            {solvedCount}/{totalCells}
          </span>

          <span
            aria-hidden="true"
            className="hidden md:inline-block w-px h-3.5 bg-[#D1A45D]/20"
          />

          <span
            aria-label={`Shift timer ${formatClock(elapsedSeconds)}`}
            className="hidden md:inline text-[#C8B9A1] font-medium"
          >
            {formatClock(elapsedSeconds)}
          </span>
        </div>

        {/* Mute Toggle */}
        <button
          type="button"
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label={muted ? "Unmute audio" : "Mute audio"}
          title={muted ? "Unmute audio" : "Mute audio"}
          className="btn-tactile hidden sm:inline-flex items-center justify-center w-[34px] h-[34px] rounded-full text-[#C8B9A1] hover:text-[#F4ECDD] hover:bg-white/[0.07] cursor-pointer focus-ring-amber"
        >
          {muted ? (
            <VolumeX className="w-3.5 h-3.5 text-[#E88B81]" aria-hidden="true" />
          ) : (
            <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
          )}
        </button>

        {/* Pause */}
        <button
          type="button"
          onClick={() => void onPause()}
          disabled={pauseDisabled}
          aria-label="Pause investigation"
          title="Pause"
          className="btn-tactile inline-flex items-center justify-center w-[34px] h-[34px] rounded-full text-[#C8B9A1] hover:text-[#F4ECDD] hover:bg-white/[0.07] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-ring-amber"
        >
          <Pause className="w-3.5 h-3.5" aria-hidden="true" />
        </button>

        {/* Settings */}
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Open settings"
          title="Settings"
          className="btn-tactile inline-flex items-center justify-center w-[34px] h-[34px] rounded-full text-[#C8B9A1] hover:text-[#F4ECDD] hover:bg-white/[0.07] cursor-pointer focus-ring-amber"
        >
          <Settings className="w-3.5 h-3.5" aria-hidden="true" />
        </button>

        {/* Clues Panel Toggle */}
        <button
          type="button"
          onClick={onToggleNotebook}
          aria-label={`${isNotebookOpen ? "Hide" : "Show"} clues (${clueCount})`}
          aria-expanded={isNotebookOpen}
          className={`btn-tactile relative inline-flex items-center gap-1.5 h-[34px] pl-2.5 pr-2 rounded-full text-xs font-semibold cursor-pointer focus-ring-amber ${
            isNotebookOpen
              ? "bg-[#E5BC74]/18 text-[#F4ECDD] border border-[#E5BC74]/45"
              : "text-[#C8B9A1] hover:text-[#F4ECDD] hover:bg-white/[0.07] border border-transparent"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5 text-[#E5BC74]" aria-hidden="true" />
          <span className="hidden sm:inline">Clues</span>
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#E5BC74]/22 text-[#E5BC74] font-mono text-[10.5px] font-bold">
            {clueCount}
          </span>
          {newClueCount > 0 && !isNotebookOpen && (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#E5BC74]"
            />
          )}
        </button>
      </div>
    </header>
  );
};
