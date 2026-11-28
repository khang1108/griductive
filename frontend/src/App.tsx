import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertOctagon, Loader2, RotateCw } from "lucide-react";
import { soundEngine } from "./audio/soundEngine";
import {
  ActionDock,
  Banner,
  BenchmarkHud,
  CaseReportModal,
  EvidenceNotebook,
  Header,
  InvestigationBoard,
  InvestigationScene,
  PauseModal,
  RestartConfirmModal,
  SettingsModal,
  SuspectInspector,
} from "./components";
import { useGameSession } from "./hooks/useGameSession";
import { usePlayerNotes, type NotePatch } from "./hooks/usePlayerNotes";
import { useSettings } from "./hooks/useSettings";
import {
  computeBoardLayout,
  getBoardWorldBounds,
  getCellRect,
} from "./layout/boardLayout";
import type { CellData, VerdictStatus } from "./types";

export function App() {
  const {
    settings,
    updateSettings,
    resetSettings,
    osReducedMotion,
    effectiveReducedMotion,
    viewport,
  } = useSettings();

  const session = useGameSession({ settings, effectiveReducedMotion });
  const playerNotes = usePlayerNotes(session.gameState?.current_stage);

  const isDrawerMode = viewport.isMobile || viewport.isTablet;
  const isDesktop = !isDrawerMode;

  const [isNotebookOpen, setIsNotebookOpen] = useState<boolean>(
    () => !viewport.isMobile && !viewport.isTablet
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRestartConfirmOpen, setIsRestartConfirmOpen] = useState(false);
  const [caseReportDismissed, setCaseReportDismissed] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  const focusCellRef = useRef<((coord: string) => void) | null>(null);
  const lastAnnouncedLogIdRef = useRef<string | null>(null);
  const prevDesktopRef = useRef<boolean>(isDesktop);

  const reducedMotionAttr = effectiveReducedMotion ? "true" : "false";

  // Sync default Clues panel visibility only when crossing mobile/desktop breakpoint
  useEffect(() => {
    if (prevDesktopRef.current !== isDesktop) {
      prevDesktopRef.current = isDesktop;
      setIsNotebookOpen(isDesktop);
    }
  }, [isDesktop]);

  // Reset per-session modal states whenever session_id changes
  useEffect(() => {
    setCaseReportDismissed(false);
    setIsRestartConfirmOpen(false);
  }, [session.gameState?.session_id]);

  // Screen-reader announcements
  useEffect(() => {
    const announce = (text: string) => {
      if (!text) return;
      setLiveAnnouncement((prev) => (prev === text ? `${text}\u00A0` : text));
    };

    const latestLog = session.logs[session.logs.length - 1];
    if (latestLog && latestLog.id !== lastAnnouncedLogIdRef.current) {
      lastAnnouncedLogIdRef.current = latestLog.id;

      if (latestLog.tag === "[PROVABLE]") {
        const solvedSuffix = session.gameState?.is_solved
          ? " Case closed."
          : "";
        announce(
          `${session.banner.message ?? latestLog.text}${solvedSuffix}`
        );
      } else if (
        latestLog.tag === "[NOT_PROVABLE]" ||
        latestLog.tag === "[CONTRADICTED]" ||
        latestLog.tag === "[INCONSISTENT]"
      ) {
        announce(session.banner.message ?? latestLog.text);
      } else if (latestLog.tag === "[HINT]") {
        announce(`Hint: ${session.banner.message ?? latestLog.text}`);
      } else if (latestLog.tag === "[AI_STEP]" && session.lastStep) {
        announce(
          `AI proved ${session.lastStep.verdict_cell} as ${session.lastStep.verdict_status}.`
        );
      }
    }
  }, [
    session.logs,
    session.banner,
    session.lastStep,
    session.gameState?.is_solved,
  ]);

  const registerFocusRef = useCallback((fn: (coord: string) => void) => {
    focusCellRef.current = fn;
  }, []);

  const handleCloseInspector = useCallback(() => {
    const closingCoord = session.selectedCellCoord;
    session.selectCell(null);
    if (closingCoord) {
      requestAnimationFrame(() => {
        focusCellRef.current?.(closingCoord);
      });
    }
  }, [session.selectedCellCoord, session.selectCell]);

  const handleSubmitVerdict = useCallback(
    async (coord: string, status: VerdictStatus) => {
      await session.submitCellVerdict(coord, status);
    },
    [session.submitCellVerdict]
  );

  const handleUpdateNote = useCallback(
    (coord: string, patch: NotePatch) => {
      if (typeof patch === "function" || "text" in patch) {
        soundEngine.playPencilTick();
      }
      playerNotes.setNote(coord, patch);
    },
    [playerNotes.setNote]
  );

  const handleClearNote = useCallback(
    (coord: string) => {
      playerNotes.clearNote(coord);
      soundEngine.playPencilTick();
    },
    [playerNotes.clearNote]
  );

  const handleRequestRestart = useCallback(() => {
    if (session.actionsDisabled) return;
    if (playerNotes.hasNotes) {
      soundEngine.playPaperSelect();
      setIsRestartConfirmOpen(true);
    } else {
      void session.restart();
    }
  }, [session.actionsDisabled, session.restart, playerNotes.hasNotes]);

  const handleHighlightCellClue = useCallback(
    (cell: CellData) => {
      const clue = session.gameState?.active_clues.find(
        (c) => c.owner_coord === cell.coord
      );
      if (!clue) return;
      if (session.selectedClueId === clue.clue_id) {
        session.selectClue(null);
      } else {
        session.selectClue(clue.clue_id);
      }
    },
    [session.gameState?.active_clues, session.selectedClueId, session.selectClue]
  );

  // Compute board pixel dimensions so cards stay generous and crisp inside the 3D scene
  const boardLayout = useMemo(() => {
    const sideAllowance = isDesktop
      ? (isNotebookOpen ? 330 : 64) + (session.selectedCell ? 300 : 48)
      : 36;
    const verticalAllowance = viewport.isMobile ? 168 : 156;
    return computeBoardLayout(
      session.gameState?.rows ?? session.gameState?.size ?? 3,
      {
        cols: session.gameState?.cols,
        compact: viewport.isCompact,
        maxWidth: Math.max(250, viewport.width - sideAllowance),
        maxHeight: Math.max(250, viewport.height - verticalAllowance),
      }
    );
  }, [
    session.gameState?.size,
    session.gameState?.rows,
    session.gameState?.cols,
    viewport.isCompact,
    viewport.isMobile,
    viewport.width,
    viewport.height,
    isDesktop,
    isNotebookOpen,
    Boolean(session.selectedCell),
  ]);

  // Subtle horizontal framing offset so the 3D desk balances against open floating panels
  const horizontalBiasNormalized = useMemo(() => {
    if (!isDesktop) return 0;
    const rightOpen = isNotebookOpen ? 1 : 0;
    const leftOpen = session.selectedCell ? 1 : 0;
    if (rightOpen && !leftOpen) return 0.24;
    if (!rightOpen && leftOpen) return -0.2;
    if (rightOpen && leftOpen) return 0.02;
    return 0;
  }, [isDesktop, isNotebookOpen, Boolean(session.selectedCell)]);

  // World-space offset of the currently inspected suspect card for subtle 3D camera lean
  const inspectWorldOffset = useMemo<[number, number] | null>(() => {
    const cell = session.selectedCell;
    if (!cell) return null;
    const rect = getCellRect(boardLayout, cell.row, cell.col);
    const bounds = getBoardWorldBounds(boardLayout);
    const pxX = boardLayout.gridOffsetX + rect.cx - boardLayout.totalWidth / 2;
    const pxY = boardLayout.gridOffsetY + rect.cy - boardLayout.totalHeight / 2;
    return [pxX * bounds.worldPerPx, pxY * bounds.worldPerPx];
  }, [session.selectedCell, boardLayout]);

  const hasClueFocus = Boolean(
    session.selectedClueId !== null ||
      session.pinnedClueIds.length > 0 ||
      session.presentation.hintedCellCoord !== null ||
      session.presentation.hintedClueIds.length > 0
  );

  const isSelectedCellClueHighlighted = useMemo(() => {
    if (!session.gameState || !session.selectedCell?.is_revealed) return false;
    const clue = session.gameState.active_clues.find(
      (c) => c.owner_coord === session.selectedCell?.coord
    );
    if (!clue) return false;
    return (
      session.selectedClueId === clue.clue_id ||
      session.pinnedClueIds.includes(clue.clue_id)
    );
  }, [
    session.gameState,
    session.selectedCell,
    session.selectedClueId,
    session.pinnedClueIds,
  ]);

  const currentStageDisplayName = useMemo(() => {
    const state = session.gameState;
    if (!state) return "";
    const info = state.stage_catalog?.find(
      (s) => s.puzzle_id === state.current_stage
    );
    return (
      info?.name ||
      state.current_stage.replace(/_/g, " ").replace(/\.json$/i, "")
    );
  }, [session.gameState]);

  const hasNextStage = useMemo(() => {
    const state = session.gameState;
    if (!state) return false;
    const idx = state.available_stages.indexOf(state.current_stage);
    return idx >= 0 && idx + 1 < state.available_stages.length;
  }, [session.gameState]);

  // Initial Loading Screen
  if (session.initialLoading && !session.gameState) {
    return (
      <div
        data-reduced-motion={reducedMotionAttr}
        className="min-h-screen w-full flex flex-col items-center justify-center bg-[#14110E] text-[#F4ECDD] px-6 select-none"
      >
        <div className="flex flex-col items-center text-center gap-3">
          <Loader2
            className="w-7 h-7 text-[#E5BC74] animate-spin"
            aria-hidden="true"
          />
          <h1 className="font-serif text-xl font-bold tracking-wide text-[#F4ECDD]">
            Opening Casefile…
          </h1>
        </div>
      </div>
    );
  }

  // Initial Load Error Screen
  if (session.loadError && !session.gameState) {
    return (
      <div
        data-reduced-motion={reducedMotionAttr}
        className="min-h-screen w-full flex flex-col items-center justify-center bg-[#14110E] text-[#F4ECDD] px-6"
      >
        <div
          role="alert"
          className="w-full max-w-sm rounded-2xl border border-[#AD5147]/65 bg-[#1C1513] p-6 flex flex-col items-center text-center lamp-panel-shadow"
        >
          <AlertOctagon
            className="w-6 h-6 text-[#E88B81] mb-3"
            aria-hidden="true"
          />
          <h1 className="font-serif text-xl font-bold text-[#F4ECDD]">
            Unable to Open Casefile
          </h1>
          <p className="mt-1.5 text-xs text-[#F3B5AF] leading-relaxed">
            {session.loadError}
          </p>
          <button
            type="button"
            onClick={() => void session.retryInitialLoad()}
            className="btn-tactile mt-5 inline-flex items-center justify-center gap-2 h-[40px] px-5 rounded-full bg-[#E5BC74] hover:bg-[#EECA8A] text-[#14110E] text-xs font-bold cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Retry</span>
          </button>
        </div>
      </div>
    );
  }

  const gameState = session.gameState;
  if (!gameState) return null;

  const showCaseReport = Boolean(
    gameState.is_solved &&
      session.presentation.caseClosedReady &&
      !caseReportDismissed &&
      !session.isPaused &&
      !session.needsResync &&
      !isRestartConfirmOpen &&
      !isSettingsOpen
  );

  const bannerProps = session.needsResync
    ? {
        message:
          session.banner.message ??
          "Session state changed — refresh to continue.",
        type: session.banner.type ?? ("error" as const),
        assessment: session.banner.assessment,
        onRetry: () => void session.retrySync(),
        retryLabel: "Refresh",
        isRetrying: session.isResyncing,
        onClose: session.clearBanner,
      }
    : session.stageError
      ? {
          message: session.banner.message ?? session.stageError,
          type: "error" as const,
          assessment: null,
          onRetry: () => void session.retryStageAction(),
          retryLabel: "Retry",
          isRetrying: session.isStageLoading,
          onClose: () => {
            session.dismissStageError();
            session.clearBanner();
          },
        }
      : {
          message: session.banner.message,
          type: session.banner.type,
          assessment: session.banner.assessment,
          onClose: session.clearBanner,
        };

  return (
    <div
      data-reduced-motion={reducedMotionAttr}
      className="relative h-screen w-screen overflow-hidden bg-[#120F0D] text-[#F4ECDD] font-sans"
    >
      {/* Screen-Reader Live Region */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      {/* Full-Bleed 3D Midnight Archive Stage */}
      <main
        aria-label="3D investigation desk"
        className="fixed inset-0 w-full h-full overflow-hidden"
      >
        <InvestigationScene
          boardLayout={boardLayout}
          quality={settings.quality}
          cameraMode={session.presentation.cameraMode}
          horizontalBiasNormalized={horizontalBiasNormalized}
          inspectWorldOffset={inspectWorldOffset}
          isPaused={session.isPaused}
          reducedMotion={effectiveReducedMotion}
        >
          <InvestigationBoard
            sessionKey={gameState.session_id}
            size={gameState.size}
            cells={gameState.cells}
            layout={boardLayout}
            selectedCellCoord={session.selectedCellCoord}
            highlightedCoords={session.highlightedCoords}
            selectedClue={session.selectedClue}
            pinnedClues={session.pinnedClues}
            pendingCoord={session.pendingCoord}
            stampAnimatingCoord={session.presentation.stampAnimatingCoord}
            rejectedCoord={session.presentation.rejectedCoord}
            rejectedAssessment={session.presentation.rejectedAssessment}
            rejectRunId={session.presentation.animationRunId}
            hintedCellCoord={session.presentation.hintedCellCoord}
            notes={playerNotes.notes}
            actionsDisabled={session.actionsDisabled}
            reducedMotion={effectiveReducedMotion}
            onSelectCell={(coord) => session.selectCell(coord)}
            onClosePanel={
              session.selectedCell ? handleCloseInspector : undefined
            }
            registerFocusRef={registerFocusRef}
          />
        </InvestigationScene>
      </main>

      {/* Minimal Floating Top Pills */}
      <Header
        currentStage={gameState.current_stage}
        availableStages={gameState.available_stages}
        stageCatalog={gameState.stage_catalog}
        solvedCount={gameState.solved_count}
        totalCells={gameState.total_cells}
        elapsedSeconds={session.elapsedSeconds}
        clueCount={gameState.active_clues.length}
        newClueCount={session.presentation.newClueIds.length}
        muted={settings.muted}
        isPaused={session.isPaused}
        actionsDisabled={session.actionsDisabled}
        isAutoSolving={session.isAutoSolving}
        isAutoSolveStopping={session.isAutoSolveStopping}
        isStageLoading={session.isStageLoading}
        isNotebookOpen={isNotebookOpen}
        onStageChange={(stage) => void session.changeStage(stage)}
        onToggleMute={() => updateSettings({ muted: !settings.muted })}
        onPause={() => void session.pause()}
        onOpenSettings={() => {
          soundEngine.playPaperSelect();
          setIsSettingsOpen(true);
        }}
        onToggleNotebook={() => {
          soundEngine.playPaperSelect();
          setIsNotebookOpen((open) => !open);
        }}
      />

      {/* Quiet Floating Toast Capsule */}
      <Banner {...bannerProps} />

      {/* Compact Floating Suspect Card (Left on Desktop, Sheet on Mobile/Tablet) */}
      <SuspectInspector
        cell={session.selectedCell}
        note={
          session.selectedCell
            ? playerNotes.getNote(session.selectedCell.coord)
            : null
        }
        isPending={
          Boolean(session.selectedCell) &&
          session.pendingCoord === session.selectedCell?.coord
        }
        actionsDisabled={session.actionsDisabled}
        isMobile={viewport.isMobile}
        isTablet={viewport.isTablet}
        rejectedAssessment={
          Boolean(session.selectedCell) &&
          session.presentation.rejectedCoord === session.selectedCell?.coord
            ? session.presentation.rejectedAssessment
            : null
        }
        rejectRunId={session.presentation.animationRunId}
        isClueHighlighted={isSelectedCellClueHighlighted}
        onSubmitVerdict={handleSubmitVerdict}
        onHighlightClue={handleHighlightCellClue}
        onUpdateNote={handleUpdateNote}
        onClearNote={handleClearNote}
        onClose={handleCloseInspector}
      />

      {/* Floating Right Clues Sheet */}
      <EvidenceNotebook
        clues={gameState.active_clues}
        logs={session.logs}
        selectedClueId={session.selectedClueId}
        pinnedClueIds={session.pinnedClueIds}
        newClueIds={session.presentation.newClueIds}
        hintedClueIds={session.presentation.hintedClueIds}
        lastMetrics={session.lastMetrics}
        lastStep={session.lastStep}
        hasClueFocus={hasClueFocus}
        isMobile={viewport.isMobile}
        isTablet={viewport.isTablet}
        isOpen={isNotebookOpen}
        onClose={() => setIsNotebookOpen(false)}
        onSelectClue={session.selectClue}
        onTogglePinClue={session.togglePinClue}
        onClearFocus={() => {
          soundEngine.playPaperSelect();
          session.clearClueFocus();
        }}
      />

      {/* Always-Visible Live SAT Benchmark HUD */}
      <BenchmarkHud
        metrics={session.lastMetrics}
        lastStep={session.lastStep}
        isAutoSolving={session.isAutoSolving}
        isStepPending={session.isStepPending}
        isSolved={gameState.is_solved}
        isDrawerMode={isDrawerMode}
      />

      {/* Minimal Bottom-Center Action Capsule */}
      <ActionDock
        isSolved={gameState.is_solved}
        isContradicted={gameState.is_contradicted}
        actionsDisabled={session.actionsDisabled}
        isHintPending={session.isHintPending}
        isStepPending={session.isStepPending}
        isAutoSolving={session.isAutoSolving}
        isAutoSolveStopping={session.isAutoSolveStopping}
        hasClueFocus={hasClueFocus}
        onHint={session.handleHint}
        onStepAi={session.stepAiOnce}
        onStartAutoSolve={session.startAutoSolve}
        onStopAutoSolve={session.stopAutoSolve}
        onRestart={handleRequestRestart}
        onClearClueFocus={() => {
          soundEngine.playPaperSelect();
          session.clearClueFocus();
        }}
      />

      {/* Modals */}
      <PauseModal
        isOpen={session.isPaused}
        elapsedSeconds={session.elapsedSeconds}
        onResume={session.resume}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        osReducedMotion={osReducedMotion}
        onUpdateSettings={updateSettings}
        onResetSettings={resetSettings}
        onClose={() => setIsSettingsOpen(false)}
      />

      <RestartConfirmModal
        isOpen={isRestartConfirmOpen}
        noteCount={Object.keys(playerNotes.notes).length}
        onRestartKeepNotes={() => {
          setIsRestartConfirmOpen(false);
          void session.restart();
        }}
        onRestartClearNotes={() => {
          setIsRestartConfirmOpen(false);
          playerNotes.clearPuzzleNotes();
          soundEngine.playPencilTick();
          void session.restart();
        }}
        onCancel={() => setIsRestartConfirmOpen(false)}
      />

      <CaseReportModal
        isOpen={showCaseReport}
        stageName={currentStageDisplayName}
        solveModeUsed={session.solveModeUsed}
        elapsedSeconds={session.elapsedSeconds}
        solvedCount={gameState.solved_count}
        totalCells={gameState.total_cells}
        clueCount={gameState.active_clues.length}
        lastMetrics={session.lastMetrics}
        reducedMotion={effectiveReducedMotion}
        onNextStage={
          hasNextStage ? () => void session.nextStage() : undefined
        }
        onRestart={handleRequestRestart}
        onClose={() => setCaseReportDismissed(true)}
      />
    </div>
  );
}

export default App;
