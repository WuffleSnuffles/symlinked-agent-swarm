/**
 * src/public/js/overseer-console.js
 *
 * Dual-Consul Command Terminal, Inter-Consul Dialogue Stream,
 * Swarm Radar Tabs (Locks, Gladiator, Checkpoints, AFK), and Vault Catalog.
 */

import { getPromptAttachments } from './prompt-attachment.js';
import { getMediaRenderer } from './media-renderer.js';
import { getConsularAvatars } from './consular-avatars.js';

export class OverseerConsoleController {
  constructor(app) {
    this.app = app;
    this.dialogueFeed = document.getElementById('consular-dialogue-feed');
    this.incidentTicker = document.getElementById('incident-alert-ticker');
    this.promptInput = document.getElementById('overseer-prompt-input');
    this.btnSubmit = document.getElementById('btn-submit-directive');

    // Gate Indicators
    this.gate1Status = document.getElementById('gate1-status');
    this.gate2Status = document.getElementById('gate2-status');
    this.incidentCounter = document.getElementById('incident-counter-badge');

    // Navigation Tabs
    this.tabBtnConsole = document.getElementById('tab-btn-console');
    this.tabBtnRadar = document.getElementById('tab-btn-radar');
    this.tabBtnVault = document.getElementById('tab-btn-vault');

    this.viewConsole = document.getElementById('view-console');
    this.viewRadar = document.getElementById('view-radar');
    this.viewVault = document.getElementById('view-vault');

    // Radar Sub-tabs
    this.radarSubtabLocks = document.getElementById('radar-subtab-locks');
    this.radarSubtabGladiator = document.getElementById('radar-subtab-gladiator');
    this.radarSubtabCheckpoints = document.getElementById('radar-subtab-checkpoints');
    this.radarSubtabAfk = document.getElementById('radar-subtab-afk');
    this.radarContentArea = document.getElementById('radar-content-area');

    this.currentRadarTab = 'locks';
    this.radarData = { locks: [], checkpoints: [], afk: false };
    this.renderedMessageIds = new Set();

    this.bindEvents();
  }

