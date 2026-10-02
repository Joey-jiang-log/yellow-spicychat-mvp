# [SIM] — synthetic test wiring only. No live provider credentials.
"""Repo binding run: prove the existing suite green against the repo's catalog.

What this does (in order):
  1. Runs the FULL existing battery as-is (tests/subscription/run_all.py,
     156 tests) via subprocess — unmodified.
  2. Runs the adapter contract battery as-is
     (tests/subscription/run_adapter_contract.py) via subprocess — unmodified.
  3. Repo-binding checks (this file): builds a suite Engine carrying the
     repo's real plans (repo_catalog.py), drives each provider's key
     fixtures through the REAL adapters (CCBill == MobiusPay lane,
     Verotel), shims the resulting engine subscription status through
     outcome_shim.py into the repo's DemoBillingOutcome vocabulary, and
     asserts it matches EXPECTED_OUTCOME.

A failure in (3) is a repo-vs-suite mismatch and is reported as the
finding — the suite is never "fixed" to make the binding pass.

Usage:  python3 tests/billing/run_repo_binding.py
        (from the repo root; SUITE_DIR env may override the suite path)
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
SUITE_DIR = os.environ.get(
    "SUITE_DIR",
    os.path.join(os.path.dirname(REPO_ROOT), "payment-proving-ground",
                 "tests", "subscription"))
PPG_ROOT = os.path.join(os.path.dirname(SUITE_DIR), "..", "..")

sys.path.insert(0, HERE)
sys.path.insert(0, SUITE_DIR)
sys.path.insert(0, PPG_ROOT)

from repo_catalog import add_repo_plans, REPO_PLANS  # noqa: E402
from outcome_shim import shim, EXPECTED_OUTCOME  # noqa: E402
from engine import Engine, FakeGateway, FakeClock  # noqa: E402
from run_adapter_contract import adapter_factories  # noqa: E402

RESULTS = []


def check(name, fn):
    try:
        fn()
        RESULTS.append((name, True, ""))
        print(f"  PASS  {name}")
    except AssertionError as e:
        RESULTS.append((name, False, str(e)))
        print(f"  FAIL  {name}: {e}")
    except Exception as e:  # noqa: BLE001
        RESULTS.append((name, False, f"{type(e).__name__}: {e}"))
        print(f"  ERROR {name}: {type(e).__name__}: {e}")


def run_existing_battery(path, label):
    print(f"\n== {label} (as-is) ==")
    r = subprocess.run([sys.executable, path], capture_output=True, text=True,
                       cwd=os.path.dirname(path))
    tail = "\n".join(r.stdout.strip().splitlines()[-4:])
    print(tail)
    if r.returncode != 0:
        print(f"!! {label} exited {r.returncode}")
        print(r.stderr[-2000:] if r.stderr else "")
    return r.returncode == 0


def make_repo_engine():
    clock = FakeClock()
    engine = Engine(FakeGateway([]), clock, merchant="YELLOW-MVP")
    add_repo_plans(engine)
    return engine, clock


def deliver_sequence(adapter, source_ip, sequence):
    """Deliver a sequence of fixtures; return the engine's sole sub status."""
    engine, _ = make_repo_engine()
    sim = adapter.simulator()
    for fixture in sequence:
        raw = sim.craft(fixture)
        query = sim.query_for(fixture)
        out = adapter.deliver(engine, raw, source_ip, query=query)
        assert out.verdict in ("accepted", "duplicate", "ignored",
                               "pending", "quarantined"), (
            f"{fixture}: unexpected verdict {out.verdict} notes={out.notes}")
    subs = list(engine.subs.values())
    assert len(subs) == 1, f"expected 1 sub, got {len(subs)}"
    return subs[0].status


