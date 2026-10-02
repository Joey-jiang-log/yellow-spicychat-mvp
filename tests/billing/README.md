# tests/billing — repo binding for the proving-ground suite [SIM]

This directory does **not** implement billing. It binds the existing,
independently-reviewed subscription suite at
`~/workspace/payment-proving-ground/tests/subscription/` to this repo's
real billing surface with the thinnest possible wiring.

## Files

| File | Role |
|---|---|
| `repo_catalog.py` | Maps the repo's real plans (`src/domain.ts` PLAN $9.99/mo; `src/pricing-data.ts` Basic $7.50 / Plus $16 / Studio $36) into the suite's price book (`engine.Plan`). Also records the MobiusPay quoted lane terms as metadata. Configuration only. |
| `outcome_shim.py` | Maps suite engine subscription states (`active`, `past_due`, `canceled`, `ended`, `disputed`, `trialing`) to the repo's `DemoBillingOutcome` vocabulary (`success`, `failed`, `canceled`, `pending`), plus the expected outcome per provider event. Test-only wiring, no business logic. |
| `run_repo_binding.py` | Run script. Executes, in order: (1) the full existing 156-test battery as-is, (2) the adapter contract battery as-is for both providers, (3) binding checks that drive each provider's fixtures through the real adapters into a repo-catalog engine and assert the shimmed outcome matches the expected repo outcome. |
| `README.md` | This file. |

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
