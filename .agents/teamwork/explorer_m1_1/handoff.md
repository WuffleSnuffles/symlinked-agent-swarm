# Handoff Report: Milestone 1, Component A (16-Cubicle Grid Roster & Pluggable CLI/API Engine)

**Agent**: Explorer M1-1  
**Working Directory**: `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m1_1`  
**Date**: 2026-10-26T00:28:00Z  
**Target Milestone**: Milestone 1 (Component A: Feature 1)  
**Recipient**: Sub-Orchestrator M1 (`sub_orch_m1`) / Parent (`5d1d9c33-70a3-4e64-96ff-073d03d579f8`)

---

## 1. Observation

1. **Grid Dimension & Identification**:
   - `ORIGINAL_REQUEST.md:13`: *"Provide a dedicated Overseer agent plus 16 numbered Worker Cubicle slots (`cubicle-01` through `cubicle-16`) arranged in a 4x4 grid"*
   - `PROJECT.md:32`: Feature 1 specifies *"4x4 matrix of 16 cubicle slots, default pre-configuration (Cubicles 1 & 2: `Gemini 4 Argon (High)`, Cubicle 3: `GPT Astra (Very High)`, Cubicles 4-16 blank/unassigned), pluggable CLI/API provider configs, token quotas, and fatigue/usage meters."*
2. **Default Pre-Configuration & Sub-Swarm Gating**:
   - `ORIGINAL_REQUEST.md:14`: *"Pre-populate Cubicle 1 with `Gemini 4 Argon (High)`, Cubicle 2 with `Gemini 4 Argon (High)`, and Cubicle 3 with `GPT Astra (Very High)`. Initialize Cubicles 4–16 as blank/empty cubicle slots."*
   - `ORIGINAL_REQUEST.md:20-21`: *"`Gemini 4 Argon (High)` (Cubicles 1 & 2): Allowed to spawn multi-swarms (`can_spawn_subswarm = true`). `GPT Astra (Very High)` (Cubicle 3): Restricted / Not Allowed to spawn multi-swarms (`can_spawn_subswarm = false`; operates strictly as a single solo worker)."*
3. **Pluggable CLI & API Configuration**:
   - `ORIGINAL_REQUEST.md:15`: *"Allow the user to configure, hot-swap, or clear any cubicle (and the Overseer) by specifying AI brand/provider (`Gemini`, `GPT / OpenAI`, `Claude / Anthropic`, `DeepSeek`, or `Custom CLI`), model name, thinking level (`Low`, `Medium`, `High`, `Very High`, `Ultra`), CLI command template, API keys / environment variables, and usage quota/budget limits."*
4. **Lifecycle States & Visual Indicators**:
   - `ORIGINAL_REQUEST.md:36`: *"Distinct animations for Working (intense active work + orbiting sub-swarm drones when running a multi-swarm), Relaxed/Idle (resting/standby animation), Under Inspection, and Error/Flatlined."*
   - `explorer_survey_1/analysis.md:140-146`: 6 distinct states defined: `vacant`, `idle`, `working`, `under_inspection`, `error`, `exhausted`.
5. **Fatigue & Stamina Calculation**:
   - `ORIGINAL_REQUEST.md:37`: *"Fatigue / Usage Remaining Meter: Visual exhaustion state and stamina/usage bar where the worker's posture/animation and meter reflect their remaining token/API usage quota (energized at high remaining quota; visibly tired/strained as usage remaining depletes)."*
   - `explorer_survey_1/analysis.md:196`: Stamina formula: $\text{Stamina \%} = \max(0, \min(100, (1 - \frac{\text{Tokens Used}}{\text{Token Quota}}) \times 100))$.

---

## 2. Logic Chain

1. **Deduction 1 (Spatial & Storage Layout)**:
   From Observation 1, a 16-element array mapped via $r = \lfloor i/4 \rfloor, c = i \pmod 4$ provides $O(1)$ coordinate and neighbor lookup. To support persistence without lock contention, configuration must be separated from live telemetry: `.swarm/roster.json` holds administrative settings, while `.swarm/status/cubicle-XX.json` records per-slot heartbeats, live thoughts, and process PIDs.
2. **Deduction 2 (Default State & Capability Invariant)**:
   From Observation 2, Cubicles 1 and 2 must instantiate with `enabled: true`, `status: "idle"`, `can_spawn_subswarm: true`, and thinking budget 16,000 tokens. Cubicle 3 must instantiate with `enabled: true`, `status: "idle"`, `can_spawn_subswarm: false` (strictly enforced restriction), and thinking budget 32,000 tokens. Cubicles 4–16 must instantiate with `enabled: false`, `status: "vacant"`, and `can_spawn_subswarm: false`.
