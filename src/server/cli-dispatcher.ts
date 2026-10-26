/**
 * src/server/cli-dispatcher.ts
 *
 * Command-Line Interface Dispatcher for SymlinkedAgentSwarm.exe & Node Host.
 * Handles subcommands:
 *  - start [--port <p>] [--headless] [--workspace <w>] (default daemon)
 *  - courier submit --agent <name> "<task>" [--type <WISDOM|POWER|BOTH>]
 *  - courier status <petition_id>
 *  - courier envoys
 *  - courier wisdom --topic "<topic>" [--agent <name>]
 *  - status | grid status
 *  - version | -v | --version
 *  - help | -h | --help
 */

import path from 'node:path';
import fs from 'node:fs';
import { CourierGateway } from './courier-gateway.js';
import { ConsularEngine } from './consular-engine.js';
import { CubicleManager } from './cubicle-manager.js';
import { TaskboardManager } from './taskboard-manager.js';
import { CapabilityMatrix } from './capability-matrix.js';

export interface ParsedCliArgs {
  command:
    | 'start'
    | 'courier_submit'
    | 'courier_status'
    | 'courier_envoys'
    | 'courier_wisdom'
    | 'courier_afk'
    | 'status'
    | 'version'
    | 'help';
  port: number;
  headless: boolean;
  workspace: string;
  agent?: string;
  prompt?: string;
  requestedType?: 'WISDOM' | 'POWER' | 'BOTH';
  petitionId?: string;
  topic?: string;
}

export interface CliExecutionOptions {
  exitOnComplete?: boolean;
  onLog?: (line: string) => void;
}

export interface CliExecutionResult {
  handled: boolean;
  exitCode: number;
  output: string[];
  data?: any;
}

/**
 * Parses command-line arguments into structured CLI options.
 */
export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const args = argv.slice(2);
  const result: ParsedCliArgs = {
    command: 'start',
    port: Number(process.env.PORT || 3820),
    headless: false,
    workspace: process.cwd(),
  };

  if (args.length === 0) {
    return result;
  }

  const first = args[0].toLowerCase();

  if (first === 'version' || first === '-v' || first === '--version') {
    result.command = 'version';
    return result;
  }

  if (first === 'help' || first === '-h' || first === '--help') {
    result.command = 'help';
    return result;
  }

  if (first === 'status' || (first === 'grid' && args[1]?.toLowerCase() === 'status')) {
    result.command = 'status';
    const startIndex = first === 'status' ? 1 : 2;
    for (let i = startIndex; i < args.length; i++) {
      if ((args[i] === '--workspace' || args[i] === '-w') && args[i + 1]) {
        result.workspace = path.resolve(args[++i]);
      }
    }
    return result;
  }

  if (first === 'courier') {
    const sub = args[1]?.toLowerCase();
    if (sub === 'submit' || sub === 'petition' || sub === 'dispatch') {
      // If sub === 'petition' with an existing petition ID argument (no --), route to courier_status
      if (sub === 'petition' && args[2] && !args[2].startsWith('--')) {
        let ws = result.workspace;
        for (let i = 2; i < args.length; i++) {
          if ((args[i] === '--workspace' || args[i] === '-w') && args[i + 1]) {
            ws = path.resolve(args[i + 1]);
          }
        }
        const candidatePetPath = path.join(ws, '.swarm', 'courier', 'petitions', `${args[2]}.json`);
        if (
          fs.existsSync(candidatePetPath) ||
          args[2].startsWith('pet-') ||
          args[2].startsWith('courier-pet-') ||
          (args.length === 3 && !args[2].includes(' '))
        ) {
          result.command = 'courier_status';
          result.petitionId = args[2];
          result.workspace = ws;
          return result;
        }
      }

      result.command = 'courier_submit';
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--agent' && args[i + 1]) {
          result.agent = args[++i];
        } else if (args[i] === '--type' && args[i + 1]) {
          result.requestedType = args[++i].toUpperCase() as any;
        } else if ((args[i] === '--prompt' || args[i] === '-p') && args[i + 1]) {
          result.prompt = args[++i];
        } else if ((args[i] === '--workspace' || args[i] === '-w') && args[i + 1]) {
          result.workspace = path.resolve(args[++i]);
        } else if (!result.prompt && !args[i].startsWith('-')) {
          result.prompt = args[i];
        }
      }
      return result;
    } else if (sub === 'status' || sub === 'review') {
      result.command = 'courier_status';
      for (let i = 2; i < args.length; i++) {
        if ((args[i] === '--workspace' || args[i] === '-w') && args[i + 1]) {
          result.workspace = path.resolve(args[++i]);
        } else if (!result.petitionId && !args[i].startsWith('--')) {
          result.petitionId = args[i];
        }
      }
      return result;
    } else if (sub === 'afk') {
      result.command = 'courier_afk';
      for (let i = 2; i < args.length; i++) {
        if ((args[i] === '--workspace' || args[i] === '-w') && args[i + 1]) {
          result.workspace = path.resolve(args[++i]);
        }
      }
      return result;
    } else if (sub === 'envoys') {
      result.command = 'courier_envoys';
      return result;
    } else if (sub === 'wisdom') {
      result.command = 'courier_wisdom';
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--topic' && args[i + 1]) {
          result.topic = args[++i];
        } else if (args[i] === '--agent' && args[i + 1]) {
          result.agent = args[++i];
        } else if ((args[i] === '--workspace' || args[i] === '-w') && args[i + 1]) {
          result.workspace = path.resolve(args[++i]);
        }
      }
      return result;
    }
  }

  // Parse server flags (start or default)
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--headless') {
      result.headless = true;
    } else if ((args[i] === '--port' || args[i] === '-p') && args[i + 1]) {
      result.port = parseInt(args[++i], 10);
    } else if ((args[i] === '--workspace' || args[i] === '-w') && args[i + 1]) {
      result.workspace = path.resolve(args[++i]);
    }
  }

  return result;
}

