/**
 * src/public/js/overseer-console.js
 *
 * Dual-Consul Command Terminal, Inter-Consul Dialogue Stream,
 * Swarm Radar Tabs (Locks, Gladiator, Checkpoints, AFK), and Vault Catalog.
 */

import { getPromptAttachments } from './prompt-attachment.js?v=20261026g';
import { getMediaRenderer } from './media-renderer.js?v=20261026c';
import { getConsularAvatars } from './consular-avatars.js?v=20261026k';
import { renderConsoleText } from './console-links.js?v=20261026b';

// Keep this predicate aligned with the server/browser copy; regression tests cover both.
function isConsularCliNoise(rawText) {
  const text = rawText
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    .trim()
    .replace(/^(?:Nia|Ferric)(?:\s*(?:\u2192|->)\s*(?:Nia|Ferric))?:\s*/i, '')
    .replace(/^\[DELIBERATE:\s*([\s\S]*?)\s*\]$/i, '$1')
    .replace(/^["']([\s\S]*)["']$/, '$1')
    .trim();
  return !text ||
    /^[\d,\s.:%+-]+$/.test(text) ||
    /^(?:(?:input|output|total|cached|reasoning)[ _-]+)?tokens?(?:[ _-]+(?:used|count))?\s*(?::|=|$|\d)/i.test(text) ||
    /^[\d,]+\s+tokens?\b/i.test(text) ||
    /^(?:OpenAI Codex\b|workdir:|model:|provider:|approval:|sandbox:|session id:|reasoning (?:effort|summaries):|Reading additional input\b|mcp(?:\s|:)|(?:exec|user|codex|assistant|system|thinking)\s*$)/i.test(text) ||
    /^(?:Respond directly to the Overseer\b|You are Consul (?:Nia Nova|Ferric Lunaux)\b|Your underlying CLI\/model\b|Personality(?:\s*&\s*Readability Skill)?:\s|WORKSPACE, GITHUB & KANBAN\b|Live Swarm Status:\s|Recent Console Transcript:\s*|Overseer just said:\s)/i.test(text) ||
    /^(?:[{}\[\],]+\s*$|\{|\[\s*(?:\{|"|\d|\]|true\b|false\b|null\b)|"[^"\n]+"\s*:)/.test(text) ||
    /^(?:\x60\x60\x60(?:json|jsonl)?\s*$|(?:succeeded|exited) in\s+\d|Process exited with code\b|Wall time:|Total output lines:)/i.test(text);
}

function cleanDeliberationText(rawText) {
  return String(rawText || '')
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => !isConsularCliNoise(line))
    .join(' ');
}

export class OverseerConsoleController {
  constructor(app) {
    this.app = app;
    this.dialogueFeed = document.getElementById('consular-dialogue-feed');
    this.deliberationPanel = document.getElementById('consular-deliberation-panel');
    this.deliberationFeed = document.getElementById('consular-deliberation-feed');
    this.deliberationLiveBadge = document.getElementById('deliberation-live-badge');
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
    this.pendingThinkingByConsul = { nia: null, ferric: null };
    this.lastBubbleByConsul = { nia: null, ferric: null };
    this.thinkingCycleTimer = null;
    this.lastLiveThinkingTimestamp = 0;
    this.lastOverseerContext = null;
    this.activeReplyTarget = null;
    this.replyBanner = null;
    this.pendingUserSubmissions = [];
    this.pendingConsulTurns = [];
    this.persistedReplyMap = this.loadPersistedReplyMap();
    this.thinkingIndicatorEl = null;
    this.thinkingIndicatorTimer = null;
    this.thinkingStartTime = 0;
    this.activeDebateConsuls = { nia: false, ferric: false };
    this.currentDebatePrompt = '';
    this.latestDebateThoughts = { nia: '', ferric: '' };
    this.activityMonitorEl = document.getElementById('consular-activity-monitor');
    this.lastActivityAtMs = 0;
    this.lastLiveBackgroundSnippet = '';
    this.lastLiveBackgroundSnippetAt = 0;
    this.activityAgeTimer = null;
    this.activityPollTimer = null;
    this.latestActivitySnapshot = null;

    this.bindEvents();
    this.initActivityMonitor();
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
        if (e.key === 'Escape' && this.activeReplyTarget) {
          e.preventDefault();
          this.clearReplyTarget();
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.submitDirective();
        }
      });
    }
  }

  setReplyTarget(replyObj) {
    if (!replyObj || !replyObj.sender) return;
    this.activeReplyTarget = {
      id: String(replyObj.id || ''),
      sender: String(replyObj.sender),
      content: String(replyObj.content || '').replace(/\s+/g, ' ').trim().slice(0, 180),
    };
    const promptContainer = document.getElementById('console-prompt-container');
    if (promptContainer) {
      if (!this.replyBanner) {
        const banner = document.createElement('div');
        banner.id = 'console-reply-banner';
        banner.style.cssText =
          'display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #111726; border-bottom: 1px solid var(--border-color); border-left: 3px solid var(--color-cyan); padding: 4px 10px; font-size: 11px; color: var(--color-text-bright);';
        promptContainer.prepend(banner);
        this.replyBanner = banner;
      }
      this.replyBanner.style.display = 'flex';
      this.replyBanner.innerHTML = '';
      const label = document.createElement('span');
      label.style.cssText = 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; color: var(--color-text-dim);';
      const strong = document.createElement('strong');
      strong.style.color = 'var(--color-cyan)';
      strong.textContent = `↩ Replying to ${this.activeReplyTarget.sender}: `;
      label.appendChild(strong);
      label.appendChild(document.createTextNode(this.activeReplyTarget.content || '(attachment)'));
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = '✕';
      cancelBtn.title = 'Cancel reply (Esc)';
      cancelBtn.style.cssText =
        'background: transparent; border: 1px solid var(--border-color); color: var(--color-text-dim); font-size: 10px; padding: 1px 5px; cursor: pointer; flex-shrink: 0;';
      cancelBtn.addEventListener('click', () => this.clearReplyTarget());
      this.replyBanner.appendChild(label);
      this.replyBanner.appendChild(cancelBtn);
    }
    this.promptInput?.focus();
  }

  clearReplyTarget() {
    this.activeReplyTarget = null;
    if (this.replyBanner) {
      this.replyBanner.style.display = 'none';
      this.replyBanner.innerHTML = '';
    }
  }

  loadPersistedReplyMap() {
    try {
      const raw = localStorage.getItem('panopticon_reply_map_v1');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  savePersistedReply(messageId, replyTo) {
    if (!messageId || !replyTo) return;
    this.persistedReplyMap[messageId] = replyTo;
    try {
      const keys = Object.keys(this.persistedReplyMap);
      if (keys.length > 150) {
        delete this.persistedReplyMap[keys[0]];
      }
      localStorage.setItem('panopticon_reply_map_v1', JSON.stringify(this.persistedReplyMap));
    } catch {}
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

  formatThinkingLine(rawText) {
    const cleaned = String(rawText || '')
      .replace(/^\[DELIBERATE:\s*/i, '')
      .replace(/\]$/i, '')
      .replace(/^["']|["']$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return '';
    return /^thinking\b/i.test(cleaned) ? cleaned : `Thinking · ${cleaned}`;
  }

  summarizePromptTopic(promptText) {
    const cleaned = String(promptText || '')
      .replace(/\s+/g, ' ')
      .replace(/^["']|["']$/g, '')
      .trim();
    if (!cleaned) return 'your directive';
    const compact = cleaned.length > 76 ? `${cleaned.slice(0, 73).trim()}...` : cleaned;
    return `"${compact}"`;
  }

  normalizeDebateClause(rawText) {
    const cleaned = String(rawText || '')
      .replace(/^\[DELIBERATE:\s*/i, '')
      .replace(/\]$/i, '')
      .replace(/^["']|["']$/g, '')
      .replace(/^(?:Nia\s*(?:→|->|↔)\s*Ferric|Ferric\s*(?:→|->|↔)\s*Nia|Consul\s+(?:Nia\s+Nova|Ferric\s+Lunaux)|Nia|Ferric)\s*:\s*/i, '')
      .replace(/\s+/g, ' ')
      .replace(/[.!?]+$/, '')
      .trim();
    const parts = Array.from(
      new Set(
        cleaned
          .split(/\s*·\s*/)
          .map((p) => p.replace(/[.!?]+$/, '').trim())
          .filter(Boolean)
      )
    );
    return parts.join(' · ');
  }

  frameNiaPosition(clause) {
    const c = this.normalizeDebateClause(clause);
    if (!c) return '';
    if (/^nia\b/i.test(c)) return `${c}.`;
    const lowered = c.charAt(0).toLowerCase() + c.slice(1);
    if (/^(wants?\b|is\b|pushes?\b|advocates?\b|proposes?\b)/i.test(lowered)) {
      return `Nia ${lowered}.`;
    }
    if (/^(i\s+want\s+to|we\s+should|let'?s)\s+/i.test(lowered)) {
      return `Nia wants to ${lowered.replace(/^(i\s+want\s+to|we\s+should|let'?s)\s+/i, '')}.`;
    }
    return `Nia wants to ${lowered}.`;
  }

  frameFerricPosition(clause) {
    const c = this.normalizeDebateClause(clause);
    if (!c) return '';
    if (/^ferric\b/i.test(c)) return `${c}.`;
    const lowered = c.charAt(0).toLowerCase() + c.slice(1);
    if (/^(is\s+concerned\b|warns?\b|insists?\b|wants?\b|checks?\b|verifies\b)/i.test(lowered)) {
      return `Ferric ${lowered}.`;
    }
    if (/^(i\s+am\s+concerned\s+about|concerned\s+about)\s+/i.test(lowered)) {
      return `Ferric is concerned about ${lowered.replace(/^(i\s+am\s+concerned\s+about|concerned\s+about)\s+/i, '')}.`;
    }
    return `Ferric is concerned about ${lowered}.`;
  }

  buildDescriptiveDebateSummary(promptText = '', niaThought = '', ferricThought = '', stageIndex = 0) {
    const topic = this.summarizePromptTopic(promptText || this.currentDebatePrompt);
    const niaClean = this.normalizeDebateClause(niaThought);
    const ferricClean = this.normalizeDebateClause(ferricThought);

    // If a Consul already emitted a full descriptive summary mentioning both Nia and Ferric, surface it directly
    if (niaClean && /\bnia\b/i.test(niaClean) && /\bferric\b/i.test(niaClean)) {
      return `${niaClean}.`;
    }
    if (ferricClean && /\bnia\b/i.test(ferricClean) && /\bferric\b/i.test(ferricClean)) {
      return `${ferricClean}.`;
    }

    if (niaClean && ferricClean) {
      return `${this.frameNiaPosition(niaClean)}\n${this.frameFerricPosition(ferricClean)} Nia is trying to convince Ferric on the cleanest path for ${topic}.`;
    }
    if (niaClean) {
      return `${this.frameNiaPosition(niaClean)}\nFerric is concerned about regression risk and verification coverage, and Nia is trying to convince Ferric to apply this cleanly for ${topic}.`;
    }
    if (ferricClean) {
      return `Nia wants immediate UX and workflow action on ${topic}.\n${this.frameFerricPosition(ferricClean)} Nia is trying to convince Ferric that the update is safe to land now.`;
    }

    const stages = [
      `Nia wants to act immediately on ${topic}.\nFerric is concerned about regression risks and wants to verify current state first, while Nia is trying to convince Ferric that a direct, clean update is safe.`,
      `Nia wants a streamlined implementation for ${topic}.\nFerric is concerned about edge cases and test coverage, and Nia is trying to convince Ferric on the fastest path forward.`,
      `Nia wants immediate UX polish for ${topic}.\nFerric is concerned about file locks and verification gates, while Nia is trying to convince Ferric to approve the change.`,
      `Nia wants to finalize the solution for ${topic}.\nFerric is concerned about keeping all unit checks green, and Nia is trying to convince Ferric to lock in consensus.`,
    ];
    return stages[Math.abs(stageIndex) % stages.length];
  }

  appendDeliberation(rawText) {
    const text = cleanDeliberationText(rawText)
      .replace(/^\[DELIBERATE:\s*/i, '')
      .replace(/\]$/i, '')
      .replace(/^["']|["']$/g, '')
      .trim();
    if (!text || !this.dialogueFeed) return;
    // Ignore generic filler placeholders so only real back-and-forth thoughts appear
    if (
      /^(Inspecting workspace|Evaluating codebase|Analyzing Overseer directive|Cross-checking active cubicles|Splitting implementation responsibilities|Auditing state transitions)/i.test(
        text.replace(/^(Nia\s*→\s*Ferric|Ferric\s*→\s*Nia|Nia|Ferric):\s*/i, '')
      )
    ) {
      return;
    }
    // The standalone debate chamber underneath the avatars was retired per Overseer preference;
    // only append if an explicit deliberationFeed container exists (e.g. unit test harness).
    if (!this.deliberationFeed) {
      return;
    }
    const placeholder = this.deliberationFeed.querySelector('.delib-empty-placeholder');
    if (placeholder) placeholder.remove();
    if (this.deliberationFeed.lastElementChild?.dataset?.rawText === text) return;
    const entry = document.createElement('div');
    entry.dataset.rawText = text;
    entry.style.cssText = 'padding: 4px 8px; background: #191711; border: 1px solid #50432c; border-left: 3px solid var(--color-amber); color: #e6d7bd;';
    const isNiaLine = /^Nia\b/i.test(text);
    const isFerricLine = /^Ferric\b/i.test(text);
    const colonIdx = text.indexOf(':');
    if ((isNiaLine || isFerricLine) && colonIdx > 0 && colonIdx < 24) {
      const prefix = text.slice(0, colonIdx + 1);
      const body = text.slice(colonIdx + 1).trim();
      entry.style.borderLeftColor = isNiaLine ? 'var(--color-cyan)' : 'var(--color-amber)';
      const labelSpan = document.createElement('span');
      labelSpan.style.cssText = `font-weight: 700; color: ${isNiaLine ? 'var(--color-cyan)' : 'var(--color-amber)'}; margin-right: 6px;`;
      labelSpan.textContent = prefix;
      const bodySpan = document.createElement('span');
      bodySpan.textContent = body;
      entry.appendChild(labelSpan);
      entry.appendChild(bodySpan);
    } else {
      entry.textContent = text;
    }
    this.deliberationFeed.appendChild(entry);
    while (this.deliberationFeed.children.length > 30) this.deliberationFeed.firstElementChild.remove();
    this.deliberationFeed.scrollTop = this.deliberationFeed.scrollHeight;
  }

  startPromptDebateIndicator(promptText = '') {
    if (!this.dialogueFeed) return;
    this.stopPromptDebateIndicator();
    this.thinkingStartTime = Date.now();
    this.activeDebateConsuls = { nia: false, ferric: false };
    this.currentDebatePrompt = String(promptText || '').trim();
    this.latestDebateThoughts = { nia: '', ferric: '' };

    const initialSummary = this.buildDescriptiveDebateSummary(this.currentDebatePrompt, '', '', 0);

    const indicator = document.createElement('div');
    indicator.id = 'consular-thinking-indicator';
    indicator.className = 'consular-thinking-indicator';
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-live', 'polite');
    indicator.innerHTML = `
      <div class="consular-thinking-header">
        <span class="consular-thinking-title">
          <span class="consular-thinking-spinner" aria-hidden="true"></span>
          <span class="consular-thinking-label">Thinking... Nia &amp; Ferric are debating your prompt</span>
        </span>
        <span class="consular-thinking-timer" id="consular-thinking-elapsed">0s</span>
      </div>
      <div class="consular-thinking-pills">
        <span class="consular-thinking-pill nia" id="thinking-pill-nia">● NIA NOVA [ARGON]: DEBATING...</span>
        <span class="consular-thinking-pill ferric" id="thinking-pill-ferric">● FERRIC LUNAUX [ASTRA]: DEBATING...</span>
      </div>
      <div class="consular-thinking-snippet" id="consular-thinking-snippet">
        ${this.escapeHtml(initialSummary)}
      </div>
    `;

    this.dialogueFeed.appendChild(indicator);
    this.dialogueFeed.scrollTop = this.dialogueFeed.scrollHeight;
    this.thinkingIndicatorEl = indicator;

    if (this.deliberationPanel) {
      this.deliberationPanel.classList.add('is-debating');
      this.deliberationPanel.open = true;
    }
    if (this.deliberationLiveBadge) {
      this.deliberationLiveBadge.classList.add('active');
      this.deliberationLiveBadge.textContent = '⚡ DEBATING PROMPT (0s)';
    }
    if (this.btnSubmit) {
      this.btnSubmit.dataset.origLabel = this.btnSubmit.innerHTML;
      this.btnSubmit.innerHTML = '<span>DEBATING...</span><span>⚡</span>';
    }

    this.thinkingIndicatorTimer = setInterval(() => {
      const elapsedSec = Math.max(0, Math.floor((Date.now() - this.thinkingStartTime) / 1000));
      const timerEl = this.thinkingIndicatorEl?.querySelector('#consular-thinking-elapsed');
      if (timerEl) {
        timerEl.textContent = `${elapsedSec}s`;
      }
      if (this.deliberationLiveBadge) {
        this.deliberationLiveBadge.textContent = `⚡ DEBATING PROMPT (${elapsedSec}s)`;
      }
      const hasLiveThoughts = Boolean(
        this.latestDebateThoughts?.nia || this.latestDebateThoughts?.ferric
      );
      if (!hasLiveThoughts && Date.now() - this.lastLiveThinkingTimestamp > 4000) {
        const snippetEl = this.thinkingIndicatorEl?.querySelector('#consular-thinking-snippet');
        if (snippetEl) {
          snippetEl.textContent = this.buildDescriptiveDebateSummary(
            this.currentDebatePrompt,
            '',
            '',
            Math.floor(elapsedSec / 4)
          );
        }
      }
    }, 1000);
  }

  updatePromptDebateSnippet(isNia, snippetText) {
    if (!snippetText) return;
    if (!this.latestDebateThoughts) {
      this.latestDebateThoughts = { nia: '', ferric: '' };
    }
    if (isNia) {
      this.latestDebateThoughts.nia = snippetText;
    } else {
      this.latestDebateThoughts.ferric = snippetText;
    }
    if (!this.thinkingIndicatorEl) return;
    const snippetEl = this.thinkingIndicatorEl.querySelector('#consular-thinking-snippet');
    if (snippetEl) {
      snippetEl.textContent = this.buildDescriptiveDebateSummary(
        this.currentDebatePrompt,
        this.latestDebateThoughts.nia,
        this.latestDebateThoughts.ferric,
        0
      );
    }
  }

  markConsulRepliedInIndicator(isNia) {
    if (!this.thinkingIndicatorEl) return;
    if (isNia) {
      this.activeDebateConsuls.nia = true;
      const pill = this.thinkingIndicatorEl.querySelector('#thinking-pill-nia');
      if (pill) {
        pill.classList.add('replied');
        pill.textContent = '✓ NIA NOVA [ARGON]: REPLIED';
      }
    } else {
      this.activeDebateConsuls.ferric = true;
      const pill = this.thinkingIndicatorEl.querySelector('#thinking-pill-ferric');
      if (pill) {
        pill.classList.add('replied');
        pill.textContent = '✓ FERRIC LUNAUX [ASTRA]: REPLIED';
      }
    }
    if (this.dialogueFeed && this.thinkingIndicatorEl.parentNode === this.dialogueFeed) {
      this.dialogueFeed.appendChild(this.thinkingIndicatorEl);
      this.dialogueFeed.scrollTop = this.dialogueFeed.scrollHeight;
    }
  }

  stopPromptDebateIndicator() {
    if (this.thinkingIndicatorTimer) {
      clearInterval(this.thinkingIndicatorTimer);
      this.thinkingIndicatorTimer = null;
    }
    if (this.thinkingIndicatorEl) {
      this.thinkingIndicatorEl.remove();
      this.thinkingIndicatorEl = null;
    }
    if (this.deliberationPanel) {
      this.deliberationPanel.classList.remove('is-debating');
    }
    if (this.deliberationLiveBadge) {
      this.deliberationLiveBadge.classList.remove('active');
      this.deliberationLiveBadge.textContent = 'STANDBY';
    }
    if (this.btnSubmit && this.btnSubmit.dataset.origLabel) {
      this.btnSubmit.innerHTML = this.btnSubmit.dataset.origLabel;
      delete this.btnSubmit.dataset.origLabel;
    }
  }

  handleConsularThinking(payload) {
    if (!payload) return;
    const rawConsul = String(payload.consul || payload.sender || '').toLowerCase();
    const isNia = rawConsul.includes('nia') || rawConsul === 'consul i' || rawConsul === 'consul-1';
    const snippet = cleanDeliberationText(payload.text).replace(/\s+/g, ' ').trim();
    if (!snippet) return;
    this.lastLiveThinkingTimestamp = Date.now();
    this.lastActivityAtMs = Date.now();
    this.lastLiveBackgroundSnippet = `${isNia ? 'Nia' : 'Ferric'}: ${snippet}`;
    this.lastLiveBackgroundSnippetAt = Date.now();
    this.updatePromptDebateSnippet(isNia, snippet);
    const line = (isNia ? 'Nia → Ferric: ' : 'Ferric → Nia: ') + snippet;
    this.appendDeliberation(line);
    if (!this.thinkingIndicatorEl && this.activityMonitorEl) {
      const detailEl = this.activityMonitorEl.querySelector('#consular-activity-detail');
      if (detailEl) {
        detailEl.textContent = this.lastLiveBackgroundSnippet;
      }
      this.updateActivityAgeLabel();
    }
  }

  initActivityMonitor() {
    if (!this.activityMonitorEl && (this.viewConsole || this.dialogueFeed?.parentElement)) {
      const container = this.viewConsole || this.dialogueFeed.parentElement;
      const bar = document.createElement('div');
      bar.id = 'consular-activity-monitor';
      bar.className = 'consular-activity-monitor';
      bar.dataset.state = 'idle';
      bar.setAttribute('role', 'status');
      bar.setAttribute('aria-live', 'polite');
      bar.innerHTML = `
        <div class="consular-activity-header">
          <span class="consular-activity-badge" id="consular-activity-badge">
            <span class="consular-activity-dot" id="consular-activity-dot"></span>
            <span id="consular-activity-state-label">SWARM ACTIVITY · SYNCING...</span>
          </span>
          <div class="consular-activity-meta">
            <span class="consular-activity-age" id="consular-activity-age">Last activity: --</span>
            <button type="button" class="consular-activity-action-btn hidden" id="consular-activity-action-btn"></button>
          </div>
        </div>
        <div class="consular-activity-detail" id="consular-activity-detail">
          Monitoring background worker cubicles and Consular execution...
        </div>
      `;
      const anchor =
        container.querySelector('#consular-question-widget') ||
        container.querySelector('#console-prompt-container') ||
        null;
      if (anchor) {
        container.insertBefore(bar, anchor);
      } else {
        container.appendChild(bar);
      }
      this.activityMonitorEl = bar;
    }

    if (!this.activityMonitorEl) return;

    const actionBtn = this.activityMonitorEl.querySelector('#consular-activity-action-btn');
    if (actionBtn) {
      actionBtn.addEventListener('click', () => void this.triggerActivityAction());
    }

    this.activityAgeTimer = setInterval(() => this.updateActivityAgeLabel(), 1000);
    if (typeof this.activityAgeTimer?.unref === 'function') this.activityAgeTimer.unref();

    this.activityPollTimer = setInterval(() => void this.refreshActivityMonitor(), 5000);
    if (typeof this.activityPollTimer?.unref === 'function') this.activityPollTimer.unref();

    void this.refreshActivityMonitor();
  }

  formatRelativeAge(ms) {
    if (!ms || Number.isNaN(ms) || ms <= 0) return '--';
    const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (diffSec < 5) return 'just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `${mins}m ${diffSec % 60}s ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m ago`;
  }

  updateActivityAgeLabel() {
    if (!this.activityMonitorEl) return;
    const ageEl = this.activityMonitorEl.querySelector('#consular-activity-age');
    if (!ageEl) return;
    ageEl.textContent = `Last activity: ${this.formatRelativeAge(this.lastActivityAtMs)}`;
  }

  async refreshActivityMonitor() {
    if (!this.activityMonitorEl || typeof fetch !== 'function') return;
    const beacon = document.getElementById('ws-status-beacon');
    if (beacon && beacon.classList.contains('offline')) {
      this.renderActivitySnapshot({
        state: 'disconnected',
        summary: 'WebSocket connection to Panopticon server is offline; attempting automatic reconnect...',
      });
      return;
    }

    try {
      const res = await fetch('/api/swarm/activity', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.activity) {
          this.renderActivitySnapshot(data.activity);
          return;
        }
      }
    } catch {}
  }

  renderActivitySnapshot(snapshot) {
    if (!this.activityMonitorEl || !snapshot) return;
    this.latestActivitySnapshot = snapshot;
    const state = snapshot.state || 'idle';
    this.activityMonitorEl.dataset.state = state;

    if (snapshot.lastActivityAt) {
      const parsed = Date.parse(snapshot.lastActivityAt);
      if (!Number.isNaN(parsed) && parsed > this.lastActivityAtMs) {
        this.lastActivityAtMs = parsed;
      }
    }

    const labelEl = this.activityMonitorEl.querySelector('#consular-activity-state-label');
    const detailEl = this.activityMonitorEl.querySelector('#consular-activity-detail');
    const actionBtn = this.activityMonitorEl.querySelector('#consular-activity-action-btn');

    if (labelEl) {
      if (state === 'working') {
        const count = snapshot.workingCubicles?.length || snapshot.inProgressCount || 1;
        labelEl.textContent = `⚡ SWARM WORKING · ${count} ACTIVE WORKER${count === 1 ? '' : 'S'}`;
      } else if (state === 'review') {
        const count = snapshot.reviewCount || 1;
        labelEl.textContent = `⚖ GATE 2 REVIEW · ${count} TASK${count === 1 ? '' : 'S'} AWAITING CONSENSUS`;
      } else if (state === 'stalled') {
        const count = snapshot.orphanedTasks?.length || snapshot.inProgressCount || 1;
        labelEl.textContent = `⚠ WORK STALLED · ${count} IN-PROGRESS TASK${count === 1 ? '' : 'S'} WITHOUT ACTIVE WORKER`;
      } else if (state === 'disconnected') {
        labelEl.textContent = '✕ SERVER DISCONNECTED · RECONNECTING...';
      } else {
        const todoCount = snapshot.todoCount ?? 0;
        labelEl.textContent = `● SWARM IDLE · 0 ACTIVE WORKERS · ${todoCount} IN TODO`;
      }
    }

    if (detailEl) {
      const useRecentLiveSnippet =
        state === 'working' &&
        this.lastLiveBackgroundSnippet &&
        Date.now() - this.lastLiveBackgroundSnippetAt < 8000;
      detailEl.textContent = useRecentLiveSnippet
        ? this.lastLiveBackgroundSnippet
        : snapshot.summary || 'Standing by for Overseer directives.';
    }

    if (actionBtn) {
      if (state === 'stalled' && Array.isArray(snapshot.orphanedTasks) && snapshot.orphanedTasks.length > 0) {
        actionBtn.classList.remove('hidden');
        actionBtn.style.display = 'inline-flex';
        actionBtn.textContent = '↻ RESUME STALLED WORK';
        actionBtn.dataset.action = 'resume-stalled';
        actionBtn.dataset.taskId = snapshot.orphanedTasks[0].id;
      } else if (state === 'idle' && (snapshot.todoCount || 0) > 0) {
        actionBtn.classList.remove('hidden');
        actionBtn.style.display = 'inline-flex';
        actionBtn.textContent = '▶ DISPATCH NEXT TODO';
        actionBtn.dataset.action = 'dispatch-todo';
        actionBtn.dataset.taskId = '';
      } else {
        actionBtn.classList.add('hidden');
        actionBtn.style.display = 'none';
      }
    }

    this.updateActivityAgeLabel();
  }

  async triggerActivityAction() {
    if (!this.activityMonitorEl || typeof fetch !== 'function') return;
    const actionBtn = this.activityMonitorEl.querySelector('#consular-activity-action-btn');
    if (!actionBtn || actionBtn.disabled) return;
    const origText = actionBtn.textContent;
    actionBtn.disabled = true;
    actionBtn.textContent = 'DISPATCHING...';
    try {
      let targetTaskId = actionBtn.dataset.taskId || '';
      if (!targetTaskId) {
        const tRes = await fetch('/api/tasks');
        if (tRes.ok) {
          const tData = await tRes.json();
          targetTaskId = tData.tasks?.todo?.[0]?.id || tData.tasks?.in_progress?.[0]?.id || '';
        }
      }
      if (targetTaskId) {
        const res = await fetch('/api/tasks/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: targetTaskId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          this.showIncidentAlert(`Dispatch failed: ${err.error || res.statusText}`);
        }
      }
    } catch (err) {
      this.showIncidentAlert(`Dispatch failed: ${err.message}`);
    } finally {
      actionBtn.disabled = false;
      actionBtn.textContent = origText;
      await this.refreshActivityMonitor();
    }
  }

  handleActivityEvent(type, payload) {
    if (type === 'SWARM_ACTIVITY_HEARTBEAT' && payload) {
      this.renderActivitySnapshot(payload);
      return;
    }
    if (type === 'CUBICLE_UPDATED' && payload?.cubicle) {
      this.lastActivityAtMs = Date.now();
      const cub = payload.cubicle;
      if (cub.surface_thoughts && cub.status === 'working') {
        this.lastLiveBackgroundSnippet = `${cub.id}: ${cub.surface_thoughts}`;
        this.lastLiveBackgroundSnippetAt = Date.now();
      }
    } else if (type && type.startsWith('TASK_')) {
      this.lastActivityAtMs = Date.now();
    }
    void this.refreshActivityMonitor();
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
    const consulKey = isNia ? 'nia' : 'ferric';
    let rawContent = String(msg.content || '');
    let extractedDelib = '';

    if (!isUser) {
      const delibRegex = /\[DELIBERATE:\s*(?:"([\s\S]*?)"|([\s\S]*?))\s*\]/gi;
      const extractedParts = [];
      let m;
      while ((m = delibRegex.exec(rawContent)) !== null) {
        const chunk = String(m[1] || m[2] || '').trim().replace(/^["']|["']$/g, '');
        if (chunk) extractedParts.push(chunk);
      }
      if (extractedParts.length > 0) {
        extractedDelib = Array.from(new Set(extractedParts)).join(' · ');
      }
      rawContent = Array.from(
        new Set(
          rawContent
            .replace(delibRegex, '')
            .replace(/\[(CREATE_TASK|SCALE_CUBICLES|DISPATCH_TASK|REVIEW_TASK):\s*\{[\s\S]*?\}\s*\]/gi, '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
        )
      ).join('\n');
    }

    const isDeliberation =
      !isUser &&
      (msg.phase === 'PLANNING_GATE' ||
        msg.phase === 'DELIBERATION' ||
        !rawContent ||
        /^\[(TO FERRIC|TO NIA|INTERCESSIO|IMPATIENCE)/i.test(rawContent));

    // Route inter-Consul exchanges into the single deliberation block above chat
    if (isDeliberation) {
      const cleanDelib =
        extractedDelib ||
        rawContent
          .replace(/^\[(DELIBERATE|TO FERRIC|TO NIA|Nia Nova on Plan|Ferric Lunaux on Plan)[^\]]*\]:?\s*/i, '')
          .replace(/^["']|["']$/g, '')
          .trim() ||
        String(msg.content || '').trim();
      const formattedThought = `${isNia ? 'Nia → Ferric' : 'Ferric → Nia'}: ${cleanDelib}`;
      this.appendDeliberation(formattedThought);
      return;
    }

    // If a persisted user message arrives, remove any temporary optimistic user bubble for the same text
    if (isUser) {
      if (!msg._optimistic) {
        const subIdx = this.pendingUserSubmissions.findIndex((s) => s.content === rawContent);
        let matchedLiveSub = false;
        if (subIdx !== -1) {
          matchedLiveSub = true;
          const matchedSub = this.pendingUserSubmissions.splice(subIdx, 1)[0];
          if (!msg.replyTo && matchedSub.replyTo) {
            msg.replyTo = matchedSub.replyTo;
          }
          if (matchedSub.attachments && matchedSub.attachments.length > 0) {
            msg.attachments = matchedSub.attachments;
          }
        }
        if (msg.id && msg.replyTo) {
          this.savePersistedReply(msg.id, msg.replyTo);
        } else if (msg.id && !msg.replyTo && this.persistedReplyMap[msg.id]) {
          msg.replyTo = this.persistedReplyMap[msg.id];
        }
        const contextEntry = {
          id: msg.id || '',
          sender: 'Overseer',
          content: rawContent.replace(/\s+/g, ' ').trim().slice(0, 240),
        };
        this.lastOverseerContext = contextEntry;
        if (matchedLiveSub) {
          this.pendingConsulTurns.push({ ...contextEntry, consumedBy: new Set() });
          while (this.pendingConsulTurns.length > 10) {
            this.pendingConsulTurns.shift();
          }
        }
      }
      this.lastBubbleByConsul = { nia: null, ferric: null };
      this.latestDebateThoughts = { nia: '', ferric: '' };
      if (!msg._optimistic) {
        const optBubbles = this.dialogueFeed.querySelectorAll('.optimistic-user-bubble');
        optBubbles.forEach((b) => b.remove());
      }
      this.lastUserMessage = {
        id: msg.id || '',
        sender: 'Overseer',
        content: rawContent.replace(/\s+/g, ' ').trim().slice(0, 180),
      };
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
    if (msg.id) row.dataset.messageId = msg.id;
    if (!isUser) {
      row.dataset.consul = consulKey;
    }
    row.style.cssText = `background: ${bgStyle}; border: 1px solid var(--border-color); ${alignStyle} padding: 8px 10px; margin-bottom: 6px; font-size: 12px;`;

    row.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 4px;">
        <span style="font-weight: 700; color: ${senderColor};">${senderName}</span>
        <div style="display: flex; align-items: center; gap: 6px;">
          <button type="button" class="btn-reply-message" title="Reply to this message" style="background: rgba(148, 163, 184, 0.08); border: 1px solid rgba(148, 163, 184, 0.22); color: var(--color-text-dim); font: inherit; font-size: 10px; padding: 1px 6px; cursor: pointer; border-radius: 2px;">↩ Reply</button>
          <span style="font-size: 10px; color: var(--color-text-dim);">${new Date(msg.timestamp || Date.now()).toLocaleTimeString()}</span>
        </div>
      </div>
      <div class="dialogue-content" style="color: var(--color-text-bright); line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere;"></div>
    `;
    renderConsoleText(row.querySelector('.dialogue-content'), rawContent);

    const replyBtn = row.querySelector('.btn-reply-message');
    if (replyBtn) {
      const shortSender = isUser ? 'Overseer' : isNia ? 'Consul Nia Nova' : 'Consul Ferric Lunaux';
      replyBtn.addEventListener('click', () => {
        this.setReplyTarget({
          id: msg.id || row.dataset.messageId || '',
          sender: shortSender,
          content: rawContent,
        });
      });
    }

    // Resolve explicit or inferred reply target so every Consul response & Overseer reply shows a clear Discord-style quote bar
    let replyReference = msg.replyTo || (msg.id && this.persistedReplyMap[msg.id]) || null;
    if (!replyReference && !isUser && msg.phase === 'USER_CHAT') {
      const unconsumedTurn = this.pendingConsulTurns.find((t) => !t.consumedBy.has(consulKey));
      if (unconsumedTurn) {
        unconsumedTurn.consumedBy.add(consulKey);
        replyReference = {
          id: unconsumedTurn.id,
          sender: unconsumedTurn.sender,
          content: unconsumedTurn.content,
        };
        if (msg.id) {
          this.savePersistedReply(msg.id, replyReference);
        }
      } else if (this.lastOverseerContext) {
        replyReference = this.lastOverseerContext;
      }
    }
    if (replyReference && (replyReference.id || replyReference.sender)) {
      const reference = document.createElement('button');
      reference.type = 'button';
      reference.className = 'dialogue-reply-reference';
      reference.style.cssText =
        'display: flex; align-items: center; gap: 6px; width: 100%; text-align: left; border: 1px solid rgba(34, 211, 238, 0.28); border-left: 3px solid var(--color-cyan); background: rgba(34, 211, 238, 0.1); color: var(--color-text-bright); font: inherit; font-size: 11px; padding: 4px 8px; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; border-radius: 2px;';
      const badge = document.createElement('strong');
      badge.style.cssText = 'color: var(--color-cyan); flex-shrink: 0;';
      badge.textContent = `↩ Replying to ${replyReference.sender}:`;
      const snippet = document.createElement('span');
      snippet.style.cssText = 'color: var(--color-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
      snippet.textContent = `"${replyReference.content || '(attachment)'}"`;
      reference.appendChild(badge);
      reference.appendChild(snippet);
      reference.title = `Jump to ${replyReference.sender}: ${replyReference.content || '(attachment)'}`;
      reference.addEventListener('click', () => {
        const target = replyReference.id
          ? Array.from(this.dialogueFeed.querySelectorAll('[data-message-id]'))
              .find((bubble) => bubble.dataset.messageId === replyReference.id)
          : null;
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.animate([{ outline: '2px solid #22d3ee' }, { outline: '2px solid transparent' }], { duration: 1600 });
        } else {
          this.showIncidentAlert('Original message is outside the loaded history: ' + replyReference.content);
        }
      });
      row.insertBefore(reference, row.querySelector('.dialogue-content'));
    }

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

    if (!isUser) {
      const delibText = String(extractedDelib || msg.thinking || '').trim();
      if (delibText) {
        this.updatePromptDebateSnippet(isNia, delibText);
        this.appendDeliberation((isNia ? 'Nia → Ferric: ' : 'Ferric → Nia: ') + delibText);
      }
    }

    this.dialogueFeed.appendChild(row);
    if (!isUser) {
      this.markConsulRepliedInIndicator(isNia);
    } else if (this.thinkingIndicatorEl && this.thinkingIndicatorEl.parentNode === this.dialogueFeed) {
      this.dialogueFeed.appendChild(this.thinkingIndicatorEl);
    }
    this.dialogueFeed.scrollTop = this.dialogueFeed.scrollHeight;
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
    const attachmentMgr = getPromptAttachments();
    const goalText = this.promptInput.value.trim() ||
      (attachmentMgr?.getStagedAttachments().length ? 'Please review the attached files.' : '');
    if (!goalText || this.preparingAttachments) return;
    let attachments;
    this.preparingAttachments = true;
    try {
      attachments = attachmentMgr ? await attachmentMgr.getSerializableAttachments() : [];
    } catch (err) {
      this.showIncidentAlert(`Attachment failed: ${err.message}`);
      return;
    } finally {
      this.preparingAttachments = false;
    }
    const replyTo = this.activeReplyTarget ? { ...this.activeReplyTarget } : undefined;
    this.pendingUserSubmissions.push({
      content: goalText,
      replyTo,
      attachments,
    });

    this.promptInput.value = '';
    if (attachmentMgr) attachmentMgr.clearAttachments();
    this.clearReplyTarget();

    // 1. Immediately render optimistic user message in the chat history feed, start Codex-style thinking indicator & update debate chamber
    this.appendDeliberation(
      `Nia ↔ Ferric: Deliberating on Overseer directive "${goalText.replace(/\s+/g, ' ').slice(0, 90)}"${attachments?.length ? ` (+${attachments.length} attachment${attachments.length > 1 ? 's' : ''})` : ''}...`
    );
    this.appendDialogueMessage({
      _optimistic: true,
      sender: 'Overseer',
      tone: 'user_directive',
      content: goalText,
      timestamp: new Date().toISOString(),
      attachments,
      ...(replyTo ? { replyTo } : {}),
    });
    this.startPromptDebateIndicator(goalText);

    // 2. Post to live Consul CLI chat endpoint (all real Nia ↔ Ferric debate thoughts stream solely into the upper Deliberation panel)
    try {
      const res = await fetch('/api/governance/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: goalText,
          attachments,
          ...(replyTo ? { replyTo } : {}),
        }),
      });

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
      this.showIncidentAlert(`Failed to transmit directive: ${err.message}`);
    } finally {
      this.stopPromptDebateIndicator();
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

let overseerConsoleInstance =
  (typeof window !== 'undefined' && window.__panopticonOverseerConsole) || null;
export async function initOverseerConsole(app) {
  if (typeof window !== 'undefined' && window.__panopticonOverseerConsole) {
    overseerConsoleInstance = window.__panopticonOverseerConsole;
    return overseerConsoleInstance;
  }
  if (!overseerConsoleInstance) {
    overseerConsoleInstance = new OverseerConsoleController(app);
    if (typeof window !== 'undefined') {
      window.__panopticonOverseerConsole = overseerConsoleInstance;
    }
  }
  return overseerConsoleInstance;
}
export function appendDialogue(msg) {
  const inst = (typeof window !== 'undefined' && window.__panopticonOverseerConsole) || overseerConsoleInstance;
  if (inst) {
    inst.appendDialogueMessage(msg);
  }
}
export function updateConsularThinking(payload) {
  const inst = (typeof window !== 'undefined' && window.__panopticonOverseerConsole) || overseerConsoleInstance;
  if (inst) {
    inst.handleConsularThinking(payload);
  }
}
export function updateRadar() {
  const inst = (typeof window !== 'undefined' && window.__panopticonOverseerConsole) || overseerConsoleInstance;
  if (inst) {
    inst.refreshRadarView();
  }
}
