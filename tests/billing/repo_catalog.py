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

sys.path.insert(0, os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "..",
    "payment-proving-ground", "tests", "subscription")))

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
# Metadata only: recorded here so the binding documents which commercial
# terms the $9.99 wire amount was quoted under. The suite never charges.
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
