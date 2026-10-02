# [SIM] — synthetic test wiring only. No live provider credentials.
"""Repo binding run — thin script. Every mechanic is the toolkit's
(tests/subscription/bind/): catalog loading, spec validation, fixture
driving (including negative-path expect_verdict sequences), conformance,
report. Shared harness (bind/harness.py) owns the battery subprocess +
fixture loading.

The repo contributes ONLY its spec (binding_spec.py), its own
commercial facts as assertions (test_lane_terms_arithmetic — pure
arithmetic on the repo's quoted lane terms, NOT binding mechanics),
and this thin orchestration.

What this does (in order):
  1. Runs the FULL existing battery as-is (tests/subscription/run_all.py)
     via the harness — unmodified. The count is parsed from the
     battery's own summary line, never hardcoded.
  2. Runs the adapter contract battery as-is
     (tests/subscription/run_adapter_contract.py) via the harness.
  3. Toolkit binding checks: drives each spec sequence through the REAL
     adapters (CCBill == MobiusPay lane, Verotel) into a spec-planned
     engine and verifies actual engine statuses match the spec's
     declared terminals — plus the toolkit's shim() agreeing with the
     declared outcome on the observed status (both consumers, one
     table). The unknown-plan upgrade is a negative-path sequence
     (expect_verdict="rejected"): the suite's merchant-config guard
     failing closed is the repo's own finding, expressed as data.
  4. Lane-terms arithmetic (repo facts, not toolkit mechanics).
  5. Conformance via the spec + honest-label evidence report.

A failure in (3)/(4) is a repo-vs-spec mismatch and is reported as the
finding — the suite is never "fixed" to make the binding pass.

Usage:  python3 tests/billing/run_repo_binding.py
        (from the repo root; SUITE_DIR env may override the suite path)
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

SUITE_DIR = os.environ.get(
    "SUITE_DIR",
    os.path.normpath(os.path.join(HERE, "..", "..", "..",
                                  "payment-proving-ground", "tests",
                                  "subscription")))
sys.path.insert(0, SUITE_DIR)
sys.path.insert(0, os.path.normpath(os.path.join(SUITE_DIR, "..", "..")))

from binding_spec import (  # noqa: E402
    build_spec, SEQUENCES, PLANS, MOBIUSPAY_LANE_TERMS)
from bind.drive import run_binding_checks  # noqa: E402
from bind.harness import run_battery_counts, load_fixture_factories  # noqa: E402
from bind.report import EvidenceReport  # noqa: E402

# Repo-specific negative-path sequence (the repo's own finding, as data):
# the verotel upgrade fixture bills plan "p2" ($19.99), which is NOT in
# the repo catalog — the receiver must fail closed (rejected + operator
# alert). EXPECTED for the known-plan case stays "success" in the spec.
NEGATIVE_SEQUENCES = [
    ("verotel", ["verotel_initial.json"], "verotel_upgrade.json", "rejected"),
]


def test_lane_terms_arithmetic():
    """MobiusPay lane terms as pure arithmetic (NOT engine settlement)."""
    t = MOBIUSPAY_LANE_TERMS
    sale_cents = 999  # repo PLAN $9.99/mo
    pct_fee = int(sale_cents * t["rate_pct"] / 100 + 0.5)
    assert pct_fee == 99, f"pct fee: {pct_fee}"
    total_fee = pct_fee + t["per_txn_cents"]
    assert total_fee == 134, f"total fee on $9.99 sale: {total_fee}c"
    assert t["chargeback_cents"] == 2500, "chargeback cost must be $25"
    reserve = int(sale_cents * t["reserve_pct"] / 100 + 0.5)
    assert reserve == 50, f"5% reserve on $9.99: {reserve}c"
    assert t["reserve_days"] == 180
    assert t["setup_cents"] == 0
    assert t["early_termination_fee_cents"] == 0
    assert t["visa_annual_cents"] == 95000
    assert t["mc_annual_cents"] == 100000


def main():
    ok1, suite_count = run_battery_counts(
        os.path.join(SUITE_DIR, "run_all.py"),
        "full suite battery — STANDALONE, not repo-bound")
    ok2, contract_count = run_battery_counts(
        os.path.join(SUITE_DIR, "run_adapter_contract.py"),
        "adapter contract battery — STANDALONE, not repo-bound")

    spec = build_spec()
    factories = load_fixture_factories(SUITE_DIR)

    print("\n== repo binding checks (toolkit) ==")
    print(f"  catalog: {[(p[0], p[2]) for p in PLANS]}")
    results = run_binding_checks(spec, factories,
                                 SEQUENCES + NEGATIVE_SEQUENCES,
                                 source_ip="10.1.2.3")
    # Repo-specific facts (the repo's own assertions, not toolkit
    # mechanics): lane-terms arithmetic.
    try:
        test_lane_terms_arithmetic()
        results.append(("binding::lane_terms_arithmetic", True, ""))
        print("  PASS  binding::lane_terms_arithmetic")
    except AssertionError as e:
        results.append(("binding::lane_terms_arithmetic", False, str(e)))
        print(f"  FAIL  binding::lane_terms_arithmetic: {e}")
    for name, ok, detail in results:
        print(f"  {'PASS' if ok else 'FAIL'}  {name}"
              + (f": {detail}" if detail and not ok else ""))
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"binding checks: {passed}/{len(results)}")

    report = spec.check_conformance()
    print(f"conformance: {'clean' if report.is_clean else 'GAPS FOUND'} "
          f"(unmapped={len(report.unmapped_events)}, "
          f"missing={len(report.missing_states)}, "
          f"lossy={len(report.lossy_mappings)})")

    ev = EvidenceReport()
    for ok_c, count, label in [
        (ok1, suite_count, "suite standalone (NOT repo-bound)"),
        (ok2, contract_count, "contract standalone (NOT repo-bound)"),
    ]:
        try:
            p, t = (int(x) for x in count.split("/"))
        except ValueError:
            p, t = 0, 1
        ev.add_group(label, p if ok_c else 0, t)
    ev.add_group("repo binding evidence", passed, len(results))
    ev.add_conformance("yellow-spicychat-mvp", report)
    print()
    print(ev.render())
    # S5 (2026-10-02 review): exit 0 with GAPS FOUND means the gaps were
    # surfaced in this report — acceptance is the human sign-off
    # recorded in notes/, not this exit code. A gap nobody read is not
    # an accepted gap.
    sys.exit(0 if ev.all_green() else 1)


if __name__ == "__main__":
    main()
