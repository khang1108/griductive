import { useState, useEffect, useRef } from "react";
import type { CellData, GameState, LogEntry } from "./types";
import {
  fetchGameState,
  submitVerdict,
  restartGame,
  loadStage,
  fetchHint,
  executeAutoSolve,
} from "./api/client";
import { Header } from "./components/header";
import { Banner } from "./components/feedback";
import { Board } from "./components/board";
import { CaseEvidence } from "./components/evidence";
import { VerdictModal, PauseModal, VictoryModal } from "./components/modals";

export function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [selectedVerdictCell, setSelectedVerdictCell] = useState<CellData | null>(null);
  const [highlightedCoords, setHighlightedCoords] = useState<string[]>([]);
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

  const stepCountRef = useRef(0);

  // Load initial game state
  useEffect(() => {
    fetchGameState()
      .then((state) => {
        setGameState(state);
        setBanner({
          message: `Loaded mystery: ${state.current_stage} (${state.size}×${state.size}).`,
          type: "info",
        });
      })
      .catch((err) => {
        console.error(err);
        setBanner({
          message: "Could not connect to Python game backend.",
          type: "error",
        });
      })
      .finally(() => setLoading(false));
  }, []);

  // Timer loop
  useEffect(() => {
    if (isPaused || !gameState || gameState.is_solved) return;
    const interval = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isPaused, gameState]);

  // Handle verdict submission
  const handleSelectVerdict = async (
    coord: string,
    status: "CRIMINAL" | "INNOCENT"
  ) => {
    setSelectedVerdictCell(null);
    stepCountRef.current += 1;
    const currentStep = stepCountRef.current;

    const m = Math.floor(elapsedSeconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (elapsedSeconds % 60).toString().padStart(2, "0");
    const timeStr = `${m}:${s}`;

    try {
      const newState = await submitVerdict(coord, status);
      setGameState(newState);

      if (newState.verdict_success) {
        setBanner({
          message: newState.banner_message || `✓ Correct call! ${coord} is ${status}.`,
          type: "success",
        });
        setLogs((prev) => [
          ...prev,
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
        setLogs((prev) => [
          ...prev,
          {
            id: `step-${currentStep}`,
            time: timeStr,
            text: `Step ${currentStep}: ${coord} as ${status} rejected (Not forced by current facts)`,
            type: "error",
          },
        ]);
      }
    } catch (err) {
      console.error(err);
      setBanner({
        message: "Failed to submit verdict to server.",
        type: "error",
      });
    }
  };

  // Handle stage change
  const handleStageChange = async (stage: string) => {
    try {
      const newState = await loadStage(stage);
      setGameState(newState);
      setElapsedSeconds(0);
      stepCountRef.current = 0;
      setHighlightedCoords([]);
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
    } catch (err) {
      console.error(err);
    }
  };

  // Handle restart
  const handleRestart = async () => {
    try {
      const newState = await restartGame();
      setGameState(newState);
      setElapsedSeconds(0);
      stepCountRef.current = 0;
      setHighlightedCoords([]);
      setBanner({
        message: "Game restarted. Ready for pure deduction.",
        type: "info",
      });
      setLogs([
        {
          id: `restart-${Date.now()}`,
          time: "00:00",
          text: "✦ Game restarted.",
          type: "info",
        },
      ]);
    } catch (err) {
      console.error(err);
    }
  };

  // Handle hint
  const handleHint = async () => {
    try {
      const data = await fetchHint();
      setBanner({
        message: data.hint,
        type: "info",
      });
      setLogs((prev) => [
        ...prev,
        {
          id: `hint-${Date.now()}`,
          time: "Hint",
          text: `💡 ${data.hint}`,
          type: "info",
        },
      ]);
    } catch (err) {
      console.error(err);
    }
  };

  // Handle auto solve
  const handleAutoSolve = async () => {
    try {
      setBanner({
        message: "⚡ Running DPLL Logic Agent... Deducing entailed verdicts.",
        type: "info",
      });
      const newState = await executeAutoSolve();
      setGameState(newState);
      setHighlightedCoords([]);

      if (newState.trace && newState.trace.length > 0) {
        const traceEntries: LogEntry[] = newState.trace.map((tr, idx) => ({
          id: `auto-${Date.now()}-${idx}`,
          time: "AI",
          text: `⚡ ${tr}`,
          type: "success",
        }));
        setLogs((prev) => [...prev, ...traceEntries]);
      }

      setBanner({
        message: newState.banner_message || `Auto-solve finished: ${newState.solved_count}/${newState.total_cells} cards solved.`,
        type: newState.is_solved ? "success" : "info",
      });
    } catch (err) {
      console.error(err);
      setBanner({
        message: "Auto-solve execution failed.",
        type: "error",
      });
    }
  };

  // Switch to next available stage if available
  const handleNextStage = () => {
    if (!gameState) return;
    const idx = gameState.available_stages.indexOf(gameState.current_stage);
    if (idx >= 0 && idx + 1 < gameState.available_stages.length) {
      handleStageChange(gameState.available_stages[idx + 1]);
    } else {
      handleRestart();
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
      {/* 1. Header Toolbar */}
      <Header
        currentStage={gameState.current_stage}
        availableStages={gameState.available_stages}
        stageCatalog={gameState.stage_catalog}
        solvedCount={gameState.solved_count}
        totalCells={gameState.total_cells}
        elapsedSeconds={elapsedSeconds}
        darkMode={darkMode}
        onStageChange={handleStageChange}
        onPause={() => setIsPaused(true)}
        onRestart={handleRestart}
        onHint={handleHint}
        onAutoSolve={handleAutoSolve}
        onToggleTheme={() => setDarkMode(!darkMode)}
      />

      {/* 2. Banner Feedback */}
      <Banner
        message={banner.message}
        type={banner.type}
        onClose={() => setBanner({ message: null, type: null })}
      />

      {/* 3. Main Workspace: Board on Left + Case Evidence on Right */}
      <div className="flex-1 flex overflow-hidden">
        {/* Game Board Container */}
        <main className="flex-1 overflow-auto flex items-center justify-center p-4">
          <Board
            size={gameState.size}
            cells={gameState.cells}
            highlightedCoords={highlightedCoords}
            darkMode={darkMode}
            onCardClick={(cell) => setSelectedVerdictCell(cell)}
            onClueClick={(cell) => {
              if (cell.referenced_coords) {
                setHighlightedCoords(cell.referenced_coords);
              }
            }}
          />
        </main>

        {/* Case Evidence Sidebar */}
        <CaseEvidence
          clues={gameState.active_clues}
          logs={logs}
          darkMode={darkMode}
          highlightedCoords={highlightedCoords}
          onHighlight={(coords) => setHighlightedCoords(coords)}
          onClearHighlight={() => setHighlightedCoords([])}
        />
      </div>

      {/* 4. Modals */}
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
        isOpen={gameState.is_solved}
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

