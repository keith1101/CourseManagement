# Conversation #25: ```markdown ## Role  You are a **Senior Software Engineer** 

- **Thread ID:** `01a08dfe-57fb-72a2-9543-0d51f1cb8d4e`
- **Created At:** 2026-09-11T01:23:10.000Z
- **Updated At:** 2026-10-14T03:07:14.000Z
- **Working Directory:** `\\?\D:\Project\CourseManagement`
- **Model:** `gpt-5.6-luna`
- **Messages:** 2 User, 6 Assistant (Total: 9)

---

### 👤 User _(2026-09-11T01:04:16.944Z)_

```markdown
## Role

You are a **Senior Software Engineer** experienced in designing online examination workflows, state management, and frontend/backend integration.

## Context

The system is currently an online exam and practice platform where students answer questions one by one, with each question having its own countdown timer.

### Current Flow

The exam screen currently has **three submission-related buttons with different responsibilities**:

1. **Continue**
2. **Submit Current Question**
3. **Submit Entire Exam**

Additionally:

* Students can freely view all questions in the exam.
* Students can move to the next question even if the current question has not been completed.
* Students can return to previous questions.

## New Requirements

The exam flow must be refactored into a **sequential question flow**, where students must complete questions in order.

### 1. Submission Button

There should be only **one submission button**.

The button can have the following states:

* `Submit`
* `Continue`

Do not show any confirmation popup or modal when submitting an answer.

### 2. Correct Answer Flow

When the student clicks `Submit`:

1. Send the answer for the current question to the backend.
2. The backend validates the answer.
3. If the answer is **correct**:

   * Display the correct-answer state.
   * Play the existing correct-answer sound if supported.
   * Disable answer modification.
   * Disable the submission button to prevent duplicate submissions.
   * Keep the feedback visible for **3 seconds**.
   * Automatically navigate to the **next question** after 3 seconds.
4. The student should not need to click `Continue`.

### 3. Incorrect Answer Flow

If the submitted answer is **incorrect**:

1. Display the incorrect-answer state.
2. Show:

   * the correct answer;
   * `GUIDANCE`;
   * `EXPLANATION`.
3. Do not automatically move to the next question.
4. Immediately change the `Submit` button into a **`Continue`** button.
5. When the student clicks `Continue`:

   * mark the current question as completed;
   * move to the next question.

### 4. Sequential Question Navigation

Students must complete questions strictly in order:

`Question 1 → Question 2 → Question 3 → ... → Question N`

Rules:

* The student cannot open the next question until the current question is completed.
* The student cannot return to a previous question after completing it.
* If a question navigator or progress indicator exists, it may still display all questions, but:

  * current question: active;
  * completed questions: completed but not clickable;
  * future questions: locked and not clickable.

Only **one question can be active at any time**.

### 5. Question State

Consider modeling each question using states such as:

* `LOCKED`
* `ACTIVE`
* `SUBMITTING`
* `CORRECT`
* `INCORRECT`
* `COMPLETED`

The submission button may use:

* `SUBMIT`
* `SUBMITTING`
* `CONTINUE`
* `DISABLED`

### 6. Timer

Each question has its own countdown timer.

Define the expected behavior when:

* the timer expires before the student submits;
* the timer expires while the submission request is being processed;
* the user refreshes the page;
* the user loses network connectivity and reconnects;
* the user double-clicks the submission button.

The timeout flow should continue following the current business requirement: show the correct answer and display the `EXPLANATION`.

### 7. Final Question

For the final question:

* If the answer is correct:

  * show the correct-answer feedback;
  * wait 3 seconds;
  * automatically complete the attempt.
* If the answer is incorrect:

  * show the explanation;
  * change the `Continue` action into the action that completes the exam.
* After completion:

  * finalize the attempt;
  * calculate the result;
  * navigate to the result screen.

The separate **"Submit Entire Exam"** button should no longer exist in the new flow.

## Task

Create a detailed **implementation plan** for migrating from the current flow to the new flow.

The plan must include:

1. **New Business Flow**

   * Correct-answer happy path.
   * Incorrect-answer happy path.
   * Timeout flow.
   * Final-question flow.

2. **State Machine**

   * Question states.
   * Submission-button states.
   * State transitions.

3. **Frontend Changes**

   * UI/UX changes.
   * Question navigator.
   * Submission-button logic.
   * Timer handling.
   * 3-second auto-navigation.
   * State management.

4. **Backend Changes**

   * Submit-answer API.
   * Current-question validation.
   * Prevent submission of locked or completed questions.
   * Attempt progress tracking.
   * Attempt finalization.
   * Idempotency and duplicate-submit handling.

5. **Database / Data Model**

   * Determine whether additional fields are required for:

     * current question;
     * question status;
     * submitted answer;
     * submitted time;
     * correctness;
     * completed time.
   * If the current schema is sufficient, explain how it should be reused.

6. **Security and Data Integrity**

   * Do not trust `questionIndex` or `currentQuestion` sent by the frontend.
   * The backend must determine which question the student is currently allowed to answer.
   * Prevent users from directly calling APIs to access or submit answers for locked questions.

7. **Edge Cases**

   * Browser refresh.
   * Browser back/forward navigation.
   * Multiple tabs.
   * Double submission.
   * Slow network.
   * Request retries.
   * Timer expiration at the same time as submission.
   * Final question.
   * Client sending requests after the attempt has already been completed.

8. **Testing Plan**

   * Unit tests.
   * Integration tests.
   * End-to-end tests.
   * Important state-transition test cases.

9. **Migration Plan**

   * Existing code that should be removed or refactored.
   * Recommended implementation order to minimize regression risk.
   * How to roll out the new flow without breaking existing attempts.

10. **Acceptance Criteria**

Write acceptance criteria using the **Given / When / Then** format for the most important scenarios.

## Output Format

Structure the response as:

1. New User Flow
2. State Machine
3. Frontend Changes
4. Backend Changes
5. Database Changes
6. API Contract
7. Edge Cases
8. Testing Plan
9. Migration / Implementation Steps
10. Acceptance Criteria

Prioritize a solution that is **simple, deterministic, maintainable, and uses the backend as the source of truth for exam progress**.
```

