"""ELO ranking for arena-style comparison."""

# ELO constants
K_FACTOR = 32
INITIAL_ELO = 1500


def expected_score(rating_a: float, rating_b: float) -> float:
    """Expected score for player A against B."""
    return 1.0 / (1.0 + 10.0 ** ((rating_b - rating_a) / 400.0))


def update_elo(
    winner_elo: float,
    loser_elo: float,
    k: float = K_FACTOR,
) -> tuple[float, float]:
    """
    Update ELO after a match. Winner gets +, loser gets -.
    Returns (new_winner_elo, new_loser_elo).
    """
    e_winner = expected_score(winner_elo, loser_elo)
    e_loser = expected_score(loser_elo, winner_elo)
    # Winner: S=1, Loser: S=0
    new_winner = winner_elo + k * (1.0 - e_winner)
    new_loser = loser_elo + k * (0.0 - e_loser)
    return (new_winner, new_loser)


def update_elo_by_scores(
    elo_a: float,
    elo_b: float,
    score_a: float,
    score_b: float,
    k: float = K_FACTOR,
) -> tuple[float, float]:
    """
    Update ELO when both have numeric scores (e.g. avg_score).
    Normalize to 0-1: S_a = score_a / (score_a + score_b)
    """
    total = score_a + score_b
    if total <= 0:
        return (elo_a, elo_b)
    s_a = score_a / total
    s_b = score_b / total
    e_a = expected_score(elo_a, elo_b)
    e_b = expected_score(elo_b, elo_a)
    new_a = elo_a + k * (s_a - e_a)
    new_b = elo_b + k * (s_b - e_b)
    return (new_a, new_b)