  bindEvents() {
    // Top Tabs
    if (this.tabBtnConsole) {
      this.tabBtnConsole.addEventListener('click', () => this.switchTab('console'));
    }
    if (this.tabBtnRadar) {
      this.tabBtnRadar.addEventListener('click', () => this.switchTab('radar'));
    }
    if (this.tabBtnVault) {
      this.tabBtnVault.addEventListener('click', () => this.switchTab('vault'));
    }

    // Radar Sub-tabs
    if (this.radarSubtabLocks) {
      this.radarSubtabLocks.addEventListener('click', () => this.switchRadarSubtab('locks'));
    }
    if (this.radarSubtabGladiator) {
      this.radarSubtabGladiator.addEventListener('click', () => this.switchRadarSubtab('gladiator'));
    }
    if (this.radarSubtabCheckpoints) {
      this.radarSubtabCheckpoints.addEventListener('click', () => this.switchRadarSubtab('checkpoints'));
    }
    if (this.radarSubtabAfk) {
      this.radarSubtabAfk.addEventListener('click', () => this.switchRadarSubtab('afk'));
    }

    // Submit Prompt Directive
    if (this.btnSubmit) {
      this.btnSubmit.addEventListener('click', () => this.submitDirective());
    }
    if (this.promptInput) {
      this.promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.submitDirective();
        }
      });
    }
  }

  switchTab(tabName) {
    [this.tabBtnConsole, this.tabBtnRadar, this.tabBtnVault].forEach((btn) => btn?.classList.remove('btn-active'));
    [this.viewConsole, this.viewRadar, this.viewVault].forEach((view) => {
      if (view) view.style.display = 'none';
    });

    if (tabName === 'console') {
      this.tabBtnConsole?.classList.add('btn-active');
      if (this.viewConsole) this.viewConsole.style.display = 'flex';
    } else if (tabName === 'radar') {
      this.tabBtnRadar?.classList.add('btn-active');
      if (this.viewRadar) this.viewRadar.style.display = 'flex';
      this.refreshRadarView();
    } else if (tabName === 'vault') {
      this.tabBtnVault?.classList.add('btn-active');
      if (this.viewVault) this.viewVault.style.display = 'flex';
      this.refreshVaultView();
    }
  }

  switchRadarSubtab(subtab) {
    this.currentRadarTab = subtab;
    [this.radarSubtabLocks, this.radarSubtabGladiator, this.radarSubtabCheckpoints, this.radarSubtabAfk].forEach((btn) => {
      btn?.classList.remove('btn-active');
    });

    if (subtab === 'locks') this.radarSubtabLocks?.classList.add('btn-active');
    if (subtab === 'gladiator') this.radarSubtabGladiator?.classList.add('btn-active');
    if (subtab === 'checkpoints') this.radarSubtabCheckpoints?.classList.add('btn-active');
    if (subtab === 'afk') this.radarSubtabAfk?.classList.add('btn-active');

    this.refreshRadarView();
  }

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  appendDialogueMessage(msg) {
    if (!this.dialogueFeed || !msg) return;

    if (msg.id && this.renderedMessageIds.has(msg.id)) {
      return;
    }
    if (msg.id) {
      this.renderedMessageIds.add(msg.id);
    }

    const senderStr = String(msg.sender || '');
    const isUser =
      senderStr === 'Overseer' ||
      senderStr === 'User' ||
      msg.tone === 'user_directive';
    const isNia = !isUser && (senderStr.includes('Nia') || senderStr === 'Consul I');

    // If a persisted user message arrives, remove any temporary optimistic user bubble for the same text
    if (isUser && !msg._optimistic) {
      const optBubbles = this.dialogueFeed.querySelectorAll('.optimistic-user-bubble');
      optBubbles.forEach((b) => b.remove());
    }

    let senderColor = 'var(--color-amber)';
    let senderName = 'CONSUL II // FERRIC LUNAUX [GPT ASTRA]';
    let alignStyle = 'border-left: 3px solid var(--color-amber);';
    let bgStyle = '#0f121b';

    if (isUser) {
      senderColor = 'var(--color-phosphor)';
      senderName = 'YOU // OVERSEER';
      alignStyle = 'border-right: 3px solid var(--color-phosphor); margin-left: 24px;';
      bgStyle = '#0b1612';
    } else if (isNia) {
      senderColor = 'var(--color-cyan)';
      senderName = 'CONSUL I // NIA NOVA [GEMINI 4 ARGON]';
      alignStyle = 'border-left: 3px solid var(--color-cyan);';
    }

    const row = document.createElement('div');
    row.className = `dialogue-message-bubble${msg._optimistic ? ' optimistic-user-bubble' : ''}`;
    row.style.cssText = `background: ${bgStyle}; border: 1px solid var(--border-color); ${alignStyle} padding: 8px 10px; margin-bottom: 6px; font-size: 11px;`;

    const formattedContent = this.escapeHtml(msg.content).replace(/\n/g, '<br/>');

    row.innerHTML = `
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span style="font-weight: 700; color: ${senderColor};">${senderName}</span>
        <span style="font-size: 9px; color: var(--color-text-dim);">${new Date(msg.timestamp || Date.now()).toLocaleTimeString()}</span>
      </div>
      <div style="color: var(--color-text-bright); line-height: 1.45;">${formattedContent}</div>
    `;

    // If message includes multimodal attachments
    if (msg.attachments && Array.isArray(msg.attachments)) {
      const mediaRenderer = getMediaRenderer();
      if (mediaRenderer) {
        msg.attachments.forEach((att) => {
          const card = mediaRenderer.renderMediaCard(att);
          row.appendChild(card);
        });
      }
    }

    // Keep any active CLI thinking indicator at the very bottom of the feed
    const thinkingEl = this.dialogueFeed.querySelector('.consul-cli-thinking');
    if (thinkingEl) {
      this.dialogueFeed.insertBefore(row, thinkingEl);
    } else {
      this.dialogueFeed.appendChild(row);
    }
    this.dialogueFeed.scrollTop = this.dialogueFeed.scrollHeight;

    // Trigger corner avatar speech ticker for Consuls
    if (!isUser) {
      const avatars = getConsularAvatars();
      if (avatars) {
        avatars.displaySpeech(isNia ? 'Nia' : 'Ferric', msg.content);
      }
    }
  }

  showIncidentAlert(text) {
    if (!this.incidentTicker) return;
    this.incidentTicker.style.display = 'block';
    this.incidentTicker.textContent = `[INCIDENT ALERT] ${text}`;
    setTimeout(() => {
      if (this.incidentTicker) this.incidentTicker.style.display = 'none';
    }, 6000);
  }

  async submitDirective() {
    if (!this.promptInput) return;
    const goalText = this.promptInput.value.trim();
    if (!goalText) return;

    const attachmentMgr = getPromptAttachments();
    const attachments = attachmentMgr ? attachmentMgr.getStagedAttachments() : [];

    this.promptInput.value = '';
    if (attachmentMgr) attachmentMgr.clearAttachments();

    // 1. Immediately render optimistic user message in the chat history feed
    this.appendDialogueMessage({
      _optimistic: true,
      sender: 'Overseer',
      tone: 'user_directive',
      content: goalText,
      timestamp: new Date().toISOString(),
      attachments,
    });

    // 2. Show live CLI deliberation indicator
    let thinkingRow = null;
    if (this.dialogueFeed) {
      thinkingRow = document.createElement('div');
      thinkingRow.className = 'consul-cli-thinking';
      thinkingRow.style.cssText =
        'background: #101420; border: 1px dashed var(--color-cyan); padding: 6px 10px; margin-bottom: 6px; font-size: 10px; color: var(--color-cyan); letter-spacing: 0.04em;';
      thinkingRow.textContent =
        '⚡ NIA (GEMINI 4 ARGON // agy.exe) & FERRIC (GPT ASTRA // codex.exe) DELIBERATING...';
      this.dialogueFeed.appendChild(thinkingRow);
      this.dialogueFeed.scrollTop = this.dialogueFeed.scrollHeight;
    }

    // 3. Post to live Consul CLI chat endpoint
    try {
      const res = await fetch('/api/governance/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: goalText,
          attachments,
        }),
      });

      if (thinkingRow) thinkingRow.remove();

      if (res.ok) {
        const data = await res.json();
        if (data.userMessage) {
          this.appendDialogueMessage(data.userMessage);
        }
        if (data.replies && Array.isArray(data.replies)) {
          data.replies.forEach((msg) => this.appendDialogueMessage(msg));
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        this.showIncidentAlert(`Directive rejected: ${errData.error || res.statusText}`);
      }
    } catch (err) {
      if (thinkingRow) thinkingRow.remove();
      this.showIncidentAlert(`Failed to transmit directive: ${err.message}`);
    }
  }

  // Radar Views
  async refreshRadarView() {
    if (!this.radarContentArea) return;

    if (this.currentRadarTab === 'locks') {
      this.radarContentArea.innerHTML = '<div>Loading active locks...</div>';
      try {
        const res = await fetch('/api/swarm/locks');
        const data = await res.json();
        const locks = data.locks || [];

        if (locks.length === 0) {
          this.radarContentArea.innerHTML = '<div style="color: var(--color-phosphor);">No active file locks. Merge-Conflict Shield: ALL CLEAR.</div>';
          return;
        }

        let html = '<table style="width: 100%; border-collapse: collapse; font-size: 11px;">';
        html += '<tr style="border-bottom: 1px solid var(--border-color); text-align: left;"><th>FILE PATH</th><th>OWNER</th><th>ACQUIRED</th></tr>';
        locks.forEach((l) => {
          html += `<tr><td>${l.filePath}</td><td>${l.cubicleId}</td><td>${new Date(l.acquiredAt).toLocaleTimeString()}</td></tr>`;
        });
        html += '</table>';
        this.radarContentArea.innerHTML = html;
      } catch (err) {
        this.radarContentArea.innerHTML = `<div>Error: ${err.message}</div>`;
      }
    } else if (this.currentRadarTab === 'checkpoints') {
      this.radarContentArea.innerHTML = '<div>Loading Time-Machine checkpoints...</div>';
      try {
        const res = await fetch('/api/swarm/checkpoints');
        const data = await res.json();
        const cps = data.checkpoints || [];

        if (cps.length === 0) {
          this.radarContentArea.innerHTML = '<div style="color: var(--color-text-dim);">No snapshot checkpoints recorded yet.</div>';
          return;
        }

        let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
        cps.forEach((cp) => {
          html += `
            <div style="background: #11141e; border: 1px solid var(--border-color); padding: 8px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <strong>${cp.label || 'Checkpoint'}</strong> [${cp.id}]<br/>
                <span style="font-size: 9px; color: var(--color-text-dim);">Commit: ${cp.git_commit || 'HEAD'} | Tasks: ${cp.task_count || 0}</span>
              </div>
              <button type="button" class="brutalist-btn btn-rollback" data-id="${cp.id}">1-CLICK ROLLBACK</button>
            </div>
          `;
        });
        html += '</div>';
        this.radarContentArea.innerHTML = html;

        this.radarContentArea.querySelectorAll('.btn-rollback').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            await fetch(`/api/swarm/checkpoints/${id}/rollback`, { method: 'POST' });
            this.refreshRadarView();
          });
        });
      } catch (err) {
        this.radarContentArea.innerHTML = `<div>Error: ${err.message}</div>`;
      }
    } else if (this.currentRadarTab === 'afk') {
      try {
        const res = await fetch('/api/swarm/afk/digest');
        const data = await res.json();
        const digest = data.digest || {};

        this.radarContentArea.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong>NIGHT-SHIFT / AFK AUTONOMOUS MODE</strong>
              <button type="button" class="brutalist-btn" id="btn-toggle-afk">TOGGLE AFK MODE</button>
            </div>
            <div style="background: #121622; border: 1px solid var(--border-color); padding: 10px; font-size: 11px;">
              <h4 style="color: var(--color-amber); margin-bottom: 6px;">LATEST CONSULAR BRIEFING DIGEST:</h4>
              <p>${digest.summary || 'No briefing digest available.'}</p>
              <div style="margin-top: 8px; font-size: 10px; color: var(--color-text-dim);">
                Completed Tasks: ${digest.completed_tasks || 0} | Incidents: ${digest.incidents_count || 0} | Vetoes Enforced: ${digest.veto_count || 0}
              </div>
            </div>
          </div>
        `;

        document.getElementById('btn-toggle-afk')?.addEventListener('click', async () => {
          this.radarData.afk = !this.radarData.afk;
          await fetch('/api/swarm/afk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: this.radarData.afk }),
          });
          this.refreshRadarView();
        });
      } catch (err) {
        this.radarContentArea.innerHTML = `<div>Error: ${err.message}</div>`;
      }
    } else {
      this.radarContentArea.innerHTML = '<div style="color: var(--color-text-dim);">Gladiator side-by-side branch tournament active.</div>';
    }
  }

  async refreshVaultView() {
    const area = document.getElementById('vault-content-area');
    if (!area) return;

    try {
      const res = await fetch('/api/vault');
      const data = await res.json();
      const vault = data.vault || {};

      let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
      html += `<div><strong>PERSISTED PREFERENCES:</strong> ${vault.preferences_count || 0} rules in USER_PREFERENCES.md</div>`;
      html += `<div><strong>SYNTHESIZED SKILLS:</strong> ${(vault.skills || []).length} available</div>`;
      html += `<div><strong>REGISTERED MCP SERVERS:</strong> ${(vault.mcp_servers || []).length} active</div>`;
      html += '</div>';

      area.innerHTML = html;
    } catch (err) {
      area.innerHTML = `<div>Error: ${err.message}</div>`;
    }
  }
}

let overseerConsoleInstance = null;
export async function initOverseerConsole(app) {
  if (!overseerConsoleInstance) {
    overseerConsoleInstance = new OverseerConsoleController(app);
  }
  return overseerConsoleInstance;
}
export function appendDialogue(msg) {
  if (overseerConsoleInstance) {
    overseerConsoleInstance.appendDialogueMessage(msg);
  }
}
export function updateRadar() {
  if (overseerConsoleInstance) {
    overseerConsoleInstance.refreshRadarView();
  }
}
