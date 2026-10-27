// Build links, tables, images, and flowcharts with DOM APIs so message text never becomes executable markup.
export function renderConsoleText(container, content) {
  const text = String(content || '');
  const blockPattern = /```(mermaid|flowchart)\s*\n([\s\S]*?)```|((?:^\|.+\|\s*\n?){2,})/gm;
  let blockOffset = 0;
  for (const block of text.matchAll(blockPattern)) {
    renderInlineText(container, text.slice(blockOffset, block.index));
    if (block[1]) {
      container.append(renderFlowchartBlock(block[2]));
    } else if (block[3]) {
      container.append(renderMarkdownTable(block[3]));
    }
    blockOffset = block.index + block[0].length;
  }
  renderInlineText(container, text.slice(blockOffset));
}

function renderInlineText(container, text) {
  const tokenRegex = /!\[([^\]\n]*)\]\((file:\/\/\/[^\s<>)]+|https?:\/\/[^\s<>)]+|\/[^\s<>)]+)\)|\[([^\]\n]+)\]\((file:\/\/\/[^\s<>)]+|https?:\/\/[^\s<>)]+)\)|file:\/\/\/[^\s<>"`\)\],]+/gi;
  let offset = 0;
  for (const match of text.matchAll(tokenRegex)) {
    container.append(document.createTextNode(text.slice(offset, match.index)));
    if (match[0].startsWith('![')) {
      const alt = match[1] || 'Console image';
      const rawTarget = match[2];
      const imgUrl = rawTarget.startsWith('file:///')
        ? `/api/media/serve?path=${encodeURIComponent(decodeURIComponent(new URL(rawTarget).pathname).replace(/^\/(?=[a-z]:\/)/i, ''))}`
        : rawTarget;
      const img = document.createElement('img');
      img.src = imgUrl;
      img.alt = alt;
      img.style.cssText = 'max-width: 100%; max-height: 220px; display: block; margin: 6px 0; border: 1px solid #38bdf8; border-radius: 3px; cursor: pointer;';
      img.addEventListener('click', () => openFilePreview(imgUrl, alt, rawTarget));
      container.append(img);
      offset = match.index + match[0].length;
      continue;
    }
    const target = match[4] || match[0];
    try {
      const url = new URL(target);
      const local = url.protocol === 'file:';
      const path = local ? decodeURIComponent(url.pathname).replace(/^\/(?=[a-z]:\/)/i, '') : '';
      const label = (match[3] || path.split('/').pop() || target).replace(/^`|`$/g, '');
      const link = document.createElement('a');
      link.className = 'console-blue-link';
      link.textContent = local ? `📄 ${label}` : `🔗 ${label}`;
      link.title = local ? `Click to inspect: ${path}` : target;
      link.style.cssText =
        'color: #38bdf8; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 3px; padding: 1px 6px; text-decoration: underline; cursor: pointer; font-weight: 600; display: inline-block; margin: 1px 2px;';
      link.href = local ? `/api/media/serve?path=${encodeURIComponent(path)}` : url.href;
      if (local) {
        link.addEventListener('click', (event) => {
          event.preventDefault();
          openFilePreview(link.href, label, path);
        });
      } else {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      container.append(link);
    } catch {
      container.append(document.createTextNode(match[0]));
    }
    offset = match.index + match[0].length;
  }
  container.append(document.createTextNode(text.slice(offset)));
}

function renderMarkdownTable(rawTable) {
  const lines = rawTable.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  const table = document.createElement('table');
  table.style.cssText = 'width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 12px; background: #0a0d14; border: 1px solid #1e293b;';
  lines.forEach((line, idx) => {
    if (/^\|[\s:-]+\|$/.test(line.replace(/\|/g, '|'))) {
      const cellsOnly = line.split('|').slice(1, -1);
      if (cellsOnly.every((c) => /^[\s:-]+$/.test(c))) return;
    }
    const tr = document.createElement('tr');
    const cells = line.split('|').slice(1, -1);
    cells.forEach((cell) => {
      const el = document.createElement(idx === 0 ? 'th' : 'td');
      el.style.cssText = 'border: 1px solid #1e293b; padding: 4px 8px; text-align: left;';
      if (idx === 0) el.style.color = '#38bdf8';
      el.textContent = cell.trim();
      tr.append(el);
    });
    table.append(tr);
  });
  return table;
}

function renderFlowchartBlock(rawChart) {
  const box = document.createElement('div');
  box.style.cssText = 'margin: 6px 0; padding: 8px 10px; background: #080c14; border: 1px solid #38bdf8; border-radius: 3px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center;';
  const edges = rawChart.split(/\n|;/).map((l) => l.trim()).filter((l) => l && !/^(graph|flowchart)\b/i.test(l));
  edges.forEach((edge, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.style.color = '#64748b';
      sep.textContent = '•';
      box.append(sep);
    }
    const parts = edge.split(/-->|->/);
    parts.forEach((part, pi) => {
      if (pi > 0) {
        const arrow = document.createElement('span');
        arrow.style.cssText = 'color: #38bdf8; font-weight: 700;';
        arrow.textContent = '→';
        box.append(arrow);
      }
      const node = document.createElement('span');
      node.style.cssText = 'background: #111827; border: 1px solid #334155; padding: 2px 6px; border-radius: 3px; color: #e2e8f0; font-size: 10px;';
      node.textContent = part.replace(/[\[\]"]/g, '').trim();
      box.append(node);
    });
  });
  return box;
}

async function openFilePreview(url, label, rawPath = '') {
  const dialog = document.createElement('dialog');
  dialog.style.cssText =
    'width: min(880px, 88vw); max-height: 82vh; background: #0d111a; color: #e4ebff; border: 1px solid #38bdf8; box-shadow: 0 0 28px rgba(56, 189, 248, 0.25); padding: 16px 20px; font-family: monospace;';
  const header = document.createElement('div');
  header.style.cssText =
    'display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 10px; margin-bottom: 12px;';
  const titleWrap = document.createElement('div');
  const title = document.createElement('strong');
  title.style.cssText = 'color: #38bdf8; font-size: 13px;';
  title.textContent = `📄 ${label}`;
  const subtitle = document.createElement('div');
  subtitle.style.cssText = 'color: #64748b; font-size: 10px; margin-top: 2px; word-break: break-all;';
  subtitle.textContent = rawPath || url;
  titleWrap.append(title, subtitle);

  const close = document.createElement('button');
  close.textContent = 'CLOSE [ESC]';
  close.className = 'brutalist-btn';
  close.style.cssText = 'cursor: pointer; padding: 4px 10px; font-size: 11px;';
  close.addEventListener('click', () => dialog.close());
  header.append(titleWrap, close);

  const body = document.createElement('pre');
  body.style.cssText =
    'white-space: pre-wrap; overflow-wrap: anywhere; max-height: 64vh; overflow: auto; margin: 0; padding: 12px; background: #07090e; border: 1px solid #1e293b; font-size: 11px; line-height: 1.5;';
  body.textContent = 'Loading file preview…';

  dialog.append(header, body);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  document.body.append(dialog);
  dialog.showModal();

  const ext = (label.split('.').pop() || '').toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
    body.replaceChildren();
    const img = document.createElement('img');
    img.src = url;
    img.alt = label;
    img.style.cssText = 'max-width: 100%; max-height: 60vh; display: block; margin: 0 auto;';
    body.append(img);
    return;
  }

  try {
    let response = await fetch(url, { cache: 'no-store' });
    // If a task file moved between Kanban columns (todo/in_progress/review/done), locate it automatically
    if (!response.ok && rawPath.includes('.swarm/tasks/')) {
      const fileName = rawPath.split('/').pop();
      for (const col of ['todo', 'in_progress', 'review', 'done']) {
        const altPath = rawPath.replace(/\.swarm\/tasks\/[^/]+\/[^/]+$/, `.swarm/tasks/${col}/${fileName}`);
        const altRes = await fetch(`/api/media/serve?path=${encodeURIComponent(altPath)}`, { cache: 'no-store' });
        if (altRes.ok) {
          response = altRes;
          subtitle.textContent = `${altPath} (moved to ${col})`;
          break;
        }
      }
    }
    if (!response.ok) throw new Error(`File unavailable (${response.status})`);
    const text = await response.text();
    try {
      body.textContent = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      body.textContent = text;
    }
  } catch (error) {
    body.textContent = error.message;
  }
}
