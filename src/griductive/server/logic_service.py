from __future__ import annotations

from dataclasses import dataclass

from griductive.domain.models import Classification
from griductive.domain.state import PublicState
from griductive.engine.game_engine import GameEngine
from griductive.logic.agent.logic_agent import LogicAgent
from griductive.logic.agent.models import DeductionResult, HintResult, TerminalStatus
from griductive.logic.cnf import CNFEncoder
from griductive.logic.sat import DPLLSolver


@dataclass(frozen=True)
class StepExecution:
    outcome: str
    result: DeductionResult


class LogicService:
    def __init__(self) -> None:
        encoder = CNFEncoder()
        solver = DPLLSolver()
        self._agent = LogicAgent(encoder, solver)

    def hint(self, state: PublicState) -> tuple[str, HintResult | None]:
        if state.is_solved():
            return "SOLVED", None

        hint = self._agent.suggest_next(state)
        if hint is not None:
            return "AVAILABLE", hint

        classifications = self._agent.classify_all(state)
        if any(value is Classification.INCONSISTENT for value in classifications.values()):
            return "INCONSISTENT", None
        return "STUCK_NO_FORCIBLE_MOVE", None

    def step(self, engine: GameEngine) -> StepExecution:
        result = self._agent.run_logic_loop(engine, max_steps=1)
        outcome = result.terminal_status.value
        if (
            result.terminal_status is TerminalStatus.TIMEOUT
            and len(result.steps) == 1
            and not engine.is_solved()
        ):
            outcome = "IN_PROGRESS"
        return StepExecution(outcome=outcome, result=result)

    def run(self, engine: GameEngine, *, timeout_ms: float = 10000) -> DeductionResult:
        return self._agent.run_logic_loop(engine, timeout_ms=timeout_ms)
