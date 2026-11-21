import type {
  ActiveClue,
  CellData,
  GameState,
  HintOutcome,
  HintResponse,
  LogicOutcome,
  RunMetrics,
  SolverStatsSnapshot,
  StageInfo,
  StepResponse,
  TraceStep,
  VerdictStatus,
} from "../types";

const API_BASE = "";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type ResponseGuard<T> = (value: unknown) => value is T;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isStageInfo(value: unknown): value is StageInfo {
  if (!isRecord(value)) return false;
  return (
    typeof value.puzzle_id === "string" &&
    typeof value.name === "string" &&
    typeof value.size === "number" &&
    typeof value.difficulty === "string" &&
    (value.initial_revealed === undefined || isStringArray(value.initial_revealed))
  );
}

function isCellData(value: unknown): value is CellData {
  if (!isRecord(value)) return false;
  return (
    typeof value.coord === "string" &&
    typeof value.row === "number" &&
    typeof value.col === "number" &&
    typeof value.name === "string" &&
    typeof value.profession === "string" &&
    typeof value.is_revealed === "boolean" &&
    (value.status === null || isVerdictStatus(value.status)) &&
    (value.clue_text === null || typeof value.clue_text === "string") &&
    (value.clue_type === null || typeof value.clue_type === "string") &&
    isStringArray(value.referenced_coords) &&
    typeof value.avatar_url === "string"
  );
}

function isActiveClue(value: unknown): value is ActiveClue {
  if (!isRecord(value)) return false;
  return (
    typeof value.clue_id === "string" &&
    typeof value.owner_coord === "string" &&
    typeof value.owner_name === "string" &&
    typeof value.owner_avatar_url === "string" &&
    typeof value.type === "string" &&
    typeof value.text === "string" &&
    isStringArray(value.referenced_coords)
  );
}

function isGameState(value: unknown): value is GameState {
  if (!isRecord(value)) return false;
  const hasValidStageCatalog =
    value.stage_catalog === undefined ||
    (Array.isArray(value.stage_catalog) && value.stage_catalog.every(isStageInfo));
  const hasValidBannerType =
    value.banner_type === null ||
    value.banner_type === "success" ||
    value.banner_type === "error" ||
    value.banner_type === "info";

  return (
    typeof value.session_id === "string" &&
    typeof value.size === "number" &&
    typeof value.current_stage === "string" &&
    isStringArray(value.available_stages) &&
    hasValidStageCatalog &&
    typeof value.solved_count === "number" &&
    typeof value.total_cells === "number" &&
    typeof value.is_solved === "boolean" &&
    typeof value.is_contradicted === "boolean" &&
    typeof value.revision === "number" &&
    (value.banner_message === null || typeof value.banner_message === "string") &&
    hasValidBannerType &&
    Array.isArray(value.cells) &&
    value.cells.every(isCellData) &&
    Array.isArray(value.active_clues) &&
    value.active_clues.every(isActiveClue) &&
    (value.verdict_success === undefined || typeof value.verdict_success === "boolean") &&
    (value.verdict_message === undefined || typeof value.verdict_message === "string")
  );
}

function isVerdictStatus(value: unknown): value is VerdictStatus {
  return value === "CRIMINAL" || value === "INNOCENT";
}

function isLogicOutcome(value: unknown): value is LogicOutcome {
  return (
    value === "IN_PROGRESS" ||
    value === "SOLVED" ||
    value === "STUCK_NO_FORCIBLE_MOVE" ||
    value === "INCONSISTENT" ||
    value === "ENGINE_REJECTED" ||
    value === "TIMEOUT"
  );
}

function isHintOutcome(value: unknown): value is HintOutcome {
  return (
    value === "AVAILABLE" ||
    value === "SOLVED" ||
    value === "STUCK_NO_FORCIBLE_MOVE" ||
    value === "INCONSISTENT"
  );
}

function isSolverStats(value: unknown): value is SolverStatsSnapshot {
  if (!isRecord(value)) return false;
  return (
    typeof value.decisions === "number" &&
    typeof value.propagations === "number" &&
    typeof value.backtracks === "number" &&
    typeof value.runtime_ms === "number"
  );
}

