/**
 * src/public/js/prompt-attachment.js
 *
 * File & Folder Prompt Attachment System.
 * Features:
 * - Multi-file selection (<input type="file" multiple>).
 * - Directory/folder selection (<input webkitdirectory>).
 * - Drag-and-drop hierarchy scanner (DataTransferItem.webkitGetAsEntry).
 * - Server-backed local filesystem browser modal (/api/filesystem/browse).
 * - Removable Brutalist attachment chips.
 */

export class PromptAttachmentManager {
  constructor() {
    this.stagedAttachments = []; // Array of { id, type: 'FILE' | 'FOLDER', name, path, size, fileCount, rawFile? }
    this.chipsBar = document.getElementById('prompt-attachments-bar');
    this.dropzone = document.getElementById('prompt-dropzone');
    this.dragOverlay = document.getElementById('dropzone-drag-overlay');
    this.tokenEstimateEl = document.getElementById('prompt-token-estimate');

    // Inputs & buttons
    this.inputFile = document.getElementById('input-file-picker');
    this.inputFolder = document.getElementById('input-folder-picker');
    this.btnAttachFile = document.getElementById('btn-attach-file');
    this.btnAttachFolder = document.getElementById('btn-attach-folder');
    this.btnBrowseDisk = document.getElementById('btn-browse-disk');

    // Disk Browser Modal
    this.browserModal = document.getElementById('file-browser-modal');
    this.btnCloseBrowser = document.getElementById('btn-close-disk-browser');
    this.browserTree = document.getElementById('browser-tree-container');
    this.browserPathText = document.getElementById('browser-current-path-text');
    this.btnBrowserUp = document.getElementById('btn-browser-up-dir');
    this.btnInsertSelected = document.getElementById('btn-insert-selected-paths');
    this.browserSelectedCountEl = document.getElementById('browser-selected-count');

    this.currentDiskPath = '.';
    this.parentDiskPath = null;
    this.selectedDiskItems = new Set();

    this.bindEvents();
  }

