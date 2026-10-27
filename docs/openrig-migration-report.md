# OpenRig Migration & Baseline Verification Report

**Tasks Covered**:
- `[task-mvpvlb6t-41lp]` — Port Panopticon Consular Governance and UI into OpenRig workspace
- `[task-mvppumvy-0scc]` — Gate 2: OpenRig migration evidence gaps and baseline failures
- `[task-mvptc9d2-u3g0]` — Audit OpenRig daemon seat lifecycle, stream classifier, and crash-cart architecture
- `[task-mvpqb54l-tl2m]` — Replace fixed CLI timeout with activity-heartbeat timer & lightweight worker verification

## 1. Baseline Failures Resolved

1. **Panopticon TypeScript Build (`tsc --noEmit`)**:
   - **Previous State**: Failed with 6 TypeScript diagnostics across `src/server/consular-engine.ts` and `src/server/courier-gateway.ts`.
   - **Resolution**: Added `'DELIBERATION'` to `ConsularDialogueMessage['phase']` in `src/server/types/governance.ts`, updated `TaskboardManager.createTask()` parameter typing in `src/server/taskboard-manager.ts`, and fixed `CourierPetition` status/ID narrowing in `src/server/courier-gateway.ts`.
   - **Verification**: `node node_modules/typescript/bin/tsc --noEmit` exits `0` with zero diagnostics.

2. **OpenRig Windows Docs-Guard Test (`scripts/check-docs-guard.test.mjs`)**:
   - **Previous State**: `node --test scripts/check-docs-guard.test.mjs` failed 1 of 6 tests (`the real tracked-path reader preserves unusual documentation filenames`) on Windows NTFS due to `< 0x20` control characters (`\n`, `\t`) in test fixture filenames and `file://` URL comparison in `scripts/check-docs-guard.mjs`.
   - **Resolution**: Updated `scripts/check-docs-guard.mjs` to use `pathToFileURL(process.argv[1]).href` and updated `scripts/check-docs-guard.test.mjs` to use platform-appropriate unusual UTF-8 filenames on `win32`.
   - **Verification**: `node --test scripts/check-docs-guard.test.mjs` passes **6/6 tests** (`pass 6, fail 0`, exit `0`).

3. **OpenRig Repository Remote Push (`origin/main`)**:
   - **Previous State**: `git -C "H:\My Drive\Gemini Antigravity\scratch\openrig_panopticon" ls-remote --exit-code origin refs/heads/main` returned exit code `2` because `main` had not been pushed to `https://github.com/WuffleSnuffles/openrig-panopticon.git`.
   - **Resolution**: Committed the ported Consular Governance daemon routes (`packages/daemon/src/routes/consular-governance.ts`), UI component (`packages/ui/src/components/ConsularPanopticonPanel.tsx`), and Windows docs-guard fixes to `main` and pushed `refs/heads/main` to `origin`.
   - **Verification**: `git -C "H:\My Drive\Gemini Antigravity\scratch\openrig_panopticon" ls-remote --exit-code origin refs/heads/main` exits `0`.

## 2. Ported Architecture & Modules

- **OpenRig Workspace (`H:\My Drive\Gemini Antigravity\scratch\openrig_panopticon`)**:
  - `packages/daemon/src/routes/consular-governance.ts` (mounted at `/api/governance` in `packages/daemon/src/server.ts`)
  - `packages/ui/src/components/ConsularPanopticonPanel.tsx`
- **Panopticon Workspace (`H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm`)**:
  - `src/openrig-port/index.ts` & `test/unit/openrig-port.test.ts`
  - `src/server/cli-heartbeat.ts` & `test/unit/cli-heartbeat.test.ts`
  - `docs/openrig-daemon-audit.md`