function isTraceStep(value: unknown): value is TraceStep {
  if (!isRecord(value)) return false;
  return (
    typeof value.step === "number" &&
    isStringArray(value.active_clue_ids) &&
    typeof value.sat_queries === "number" &&
    typeof value.verdict_cell === "string" &&
    isVerdictStatus(value.verdict_status) &&
    (value.new_clue_id === null || typeof value.new_clue_id === "string") &&
    typeof value.primary_vars_count === "number" &&
    typeof value.aux_vars_count === "number" &&
    typeof value.clause_count === "number" &&
    isSolverStats(value.stats)
  );
}

function isRunMetrics(value: unknown): value is RunMetrics {
  if (!isRecord(value)) return false;
  return (
    typeof value.sat_queries === "number" &&
    typeof value.decisions === "number" &&
    typeof value.propagations === "number" &&
    typeof value.backtracks === "number" &&
    typeof value.solver_runtime_ms === "number" &&
    typeof value.wall_time_ms === "number" &&
    typeof value.max_primary_vars === "number" &&
    typeof value.max_aux_vars === "number" &&
    typeof value.max_clauses === "number" &&
    typeof value.deduction_steps === "number"
  );
}

function isHintResponse(value: unknown): value is HintResponse {
  if (!isRecord(value)) return false;
  return (
    typeof value.hint === "string" &&
    (value.cell === null || typeof value.cell === "string") &&
    (value.status === null || isVerdictStatus(value.status)) &&
    isStringArray(value.active_clue_ids) &&
    typeof value.session_id === "string" &&
    typeof value.revision === "number" &&
    isHintOutcome(value.outcome)
  );
}

function isStepResponse(value: unknown): value is StepResponse {
  if (!isRecord(value)) return false;
  return (
    isGameState(value.state) &&
    isLogicOutcome(value.outcome) &&
    (value.step === null || isTraceStep(value.step)) &&
    isRunMetrics(value.metrics)
  );
}

function isLegacyAutoSolveResponse(
  value: unknown
): value is GameState & { steps_taken?: number; trace?: string[] } {
  if (!isRecord(value) || !isGameState(value)) return false;
  return (
    (value.steps_taken === undefined || typeof value.steps_taken === "number") &&
    (value.trace === undefined || isStringArray(value.trace))
  );
}

async function requestJson<T>(
  url: string,
  init: RequestInit,
  responseGuard: ResponseGuard<T>,
  context: string
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      `${context} failed: ${response.statusText || `HTTP ${response.status}`}`
    );
  }

  const payload: unknown = await response.json();
  if (!responseGuard(payload)) {
    throw new TypeError(`Invalid ${context} response`);
  }
  return payload;
}

export function fetchGameState(): Promise<GameState> {
  return requestJson(`${API_BASE}/api/state`, {}, isGameState, "Fetch state");
}

export function submitVerdict(
  coord: string,
  status: VerdictStatus
): Promise<GameState> {
  return requestJson(
    `${API_BASE}/api/verdict`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coord, status }),
    },
    isGameState,
    "Submit verdict"
  );
}

export function restartGame(): Promise<GameState> {
  return requestJson(
    `${API_BASE}/api/restart`,
    { method: "POST" },
    isGameState,
    "Restart game"
  );
}

export function loadStage(stage: string): Promise<GameState> {
  return requestJson(
    `${API_BASE}/api/load`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    },
    isGameState,
    "Load stage"
  );
}

export function fetchHint(): Promise<HintResponse> {
  return requestJson(
    `${API_BASE}/api/hint`,
    { method: "POST" },
    isHintResponse,
    "Fetch hint"
  );
}

export function executeAutoSolveStep(
  sessionId: string,
  revision: number
): Promise<StepResponse> {
  return requestJson(
    `${API_BASE}/api/auto-solve/step`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, revision }),
    },
    isStepResponse,
    "Run auto-solve step"
  );
}

// Retained for API compatibility; the interactive GUI uses executeAutoSolveStep.
export function executeAutoSolve(): Promise<
  GameState & { steps_taken?: number; trace?: string[] }
> {
  return requestJson(
    `${API_BASE}/api/auto-solve`,
    { method: "POST" },
    isLegacyAutoSolveResponse,
    "Run auto-solve"
  );
}
