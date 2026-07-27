# Dashboard Summary Card Disclosure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the four dashboard summary cards control mutually exclusive, collapsible detail panels that are hidden by default.

**Architecture:** Keep disclosure state local to `DashboardPage` as a four-value union plus `null`. Render the existing detail sections conditionally, preserving their data and navigation behavior while improving the summary cards into accessible buttons.

**Tech Stack:** React, TypeScript, Tailwind CSS, Node.js contract tests

---

### Task 1: Add the failing dashboard disclosure contract

**Files:**
- Create: `frontend/tests/dashboard_summary_card_disclosure.test.mjs`

- [ ] **Step 1: Write the failing test**

Create a source contract that checks for local disclosure state, accessible card buttons, four controlled region IDs, default collapsed behavior, and mutually exclusive conditional rendering.

- [ ] **Step 2: Run test to verify it fails**

Run: `node frontend/tests/dashboard_summary_card_disclosure.test.mjs`

Expected: FAIL because the cards are static `div` elements and all detail sections render permanently.

### Task 2: Implement the accessible single-open disclosure

**Files:**
- Modify: `readdy-frontend/src/pages/dashboard/page.tsx`
- Test: `frontend/tests/dashboard_summary_card_disclosure.test.mjs`

- [ ] **Step 1: Add minimal state and toggle behavior**

Add `type DashboardPanel = 'headcount' | 'tasks' | 'waiting' | 'interviews'`, local `expandedPanel` state initialized to `null`, and a toggle that closes the active panel or replaces it with the selected panel.

- [ ] **Step 2: Convert cards to accessible buttons**

Give each card a panel key and controlled region ID. Render a `button` with `aria-expanded`, `aria-controls`, selected styling, a clear hover/focus state, and a directional arrow.

- [ ] **Step 3: Render only the selected detail section**

Wrap the existing task, waiting, demand-progress, and recent-interview sections in conditional branches tied to the corresponding panel key. Preserve all existing row actions and empty states.

- [ ] **Step 4: Run focused tests**

Run: `node frontend/tests/dashboard_summary_card_disclosure.test.mjs && node frontend/tests/recruiter_dashboard_priority.test.mjs && node frontend/tests/readdy_dashboard_contract.test.mjs`

Expected: all focused tests print `OK` and exit 0.

### Task 3: Verify the frontend

**Files:**
- Verify only

- [ ] **Step 1: Run all runnable frontend contract tests**

Run the repository's frontend test command while excluding only the documented external-ZIP parity test when its fixture is unavailable.

- [ ] **Step 2: Run quality gates**

Run lint, TypeScript type-check, production build, and `git diff --check`; each command must exit 0.

- [ ] **Step 3: Review the final diff**

Confirm only the dashboard, its regression test, and the two design documents changed for this task; preserve all pre-existing unrelated working-tree changes.
