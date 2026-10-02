# [SIM] — synthetic test wiring only. No live provider credentials.
"""Outcome shim: suite engine subscription states -> repo DemoBillingOutcome.

Repo vocabulary (src/domain.ts:60):
    DemoBillingOutcome = "success" | "failed" | "canceled" | "pending"
Repo transitions (src/domain.ts applyDemoBillingOutcome):
    success + periodEnd -> subscription { status: "active", committed: 0 }
    failed              -> subscription { status: "failed" }
    canceled            -> subscription { status: "canceled" }
    pending             -> subscription { status: "pending" }

Suite engine vocabulary (engine.py): trialing | active | past_due |
canceled | ended | disputed.

The shim is test-only wiring: it asserts the repo's outcome vocabulary can
express every terminal engine state the two providers produce, and names the
expected outcome per provider event so the binding run can check consistency.
No business logic — a pure mapping table.
"""

# Engine status -> repo DemoBillingOutcome (default mapping).
# NOTE: this default is LOSSY — see shim() below. Engine "ended" is reached
# both by expiration (repo: "canceled") and by chargeback (repo: "failed").
# The repo's 4-outcome vocabulary cannot express the terminal reason from
# the status alone; the triggering event is required context.
ENGINE_STATUS_TO_OUTCOME = {
    "active": "success",    # paid and current: repo unlocks paid quota
    "past_due": "pending",  # dunning: repo holds, awaiting retry outcome
    "trialing": "pending",  # trial converting: not yet a paid success
    "canceled": "canceled",  # user/provider cancel: access ends at boundary
    "ended": "canceled",    # terminal via expiration (default; chargeback
    #                         overrides below)
    "disputed": "failed",   # chargeback: repo marks failed, quota locked
}

# (provider, event) overrides where the terminal reason matters more than
# the bare status. Still test-only wiring: it records what the repo's
# applyDemoBillingOutcome SHOULD receive for each provider event.
TRANSITION_OVERRIDES = {
    ("verotel", "chargeback"): "failed",   # dispute+end -> "ended", but the
    #                                      # money was clawed back: "failed"
    ("ccbill", "Chargeback"): "failed",    # dispute -> "disputed": "failed"
}


def shim(engine_status, provider=None, event=None):
    """Map a suite engine (event, status) transition to DemoBillingOutcome."""
    if provider is not None and event is not None:
        override = TRANSITION_OVERRIDES.get((provider, event))
        if override is not None:
            return override
    if engine_status not in ENGINE_STATUS_TO_OUTCOME:
        raise KeyError(f"engine status {engine_status!r} has no repo outcome mapping")
    return ENGINE_STATUS_TO_OUTCOME[engine_status]


# Expected repo outcome per (provider, event) — the consistency contract
# the binding run checks: drive the event through the real adapter +
# engine, shim the resulting engine status, compare to this table.
EXPECTED_OUTCOME = {
    # MobiusPay lane == CCBill adapter events
    ("ccbill", "NewSaleSuccess"): "success",
    ("ccbill", "NewSaleFailure"): "failed",     # no sub created; repo stays failed
    ("ccbill", "RenewalSuccess"): "success",
    ("ccbill", "RenewalFailure"): "pending",    # past_due, retry scheduled
    ("ccbill", "Cancellation"): "canceled",
    ("ccbill", "Expiration"): "canceled",
    ("ccbill", "Chargeback"): "failed",
    ("ccbill", "Refund"): "canceled",
    # Verotel events
    ("verotel", "initial"): "success",
    ("verotel", "rebill"): "success",
    ("verotel", "extend"): "success",
    ("verotel", "uncancel"): "success",
    ("verotel", "cancel"): "canceled",
    ("verotel", "expiry"): "canceled",  # AMBIGUOUS by provider design: end of
    #  cancelled term vs declined rebill vs support termination are
    #  indistinguishable from the postback alone [REAL — verotel.py]. The
    #  suite refuses to invent charge.failed; the binding maps the terminal
    #  "ended" to "canceled". Declined-rebill disambiguation needs the
    #  Verotel status page (reconciliation path) — [OPEN].
    ("verotel", "chargeback"): "failed",
    ("verotel", "credit"): "canceled",  # terminating refund
}
