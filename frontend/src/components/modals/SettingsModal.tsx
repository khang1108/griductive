import React, { useId, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CloudRain,
  RotateCcw,
  Settings,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { AutoSolveSpeed, QualityMode, UserSettings } from "../../types";
import { ModalFrame } from "./ModalFrame";

export interface SettingsModalProps {
  isOpen: boolean;
  settings: UserSettings;
  osReducedMotion: boolean;
  onUpdateSettings: (patch: Partial<UserSettings>) => void;
  onResetSettings: () => void;
  onClose: () => void;
}

const QUALITY_CHOICES: { value: QualityMode; label: string; hint: string }[] = [
  {
    value: "high",
    label: "High",
    hint: "2K shadows, full DPR & rich reflections",
  },
  {
    value: "standard",
    label: "Standard",
    hint: "1K shadows & balanced GPU load",
  },
];

const SPEED_CHOICES: { value: AutoSolveSpeed; label: string }[] = [
  { value: "slow", label: "Slow" },
  { value: "normal", label: "Normal" },
  { value: "fast", label: "Fast" },
];

const CC0_ASSETS = [
  { name: "wooden_table_02", artists: "Serhii Khromov" },
  { name: "desk_lamp_arm_01", artists: "Kuutti Siitonen & Yann Kervran" },
  { name: "binder_notebook", artists: "DaDrood" },
  { name: "stationery_supplies", artists: "Mateusz Sadek" },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  osReducedMotion,
  onUpdateSettings,
  onResetSettings,
  onClose,
}) => {
  const titleId = useId();
  const sfxSliderId = useId();
  const rainSliderId = useId();
  const [creditsOpen, setCreditsOpen] = useState(false);

  const sfxPercent = Math.round(settings.sfxVolume * 100);
  const rainPercent = Math.round(settings.ambientVolume * 100);

  return (
    <ModalFrame
      isOpen={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      containerClassName="w-full max-w-[440px] max-h-[88vh] flex flex-col animate-panel-in"
    >
      <div className="rounded-2xl border border-[#4A3B2F] bg-[#1B1612] text-[#F4ECDD] overflow-hidden flex flex-col lamp-panel-shadow">
        {/* Header */}
        <div className="shrink-0 px-5 py-3.5 bg-[#211B16] border-b border-[#3A2E25] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-[#E5BC74]" aria-hidden="true" />
            <h2
              id={titleId}
              className="font-serif text-lg font-bold tracking-wide text-[#F4ECDD]"
            >
              Settings
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="btn-tactile inline-flex items-center justify-center w-8 h-8 rounded-full text-[#C8B9A1] hover:text-[#F4ECDD] hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* 3D Quality */}
          <section aria-label="3D render quality">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#C8B9A1] mb-2">
              3D Scene Quality
            </div>
            <div className="grid grid-cols-2 gap-2">
              {QUALITY_CHOICES.map((opt) => {
                const active = settings.quality === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onUpdateSettings({ quality: opt.value })}
                    aria-pressed={active}
                    className={`btn-tactile px-3 py-2.5 rounded-xl border text-left cursor-pointer flex flex-col ${
                      active
                        ? "bg-[#33281B] border-[#E5BC74] text-[#F4ECDD]"
                        : "bg-[#241E18] border-[#3A2E25] text-[#C8B9A1] hover:text-[#F4ECDD] hover:border-[#6A5746]"
                    }`}
                  >
                    <span className="text-xs font-bold text-[#F4ECDD]">
                      {opt.label}
                    </span>
                    <span className="text-[10.5px] text-[#C8B9A1] leading-snug mt-0.5">
                      {opt.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Auto-Solve Pacing */}
          <section aria-label="Auto-solve speed">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#C8B9A1] mb-2">
              Auto-Solve Speed
            </div>
            <div className="grid grid-cols-3 gap-2">
              {SPEED_CHOICES.map((opt) => {
                const active = settings.autoSolveSpeed === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      onUpdateSettings({ autoSolveSpeed: opt.value })
                    }
                    aria-pressed={active}
                    className={`btn-tactile h-[38px] px-3 rounded-xl border text-xs font-bold cursor-pointer ${
                      active
                        ? "bg-[#33281B] border-[#E5BC74] text-[#E5BC74]"
                        : "bg-[#241E18] border-[#3A2E25] text-[#C8B9A1] hover:text-[#F4ECDD]"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Motion */}
          <section aria-label="Motion preferences" className="flex flex-col gap-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#C8B9A1]">
              Motion
            </div>

            <div className="rounded-xl border border-[#3A2E25] bg-[#241E18] p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#F4ECDD]">
                  Reduced Motion
                </div>
                <div className="text-[11px] text-[#C8B9A1]">
                  {osReducedMotion
                    ? "Enabled via OS preference."
                    : "Disables camera glides, particles & stamp motion."}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.reducedMotion || osReducedMotion}
                onClick={() =>
                  onUpdateSettings({ reducedMotion: !settings.reducedMotion })
                }
                className={`btn-tactile shrink-0 h-[34px] min-w-[68px] px-3 rounded-lg border text-xs font-bold cursor-pointer ${
                  settings.reducedMotion || osReducedMotion
                    ? "bg-[#33281B] border-[#E5BC74] text-[#E5BC74]"
                    : "bg-[#171310] border-[#3A2E25] text-[#C8B9A1]"
                }`}
              >
                {settings.reducedMotion || osReducedMotion ? "On" : "Off"}
              </button>
            </div>
          </section>

          {/* Audio */}
          <section aria-label="Audio settings" className="flex flex-col gap-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#C8B9A1]">
              Audio & Rain
            </div>

            <div className="rounded-xl border border-[#3A2E25] bg-[#241E18] p-3.5 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#F4ECDD]">
                  {settings.muted ? (
                    <VolumeX
                      className="w-4 h-4 text-[#E88B81]"
                      aria-hidden="true"
                    />
                  ) : (
                    <Volume2
                      className="w-4 h-4 text-[#8CE0CE]"
                      aria-hidden="true"
                    />
                  )}
                  <span>Sound</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!settings.muted}
                  onClick={() => onUpdateSettings({ muted: !settings.muted })}
                  className={`btn-tactile h-[34px] min-w-[68px] px-3 rounded-lg border text-xs font-bold cursor-pointer ${
                    settings.muted
                      ? "bg-[#2C1514] border-[#E88B81] text-[#F3B5AF]"
                      : "bg-[#132823] border-[#548D80] text-[#8CE0CE]"
                  }`}
                >
                  {settings.muted ? "Muted" : "On"}
                </button>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor={sfxSliderId} className="text-[#C8B9A1]">
                    Foley SFX
                  </label>
                  <span className="font-mono font-bold text-[#E5BC74] tabular-nums">
                    {sfxPercent}%
                  </span>
                </div>
                <input
                  id={sfxSliderId}
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={sfxPercent}
                  onChange={(e) =>
                    onUpdateSettings({
                      sfxVolume: Number(e.target.value) / 100,
                    })
                  }
                  className="w-full accent-[#E5BC74] cursor-pointer"
                />
              </div>

              <div className="pt-2 border-t border-[#342B22] flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#F4ECDD]">
                    <CloudRain
                      className="w-4 h-4 text-[#8FB3CC]"
                      aria-hidden="true"
                    />
                    <span>Midnight Rain</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.ambientRain}
                    onClick={() =>
                      onUpdateSettings({ ambientRain: !settings.ambientRain })
                    }
                    className={`btn-tactile h-[34px] min-w-[68px] px-3 rounded-lg border text-xs font-bold cursor-pointer ${
                      settings.ambientRain
                        ? "bg-[#33281B] border-[#E5BC74] text-[#E5BC74]"
                        : "bg-[#171310] border-[#3A2E25] text-[#C8B9A1]"
                    }`}
                  >
                    {settings.ambientRain ? "On" : "Off"}
                  </button>
                </div>

                {settings.ambientRain && (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor={rainSliderId} className="text-[#C8B9A1]">
                        Rain Volume
                      </label>
                      <span className="font-mono font-bold text-[#E5BC74] tabular-nums">
                        {rainPercent}%
                      </span>
                    </div>
                    <input
                      id={rainSliderId}
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={rainPercent}
                      onChange={(e) =>
                        onUpdateSettings({
                          ambientVolume: Number(e.target.value) / 100,
                        })
                      }
                      className="w-full accent-[#E5BC74] cursor-pointer"
                    />
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Collapsible 3D Credits */}
          <section className="rounded-xl border border-[#3A2E25] bg-[#171310] overflow-hidden">
            <button
              type="button"
              onClick={() => setCreditsOpen((open) => !open)}
              aria-expanded={creditsOpen}
              className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs font-semibold text-[#C8B9A1] hover:text-[#F4ECDD] cursor-pointer"
            >
              <span>3D Models · Poly Haven (CC0)</span>
              {creditsOpen ? (
                <ChevronDown
                  className="w-3.5 h-3.5 text-[#E5BC74]"
                  aria-hidden="true"
                />
              ) : (
                <ChevronRight
                  className="w-3.5 h-3.5 text-[#C8B9A1]"
                  aria-hidden="true"
                />
              )}
            </button>

            {creditsOpen && (
              <ul className="px-3.5 pb-3 pt-1 border-t border-[#2E251D] flex flex-col gap-1 text-[11px]">
                {CC0_ASSETS.map((asset) => (
                  <li
                    key={asset.name}
                    className="flex items-center justify-between gap-2 text-[#C8B9A1]"
                  >
                    <span className="font-mono text-[#E5BC74]">
                      {asset.name}
                    </span>
                    <span>{asset.artists}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 bg-[#171310] border-t border-[#3A2E25] flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onResetSettings}
            className="btn-tactile inline-flex items-center gap-1.5 h-[38px] px-3 rounded-xl border border-[#3A2E25] bg-[#241E18] hover:bg-[#2E2720] text-xs font-semibold text-[#C8B9A1] hover:text-[#F4ECDD] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="btn-tactile inline-flex items-center justify-center h-[38px] px-5 rounded-xl bg-[#E5BC74] hover:bg-[#EECA8A] text-[#14110E] text-xs font-bold cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </ModalFrame>
  );
};
