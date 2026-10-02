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

Coverage: 14/14 CCBill KNOWN_EVENTS, 10/10 Verotel KNOWN_EVENTS.
Events that the adapter translates to informational ops only (no engine
state change) map to the explicit "no-op" sentinel: the repo must NOT call
applyDemoBillingOutcome for them.
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

# (provider, event) -> "no-op": the adapter translates the event to an
# informational op only (translate() returns {"op": "info", ...}); the
# engine applies no state change and the subscription status is untouched.
# The repo's 4-outcome vocabulary cannot express "nothing happened", so
# the shim returns the explicit sentinel "no-op" (NOT a DemoBillingOutcome)
# meaning: no applyDemoBillingOutcome transition is required.
# Undefined is not allowed: every known provider event has an entry here
# or in EXPECTED_OUTCOME.
NO_OP_EVENTS = {
    # CCBill informational events [REAL — providers/ccbill.py translate()]:
    ("ccbill", "UpgradeSuccess"),    # tier_change_pending recorded; [OPEN]
    ("ccbill", "UpgradeFailure"),    # tier_change_pending recorded; [OPEN]
    ("ccbill", "BillingDateChange"),  # paid period never moves [REAL]
    ("ccbill", "CustomerDataUpdate"),  # customer.updated; no state change
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
    """Map a suite engine (event, status) transition to DemoBillingOutcome.

    Returns "no-op" (sentinel, not a DemoBillingOutcome) for events in
    NO_OP_EVENTS: the adapter recorded the event but the engine changed no
    state, so the repo must NOT call applyDemoBillingOutcome.
    """
    if provider is not None and event is not None:
        if (provider, event) in NO_OP_EVENTS:
            return "no-op"
        override = TRANSITION_OVERRIDES.get((provider, event))
        if override is not None:
            return override
    if engine_status not in ENGINE_STATUS_TO_OUTCOME:
        raise KeyError(f"engine status {engine_status!r} has no repo outcome mapping")
    return ENGINE_STATUS_TO_OUTCOME[engine_status]


# Expected repo outcome per (provider, event) — the consistency contract
# the binding run checks: drive the event through the real adapter +
# engine, shim the resulting engine status, compare to this table.
#
# Coverage: 14/14 CCBill KNOWN_EVENTS, 10/10 Verotel KNOWN_EVENTS.
# "no-op" entries (see NO_OP_EVENTS) assert the engine state is untouched.
EXPECTED_OUTCOME = {
    # MobiusPay lane == CCBill adapter events (14/14)
    ("ccbill", "NewSaleSuccess"): "success",
    ("ccbill", "NewSaleFailure"): "failed",     # no sub created; repo stays failed
    ("ccbill", "RenewalSuccess"): "success",
    ("ccbill", "RenewalFailure"): "pending",    # past_due, retry scheduled
    ("ccbill", "Cancellation"): "canceled",
    ("ccbill", "Expiration"): "canceled",
    ("ccbill", "Chargeback"): "failed",
    ("ccbill", "Refund"): "canceled",
    ("ccbill", "Void"): "canceled",             # void of initial sale (txn ==
    #  sub id in fixture) terminates the subscription -> "ended"
    ("ccbill", "UpgradeSuccess"): "no-op",      # info only; [OPEN] field map
    ("ccbill", "UpgradeFailure"): "no-op",      # info only; [OPEN] field map
    ("ccbill", "BillingDateChange"): "no-op",   # paid period never moves
    ("ccbill", "CustomerDataUpdate"): "no-op",  # customer.updated; no change
    ("ccbill", "UserReactivation"): "success",  # reactivate -> active
    # Verotel events (10/10)
    ("verotel", "initial"): "success",
    ("verotel", "rebill"): "success",
    ("verotel", "extend"): "success",
    ("verotel", "uncancel"): "success",
    ("verotel", "cancel"): "canceled",
    ("verotel", "downgrade"): "success",  # price_change only; stays active
    ("verotel", "upgrade"): "success",    # plan_change: old closed, new active
    ("verotel", "expiry"): "canceled",  # AMBIGUOUS by provider design: end of
    #  cancelled term vs declined rebill vs support termination are
    #  indistinguishable from the postback alone [REAL — verotel.py]. The
    #  suite refuses to invent charge.failed; the binding maps the terminal
    #  "ended" to "canceled". Declined-rebill disambiguation needs the
    #  Verotel status page (reconciliation path) — [OPEN].
    ("verotel", "chargeback"): "failed",
    ("verotel", "credit"): "canceled",  # terminating refund
}
