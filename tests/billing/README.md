# tests/billing — repo binding for the proving-ground suite [SIM]

This directory does **not** implement billing. It binds the existing,
independently-reviewed subscription suite at
`~/workspace/payment-proving-ground/tests/subscription/` to this repo's
real billing surface through the suite's **binding toolkit**
(`tests/subscription/bind/` — dev plan P3). The repo contributes only
its spec; every mechanic (catalog loading, spec validation, fixture
driving, conformance, report) is the toolkit's.

## Files

| File | Role |
|---|---|
| `binding_spec.py` | **Data only.** The repo's declaration: plans (`src/domain.ts` PLAN $9.99/mo; `src/pricing-data.ts` Basic $7.50 / Plus $16 / Studio $36), the `DemoBillingOutcome` vocabulary, the per-event outcome/terminal table, status defaults, fixture sequences, and the MobiusPay quoted lane terms as metadata. No mechanics — no `shim()` may exist here (`grep -rn "def shim" tests/billing/` must return nothing). |
| `run_repo_binding.py` | Thin run script. Executes, in order: (1) the full existing battery as-is, (2) the adapter contract battery as-is, (3) toolkit binding checks driving each spec sequence through the real adapters, (4) repo-specific findings (lane-terms arithmetic, unknown-plan fail-closed), (5) the P2 conformance checker on the spec, (6) the honest-label evidence report. |
| `README.md` | This file. |

Deleted in the P3 re-expression (2026-10-02): the hand-rolled
`repo_catalog.py` and `outcome_shim.py` — replaced by `binding_spec.py`
plus the toolkit. The old `EXPECTED_OUTCOME`/`TRANSITION_OVERRIDES`
two-table shape is gone: the spec's single event table is the one truth
the toolkit's shim and the conformance checker both derive from.

## Usage

```bash
cd ~/workspace/yellow-spicychat-mvp
python3 tests/billing/run_repo_binding.py
# SUITE_DIR env may override the suite location
```

Exit 0 = everything green. Any binding mismatch is reported as
`MISMATCH: ...` — the finding is the deliverable; the suite is never
edited to make the binding pass.

## Evidence

Everything here is **[SIM]** — synthetic fixtures through real plumbing.
Zero live credentials; the suite's adapters run under `posture="sandbox"`
with TEST literals.

### Honest scope labels

- **Suite standalone (NOT repo-bound)** — the proving-ground battery
  run as-is, count parsed from its own summary line (never hardcoded —
  a hardcoded count rotted once already, 2026-10-02). It validates the
  suite's own engine and adapters, not this repo.
- **Contract standalone (NOT repo-bound)** — the adapter contract
  battery run as-is. Same caveat.
- **Repo binding evidence: N/N** — the toolkit binding checks: the
  repo's spec sequences driven through the real adapters with actual
  engine statuses verified against the spec's declared terminals, plus
  the repo-specific findings. This is the only number that speaks to
  the repo.
- **Conformance** — the P2 checker on the spec's tables; gaps render as
  product-gap sentences ("your vocabulary cannot express X"). Currently
  surfaces the 3 known lossy findings (the `ended` event-dependence and
  the two shared-outcome conflations) — pre-existing repo vocabulary
  limitations, not regressions.

### Yearly-price scope [2026-10-01]

The catalog binds **monthly** prices only (`domain.ts` PLAN $9.99/mo;
`pricing-data.ts` Basic $7.50 / Plus $16 / Studio $36 as monthly
equivalents). Yearly equivalents and the display tiers' yearly billing
are **out of scope** for this binding: the suite's price book checks
wire amounts against monthly plan prices, and no yearly-billing wire
shape was exercised. Extending to yearly would need yearly plan entries
plus fixtures billing the yearly amounts.

### MobiusPay lane terms scope [2026-10-01]

`MOBIUSPAY_LANE_TERMS` records the CSO-quoted terms [REAL]. The suite's
engine has no fee-ledger surface, so fee settlement is **[OUT-OF-SCOPE]**:
the binding verifies the terms only as pure arithmetic from the
constants (`test_lane_terms_arithmetic`), not as engine behavior.
Behavioral economics validation (real money movement) is handed to the
user: see the economics validation guide in the suite repo,
`payment-proving-ground/tests/subscription/docs/economics-validation-guide.md`
(P1 of the test-suite polish plan) — provider test paths with cost, steps,
record templates, and evidence labels per path.
