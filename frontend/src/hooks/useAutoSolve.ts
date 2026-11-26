import { useCallback, useEffect, useRef, useState } from "react";
import { executeAutoSolveStep } from "../api/client";
import type { AutoSolveSpeed, GameState, StepResponse } from "../types";

export const AUTO_SOLVE_SPEED_DELAYS: Record<AutoSolveSpeed, number> = {
  slow: 1200,
  normal: 650,
  fast: 280,
};

export interface UseAutoSolveOptions {
  getState: () => GameState | null;
  onStep: (response: StepResponse) => void;
  onError: (error: unknown) => Promise<void>;
  delayMs?: number;
}

interface PendingDelay {
  timer: ReturnType<typeof setTimeout>;
  finish: (continueLoop: boolean) => void;
}

export function useAutoSolve({
  getState,
  onStep,
  onError,
  delayMs = AUTO_SOLVE_SPEED_DELAYS.normal,
}: UseAutoSolveOptions): {
  isRunning: boolean;
  isStopping: boolean;
  start: () => void;
  stop: () => Promise<void>;
} {
  const [isRunning, setIsRunning] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const optionsRef = useRef({ getState, onStep, onError, delayMs });
  optionsRef.current = { getState, onStep, onError, delayMs };

  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const startLockRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const loopPromiseRef = useRef<Promise<void> | null>(null);
  const pendingDelayRef = useRef<PendingDelay | null>(null);

  const isCurrent = useCallback(
    (generation: number) =>
      mountedRef.current && generationRef.current === generation,
    []
  );

  const waitForDisplay = useCallback(
    (generation: number, waitMs: number): Promise<boolean> =>
      new Promise((resolve) => {
        const finish = (continueLoop: boolean) => {
          if (pendingDelayRef.current?.finish === finish) {
            clearTimeout(pendingDelayRef.current.timer);
            pendingDelayRef.current = null;
          }
          resolve(
            continueLoop &&
              isCurrent(generation) &&
              !stopRequestedRef.current
          );
        };

        const timer = setTimeout(() => finish(true), Math.max(0, waitMs));
        pendingDelayRef.current = { timer, finish };
      }),
    [isCurrent]
  );

  const runLoop = useCallback(
    async (generation: number, sessionId: string, initialState: GameState) => {
      let currentState = initialState;

      try {
        while (isCurrent(generation) && !stopRequestedRef.current) {
          const state = optionsRef.current.getState();
          if (
            !state ||
            state.session_id !== sessionId ||
            state.is_solved ||
            state.is_contradicted
          ) {
            break;
          }
          currentState = state;

          const response = await executeAutoSolveStep(
            sessionId,
            currentState.revision
          );
          if (!isCurrent(generation)) return;
          if (
            response.state.session_id !== sessionId ||
            response.state.revision < currentState.revision
          ) {
            throw new Error("Auto-solve returned a stale game state.");
          }

          const latestState = optionsRef.current.getState();
          if (
            !latestState ||
            latestState.session_id !== sessionId ||
            latestState.revision > response.state.revision
          ) {
            throw new Error("Game state changed while auto-solve was running.");
          }

          // A Stop requested during the write still applies this committed response.
          optionsRef.current.onStep(response);
          currentState = response.state;

          if (
            stopRequestedRef.current ||
            response.outcome !== "IN_PROGRESS" ||
            response.step === null
          ) {
            break;
          }

          const shouldContinue = await waitForDisplay(
            generation,
            optionsRef.current.delayMs
          );
          if (!shouldContinue) break;
        }
      } catch (error) {
        if (isCurrent(generation)) {
          stopRequestedRef.current = true;
          setIsStopping(true);
          try {
            await optionsRef.current.onError(error);
          } catch {
            // The owning view reports resync failures and exposes its retry action.
          }
        }
      } finally {
        if (isCurrent(generation)) {
          startLockRef.current = false;
          stopRequestedRef.current = false;
          loopPromiseRef.current = null;
          setIsRunning(false);
          setIsStopping(false);
        }
      }
    },
    [isCurrent, waitForDisplay]
  );

  const start = useCallback(() => {
    if (startLockRef.current || !mountedRef.current) return;

    const state = optionsRef.current.getState();
    if (
      !state ||
      !state.session_id ||
      state.is_solved ||
      state.is_contradicted
    ) {
      return;
    }

    // This ref lock is synchronous, so two clicks in one render cannot start two loops.
    startLockRef.current = true;
    stopRequestedRef.current = false;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setIsRunning(true);
    setIsStopping(false);

    const loop = runLoop(generation, state.session_id, state);
    loopPromiseRef.current = loop;
    void loop;
  }, [runLoop]);

  const stop = useCallback(async () => {
    const loop = loopPromiseRef.current;
    if (!loop) return;

    stopRequestedRef.current = true;
    if (mountedRef.current) setIsStopping(true);

    const pendingDelay = pendingDelayRef.current;
    if (pendingDelay) {
      clearTimeout(pendingDelay.timer);
      pendingDelayRef.current = null;
      pendingDelay.finish(false);
    }

    // Never abort a mutation request: it may already have committed on the server.
    await loop;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      stopRequestedRef.current = true;

      const pendingDelay = pendingDelayRef.current;
      if (pendingDelay) {
        clearTimeout(pendingDelay.timer);
        pendingDelayRef.current = null;
        pendingDelay.finish(false);
      }
    };
  }, []);

  return { isRunning, isStopping, start, stop };
}
