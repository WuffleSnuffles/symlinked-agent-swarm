const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

export class QuestionWidgetController {
  constructor() {
    this.container = document.getElementById('consular-question-widget');
    this.questionsQueue = [];
    this.currentIndex = 0;
    this.submitting = new Set();
    this.errors = new Map();
    try {
      this.userResponses = new Map(JSON.parse(sessionStorage.getItem('consular-question-drafts') || '[]'));
    } catch {
      this.userResponses = new Map();
    }
    this.bindGlobalShortcuts();
  }

  bindGlobalShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (this.questionsQueue.length === 0 || !this.container || this.container.classList.contains('hidden')) {
        return;
      }
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

  getCurrentQuestion() {
    return this.questionsQueue[this.currentIndex] || null;
  }

  loadQuestions(questions) {
    const currentId = this.getCurrentQuestion()?.question_id;
    this.questionsQueue = (Array.isArray(questions) ? questions : []).filter(
      (q) => q && (!q.status || q.status === 'PENDING')
    );
    const preservedIdx = currentId
      ? this.questionsQueue.findIndex((q) => q.question_id === currentId)
      : -1;
    this.currentIndex = preservedIdx >= 0 ? preservedIdx : 0;
    this.render();
  }

  addQuestion(question) {
    if (!question || !question.question_id) return;
    if (question.status && question.status !== 'PENDING') {
      this.removeQuestion(question.question_id);
      return;
    }
    const index = this.questionsQueue.findIndex((q) => q.question_id === question.question_id);
    if (index < 0) {
      this.questionsQueue.push(question);
      if (this.questionsQueue.length === 1) {
        this.currentIndex = 0;
      }
    } else {
      this.questionsQueue[index] = question;
    }
    this.render();
  }

  removeQuestion(questionId) {
    this.questionsQueue = this.questionsQueue.filter((q) => q.question_id !== questionId);
    if (this.currentIndex >= this.questionsQueue.length) {
      this.currentIndex = Math.max(0, this.questionsQueue.length - 1);
    }
    this.render();
  }

  prevQuestion() {
    if (this.currentIndex > 0) {
      this.navigate(-1);
    }
  }

  nextQuestion() {
    if (this.currentIndex < this.questionsQueue.length - 1) {
      this.navigate(1);
    }
  }

  navigate(delta) {
    if (this.questionsQueue.length === 0) return;
    this.saveCurrentDraft();
    this.currentIndex = Math.max(0, Math.min(this.questionsQueue.length - 1, this.currentIndex + delta));
    this.render();
    this.container?.querySelector('.widget-prompt-title')?.focus();
  }

  saveCurrentDraft() {
    const q = this.getCurrentQuestion();
    if (!q || !this.container || (q.status && q.status !== 'PENDING')) return;
    const selected = [...this.container.querySelectorAll('.option-input:checked')].map((i) => i.value);
    const customInput = this.container.querySelector('#input-custom-response');
    const customText = customInput ? customInput.value : '';
    this.userResponses.set(q.question_id, {
      selected_option_ids: selected.filter((id) => id !== '__custom__'),
      custom_write_in: selected.includes('__custom__') || customText.trim() ? customText : '',
    });
    try {
      sessionStorage.setItem('consular-question-drafts', JSON.stringify([...this.userResponses]));
    } catch {}
  }