  bindEvents() {
    // 1. File Picker
    if (this.btnAttachFile && this.inputFile) {
      this.btnAttachFile.addEventListener('click', () => this.inputFile.click());
      this.inputFile.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files) {
          for (let i = 0; i < files.length; i++) {
            this.addFileAttachment(files[i]);
          }
        }
        this.inputFile.value = '';
      });
    }

    // 2. Folder Picker (webkitdirectory)
    if (this.btnAttachFolder && this.inputFolder) {
      this.btnAttachFolder.addEventListener('click', () => this.inputFolder.click());
      this.inputFolder.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
          this.addFolderFromFileList(files);
        }
        this.inputFolder.value = '';
      });
    }

    // 3. Clipboard Image/File Paste on Prompt Input, Dropzone & Console Document
    const handleClipboardPaste = (e) => {
      if (e._panopticonPasteHandled) return;
      const clipboard = e.clipboardData;
      if (!clipboard) return;

      const extractedFiles = [];
      if (clipboard.items && clipboard.items.length > 0) {
        for (let i = 0; i < clipboard.items.length; i++) {
          const item = clipboard.items[i];
          if (item.kind === 'file') {
            const f = item.getAsFile();
            if (f) extractedFiles.push(f);
          }
        }
      } else if (clipboard.files && clipboard.files.length > 0) {
        for (let i = 0; i < clipboard.files.length; i++) {
          extractedFiles.push(clipboard.files[i]);
        }
      }

      if (extractedFiles.length === 0) return;

      e._panopticonPasteHandled = true;
      for (const file of extractedFiles) {
        const ext = ((file.type && file.type.split('/')[1]) || 'png').replace(/[^a-z0-9]/gi, '');
        const namedFile =
          file.name && file.name !== 'image.png'
            ? file
            : new File([file], `clipboard-${Date.now()}.${ext}`, { type: file.type || 'image/png' });
        this.addFileAttachment(namedFile);
      }
      e.preventDefault();
    };

    const promptInput = document.getElementById('overseer-prompt-input');
    if (promptInput) promptInput.addEventListener('paste', handleClipboardPaste);
    if (this.dropzone) this.dropzone.addEventListener('paste', handleClipboardPaste);
    document.addEventListener('paste', (e) => {
      const active = document.activeElement;
      const isOtherInput =
        active &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') &&
        active.id !== 'overseer-prompt-input';
      if (!isOtherInput) {
        handleClipboardPaste(e);
      }
    });

    // 4. Drag and Drop Zone
    if (this.dropzone) {
      this.dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (this.dragOverlay) this.dragOverlay.style.display = 'flex';
      });

      this.dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        if (this.dragOverlay && !this.dropzone.contains(e.relatedTarget)) {
          this.dragOverlay.style.display = 'none';
        }
      });

      this.dropzone.addEventListener('drop', async (e) => {
        e.preventDefault();
        if (this.dragOverlay) this.dragOverlay.style.display = 'none';

        const items = e.dataTransfer.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.webkitGetAsEntry) {
            const entry = item.webkitGetAsEntry();
            if (entry) {
              await this.processFsEntry(entry);
            }
          } else {
            const file = item.getAsFile();
            if (file) this.addFileAttachment(file);
          }
        }
      });
    }

    // 4. Disk Browser Modal
    if (this.btnBrowseDisk && this.browserModal) {
      this.btnBrowseDisk.addEventListener('click', () => {
        this.openDiskBrowser();
      });
    }
    if (this.btnCloseBrowser && this.browserModal) {
      this.btnCloseBrowser.addEventListener('click', () => {
        this.browserModal.classList.add('hidden');
      });
    }
    if (this.btnBrowserUp) {
      this.btnBrowserUp.addEventListener('click', () => {
        if (this.parentDiskPath) {
          this.loadDiskPath(this.parentDiskPath);
        }
      });
    }
    if (this.btnInsertSelected) {
      this.btnInsertSelected.addEventListener('click', () => {
        this.insertSelectedFromDisk();
      });
    }
  }

  async processFsEntry(entry, currentPath = '') {
    if (entry.isFile) {
      entry.file((file) => {
        this.addFileAttachment(file, currentPath ? `${currentPath}/${entry.name}` : entry.name);
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const files = [];
      let totalBytes = 0;

      const readBatch = () => {
        return new Promise((resolve) => {
          dirReader.readEntries(async (entries) => {
            if (entries.length === 0) {
              resolve();
            } else {
              for (const child of entries) {
                if (child.isFile) {
                  const f = await new Promise((r) => child.file(r));
                  files.push(f);
                  totalBytes += f.size;
                } else if (child.isDirectory) {
                  await this.processFsEntry(child, `${currentPath}/${entry.name}`);
                }
              }
              await readBatch();
              resolve();
            }
          });
        });
      };

      await readBatch();

      if (files.length > 0) {
        this.stagedAttachments.push({
          id: 'att_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          type: 'FOLDER',
          name: entry.name,
          path: currentPath ? `${currentPath}/${entry.name}/` : `${entry.name}/`,
          size: totalBytes,
          fileCount: files.length,
        });
        this.renderChips();
      }
    }
  }

  addFileAttachment(file, customPath = null) {
    const isImage =
      file &&
      ((typeof file.type === 'string' && file.type.startsWith('image/')) ||
        /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name || ''));
    const previewUrl =
      isImage && typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(file) : null;
    const attObj = {
      id: 'att_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      type: isImage ? 'IMAGE' : 'FILE',
      name: file.name,
      path: customPath || file.name,
      size: file.size,
      rawFile: file,
      previewUrl,
      url: previewUrl,
      dataUrl: null,
    };
    this.stagedAttachments.push(attObj);
    this.renderChips();

    if (isImage && typeof FileReader !== 'undefined') {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          attObj.dataUrl = reader.result;
          attObj.url = reader.result;
          attObj.previewUrl = reader.result;
          this.renderChips();
        }
      };
      reader.readAsDataURL(file);
    }
  }

  addFolderFromFileList(fileList) {
    let totalBytes = 0;
    let folderName = 'folder';

    if (fileList[0] && fileList[0].webkitRelativePath) {
      const parts = fileList[0].webkitRelativePath.split('/');
      if (parts.length > 1) {
        folderName = parts[0];
      }
    }

    for (let i = 0; i < fileList.length; i++) {
      totalBytes += fileList[i].size;
    }

    this.stagedAttachments.push({
      id: 'att_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      type: 'FOLDER',
      name: folderName,
      path: `${folderName}/`,
      size: totalBytes,
      fileCount: fileList.length,
    });
    this.renderChips();
  }

  removeAttachment(id) {
    this.stagedAttachments = this.stagedAttachments.filter((att) => att.id !== id);
    this.renderChips();
  }

  clearAttachments() {
    this.stagedAttachments = [];
    this.renderChips();
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  renderChips() {
    if (!this.chipsBar) return;
    this.chipsBar.innerHTML = '';

    if (this.stagedAttachments.length === 0) {
      this.chipsBar.style.display = 'none';
      if (this.tokenEstimateEl) this.tokenEstimateEl.textContent = '0 TOKENS';
      return;
    }

    this.chipsBar.style.display = 'flex';
    let totalEstimatedTokens = 0;

    this.stagedAttachments.forEach((att) => {
      const chip = document.createElement('div');
      chip.className = `attachment-chip chip-${att.type.toLowerCase()}`;
      chip.setAttribute('data-attachment-id', att.id);

      const sizeStr = this.formatBytes(att.size);
      const detailStr = att.type === 'FOLDER' ? `${att.fileCount} files (${sizeStr})` : sizeStr;

      const imgSrc = att.dataUrl || att.url || att.previewUrl;
      const thumbHtml = imgSrc
        ? `<img class="chip-thumb" src="${imgSrc}" alt="${att.name}" style="width: 32px; height: 32px; object-fit: cover; border-radius: 2px; border: 1px solid var(--color-cyan);" />`
        : `<span class="chip-badge">${att.type}</span>`;

      chip.innerHTML = `
        ${thumbHtml}
        <span class="chip-path" title="${att.path}">${att.path}</span>
        <span class="chip-stat">${detailStr}</span>
        <button type="button" class="chip-btn-remove" title="Remove attachment">×</button>
      `;

      chip.querySelector('.chip-btn-remove').addEventListener('click', () => {
        this.removeAttachment(att.id);
      });

      this.chipsBar.appendChild(chip);

      // Rough token estimate: ~4 bytes per token
      totalEstimatedTokens += Math.round(att.size / 4);
    });

    if (this.tokenEstimateEl) {
      this.tokenEstimateEl.textContent = `~${totalEstimatedTokens.toLocaleString()} EST. TOKENS`;
    }
  }

  // Disk Browser Methods
  async openDiskBrowser() {
    if (!this.browserModal) return;
    this.browserModal.classList.remove('hidden');
    this.selectedDiskItems.clear();
    this.updateSelectedCount();
    await this.loadDiskPath('.');
  }

  async loadDiskPath(targetPath) {
    try {
      const res = await fetch(`/api/filesystem/browse?path=${encodeURIComponent(targetPath)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      this.currentDiskPath = data.currentPath;
      this.parentDiskPath = data.parentPath;

      if (this.browserPathText) {
        this.browserPathText.textContent = data.currentPath;
      }
      if (this.btnBrowserUp) {
        this.btnBrowserUp.disabled = !this.parentDiskPath;
      }

      this.renderDiskTree(data.directories, data.files);
    } catch (err) {
      if (this.browserTree) {
        this.browserTree.innerHTML = `<div style="padding: 12px; color: var(--color-crimson);">Error loading directory: ${err.message}</div>`;
      }
    }
  }

  renderDiskTree(directories, files) {
    if (!this.browserTree) return;
    this.browserTree.innerHTML = '';

    // Directories
    directories.forEach((dir) => {
      const row = document.createElement('div');
      row.className = 'browser-item-row is-dir';

      const isChecked = this.selectedDiskItems.has(dir.path);
      row.innerHTML = `
        <input type="checkbox" class="browser-item-checkbox" ${isChecked ? 'checked' : ''} />
        <span class="browser-item-icon">📁</span>
        <span class="browser-item-name">${dir.name}/</span>
      `;

      const cb = row.querySelector('.browser-item-checkbox');
      cb.addEventListener('click', (e) => {
        e.stopPropagation();
        if (cb.checked) {
          this.selectedDiskItems.add(dir.path);
        } else {
          this.selectedDiskItems.delete(dir.path);
        }
        this.updateSelectedCount();
      });

      row.addEventListener('click', () => {
        this.loadDiskPath(dir.path);
      });

      this.browserTree.appendChild(row);
    });

    // Files
    files.forEach((file) => {
      const row = document.createElement('div');
      row.className = 'browser-item-row is-file';

      const isChecked = this.selectedDiskItems.has(file.path);
      row.innerHTML = `
        <input type="checkbox" class="browser-item-checkbox" ${isChecked ? 'checked' : ''} />
        <span class="browser-item-icon">📄</span>
        <span class="browser-item-name">${file.name}</span>
        <span class="browser-item-size">${this.formatBytes(file.size)}</span>
      `;

      const cb = row.querySelector('.browser-item-checkbox');
      cb.addEventListener('click', (e) => {
        e.stopPropagation();
        if (cb.checked) {
          this.selectedDiskItems.add(file.path);
        } else {
          this.selectedDiskItems.delete(file.path);
        }
        this.updateSelectedCount();
      });

      this.browserTree.appendChild(row);
    });
  }

  updateSelectedCount() {
    if (this.browserSelectedCountEl) {
      this.browserSelectedCountEl.textContent = `${this.selectedDiskItems.size} SELECTED`;
    }
  }

  insertSelectedFromDisk() {
    this.selectedDiskItems.forEach((fullPath) => {
      const isDir = fullPath.endsWith('/') || fullPath.endsWith('\\');
      const name = fullPath.split(/[\/\\]/).filter(Boolean).pop() || fullPath;

      this.stagedAttachments.push({
        id: 'att_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        type: isDir ? 'FOLDER' : 'FILE',
        name,
        path: fullPath,
        size: 1024, // Disk reference
        fileCount: isDir ? 1 : undefined,
      });
    });

    this.renderChips();
    if (this.browserModal) {
      this.browserModal.classList.add('hidden');
    }
  }

  getStagedAttachments() {
    return this.stagedAttachments.map(({ rawFile, ...rest }) => ({
      ...rest,
      url: rest.dataUrl || rest.url || rest.previewUrl || null,
      previewUrl: rest.dataUrl || rest.previewUrl || rest.url || null,
    }));
  }

  async getSerializableAttachments() {
    return Promise.all(
      this.stagedAttachments.map(async ({ rawFile, previewUrl, dataUrl, ...attachment }) => {
        let resolvedUrl = dataUrl || attachment.url || previewUrl || null;
        if (attachment.type === 'IMAGE' && rawFile && (!resolvedUrl || resolvedUrl.startsWith('blob:'))) {
          try {
            resolvedUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = () => reject(new Error(`Could not read ${attachment.name}`));
              reader.readAsDataURL(rawFile);
            });
          } catch {}
        }
        return {
          ...attachment,
          url: resolvedUrl,
          previewUrl: resolvedUrl,
        };
      })
    );
  }
}

let attachmentManagerInstance =
  (typeof window !== 'undefined' && window.__panopticonAttachmentManager) || null;
export function initPromptAttachments() {
  if (typeof window !== 'undefined' && window.__panopticonAttachmentManager) {
    attachmentManagerInstance = window.__panopticonAttachmentManager;
    return attachmentManagerInstance;
  }
  if (!attachmentManagerInstance) {
    attachmentManagerInstance = new PromptAttachmentManager();
    if (typeof window !== 'undefined') {
      window.__panopticonAttachmentManager = attachmentManagerInstance;
    }
  }
  return attachmentManagerInstance;
}
export function getPromptAttachments() {
  if (typeof window !== 'undefined' && window.__panopticonAttachmentManager) {
    return window.__panopticonAttachmentManager;
  }
  return attachmentManagerInstance;
}
