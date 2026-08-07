# Agent Connection Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one recruiter-facing “连接 Agent” flow that creates a scoped import credential and copies a complete demand-specific Ego prompt.

**Architecture:** Keep all interaction inside the existing online-resume feature. Reuse the current demand list and token endpoint, build the prompt in a pure helper, and keep the credential only in dialog memory. Do not add backend schema or Agent orchestration.

**Tech Stack:** React 19, TypeScript, existing `apiRequest`, Flask scoped-token endpoint, Node contract tests, Playwright.

---

## File map

- Create `readdy-frontend/src/features/onlineResumes/agentConnection.ts` — pure prompt builder and connection types.
- Create `readdy-frontend/src/features/onlineResumes/components/AgentConnectionDialog.tsx` — demand selection, BOSS account, token generation, copy and errors.
- Create `readdy-frontend/tests/agent-connection-entry-contract.test.mjs` — no-Mock, prompt and security contracts.
- Modify `readdy-frontend/src/lib/api.ts` — expose resolved external API base without changing requests.
- Modify `readdy-frontend/src/features/onlineResumes/api.ts` — call the existing scoped-token endpoint.
- Modify `readdy-frontend/src/pages/online-resumes/page.tsx` — add the entry button and dialog.
- Modify `readdy-frontend/e2e/core-role-smoke.spec.ts` — recruiter opens the dialog and sees demand selection.
- Modify product/run docs and the verification record with the actual Ego proof and final flow.

### Task 1: Lock the user-facing contract

- [ ] Add a failing contract test asserting that the online-resume page has “连接 Agent”, the API calls `POST /agent-imports/token`, and no Token/Mock value is hardcoded.
- [ ] Assert that the prompt builder includes the resolved API base, demand ID, request number, JD, BOSS account, both import endpoints, stable external IDs, and the instruction not to print the credential.
- [ ] Run `cd readdy-frontend && node --import tsx --test tests/agent-connection-entry-contract.test.mjs` and confirm failure because the feature does not exist.

### Task 2: Add the pure connection contract

- [ ] Export `externalApiBaseUrl()` from `src/lib/api.ts`; resolve relative `VITE_API_BASE_URL` against `window.location.origin` and strip trailing slashes.
- [ ] Add `AgentImportTokenResponse` and `buildAgentConnectionPrompt` in `agentConnection.ts`.
- [ ] Keep the prompt deterministic and accept `{ apiBaseUrl, token, demand, bossAccount }`; never read or persist the Token outside the dialog state.
- [ ] Add `onlineResumesApi.issueAgentImportToken()` using `apiRequest('/agent-imports/token', { method: 'POST' })`.
- [ ] Run the focused contract test and TypeScript check.

### Task 3: Build the one-dialog flow

- [ ] Add `AgentConnectionDialog` using the existing overlay lifecycle and action-button styles.
- [ ] On open, call `demandsApi.listDemands()` and retain only `status === 'active'`.
- [ ] Require one demand and a non-empty BOSS account before enabling “生成连接提示词”.
- [ ] On generate, call the scoped-token endpoint once, build the prompt, and show expiration time plus “凭证关闭后不再显示”.
- [ ] Add “复制全部提示词”; use `navigator.clipboard.writeText`, show success, and translate copy failures into a visible retry message.
- [ ] On close, unmount the component so Token and prompt leave memory; never use localStorage, sessionStorage, URL params or console output.
- [ ] Add the page header button and keep existing online-resume empty/list states unchanged.

### Task 4: Verify the real recruiter flow

- [ ] Update the browser smoke test: recruiter opens `/online-resumes`, clicks “连接 Agent”, sees active demand options and BOSS account input, and can close the dialog.
- [ ] Run `npm run test:contract`, `npm run type-check`, `npm run lint`, and `npm run build`.
- [ ] Start the isolated local stack and run the recruiter/online-resume Playwright cases without logging the generated credential.
- [ ] Run backend full tests and `./scripts/check-sit-release.sh`.

### Task 5: Record and publish

- [ ] Update the live product/run documents with the one-click connection flow and the fact that local `127.0.0.1` works only for an Agent on the same machine.
- [ ] Add a concise session action record under `docs/verification/2026-08-07-agent-resume-import-mvp/` without candidate data or credentials.
- [ ] Commit the feature and evidence, confirm a clean `test` branch, pull/rebase only if the remote advanced, then push `test` to `cfpd`.
- [ ] Verify the remote `cfpd/test` SHA equals local `HEAD`.

