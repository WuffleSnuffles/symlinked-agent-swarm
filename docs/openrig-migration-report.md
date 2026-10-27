# OpenRig Panopticon Full Runtime Migration Report

## 1. Overview
All 6 core OpenRig baseline subsystems have been ported into [`src/openrig-port/`](file:///H:/My%20Drive/Gemini%20Antigravity/scratch/symlinked_agent_swarm/src/openrig-port/index.ts) and wired directly into the live Panopticon server ([`src/server/consular-engine.ts`](file:///H:/My%20Drive/Gemini%20Antigravity/scratch/symlinked_agent_swarm/src/server/consular-engine.ts), [`src/server/index.ts`](file:///H:/My%20Drive/Gemini%20Antigravity/scratch/symlinked_agent_swarm/src/server/index.ts)) as well as the OpenRig monorepo workspace ([`H:\My Drive\Gemini Antigravity\scratch\openrig_panopticon`](file:///H:/My%20Drive/Gemini%20Antigravity/scratch/openrig_panopticon)).

## 2. Ported OpenRig Baseline Subsystems (`src/openrig-port/`)
1. **Seat Lifecycle & Generation Fencing ([`seat-lifecycle.ts`](file:///H:/My%20Drive/Gemini%20Antigravity/scratch/symlinked_agent_swarm/src/openrig-port/seat-lifecycle.ts)):**
   - Allocates a fresh `occupantGeneration` UUID on every Consul and Worker Cubicle CLI invocation (`OPENRIG_OCCUPANT_GENERATION`, `OPENRIG_RIG=panopticon`, `OPENRIG_SEAT`).
   - Serializes per-seat transitions via `DeliveryGuard` and implements 3-state liveness probing (`'present' | 'absent' | 'transport_unavailable'`, never mutating to `'stopped'` on `'transport_unavailable'`).
2. **4-Rung Ranked Activity Evidence Ladder ([`seat-activity.ts`](file:///H:/My%20Drive/Gemini%20Antigravity/scratch/symlinked_agent_swarm/src/openrig-port/seat-activity.ts)):**
   - Arbitrates seat activity (`working | idle-at-prompt | unknown`) across `self-report` → `lifecycle-hooks` → `needs-input-chrome` → `window-sampling`.
   - Enforces the 2-tick idle debounce (`SAMPLING_IDLE_DEBOUNCE_TICKS = 2`) and cross-rung contradiction detection (`CROSS_RUNG_CONTRADICTION_WINDOW_MS = 5000`).
3. **6-Detector Health Projection Engine ([`health-detectors.ts`](file:///H:/My%20Drive/Gemini%20Antigravity/scratch/symlinked_agent_swarm/src/openrig-port/health-detectors.ts)):**
   - Evaluates `process.ceremony-amplification`, `process.review-carousel`, `process.redundant-wake-storm`, `governance.stale-directive`, `governance.scope-admission-drift`, and `context.pressure` (`95%` warning / `99%` critical) under the `openrig.health-list/v0alpha1` schema.
4. **Wake-Driven Lease-Fenced Stream Classifier ([`stream-classifier.ts`](file:///H:/My%20Drive/Gemini%20Antigravity/scratch/symlinked_agent_swarm/src/openrig-port/stream-classifier.ts)):**
   - Coalesces stream notifications via `O(1)` boolean hint (`notify()`), fences single-owner leases, and bounds per-item classification with `Promise.race` + `AbortController` capped by lease heartbeat.
5. **Markdown-Addressable Seat Recap Store ([`seat-recap-store.ts`](file:///H:/My%20Drive/Gemini%20Antigravity/scratch/symlinked_agent_swarm/src/openrig-port/seat-recap-store.ts) & [`markdown-address.ts`](file:///H:/My%20Drive/Gemini%20Antigravity/scratch/symlinked_agent_swarm/src/openrig-port/markdown-address.ts)):**
   - Validates `RECAP.md` H2/H3 addressability (`name#H2-slug/H3-slug`), rejects symlink escapes via `lstatSync`, rotates predecessors into `recap-superseded/`, and injects predecessor recaps into worker dispatch prompts.
6. **Crash-Cart C3/C2/B1 & Amendment 2 Live Adoption ([`crash-cart.ts`](file:///H:/My%20Drive/Gemini%20Antigravity/scratch/symlinked_agent_swarm/src/openrig-port/crash-cart.ts)):**
   - Implements positive-predicate `'down'` detection (timeouts never promote to `'down'`), copy-then-read discovery, and `RestoreConductor` with kernel-first ordering and Amendment 2 live-pane adoption.

## 3. Live API Endpoints (`http://localhost:3820`)
- `GET /api/openrig/status` — Complete 6-subsystem OpenRig runtime overview.
- `GET /api/openrig/seats` & `GET /api/openrig/activity` — Live occupant generations and 4-rung evidence ladder states.
- `GET /api/openrig/health` — Live `openrig.health-list/v0alpha1` 6-detector projection.
- `GET /api/openrig/recap/:seatId` & `POST /api/openrig/recap/:seatId` — Addressable `RECAP.md` handover store.
- `GET /api/openrig/stream-classifier` & `POST /api/openrig/stream-classifier/wake` — Stream classification worker status & wake trigger.
- `GET /api/crash-cart/detect`, `GET /api/crash-cart/discovery`, `POST /api/crash-cart/restore-fleet` (`HTTP 202 Accepted`).
