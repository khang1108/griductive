import { useCallback, useEffect, useState } from "react";
import type {
  AutoSolveSpeed,
  UserSettings,
} from "../types";

const SETTINGS_STORAGE_KEY = "griductive.midnightArchive.settings.v2";

export interface ViewportState {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isCompactDesktop: boolean;
  isCompact: boolean;
}

function computeViewport(width: number, height: number): ViewportState {
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1024;
  const isCompactDesktop =
    !isMobile && !isTablet && (width < 1400 || height < 820);
  return {
    width,
    height,
    isMobile,
    isTablet,
    isCompactDesktop,
    isCompact: isMobile || isTablet || isCompactDesktop,
  };
}

function readInitialViewport(): ViewportState {
  if (typeof window === "undefined") {
    return computeViewport(1440, 900);
  }
  return computeViewport(window.innerWidth, window.innerHeight);
}

function readOsReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isAutoSolveSpeed(value: unknown): value is AutoSolveSpeed {
  return value === "slow" || value === "normal" || value === "fast";
}

function clampUnit(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

export function getDefaultSettings(
  viewport: ViewportState,
  osReducedMotion: boolean
): UserSettings {
  return {
    quality: viewport.isMobile ? "standard" : "high",
    viewMode: "overview",
    reducedMotion: osReducedMotion,
    muted: false,
    sfxVolume: 0.75,
    ambientRain: false,
    ambientVolume: 0.35,
    autoSolveSpeed: "normal",
    skipIntroOnRepeat: false,
  };
}

function loadPersistedSettings(
  viewport: ViewportState,
  osReducedMotion: boolean
): UserSettings {
  const defaults = getDefaultSettings(viewport, osReducedMotion);
  if (typeof window === "undefined") return defaults;

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return defaults;
    }
    const obj = parsed as Record<string, unknown>;
    return {
      quality:
        obj.quality === "high" || obj.quality === "standard"
          ? obj.quality
          : defaults.quality,
      viewMode: "overview",
      reducedMotion:
        typeof obj.reducedMotion === "boolean"
          ? obj.reducedMotion
          : defaults.reducedMotion,
      muted: typeof obj.muted === "boolean" ? obj.muted : defaults.muted,
      sfxVolume: clampUnit(obj.sfxVolume, defaults.sfxVolume),
      ambientRain:
        typeof obj.ambientRain === "boolean"
          ? obj.ambientRain
          : defaults.ambientRain,
      ambientVolume: clampUnit(obj.ambientVolume, defaults.ambientVolume),
      autoSolveSpeed: isAutoSolveSpeed(obj.autoSolveSpeed)
        ? obj.autoSolveSpeed
        : defaults.autoSolveSpeed,
      skipIntroOnRepeat:
        typeof obj.skipIntroOnRepeat === "boolean"
          ? obj.skipIntroOnRepeat
          : defaults.skipIntroOnRepeat,
    };
  } catch {
    return defaults;
  }
}

export interface UseSettingsReturn {
  settings: UserSettings;
  updateSettings: (patch: Partial<UserSettings>) => void;
  resetSettings: () => void;
  osReducedMotion: boolean;
  effectiveReducedMotion: boolean;
  viewport: ViewportState;
}

export function useSettings(): UseSettingsReturn {
  const [viewport, setViewport] = useState<ViewportState>(() =>
    readInitialViewport()
  );
  const [osReducedMotion, setOsReducedMotion] = useState<boolean>(() =>
    readOsReducedMotion()
  );
  const [settings, setSettings] = useState<UserSettings>(() =>
    loadPersistedSettings(readInitialViewport(), readOsReducedMotion())
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      setViewport(computeViewport(window.innerWidth, window.innerHeight));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (event: MediaQueryListEvent) => {
      setOsReducedMotion(event.matches);
    };

    setOsReducedMotion(mql.matches);
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handleChange);
      return () => mql.removeEventListener("change", handleChange);
    }
    mql.addListener(handleChange);
    return () => mql.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify(settings)
      );
    } catch {
      // Ignore storage quota / private mode failures.
    }
  }, [settings]);

  const effectiveReducedMotion = settings.reducedMotion || osReducedMotion;

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.reducedMotion = effectiveReducedMotion
      ? "true"
      : "false";
  }, [effectiveReducedMotion]);

  const updateSettings = useCallback((patch: Partial<UserSettings>) => {
    setSettings((prev) => ({
      ...prev,
      ...patch,
      sfxVolume:
        patch.sfxVolume !== undefined
          ? clampUnit(patch.sfxVolume, prev.sfxVolume)
          : prev.sfxVolume,
      ambientVolume:
        patch.ambientVolume !== undefined
          ? clampUnit(patch.ambientVolume, prev.ambientVolume)
          : prev.ambientVolume,
    }));
  }, []);

  const resetSettings = useCallback(() => {
    const defaults = getDefaultSettings(viewport, osReducedMotion);
    setSettings(defaults);
  }, [viewport, osReducedMotion]);

  return {
    settings,
    updateSettings,
    resetSettings,
    osReducedMotion,
    effectiveReducedMotion,
    viewport,
  };
}
