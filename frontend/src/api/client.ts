import type { GameState } from "../types";

const API_BASE = "";

export async function fetchGameState(): Promise<GameState> {
  const res = await fetch(`${API_BASE}/api/state`);
  if (!res.ok) {
    throw new Error(`Failed to fetch state: ${res.statusText}`);
  }
  return res.json();
}

export async function submitVerdict(
  coord: string,
  status: "CRIMINAL" | "INNOCENT"
): Promise<GameState> {
  const res = await fetch(`${API_BASE}/api/verdict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ coord, status }),
  });
  if (!res.ok) {
    throw new Error(`Failed to submit verdict: ${res.statusText}`);
  }
  return res.json();
}

export async function restartGame(): Promise<GameState> {
  const res = await fetch(`${API_BASE}/api/restart`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`Failed to restart game: ${res.statusText}`);
  }
  return res.json();
}

export async function loadStage(stage: string): Promise<GameState> {
  const res = await fetch(`${API_BASE}/api/load`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage }),
  });
  if (!res.ok) {
    throw new Error(`Failed to load stage: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchHint(): Promise<{ hint: string; cell?: string; status?: string }> {
  const res = await fetch(`${API_BASE}/api/hint`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch hint: ${res.statusText}`);
  }
  return res.json();
}

export async function executeAutoSolve(): Promise<GameState & { steps_taken?: number; trace?: string[] }> {
  const res = await fetch(`${API_BASE}/api/auto-solve`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`Failed to run auto-solve: ${res.statusText}`);
  }
  return res.json();
}

