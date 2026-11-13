"""Deductive logic agent interfaces."""

from griductive.logic.agent.logic_agent import (
    HintResult,
    InconsistentKnowledgeBaseError,
    LogicAgent,
)

__all__ = ["HintResult", "InconsistentKnowledgeBaseError", "LogicAgent"]