---

### 🤖 Codex Assistant _(2026-09-11T01:04:21.215Z)_

I’ll ground the plan in the current frontend, backend, API, and Prisma schema first. I’ll use the Prisma client/API guidance if the repository confirms Prisma is the persistence layer, then I’ll surface only product decisions that the code cannot answer.

---

### 🤖 Codex Assistant _(2026-09-11T01:04:36.863Z)_

The repository is a NestJS backend with Prisma and a separate frontend workspace. The skill catalog paths resolve to project-local Prisma guidance, so I’m correcting that path and then tracing the attempt lifecycle end to end.

---

### 🤖 Codex Assistant _(2026-09-11T01:06:35.456Z)_

A key gap is now clear: the frontend owns deadlines in `localStorage`, autosaves drafts, exposes free navigation, and separately finalizes the exam; the backend accepts any question belonging to the exam and intentionally withholds per-question grading. The new design therefore needs a server-owned progress record and an atomic “grade current question” operation, not just button changes. I’m checking whether published exam questions are immutable and how current tests encode attempt behavior before locking the migration strategy.

---

### 🤖 Codex Assistant _(2026-09-11T01:07:16.913Z)_

Three product choices materially affect the API and migration shape: what happens after timeout feedback, whether unsubmitted input survives refresh, and whether already-running attempts remain on the legacy flow. I’ve framed recommended defaults around deterministic server ownership and low rollout risk.

---

### 🤖 Codex Assistant _(2026-09-11T01:14:53.877Z)_

The remaining decisions are about domain semantics rather than code discovery. In particular, the schema has both `instruction` (shown with the question) and `hint` (student-revealable guidance), and published questions are currently still mutable—both affect what may safely be disclosed and graded during an active attempt.

---

### 📋 Plan _(2026-09-11T01:19:22.412Z)_

