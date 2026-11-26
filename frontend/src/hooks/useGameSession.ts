import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  executeAutoSolveStep,
  fetchGameState,
  fetchHint,
  loadStage,
  restartGame,
  submitVerdict,
} from "../api/client";
import { soundEngine } from "../audio/soundEngine";
import type {
  ActiveClue,
  BannerState,
  CellData,
  GameState,
  LogEntry,
  PresentationState,
  RunMetrics,
  SolveModeUsed,
  StepResponse,
  TraceStep,
  UserSettings,
  VerdictAssessmentType,
  VerdictStatus,
} from "../types";
import { AUTO_SOLVE_SPEED_DELAYS, useAutoSolve } from "./useAutoSolve";

const INTRO_DURATION_MS = 1050;
const STAMP_DURATION_MS = 260;
const REJECT_DURATION_MS = 1900;

const DEFAULT_FALLBACK_SETTINGS: UserSettings = {
  quality: "high",
  viewMode: "overview",
  reducedMotion: false,
  muted: false,
  sfxVolume: 0.75,
  ambientRain: false,
  ambientVolume: 0.35,
  autoSolveSpeed: "normal",
  skipIntroOnRepeat: false,
};

export interface UseGameSessionOptions {
  settings?: UserSettings;
  effectiveReducedMotion?: boolean;
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const secs = (safe % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function formatTraceStep(response: StepResponse): string | null {
  const step = response.step;
  if (!step) return null;

  const clueIds = step.active_clue_ids.length
    ? step.active_clue_ids.join(", ")
    : "none";
  const newClue = step.new_clue_id
    ? response.state.active_clues.find(
        (clue) => clue.clue_id === step.new_clue_id
      )
    : undefined;
  return [
    `Step ${step.step}: ${step.verdict_cell} classified as ${step.verdict_status}`,
    `clues ${clueIds}`,
    `${step.sat_queries} SAT queries`,
    `${step.primary_vars_count} primary + ${step.aux_vars_count} aux vars`,
    `${step.clause_count} clauses`,
    `new clue ${step.new_clue_id ?? "none"}${newClue ? `: ${newClue.text}` : ""}`,
    `decisions ${step.stats.decisions}, propagations ${step.stats.propagations}, backtracks ${step.stats.backtracks}`,
    `${step.stats.runtime_ms.toFixed(2)} ms`,
  ].join(" · ");
}

function findNewlyRevealedClueIds(
  previousState: GameState | null,
  nextState: GameState
): string[] {
  if (!previousState) return [];
  const prevIds = new Set(previousState.active_clues.map((c) => c.clue_id));
  return nextState.active_clues
    .map((c) => c.clue_id)
    .filter((id) => !prevIds.has(id));
}

function makeLogId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

type FailedStageAction =
  | { kind: "load"; stage: string }
  | { kind: "restart" }
  | null;

export interface UseGameSessionReturn {
  // Authoritative & Loading State
  gameState: GameState | null;
  initialLoading: boolean;
  loadError: string | null;
  isStageLoading: boolean;
  stageError: string | null;

  // Presentation State
  presentation: PresentationState;

  // UI Focus & Investigation State
  selectedCellCoord: string | null;
  selectedCell: CellData | null;
  selectedClueId: string | null;
  selectedClue: ActiveClue | null;
  pinnedClueIds: string[];
  pinnedClues: ActiveClue[];
  highlightedCoords: string[];
  isPaused: boolean;
  elapsedSeconds: number;
  banner: BannerState;
  logs: LogEntry[];

  // Run Telemetry & Case Report Metadata
  usedHint: boolean;
  usedAutoSolve: boolean;
  solveModeUsed: SolveModeUsed;
  lastMetrics: RunMetrics | null;
  lastStep: TraceStep | null;

  // Network & Concurrency State
  pendingCoord: string | null;
  isStateActionPending: boolean;
  isStepPending: boolean;
  isHintPending: boolean;
  isAutoSolving: boolean;
  isAutoSolveStopping: boolean;
  isResyncing: boolean;
  needsResync: boolean;
  actionsDisabled: boolean;
  clientGeneration: number;

  // Actions
  retryInitialLoad: () => Promise<void>;
  retryStageAction: () => Promise<void>;
  dismissStageError: () => void;
  retrySync: () => Promise<void>;
  selectCell: (coord: string | null) => void;
  submitCellVerdict: (coord: string, status: VerdictStatus) => Promise<void>;
  changeStage: (stage: string) => Promise<void>;
  restart: () => Promise<void>;
  nextStage: () => Promise<void>;
  handleHint: () => Promise<void>;
  stepAiOnce: () => Promise<void>;
  startAutoSolve: () => void;
  stopAutoSolve: () => Promise<void>;
  selectClue: (clueId: string | null) => void;
  togglePinClue: (clueId: string) => void;
  clearClueFocus: () => void;
  setBanner: (banner: BannerState) => void;
  clearBanner: () => void;
  pause: () => Promise<void>;
  resume: () => void;
  skipIntro: () => void;
  skipAnimations: () => void;
}

export function useGameSession(
  options: UseGameSessionOptions = {}
): UseGameSessionReturn {
  const settings = options.settings ?? DEFAULT_FALLBACK_SETTINGS;
  const effectiveReducedMotion =
    options.effectiveReducedMotion ?? settings.reducedMotion;

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const reducedMotionRef = useRef(effectiveReducedMotion);
  reducedMotionRef.current = effectiveReducedMotion;

  // Authoritative state
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isStageLoading, setIsStageLoading] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);

