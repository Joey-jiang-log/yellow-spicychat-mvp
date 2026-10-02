# [SIM] — synthetic test wiring only. No live provider credentials.
"""Yellow-spicychat-mvp binding spec — DATA ONLY. All mechanics are the
toolkit's (tests/subscription/bind/): catalog loading, spec validation,
fixture driving, conformance, report. This file declares the repo's plans,
outcome vocabulary, and event table — nothing else.

Sources (read 2026-10-01, branch feat/mobiuspay-verotel-billing-tests):
- src/domain.ts:6  — PLAN = { price: "$9.99", interval: "month", ... }
  (the DEMO_MODE subscription plan; suite fixtures bill X-plan_id="p1"
  at 999c, so p1 is bound here at 999c).
- src/domain.ts:60 — DemoBillingOutcome =
  "success" | "failed" | "canceled" | "pending"; applyDemoBillingOutcome
  transitions documented in the outcome table below.
- src/pricing-data.ts:3-9 — pricing-page display tiers
  (Basic $7.50 / Plus $16 / Studio $36 monthly equivalents; yearly
  equivalents unbilled — annual billing is unmodeled everywhere [OPEN]).

Replaces the hand-rolled repo_catalog.py + outcome_shim.py (dev plan P3):
no repo-side shim function may exist — grep for "^def shim" in
tests/billing/ must return nothing.
"""

PLANS = [
    ("p1", "Yellow Monthly", 999, 30),   # domain.ts PLAN — $9.99/mo
    ("basic", "Basic", 750, 30),         # pricing-data.ts — $7.50/mo
    ("plus", "Plus", 1600, 30),         # pricing-data.ts — $16/mo
    ("studio", "Studio", 3600, 30),      # pricing-data.ts — $36/mo
]

OUTCOMES = {"success", "failed", "canceled", "pending"}

# N1 (2026-10-02 review): the sentinel is the toolkit's — import it,
# never redefine it by value (stringly-typed coupling breaks silently
# if the toolkit ever changes the value).
from bind.shim import NO_OP  # noqa: E402

# {(provider, event): {"outcome", "terminal"}} — the repo's declaration of
# what applyDemoBillingOutcome SHOULD receive per provider event, and the
# engine status each event drives. One truth: the toolkit's shim and the
# P2 conformance checker both derive from this table.
#
# Engine status -> outcome DEFAULTS (status_defaults below) are lossy for
# "ended": expiration -> "canceled" but chargeback -> "failed" (money
# clawed back, buyer blacklisted). The event table wins over the default —
# the repo's vocabulary needs the event context, not just the terminal
# state (iter8 finding 1).
EVENTS = {
    # MobiusPay lane == CCBill adapter events (14/14 KNOWN_EVENTS)
    ("ccbill", "NewSaleSuccess"): {"outcome": "success", "terminal": "active"},
    ("ccbill", "NewSaleFailure"): {"outcome": "failed",  "terminal": None},
    #  no subscription created; the repo never activates: "failed" by table.
    ("ccbill", "RenewalSuccess"): {"outcome": "success", "terminal": "active"},
    ("ccbill", "RenewalFailure"): {"outcome": "pending", "terminal": "past_due"},
    ("ccbill", "Cancellation"):   {"outcome": "canceled","terminal": "canceled"},
    ("ccbill", "Expiration"):     {"outcome": "canceled","terminal": "ended"},
    ("ccbill", "Chargeback"):     {"outcome": "failed",  "terminal": "disputed"},
    ("ccbill", "Refund"):         {"outcome": "canceled","terminal": "ended"},
    ("ccbill", "Void"):           {"outcome": "canceled","terminal": "ended"},
    #  void of the initial sale (txn == sub id in fixture) terminates it.
    ("ccbill", "UpgradeSuccess"): {"outcome": NO_OP,     "terminal": None},
    ("ccbill", "UpgradeFailure"): {"outcome": NO_OP,     "terminal": None},
    ("ccbill", "BillingDateChange"): {"outcome": NO_OP,  "terminal": None},
    ("ccbill", "CustomerDataUpdate"): {"outcome": NO_OP, "terminal": None},
    ("ccbill", "UserReactivation"): {"outcome": "success","terminal": "active"},
    # Verotel events (10/10 KNOWN_EVENTS)
    ("verotel", "initial"):  {"outcome": "success", "terminal": "active"},
    ("verotel", "rebill"):   {"outcome": "success", "terminal": "active"},
    ("verotel", "extend"):   {"outcome": "success", "terminal": "active"},
    ("verotel", "uncancel"): {"outcome": "success", "terminal": "active"},
    ("verotel", "cancel"):   {"outcome": "canceled","terminal": "canceled"},
    ("verotel", "downgrade"):{"outcome": "success", "terminal": "active"},
    #  price_change only; the subscription stays active.
    ("verotel", "upgrade"):  {"outcome": "success", "terminal": "active"},
    #  plan_change: old closed, new active — for a KNOWN plan. The suite
    #  fixture bills plan "p2" ($19.99), which is NOT in this catalog: the
    #  receiver correctly fails closed (see the fail-closed check in
    #  run_repo_binding.py). This table declares the known-plan contract.
    ("verotel", "expiry"):   {"outcome": "canceled","terminal": "ended"},
    #  AMBIGUOUS by provider design: end of cancelled term vs declined
    #  rebill vs support termination are indistinguishable from the
    #  postback alone [REAL — verotel.py]. The suite refuses to invent
    #  charge.failed; the terminal "ended" maps to "canceled".
    #  Declined-rebill disambiguation needs the Verotel status page
    #  (reconciliation path) — [OPEN]: the repo has none.
    ("verotel", "chargeback"): {"outcome": "failed","terminal": "ended"},
    #  dispute+end -> "ended", but the money was clawed back: "failed".
    ("verotel", "credit"):   {"outcome": "canceled","terminal": "ended"},
    #  JUDGMENT, not provider truth: the adapter makes the terminating
    #  refund conditional (subscriptionPhase == "terminated"); partial
    #  credits leave the subscription active. The fixture exercised is
    #  the terminated-phase one.
}