{
  "type": "plan",
  "id": "01a08dfe-5b61-7100-ad65-8accb0fd7897-plan",
  "text": "# Sequential Exam Flow Migration Plan\n\n## 1. New User Flow\n\n### Correct answer\n\n1. Load only the backend-authorized active question and its server-owned deadline.\n2. Allow answer editing while the question is `ACTIVE`; save an ungraded server draft.\n3. On `Submit`, send the complete answer with the attempt progress version and an idempotency key.\n4. Backend verifies ownership, attempt status, current question, deadline, and answer.\n5. If correct:\n   - persist the answer and correctness;\n   - transition the question to `CORRECT`;\n   - return correct feedback without revealing guidance or explanation;\n   - lock answer controls and disable the button;\n   - play the existing success sound if available. No current sound integration exists, so adding a new asset is out of scope.\n6. Display feedback for at least 3 seconds, then automatically call the progression endpoint.\n7. Backend marks the question `COMPLETED` and activates the next question with a new deadline.\n\n### Incorrect answer\n\n1. Backend persists the answer and transitions the question to `INCORRECT`.\n2. Response reveals:\n   - correct option or accepted text answer;\n   - GUIDANCE from `hint` and `hintImageUrl`;\n   - EXPLANATION from `explaination` and `explanationImageUrl`.\n3. Lock answer controls and change the single button to `Continue`.\n4. `Continue` atomically completes the question and activates the next one.\n5. Do not auto-advance.\n\n### Timeout\n\n- The backend deadline is authoritative; client timer expiration only triggers an idempotent expire request.\n- Timeout transitions `ACTIVE → TIMED_OUT`, stores any latest draft as the submitted response, sets correctness to false, and reveals the correct answer, guidance, and explanation.\n- The button becomes `Continue`; timeout does not auto-advance.\n- A submit received by the backend on or before the deadline is graded normally even if processing finishes later.\n- A submit received after the deadline produces the canonical timeout response and cannot overwrite it.\n- While a submit is pending, the client does not independently resolve timeout; it waits for the response and synchronizes on failure.\n\n### Final question\n\n- Correct: show feedback for 3 seconds, automatically advance, atomically finalize the attempt, calculate the result, and navigate to the result route.\n- Incorrect or timed out: show full feedback; `Continue` completes the final question and finalizes the attempt.\n- There is no separate “Submit Entire Exam” action.\n\n## 2. State Machine\n\n### Durable question states\n\n- `LOCKED`: future question; content is not returned to the student.\n- `ACTIVE`: the only answerable question; deadline is running.\n- `CORRECT`: graded correct, locked, awaiting the 3-second automatic progression.\n- `INCORRECT`: graded incorrect, locked, awaiting explicit `Continue`.\n- `TIMED_OUT`: deadline expired, locked, awaiting explicit `Continue`.\n- `COMPLETED`: permanently closed and not reopenable.\n\n`SUBMITTING` is a frontend-only overlay on `ACTIVE`, because it describes an in-flight request rather than durable domain state.\n\n### Transitions\n\n- Attempt start: first question `LOCKED → ACTIVE`.\n- Valid submit: `ACTIVE → CORRECT` or `ACTIVE → INCORRECT`.\n- Deadline expiry: `ACTIVE → TIMED_OUT`.\n- Automatic progression: `CORRECT → COMPLETED`, then next `LOCKED → ACTIVE`.\n- Explicit progression: `INCORRECT|TIMED_OUT → COMPLETED`, then next `LOCKED → ACTIVE`.\n- Completing the final question: attempt `IN_PROGRESS → COMPLETED`.\n- No transition permits `COMPLETED → ACTIVE` or submission against `LOCKED`.\n\n### Button states\n\n- `SUBMIT`: active question with a valid answer.\n- `DISABLED`: no answer, question locked/resolved, or waiting through correct feedback.\n- `SUBMITTING`: request in flight; clicks are ignored.\n- `CONTINUE`: incorrect or timed-out feedback is visible. On the final question the label remains `Continue`, but the action finalizes the attempt.\n\nOn request failure, synchronize with the backend before returning to `SUBMIT` or `CONTINUE`; do not infer the state from the failed HTTP response alone.\n\n## 3. Frontend Changes\n\n- Split the current exam page into a flow-version selector, a retained legacy component, and a sequential component. Existing `flowVersion=1` attempts use the legacy UI; new `flowVersion=2` attempts use the sequential UI.\n- Replace the three current submission/navigation controls and `SubmitConfirmModal` with one state-driven button. Remove all confirmation dialogs.\n- Remove previous/next navigation, direct palette navigation, and “Submit Entire Exam” from the sequential component.\n- Render navigator entries from backend status data:\n  - current: active styling, not used as arbitrary navigation;\n  - completed: completed styling and disabled;\n  - future: locked styling and disabled.\n- Render only `session.currentQuestion`; do not fetch all question content through the general exam-question API.\n- Replace local `currentIndex`, feedback maps, and client-inferred locks with a reducer using the server session, durable question status, `progressVersion`, and a small UI overlay such as `SUBMITTING`.\n- Keep unsubmitted answers as server drafts:\n  - save option selection immediately;\n  - debounce text saves;\n  - never grade or reveal feedback from draft responses;\n  - submit the full answer payload, rather than depending implicitly on the last draft.\n- Restore the latest confirmed draft and fixed deadline from the session after refresh. Remove the sequential flow’s `localStorage` deadline ownership.\n- Calculate display time from `deadlineAt` plus the offset between `serverNow` and the client clock. The browser timer is presentational only.\n- At zero, disable editing and call the expire endpoint. Early expire calls remain `ACTIVE` because the backend checks its clock.\n- After correct feedback renders, use a cancellable 3-second timer and automatically call `Continue`. Clear the timer on unmount/question change. On refresh during `CORRECT`, use `advanceAfter`; advance immediately if it has already elapsed.\n- On reconnect, visibility restoration, browser back/forward navigation, or ambiguous network failure, reload the canonical session before retrying.\n- Queue an offline draft only with its attempt ID, question ID, and progress version; replay it only if that same question is still `ACTIVE`.\n- Update `QuestionCard`, `QuestionPalette`, API mappers, types, and mock adapter for the new statuses and feedback shape.\n\n## 4. Backend Changes\n\n- Create a sequential-attempt service path while retaining the legacy methods until all version-1 attempts are finished.\n- Start version-2 attempts in one transaction:\n  - snapshot ordered question membership and time limits into progress rows;\n  - activate only the first row;\n  - set its server deadline;\n  - set the attempt’s current-question pointer.\n- Treat the pointer and progress row—not `questionIndex`, position, or question ID supplied by the client—as authority.\n- Use supplied `questionId` and `progressVersion` only as stale-request guards. Mismatches return `409 STALE_PROGRESS` with enough information to reload the session.\n- Grade submit in a short serializable Prisma transaction:\n  - lock/validate the attempt and current progress state;\n  - compare controller-captured server receipt time with the deadline;\n  - validate the answer option belongs to the authorized current question;\n  - upsert the submitted answer;\n  - persist correctness and the next state;\n  - increment `progressVersion`.\n- Retry serialization conflicts a small bounded number of times; rely on database uniqueness constraints to prevent duplicate answers.\n- Make submit idempotent. Repeating the same idempotency key returns the canonical prior outcome; a different answer after resolution is rejected.\n- Make expire and continue naturally idempotent. A retry returns the resulting current session without advancing twice.\n- Finalization runs in the same transaction that completes the final question:\n  - verify every version-2 progress row is `COMPLETED`;\n  - calculate `correctCount` from persisted submitted answers;\n  - set attempt status and `submittedAt`;\n  - clear the current-question pointer.\n- Requests against completed attempts return the canonical completed session/result location and never mutate answers.\n- Restrict student question delivery:\n  - direct `/questions/:id` remains admin-only;\n  - general `/exams/:examId/questions` becomes admin-only for new flow usage;\n  - sequential students receive content exclusively through their authorized attempt session.\n- Freeze published exam content. Question creation, editing, answer-key changes, deletion, and reordering require a draft exam. Unpublishing is rejected while an in-progress attempt exists.\n- Continue resolving protected media URLs only for the active question or currently authorized feedback.\n\n## 5. Database Changes\n\n### `ExamAttempt`\n\nAdd:\n\n- `flowVersion Int @default(1)` so existing rows remain legacy and new attempts explicitly use version 2.\n- `currentAttemptQuestionId String?` as the server-owned pointer.\n- `progressVersion Int @default(0)` for optimistic stale-request detection.\n\nReuse:\n\n- `status`, `submittedAt`, `correctCount`, `totalQuestions`, and `startedAt`.\n\n### New `AttemptQuestionProgress`\n\nStore:\n\n- `id`, `attemptId`, `questionId`;\n- immutable attempt `ordinal` and `timeLimitSeconds`;\n- `status`;\n- `activatedAt`, `deadlineAt`, `submittedAt`, `advanceAfter`, and `completedAt`;\n- `isCorrect` and `timedOut`.\n\nConstraints:\n\n- unique `(attemptId, questionId)`;\n- unique `(attemptId, ordinal)`;\n- foreign keys to attempt and question;\n- an index supporting lookup by `(attemptId, status)`;\n- database/application enforcement that only the attempt pointer can identify the active/resolved-current row.\n\nA full question snapshot is unnecessary because published exams will be immutable while attempts are active. Membership, ordering, and time limit are still copied to protect progression.\n\n### `AttemptAnswer`\n\nReuse the existing selected option, raw value, normalized value, numeric value, content, type, correctness, and position fields.\n\nAdd:\n\n- `submittedAt DateTime?`;\n- `timedOut Boolean @default(false)`;\n- `submissionIdempotencyKey String?`;\n- unique `(attemptId, questionId)`;\n- unique `(attemptId, submissionIdempotencyKey)` where the key is non-null.\n\n`updatedAt` remains the draft-save timestamp; it must not be interpreted as the submission time. Progress `completedAt` records completion separately from submission.\n\n## 6. API Contract\n\n### `GET /attempts/:attemptId/session`\n\nReturn the canonical student session:\n\n```ts\n{\n  attemptId,\n  flowVersion,\n  attemptStatus,\n  progressVersion,\n  totalQuestions,\n  currentOrdinal,\n  serverNow,\n  navigator: Array<{ ordinal, status }>,\n  currentQuestion: {\n    id,\n    ordinal,\n    status,\n    activatedAt,\n    deadlineAt,\n    advanceAfter?,\n    question?,       // present only for the authorized current question\n    draft?,\n    feedback?        // present only in CORRECT/INCORRECT/TIMED_OUT\n  } | null,\n  resultUrl?\n}\n```\n\nThe response is private and `Cache-Control: no-store`. It reconciles deadline expiry before returning.\n\n### `PUT /attempts/:attemptId/current-question/draft`\n\nBody contains `questionId`, the answer fields, and `progressVersion`. It saves without grading. It succeeds only while that backend-selected question remains `ACTIVE` and before its deadline.\n\n### `POST /attempts/:attemptId/current-question/submit`\n\n- Require an `Idempotency-Key` header.\n- Body contains `questionId`, `progressVersion`, and the complete answer.\n- The controller records `receivedAt` from the server clock before service processing.\n- Correct response includes state, timing, and correctness but no answer key.\n- Incorrect response additionally includes the correct answer, `guidance`, and `explanation`.\n- A late request returns a successful canonical `TIMED_OUT` outcome rather than trusting a client `timedOut` flag.\n\n### `POST /attempts/:attemptId/current-question/expire`\n\nUses no client timestamp. It changes state only when the server deadline has passed and returns the timeout feedback/session.\n\n### `POST /attempts/:attemptId/current-question/continue`\n\nRequires an idempotency key, `questionId`, and `progressVersion`.\n\n- Allowed for `INCORRECT` and `TIMED_OUT`.\n- Allowed for `CORRECT` only after `advanceAfter`.\n- Completes the current question, activates the next, or finalizes the attempt.\n\n### Compatibility and errors\n\n- Keep existing `/attempts/:id/answers` and `/attempts/:id/submit` only for `flowVersion=1`.\n- Reject their use for version 2 with `409 FLOW_VERSION_MISMATCH`.\n- Use `404` for attempts/questions not owned or visible to the caller.\n- Use `409` for stale progress, already-resolved state, or an invalid transition.\n- Use `400/422` for structurally invalid or missing answer data.\n\n## 7. Edge Cases\n\n- **Refresh:** reload session, draft, deadline, feedback, and current state from the backend. Never reset the timer.\n- **Back/forward:** the route may remain in history, but every render reloads the same current session; history cannot reopen old questions.\n- **Multiple tabs:** first serialized state transition wins. Other tabs receive `STALE_PROGRESS`, synchronize, and display the winner’s state. Drafts are last-write-wins only while active.\n- **Double-click:** disable immediately; identical idempotency keys receive the same result and cannot create duplicate rows.\n- **Slow network:** preserve `SUBMITTING`; backend receipt time decides deadline eligibility. After an ambiguous failure, synchronize before retry.\n- **Request retry:** reuse the original idempotency key and exact payload.\n- **Expiry versus submit:** authenticated server receipt at or before `deadlineAt` is eligible for grading; later receipt is timeout. Client clocks never decide.\n- **Offline reconnect:** synchronize first; replay a pending draft only if attempt ID, question ID, version, state, and deadline still match.\n- **Correct feedback refresh:** restore `CORRECT`; wait only the remaining `advanceAfter` interval, or advance immediately if elapsed.\n- **Final question:** progression finalizes exactly once and returns `resultUrl`.\n- **Already completed attempt:** submission, draft, expire, and continue cannot alter it; the client is directed to the result.\n- **Deleted/unpublished exam:** active attempts remain readable; freeze rules prevent destructive exam changes while they exist.\n- **Zero-question exam:** reject attempt creation with a domain validation error.\n\n## 8. Testing Plan\n\n### Backend unit tests\n\n- Every allowed and forbidden state transition.\n- Current-question derivation ignores client indices and rejects stale question IDs.\n- Choice ownership and short/numeric-answer normalization.\n- Correct, incorrect, and timeout feedback disclosure rules.\n- Server receipt immediately before, at, and after the deadline.\n- Drafts do not grade or reveal protected data.\n- Finalization totals and result consistency.\n- Idempotency-key replay, altered-payload replay, and version conflicts.\n- Published-exam mutation and unpublish guards.\n\n### Backend integration tests\n\n- Transactional attempt creation with exactly one current question.\n- Unique progress/answer constraints.\n- Concurrent submits from two tabs.\n- Submit-versus-expire race.\n- Continue retries cannot skip a question.\n- Final-question concurrency finalizes once.\n- Student cannot retrieve or submit a locked/completed question through any endpoint.\n- Version-1 and version-2 attempts operate concurrently.\n\n### Frontend unit/component tests\n\n- Reducer and button state mapping.\n- Palette rendering and disabled behavior.\n- Timer offset/clamping and expiry dispatch.\n- Correct 3-second auto-progression with fake timers and cleanup.\n- Incorrect/timeout feedback and manual continue.\n- Draft debounce, restoration, and stale replay prevention.\n- No confirmation modal and no previous/next/exam-submit controls.\n\n### End-to-end tests\n\n- Entire all-correct attempt.\n- Incorrect and timeout paths followed by Continue.\n- Mixed question types through final result.\n- Refresh during active, submitting, correct-feedback, and incorrect-feedback states.\n- Offline/reconnect and slow-response scenarios.\n- Two-tab race and browser-history attempts.\n- Legacy in-progress attempt completion after rollout.\n\n## 9. Migration / Implementation Steps\n\n1. Add the enums, additive Prisma fields, progress model, indexes, and uniqueness constraints in a reviewed migration; generate the Prisma client explicitly afterward.\n2. Backfill existing attempts with `flowVersion=1`; do not create progress rows or reinterpret their saved answers.\n3. Implement published-exam freeze validation and the version-2 transactional domain service behind a disabled feature flag.\n4. Add session, draft, submit, expire, and continue endpoints plus security/integration tests.\n5. Add the frontend flow selector and sequential reducer/UI while retaining the current page as the legacy renderer.\n6. Update mocks, mappers, types, error handling, timer behavior, and result navigation.\n7. Deploy schema/backend first, then the dual-flow frontend.\n8. Enable version 2 only for newly created attempts. Existing in-progress attempts finish using the old three-action contract.\n9. Monitor stale-progress conflicts, duplicate requests, timeout frequency, finalization failures, and version distribution.\n10. After no version-1 attempts remain, remove `SubmitConfirmModal`, legacy free-navigation code, local deadline storage, legacy autosave/final-submit handlers, and legacy-only endpoints.\n\nThe Prisma transaction and migration approach follows the project-local `prisma-client-api` and `prisma-cli` guidance: short interactive transactions, serializable handling where required, reviewed migrations, and explicit client generation.\n\n## 10. Acceptance Criteria\n\n### Correct answer\n\n- **Given** an active non-final question with time remaining, **When** the student submits the correct answer, **Then** it is graded once, controls lock, the button disables, correct feedback remains visible for at least 3 seconds, and the next question opens automatically.\n- **Given** correct feedback is displayed, **When** the student double-clicks or retries Submit, **Then** no second answer or progress transition is created.\n\n### Incorrect answer\n\n- **Given** an active question, **When** an incorrect answer is submitted, **Then** the correct answer, hint-based GUIDANCE, and EXPLANATION are shown and the only action becomes `Continue`.\n- **Given** an incorrect question, **When** the student clicks `Continue`, **Then** that question becomes permanently completed and only the next question becomes active.\n\n### Timeout\n\n- **Given** an active question whose server deadline has passed, **When** the client expires, refreshes, or submits late, **Then** the backend records timeout, reveals the correct answer and explanation, and requires `Continue`.\n- **Given** Submit reached the backend by the deadline, **When** grading finishes after the deadline, **Then** the answer is still graded normally.\n\n### Sequential access\n\n- **Given** question N is active, **When** the student clicks navigator entries, changes browser history, or directly calls an API for another question, **Then** no previous or future question can be opened or submitted.\n- **Given** a completed question, **When** any client attempts to modify its answer, **Then** the backend rejects the mutation and preserves the original result.\n\n### Recovery and concurrency\n\n- **Given** an unsubmitted server draft, **When** the page refreshes, **Then** the same draft and remaining server-owned time are restored.\n- **Given** two tabs for one attempt, **When** both submit concurrently, **Then** one transition wins, the other receives canonical stale-state handling, and exactly one answer is graded.\n\n### Final question\n\n- **Given** the final answer is correct, **When** correct feedback has displayed for 3 seconds, **Then** the attempt is finalized once and the result screen opens.\n- **Given** the final answer is incorrect or timed out, **When** the student clicks `Continue`, **Then** the attempt is finalized once and the result screen opens.\n- **Given** an already completed attempt, **When** any further submission-related request is sent, **Then** no data changes and the canonical result remains available.\n\n### Rollout\n\n- **Given** a version-1 attempt was already in progress before deployment, **When** the student resumes it, **Then** it completes under the legacy flow.\n- **Given** a new attempt is created after the feature flag is enabled, **When** it starts, **Then** it uses version 2 and never displays free navigation, a confirmation modal, or a separate whole-exam submission button.\n"
}

---

### 👤 User _(2026-09-11T01:20:52.258Z)_

Implement the plan

---

### 🤖 Codex Assistant _(2026-09-11T01:21:07.888Z)_

I’m still in Plan Mode, which disallows repository edits. The implementation-ready plan is complete above; switching out of Plan Mode will allow me to apply it.

---

