export interface CellData {
  coord: string;
  row: number;
  col: number;
  name: string;
  profession: string;
  is_revealed: boolean;
  status: "CRIMINAL" | "INNOCENT" | null;
  clue_text: string | null;
  clue_type: string | null;
  referenced_coords: string[];
  avatar_url: string;
}

export interface ActiveClue {
  clue_id: string;
  owner_coord: string;
  owner_name: string;
  owner_avatar_url: string;
  type: string;
  text: string;
  referenced_coords: string[];
}

export interface StageInfo {
  puzzle_id: string;
  name: string;
  size: number;
  difficulty: string;
  initial_revealed?: string[];
}

export interface GameState {
  session_id: string;
  size: number;
  current_stage: string;
  available_stages: string[];
  stage_catalog?: StageInfo[];
  solved_count: number;
  total_cells: number;
  is_solved: boolean;
  is_contradicted: boolean;
  revision: number;
  banner_message: string | null;
  banner_type: "success" | "error" | "info" | null;
  cells: CellData[];
  active_clues: ActiveClue[];
  verdict_success?: boolean;
  verdict_message?: string;
}

export type LogicOutcome =
  | "IN_PROGRESS"
  | "SOLVED"
  | "STUCK_NO_FORCIBLE_MOVE"
  | "INCONSISTENT"
  | "ENGINE_REJECTED"
  | "TIMEOUT";

export type HintOutcome =
  | "AVAILABLE"
  | "SOLVED"
  | "STUCK_NO_FORCIBLE_MOVE"
  | "INCONSISTENT";

export type VerdictStatus = "CRIMINAL" | "INNOCENT";

export interface SolverStatsSnapshot {
  decisions: number;
  propagations: number;
  backtracks: number;
  runtime_ms: number;
}

export interface TraceStep {
  step: number;
  active_clue_ids: string[];
  sat_queries: number;
  verdict_cell: string;
  verdict_status: VerdictStatus;
  new_clue_id: string | null;
  primary_vars_count: number;
  aux_vars_count: number;
  clause_count: number;
  stats: SolverStatsSnapshot;
}

export interface RunMetrics {
  sat_queries: number;
  decisions: number;
  propagations: number;
  backtracks: number;
  solver_runtime_ms: number;
  wall_time_ms: number;
  max_primary_vars: number;
  max_aux_vars: number;
  max_clauses: number;
  deduction_steps: number;
}

export interface HintResponse {
  hint: string;
  cell: string | null;
  status: VerdictStatus | null;
  active_clue_ids: string[];
  session_id: string;
  revision: number;
  outcome: HintOutcome;
}

export interface StepResponse {
  state: GameState;
  outcome: LogicOutcome;
  step: TraceStep | null;
  metrics: RunMetrics;
}

export interface LogEntry {
  id: string;
  time: string;
  text: string;
  type: "info" | "success" | "error";
}

