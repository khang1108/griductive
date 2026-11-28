export type VerdictStatus = "CRIMINAL" | "INNOCENT";

export type VerdictAssessmentType =
  | "PROVABLE"
  | "NOT_PROVABLE"
  | "CONTRADICTED"
  | "INCONSISTENT"
  | "ALREADY_SOLVED";

export type ClueKind =
  | "FACT"
  | "SAME"
  | "DIFFERENT"
  | "EXACTLY"
  | "ATLEAST"
  | "ATMOST"
  | "PARITY"
  | "COMPARE"
  | "CONNECTED"
  | "COMPOUND"
  | "FLAVOR";

export type RegionKind =
  | "ROW"
  | "COLUMN"
  | "NEIGHBORS"
  | "EXPLICIT"
  | "INTERSECTION";

export type ParityValue = "EVEN" | "ODD";

export interface RegionSubDescriptor {
  kind: RegionKind | string;
  label: string;
  params: Record<string, unknown>;
}

export interface ClueDescriptor {
  kind: ClueKind | string;
  targets: string[];
  target_status: VerdictStatus | null;
  region_kind: RegionKind | string | null;
  region_label: string | null;
  region_params: Record<string, unknown> | null;
  k: number | null;
  parity: ParityValue | string | null;
}

export interface CellData {
  coord: string;
  row: number;
  col: number;
  name: string;
  profession: string;
  is_revealed: boolean;
  status: VerdictStatus | null;
  clue_text: string | null;
  clue_type: string | null;
  referenced_coords: string[];
  avatar_url: string;
  clue_descriptor?: ClueDescriptor | null;
}

export interface ActiveClue {
  clue_id: string;
  owner_coord: string;
  owner_name: string;
  owner_avatar_url: string;
  type: string;
  text: string;
  referenced_coords: string[];
  descriptor?: ClueDescriptor | null;
}

export interface StageInfo {
  puzzle_id: string;
  name: string;
  size: number;
  rows?: number;
  cols?: number;
  difficulty: string;
  initial_revealed?: string[];
}

export type BannerType = "success" | "warning" | "error" | "info" | null;

export interface BannerState {
  message: string | null;
  type: BannerType;
  assessment?: VerdictAssessmentType | null;
}

export interface GameState {
  session_id: string;
  size: number;
  rows?: number;
  cols?: number;
  current_stage: string;
  available_stages: string[];
  stage_catalog?: StageInfo[];
  solved_count: number;
  total_cells: number;
  is_solved: boolean;
  is_contradicted: boolean;
  revision: number;
  banner_message: string | null;
  banner_type: BannerType;
  cells: CellData[];
  active_clues: ActiveClue[];
  verdict_success?: boolean;
  verdict_message?: string;
  verdict_assessment?: VerdictAssessmentType;
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
  type: "info" | "success" | "warning" | "error";
  tag?: string;
}

export type QualityMode = "high" | "standard" | "low";
export type CameraMode = "intro" | "overview" | "focus" | "caseClosed";
export type ViewMode = "overview" | "focus";
export type AutoSolveSpeed = "slow" | "normal" | "fast";
export type SolveModeUsed = "manual" | "hint" | "ai";

export interface PlayerNote {
  flagReview: boolean;
  hypothesis: VerdictStatus | null;
  text: string;
  updatedAt: number;
}

export interface UserSettings {
  quality: QualityMode;
  viewMode: ViewMode;
  reducedMotion: boolean;
  muted: boolean;
  sfxVolume: number;
  ambientRain: boolean;
  ambientVolume: number;
  autoSolveSpeed: AutoSolveSpeed;
  skipIntroOnRepeat: boolean;
}

export interface PresentationState {
  cameraMode: CameraMode;
  isIntroActive: boolean;
  stampAnimatingCoord: string | null;
  rejectedCoord: string | null;
  rejectedAssessment: VerdictAssessmentType | null;
  newClueIds: string[];
  hintedCellCoord: string | null;
  hintedClueIds: string[];
  caseClosedReady: boolean;
  animationRunId: number;
}
