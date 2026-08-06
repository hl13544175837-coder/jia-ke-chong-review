# Resume Upload Progress Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the resume upload modal spinner when the refreshed candidate state shows that background parsing has finished.

**Architecture:** Add a small pure reconciliation helper that maps upload `processing` rows to refreshed candidate states by `candidate_id`. Call it from the existing upload hook whenever the candidate list refreshes; keep pending rows unchanged when data is absent or the network is slow.

**Tech Stack:** React 19, TypeScript, Node test runner through `tsx`, Vite.

---

### Task 1: Add a failing reconciliation test

**Files:**
- Create: `readdy-frontend/src/features/candidates/library/resumeUploadProgress.ts`
- Create: `readdy-frontend/tests/resume-upload-progress.test.mjs`

- [ ] **Step 1: Create the test for completed, failed, and unchanged processing rows**

The test imports `reconcileResumeUploadProgress` and asserts that `ok` becomes an upload success, `failed` becomes `needs_confirmation`, and missing/pending candidate data remains `processing`.

- [ ] **Step 2: Run the test and verify RED**

Run: `cd readdy-frontend && npx tsx --test tests/resume-upload-progress.test.mjs`

Expected: FAIL because `resumeUploadProgress.ts` does not exist.

- [ ] **Step 3: Commit the test only after the red result is recorded**

Stage only `readdy-frontend/tests/resume-upload-progress.test.mjs` with the implementation in the following task.

### Task 2: Implement upload result reconciliation

**Files:**
- Create: `readdy-frontend/src/features/candidates/library/resumeUploadProgress.ts`
- Modify: `readdy-frontend/src/features/candidates/library/useCandidateResumeUpload.ts`
- Test: `readdy-frontend/tests/resume-upload-progress.test.mjs`

- [ ] **Step 1: Implement the pure helper**

Export `reconcileResumeUploadProgress(response, candidates)`. It must only replace upload rows whose status is `processing` and whose candidate is now terminal:

```ts
if (candidate.parse_status === 'ok') {
  return { ...result, status: 'ok', reason: '简历解析成功', name_masked: candidate.name_masked };
}
if (candidate.parse_status === 'failed' || candidate.parse_status === 'original_confirmed') {
  return {
    ...result,
    status: 'needs_confirmation',
    reason: candidate.parse_error || 'AI 未能识别该简历，请确认原文件或手动补录',
    parse_error: candidate.parse_error || undefined,
  };
}
return result;
```

Return the original response object when no row changed, preventing unnecessary React updates.

- [ ] **Step 2: Verify GREEN for the focused test**

Run: `cd readdy-frontend && npx tsx --test tests/resume-upload-progress.test.mjs`

Expected: PASS.

- [ ] **Step 3: Wire the helper into the upload hook**

Add an effect in `useCandidateResumeUpload.ts` that runs when `candidates` changes and updates `uploadResponse` through the helper. Do not add a second timer or another network request.

- [ ] **Step 4: Run focused and existing resume contract tests**

Run: `cd readdy-frontend && npx tsx --test tests/resume-upload-progress.test.mjs tests/resume-recovery-contract.test.mjs tests/resume-ai-disabled-trial.test.mjs`

Expected: all tests pass.

- [ ] **Step 5: Commit the implementation**

```bash
git add readdy-frontend/src/features/candidates/library/resumeUploadProgress.ts readdy-frontend/src/features/candidates/library/useCandidateResumeUpload.ts readdy-frontend/tests/resume-upload-progress.test.mjs
git commit -m "fix: sync resume upload parsing status"
```

### Task 3: Verify and deliver

**Files:**
- Verify: `readdy-frontend/`

- [ ] **Step 1: Run type checking**

Run: `cd readdy-frontend && npm run type-check`

Expected: exit 0.

- [ ] **Step 2: Run the frontend production build**

Run: `cd readdy-frontend && npm run build`

Expected: exit 0.

- [ ] **Step 3: Run the full contract suite**

Run: `cd readdy-frontend && npm run test:contract`

Expected: all tests pass.

- [ ] **Step 4: Inspect the final diff and push CFPD test**

Confirm only the design/plan and resume progress files changed, then push the commits to `cfpd/test`. Do not stage or alter `docs/verification/2026-08-04-requirements-summary/`.