/**
 * Executes a parsed CLI command. Returns CliExecutionResult.
 * If exitOnComplete is true (default for standalone binary), terminates process with appropriate exit code.
 */
export async function executeCliCommand(
  parsed: ParsedCliArgs,
  options: CliExecutionOptions = {}
): Promise<CliExecutionResult> {
  const exitOnComplete = options.exitOnComplete ?? (process.env.NODE_ENV !== 'test');
  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(msg);
    if (options.onLog) {
      options.onLog(msg);
    } else {
      console.log(msg);
    }
  };
  const errLog = (msg: string) => {
    logs.push(`[ERROR] ${msg}`);
    if (options.onLog) {
      options.onLog(`[ERROR] ${msg}`);
    } else {
      console.error(msg);
    }
  };

  const projectRoot = parsed.workspace || process.cwd();
  const swarmDir = path.join(projectRoot, '.swarm');
  const agentsDir = path.join(projectRoot, '.agents');

  switch (parsed.command) {
    case 'version': {
      log('Symlinked Agent Swarm v1.0.0 [Panopticon Dual-Consul Matrix]');
      log(`Runtime: Node.js ${process.version} (${process.platform}-${process.arch})`);
      if (exitOnComplete) process.exit(0);
      return { handled: true, exitCode: 0, output: logs };
    }

    case 'help': {
      const helpText = getHelpManualText();
      log(helpText);
      if (exitOnComplete) process.exit(0);
      return { handled: true, exitCode: 0, output: logs };
    }

    case 'status': {
      const rosterFile = path.join(swarmDir, 'roster.json');
      const cubiclesFile = path.join(swarmDir, 'status', 'cubicles.json');
      let list: any[] = [];

      if (fs.existsSync(rosterFile)) {
        try {
          const raw = fs.readFileSync(rosterFile, 'utf8');
          const roster = JSON.parse(raw);
          list = roster.map((cfg: any) => {
            const statusFile = path.join(swarmDir, 'status', `${cfg.id}.json`);
            let status = cfg.enabled ? 'idle' : 'vacant';
            let fatigue = 0;
            if (fs.existsSync(statusFile)) {
              try {
                const s = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
                status = s.status || status;
                fatigue = s.fatigue_percentage ?? s.fatigue_percent ?? 0;
              } catch {}
            }
            const modelDisplay = cfg.enabled
              ? (cfg.display_name || cfg.model || 'unassigned')
              : 'unassigned';
            const tierDisplay = cfg.enabled ? (cfg.thinking_level || 'Low') : 'Low';
            return {
              id: cfg.id,
              slot_index: cfg.slot_index,
              assigned: cfg.enabled,
              model: modelDisplay,
              tier: tierDisplay,
              thinking_tier: tierDisplay,
              state: status,
              status: status,
              fatigue_percent: fatigue,
              fatigue_percentage: fatigue,
            };
          });
        } catch (err: any) {
          errLog(`Failed to parse roster.json: ${err.message}`);
          if (exitOnComplete) process.exit(1);
          return { handled: true, exitCode: 1, output: logs };
        }
      } else if (fs.existsSync(cubiclesFile)) {
        try {
          const raw = fs.readFileSync(cubiclesFile, 'utf8');
          const parsed = JSON.parse(raw);
          list = parsed.map((c: any) => ({
            id: c.id,
            slot_index: c.slot_index ?? c.config?.slot_index,
            assigned: c.assigned ?? c.config?.enabled ?? false,
            model: c.model ?? c.config?.model ?? 'unassigned',
            tier: c.thinking_tier ?? c.tier ?? c.config?.thinking_level ?? 'Low',
            thinking_tier: c.thinking_tier ?? c.tier ?? c.config?.thinking_level ?? 'Low',
            state: c.state ?? c.status ?? (c.assigned ? 'idle' : 'vacant'),
            status: c.status ?? c.state ?? (c.assigned ? 'idle' : 'vacant'),
            fatigue_percent: c.fatigue_percent ?? c.fatigue_percentage ?? 0,
            fatigue_percentage: c.fatigue_percentage ?? c.fatigue_percent ?? 0,
          }));
        } catch (err: any) {
          errLog(`Failed to parse cubicles.json: ${err.message}`);
          if (exitOnComplete) process.exit(1);
          return { handled: true, exitCode: 1, output: logs };
        }
      } else {
        try {
          const statusDir = path.join(swarmDir, 'status');
          if (fs.existsSync(statusDir)) {
            const statusFiles = fs.readdirSync(statusDir).filter((f) => f.startsWith('cubicle-') && f.endsWith('.json'));
            if (statusFiles.length > 0) {
              const cm = new CubicleManager(swarmDir);
              await cm.initialize();
              list = cm.getAllCubicles().map((c) => ({
                id: c.id,
                slot_index: c.config.slot_index,
                assigned: c.config.enabled,
                model: c.config.model || 'unassigned',
                tier: c.config.thinking_level || 'Low',
                thinking_tier: c.config.thinking_level || 'Low',
                state: c.status,
                status: c.status,
                fatigue_percent: c.fatigue_percentage,
                fatigue_percentage: c.fatigue_percentage,
              }));
            }
          }
        } catch {}
      }

      if (list.length > 0) {
        log('\n========================================================================================');
        log(' PANOPTICON 4x4 CUBICLE SURVEILLANCE ROSTER MATRIX                                      ');
        log('========================================================================================');
        // Render 4x4 spatial matrix grid
        for (let row = 0; row < 4; row++) {
          const rowItems = list.slice(row * 4, row * 4 + 4);
          if (rowItems.length > 0) {
            const rowStr = rowItems
              .map((c) => `[${c.id}: ${c.state || c.status || 'vacant'}]`.padEnd(21))
              .join(' ');
            log(rowStr);
          }
        }
        log('----------------------------------------------------------------------------------------');
        log('ID         | ASSIGNED | MODEL                         | TIER      | STATE            | FATIGUE');
        log('-----------+----------+-------------------------------+-----------+------------------+--------');
        for (const c of list) {
          const id = (c.id || '').padEnd(10);
          const assigned = ((c.assigned || c.config?.enabled) ? 'YES' : 'NO').padEnd(8);
          const model = (c.model || c.config?.model || 'unassigned').padEnd(29);
          const tier = (c.tier || c.thinking_tier || c.config?.thinking_level || 'Low').padEnd(9);
          const state = (c.state || c.status || 'Relaxed/Idle').padEnd(16);
          const fatigue = `${c.fatigue_percent ?? c.fatigue_percentage ?? 0}%`.padStart(6);
          log(`${id} | ${assigned} | ${model} | ${tier} | ${state} | ${fatigue}`);
        }
        log('========================================================================================\n');
        if (exitOnComplete) process.exit(0);
        return { handled: true, exitCode: 0, output: logs, data: list };
      } else {
        log('[PANOPTICON] Swarm is offline or uninitialized (.swarm/roster.json not found).');
        if (exitOnComplete) process.exit(0);
        return { handled: true, exitCode: 0, output: logs };
      }
    }

    case 'courier_envoys': {
      const cubicleManager = new CubicleManager(swarmDir);
      const taskboardManager = new TaskboardManager(swarmDir);
      const capabilityMatrix = new CapabilityMatrix();
      const consularEngine = new ConsularEngine(
        swarmDir,
        cubicleManager,
        taskboardManager,
        capabilityMatrix,
        undefined,
        projectRoot
      );
      const courierGateway = new CourierGateway(swarmDir, consularEngine, taskboardManager, agentsDir);
      await courierGateway.initialize();

      const envoys = courierGateway.getEnvoys();
      log('\n====================================================================');
      log(' PANOPTICON COURIER GATEWAY // REGISTERED EXTERNAL AGENT ENVOYS      ');
      log('====================================================================');
      for (const e of envoys) {
        log(`- Envoy Agent:  ${(e.agent || '').toUpperCase()}`);
        log(`  Name:         ${e.name}`);
        log(`  Status:       ${e.status}`);
        log(`  Connector:    ${e.connectorPath}\n`);
      }
      if (exitOnComplete) process.exit(0);
      return { handled: true, exitCode: 0, output: logs, data: envoys };
    }

    case 'courier_wisdom': {
      const topic = parsed.topic || 'Swarm Architecture';
      const agent = parsed.agent || 'openclaw';
      const cubicleManager = new CubicleManager(swarmDir);
      const taskboardManager = new TaskboardManager(swarmDir);
      const capabilityMatrix = new CapabilityMatrix();
      const consularEngine = new ConsularEngine(
        swarmDir,
        cubicleManager,
        taskboardManager,
        capabilityMatrix,
        undefined,
        projectRoot
      );
      const courierGateway = new CourierGateway(swarmDir, consularEngine, taskboardManager, agentsDir);
      await courierGateway.initialize();

      const wisdom = courierGateway.getConsularWisdom(topic, agent);
      log('\n====================================================================');
      log(` CONSULAR WISDOM RATIFIED FOR ${agent.toUpperCase()}: ${topic}       `);
      log('====================================================================');
      log(`Guidance: ${wisdom.guidance}\n`);
      log('Consular Plan:');
      wisdom.plan.forEach((step: string) => log(`  ${step}`));
      log(`\nRatified By: Consul Nia Nova & Consul Ferric Lunaux (${wisdom.approved_by.join(' & ')})`);
      log('====================================================================\n');
      if (exitOnComplete) process.exit(0);
      return { handled: true, exitCode: 0, output: logs, data: wisdom };
    }

    case 'courier_submit': {
      if (!parsed.prompt || !parsed.prompt.trim()) {
        errLog('Error: task prompt is required. Usage: SymlinkedAgentSwarm.exe courier submit --agent <name> "<task>"');
        if (exitOnComplete) process.exit(1);
        return { handled: true, exitCode: 1, output: logs };
      }
      const agent = parsed.agent || 'openclaw';
      const prompt = parsed.prompt.trim();
      const requestedType = parsed.requestedType || 'BOTH';

      log('\n====================================================================');
      log(' PANOPTICON COURIER GATEWAY // PETITION SUBMISSION                  ');
      log('====================================================================');
      log(`Sender:         ${agent.toUpperCase()}`);
      log(`Requested Type: ${requestedType}`);
      log(`Prompt:         "${prompt}"`);
      log('--------------------------------------------------------------------');

      const cubicleManager = new CubicleManager(swarmDir);
      const taskboardManager = new TaskboardManager(swarmDir);
      const capabilityMatrix = new CapabilityMatrix();
      const consularEngine = new ConsularEngine(
        swarmDir,
        cubicleManager,
        taskboardManager,
        capabilityMatrix,
        undefined,
        projectRoot
      );
      const courierGateway = new CourierGateway(swarmDir, consularEngine, taskboardManager, agentsDir);

      await cubicleManager.initialize();
      await taskboardManager.initialize();
      await consularEngine.initialize();
      await courierGateway.initialize();

      const petition = await courierGateway.submitPetition({
        sender_agent: agent,
        prompt: prompt,
        requested_type: requestedType,
        execute_work: true,
      });

      log(`Petition ID:    ${petition.petition_id || petition.id}`);
      log(`Status:         ${petition.status}`);

      if (petition.consular_wisdom) {
        log('\n[CONSULAR WISDOM]:');
        log(`  Guidance:     ${petition.consular_wisdom.guidance}`);
      }

      if (petition.swarm_task_id) {
        log(`\n[SWARM EXECUTION]: Task ${petition.swarm_task_id} processed by cubicle swarm.`);
      }

      const isApproved = petition.status === 'SEALED' || !!petition.consular_seal;
      if (isApproved && petition.consular_seal) {
        log('\n[CONSULAR VERDICT]: UNANIMOUS 2/2 CONSULAR RATIFICATION');
        log(`  Ratified By:  ${petition.consular_seal.approved_by.join(' & ')}`);
        log(`  Deliverable:  ${petition.sealed_deliverable?.artifacts?.join(', ') || 'sealed_artifact.json'}`);
        log('====================================================================\n');
        if (exitOnComplete) process.exit(0);
        return { handled: true, exitCode: 0, output: logs, data: petition };
      } else {
        log(`\n[CONSULAR VERDICT]: VETOED / BLOCKED (${petition.veto_rationale || 'Intercessio Veto'})`);
        log('====================================================================\n');
        if (exitOnComplete) process.exit(1);
        return { handled: true, exitCode: 1, output: logs, data: petition };
      }
    }

    case 'courier_status': {
      if (!parsed.petitionId) {
        errLog('Error: petition_id is required. Usage: SymlinkedAgentSwarm.exe courier status <petition_id>');
        if (exitOnComplete) process.exit(1);
        return { handled: true, exitCode: 1, output: logs };
      }
      const petPath = path.join(swarmDir, 'courier', 'petitions', `${parsed.petitionId}.json`);
      if (fs.existsSync(petPath)) {
        const pet = JSON.parse(fs.readFileSync(petPath, 'utf8'));
        log('\n====================================================================');
        log(` COURIER PETITION STATUS: ${parsed.petitionId}                     `);
        log('====================================================================');
        log(`Sender:       ${pet.sender_agent || pet.external_agent}`);
        log(`Status:       ${pet.status}`);
        log(`Prompt:       ${pet.prompt || pet.task_description}`);
        log(`Created:      ${pet.created_at}`);
        if (pet.consular_seal) {
          log(`Consular Seal: RATIFIED (${pet.consular_seal.approved_by?.join(' & ')})`);
        }
        if (pet.veto_rationale) {
          log(`Veto Reason:   ${pet.veto_rationale}`);
        }
        log('====================================================================\n');
        if (exitOnComplete) process.exit(0);
        return { handled: true, exitCode: 0, output: logs, data: pet };
      } else {
        log(`[COURIER] Petition not found: ${parsed.petitionId}`);
        if (exitOnComplete) process.exit(0);
        return { handled: true, exitCode: 0, output: logs };
      }
    }

    case 'courier_afk': {
      log('\n====================================================================');
      log(' PANOPTICON NIGHT-SHIFT // AFK AUTONOMOUS COURIER STATUS             ');
      log('====================================================================');
      const afkStateFile = path.join(swarmDir, 'memory', 'afk_state.json');
      const digestFile = path.join(swarmDir, 'logs', 'consular_digest.json');
      let afkActive = false;
      let niaAutonomous = false;
      if (fs.existsSync(afkStateFile)) {
        try {
          const afk = JSON.parse(fs.readFileSync(afkStateFile, 'utf8'));
          afkActive = !!(afk.enabled || afk.afk_mode);
          niaAutonomous = !!(afk.auto_answer_preferences || afk.autonomous_nia);
          log(`AFK Mode:       ${afkActive ? 'ENABLED' : 'DISABLED'}`);
          log(`Autonomous Nia: ${niaAutonomous ? 'ACTIVE' : 'STANDBY'}`);
        } catch {
          log('AFK Mode:       DISABLED (Default)');
          log('Autonomous Nia: STANDBY');
        }
      } else {
        log('AFK Mode:       DISABLED (Default)');
        log('Autonomous Nia: STANDBY');
      }
      if (fs.existsSync(digestFile)) {
        try {
          const digest = JSON.parse(fs.readFileSync(digestFile, 'utf8'));
          log(`Digest Summary: ${digest.summary || 'All tasks processed cleanly.'}`);
        } catch {
          log('Digest Summary: All tasks processed cleanly.');
        }
      } else {
        log('Digest Summary: All tasks processed cleanly.');
      }
      log('====================================================================\n');
      if (exitOnComplete) process.exit(0);
      return { handled: true, exitCode: 0, output: logs, data: { afk_mode: afkActive, autonomous_nia: niaAutonomous } };
    }

    case 'start':
    default:
      // Return handled: false to signal that the daemon HTTP/WS server should proceed to start!
      return { handled: false, exitCode: 0, output: logs };
  }
}