# (provider, setup fixtures, event fixture, expected outcome key)
BINDING_SEQUENCES = [
    ("ccbill", [], "ccbill_new_sale_success.json", ("ccbill", "NewSaleSuccess")),
    ("ccbill", ["ccbill_new_sale_success.json"], "ccbill_renewal_success.json", ("ccbill", "RenewalSuccess")),
    ("ccbill", ["ccbill_new_sale_success.json"], "ccbill_renewal_failure.json", ("ccbill", "RenewalFailure")),
    ("ccbill", ["ccbill_new_sale_success.json"], "ccbill_cancellation.json", ("ccbill", "Cancellation")),
    ("ccbill", ["ccbill_new_sale_success.json"], "ccbill_expiration.json", ("ccbill", "Expiration")),
    ("ccbill", ["ccbill_new_sale_success.json"], "ccbill_chargeback.json", ("ccbill", "Chargeback")),
    ("ccbill", ["ccbill_new_sale_success.json"], "ccbill_refund.json", ("ccbill", "Refund")),
    ("verotel", [], "verotel_initial.json", ("verotel", "initial")),
    ("verotel", ["verotel_initial.json"], "verotel_rebill.json", ("verotel", "rebill")),
    ("verotel", ["verotel_initial.json"], "verotel_extend.json", ("verotel", "extend")),
    ("verotel", ["verotel_initial.json"], "verotel_uncancel.json", ("verotel", "uncancel")),
    ("verotel", ["verotel_initial.json"], "verotel_cancel.json", ("verotel", "cancel")),
    ("verotel", ["verotel_initial.json"], "verotel_expiry.json", ("verotel", "expiry")),
    ("verotel", ["verotel_initial.json"], "verotel_chargeback.json", ("verotel", "chargeback")),
    ("verotel", ["verotel_initial.json"], "verotel_credit_terminated.json", ("verotel", "credit")),
]


def run_binding_checks():
    print("\n== repo binding checks (thin wiring) ==")
    print(f"  catalog: {[(p.id, p.amount_cents) for p in REPO_PLANS]}")
    # name -> fixture dict (keys carry the .json extension).
    # NOTE: load_contract_fixtures() only loads the 11 contract fixtures;
    # the binding also exercises non-contract fixtures (renewal_failure,
    # expiration, extend, uncancel, expiry, credit_terminated), so load
    # every fixture file in the directory.
    import json as _json
    by_name = {}
    _fix_dir = os.path.join(SUITE_DIR, "fixtures")
    for _fn in sorted(os.listdir(_fix_dir)):
        if _fn.endswith(".json"):
            with open(os.path.join(_fix_dir, _fn)) as _fh:
                by_name[_fn] = _json.load(_fh)
    for name, make in adapter_factories(by_name):
        trusted_ip = "10.1.2.3"
        for provider, setup, event_fixture, key in BINDING_SEQUENCES:
            if provider != name:
                continue
            expected = EXPECTED_OUTCOME[key]

            def one(adapter=make(), setup=setup, event_fixture=event_fixture,
                    expected=expected, key=key):
                status = deliver_sequence(adapter, trusted_ip,
                                          setup + [event_fixture])
                got = shim(status, provider=key[0], event=key[1])
                assert got == expected, (
                    f"{key}: engine status {status!r} shims to {got!r}, "
                    f"expected {expected!r}")
            check(f"binding::{name}::{key[1]}->{expected}", one)


def main():
    ok1 = run_existing_battery(os.path.join(SUITE_DIR, "run_all.py"),
                               "full suite battery (156)")
    ok2 = run_existing_battery(os.path.join(SUITE_DIR, "run_adapter_contract.py"),
                               "adapter contract battery")
    run_binding_checks()
    passed = sum(1 for _, ok, _ in RESULTS if ok)
    total = len(RESULTS)
    print(f"\nbinding checks: {passed}/{total} green")
    for name, ok, err in RESULTS:
        if not ok:
            print(f"  MISMATCH: {name}: {err}")
    all_ok = ok1 and ok2 and passed == total
    print("\nOVERALL:", "GREEN" if all_ok else "RED")
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
