from __future__ import annotations

from dataclasses import dataclass

from griductive.domain.models import CellId, Classification, Status
from griductive.domain.state import PublicState
from griductive.engine.game_engine import GameEngine, VerifiedVerdict
from griductive.logic.agent.logic_agent import LogicAgent
from griductive.logic.agent.models import (
    DeductionResult,
    HintResult,
    TerminalStatus,
    VerdictAssessmentType,
)
from griductive.logic.cnf import CNFEncoder
from griductive.logic.sat import DPLLSolver


@dataclass(frozen=True)
class StepExecution:
    outcome: str
    result: DeductionResult


@dataclass(frozen=True)
class VerdictExecution:
    ok: bool
    assessment: str
    reason: str
    revealed_clue_id: str | None = None


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

    def assess_and_commit_verdict(
        self,
        engine: GameEngine,
        cell: CellId,
        status: Status,
    ) -> VerdictExecution:
        """Assess whether a verdict is logically forced; commit only when PROVABLE."""
        state = engine.get_public_state()
        res = self._agent.assess_verdict(state, cell, status)
        if res.assessment is VerdictAssessmentType.PROVABLE:
            verdict = VerifiedVerdict(
                session_id=state.session_id,
                revision=state.revision,
                cell=cell,
                status=status,
            )
            reveal = engine.commit_verified_verdict(verdict)
            return VerdictExecution(
                ok=True,
                assessment="PROVABLE",
                reason=res.reason,
                revealed_clue_id=reveal.revealed_clue.clue_id,
            )

        return VerdictExecution(
            ok=False,
            assessment=res.assessment.value,
            reason=res.reason,
        )