export function getHelpManualText(): string {
  return `
SYMLINKED AGENT SWARM // PANOPTICON CLI USAGE MANUAL
====================================================
Usage:
  SymlinkedAgentSwarm.exe [command] [options]

Commands:
  (default) / start       Launches Panopticon Web Server & WebSocket Orchestrator
  courier submit          Submits task petition to Dual-Consuls (Nia & Ferric)
  courier petition        Submits petition or queries petition status by ID
  courier dispatch        Dispatches task petition prompt to cubicle swarm
  courier status <id>     Queries status of a submitted Courier petition
  courier review <id>     Inspects Consular review & seal of a petition
  courier afk             Displays Night-Shift / AFK status and digest summary
  courier envoys          Lists registered external agent connectors (OpenClaw, Hermes, GPT Dot)
  courier wisdom          Requests strategic Consular Wisdom & plan
  status | grid status    Displays current 16-cubicle grid status table
  version                 Prints version telemetry
  help                    Prints this help guide

Daemon Options (for start):
  --port, -p <number>     Server port (default: 3820)
  --headless              Run without auto-opening web browser
  --workspace, -w <path>  Target repository workspace directory (default: current directory)

Courier Submit / Petition / Dispatch Options:
  --agent <name>          External agent name (e.g. openclaw, hermes, gpt-dot)
  --type <type>           Petition type: WISDOM, POWER, or BOTH (default: BOTH)
  --prompt, -p "<task>"   Task description string
  --workspace, -w <path>  Target workspace directory
  "<task>"                Task description string
`;
}
