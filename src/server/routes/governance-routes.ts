/**
 * src/server/routes/governance-routes.ts
 *
 * Express REST API Routes for Dual-Consul Governance, 5 Disciplinary Powers,
 * Self-Learning Preferences, Skills & MCP Generator, Vault, and Courier Gateway.
 */

import { Router, Request, Response } from 'express';
import { ConsularEngine } from '../consular-engine.js';
import { PreferenceEngine } from '../preference-engine.js';
import { SkillMcpManager } from '../mcp-generator.js';
import { CourierGateway } from '../courier-gateway.js';

export function createGovernanceRouter(
  consularEngine: ConsularEngine,
  preferenceEngine: PreferenceEngine,
  skillMcpManager: SkillMcpManager,
  courierGateway: CourierGateway
): Router {
  const router = Router();

  // =========================================================================
  // Dual-Consul Endpoints
  // =========================================================================

  router.get('/governance/consuls', (_req: Request, res: Response) => {
    try {
      const consuls = consularEngine.getConsuls();
      res.json({ consuls });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/governance/consuls/:id', async (req: Request, res: Response) => {
    try {
      const updated = await consularEngine.updateConsul(req.params.id, req.body);
      res.json({ consul: updated });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/governance/review', async (req: Request, res: Response) => {
    try {
      const { taskId, votes } = req.body;
      if (!taskId || !votes || !Array.isArray(votes) || votes.length !== 2) {
        res.status(400).json({
          error: 'Missing mandatory fields: taskId and exactly 2 consular votes [vote1, vote2] are required.',
        });
        return;
      }
      const result = await consularEngine.reviewTask(taskId, votes as any);
      res.json({ result });
    } catch (err: any) {
      const isAuthError = err.message.includes('UNAUTHORIZED');
      res.status(isAuthError ? 403 : 400).json({ error: err.message });
    }
  });

  // =========================================================================
  // Gate 1: Pre-Dispatch Plan Deliberation & Agreement
  // =========================================================================

  router.post('/governance/plan/deliberate', async (req: Request, res: Response) => {
    try {
      const { goal, proposedPlan, taskSplits } = req.body;
      if (!goal || !proposedPlan || !taskSplits) {
        res.status(400).json({ error: 'goal, proposedPlan, and taskSplits are required.' });
        return;
      }
      const planGate = await consularEngine.deliberatePlan(goal, proposedPlan, taskSplits);
      res.status(201).json({ planGate });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/governance/plan/vote', async (req: Request, res: Response) => {
    try {
      const { planId, votes } = req.body;
      if (!planId || !votes || !Array.isArray(votes) || votes.length !== 2) {
        res.status(400).json({ error: 'planId and exactly 2 consular votes [vote1, vote2] are required.' });
        return;
      }
      const result = await consularEngine.votePlan(planId, votes as any);
      res.json({ result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/governance/dialogue', (req: Request, res: Response) => {
    try {
      const limit = Number(req.query.limit || 50);
      const dialogue = consularEngine.getDialogue(limit);
      res.json({ dialogue });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/governance/chat', async (req: Request, res: Response) => {
    try {
      const { prompt, goal, text: bodyText, message, attachments, replyTo } = req.body || {};
      const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
      const text =
        (prompt || goal || bodyText || message || '').trim() ||
        (hasAttachments ? 'Please review the attached image.' : '');
      if (!text) {
        res.status(400).json({ error: 'prompt is required.' });
        return;
      }

      const workerSpoof = consularEngine.detectWorkerChatSpoof(text, {
        ...(req.body || {}),
        headers: req.headers,
      });
      if (workerSpoof) {
        const routed = await consularEngine.routeWorkerCoordination(text, {
          ...(req.body || {}),
          headers: req.headers,
        });
        res.status(403).json({
          error: `OVERSEER_SPOOF_BLOCKED: Worker ${routed.cubicleId} cannot post to /api/governance/chat as Overseer. Coordination routed to /api/messages and Consular Deliberation.`,
          routed: true,
          routedTo: '/api/messages',
          cubicleId: routed.cubicleId,
          message: routed.message,
          deliberation: routed.deliberation,
        });
        return;
      }

      const result = await consularEngine.chatWithConsuls(text, attachments || [], replyTo);
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/governance/growth', (_req: Request, res: Response) => {
    try {
      res.json({
        nia: consularEngine.getNiaGrowth(),
        ferric: consularEngine.getFerricGrowth(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // 5 Consular Disciplinary Powers
  // =========================================================================

  router.post('/governance/kill', async (req: Request, res: Response) => {
    try {
      const { cubicleId, reason, replaceWith } = req.body;
      if (!cubicleId || !reason) {
        res.status(400).json({ error: 'cubicleId and reason are required.' });
        return;
      }
      await consularEngine.killAgent(cubicleId, reason, replaceWith);
      res.json({ success: true, message: `Cubicle ${cubicleId} terminated by Consular Decree.` });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/governance/thinking-level', async (req: Request, res: Response) => {
    try {
      const { cubicleId, thinkingLevel } = req.body;
      if (!cubicleId || !thinkingLevel) {
        res.status(400).json({ error: 'cubicleId and thinkingLevel are required.' });
        return;
      }
      const result = await consularEngine.setThinkingLevel(cubicleId, thinkingLevel);
      res.json({ success: true, cubicleId, ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/governance/swap-role', async (req: Request, res: Response) => {
    try {
      const { cubicleId, newRole } = req.body;
      if (!cubicleId || !newRole) {
        res.status(400).json({ error: 'cubicleId and newRole are required.' });
        return;
      }
      await consularEngine.swapRole(cubicleId, newRole);
      res.json({ success: true, cubicleId, newRole });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/governance/swap-cubicles', async (req: Request, res: Response) => {
    try {
      const { cubicleA, cubicleB } = req.body;
      if (!cubicleA || !cubicleB) {
        res.status(400).json({ error: 'cubicleA and cubicleB are required.' });
        return;
      }
      await consularEngine.swapCubicles(cubicleA, cubicleB);
      res.json({ success: true, message: `Swapped cubicles ${cubicleA} and ${cubicleB}.` });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/governance/wipe-memory', async (req: Request, res: Response) => {
    try {
      const { cubicleId, preserveRoster } = req.body;
      if (!cubicleId) {
        res.status(400).json({ error: 'cubicleId is required.' });
        return;
      }
      await consularEngine.wipeMemory(cubicleId, preserveRoster ?? true);
      res.json({ success: true, message: `Memory wiped clean for ${cubicleId}.` });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/governance/access-scope', async (req: Request, res: Response) => {
    try {
      const { cubicleId, allowed_paths, denied_paths, memory_scopes } = req.body;
      if (!cubicleId) {
        res.status(400).json({ error: 'cubicleId is required.' });
        return;
      }
      const scope = await consularEngine.setAccessScope(cubicleId, {
        allowed_paths: allowed_paths || [],
        denied_paths: denied_paths || [],
        memory_scopes: memory_scopes || [],
      });
      res.json({ success: true, scope });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/governance/access-scope/:cubicleId', async (req: Request, res: Response) => {
    try {
      const scope = await consularEngine.getAccessScope(req.params.cubicleId);
      if (!scope) {
        res.status(404).json({ error: `No access scope configured for ${req.params.cubicleId}` });
        return;
      }
      res.json({ scope });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // Consular Self-Update Pipeline
  // =========================================================================

  router.post('/governance/self-update/initiate', async (req: Request, res: Response) => {
    try {
      const { prompt } = req.body;
      if (!prompt) {
        res.status(400).json({ error: 'prompt is required.' });
        return;
      }
      const request = await consularEngine.initiateSelfUpdate(prompt);
      res.status(201).json({ request });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/governance/self-update/review', async (req: Request, res: Response) => {
    try {
      const { requestId, votes } = req.body;
      if (!requestId || !votes || !Array.isArray(votes) || votes.length !== 2) {
        res.status(400).json({
          error: 'requestId and exactly 2 consular votes [vote1, vote2] are required.',
        });
        return;
      }
      const request = await consularEngine.reviewSelfUpdate(requestId, votes as any);
      res.json({ request });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/governance/self-update/vote', async (req: Request, res: Response) => {
    try {
      const { requestId, votes } = req.body;
      if (!requestId || !votes || !Array.isArray(votes) || votes.length !== 2) {
        res.status(400).json({
          error: 'requestId and exactly 2 consular votes [vote1, vote2] are required.',
        });
        return;
      }
      const request = await consularEngine.reviewSelfUpdate(requestId, votes as any);
      res.json({ request });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/governance/self-update/rollback', async (req: Request, res: Response) => {
    try {
      const { requestId } = req.body;
      if (!requestId) {
        res.status(400).json({ error: 'requestId is required for rollback.' });
        return;
      }
      const request = await consularEngine.rollbackSelfUpdate(requestId);
      res.json({ success: true, message: `Rolled back self-update ${requestId}`, request });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/governance/self-update/status/:requestId', async (req: Request, res: Response) => {
    try {
      const request = await consularEngine.getSelfUpdateStatus(req.params.requestId);
      res.json({ request });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  // =========================================================================
  // Preference Endpoints ("Never Explain Twice")
  // =========================================================================

  router.get('/preferences', (_req: Request, res: Response) => {
    try {
      res.json({ database: preferenceEngine.getDatabase() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/preferences/extract', async (req: Request, res: Response) => {
    try {
      const { message, sourceMessageId } = req.body;
      if (!message) {
        res.status(400).json({ error: 'message is required.' });
        return;
      }
      const extracted = preferenceEngine.extractPreferences(message, sourceMessageId);
      const saved = [];
      for (const pref of extracted) {
        saved.push(await preferenceEngine.savePreference(pref));
      }
      res.json({ extracted: saved });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/preferences', async (req: Request, res: Response) => {
    try {
      const pref = await preferenceEngine.savePreference(req.body);
      res.status(201).json({ preference: pref });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/preferences/:id', async (req: Request, res: Response) => {
    try {
      const pref = await preferenceEngine.savePreference({ ...req.body, id: req.params.id });
      res.json({ preference: pref });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/preferences/:id', async (req: Request, res: Response) => {
    try {
      const deleted = await preferenceEngine.deletePreference(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: `Preference not found: ${req.params.id}` });
        return;
      }
      res.json({ success: true, id: req.params.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // Skill Endpoints
  // =========================================================================

  router.get('/skills', async (_req: Request, res: Response) => {
    try {
      const skills = await skillMcpManager.listSkills();
      res.json({ skills });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/skills/generate', async (req: Request, res: Response) => {
    try {
      const { name, description, instructions, scripts } = req.body;
      if (!name || !description) {
        res.status(400).json({ error: 'name and description are required.' });
        return;
      }
      const skill = await skillMcpManager.generateSkill({
        name,
        description,
        instructions,
        scripts,
      });
      res.status(201).json({ skill });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/skills/:name', async (req: Request, res: Response) => {
    try {
      const skill = await skillMcpManager.getSkill(req.params.name);
      if (!skill) {
        res.status(404).json({ error: `Skill '${req.params.name}' not found.` });
        return;
      }
      res.json({ skill });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/skills/:name', async (req: Request, res: Response) => {
    try {
      const deleted = await skillMcpManager.deleteSkill(req.params.name);
      if (!deleted) {
        res.status(404).json({ error: `Skill '${req.params.name}' not found.` });
        return;
      }
      res.json({ success: true, name: req.params.name });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // MCP Endpoints
  // =========================================================================

  router.get('/mcp', async (_req: Request, res: Response) => {
    try {
      const mcpServers = await skillMcpManager.listMcpServers();
      res.json({ mcpServers });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/mcp/generate', async (req: Request, res: Response) => {
    try {
      const { name, description, tools } = req.body;
      if (!name || !tools || !Array.isArray(tools)) {
        res.status(400).json({ error: 'name and tools array are required.' });
        return;
      }
      const result = await skillMcpManager.generateMcpServer({ name, description, tools });
      res.status(201).json({ mcpServer: result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/mcp/:name', async (req: Request, res: Response) => {
    try {
      const server = await skillMcpManager.getMcpServer(req.params.name);
      if (!server) {
        res.status(404).json({ error: `MCP server '${req.params.name}' not found.` });
        return;
      }
      res.json({ mcpServer: server });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/mcp/:name', async (req: Request, res: Response) => {
    try {
      const deleted = await skillMcpManager.deleteMcpServer(req.params.name);
      if (!deleted) {
        res.status(404).json({ error: `MCP server '${req.params.name}' not found.` });
        return;
      }
      res.json({ success: true, name: req.params.name });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/mcp/test-tool', async (req: Request, res: Response) => {
    try {
      const { serverName, toolName, args, timeoutMs } = req.body;
      if (!serverName || !toolName) {
        res.status(400).json({ error: 'serverName and toolName are required.' });
        return;
      }
      const testResult = await skillMcpManager.testMcpTool(
        serverName,
        toolName,
        args || {},
        timeoutMs || 5000
      );
      res.json({ testResult });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // Vault Catalog Endpoint
  // =========================================================================

  router.get('/vault', async (_req: Request, res: Response) => {
    try {
      const catalog = await skillMcpManager.getVaultCatalog();
      res.json({ vault: catalog });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // Courier Gateway Endpoints (Feature 13)
  // =========================================================================

  router.post('/courier/petition', async (req: Request, res: Response) => {
    try {
      const sender = req.body.sender_agent || req.body.external_agent;
      const prompt = req.body.prompt || req.body.task_description;
      if (!sender || !prompt) {
        res.status(400).json({ error: 'sender_agent (or external_agent) and prompt (or task_description) are required.' });
        return;
      }
      const petition = await courierGateway.submitPetition({
        petition_id: req.body.petition_id,
        sender_agent: sender,
        external_agent: sender,
        prompt,
        task_description: prompt,
        requested_type: req.body.requested_type,
        context_payload: req.body.context_payload || req.body.context,
        context: req.body.context || req.body.context_payload,
        execute_work: req.body.execute_work,
      }, req.body.votes);
      res.status(201).json({ petition });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/courier/petition/:id/review', async (req: Request, res: Response) => {
    try {
      const { votes } = req.body;
      if (!votes || !Array.isArray(votes) || votes.length !== 2) {
        res.status(400).json({ error: 'Exactly two consular votes [vote1, vote2] are required.' });
        return;
      }
      const petition = await courierGateway.reviewPetition(req.params.id, votes as any);
      res.json({ petition });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/courier/wisdom', (req: Request, res: Response) => {
    try {
      const topic = (req.query.topic as string) || 'Swarm Architecture';
      const agent = (req.query.agent as string) || 'external_agent';
      const wisdom = courierGateway.getConsularWisdom(topic, agent);
      res.json({ wisdom });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/courier/status/:id', (req: Request, res: Response) => {
    try {
      const petition = courierGateway.getPetition(req.params.id);
      if (!petition) {
        res.status(404).json({ error: `Petition not found: ${req.params.id}` });
        return;
      }
      res.json({ petition });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/courier/envoys', (_req: Request, res: Response) => {
    try {
      const envoys = courierGateway.getEnvoys();
      res.json({ envoys });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // Consular Question & Answer Endpoints
  // =========================================================================

  router.get('/governance/questions', (_req: Request, res: Response) => {
    try {
      const questions = consularEngine.getQuestions();
      res.json({ questions });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/governance/questions', async (req: Request, res: Response) => {
    try {
      const question = await consularEngine.createQuestion(req.body);
      res.status(201).json({ question });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/governance/questions/:id/answer', async (req: Request, res: Response) => {
    try {
      const question = await consularEngine.answerQuestion(req.params.id, req.body);
      res.json({ question });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // =========================================================================
  // Advanced Swarm Endpoints (Locks, Gladiator, Failover, Checkpoints, Contracts, AFK)
  // =========================================================================

  // Merge-Conflict Shield (.swarm/locks/)
  router.post('/swarm/locks/acquire', async (req: Request, res: Response) => {
    try {
      const { filePath, cubicleId } = req.body;
      if (!filePath || !cubicleId) {
        res.status(400).json({ error: 'filePath and cubicleId are required.' });
        return;
      }
      const result = await consularEngine.acquireLock(filePath, cubicleId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/swarm/locks/release', async (req: Request, res: Response) => {
    try {
      const { filePath, cubicleId } = req.body;
      if (!filePath || !cubicleId) {
        res.status(400).json({ error: 'filePath and cubicleId are required.' });
        return;
      }
      const result = await consularEngine.releaseLock(filePath, cubicleId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/swarm/locks', async (_req: Request, res: Response) => {
    try {
      const locks = await consularEngine.listLocks();
      res.json({ locks });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Gladiator Tournament
  router.post('/governance/gladiator', async (req: Request, res: Response) => {
    try {
      const { taskId, branches } = req.body;
      if (!taskId || !branches || !Array.isArray(branches)) {
        res.status(400).json({ error: 'taskId and branches array are required.' });
        return;
      }
      const result = await consularEngine.evaluateGladiatorContest(taskId, branches);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Failover
  router.post('/swarm/failover', async (req: Request, res: Response) => {
    try {
      const { fromCubicleId, toCubicleId, reason } = req.body;
      if (!fromCubicleId || !toCubicleId) {
        res.status(400).json({ error: 'fromCubicleId and toCubicleId are required.' });
        return;
      }
      const result = await consularEngine.failoverTask(fromCubicleId, toCubicleId, reason);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Git Time-Machine Checkpoints
  router.post('/swarm/checkpoints', async (req: Request, res: Response) => {
    try {
      const { label } = req.body;
      const checkpoint = await consularEngine.createCheckpoint(label || 'Manual Checkpoint');
      res.status(201).json({ checkpoint });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/swarm/checkpoints', async (_req: Request, res: Response) => {
    try {
      const checkpoints = await consularEngine.listCheckpoints();
      res.json({ checkpoints });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/swarm/checkpoints/:id/rollback', async (req: Request, res: Response) => {
    try {
      const result = await consularEngine.rollbackCheckpoint(req.params.id);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Inter-Cubicle Shared Contracts
  router.post('/swarm/contracts', async (req: Request, res: Response) => {
    try {
      const { name, schema, providerCubicle } = req.body;
      if (!name || !schema || !providerCubicle) {
        res.status(400).json({ error: 'name, schema, and providerCubicle are required.' });
        return;
      }
      const contract = await consularEngine.registerContract(name, schema, providerCubicle);
      res.status(201).json({ contract });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/swarm/contracts', async (_req: Request, res: Response) => {
    try {
      const contracts = await consularEngine.listContracts();
      res.json({ contracts });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/swarm/contracts/:name', async (req: Request, res: Response) => {
    try {
      const contract = await consularEngine.getContract(req.params.name);
      if (!contract) {
        res.status(404).json({ error: `Contract not found: ${req.params.name}` });
        return;
      }
      res.json({ contract });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Night-Shift / AFK Mode & Digest
  router.post('/swarm/afk', (req: Request, res: Response) => {
    try {
      const { enabled, tokenCap } = req.body;
      const result = consularEngine.setAfkMode(Boolean(enabled), tokenCap);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/swarm/afk/digest', async (_req: Request, res: Response) => {
    try {
      const digest = await consularEngine.generateBriefingDigest();
      res.json({ digest });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // Mid-Work Consular Intervention Routes
  // =========================================================================

  router.post('/governance/intervention/amend', async (req: Request, res: Response) => {
    try {
      const { taskId, amendedPrompt, votes } = req.body;
      if (!taskId || !amendedPrompt) {
        res.status(400).json({ error: 'taskId and amendedPrompt are required' });
        return;
      }
      const result = await consularEngine.amendTaskPrompt(taskId, amendedPrompt, votes);
      res.json({ ...result, intervention: result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/governance/intervention/evict', async (req: Request, res: Response) => {
    try {
      const { fromCubicleId, toCubicleId, reason, votes } = req.body;
      if (!fromCubicleId || !toCubicleId) {
        res.status(400).json({ error: 'fromCubicleId and toCubicleId are required' });
        return;
      }
      const result = await consularEngine.evictAndReplaceWorker(fromCubicleId, toCubicleId, reason || 'Worker stalled', votes);
      res.json({ ...result, intervention: result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/governance/intervention/split', async (req: Request, res: Response) => {
    try {
      const { taskId, splits, votes } = req.body;
      if (!taskId || !splits || !Array.isArray(splits)) {
        res.status(400).json({ error: 'taskId and splits array are required' });
        return;
      }
      const result = await consularEngine.splitTask(taskId, splits, votes);
      res.json({ ...result, intervention: result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/governance/intervention/rebalance', async (req: Request, res: Response) => {
    try {
      const { rebalancePlan, votes } = req.body;
      const result = await consularEngine.rebalanceTaskboard(rebalancePlan, votes);
      res.json({ ...result, intervention: result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/governance/intervention/impatience', async (req: Request, res: Response) => {
    try {
      const { taskId, cubicleId, reason } = req.body;
      const result = await consularEngine.triggerNiaImpatience(taskId, cubicleId, reason);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // Consular Avatar State Endpoints
  // =========================================================================

  router.get('/governance/avatar-state', (_req: Request, res: Response) => {
    try {
      const avatarState = consularEngine.getAvatarState();
      res.json({ avatarState, ...avatarState });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/governance/avatar-state', (req: Request, res: Response) => {
    try {
      const { state, debate_turns, details } = req.body;
      if (!state) {
        res.status(400).json({ error: 'state is required' });
        return;
      }
      const avatarState = consularEngine.setAvatarState(state, debate_turns, details);
      res.json({ avatarState, ...avatarState });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
