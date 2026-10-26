/**
 * src/public/js/question-widget.js
 *
 * Antigravity/Claude/GPT-Style Interactive Multiple-Choice Question Widget.
 * Features:
 * - Question X of Y stepper with left/right arrow navigation (← / →).
 * - Single-select and multi-select support (is_multi_select).
 * - Enumerated options with (Recommended) badges.
 * - Default custom write-in field (Other / Write your own response...).
 * - Skip and Submit handlers calling POST /api/governance/questions/:id/answer.
 */

export class QuestionWidgetController {
  constructor() {
    this.container = document.getElementById('consular-question-widget');
    this.questionsQueue = [];
    this.currentIndex = 0;
    this.userResponses = new Map(); // question_id -> { selected_option_ids, custom_write_in }

    this.bindGlobalShortcuts();
  }

  bindGlobalShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (this.questionsQueue.length === 0 || !this.container || this.container.classList.contains('hidden')) {
        return;
      }
      // If typing in input, ignore arrows
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      if (e.key === 'ArrowLeft') {
        this.prevQuestion();
      } else if (e.key === 'ArrowRight') {
        this.nextQuestion();
      }
    });
  }

  loadQuestions(questions) {
    this.questionsQueue = questions.filter((q) => q.status === 'PENDING');
    this.currentIndex = 0;
    if (this.questionsQueue.length > 0) {
      this.render();
      if (this.container) this.container.classList.remove('hidden');
    } else {
      if (this.container) this.container.classList.add('hidden');
    }
  }

  addQuestion(question) {
    if (!this.questionsQueue.some((q) => q.question_id === question.question_id)) {
      this.questionsQueue.push(question);
      if (this.questionsQueue.length === 1) {
        this.currentIndex = 0;
      }
      this.render();
      if (this.container) this.container.classList.remove('hidden');
    }
  }

  getCurrentQuestion() {
    return this.questionsQueue[this.currentIndex] || null;
  }

  prevQuestion() {
    if (this.currentIndex > 0) {
      this.saveCurrentDraft();
      this.currentIndex--;
      this.render();
    }
  }

  nextQuestion() {
    if (this.currentIndex < this.questionsQueue.length - 1) {
      this.saveCurrentDraft();
      this.currentIndex++;
      this.render();
    }
  }

  saveCurrentDraft() {
    const q = this.getCurrentQuestion();
    if (!q || !this.container) return;

    const selectedIds = [];
    const inputs = this.container.querySelectorAll('.option-input:checked');
    inputs.forEach((input) => {
      if (input.value !== '__custom__') {
        selectedIds.push(input.value);
      }
    });

    const writeInInput = this.container.querySelector('#input-custom-response');
    const customText = writeInInput ? writeInInput.value.trim() : '';

    this.userResponses.set(q.question_id, {
      selected_option_ids: selectedIds,
      custom_write_in: customText,
    });
  }

  render() {
    if (!this.container) return;
    const q = this.getCurrentQuestion();
    if (!q) {
      this.container.classList.add('hidden');
      return;
    }

    const total = this.questionsQueue.length;
    const currentNum = this.currentIndex + 1;
    const draft = this.userResponses.get(q.question_id) || { selected_option_ids: [], custom_write_in: '' };

    // Build Stepper Pills
    let pillsHtml = '';
    for (let i = 0; i < total; i++) {
      const cls = i === this.currentIndex ? 'step-pill active' : (this.userResponses.has(this.questionsQueue[i].question_id) ? 'step-pill completed' : 'step-pill');
      pillsHtml += `<div class="${cls}"></div>`;
    }

    // Build Options
    let optionsHtml = '';
    const inputType = q.is_multi_select ? 'checkbox' : 'radio';

    q.options.forEach((opt, idx) => {
      const isSelected = draft.selected_option_ids.includes(opt.id);
      const isRec = opt.is_recommended;
      const recClass = isRec ? 'option-recommended' : '';
      const recBadge = isRec ? `<span class="badge-recommended">RECOMMENDED BY ${q.asking_consul.toUpperCase()}</span>` : '';
      const descHtml = opt.description ? `<p class="option-desc">${opt.description}</p>` : '';

      optionsHtml += `
        <div class="option-row ${recClass} ${isSelected ? 'selected' : ''}" data-option-id="${opt.id}">
          <label class="option-label-wrapper">
            <input type="${inputType}" name="consular_option_${q.question_id}" value="${opt.id}" class="option-input" ${isSelected ? 'checked' : ''} />
            <span class="option-enumeration-badge">[${idx + 1}]</span>
            <div class="option-body">
              <div class="option-title-row">
                <span class="option-title">${opt.label}</span>
                ${recBadge}
              </div>
              ${descHtml}
            </div>
          </label>
        </div>
      `;
    });

    // Default Custom Write-In Option
    const hasCustomText = Boolean(draft.custom_write_in);
    const isCustomSelected = hasCustomText;

    optionsHtml += `
      <div class="option-row option-custom-write-in ${isCustomSelected ? 'selected' : ''}" data-option-id="__custom__">
        <label class="option-label-wrapper">
          <input type="${inputType}" name="consular_option_${q.question_id}" value="__custom__" class="option-input" ${isCustomSelected ? 'checked' : ''} />
          <span class="option-enumeration-badge">[+]</span>
          <div class="option-body">
            <div class="option-title-row">
              <span class="option-title">Other / Write your own response...</span>
            </div>
            <div class="write-in-input-wrapper">
              <input
                type="text"
                class="input-custom-response"
                id="input-custom-response"
                placeholder="Type your custom response or instructions..."
                value="${draft.custom_write_in || ''}"
              />
            </div>
          </div>
        </label>
      </div>
    `;

    this.container.innerHTML = `
      <div class="widget-stepper-header">
        <div class="stepper-origin">
          <span class="consul-badge consul-nia">${(q.asking_consul || 'NIA').toUpperCase()} ASKS:</span>
          <span class="stepper-indicator">QUESTION ${currentNum} OF ${total}</span>
        </div>
        <div class="stepper-progress-pills">${pillsHtml}</div>
        <div class="stepper-nav-controls">
          <button type="button" class="btn-step-nav" id="btn-step-prev" ${this.currentIndex === 0 ? 'disabled' : ''}>←</button>
          <button type="button" class="btn-step-nav" id="btn-step-next" ${this.currentIndex === total - 1 ? 'disabled' : ''}>→</button>
        </div>
      </div>

      <div class="widget-prompt-container">
        <h3 class="widget-prompt-title">${q.prompt}</h3>
      </div>

      <div class="widget-options-container">
        ${optionsHtml}
      </div>

      <div class="widget-action-bar">
        <div class="action-left">
          <button type="button" class="btn-widget-skip" id="btn-question-skip">
            SKIP QUESTION <span class="skip-arrow">→</span>
          </button>
        </div>
        <div class="action-right">
          <button type="button" class="btn-widget-submit" id="btn-question-submit">
            <span class="submit-icon">✓</span> SUBMIT & COMMIT PREFERENCE
          </button>
        </div>
      </div>
    `;

    this.wireListeners(q);
  }

  wireListeners(question) {
    const prevBtn = this.container.querySelector('#btn-step-prev');
    const nextBtn = this.container.querySelector('#btn-step-next');
    const skipBtn = this.container.querySelector('#btn-question-skip');
    const submitBtn = this.container.querySelector('#btn-question-submit');
    const customInput = this.container.querySelector('#input-custom-response');

    if (prevBtn) prevBtn.addEventListener('click', () => this.prevQuestion());
    if (nextBtn) nextBtn.addEventListener('click', () => this.nextQuestion());

    if (customInput) {
      customInput.addEventListener('input', () => {
        const customRadio = this.container.querySelector('input[value="__custom__"]');
        if (customRadio) customRadio.checked = true;
      });
      customInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.submitAnswer(question.question_id);
        }
      });
    }

    if (skipBtn) {
      skipBtn.addEventListener('click', () => this.skipQuestion(question.question_id));
    }
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitAnswer(question.question_id));
    }
  }

  async skipQuestion(questionId) {
    try {
      await fetch(`/api/governance/questions/${encodeURIComponent(questionId)}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skipped: true }),
      });
    } catch {}

    this.advanceQueue(questionId);
  }

  async submitAnswer(questionId) {
    this.saveCurrentDraft();
    const draft = this.userResponses.get(questionId) || { selected_option_ids: [], custom_write_in: '' };

    try {
      const res = await fetch(`/api/governance/questions/${encodeURIComponent(questionId)}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_option_ids: draft.selected_option_ids,
          custom_write_in: draft.custom_write_in,
          skipped: false,
        }),
      });

      if (res.ok) {
        // Flash confirmation
        const submitBtn = this.container.querySelector('#btn-question-submit');
        if (submitBtn) {
          submitBtn.textContent = '✓ COMMITTED';
          submitBtn.style.background = 'var(--color-phosphor)';
        }
      }
    } catch {}

    setTimeout(() => {
      this.advanceQueue(questionId);
    }, 400);
  }

  advanceQueue(questionId) {
    this.questionsQueue = this.questionsQueue.filter((q) => q.question_id !== questionId);
    if (this.currentIndex >= this.questionsQueue.length) {
      this.currentIndex = Math.max(0, this.questionsQueue.length - 1);
    }
    this.render();
  }
}

let questionWidgetInstance = null;
export function initQuestionWidget() {
  if (!questionWidgetInstance) {
    questionWidgetInstance = new QuestionWidgetController();
  }
  return questionWidgetInstance;
}
export function getQuestionWidget() {
  return questionWidgetInstance;
}