# Engine status -> repo DemoBillingOutcome (documented default; the event
# table above wins wherever it has an entry).
STATUS_DEFAULTS = {
    "active": "success",    # paid and current: repo unlocks paid quota
    "past_due": "pending",  # dunning: repo holds, awaiting retry outcome
    "trialing": "pending",  # trial converting: not yet a paid success
    "canceled": "canceled",  # user/provider cancel: access ends at boundary
    "ended": "canceled",    # terminal via expiration (default; chargeback
    #                         overrides in EVENTS above)
    "disputed": "failed",   # chargeback: repo marks failed, quota locked
}

# (provider, setup fixtures, event fixture). CCBill informational events
# with no fixture file use the (fixture, event) tuple form; the verotel
# credit fixture pins its event explicitly (filename doesn't derive it).
SALE = "ccbill_new_sale_success.json"
VINIT = "verotel_initial.json"
SEQUENCES = [
    ("ccbill", [], SALE),
    ("ccbill", [], "ccbill_new_sale_failure.json"),
    ("ccbill", [SALE], "ccbill_renewal_success.json"),
    ("ccbill", [SALE], "ccbill_renewal_failure.json"),
    ("ccbill", [SALE], "ccbill_cancellation.json"),
    ("ccbill", [SALE], "ccbill_expiration.json"),
    ("ccbill", [SALE], "ccbill_chargeback.json"),
    ("ccbill", [SALE], "ccbill_refund.json"),
    ("ccbill", [SALE], "ccbill_void.json"),
    ("ccbill", [SALE], (SALE, "UpgradeSuccess")),
    ("ccbill", [SALE], (SALE, "UpgradeFailure")),
    ("ccbill", [SALE], (SALE, "BillingDateChange")),
    ("ccbill", [SALE], (SALE, "CustomerDataUpdate")),
    ("ccbill", [SALE], (SALE, "UserReactivation")),
    ("verotel", [], VINIT),
    ("verotel", [VINIT], "verotel_rebill.json"),
    ("verotel", [VINIT], "verotel_extend.json"),
    ("verotel", [VINIT], "verotel_uncancel.json"),
    ("verotel", [VINIT], "verotel_cancel.json"),
    ("verotel", [VINIT], "verotel_downgrade.json"),
    # ("verotel", [VINIT], "verotel_upgrade.json") — EXCLUDED: the fixture
    # bills unknown plan p2; the fail-closed behavior is asserted
    # separately in run_repo_binding.py (repo-specific finding).
    ("verotel", [VINIT], "verotel_expiry.json"),
    ("verotel", [VINIT], "verotel_chargeback.json"),
    ("verotel", [VINIT], ("verotel_credit_terminated.json", "credit")),
]

# MobiusPay quoted lane terms [REAL — CSO email 2026-10-01].
# Recorded so the binding documents which commercial terms the $9.99 wire
# amount was quoted under. The suite never charges.
#
# [OUT-OF-SCOPE] The suite's engine has NO fee-ledger surface: it books
# gross wire amounts and never computes provider fees, reserves, or
# chargeback costs. These terms are exercised only as pure arithmetic in
# run_repo_binding.py::test_lane_terms_arithmetic, NOT as engine
# settlement behavior.
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


def build_spec():
    from bind.shim import BindingSpec
    return BindingSpec(plans=PLANS, outcomes=OUTCOMES, events=EVENTS,
                       status_defaults=STATUS_DEFAULTS)
