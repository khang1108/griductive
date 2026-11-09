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

export interface LogEntry {
  id: string;
  time: string;
  text: string;
  type: "info" | "success" | "error";
}

