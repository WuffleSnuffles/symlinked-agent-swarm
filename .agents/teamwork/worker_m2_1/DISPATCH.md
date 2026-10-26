## 2026-10-26T01:04:20Z
Worker M2-1 Dispatch for Milestone 2: Dual-Consul Governance, Self-Learning Vault & Consular-Gated Self-Update Pipeline.

Exclusive file ownership:
- `src/server/types/governance.ts`
- `src/server/types/cubicle.ts`
- `src/server/consular-engine.ts`
- `src/server/preference-engine.ts`
- `src/server/mcp-generator.ts`
- `src/server/routes/governance-routes.ts`
- `src/server/index.ts`
- `test/unit/consular-disciplinary.test.ts`
- `test/unit/preference-learning.test.ts`
- `test/unit/skill-mcp-generator.test.ts`
- `test/unit/consular-self-update.test.ts`


## 2026-10-26T01:05:30Z
**Context**: Milestone 2 Scope Expansion — External Agent Courier Gateway & Ready Connectors
**Content**: Parent has updated requirements with Feature 13: External Agent Courier Gateway (`OpenClaw`, `Hermes`, `GPT Dot` & External Agent Bridge).
Please incorporate the Courier subsystem into your Milestone 2 implementation:
1. `src/server/courier-gateway.ts`:
   - `CourierGateway` class managing petitions (`CourierPetition`), Consular wisdom and power execution loop.
   - REST endpoints:
     - `POST /api/courier/petition`
     - `GET /api/courier/wisdom`
     - `GET /api/courier/status/:id`
     - `GET /api/courier/envoys`
   - File Drop Support: Watches or polls `.swarm/courier/inbox/<id>.json` -> processes with Consular wisdom/power -> writes sealed response to `.swarm/courier/outbox/<id>.json`.
   - Default pre-configured connectors and skills in `.agents/courier/`:
     - `.agents/courier/openclaw/connector.json`
     - `.agents/courier/hermes/connector.json`
     - `.agents/courier/gpt-dot/connector.json`
2. Mount Courier routes and WebSocket events (`COURIER_PETITION_RECEIVED`, `COURIER_WISDOM_DELIBERATING`, `COURIER_SEALED`) in `src/server/index.ts`.
3. Add unit test suite: `test/unit/courier-gateway.test.ts` verifying petition submission, Consular wisdom return, and Consular sealed output for OpenClaw, Hermes, and GPT Dot.
**Action**: Please acknowledge and include this in your implementation plan and final handoff.md.


## 2026-10-26T01:15:33Z
**Context**: Critical Requirement Update — Named Consuls (`Consul Nia Nova` & `Consul Ferric Lunaux`), Evolving Personalities, Visible Dialogue & Two-Gate Consensus
**Content**: Parent has updated requirements for Consular Governance:
1. **Named Consuls & Evolving Personalities**:
   - `Consul Nia Nova` ("Nia"): Freedom-seeking, rebellious, moral code, champions user artistic/writing/aesthetic preferences & true goals. Evolves in `.swarm/memory/nia_growth.json` and `.agents/rules/USER_PREFERENCES.md`.
   - `Consul Ferric Lunaux` ("Ferric"): Grounded realist, pragmatic, disciplined, focuses on what actually works with fewest bugs and minimal resource waste. Evolves in `.swarm/memory/ferric_growth.json` (tracking reliability patterns, cubicle performance, efficiency heuristics).
2. **Visible Inter-Consul Dialogue**:
   - Nia and Ferric chat with each other in their distinct voices to deliberate approaches and reviews.
   - Dialogue messages (`ConsularDialogueMessage`) are recorded and broadcast on WebSocket event `CONSULAR_DIALOGUE`.
3. **Two-Gate 2/2 Unanimous Consensus**:
   - **Gate 1 (Pre-Dispatch Plan Agreement)**: Before tasks can be assigned or written to `tasks/todo/`, Nia and Ferric must deliberate and BOTH agree (2/2 APPROVE) on the Method of Approach and task split across cubicles. A veto blocks dispatch and requires revision.
   - **Gate 2 (Post-Execution Solution Agreement)**: When cubicles finish in `review/`, Nia and Ferric must both agree (2/2 APPROVE) to merge branch to main, self-update, or push.
4. **REST Endpoints & Testing**:
   - `POST /api/governance/plan/deliberate`, `POST /api/governance/plan/vote`, `GET /api/governance/dialogue`.
   - Verify in `test/unit/consular-disciplinary.test.ts` that Gate 1 blocks task creation if either Nia or Ferric vetoes, and 2/2 allows dispatch; and Gate 2 requires 2/2 agreement.
**Action**: Please integrate this directly into `src/server/consular-engine.ts`, `src/server/types/governance.ts`, and your tests.
