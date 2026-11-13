from griductive.server.app import auto_solve, session


def test_auto_solve_uses_dpll_to_reveal_entailed_verdicts() -> None:
    session.load_stage("daily_3x3_hard")

    result = auto_solve()

    assert result["status"] == "SOLVED"
    assert result["is_solved"]
    assert result["steps_taken"] > 0
    assert len(result["trace"]) == result["steps_taken"]
    assert all(entry.startswith("Step ") for entry in result["trace"])


def test_auto_solve_stops_when_no_verdict_is_forced() -> None:
    session.load_stage("sample_3x3")

    result = auto_solve()

    assert result["status"] == "STALLED"
    assert not result["is_solved"]
    assert result["steps_taken"] == len(result["trace"])
    assert result["banner_type"] == "info"
