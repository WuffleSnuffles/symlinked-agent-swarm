/**
 * src/public/js/taskboard-view.js
 *
 * Shared Swarm Taskboard & Mid-Work Consular Intervention Controller.
 * Features:
 * - 4-Column Kanban board (To Do, In Progress, Review, Done).
 * - Overall Mission Progress Bar & live task counters.
 * - Per-task cards with assigned cubicle, Courier origin badges, progress bars, and diff previews.
 * - Mid-Work Consular Intervention actions (amend, evict, split, rebalance, impatience).
 */

export class TaskboardViewController {
  constructor(app) {
    this.app = app;
    this.cols = {
      todo: document.querySelector('#col-todo .task-list'),
      in_progress: document.querySelector('#col-in_progress .task-list'),
      review: document.querySelector('#col-review .task-list'),
      done: document.querySelector('#col-done .task-list'),
    };

    this.progressFill = document.getElementById('mission-progress-fill');
    this.progressPercent = document.getElementById('mission-progress-percent');
    this.counterTodo = document.getElementById('counter-todo');
    this.counterProg = document.getElementById('counter-prog');
    this.counterReview = document.getElementById('counter-review');
    this.counterDone = document.getElementById('counter-done');

    this.bindInterventionActions();
    document.getElementById('task-create-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const status = document.getElementById('task-create-status');
      const button = form.querySelector('button');
      button.disabled = true;
      try {
        const values = Object.fromEntries(new FormData(form));
        const response = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not create task');
        form.reset();
        status.textContent = 'Task added';
        await this.app.refreshTasks();
      } catch (error) { status.textContent = error.message; }
      finally { button.disabled = false; }
    });
    document.getElementById('cubicle-chat')?.addEventListener('toggle', () => this.refreshMessages());
  }

  async refreshMessages() {
    const history = document.getElementById('cubicle-message-history');
    if (!history || !document.getElementById('cubicle-chat')?.open) return;
    try {
      const response = await fetch('/api/messages');
      if (!response.ok) throw new Error('Collaboration requires the updated server');
      const { messages } = await response.json();
      history.replaceChildren();
      for (const message of messages.slice(-50)) {
        const entry = document.createElement('p');
        entry.textContent = `${message.from} → ${message.to} [${message.topic}]: ${message.text}`;
        history.appendChild(entry);
      }
      if (!messages.length) history.textContent = 'No messages yet';
    } catch (error) { history.textContent = error.message; }
  }

  bindInterventionActions() {
    const btnAmend = document.getElementById('btn-intervention-amend');
    const btnEvict = document.getElementById('btn-intervention-evict');
    const btnSplit = document.getElementById('btn-intervention-split');
    const btnRebalance = document.getElementById('btn-intervention-rebalance');
    const btnImpatience = document.getElementById('btn-trigger-impatience');

    if (btnAmend) {
      btnAmend.addEventListener('click', async () => {
        const taskId = prompt('Enter In-Progress Task ID to Amend:');
        if (!taskId) return;
        const amendedPrompt = prompt('Enter Amended Prompt / Instructions:');
        if (!amendedPrompt) return;

        try {
          const res = await fetch('/api/governance/intervention/amend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId, amendedPrompt }),
          });
          const data = await res.json();
          alert(`Intervention Status: ${data.action_taken}`);
        } catch (err) {
          alert(`Failed: ${err.message}`);
        }
      });
    }

    if (btnEvict) {
      btnEvict.addEventListener('click', async () => {
        const fromCubicle = prompt('Enter Stalled Cubicle ID (e.g. cubicle-01):');
        if (!fromCubicle) return;
        const toCubicle = prompt('Enter Replacement Cubicle ID (e.g. cubicle-02):');
        if (!toCubicle) return;

        try {
          const res = await fetch('/api/governance/intervention/evict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fromCubicleId: fromCubicle, toCubicleId: toCubicle, reason: 'Worker stalled mid-flight' }),
          });
          const data = await res.json();
          alert(`Eviction Status: ${data.action_taken}`);
        } catch (err) {
          alert(`Failed: ${err.message}`);
        }
      });
    }

    if (btnSplit) {
      btnSplit.addEventListener('click', async () => {
        const taskId = prompt('Enter Task ID to Split:');
        if (!taskId) return;

        try {
          const res = await fetch('/api/governance/intervention/split', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskId,
              splits: [
                { cubicleId: 'cubicle-01', subtask: 'Part A implementation' },
                { cubicleId: 'cubicle-02', subtask: 'Part B implementation' },
              ],
            }),
          });
          const data = await res.json();
          alert(`Split Status: ${data.action_taken}`);
        } catch (err) {
          alert(`Failed: ${err.message}`);
        }
      });
    }

    if (btnRebalance) {
      btnRebalance.addEventListener('click', async () => {
        try {
          const res = await fetch('/api/governance/intervention/rebalance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rebalancePlan: { strategy: 'priority-shift' } }),
          });
          const data = await res.json();
          alert(`Rebalance Status: ${data.action_taken}`);
        } catch (err) {
          alert(`Failed: ${err.message}`);
        }
      });
    }

    if (btnImpatience) {
      btnImpatience.addEventListener('click', async () => {
        try {
          const res = await fetch('/api/governance/intervention/impatience', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'Velocity threshold exceeded; user requires immediate delivery' }),
          });
          const data = await res.json();
          alert('Nia Impatience Protocol Triggered!');
        } catch (err) {
          alert(`Failed: ${err.message}`);
        }
      });
    }
  }

  renderTasks(tasksData = {}) {
    const mergedData = {
      todo: tasksData.todo || [],
      in_progress: [...(tasksData.in_progress || []), ...(tasksData.review || [])],
      done: tasksData.done || [],
    };
    const columns = ['todo', 'in_progress', 'done'];

    columns.forEach((colKey) => {
      const colEl = this.cols[colKey];
      if (!colEl) return;
      colEl.innerHTML = '';

      const tasks = mergedData[colKey] || [];
      tasks.forEach((t) => {
        const card = document.createElement('div');
        card.className = 'kanban-task-card';
        card.style.cssText = 'background: #111420; border: 1px solid var(--border-color); padding: 8px; font-size: 11px; display: flex; flex-direction: column; gap: 4px;';

        const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
        const origin = escape(t.origin || (t.title?.includes('[OPENCLAW]') ? 'OPENCLAW' : (t.title?.includes('[HERMES]') ? 'HERMES' : 'USER')));
        const assigned = escape(t.assigned_cubicle || t.assigned_to || t.assignee || t.assigned_consul || t.owner || 'UNASSIGNED');
        const progress = Math.max(0, Math.min(100, Number(t.progress_percent) || 0));

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span class="badge-tag">${escape(t.priority || 'MEDIUM')}</span>
            <span class="badge-tag tag-cyan">[${origin}]</span>
          </div>
          <details><summary style="color:#62b6ff;cursor:pointer;overflow-wrap:anywhere;">${escape(t.title)}</summary>
            <div style="white-space:pre-wrap;overflow-wrap:anywhere;">${escape(t.description)}</div>
            <small>${escape(t.id)}</small>
          </details>
          <div style="display: flex; justify-content: space-between; font-size: 9px; margin-top: 4px;">
            <span>ASSIGNED: <strong>${assigned.toUpperCase()}</strong></span>
            <span>${progress}%</span>
          </div>
          <div style="height: 3px; background: #1a1e2d;">
            <div style="width: ${progress}%; height: 100%; background: var(--color-amber);"></div>
          </div>
        `;

        colEl.appendChild(card);
      });
    });
  }

  updateProgress(progressData = {}) {
    const percent = progressData.percentage || 0;
    if (this.progressFill) this.progressFill.style.width = `${percent}%`;
    if (this.progressPercent) this.progressPercent.textContent = `${percent}%`;

    if (this.counterTodo) this.counterTodo.textContent = progressData.todo || 0;
    if (this.counterProg) this.counterProg.textContent = progressData.inProgress || 0;
    if (this.counterReview) this.counterReview.textContent = progressData.review || 0;
    if (this.counterDone) this.counterDone.textContent = progressData.done || 0;
  }
}

let taskboardInstance = null;
export async function initTaskboard(app) {
  if (!taskboardInstance) {
    taskboardInstance = new TaskboardViewController(app);
  }
  return taskboardInstance;
}
export function updateTasks(tasks) {
  if (taskboardInstance) {
    taskboardInstance.renderTasks(tasks);
  }
}
export function updateMissionProgress(progress) {
  if (taskboardInstance) {
    taskboardInstance.updateProgress(progress);
  }
}
