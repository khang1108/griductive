import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlayerNote, VerdictStatus } from "../types";

const NOTES_STORAGE_KEY = "griductive.midnightArchive.notes.v1";
const MAX_UNDO_PER_PUZZLE = 50;

type NotesByPuzzle = Record<string, Record<string, PlayerNote>>;

interface UndoEntry {
  coord: string;
  previous: PlayerNote | null;
}

function isVerdictStatus(value: unknown): value is VerdictStatus {
  return value === "CRIMINAL" || value === "INNOCENT";
}

function isPlayerNote(value: unknown): value is PlayerNote {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.flagReview === "boolean" &&
    (obj.hypothesis === null || isVerdictStatus(obj.hypothesis)) &&
    typeof obj.text === "string" &&
    typeof obj.updatedAt === "number"
  );
}

function isNoteEmpty(note: PlayerNote): boolean {
  return !note.flagReview && note.hypothesis === null && note.text.length === 0;
}

function createBlankNote(): PlayerNote {
  return {
    flagReview: false,
    hypothesis: null,
    text: "",
    updatedAt: 0,
  };
}

function loadAllNotes(): NotesByPuzzle {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(NOTES_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const result: NotesByPuzzle = {};
    for (const [puzzleId, cellMap] of Object.entries(parsed)) {
      if (
        typeof cellMap !== "object" ||
        cellMap === null ||
        Array.isArray(cellMap)
      ) {
        continue;
      }
      const cleanCells: Record<string, PlayerNote> = {};
      for (const [coord, note] of Object.entries(cellMap)) {
        if (isPlayerNote(note) && !isNoteEmpty(note)) {
          cleanCells[coord] = note;
        }
      }
      if (Object.keys(cleanCells).length > 0) {
        result[puzzleId] = cleanCells;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export type NotePatch =
  | Partial<Omit<PlayerNote, "updatedAt">>
  | ((prev: PlayerNote) => Partial<Omit<PlayerNote, "updatedAt">>);

export interface UsePlayerNotesReturn {
  notes: Record<string, PlayerNote>;
  getNote: (coord: string) => PlayerNote | null;
  setNote: (coord: string, patch: NotePatch) => void;
  clearNote: (coord: string) => void;
  undoNote: (coord?: string) => boolean;
  clearPuzzleNotes: (targetPuzzleId?: string) => void;
  hasNotesForPuzzle: (targetPuzzleId?: string) => boolean;
  canUndo: (coord?: string) => boolean;
  hasNotes: boolean;
}

/**
 * Strictly client-local investigation pencil notes keyed by puzzle_id.
 * Never mutates authoritative GameState, solved_count, or backend verdicts.
 */
export function usePlayerNotes(
  puzzleId: string | null | undefined
): UsePlayerNotesReturn {
  const [notesByPuzzle, setNotesByPuzzle] = useState<NotesByPuzzle>(() =>
    loadAllNotes()
  );
  const notesByPuzzleRef = useRef<NotesByPuzzle>(notesByPuzzle);
  notesByPuzzleRef.current = notesByPuzzle;

  const undoStackRef = useRef<Record<string, UndoEntry[]>>({});
  const [, setUndoVersion] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        NOTES_STORAGE_KEY,
        JSON.stringify(notesByPuzzle)
      );
    } catch {
      // Ignore storage quota / private mode failures.
    }
  }, [notesByPuzzle]);

  const activePuzzleId = puzzleId ?? "";

  const notes = useMemo<Record<string, PlayerNote>>(() => {
    if (!activePuzzleId) return {};
    return notesByPuzzle[activePuzzleId] ?? {};
  }, [notesByPuzzle, activePuzzleId]);

  const getNote = useCallback(
    (coord: string): PlayerNote | null => notes[coord] ?? null,
    [notes]
  );

  const pushUndo = useCallback(
    (targetPuzzleId: string, coord: string, previous: PlayerNote | null) => {
      const stack = undoStackRef.current[targetPuzzleId] ?? [];
      const nextStack = [...stack, { coord, previous }];
      if (nextStack.length > MAX_UNDO_PER_PUZZLE) {
        nextStack.shift();
      }
      undoStackRef.current[targetPuzzleId] = nextStack;
      setUndoVersion((v) => v + 1);
    },
    []
  );

  const setNote = useCallback(
    (coord: string, patch: NotePatch) => {
      if (!activePuzzleId) return;

      const prevAll = notesByPuzzleRef.current;
      const puzzleMap = prevAll[activePuzzleId] ?? {};
      const prevNote = puzzleMap[coord] ?? null;
      const base = prevNote ?? createBlankNote();
      const resolvedPatch = typeof patch === "function" ? patch(base) : patch;
      const nextNote: PlayerNote = {
        flagReview: resolvedPatch.flagReview ?? base.flagReview,
        hypothesis:
          resolvedPatch.hypothesis !== undefined
            ? resolvedPatch.hypothesis
            : base.hypothesis,
        text: resolvedPatch.text ?? base.text,
        updatedAt: Date.now(),
      };

      pushUndo(activePuzzleId, coord, prevNote);

      const nextPuzzleMap = { ...puzzleMap };
      if (isNoteEmpty(nextNote)) {
        delete nextPuzzleMap[coord];
      } else {
        nextPuzzleMap[coord] = nextNote;
      }

      const nextAll = { ...prevAll };
      if (Object.keys(nextPuzzleMap).length === 0) {
        delete nextAll[activePuzzleId];
      } else {
        nextAll[activePuzzleId] = nextPuzzleMap;
      }
      notesByPuzzleRef.current = nextAll;
      setNotesByPuzzle(nextAll);
    },
    [activePuzzleId, pushUndo]
  );

  const clearNote = useCallback(
    (coord: string) => {
      if (!activePuzzleId) return;

      const prevAll = notesByPuzzleRef.current;
      const puzzleMap = prevAll[activePuzzleId];
      if (!puzzleMap || !puzzleMap[coord]) return;

      pushUndo(activePuzzleId, coord, puzzleMap[coord]);

      const nextPuzzleMap = { ...puzzleMap };
      delete nextPuzzleMap[coord];

      const nextAll = { ...prevAll };
      if (Object.keys(nextPuzzleMap).length === 0) {
        delete nextAll[activePuzzleId];
      } else {
        nextAll[activePuzzleId] = nextPuzzleMap;
      }
      notesByPuzzleRef.current = nextAll;
      setNotesByPuzzle(nextAll);
    },
    [activePuzzleId, pushUndo]
  );

  const undoNote = useCallback(
    (coord?: string): boolean => {
      if (!activePuzzleId) return false;
      const stack = undoStackRef.current[activePuzzleId];
      if (!stack || stack.length === 0) return false;

      let targetIndex = stack.length - 1;
      if (coord !== undefined) {
        targetIndex = -1;
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].coord === coord) {
            targetIndex = i;
            break;
          }
        }
        if (targetIndex < 0) return false;
      }

      const [entry] = stack.splice(targetIndex, 1);
      setUndoVersion((v) => v + 1);

      const prevAll = notesByPuzzleRef.current;
      const puzzleMap = { ...(prevAll[activePuzzleId] ?? {}) };
      if (entry.previous && !isNoteEmpty(entry.previous)) {
        puzzleMap[entry.coord] = entry.previous;
      } else {
        delete puzzleMap[entry.coord];
      }

      const nextAll = { ...prevAll };
      if (Object.keys(puzzleMap).length === 0) {
        delete nextAll[activePuzzleId];
      } else {
        nextAll[activePuzzleId] = puzzleMap;
      }
      notesByPuzzleRef.current = nextAll;
      setNotesByPuzzle(nextAll);

      return true;
    },
    [activePuzzleId]
  );

  const clearPuzzleNotes = useCallback(
    (targetPuzzleId?: string) => {
      const target = targetPuzzleId ?? activePuzzleId;
      if (!target) return;
      delete undoStackRef.current[target];
      setUndoVersion((v) => v + 1);

      const prevAll = notesByPuzzleRef.current;
      if (!prevAll[target]) return;
      const nextAll = { ...prevAll };
      delete nextAll[target];
      notesByPuzzleRef.current = nextAll;
      setNotesByPuzzle(nextAll);
    },
    [activePuzzleId]
  );

  const hasNotesForPuzzle = useCallback(
    (targetPuzzleId?: string): boolean => {
      const target = targetPuzzleId ?? activePuzzleId;
      if (!target) return false;
      const puzzleMap = notesByPuzzle[target];
      return Boolean(puzzleMap && Object.keys(puzzleMap).length > 0);
    },
    [notesByPuzzle, activePuzzleId]
  );

  const canUndo = useCallback(
    (coord?: string): boolean => {
      if (!activePuzzleId) return false;
      const stack = undoStackRef.current[activePuzzleId];
      if (!stack || stack.length === 0) return false;
      if (coord === undefined) return true;
      return stack.some((entry) => entry.coord === coord);
    },
    [activePuzzleId]
  );

  const hasNotes = Object.keys(notes).length > 0;

  return {
    notes,
    getNote,
    setNote,
    clearNote,
    undoNote,
    clearPuzzleNotes,
    hasNotesForPuzzle,
    canUndo,
    hasNotes,
  };
}