  // Presentation state
  const [presentation, setPresentation] = useState<PresentationState>(() => ({
    cameraMode: settings.viewMode,
    isIntroActive: false,
    stampAnimatingCoord: null,
    rejectedCoord: null,
    rejectedAssessment: null,
    newClueIds: [],
    hintedCellCoord: null,
    hintedClueIds: [],
    caseClosedReady: false,
    animationRunId: 0,
  }));

  // UI state
  const [selectedCellCoord, setSelectedCellCoord] = useState<string | null>(
    null
  );
  const [selectedClueId, setSelectedClueId] = useState<string | null>(null);
  const [pinnedClueIds, setPinnedClueIds] = useState<string[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [banner, setBannerState] = useState<BannerState>({
    message: null,
    type: null,
    assessment: null,
  });
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: "init",
      time: "00:00",
      text: "Casefile opened. Pure propositional deduction — no guessing.",
      type: "info",
      tag: "[INIT]",
    },
  ]);

  // Telemetry & run mode state
  const [usedHint, setUsedHint] = useState(false);
  const [usedAutoSolve, setUsedAutoSolve] = useState(false);
  const [lastMetrics, setLastMetrics] = useState<RunMetrics | null>(null);
  const [lastStep, setLastStep] = useState<TraceStep | null>(null);

  // Network / concurrency state
  const [pendingCoord, setPendingCoord] = useState<string | null>(null);
  const [isStateActionPending, setIsStateActionPending] = useState(false);
  const [isStepPending, setIsStepPending] = useState(false);
  const [isHintPending, setIsHintPending] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);
  const [needsResync, setNeedsResync] = useState(false);
  const [clientGeneration, setClientGeneration] = useState(0);

  // Synchronous refs for async safety
  const mountedRef = useRef(true);
  const gameStateRef = useRef<GameState | null>(null);
  const isPausedRef = useRef(false);
  const elapsedSecondsRef = useRef(0);
  const clientGenerationRef = useRef(0);
  const stateActionPendingRef = useRef(false);
  const needsResyncRef = useRef(false);
  const isResyncingRef = useRef(false);
  const inFlightMutationRef = useRef<Promise<unknown> | null>(null);
  const stepCounterRef = useRef(0);
  const introPlayedSessionsRef = useRef<Set<string>>(new Set());
  const presentationTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(
    new Set()
  );
  const rejectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingResumeEffectsRef = useRef<{
    stampCoord?: string;
    stampStatus?: VerdictStatus;
    caseClosed?: boolean;
  }>({});
  const lastFailedStageActionRef = useRef<FailedStageAction>(null);

  isPausedRef.current = isPaused;
  elapsedSecondsRef.current = elapsedSeconds;
  needsResyncRef.current = needsResync;
  isResyncingRef.current = isResyncing;

  const isCurrentGeneration = useCallback(
    (generation: number) =>
      mountedRef.current && clientGenerationRef.current === generation,
    []
  );

  const clearAllPresentationTimers = useCallback(() => {
    for (const timer of presentationTimersRef.current) {
      clearTimeout(timer);
    }
    presentationTimersRef.current.clear();
  }, []);

  const schedulePresentationTimer = useCallback(
    (
      generation: number,
      delayMs: number,
      callback: () => void
    ): ReturnType<typeof setTimeout> => {
      const timer = setTimeout(() => {
        presentationTimersRef.current.delete(timer);
        if (!isCurrentGeneration(generation)) return;
        callback();
      }, Math.max(0, delayMs));
      presentationTimersRef.current.add(timer);
      return timer;
    },
    [isCurrentGeneration]
  );

  const appendLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => [...prev, entry]);
  }, []);

  const triggerStampAndSolvePresentation = useCallback(
    (
      generation: number,
      coord: string | null,
      status: VerdictStatus | null,
      isSolvedNow: boolean
    ) => {
      const paused = isPausedRef.current;
      const reduced = reducedMotionRef.current;

      if (paused) {
        pendingResumeEffectsRef.current = {
          stampCoord: coord ?? undefined,
          stampStatus: status ?? undefined,
          caseClosed: isSolvedNow,
        };
        return;
      }

      if (coord && status) {
        soundEngine.playStamp(status);
      }

      if (!reduced && coord) {
        setPresentation((prev) => ({
          ...prev,
          stampAnimatingCoord: coord,
          rejectedCoord: null,
          rejectedAssessment: null,
        }));
        schedulePresentationTimer(generation, STAMP_DURATION_MS, () => {
          setPresentation((prev) => ({
            ...prev,
            stampAnimatingCoord:
              prev.stampAnimatingCoord === coord ? null : prev.stampAnimatingCoord,
          }));
        });
      }

      if (isSolvedNow) {
        const settleDelay = reduced ? 0 : STAMP_DURATION_MS + 60;
        schedulePresentationTimer(generation, settleDelay, () => {
          soundEngine.playCaseClosed();
          setPresentation((prev) => ({
            ...prev,
            stampAnimatingCoord: null,
            isIntroActive: false,
            caseClosedReady: true,
            cameraMode: "caseClosed",
          }));
        });
      }
    },
    [schedulePresentationTimer]
  );

  const triggerRejectionPresentation = useCallback(
    (
      generation: number,
      coord: string,
      assessment: VerdictAssessmentType
    ) => {
      if (!isPausedRef.current) {
        soundEngine.playReject();
      }
      if (rejectTimerRef.current) {
        clearTimeout(rejectTimerRef.current);
        presentationTimersRef.current.delete(rejectTimerRef.current);
        rejectTimerRef.current = null;
      }

      setPresentation((prev) => ({
        ...prev,
        rejectedCoord: coord,
        rejectedAssessment: assessment,
        animationRunId: prev.animationRunId + 1,
      }));
      rejectTimerRef.current = schedulePresentationTimer(
        generation,
        REJECT_DURATION_MS,
        () => {
          rejectTimerRef.current = null;
          setPresentation((prev) => ({
            ...prev,
            rejectedCoord:
              prev.rejectedCoord === coord ? null : prev.rejectedCoord,
            rejectedAssessment:
              prev.rejectedCoord === coord ? null : prev.rejectedAssessment,
          }));
        }
      );
    },
    [schedulePresentationTimer]
  );

  const startIntroIfEligible = useCallback(
    (state: GameState, generation: number) => {
      if (state.is_solved) {
        setPresentation((prev) => ({
          ...prev,
          cameraMode: "caseClosed",
          isIntroActive: false,
          caseClosedReady: true,
          animationRunId: prev.animationRunId + 1,
        }));
        return;
      }

      const alreadyPlayed = introPlayedSessionsRef.current.has(state.session_id);
      const shouldSkip =
        reducedMotionRef.current ||
        (settingsRef.current.skipIntroOnRepeat && alreadyPlayed);

      introPlayedSessionsRef.current.add(state.session_id);

      if (shouldSkip) {
        setPresentation((prev) => ({
          ...prev,
          cameraMode: "overview",
          isIntroActive: false,
          caseClosedReady: false,
          animationRunId: prev.animationRunId + 1,
        }));
        return;
      }

      setPresentation((prev) => ({
        ...prev,
        cameraMode: "intro",
        isIntroActive: true,
        caseClosedReady: false,
        animationRunId: prev.animationRunId + 1,
      }));

      schedulePresentationTimer(generation, INTRO_DURATION_MS, () => {
        setPresentation((prev) => ({
          ...prev,
          isIntroActive: false,
          cameraMode: gameStateRef.current?.is_solved
            ? "caseClosed"
            : "overview",
        }));
      });
    },
    [schedulePresentationTimer]
  );

  const resetSessionUiForNewCase = useCallback(
    (newState: GameState, generation: number, initialLogText: string) => {
      clearAllPresentationTimers();
      pendingResumeEffectsRef.current = {};
      gameStateRef.current = newState;
      setGameState(newState);
      setSelectedCellCoord(null);
      setSelectedClueId(null);
      setPinnedClueIds([]);
      setElapsedSeconds(0);
      setUsedHint(false);
      setUsedAutoSolve(false);
      setLastMetrics(null);
      setLastStep(null);
      setIsPaused(false);
      setNeedsResync(false);
      needsResyncRef.current = false;
      setStageError(null);
      stepCounterRef.current = newState.revision;

      setPresentation({
        cameraMode: settingsRef.current.viewMode,
        isIntroActive: false,
        stampAnimatingCoord: null,
        rejectedCoord: null,
        rejectedAssessment: null,
        newClueIds: [],
        hintedCellCoord: null,
        hintedClueIds: [],
        caseClosedReady: newState.is_solved,
        animationRunId: generation,
      });

      setLogs([
        {
          id: makeLogId("case"),
          time: "00:00",
          text: initialLogText,
          type: "info",
          tag: "[CASE]",
        },
      ]);

      startIntroIfEligible(newState, generation);
    },
    [clearAllPresentationTimers, startIntroIfEligible]
  );

  const applyResyncedState = useCallback(
    (currentState: GameState, generation: number) => {
      const previousState = gameStateRef.current;
      gameStateRef.current = currentState;
      setGameState(currentState);
      setSelectedCellCoord(null);

      if (previousState?.session_id !== currentState.session_id) {
        resetSessionUiForNewCase(
          currentState,
          generation,
          `Refreshed case ${currentState.current_stage} from the server.`
        );
      } else {
        setPresentation((prev) => ({
          ...prev,
          stampAnimatingCoord: null,
          rejectedCoord: null,
          rejectedAssessment: null,
          hintedCellCoord: null,
          hintedClueIds: [],
          caseClosedReady: currentState.is_solved,
          cameraMode: currentState.is_solved
            ? "caseClosed"
            : prev.isIntroActive
              ? prev.cameraMode
              : settingsRef.current.viewMode,
        }));
        appendLog({
          id: makeLogId("sync"),
          time: formatClock(elapsedSecondsRef.current),
          text: `State synchronized with server (${currentState.current_stage}, revision ${currentState.revision}).`,
          type: "info",
          tag: "[SYNC]",
        });
      }
    },
    [appendLog, resetSessionUiForNewCase]
  );

  const performResync = useCallback(
    async (reason: "stale" | "error") => {
      if (!mountedRef.current || isResyncingRef.current) return;

      clientGenerationRef.current += 1;
      const generation = clientGenerationRef.current;
      setClientGeneration(generation);
      clearAllPresentationTimers();

      needsResyncRef.current = true;
      setNeedsResync(true);
      isResyncingRef.current = true;
      setIsResyncing(true);
      stateActionPendingRef.current = true;
      setIsStateActionPending(true);

      setBannerState({
        message:
          reason === "stale"
            ? "Session or revision changed on the server. Refreshing current state…"
            : "Request failed. Refreshing current state from server…",
        type: "warning",
        assessment: null,
      });

      try {
        const currentState = await fetchGameState();
        if (!isCurrentGeneration(generation)) return;

        applyResyncedState(currentState, generation);
        needsResyncRef.current = false;
        setNeedsResync(false);
        setBannerState({
          message:
            reason === "stale"
              ? `Synced latest board (${currentState.current_stage}, rev ${currentState.revision}).`
              : `State refreshed (${currentState.current_stage}, rev ${currentState.revision}).`,
          type: "info",
          assessment: null,
        });
      } catch (resyncErr) {
        if (!isCurrentGeneration(generation)) return;
        console.error(resyncErr);
        needsResyncRef.current = true;
        setNeedsResync(true);
        setBannerState({
          message:
            "Could not refresh game state. Retry state refresh before continuing.",
          type: "error",
          assessment: null,
        });
      } finally {
        if (isCurrentGeneration(generation)) {
          isResyncingRef.current = false;
          setIsResyncing(false);
          stateActionPendingRef.current = false;
          setIsStateActionPending(false);
        }
      }
    },
    [applyResyncedState, clearAllPresentationTimers, isCurrentGeneration]
  );

  const handleAutoSolveStep = useCallback(
    (response: StepResponse) => {
      const latestState = gameStateRef.current;
      if (
        !latestState ||
        response.state.session_id !== latestState.session_id ||
        response.state.revision < latestState.revision
      ) {
        return;
      }

      const newlyRevealed = findNewlyRevealedClueIds(
        latestState,
        response.state
      );
      const generation = clientGenerationRef.current;

      gameStateRef.current = response.state;
      setGameState(response.state);
      setLastMetrics(response.metrics);
      setLastStep(response.step);

      setPresentation((prev) => ({
        ...prev,
        newClueIds: newlyRevealed,
        hintedCellCoord: null,
        hintedClueIds: [],
      }));

      if (newlyRevealed.length > 0 && !isPausedRef.current) {
        soundEngine.playClueReveal();
      }

      if (response.step) {
        stepCounterRef.current = Math.max(
          stepCounterRef.current,
          response.step.step
        );
        triggerStampAndSolvePresentation(
          generation,
          response.step.verdict_cell,
          response.step.verdict_status,
          response.outcome === "SOLVED" || response.state.is_solved
        );

        const trace = formatTraceStep(response);
        if (trace) {
          appendLog({
            id: makeLogId(`auto-${response.step.step}`),
            time: "AI",
            text: trace,
            type: "success",
            tag: "[AI_STEP]",
          });
        }
      } else if (response.outcome === "SOLVED" || response.state.is_solved) {
        triggerStampAndSolvePresentation(generation, null, null, true);
      }

      const metrics = response.metrics;
      const metricSummary = `${metrics.sat_queries} SAT queries · ${metrics.solver_runtime_ms.toFixed(2)} ms`;

      if (response.outcome === "SOLVED" || response.state.is_solved) {
        setBannerState({
          message:
            response.state.banner_message ||
            `Auto-solve finished: ${response.state.solved_count}/${response.state.total_cells} solved (${metricSummary}).`,
          type: "success",
          assessment: "PROVABLE",
        });
        return;
      }

      if (response.outcome === "STUCK_NO_FORCIBLE_MOVE") {
        setBannerState({
          message: `No more forced moves (${response.state.solved_count}/${response.state.total_cells} solved · ${metricSummary}).`,
          type: "warning",
          assessment: "NOT_PROVABLE",
        });
        return;
      }

      if (response.outcome === "INCONSISTENT") {
        setBannerState({
          message: `Revealed clues are inconsistent (${metricSummary}).`,
          type: "error",
          assessment: "INCONSISTENT",
        });
        return;
      }

      if (response.outcome === "ENGINE_REJECTED") {
        setBannerState({
          message: "Engine rejected a proven verdict. Auto-solve stopped.",
          type: "error",
          assessment: null,
        });
        return;
      }

      if (response.outcome === "TIMEOUT") {
        setBannerState({
          message: "Solver reached its time limit. Auto-solve stopped.",
          type: "error",
          assessment: null,
        });
        return;
      }

      if (response.outcome === "IN_PROGRESS" && response.step) {
        setBannerState({
          message: `AI proved ${response.step.verdict_cell} is ${response.step.verdict_status === "INNOCENT" ? "Innocent" : "Criminal"}.`,
          type: "info",
          assessment: "PROVABLE",
        });
      }
    },
    [appendLog, triggerStampAndSolvePresentation]
  );

  const handleAutoSolveError = useCallback(
    async (error: unknown) => {
      if (!mountedRef.current) return;
      const wasStale = error instanceof ApiError && error.status === 409;
      await performResync(wasStale ? "stale" : "error");
    },
    [performResync]
  );

  const autoSolve = useAutoSolve({
    getState: () => gameStateRef.current,
    onStep: handleAutoSolveStep,
    onError: handleAutoSolveError,
    delayMs: AUTO_SOLVE_SPEED_DELAYS[settings.autoSolveSpeed],
  });

  const actionsDisabled =
    autoSolve.isRunning ||
    autoSolve.isStopping ||
    isResyncing ||
    needsResync ||
    isStateActionPending ||
    isStageLoading;

  // Sync audio settings & pause state
  useEffect(() => {
    soundEngine.setMuted(settings.muted);
    soundEngine.setSfxVolume(settings.sfxVolume);
    soundEngine.setPaused(isPaused);
    soundEngine.syncAmbientRain(settings.ambientRain, settings.ambientVolume);
  }, [
    settings.muted,
    settings.sfxVolume,
    settings.ambientRain,
    settings.ambientVolume,
    isPaused,
  ]);

  // Sync viewMode -> cameraMode when not in intro or caseClosed
  useEffect(() => {
    setPresentation((prev) => {
      if (prev.isIntroActive || prev.cameraMode === "caseClosed") {
        return prev;
      }
      if (prev.cameraMode === settings.viewMode) {
        return prev;
      }
      return { ...prev, cameraMode: settings.viewMode };
    });
  }, [settings.viewMode]);

  // Mount & unmount cleanup
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clientGenerationRef.current += 1;
      clearAllPresentationTimers();
      void soundEngine.suspendAll();
    };
  }, [clearAllPresentationTimers]);

  // Initial state load
  const loadInitialState = useCallback(async () => {
    setInitialLoading(true);
    setLoadError(null);
    const generation = ++clientGenerationRef.current;
    setClientGeneration(generation);

    try {
      const state = await fetchGameState();
      if (!isCurrentGeneration(generation)) return;
      resetSessionUiForNewCase(
        state,
        generation,
        `Case ${state.current_stage} opened (${state.size}×${state.size}).`
      );
      setLoadError(null);
    } catch (error) {
      if (!isCurrentGeneration(generation)) return;
      console.error(error);
      const message =
        error instanceof Error
          ? error.message
          : "Could not connect to Python game backend.";
      setLoadError(message);
      setBannerState({
        message: "Could not connect to Python game backend.",
        type: "error",
        assessment: null,
      });
    } finally {
      if (isCurrentGeneration(generation)) {
        setInitialLoading(false);
      }
    }
  }, [isCurrentGeneration, resetSessionUiForNewCase]);

  useEffect(() => {
    void loadInitialState();
  }, [loadInitialState]);

  // Elapsed timer loop (stops when paused, solved, loading, or resync needed)
  useEffect(() => {
    if (
      isPaused ||
      initialLoading ||
      isStageLoading ||
      needsResync ||
      !gameState ||
      gameState.is_solved
    ) {
      return;
    }
    const interval = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [
    isPaused,
    initialLoading,
    isStageLoading,
    needsResync,
    gameState,
  ]);

  // Derived selections
  const selectedCell = useMemo<CellData | null>(() => {
    if (!gameState || !selectedCellCoord) return null;
    return (
      gameState.cells.find((cell) => cell.coord === selectedCellCoord) ?? null
    );
  }, [gameState, selectedCellCoord]);

  const selectedClue = useMemo<ActiveClue | null>(() => {
    if (!gameState || !selectedClueId) return null;
    return (
      gameState.active_clues.find((clue) => clue.clue_id === selectedClueId) ??
      null
    );
  }, [gameState, selectedClueId]);

  const pinnedClues = useMemo<ActiveClue[]>(() => {
    if (!gameState || pinnedClueIds.length === 0) return [];
    const clueMap = new Map(
      gameState.active_clues.map((clue) => [clue.clue_id, clue])
    );
    return pinnedClueIds
      .map((id) => clueMap.get(id))
      .filter((clue): clue is ActiveClue => clue !== undefined);
  }, [gameState, pinnedClueIds]);

  const highlightedCoords = useMemo<string[]>(() => {
    const coords = new Set<string>();
    if (selectedClue) {
      for (const c of selectedClue.referenced_coords) coords.add(c);
    }
    for (const clue of pinnedClues) {
      for (const c of clue.referenced_coords) coords.add(c);
    }
    if (presentation.hintedCellCoord) {
      coords.add(presentation.hintedCellCoord);
    }
    if (gameState && presentation.hintedClueIds.length > 0) {
      const hintSet = new Set(presentation.hintedClueIds);
      for (const clue of gameState.active_clues) {
        if (hintSet.has(clue.clue_id)) {
          coords.add(clue.owner_coord);
          for (const c of clue.referenced_coords) coords.add(c);
        }
      }
    }
    return Array.from(coords);
  }, [
    selectedClue,
    pinnedClues,
    presentation.hintedCellCoord,
    presentation.hintedClueIds,
    gameState,
  ]);

  const solveModeUsed: SolveModeUsed = usedAutoSolve
    ? "ai"
    : usedHint
      ? "hint"
      : "manual";

  // Actions
  const selectCell = useCallback((coord: string | null) => {
    setSelectedCellCoord(coord);
    if (coord !== null && !isPausedRef.current) {
      soundEngine.playPaperSelect();
    }
  }, []);

  const submitCellVerdict = useCallback(
    async (coord: string, status: VerdictStatus) => {
      const currentState = gameStateRef.current;
      if (
        !mountedRef.current ||
        !currentState ||
        isPausedRef.current ||
        stateActionPendingRef.current ||
        needsResyncRef.current ||
        isResyncingRef.current ||
        autoSolve.isRunning ||
        autoSolve.isStopping
      ) {
        return;
      }

      const targetCell = currentState.cells.find((c) => c.coord === coord);
      if (targetCell?.is_revealed) {
        return;
      }

      stateActionPendingRef.current = true;
      setIsStateActionPending(true);
      setPendingCoord(coord);
      const generation = clientGenerationRef.current;
      const timeStr = formatClock(elapsedSecondsRef.current);

      const promise = submitVerdict(
        coord,
        status,
        currentState.session_id,
        currentState.revision
      );
      inFlightMutationRef.current = promise;

      try {
        const newState = await promise;
        if (!isCurrentGeneration(generation)) return;

        const assessment: VerdictAssessmentType =
          newState.verdict_assessment ??
          (newState.verdict_success ? "PROVABLE" : "NOT_PROVABLE");

        const newlyRevealed = findNewlyRevealedClueIds(currentState, newState);
        gameStateRef.current = newState;
        setGameState(newState);

        if (assessment === "PROVABLE" || newState.verdict_success) {
          stepCounterRef.current += 1;
          const stepNum = stepCounterRef.current;

          setPresentation((prev) => ({
            ...prev,
            newClueIds: newlyRevealed,
            hintedCellCoord: null,
            hintedClueIds: [],
          }));

          if (newlyRevealed.length > 0 && !isPausedRef.current) {
            soundEngine.playClueReveal();
          }

          triggerStampAndSolvePresentation(
            generation,
            coord,
            status,
            newState.is_solved
          );

          setBannerState({
            message:
              newState.banner_message ||
              `Proved! ${coord} is ${status}.`,
            type: "success",
            assessment: "PROVABLE",
          });

          appendLog({
            id: makeLogId(`verdict-${stepNum}`),
            time: timeStr,
            text: `[PROVABLE] Step ${stepNum}: ${coord} verified as ${status}.`,
            type: "success",
            tag: "[PROVABLE]",
          });
        } else if (assessment === "NOT_PROVABLE") {
          triggerRejectionPresentation(generation, coord, "NOT_PROVABLE");
          setBannerState({
            message: null,
            type: null,
            assessment: "NOT_PROVABLE",
          });
          appendLog({
            id: makeLogId("not-provable"),
            time: timeStr,
            text: `[NOT_PROVABLE] ${coord} as ${status} rejected — not forced by current clues.`,
            type: "warning",
            tag: "[NOT_PROVABLE]",
          });
        } else if (assessment === "CONTRADICTED") {
          triggerRejectionPresentation(generation, coord, "CONTRADICTED");
          setBannerState({
            message: null,
            type: null,
            assessment: "CONTRADICTED",
          });
          appendLog({
            id: makeLogId("contradicted"),
            time: timeStr,
            text: `[CONTRADICTED] ${coord} as ${status} contradicts current clues.`,
            type: "error",
            tag: "[CONTRADICTED]",
          });
        } else if (assessment === "ALREADY_SOLVED") {
          setBannerState({
            message:
              newState.banner_message || `${coord} is already confirmed.`,
            type: "info",
            assessment: "ALREADY_SOLVED",
          });
          appendLog({
            id: makeLogId("already-solved"),
            time: timeStr,
            text: `[ALREADY_SOLVED] ${coord} was already confirmed.`,
            type: "info",
            tag: "[ALREADY_SOLVED]",
          });
        } else {
          // INCONSISTENT
          triggerRejectionPresentation(generation, coord, "INCONSISTENT");
          setBannerState({
            message:
              newState.banner_message ||
              "Current public clues are inconsistent (UNSAT).",
            type: "error",
            assessment: "INCONSISTENT",
          });
          appendLog({
            id: makeLogId("inconsistent"),
            time: timeStr,
            text: "[INCONSISTENT] Current public clues are inconsistent (UNSAT).",
            type: "error",
            tag: "[INCONSISTENT]",
          });
        }
      } catch (error) {
        if (!isCurrentGeneration(generation)) return;
        console.error(error);

        if (error instanceof ApiError && error.status === 409) {
          stateActionPendingRef.current = false;
          setIsStateActionPending(false);
          setPendingCoord(null);
          await performResync("stale");
          return;
        }

        setBannerState({
          message:
            "Failed to submit verdict to server. Check connection or refresh state.",
          type: "error",
          assessment: null,
        });
        appendLog({
          id: makeLogId("verdict-err"),
          time: timeStr,
          text: `[ERROR] Verdict submission for ${coord} failed (${error instanceof Error ? error.message : "network error"}).`,
          type: "error",
          tag: "[ERROR]",
        });
      } finally {
        if (inFlightMutationRef.current === promise) {
          inFlightMutationRef.current = null;
        }
        if (isCurrentGeneration(generation)) {
          stateActionPendingRef.current = false;
          setIsStateActionPending(false);
          setPendingCoord(null);
        }
      }
    },
    [
      appendLog,
      autoSolve.isRunning,
      autoSolve.isStopping,
      isCurrentGeneration,
      performResync,
      triggerRejectionPresentation,
      triggerStampAndSolvePresentation,
    ]
  );

  const runStageTransition = useCallback(
    async (action: { kind: "load"; stage: string } | { kind: "restart" }) => {
      if (!mountedRef.current) return;

      await autoSolve.stop();
      if (inFlightMutationRef.current) {
        try {
          await inFlightMutationRef.current;
        } catch {
          // Preceding mutation errors are handled by its own caller.
        }
      }
      if (!mountedRef.current) return;

      clearAllPresentationTimers();
      clientGenerationRef.current += 1;
      const generation = clientGenerationRef.current;
      setClientGeneration(generation);

      lastFailedStageActionRef.current = action;
      stateActionPendingRef.current = true;
      setIsStateActionPending(true);
      setIsStageLoading(true);
      setStageError(null);
      setPendingCoord(null);

      try {
        const newState =
          action.kind === "load"
            ? await loadStage(action.stage)
            : await restartGame();

        if (!isCurrentGeneration(generation)) return;

        lastFailedStageActionRef.current = null;
        const msg =
          action.kind === "load"
            ? `Case ${newState.current_stage} opened (${newState.size}×${newState.size}).`
            : "Case restarted.";
        resetSessionUiForNewCase(newState, generation, msg);
        setBannerState({
          message: null,
          type: null,
          assessment: null,
        });
      } catch (error) {
        if (!isCurrentGeneration(generation)) return;
        console.error(error);
        const errMsg =
          action.kind === "load"
            ? `Could not load case "${action.stage}".`
            : "Could not restart the case.";
        setStageError(errMsg);
        setBannerState({
          message: `${errMsg} You can retry or continue with the current board.`,
          type: "error",
          assessment: null,
        });
      } finally {
        if (isCurrentGeneration(generation)) {
          stateActionPendingRef.current = false;
          setIsStateActionPending(false);
          setIsStageLoading(false);
        }
      }
    },
    [
      autoSolve,
      clearAllPresentationTimers,
      isCurrentGeneration,
      resetSessionUiForNewCase,
    ]
  );

  const changeStage = useCallback(
    async (stage: string) => {
      await runStageTransition({ kind: "load", stage });
    },
    [runStageTransition]
  );

  const restart = useCallback(async () => {
    await runStageTransition({ kind: "restart" });
  }, [runStageTransition]);

  const retryStageAction = useCallback(async () => {
    const failed = lastFailedStageActionRef.current;
    if (!failed) return;
    await runStageTransition(failed);
  }, [runStageTransition]);

  const dismissStageError = useCallback(() => {
    setStageError(null);
    lastFailedStageActionRef.current = null;
  }, []);

  const nextStage = useCallback(async () => {
    const current = gameStateRef.current;
    if (!current || actionsDisabled) return;
    const idx = current.available_stages.indexOf(current.current_stage);
    if (idx >= 0 && idx + 1 < current.available_stages.length) {
      await changeStage(current.available_stages[idx + 1]);
    } else {
      await restart();
    }
  }, [actionsDisabled, changeStage, restart]);

  const stepAiOnce = useCallback(async () => {
    const currentState = gameStateRef.current;
    if (
      !mountedRef.current ||
      !currentState ||
      isPausedRef.current ||
      stateActionPendingRef.current ||
      needsResyncRef.current ||
      isResyncingRef.current ||
      autoSolve.isRunning ||
      autoSolve.isStopping ||
      currentState.is_solved ||
      currentState.is_contradicted
    ) {
      return;
    }

    stateActionPendingRef.current = true;
    setIsStateActionPending(true);
    setIsStepPending(true);
    setUsedAutoSolve(true);
    const generation = clientGenerationRef.current;

    const promise = executeAutoSolveStep(
      currentState.session_id,
      currentState.revision
    );
    inFlightMutationRef.current = promise;

    try {
      const response = await promise;
      if (!isCurrentGeneration(generation)) return;

      if (
        response.state.session_id !== currentState.session_id ||
        response.state.revision < currentState.revision
      ) {
        stateActionPendingRef.current = false;
        setIsStateActionPending(false);
        setIsStepPending(false);
        await performResync("stale");
        return;
      }

      handleAutoSolveStep(response);
    } catch (error) {
      if (!isCurrentGeneration(generation)) return;
      console.error(error);
      if (error instanceof ApiError && error.status === 409) {
        stateActionPendingRef.current = false;
        setIsStateActionPending(false);
        setIsStepPending(false);
        await performResync("stale");
        return;
      }
      setBannerState({
        message: "AI step failed. Please retry or refresh state.",
        type: "error",
        assessment: null,
      });
    } finally {
      if (inFlightMutationRef.current === promise) {
        inFlightMutationRef.current = null;
      }
      if (isCurrentGeneration(generation)) {
        stateActionPendingRef.current = false;
        setIsStateActionPending(false);
        setIsStepPending(false);
      }
    }
  }, [
    autoSolve.isRunning,
    autoSolve.isStopping,
    handleAutoSolveStep,
    isCurrentGeneration,
    performResync,
  ]);

  const startAutoSolve = useCallback(() => {
    const currentState = gameStateRef.current;
    if (
      !currentState ||
      isPausedRef.current ||
      stateActionPendingRef.current ||
      needsResyncRef.current ||
      isResyncingRef.current ||
      autoSolve.isRunning ||
      autoSolve.isStopping ||
      currentState.is_solved ||
      currentState.is_contradicted
    ) {
      return;
    }

    setUsedAutoSolve(true);
    setPresentation((prev) => ({
      ...prev,
      hintedCellCoord: null,
      hintedClueIds: [],
    }));
    setBannerState({
      message: "Auto-solve started. Stepping through forced deductions…",
      type: "info",
      assessment: null,
    });
    autoSolve.start();
  }, [autoSolve]);

  const stopAutoSolve = useCallback(async () => {
    await autoSolve.stop();
  }, [autoSolve]);

  const handleHint = useCallback(async () => {
    const requestedState = gameStateRef.current;
    if (
      !mountedRef.current ||
      !requestedState ||
      isPausedRef.current ||
      stateActionPendingRef.current ||
      needsResyncRef.current ||
      isResyncingRef.current ||
      autoSolve.isRunning ||
      autoSolve.isStopping
    ) {
      return;
    }

    const requestedGeneration = clientGenerationRef.current;
    setIsHintPending(true);

    try {
      const data = await fetchHint();
      const latestState = gameStateRef.current;
      if (
        !isCurrentGeneration(requestedGeneration) ||
        !latestState ||
        latestState.session_id !== requestedState.session_id ||
        latestState.revision !== requestedState.revision ||
        data.session_id !== requestedState.session_id ||
        data.revision !== requestedState.revision
      ) {
        return;
      }

      if (data.outcome === "AVAILABLE") {
        setUsedHint(true);
        if (!isPausedRef.current) {
          soundEngine.playClueReveal();
        }
        setPresentation((prev) => ({
          ...prev,
          hintedCellCoord: data.cell,
          hintedClueIds: data.active_clue_ids,
        }));
        if (data.active_clue_ids.length > 0) {
          setSelectedClueId(data.active_clue_ids[0]);
        }
      }

      let message = data.hint;
      if (data.outcome === "SOLVED") {
        message = "This case is already solved.";
      } else if (data.outcome === "STUCK_NO_FORCIBLE_MOVE") {
        message = "No currently forced move is available from current clues.";
      } else if (data.outcome === "INCONSISTENT") {
        message = "The revealed clues are inconsistent.";
      } else if (data.cell && data.status) {
        message = `${data.hint} (${data.cell}: ${data.status})`;
      }

      setBannerState({
        message,
        type:
          data.outcome === "INCONSISTENT"
            ? "error"
            : data.outcome === "STUCK_NO_FORCIBLE_MOVE"
              ? "warning"
              : "info",
        assessment: null,
      });

      appendLog({
        id: makeLogId("hint"),
        time: formatClock(elapsedSecondsRef.current),
        text: `[HINT] ${message} [${data.outcome}]`,
        type: data.outcome === "INCONSISTENT" ? "error" : "info",
        tag: "[HINT]",
      });
    } catch (error) {
      if (!isCurrentGeneration(requestedGeneration)) return;
      console.error(error);
      setBannerState({
        message: "Could not fetch a hint.",
        type: "error",
        assessment: null,
      });
    } finally {
      if (isCurrentGeneration(requestedGeneration)) {
        setIsHintPending(false);
      }
    }
  }, [
    appendLog,
    autoSolve.isRunning,
    autoSolve.isStopping,
    isCurrentGeneration,
  ]);

  const selectClue = useCallback((clueId: string | null) => {
    setSelectedClueId(clueId);
    if (clueId !== null) {
      if (!isPausedRef.current) {
        soundEngine.playPaperSelect();
      }
      setPresentation((prev) =>
        prev.newClueIds.includes(clueId)
          ? {
              ...prev,
              newClueIds: prev.newClueIds.filter((id) => id !== clueId),
            }
          : prev
      );
    }
  }, []);

  const togglePinClue = useCallback((clueId: string) => {
    if (!isPausedRef.current) {
      soundEngine.playPencilTick();
    }
    setPinnedClueIds((prev) => {
      if (prev.includes(clueId)) {
        return prev.filter((id) => id !== clueId);
      }
      if (prev.length >= 2) {
        return [prev[1], clueId];
      }
      return [...prev, clueId];
    });
    setPresentation((prev) =>
      prev.newClueIds.includes(clueId)
        ? {
            ...prev,
            newClueIds: prev.newClueIds.filter((id) => id !== clueId),
          }
        : prev
    );
  }, []);

  const clearClueFocus = useCallback(() => {
    setSelectedClueId(null);
    setPinnedClueIds([]);
    setPresentation((prev) => ({
      ...prev,
      hintedCellCoord: null,
      hintedClueIds: [],
    }));
  }, []);

  const setBanner = useCallback((next: BannerState) => {
    setBannerState(next);
  }, []);

  const clearBanner = useCallback(() => {
    setBannerState({ message: null, type: null, assessment: null });
  }, []);

  const pause = useCallback(async () => {
    await autoSolve.stop();
    if (!mountedRef.current || needsResyncRef.current) return;
    isPausedRef.current = true;
    setIsPaused(true);
    soundEngine.setPaused(true);
  }, [autoSolve]);

  const resume = useCallback(() => {
    isPausedRef.current = false;
    setIsPaused(false);
    soundEngine.setPaused(false);

    const pending = pendingResumeEffectsRef.current;
    pendingResumeEffectsRef.current = {};
    if (pending.caseClosed || (gameStateRef.current?.is_solved && !presentation.caseClosedReady)) {
      triggerStampAndSolvePresentation(
        clientGenerationRef.current,
        pending.stampCoord ?? null,
        pending.stampStatus ?? null,
        Boolean(gameStateRef.current?.is_solved)
      );
    }
  }, [presentation.caseClosedReady, triggerStampAndSolvePresentation]);

  const skipIntro = useCallback(() => {
    clearAllPresentationTimers();
    setPresentation((prev) => ({
      ...prev,
      isIntroActive: false,
      cameraMode: gameStateRef.current?.is_solved ? "caseClosed" : "overview",
      animationRunId: prev.animationRunId + 1,
    }));
  }, [clearAllPresentationTimers]);

  const skipAnimations = useCallback(() => {
    clearAllPresentationTimers();
    const solved = Boolean(gameStateRef.current?.is_solved);
    setPresentation((prev) => ({
      ...prev,
      isIntroActive: false,
      stampAnimatingCoord: null,
      rejectedCoord: null,
      rejectedAssessment: null,
      caseClosedReady: solved,
      cameraMode: solved ? "caseClosed" : "overview",
      animationRunId: prev.animationRunId + 1,
    }));
  }, [clearAllPresentationTimers]);

  const retrySync = useCallback(async () => {
    await performResync("error");
  }, [performResync]);

  return {
    gameState,
    initialLoading,
    loadError,
    isStageLoading,
    stageError,
    presentation,
    selectedCellCoord,
    selectedCell,
    selectedClueId,
    selectedClue,
    pinnedClueIds,
    pinnedClues,
    highlightedCoords,
    isPaused,
    elapsedSeconds,
    banner,
    logs,
    usedHint,
    usedAutoSolve,
    solveModeUsed,
    lastMetrics,
    lastStep,
    pendingCoord,
    isStateActionPending,
    isStepPending,
    isHintPending,
    isAutoSolving: autoSolve.isRunning,
    isAutoSolveStopping: autoSolve.isStopping,
    isResyncing,
    needsResync,
    actionsDisabled,
    clientGeneration,
    retryInitialLoad: loadInitialState,
    retryStageAction,
    dismissStageError,
    retrySync,
    selectCell,
    submitCellVerdict,
    changeStage,
    restart,
    nextStage,
    handleHint,
    stepAiOnce,
    startAutoSolve,
    stopAutoSolve,
    selectClue,
    togglePinClue,
    clearClueFocus,
    setBanner,
    clearBanner,
    pause,
    resume,
    skipIntro,
    skipAnimations,
  };
}
