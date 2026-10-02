# [SIM] — synthetic test wiring only. No live provider credentials.
"""Repo catalog binding: yellow-spicychat-mvp's real plans -> suite price book.

Sources (read 2026-10-01, branch feat/mobiuspay-verotel-billing-tests):
- src/domain.ts:6  — PLAN = { price: "$9.99", interval: "month", ... }
  The DEMO_MODE subscription plan. The suite's fixtures also bill $9.99
  against plan id "p1", so p1 is bound here at 999c.
- src/pricing-data.ts:3-9 — plans = Basic $7.50/mo, Plus $16/mo, Studio $36/mo
  (pricing page display tiers; monthly equivalents).

This file is configuration, not implementation: it only constructs
engine.Plan objects from the repo's published prices. The suite's
price-book check (providers/base.py check_price_book, 2% tolerance)
runs wire amounts against these plans.
"""
import os
import sys


def resolve_suite_dir():
    """Single source of truth for the proving-ground suite location.

    SUITE_DIR env overrides; default is the sibling payment-proving-ground
    checkout. Import this — do not hardcode the path elsewhere.
    """
    return os.environ.get(
        "SUITE_DIR",
        os.path.normpath(os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "..", "..", "..",
            "payment-proving-ground", "tests", "subscription")))


sys.path.insert(0, resolve_suite_dir())

from engine import Plan  # noqa: E402

# ---------------------------------------------------------------- plans
# p1 — the repo's live demo subscription (domain.ts PLAN $9.99/mo).
# Fixtures bill X-plan_id/custom1 = "p1" at 9.99, so this is the plan the
# contract battery's price-book checks run against.
REPO_PLANS = [
    Plan("p1", "Yellow Monthly", 999, 30),          # domain.ts PLAN — $9.99/mo
    Plan("basic", "Basic", 750, 30),               # pricing-data.ts — $7.50/mo
    Plan("plus", "Plus", 1600, 30),                # pricing-data.ts — $16/mo
    Plan("studio", "Studio", 3600, 30),            # pricing-data.ts — $36/mo
]

# MobiusPay quoted lane terms [REAL — CSO email 2026-10-01].
# Recorded here so the binding documents which commercial terms the $9.99
# wire amount was quoted under. The suite never charges.
#
# [OUT-OF-SCOPE — 2026-10-01] The suite's engine has NO fee-ledger surface:
# it books gross wire amounts and never computes provider fees, reserves,
# or chargeback costs. These terms are therefore exercised only as pure
# arithmetic in run_repo_binding.py::test_lane_terms_arithmetic (verifying
# the documented math from the constants), NOT as engine settlement
# behavior. Full fee-settlement coverage would need an engine fee ledger
# (future work) — until then, fee math is validated as documented
# constants, nothing more.
MOBIUSPAY_LANE_TERMS = {
    "rate_pct": 9.9,
    "per_txn_cents": 35,
    "chargeback_cents": 2500,
    "reserve_pct": 5,
    "reserve_days": 180,
    "setup_cents": 0,
    "visa_annual_cents": 95000,
    "mc_annual_cents": 100000,
    "early_termination_fee_cents": 0,
    "payout": "weekly-monday",
    "ai_stance": "open-prompt supported under Visa VIRP",
}


def add_repo_plans(engine):
    """Register every repo plan on the engine's price book."""
    for plan in REPO_PLANS:
        engine.add_plan(plan)
    return engine
