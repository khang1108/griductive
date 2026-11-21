import { useCallback, useEffect, useRef, useState } from "react";
import type { CellData, GameState, LogEntry, StepResponse, VerdictStatus } from "./types";
import {
  ApiError,
  fetchGameState,
  submitVerdict,
  restartGame,
  loadStage,
  fetchHint,
} from "./api/client";
import { useAutoSolve } from "./hooks/useAutoSolve";
import { Header } from "./components/header";
import { Banner } from "./components/feedback";
import { Board } from "./components/board";
import { CaseEvidence } from "./components/evidence";
import { VerdictModal, PauseModal, VictoryModal } from "./components/modals";

function formatTraceStep(response: StepResponse): string | null {
  const step = response.step;
  if (!step) return null;

  const clueIds = step.active_clue_ids.length
    ? step.active_clue_ids.join(", ")
    : "none";
  const newClue = step.new_clue_id
    ? response.state.active_clues.find((clue) => clue.clue_id === step.new_clue_id)
    : undefined;
  return [
    `⚡ Step ${step.step}: ${step.verdict_cell} classified as ${step.verdict_status}`,
    `clues ${clueIds}`,
    `${step.sat_queries} SAT queries`,
    `${step.primary_vars_count} primary + ${step.aux_vars_count} auxiliary vars`,
    `${step.clause_count} clauses`,
    `new clue ${step.new_clue_id ?? "none"}${newClue ? `: ${newClue.text}` : ""}`,
    `decisions ${step.stats.decisions}, propagations ${step.stats.propagations}, backtracks ${step.stats.backtracks}`,
    `${step.stats.runtime_ms.toFixed(2)} ms solver`,
  ].join(" · ");
}

