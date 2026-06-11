# Floating Assistant v1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working Electron desktop floating assistant v1.0 with a floating ball, todos, scheduled notifications, health reminders, and local JSON persistence.

**Architecture:** Electron owns native desktop integration, persistence, scheduling, and notifications. React renderer windows display compact utility UIs and call typed preload IPC APIs. Pure state logic is isolated in shared modules so tests can validate behavior without launching Electron.

**Tech Stack:** Electron, React, TypeScript, Vite, Tailwind CSS, Vitest, Testing Library.

---

## File Structure

- Create `package.json`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`, `tailwind.config.js`, `postcss.config.js`, `index.html`.
- Create `src/shared/types.ts` for app data types and IPC contracts.
- Create `src/shared/defaults.ts` for default settings and default health reminders.
- Create `src/shared/date.ts` for date/time helpers.
- Create `src/shared/todoService.ts` for pure todo mutations and due detection.
- Create `src/shared/reminderService.ts` for pure health reminder mutations and due detection.
- Create `src/main/store.ts` for JSON persistence.
- Create `src/main/scheduler.ts` for scheduler orchestration.
- Create `src/main/windows.ts`, `src/main/tray.ts`, `src/main/ipc.ts`, `src/main/notifications.ts`, `src/main/index.ts`, `src/main/preload.ts`.
- Create `src/renderer/main.tsx`, `src/renderer/App.tsx`, `src/renderer/styles.css`.
- Create renderer components under `src/renderer/components`.
- Create tests under `src/shared/*.test.ts`, `src/main/*.test.ts`, and `src/renderer/components/*.test.tsx`.

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `tailwind.config.js`
- Create: `postcss.config.js`
- Create: `index.html`
- Create: `src/renderer/styles.css`

- [ ] **Step 1: Create config files**

Add npm scripts for `dev`, `build`, `test`, and `typecheck`. Configure Vite with React and Electron entry builds.

- [ ] **Step 2: Install dependencies**

Run: `npm install`

Expected: dependencies install successfully.

- [ ] **Step 3: Verify empty test command**

Run: `npm run test -- --run`

Expected: Vitest starts and reports no tests or passes once tests exist.

### Task 2: Shared Types and Defaults

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/defaults.ts`
- Test: `src/shared/defaults.test.ts`

- [ ] **Step 1: Write failing defaults tests**

Test that default health reminders include stand, drink water, and eye rest; test default settings match v1.0 design values.

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- --run src/shared/defaults.test.ts`

Expected: FAIL because files do not exist.

- [ ] **Step 3: Implement types and defaults**

Define `Todo`, `TodoStore`, `HealthReminder`, `AppSettings`, `AppSnapshot`, and default factories.

- [ ] **Step 4: Run test to verify pass**

Run: `npm run test -- --run src/shared/defaults.test.ts`

Expected: PASS.

### Task 3: Todo Behavior

**Files:**
- Create: `src/shared/date.ts`
- Create: `src/shared/todoService.ts`
- Test: `src/shared/todoService.test.ts`

- [ ] **Step 1: Write failing todo tests**

Cover adding todos, title trimming, title length validation, toggle completion, deletion, snooze by 10 minutes, and due detection.

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- --run src/shared/todoService.test.ts`

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement todo service**

Implement pure mutations that return new data structures and throw validation errors for invalid input.

- [ ] **Step 4: Run test to verify pass**

Run: `npm run test -- --run src/shared/todoService.test.ts`

Expected: PASS.

### Task 4: Health Reminder Behavior

**Files:**
- Create: `src/shared/reminderService.ts`
- Test: `src/shared/reminderService.test.ts`

- [ ] **Step 1: Write failing reminder tests**

Cover initialization of `nextTriggerAt`, pause/resume, progress calculation, and due reminder reset.

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- --run src/shared/reminderService.test.ts`

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement reminder service**

Implement pure countdown logic and immutable mutations.

- [ ] **Step 4: Run test to verify pass**

Run: `npm run test -- --run src/shared/reminderService.test.ts`

Expected: PASS.

### Task 5: Local JSON Store

**Files:**
- Create: `src/main/store.ts`
- Test: `src/main/store.test.ts`

- [ ] **Step 1: Write failing store tests**

Use a temporary directory to verify missing files use defaults, writes persist, and invalid JSON is backed up and replaced.

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- --run src/main/store.test.ts`

Expected: FAIL because store does not exist.

- [ ] **Step 3: Implement JSON store**

Implement atomic JSON writes and corrupt file recovery.

- [ ] **Step 4: Run test to verify pass**

Run: `npm run test -- --run src/main/store.test.ts`

Expected: PASS.

### Task 6: Main Process Runtime

**Files:**
- Create: `src/main/windows.ts`
- Create: `src/main/notifications.ts`
- Create: `src/main/scheduler.ts`
- Create: `src/main/ipc.ts`
- Create: `src/main/tray.ts`
- Create: `src/main/preload.ts`
- Create: `src/main/index.ts`
- Test: `src/main/scheduler.test.ts`

- [ ] **Step 1: Write failing scheduler tests**

Cover todo notification callbacks and health reminder notification callbacks using fake timers or injected dates.

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- --run src/main/scheduler.test.ts`

Expected: FAIL because scheduler does not exist.

- [ ] **Step 3: Implement runtime modules**

Create windows, expose preload APIs, register IPC handlers, update snapshots after mutations, and wire notifications.

- [ ] **Step 4: Run test to verify pass**

Run: `npm run test -- --run src/main/scheduler.test.ts`

Expected: PASS.

### Task 7: Renderer UI

**Files:**
- Create: `src/renderer/main.tsx`
- Create: `src/renderer/App.tsx`
- Create: `src/renderer/components/FloatingBall.tsx`
- Create: `src/renderer/components/TodoPanel.tsx`
- Create: `src/renderer/components/HealthWindow.tsx`
- Test: `src/renderer/components/TodoPanel.test.tsx`
- Test: `src/renderer/components/HealthWindow.test.tsx`

- [ ] **Step 1: Write failing renderer tests**

Verify todo validation, add callback, complete callback, delete callback, and health pause/resume callback.

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- --run src/renderer/components`

Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement renderer components**

Build compact utility UI with Tailwind classes and route by query parameter: `ball`, `todo`, or `health`.

- [ ] **Step 4: Run test to verify pass**

Run: `npm run test -- --run src/renderer/components`

Expected: PASS.

### Task 8: Final Verification

**Files:**
- Modify: all project files as needed.

- [ ] **Step 1: Run full tests**

Run: `npm run test -- --run`

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Start dev app**

Run: `npm run dev`

Expected: Electron opens the floating assistant in development mode.