  render() {
    if (!this.container) return;
    const q = this.getCurrentQuestion();
    this.container.classList.toggle('hidden', !q);
    if (!q) {
      this.container.innerHTML = '';
      return;
    }
    const e = escapeHtml;
    const pending = !q.status || q.status === 'PENDING';
    const busy = this.submitting.has(q.question_id);
    const draft = q.user_response || this.userResponses.get(q.question_id) || {
      selected_option_ids: [],
      custom_write_in: '',
    };
    const type = q.is_multi_select ? 'checkbox' : 'radio';
    const total = this.questionsQueue.length;
    const currentNum = this.currentIndex + 1;
    const askingConsul = String(q.asking_consul || 'Nia').toUpperCase();
    const errText = this.errors.get(q.question_id) || '';

    let pillsHtml = '';
    for (let i = 0; i < total; i++) {
      const cls =
        i === this.currentIndex
          ? 'step-pill active'
          : this.userResponses.has(this.questionsQueue[i].question_id)
            ? 'step-pill completed'
            : 'step-pill';
      pillsHtml += `<div class="${cls}"></div>`;
    }

    const optionsHtml = (q.options || [])
      .map((o, idx) => {
        const isSelected = draft.selected_option_ids.includes(o.id);
        const recClass = o.is_recommended ? 'option-recommended' : '';
        return `
          <label class="option-row option-label-wrapper ${recClass} ${isSelected ? 'selected' : ''}" data-option-id="${e(o.id)}">
            <input class="option-input" type="${type}" name="answer" value="${e(o.id)}" ${isSelected ? 'checked' : ''} />
            <span class="option-enumeration-badge">[${idx + 1}]</span>
            <span class="option-body">
              <span class="option-title-row">
                <span class="option-title">${e(o.label)}</span>
                ${o.is_recommended ? `<span class="badge-recommended">RECOMMENDED BY ${e(askingConsul)}</span>` : ''}
              </span>
              ${o.description ? `<span class="option-desc">${e(o.description)}</span>` : ''}
            </span>
          </label>
        `;
      })
      .join('');

    const hasCustom = Boolean(draft.custom_write_in && draft.custom_write_in.trim());
    const customHtml =
      q.allow_custom_write_in !== false
        ? `
          <div class="option-row option-custom-write-in ${hasCustom ? 'selected' : ''}" data-option-id="__custom__">
            <label class="option-label-wrapper">
              <input class="option-input" type="${type}" name="answer" value="__custom__" ${hasCustom ? 'checked' : ''} />
              <span class="option-enumeration-badge">[+]</span>
              <span class="option-body">
                <span class="option-title-row">
                  <span class="option-title">Other / Write your own response</span>
                </span>
                <label class="question-custom-label" for="input-custom-response">Custom instructions or answer</label>
                <div class="write-in-input-wrapper">
                  <textarea class="input-custom-response" id="input-custom-response" rows="2" maxlength="12000" placeholder="Type your custom response here...">${e(draft.custom_write_in || '')}</textarea>
                </div>
              </span>
            </label>
          </div>
        `
        : '';

    this.container.innerHTML = `
      <div class="widget-stepper-header">
        <div class="stepper-origin">
          <span class="consul-badge consul-nia">${e(askingConsul)} ASKS:</span>
          <span class="stepper-indicator">QUESTION ${currentNum} OF ${total}</span>
        </div>
        <div class="stepper-progress-pills">${pillsHtml}</div>
        <div class="stepper-nav-controls">
          <button type="button" class="btn-step-nav" id="btn-step-prev" aria-label="Previous question" ${this.currentIndex === 0 ? 'disabled' : ''}>← PREV</button>
          <button type="button" class="btn-step-nav" id="btn-step-next" aria-label="Next question" ${this.currentIndex === total - 1 ? 'disabled' : ''}>NEXT →</button>
        </div>
      </div>

      <div class="widget-prompt-container">
        <h3 class="widget-prompt-title" id="question-prompt" tabindex="-1">${e(q.prompt)}</h3>
      </div>

      <form class="widget-question-form">
        <fieldset aria-labelledby="question-prompt" ${!pending || busy ? 'disabled' : ''}>
          <div class="widget-options-container">
            ${optionsHtml}
            ${customHtml}
          </div>
          ${
            pending
              ? `
            <div class="widget-action-bar">
              <button type="button" class="btn-widget-skip" id="btn-question-skip">SKIP QUESTION →</button>
              <button type="submit" class="btn-widget-submit" id="btn-question-submit">${busy ? 'SUBMITTING...' : '✓ SUBMIT ANSWER'}</button>
            </div>
          `
              : ''
          }
        </fieldset>
      </form>
      <p role="status" class="question-status ${errText ? 'is-error' : ''}">${e(
        errText || 'Select an option or type a custom response, then click Submit Answer.'
      )}</p>
    `;

    const prevBtn = this.container.querySelector('#btn-step-prev');
    const nextBtn = this.container.querySelector('#btn-step-next');
    const formEl = this.container.querySelector('form');
    const skipBtn = this.container.querySelector('#btn-question-skip');
    const customInput = this.container.querySelector('#input-custom-response');

    if (prevBtn) prevBtn.onclick = () => this.prevQuestion();
    if (nextBtn) nextBtn.onclick = () => this.nextQuestion();
    if (formEl) {
      formEl.onsubmit = (event) => {
        event.preventDefault();
        void this.submitAnswer(q.question_id);
      };
    }
    if (skipBtn) {
      skipBtn.addEventListener('click', () => this.skipQuestion(q.question_id));
    }
    this.container.querySelectorAll('.option-input').forEach((input) => {
      input.addEventListener('change', () => {
        this.saveCurrentDraft();
        this.container.querySelectorAll('.option-row').forEach((row) => {
          const rowInput = row.querySelector('.option-input');
          row.classList.toggle('selected', Boolean(rowInput?.checked));
        });
      });
    });
    if (customInput) {
      customInput.addEventListener('input', () => {
        const customRadio = this.container.querySelector('[value="__custom__"]');
        if (customRadio) customRadio.checked = true;
        this.saveCurrentDraft();
        this.container.querySelectorAll('.option-row').forEach((row) => {
          const rowInput = row.querySelector('.option-input');
          row.classList.toggle('selected', Boolean(rowInput?.checked));
        });
      });
      customInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          void this.submitAnswer(q.question_id);
        }
      });
    }
  }

  async submitAnswer(id, skipped = false) {
    const current = this.getCurrentQuestion();
    if (this.submitting.has(id) || (current && current.status && current.status !== 'PENDING')) return;
    this.saveCurrentDraft();
    const draft = this.userResponses.get(id) || { selected_option_ids: [], custom_write_in: '' };
    if (!skipped && !draft.selected_option_ids.length && !draft.custom_write_in.trim()) {
      this.errors.set(id, 'Select an option or write an answer.');
      this.render();
      return;
    }
    this.submitting.add(id);
    this.errors.delete(id);
    this.render();
    try {
      const response = await fetch(`/api/governance/questions/${encodeURIComponent(id)}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(skipped ? { skipped: true } : draft),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Answer could not be saved. Please retry.');
      }
      this.userResponses.delete(id);
      this.errors.delete(id);
      try {
        sessionStorage.setItem('consular-question-drafts', JSON.stringify([...this.userResponses]));
      } catch {}
      this.removeQuestion(id);
    } catch (error) {
      this.errors.set(id, error.message);
    } finally {
      this.submitting.delete(id);
      this.render();
    }
  }

  skipQuestion(id) {
    return this.submitAnswer(id, true);
  }
}

let instance;
export function initQuestionWidget() {
  return (instance ||= new QuestionWidgetController());
}
export function getQuestionWidget() {
  return instance;
}