export function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [selectedVerdictCell, setSelectedVerdictCell] = useState<CellData | null>(null);
  const [highlightedCoords, setHighlightedCoords] = useState<string[]>([]);
  const [isResyncing, setIsResyncing] = useState(false);
  const [isStateActionPending, setIsStateActionPending] = useState(false);
  const [needsResync, setNeedsResync] = useState(false);
  const [banner, setBanner] = useState<{
    message: string | null;
    type: "success" | "error" | "info" | null;
  }>({ message: null, type: null });
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: "init",
      time: "00:00",
      text: "✦ Case investigation started. Pure deduction — no guessing.",
      type: "info",
    },
  ]);

  const gameStateRef = useRef<GameState | null>(null);
  const controlsBlockedRef = useRef(false);
  const needsResyncRef = useRef(false);
  const stateChangeGenerationRef = useRef(0);
  const stateActionPendingRef = useRef(false);
  const mountedRef = useRef(false);
  const stepCountRef = useRef(0);

  const isCurrentGeneration = (generation: number) =>
    mountedRef.current && stateChangeGenerationRef.current === generation;

  const beginStateAction = (): number | null => {
    if (
      !mountedRef.current ||
      controlsBlockedRef.current ||
      stateActionPendingRef.current
    ) {
      return null;
    }

    stateActionPendingRef.current = true;
    controlsBlockedRef.current = true;
    setIsStateActionPending(true);
    stateChangeGenerationRef.current += 1;
    return stateChangeGenerationRef.current;
  };

  const finishStateAction = (generation: number) => {
    if (!isCurrentGeneration(generation)) return;
    stateActionPendingRef.current = false;
    setIsStateActionPending(false);
  };

  const applyResyncedState = (currentState: GameState) => {
    const previousState = gameStateRef.current;
    gameStateRef.current = currentState;
    setGameState(currentState);
    setHighlightedCoords([]);
    setSelectedVerdictCell(null);

    if (previousState?.session_id !== currentState.session_id) {
      setElapsedSeconds(0);
      stepCountRef.current = currentState.revision;
      setLogs([
        {
          id: `resync-${Date.now()}`,
          time: "Sync",
          text: `✦ Refreshed case ${currentState.current_stage} from the server.`,
          type: "info",
        },
      ]);
    }
  };

  const handleAutoSolveStep = useCallback((response: StepResponse) => {
    const latestState = gameStateRef.current;
    if (
      !latestState ||
      response.state.session_id !== latestState.session_id ||
      response.state.revision < latestState.revision
    ) {
      return;
    }

    gameStateRef.current = response.state;
    stateChangeGenerationRef.current += 1;
    setGameState(response.state);
    setSelectedVerdictCell(null);

    if (response.step) {
      stepCountRef.current = Math.max(stepCountRef.current, response.step.step);
      setHighlightedCoords([response.step.verdict_cell]);
      const trace = formatTraceStep(response);
      if (trace) {
        setLogs((previous) => [
          ...previous,
          {
            id: `auto-${response.state.session_id}-${response.step?.step}-${Date.now()}`,
            time: "AI",
            text: trace,
            type: "success",
          },
        ]);
      }
    }

    const metrics = response.metrics;
    const metricSummary = `Last solver call: ${metrics.sat_queries} SAT queries, ${metrics.solver_runtime_ms.toFixed(2)} ms solver time.`;

    if (response.outcome === "SOLVED" || response.state.is_solved) {
      const message =
        response.state.banner_message ||
        `Auto-solve finished: ${response.state.solved_count}/${response.state.total_cells} cards solved. ${metricSummary}`;
      setBanner({ message, type: "success" });
      return;
    }

    if (response.outcome === "STUCK_NO_FORCIBLE_MOVE") {
      setBanner({
        message: `No more forced moves. ${response.state.solved_count}/${response.state.total_cells} cards solved. ${metricSummary}`,
        type: "info",
      });
      return;
    }

    if (response.outcome === "INCONSISTENT") {
      setBanner({
        message: `The revealed clues are inconsistent. ${metricSummary}`,
        type: "error",
      });
      return;
    }

    if (response.outcome === "ENGINE_REJECTED") {
      setBanner({
        message: "The game engine rejected a proven verdict. Auto-solve stopped.",
        type: "error",
      });
      return;
    }

    if (response.outcome === "TIMEOUT") {
      setBanner({ message: "The solver reached its time limit. Auto-solve stopped.", type: "error" });
      return;
    }

    if (response.outcome === "IN_PROGRESS" && response.step) {
      setBanner({
        message: `Step ${response.step.step}: ${response.step.verdict_cell} is ${response.step.verdict_status}. ${metricSummary}`,
        type: "info",
      });
    }
  }, []);

  const handleAutoSolveError = useCallback(async (error: unknown) => {
    if (!mountedRef.current) return;
    stateChangeGenerationRef.current += 1;
    const generation = stateChangeGenerationRef.current;
    controlsBlockedRef.current = true;
    needsResyncRef.current = true;
    setNeedsResync(true);
    setSelectedVerdictCell(null);
    setIsResyncing(true);

    const wasStale = error instanceof ApiError && error.status === 409;
    setBanner({
      message: wasStale
        ? "The game changed in another tab. Refreshing the current state…"
        : "Auto-solve request failed. Refreshing the current state…",
      type: "info",
    });

    try {
      const currentState = await fetchGameState();
      if (!isCurrentGeneration(generation)) return;
      applyResyncedState(currentState);

      needsResyncRef.current = false;
      setNeedsResync(false);
      setBanner({
        message: wasStale
          ? `State refreshed after another tab changed the game (${currentState.current_stage}, revision ${currentState.revision}).`
          : `State refreshed from the server (${currentState.current_stage}, revision ${currentState.revision}).`,
        type: "info",
      });
    } catch (resyncError) {
      if (!isCurrentGeneration(generation)) return;
      console.error(resyncError);
      needsResyncRef.current = true;
      setNeedsResync(true);
      setBanner({
        message: "Could not refresh game state. Retry the state refresh before continuing.",
        type: "error",
      });
    } finally {
      if (isCurrentGeneration(generation)) setIsResyncing(false);
    }
  }, []);

  const autoSolve = useAutoSolve({
    getState: () => gameStateRef.current,
    onStep: handleAutoSolveStep,
    onError: handleAutoSolveError,
  });
  const actionsDisabled =
    autoSolve.isRunning ||
    autoSolve.isStopping ||
    isResyncing ||
    needsResync ||
    isStateActionPending;
  controlsBlockedRef.current = actionsDisabled;
  needsResyncRef.current = needsResync;

  // Guard async callbacks that outlive the mounted game view.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stateChangeGenerationRef.current += 1;
      stateActionPendingRef.current = false;
    };
  }, []);

  // Load initial game state
  useEffect(() => {
    let active = true;
    fetchGameState()
      .then((state) => {
        if (!active) return;
        gameStateRef.current = state;
        setGameState(state);
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error(error);
        setBanner({
          message: "Could not connect to Python game backend.",
          type: "error",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Timer loop
  useEffect(() => {
    if (isPaused || !gameState || gameState.is_solved) return;
    const interval = setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isPaused, gameState]);

  // Handle verdict submission
  const handleSelectVerdict = async (coord: string, status: VerdictStatus) => {
    const generation = beginStateAction();
    if (generation === null) return;
    setSelectedVerdictCell(null);
    stepCountRef.current += 1;
    const currentStep = stepCountRef.current;

    const minutes = Math.floor(elapsedSeconds / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (elapsedSeconds % 60).toString().padStart(2, "0");
    const timeStr = `${minutes}:${seconds}`;

    try {
      const newState = await submitVerdict(coord, status);
      if (!isCurrentGeneration(generation)) return;
      gameStateRef.current = newState;
      setGameState(newState);

      if (newState.verdict_success) {
        setBanner({
          message: newState.banner_message || `✓ Correct call! ${coord} is ${status}.`,
          type: "success",
        });
        setLogs((previous) => [
          ...previous,
          {
            id: `step-${currentStep}`,
            time: timeStr,
            text: `Step ${currentStep}: ${coord} classified as ${status} (Entailed)`,
            type: "success",
          },
        ]);
      } else {
        setBanner({
          message: newState.banner_message || `✗ Cannot prove ${coord} is ${status}. Rejected.`,
          type: "error",
        });
        setLogs((previous) => [
          ...previous,
          {
            id: `step-${currentStep}`,
            time: timeStr,
            text: `Step ${currentStep}: ${coord} as ${status} rejected (Not forced by current facts)`,
            type: "error",
          },
        ]);
      }
    } catch (error) {
      if (!isCurrentGeneration(generation)) return;
      console.error(error);
      setBanner({ message: "Failed to submit verdict to server.", type: "error" });
    } finally {
      finishStateAction(generation);
    }
  };

  // Handle stage change
  const handleStageChange = async (stage: string) => {
    const generation = beginStateAction();
    if (generation === null) return;
    try {
      const newState = await loadStage(stage);
      if (!isCurrentGeneration(generation)) return;
      gameStateRef.current = newState;
      setGameState(newState);
      setElapsedSeconds(0);
      stepCountRef.current = 0;
      setHighlightedCoords([]);
      setSelectedVerdictCell(null);
      setBanner({
        message: `Loaded stage: ${stage} (${newState.size}×${newState.size}).`,
        type: "info",
      });
      setLogs([
        {
          id: `load-${Date.now()}`,
          time: "00:00",
          text: `✦ Loaded case ${stage}.`,
          type: "info",
        },
      ]);
    } catch (error) {
      if (!isCurrentGeneration(generation)) return;
      console.error(error);
      setBanner({ message: "Could not load that case.", type: "error" });
    } finally {
      finishStateAction(generation);
    }
  };

  // Handle restart
  const handleRestart = async () => {
    const generation = beginStateAction();
    if (generation === null) return;
    try {
      const newState = await restartGame();
      if (!isCurrentGeneration(generation)) return;
      gameStateRef.current = newState;
      setGameState(newState);
      setElapsedSeconds(0);
      stepCountRef.current = 0;
      setHighlightedCoords([]);
      setSelectedVerdictCell(null);
      setBanner({ message: "Game restarted. Ready for pure deduction.", type: "info" });
      setLogs([
        {
          id: `restart-${Date.now()}`,
          time: "00:00",
          text: "✦ Game restarted.",
          type: "info",
        },
      ]);
    } catch (error) {
      if (!isCurrentGeneration(generation)) return;
      console.error(error);
      setBanner({ message: "Could not restart the game.", type: "error" });
    } finally {
      finishStateAction(generation);
    }
  };

  // Handle hint
  const handleHint = async () => {
    if (controlsBlockedRef.current) return;
    const requestedState = gameStateRef.current;
    if (!requestedState) return;
    const requestedGeneration = stateChangeGenerationRef.current;
    try {
      const data = await fetchHint();
      const latestState = gameStateRef.current;
      if (
        !isCurrentGeneration(requestedGeneration) ||
        controlsBlockedRef.current ||
        !latestState ||
        latestState.session_id !== requestedState.session_id ||
        latestState.revision !== requestedState.revision ||
        data.session_id !== requestedState.session_id ||
        data.revision !== requestedState.revision
      ) {
        return;
      }

      let message = data.hint;
      if (data.outcome === "SOLVED") message = "This case is already solved.";
      else if (data.outcome === "STUCK_NO_FORCIBLE_MOVE") {
        message = "No currently forced move is available.";
      } else if (data.outcome === "INCONSISTENT") {
        message = "The revealed clues are inconsistent.";
      } else if (data.cell && data.status) {
        message = `${data.hint} (${data.cell}: ${data.status})`;
      }

      setBanner({ message, type: data.outcome === "INCONSISTENT" ? "error" : "info" });
      setLogs((previous) => [
        ...previous,
        {
          id: `hint-${Date.now()}`,
          time: "Hint",
          text: `💡 ${message} [${data.outcome}]`,
          type: data.outcome === "INCONSISTENT" ? "error" : "info",
        },
      ]);
    } catch (error) {
      if (!isCurrentGeneration(requestedGeneration)) return;
      console.error(error);
      setBanner({ message: "Could not fetch a hint.", type: "error" });
    }
  };

  const handleAutoSolve = () => {
    if (controlsBlockedRef.current || stateActionPendingRef.current) return;
    const currentState = gameStateRef.current;
    if (!currentState || currentState.is_solved || currentState.is_contradicted) return;

    stateChangeGenerationRef.current += 1;
    setSelectedVerdictCell(null);
    setBanner({ message: "Auto-solve started. Showing each proven verdict as it arrives.", type: "info" });
    controlsBlockedRef.current = true;
    autoSolve.start();
  };

  const handleStopAutoSolve = () => autoSolve.stop();

  const handlePause = async () => {
    await autoSolve.stop();
    if (mountedRef.current && !needsResyncRef.current) setIsPaused(true);
  };

  const handleRetryStateSync = async () => {
    if (
      !mountedRef.current ||
      !needsResyncRef.current ||
      isResyncing ||
      autoSolve.isRunning ||
      autoSolve.isStopping ||
      stateActionPendingRef.current
    ) {
      return;
    }

    stateActionPendingRef.current = true;
    controlsBlockedRef.current = true;
    setIsStateActionPending(true);
    stateChangeGenerationRef.current += 1;
    const generation = stateChangeGenerationRef.current;
    setIsResyncing(true);
    try {
      const currentState = await fetchGameState();
      if (!isCurrentGeneration(generation)) return;
      applyResyncedState(currentState);
      needsResyncRef.current = false;
      setNeedsResync(false);
      setBanner({
        message: `State refreshed (${currentState.current_stage}, revision ${currentState.revision}).`,
        type: "info",
      });
    } catch (error) {
      if (!isCurrentGeneration(generation)) return;
      console.error(error);
      needsResyncRef.current = true;
      setNeedsResync(true);
      setBanner({
        message: "Could not refresh game state. Retry when the server is reachable.",
        type: "error",
      });
    } finally {
      if (isCurrentGeneration(generation)) {
        stateActionPendingRef.current = false;
        setIsStateActionPending(false);
        setIsResyncing(false);
      }
    }
  };

  // Switch to next available stage if available
  const handleNextStage = () => {
    const currentState = gameStateRef.current;
    if (!currentState || controlsBlockedRef.current) return;
    const idx = currentState.available_stages.indexOf(currentState.current_stage);
    if (idx >= 0 && idx + 1 < currentState.available_stages.length) {
      void handleStageChange(currentState.available_stages[idx + 1]);
    } else {
      void handleRestart();
    }
  };

  if (loading || !gameState) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#161311] text-[#F6EFE6] select-none">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="font-serif text-lg tracking-wide">Opening Detective Casefile...</p>
      </div>
    );
  }

  return (
    <div
      className={`h-screen w-screen flex flex-col overflow-hidden font-sans transition-colors duration-200 ${
        darkMode ? "bg-[#161311] text-[#E2D7C8]" : "bg-[#F5EFE6] text-[#292524]"
      }`}
    >
      <Header
        currentStage={gameState.current_stage}
        availableStages={gameState.available_stages}
        stageCatalog={gameState.stage_catalog}
        solvedCount={gameState.solved_count}
        totalCells={gameState.total_cells}
        elapsedSeconds={elapsedSeconds}
        darkMode={darkMode}
        onStageChange={handleStageChange}
        onPause={handlePause}
        onRestart={handleRestart}
        onHint={handleHint}
        onAutoSolve={handleAutoSolve}
        onStopAutoSolve={handleStopAutoSolve}
        isAutoSolving={autoSolve.isRunning}
        isStopping={autoSolve.isStopping}
        actionsDisabled={actionsDisabled}
        onToggleTheme={() => setDarkMode((current) => !current)}
      />

      <Banner
        message={banner.message}
        type={banner.type}
        onClose={() => setBanner({ message: null, type: null })}
      />
      {needsResync && (
        <div className="border-b border-red-500/30 bg-red-950/50 px-5 py-2 flex items-center justify-between gap-3 text-xs text-red-200">
          <span role="status">
            {isResyncing ? "Refreshing game state…" : "Game state needs to be refreshed before continuing."}
          </span>
          <button
            type="button"
            onClick={() => void handleRetryStateSync()}
            disabled={isResyncing}
            className="rounded border border-red-300/40 px-3 py-1 font-semibold hover:bg-red-900/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isResyncing ? "Refreshing…" : "Retry state refresh"}
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 overflow-auto flex items-center justify-center p-4">
          <Board
            size={gameState.size}
            cells={gameState.cells}
            highlightedCoords={highlightedCoords}
            darkMode={darkMode}
            actionsDisabled={actionsDisabled}
            onCardClick={(cell) => {
              if (!controlsBlockedRef.current) setSelectedVerdictCell(cell);
            }}
            onClueClick={(cell) => {
              if (cell.referenced_coords) setHighlightedCoords(cell.referenced_coords);
            }}
          />
        </main>

        <CaseEvidence
          clues={gameState.active_clues}
          logs={logs}
          darkMode={darkMode}
          highlightedCoords={highlightedCoords}
          onHighlight={(coords) => setHighlightedCoords(coords)}
          onClearHighlight={() => setHighlightedCoords([])}
        />
      </div>

      <VerdictModal
        cell={selectedVerdictCell}
        darkMode={darkMode}
        onSelectVerdict={handleSelectVerdict}
        onClose={() => setSelectedVerdictCell(null)}
      />

      <PauseModal
        isOpen={isPaused}
        elapsedSeconds={elapsedSeconds}
        darkMode={darkMode}
        onResume={() => setIsPaused(false)}
      />

      <VictoryModal
        isOpen={gameState.is_solved && !needsResync && !autoSolve.isRunning}
        elapsedSeconds={elapsedSeconds}
        solvedCount={gameState.solved_count}
        darkMode={darkMode}
        onRestart={handleRestart}
        onNextStage={
          gameState.available_stages.indexOf(gameState.current_stage) <
          gameState.available_stages.length - 1
            ? handleNextStage
            : undefined
        }
      />
    </div>
  );
}

export default App;
