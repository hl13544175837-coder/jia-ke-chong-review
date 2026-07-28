# Monthly Recruitment Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the duplicated current-state dashboard funnel with one month-scoped, recruiter-scoped recruitment funnel inside the existing monthly data panel.

**Architecture:** The backend monthly BI service remains the single source of truth and returns cumulative, demand-scoped distinct candidate counts plus nullable adjacent conversion rates. The monthly React panel renders those values and owns the month/recruiter refresh cycle; the dashboard page only supplies the existing stage navigation callback.

**Tech Stack:** Flask, SQLAlchemy, pytest, React 19, TypeScript, Tailwind CSS, Node structural tests.

---

## File map

- `backend/app/services/bi_service.py`: define month-scoped cumulative funnel counts and nullable conversion rates.
- `backend/tests/test_bi_monthly_performance.py`: prove de-duplication, continuous stage counts, owner/month scoping and zero-denominator behavior.
- `readdy-frontend/src/features/analytics/types.ts`: allow unavailable conversion rates to be `null`.
- `readdy-frontend/src/pages/dashboard/components/FunnelChart.tsx`: support a monthly title and render “—” for unavailable conversion.
- `readdy-frontend/src/pages/dashboard/components/MonthlyPerformancePanel.tsx`: place the funnel under the existing filters and bind it to monthly API data.
- `readdy-frontend/src/pages/dashboard/page.tsx`: remove the old top funnel and duplicate stage overview; pass existing stage navigation into the monthly panel.
- `frontend/tests/dashboard_monthly_performance.test.mjs`: lock the monthly funnel placement and retained monthly controls.
- `frontend/tests/dashboard_summary_card_disclosure.test.mjs`: lock removal of the duplicate stage overview.

### Task 1: Lock the approved behavior with failing tests

- [ ] Add backend assertions that a later-stage monthly event fills earlier funnel stages and that a candidate is distinct per demand.
- [ ] Add backend assertions that a zero denominator produces `null` conversion rates.
- [ ] Update frontend contract assertions so `FunnelChart` belongs to `MonthlyPerformancePanel`, the dashboard page has no direct funnel, and “阶段概况” is absent.
- [ ] Run `python3 -m pytest backend/tests/test_bi_monthly_performance.py -q` and the two Node tests; confirm they fail for the expected old behavior.

### Task 2: Correct the monthly backend statistics

- [ ] Change `_monthly_funnel_counts` to track `(demand_id, candidate_id)` and fill every stage up to the candidate’s highest stage reached in the selected month.
- [ ] Change `_monthly_conversion_rates` to return `None` when the previous-stage denominator is zero.
- [ ] Keep the existing month, owner, demand and organization filters unchanged.
- [ ] Run the monthly backend tests and confirm they pass.

### Task 3: Move the funnel into the monthly data panel

- [ ] Update analytics TypeScript conversion-rate types to `number | null`.
- [ ] Extend `FunnelChart` with configurable title/description and an explicit “转化 —” fallback.
- [ ] Build funnel items from `performance.summary.funnel` and `performance.summary.conversion_rates` inside `MonthlyPerformancePanel`.
- [ ] Keep the existing month/recruiter selectors, “本月合计”, summary metrics and job details intact.
- [ ] Remove the old `dashboardFunnel`, top `FunnelChart`, and duplicate “阶段概况” from `page.tsx`; retain “等待他人”.
- [ ] Pass the existing `openStage` behavior into `MonthlyPerformancePanel` so stage clicks preserve current navigation.
- [ ] Run the two Node contract tests and TypeScript type-check; confirm they pass.

### Task 4: Regression and product acceptance

- [ ] Run all executable frontend Node tests.
- [ ] Run backend tests covering BI monthly statistics and dashboard data flow.
- [ ] Run readdy frontend lint, type-check and production build.
- [ ] Start the local services and verify in the browser that month switching refreshes the funnel and totals, there is only one funnel, conversion values are meaningful, and job details still expand.
- [ ] Review `git diff --check` and the final diff to confirm no unrelated core component changed.

## Self-review

- Spec coverage: location, month/recruiter linkage, counting rules, zero fallback, retained monthly totals/details and regression checks each map to a task above.
- Placeholder scan: no deferred implementation or unspecified error-handling step remains.
- Type consistency: backend `None` maps to TypeScript `null`; the funnel item already accepts `number | null`.