3. **Deduction 3 (CLI Parameter Interpolation & Safety)**:
   From Observation 3, supporting arbitrary CLI tools on Windows requires a templating engine with parameter substitution (`{{prompt}}`, `{{prompt_file}}`, `{{model}}`, `{{thinking_budget}}`, `{{worktree_dir}}`, `{{task_id}}`, `{{cubicle_id}}`, `{{api_key}}`). Because Windows command-line strings have buffer limits (8,191 characters for `cmd.exe`), long prompts must be written to `.swarm/tasks/tmp/prompt-task-XX.txt` and referenced via `{{prompt_file}}`.
4. **Deduction 4 (Deterministic Lifecycle Finite State Machine)**:
   From Observation 4, the 6 states (`vacant`, `idle`, `working`, `under_inspection`, `error`, `exhausted`) require a transition validation matrix to prevent impossible transitions (e.g., `vacant` cannot jump directly to `working`; `under_inspection` can only transition upon Consular approval or veto).
5. **Deduction 5 (Stamina & Fatigue Tiering)**:
   From Observation 5, token accounting directly drives UI posture. Mapping stamina percentage into 4 discrete tiers (`energized`: 100%–70%, `fatigued`: 69%–35%, `critical_strain`: 34%–1%, `exhausted`: 0%) allows the frontend to trigger specific animations and enables the engine to transition the cubicle to `'exhausted'` when tokens reach 0.

---

## 3. Caveats

1. **CLI Execution Privilege on Windows**:
   Running custom CLI tools or shell scripts requires the host machine to have the corresponding CLI binaries installed in `PATH` (e.g. `gemini`, `openai`, `claude`, or `python`). If a binary is missing, `cli-engine.ts` must gracefully transition the cubicle to `'error'` and record an incident in `.swarm/logs/incidents.jsonl` rather than crashing the Node server.
2. **Token Accounting Accuracy across Providers**:
   CLI runners that output unstructured text may not emit machine-readable token counts. In such cases, `cli-engine.ts` should fall back to character/word-based heuristic token estimation (~4 characters per token) to update `tokens_used` and preserve stamina calculation.

---

## 4. Conclusion

Milestone 1, Component A (Feature 1) is fully specified and architected for immediate implementation. 
The recommended implementation targets:
- `src/server/types/cubicle.ts`: TypeScript interfaces (`CubicleConfig`, `CubicleLiveState`, `AIBrand`, `ThinkingLevel`, `CubicleStatus`, `StaminaTier`).
- `src/server/types/cubicle-defaults.ts`: `DEFAULT_CUBICLE_ROSTER` constant defining the exact 16-slot initial state.
- `src/server/cubicle-manager.ts`: 16-cubicle state machine, persistence to `.swarm/roster.json` and `.swarm/status/`, transition validation, and heartbeat emitter.
- `src/server/cli-engine.ts`: CLI parameter template interpolator (`{{prompt_file}}`, `{{model}}`, etc.) and child process lifecycle manager.
- `src/server/quota-tracker.ts`: Token consumption accounting, stamina percentage calculation, and tier classification.
- `src/server/routes/cubicle-routes.ts`: REST endpoints (`GET /api/cubicles`, `PUT /api/cubicles/:id/configure`, `POST /api/cubicles/:id/recharge`).

---

## 5. Verification Method

To independently verify the implementation of Component A:
1. **Automated Unit Tests**:
   Execute:
   ```powershell
   npm test test/unit/cubicle-roster.test.ts
   ```
   **Pass Criteria**:
   - Exactly 16 cubicle slots initialized with correct 4x4 matrix coordinates.
   - Cubicle 1 & 2 configured as `Gemini 4 Argon (High)` with `can_spawn_subswarm === true`.
   - Cubicle 3 configured as `GPT Astra (Very High)` with `can_spawn_subswarm === false`.
   - Cubicles 4–16 initialized as `vacant` with `enabled === false`.
   - Template interpolation correctly replaces all placeholders and handles special characters.
   - Valid state transitions succeed; invalid state transitions (e.g. `vacant -> working`) throw errors.
   - Stamina calculation correctly yields 100% at zero usage, 50% at half usage, and 0% (triggering `'exhausted'`) when quota is depleted.
2. **File & Data Inspection**:
   - Inspect `.swarm/roster.json` to verify valid JSON formatting of all 16 slots.
   - Inspect `.swarm/status/cubicle-01.json` through `cubicle-16.json` to verify telemetry structure.
3. **Invalidation Conditions**:
   - If Cubicle 3 is initialized with `can_spawn_subswarm: true`, verification **FAILS**.
   - If fewer or more than 16 cubicle slots exist, verification **FAILS**.
   - If `tokens_remaining <= 0` does not transition the cubicle to `'exhausted'`, verification **FAILS**.
