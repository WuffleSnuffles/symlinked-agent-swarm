# Technical Architecture & Implementation Blueprint: Milestone 3 (Twin Sauron, Prompt Attachments, Multimodal Media, Question Stepper)

**Author**: `explorer_m3_2` (Teamwork Explorer / Read-Only Analyst)  
**Date**: 2026-10-26T02:45:00Z  
**Project**: Symlinked Agent Swarm System & Brutalist Dystopian Cyberpunk Panopticon  
**Working Directory**: `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m3_2`  
**Target Milestone**: Milestone 3 (Features 8, 14, 15, 16)  

---

## 1. Observation

Direct code and specification observations gathered across the repository:

### 1.1 Specification Citations from `ORIGINAL_REQUEST.md` & `PROJECT.md`
- **Twin Eyes of Sauron (`ORIGINAL_REQUEST.md` lines 99-106, `PROJECT.md` lines 38-39)**:
  > "The Left Panopticon section (above the 4x4 cubicle grid) must now feature TWO Eyes of Sauron (Consul I and Consul II hovering side by side), each casting its own animated red surveillance spotlight beam across the 4x4 grid, and converging both spotlights onto a cubicle during a joint Consular Review or error investigation."
- **Prompt Attachment System (`ORIGINAL_REQUEST.md` lines 188-194, `PROJECT.md` line 45)**:
  > "Dedicated buttons in the Center Console prompt bar supporting both single/multi-file selection (`<input type="file" multiple>`) and directory/folder selection (`webkitdirectory` / directory picker + an interactive server-backed local file/folder browser modal so full local disk paths can also be browsed and attached directly)... Dragging and dropping files or folders (`DataTransferItem.webkitGetAsEntry()`) onto the Center Console attaches them immediately... Render attached files and folders as removable brutalist chips... pass the attached files and folder structures/contents into Consul Nia Nova and Consul Ferric Lunaux's Gate 1 deliberation context and attach them to the resulting cubicle task definitions and allowed file scopes."
- **Multimodal Media Display (`ORIGINAL_REQUEST.md` lines 200-210, `PROJECT.md` line 46)**:
  > "the .exe UI and backend (`/api/media/...` serving endpoint with proper MIME types `application/pdf`, `image/*`, `video/*`, `audio/*`) must natively display: PDFs (`.pdf`): Inline embedded `<iframe/embed>` PDF viewer + full-screen/modal PDF inspector; Images: Inline image cards + click-to-zoom Panopticon Lightbox; Videos: Inline HTML5 `<video controls>` player with scrubbing/fullscreen; Audio / Code / Markdown Artifacts."
- **Interactive Question Widget (`ORIGINAL_REQUEST.md` lines 218-228, `PROJECT.md` lines 47, 301-330)**:
  > "interactive Multiple-Choice Question Card / Modal (modeled after Antigravity's ask_question UI, Claude Code, and ChatGPT): Question Stepper & Arrow Navigation: Shows Question X of Y with left/right arrows (`←` / `→`)... Enumerated Selectable Options: Displays numbered options (1, 2, 3...), supporting both single-select and multi-select checkboxes (`is_multi_select`), plus (Recommended) badges and optional embedded media... Default Custom Write-In Field: Every question automatically includes a custom text input option ('Other / Write your own response...')... Skip & Submit Buttons... Submitting or skipping a question posts the structured answers to `/api/governance/questions/:id/answer`... and automatically records the user's choices into Nia's persistent preference-learning store (`.swarm/memory/nia_growth.json` & `.agents/rules/USER_PREFERENCES.md`)."

### 1.2 Existing Server State & Backend Endpoints
- **Server Entry (`src/server/index.ts` lines 80-97, 134)**:
  - Express app is instantiated, JSON body parser mounted, and WebSocket server attached to path `/events`.
  - Static file middleware (`express.static`) for `src/public` is **not yet wired**.
  - Routes mounted: `/api` via `createGovernanceRouter(...)`.
- **Existing Question Routes (`src/server/routes/governance-routes.ts` lines 546-571)**:
  - `GET /api/governance/questions`: returns `consularEngine.getQuestions()`
  - `POST /api/governance/questions`: creates question via `consularEngine.createQuestion(req.body)`
  - `POST /api/governance/questions/:id/answer`: answers question via `consularEngine.answerQuestion(req.params.id, req.body)`
- **Existing Consular Engine Hooks (`src/server/consular-engine.ts`)**:
  - Line 635: `this.emit('SAURON_FOCUS_TARGET', { twin_sauron_mode: 'AMBIENT_SWEEP' });`
  - Lines 687-690: `this.emit('SAURON_FOCUS_TARGET', { twin_sauron_mode: 'CONVERGE_OFFENDING_CUBICLE', target_cubicle: cubicleId });`
  - Lines 776-779: `this.emit('SAURON_FOCUS_TARGET', { twin_sauron_mode: 'CONVERGE_OFFENDING_CUBICLE', target_cubicle: cubicleId });`
  - Lines 1205-1259: `answerQuestion` automatically mutates `niaGrowth.total_artistic_rules_championed`, appends to `advocated_goals`, updates `.swarm/memory/nia_growth.json`, and records rules to `PreferenceEngine` & `USER_PREFERENCES.md`.
- **Existing Question Data Types (`src/server/types/governance.ts` lines 189-225)**:
  - `QuestionOption` (`id`, `label`, `description?`, `is_recommended?`, `media_attachment?`)
  - `ConsularQuestion` (`question_id`, `asking_consul`, `prompt`, `options`, `is_multi_select`, `allow_custom_write_in`, `status`, `user_response?`, `created_at`)
  - `CreateQuestionDTO`, `AnswerQuestionDTO` (`selected_option_ids?`, `custom_write_in?`, `skipped?`).

### 1.3 Gaps Identified in Existing Codebase
1. **No static asset serving**: `src/server/index.ts` does not serve `src/public` nor SPA fallback.
2. **Missing Media Route**: No `/api/media/serve` endpoint exists for HTTP byte-range streaming of PDF/video/audio/images.
3. **Missing Filesystem Browser Route**: No `/api/filesystem/browse` endpoint exists to power the server-backed local disk browser modal.
4. **Missing Client Files**: `src/public/` directory is completely empty; all HTML, CSS, and JS components must be implemented according to the layout contract.

---

## 2. Logic Chain

From the observations above, we establish the step-by-step technical blueprints for the four required systems:

### 2.1 System 1: Twin Eyes of Sauron Dual Spotlight Engine

#### A. DOM Hierarchy & Layout Positioning
Located at the top of the Left Panopticon Column (`#panel-cubicles`), hovering directly above the 4x4 animated cubicle grid:

```html
<!-- Left Column: Twin Sauron Masthead & 4x4 Grid -->
<div class="panopticon-left-section" id="section-cubicles">
  <!-- Twin Sauron Mechanical/Demonic Masthead -->
  <div class="twin-sauron-masthead" id="twin-sauron-masthead">
    <!-- Consul Nia Nova (Overwatch-α) -->
    <div class="sauron-eye-module" id="eye-consul-nia" data-consul="Nia">
      <div class="eye-outer-housing">
        <div class="eye-mechanical-ring ring-spin-ccw"></div>
        <div class="eye-iris nia-prismatic-iris">
          <div class="eye-pupil slit-pupil"></div>
          <div class="eye-flare"></div>
        </div>
        <div class="eye-scanner-sweep"></div>
      </div>
      <div class="eye-telemetry-hud">
        <span class="eye-callsign">CONSUL NIA NOVA // EYE-α</span>
        <span class="eye-mode-indicator" id="nia-beam-mode">AMBIENT_SWEEP</span>
        <span class="eye-coord-readout" id="nia-beam-coords">X: 28.4% | Y: 12.1%</span>
      </div>
    </div>

    <!-- Central Consular Bridge / Neural Synapse -->
    <div class="sauron-bridge-synapse">
      <div class="synapse-hud-meter">
        <span class="synapse-label">CONSULAR OVERWATCH</span>
        <div class="synapse-pulse-line"></div>
      </div>
    </div>

    <!-- Consul Ferric Lunaux (Overwatch-β) -->
    <div class="sauron-eye-module" id="eye-consul-ferric" data-consul="Ferric">
      <div class="eye-outer-housing">
        <div class="eye-mechanical-ring ring-spin-cw"></div>
        <div class="eye-iris ferric-tactical-iris">
          <div class="eye-pupil circular-aperture"></div>
          <div class="eye-targeting-crosshair"></div>
        </div>
        <div class="eye-scanner-sweep"></div>
      </div>
      <div class="eye-telemetry-hud">
        <span class="eye-callsign">CONSUL FERRIC LUNAUX // EYE-β</span>
        <span class="eye-mode-indicator" id="ferric-beam-mode">AMBIENT_SWEEP</span>
        <span class="eye-coord-readout" id="ferric-beam-coords">X: 71.6% | Y: 12.1%</span>
      </div>
    </div>
  </div>

  <!-- Relative Positioning Container for Canvas Overlay + 4x4 Grid -->
  <div class="cubicles-canvas-stage" id="cubicles-canvas-stage">
    <!-- 2D Raycasting Canvas (Overlay above grid, pointer-events: none) -->
    <canvas id="twin-sauron-canvas"></canvas>

    <!-- 4x4 Cubicle Grid (16 Cells) -->
    <div class="cubicle-grid-container" id="cubicle-grid">
      <!-- 16 cubicle items: cubicle-01 to cubicle-16 -->
    </div>
  </div>
</div>
```

#### B. Coordinate Resolution & Mathematical Raycasting Engine
The engine (`src/public/js/twin-sauron-canvas.js`) runs a continuous 60fps `requestAnimationFrame` loop on `<canvas id="twin-sauron-canvas">`:

1. **Hi-DPI & Dynamic Resize**:
   ```javascript
   const dpr = window.devicePixelRatio || 1;
   const rect = stage.getBoundingClientRect();
   canvas.width = rect.width * dpr;
   canvas.height = rect.height * dpr;
   ctx.scale(dpr, dpr);
   ```
2. **Eye Origin Resolution**:
   - Eye 1 ($E_1$, Nia): Positioned at $(W \times 0.28, 0)$ relative to stage top.
   - Eye 2 ($E_2$, Ferric): Positioned at $(W \times 0.72, 0)$ relative to stage top.
3. **Cubicle Target Resolution**:
   - Precomputes or caches centers $C_k = (x_k, y_k)$ for all 16 cubicle DOM elements (`cubicle-01` to `cubicle-16`):
     ```javascript
     function getCubicleCenter(cubicleId) {
       const el = document.getElementById(cubicleId);
       if (!el) return { x: rect.width / 2, y: rect.height / 2 };
       const cRect = el.getBoundingClientRect();
       return {
         x: cRect.left - rect.left + cRect.width / 2,
         y: cRect.top - rect.top + cRect.height / 2,
         width: cRect.width,
         height: cRect.height
       };
     }
     ```
4. **State Machine & Trajectory Mathematics**:
   - **Mode 1: `AMBIENT_SWEEP`**:
     When no cubicle requires focused attention, the dual beams sweep in continuous non-repeating Lissajous paths across the 16 cells:
     $$\begin{aligned}
     T_{1x}(t) &= \frac{W}{2} + 0.38 W \sin(0.72 t + \phi_1) \\
     T_{1y}(t) &= \frac{H}{2} + 0.35 H \cos(1.44 t) \\
     T_{2x}(t) &= \frac{W}{2} + 0.40 W \cos(0.58 t + \phi_2) \\
     T_{2y}(t) &= \frac{H}{2} + 0.32 H \sin(1.16 t)
     \end{aligned}$$
     *Nia ($T_1$)* exhibits a slightly faster, erratic surveillance rhythm (prismatic light-mage signature), while *Ferric ($T_2$)* sweeps with steady, disciplined coverage.
   - **Mode 2: `TRACKING`**:
     Beams patrol among `working` cubicles. If multiple workers are active, Nia focuses on the fastest-progressing or latest-active task, while Ferric hovers over the worker with the highest token/fatigue strain.
   - **Mode 3: `CONVERGE_OFFENDING_CUBICLE`**:
     Triggered when an event arrives with a specific `target_cubicle` (Consular Gate 2 review, `CONSULAR_VETO`, `CAPABILITY_RESTRICTION_ERROR`, worker crash, or Disciplinary action `kill_agent`/`wipe_memory`).
     Both targets $T_1$ and $T_2$ converge simultaneously to the target cubicle's center:
     $$\vec{T}_{1, target} = \vec{C}_{\text{offending}}, \quad \vec{T}_{2, target} = \vec{C}_{\text{offending}}$$
5. **Damped Physics Smoothing (Critically Damped Tracking)**:
   Avoids instantaneous jarring jumps by interpolating actual beam target $(X_t, Y_t)$ toward desired target $(X_d, Y_d)$ using exponential decay:
   $$X(t + \Delta t) = X_d + (X(t) - X_d) \cdot e^{-\lambda \Delta t}$$
   with $\lambda = 12.0\text{ s}^{-1}$ ($\approx 150\text{ms}$ rapid smooth lock-on without overshoot).
6. **Volumetric Cone Raycasting & Blending**:
   - For beam $i \in \{1, 2\}$:
     - Vector $\vec{D}_i = \vec{T}_i - \vec{E}_i$, length $L_i = \|\vec{D}_i\|$, unit vector $\hat{u}_i = \vec{D}_i / L_i$.
     - Normal vector $\hat{n}_i = (-u_{iy}, u_{ix})$.
     - Dynamic beam spread half-width at target: $W_{spot} = 30 + 0.08 L_i$.
     - Vertices of the raycast cone:
       $P_0 = \vec{E}_i$, $P_1 = \vec{T}_i + \hat{n}_i W_{spot}$, $P_2 = \vec{T}_i - \hat{n}_i W_{spot}$.
   - **Gradient & Falloff**:
     - Construct linear gradient along $\vec{D}_i$:
       - `0.0`: `rgba(255, 30, 40, 0.90)` (emitter core intensity)
       - `0.15`: `rgba(220, 20, 30, 0.55)`
       - `0.65`: `rgba(180, 10, 20, 0.25)`
       - `1.0`: `rgba(120, 0, 10, 0.05)`
     - Soft lateral edges: masked via quadratic bezier or feathered clip path.
   - **Spotlight Puddle / Impact Pool**:
     - At $\vec{T}_i$, render an illuminated ellipse matching the perspective projection.
     - Radial gradient: center `rgba(255, 50, 60, 0.75)`, edge `rgba(150, 0, 0, 0)`.
   - **Dual Overlap Blend**:
     - When converged on the same cubicle, `ctx.globalCompositeOperation = 'lighter'` (or `'screen'`).
     - Overlapping beams combine constructively: the intersection flairs into blistering white-hot crimson (`#ffffff` core, `#ff0033` corona), rendering cybernetic targeting brackets `[ ]`, concentric HUD reticles, and blinking `SURVEILLANCE LOCK // RATIFIED OVERWATCH`.
7. **Floating Atmospheric Dust & Particles**:
   - 40 ambient particles $(x_p, y_p)$ drifting upward at $10\text{–}30\text{px/s}$.
   - If a particle intersects either beam polygon $(P_0, P_1, P_2)$, its alpha and size amplify $4\times$, rendering glowing red sparks motes within the light beam.
8. **WebSocket & DOM Event Hooks**:
   ```javascript
   ws.addEventListener('message', (event) => {
     const data = JSON.parse(event.data);
     if (data.type === 'SAURON_FOCUS_TARGET') {
       twinSauron.setMode(data.payload.twin_sauron_mode, data.payload.target_cubicle);
     } else if (data.type === 'INCIDENT_ALERT' || data.type === 'CONSULAR_VETO') {
       twinSauron.setMode('CONVERGE_OFFENDING_CUBICLE', data.payload.cubicle_id);
     } else if (data.type === 'CUBICLE_UPDATED' && data.payload.cubicle.status === 'under_inspection') {
       twinSauron.setMode('CONVERGE_OFFENDING_CUBICLE', data.payload.cubicle.id);
     }
   });
   ```

---

### 2.2 System 2: File & Folder Prompt Attachment System

#### A. DOM Architecture & Input Controls
Located in the Center Console prompt area (`#panel-console`):

```html
<!-- Center Console Prompt Input Bar -->
<div class="console-prompt-wrapper" id="console-prompt-container">
  <!-- Staged Attachment Chips Strip -->
  <div class="prompt-attachment-chips-bar" id="prompt-attachments-bar" style="display: none;">
    <!-- Rendered chips: FILE, FOLDER, etc. -->
  </div>

  <!-- Prompt Command Controls & Insertion Tools -->
  <div class="prompt-action-toolbar">
    <div class="attachment-button-group">
      <!-- 1. Attach Files Button -->
      <button type="button" class="btn-prompt-tool" id="btn-attach-file" title="Attach Files (multi-select)">
        <span class="tool-icon">📎</span> ATTACH FILE
      </button>
      <input type="file" id="input-file-picker" multiple style="display: none;" />

      <!-- 2. Attach Directory / Folder Button -->
      <button type="button" class="btn-prompt-tool" id="btn-attach-folder" title="Attach Folder Hierarchy">
        <span class="tool-icon">📁</span> ATTACH FOLDER
      </button>
      <input type="file" id="input-folder-picker" webkitdirectory directory multiple style="display: none;" />

      <!-- 3. Server Disk Browser Modal Button -->
      <button type="button" class="btn-prompt-tool" id="btn-browse-disk" title="Browse Local Filesystem on Host">
        <span class="tool-icon">💻</span> BROWSE DISK...
      </button>
    </div>
    <div class="prompt-telemetry-status">
      <span id="prompt-token-estimate">0 TOKENS</span>
    </div>
  </div>

  <!-- Dropzone & Textarea -->
  <div class="prompt-dropzone" id="prompt-dropzone">
    <textarea
      id="console-prompt-textarea"
      placeholder="Transmit high-level goal or directive to Nia & Ferric... Drag & drop files or folders anywhere here"
      rows="3"
    ></textarea>
    <div class="dropzone-drag-overlay" id="dropzone-drag-overlay" style="display: none;">
      <div class="dropzone-cyber-border">
        <span class="dropzone-text">[ENGAGE ATTACHMENT INGESTION] DROP FILES OR FOLDERS HERE</span>
      </div>
    </div>
    <button id="btn-submit-directive" class="btn-panopticon-send">
      <span class="send-label">TRANSMIT DIRECTIVE</span>
      <span class="send-indicator">↵</span>
    </button>
  </div>
</div>
```

#### B. Brutalist Attachment Chips
When files or folders are staged, chips render inside `#prompt-attachments-bar`:
```html
<!-- File Chip -->
<div class="attachment-chip chip-file" data-attachment-id="att-101">
  <span class="chip-badge">FILE</span>
  <span class="chip-path" title="src/server/auth-middleware.ts">auth-middleware.ts</span>
  <span class="chip-stat">18.4 KB</span>
  <button class="chip-btn-remove" data-id="att-101" title="Remove attachment">×</button>
</div>

<!-- Folder Chip -->
<div class="attachment-chip chip-folder" data-attachment-id="att-102">
  <span class="chip-badge">FOLDER</span>
  <span class="chip-path" title="src/public/js/">src/public/js/</span>
  <span class="chip-stat">7 files (94.2 KB)</span>
  <button class="chip-btn-remove" data-id="att-102" title="Remove attachment">×</button>
</div>
```

#### C. Drag-and-Drop & Directory Hierarchy Traversal (`webkitGetAsEntry`)
The drop zone handles drag events and recursively resolves nested folders without flattening or losing directory structure:
```javascript
dropzone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragOverlay.style.display = 'none';

  const items = e.dataTransfer.items;
  if (!items) return;

  const entriesToProcess = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.webkitGetAsEntry) {
      const entry = item.webkitGetAsEntry();
      if (entry) entriesToProcess.push(entry);
    } else {
      const file = item.getAsFile();
      if (file) addStagedFile(file);
    }
  }

  for (const entry of entriesToProcess) {
    if (entry.isFile) {
      entry.file((file) => addStagedFile(file, entry.fullPath));
    } else if (entry.isDirectory) {
      const folderResult = await traverseDirectoryEntry(entry);
      addStagedFolder(folderResult);
    }
  }
});

// Recursive reader supporting chunked 100-entry batching:
async function traverseDirectoryEntry(dirEntry, currentPath = '') {
  const dirReader = dirEntry.createReader();
  const folderFiles = [];
  let totalBytes = 0;

  const readNextBatch = () => {
    return new Promise((resolve, reject) => {
      dirReader.readEntries(async (entries) => {
        if (entries.length === 0) {
          resolve();
        } else {
          for (const entry of entries) {
            const relPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
            if (entry.isFile) {
              const file = await new Promise((res, rej) => entry.file(res, rej));
              folderFiles.push({ name: entry.name, relativePath: relPath, size: file.size, file });
              totalBytes += file.size;
            } else if (entry.isDirectory) {
              const sub = await traverseDirectoryEntry(entry, relPath);
              folderFiles.push(...sub.files);
              totalBytes += sub.totalBytes;
            }
          }
          await readNextBatch();
          resolve();
        }
      }, reject);
    });
  };

  await readNextBatch();
  return {
    folderName: dirEntry.name,
    rootPath: currentPath || dirEntry.name,
    fileCount: folderFiles.length,
    totalBytes,
    files: folderFiles
  };
}
```

#### D. Server-Backed Local File/Folder Browser Modal
To allow browsing the host machine's disks (`C:\`, `H:\`, project repository paths):

1. **New Backend Route (`GET /api/filesystem/browse`)**:
   - Query params: `?path=<path>` (defaults to project root).
   - Implementation (`src/server/routes/filesystem-routes.ts`):
     ```typescript
     router.get('/filesystem/browse', async (req: Request, res: Response) => {
       try {
         const targetPath = (req.query.path as string) || projectRoot;
         const resolved = path.resolve(targetPath);
         const stat = await fs.stat(resolved);
         if (!stat.isDirectory()) {
           res.status(400).json({ error: 'Path is not a directory' });
           return;
         }

         const entries = await fs.readdir(resolved, { withFileTypes: true });
         const dirs = [];
         const files = [];

         for (const entry of entries) {
           const full = path.join(resolved, entry.name);
           try {
             const s = await fs.stat(full);
             if (entry.isDirectory()) {
               dirs.push({ name: entry.name, path: full, modifiedAt: s.mtime.toISOString() });
             } else if (entry.isFile()) {
               files.push({
                 name: entry.name,
                 path: full,
                 size: s.size,
                 extension: path.extname(entry.name),
                 modifiedAt: s.mtime.toISOString()
               });
             }
           } catch {}
         }

         res.json({
           currentPath: resolved,
           parentPath: path.dirname(resolved) !== resolved ? path.dirname(resolved) : null,
           directories: dirs,
           files
         });
       } catch (err: any) {
         res.status(500).json({ error: err.message });
       }
     });
     ```
2. **Client Modal Inspector (`#file-browser-modal`)**:
   - Interactive dialog with:
     - Breadcrumb navigation (`H: > My Drive > Gemini Antigravity > scratch > symlinked_agent_swarm`)
     - Quick Jump shortcuts (`[PROJECT ROOT]`, `[.SWARM]`, `[WORKTREES]`)
     - Directory tree and files list with search filter
     - Checkbox selection: allows selecting entire folders or individual files
     - `[INSERT SELECTED (N)]` button: pushes selected host paths into staged prompt attachments.

#### E. Context Forwarding to Consular Gate 1 Deliberation & Downstream Tasks
When the user submits the directive:
1. Client submits payload:
   ```json
   {
     "goal": "Refactor authentication and add rate limiting",
     "proposedPlan": ["Analyze middleware", "Implement token refresh", "Write tests"],
     "taskSplits": [
       { "cubicleId": "cubicle-01", "subtask": "Refactor auth middleware" },
       { "cubicleId": "cubicle-02", "subtask": "Write rate limit tests" }
     ],
     "attachments": [
       { "type": "file", "path": "src/server/auth-middleware.ts", "size": 18840 },
       { "type": "folder", "path": "src/public/js/", "fileCount": 7, "totalBytes": 96460 }
     ]
   }
   ```
2. **Gate 1 Deliberation Integration**:
   - `consularEngine.deliberatePlan(...)` includes the attachments in the Consular deliberation context.
   - `Consul Nia Nova` evaluates whether the user's attached design assets or coding styles match learned preferences.
   - `Consul Ferric Lunaux` calculates token budgets based on attachment sizes and verifies path boundaries.
3. **Downstream Task Propagation**:
   - When Gate 1 reaches 2/2 consensus (`DISPATCH_AUTHORIZED`), tasks written to `.swarm/tasks/todo/<task_id>.json` include `attachments: string[]`.
   - The cubicle access scope (`POST /api/governance/access-scope`) automatically appends attached paths to `allowed_paths`, ensuring worker agents have authorized permissions to read and modify those files.

---

### 2.3 System 3: Rich Multimodal Media Renderer (`/api/media/...`)

#### A. Backend Media Streaming & Byte-Range Endpoint
To support smooth inline playback of videos, seekable audio, and PDF document exploration, create `src/server/routes/media-routes.ts`:

1. **Route**: `GET /api/media/serve?path=<encoded_absolute_or_relative_path>`
2. **Security & Path Sanitization**:
   - Resolves target path with `path.resolve(projectRoot, rawPath)`.
   - Validates that path exists and verifies safe bounds or permission scope.
3. **MIME Type Mapping**:
   ```typescript
   const MIME_MAP: Record<string, string> = {
     '.pdf': 'application/pdf',
     '.png': 'image/png',
     '.jpg': 'image/jpeg',
     '.jpeg': 'image/jpeg',
     '.webp': 'image/webp',
     '.gif': 'image/gif',
     '.svg': 'image/svg+xml',
     '.mp4': 'video/mp4',
     '.webm': 'video/webm',
     '.mov': 'video/quicktime',
     '.mp3': 'audio/mpeg',
     '.wav': 'audio/wav',
     '.ogg': 'audio/ogg',
     '.m4a': 'audio/mp4',
     '.json': 'application/json',
     '.md': 'text/markdown',
     '.ts': 'text/plain',
     '.js': 'application/javascript',
   };
   ```
4. **HTTP 206 Partial Content (Byte-Range)**:
   ```typescript
   const stat = await fs.promises.stat(resolvedPath);
   const fileSize = stat.size;
   const range = req.headers.range;

   if (range) {
     const parts = range.replace(/bytes=/, '').split('-');
     const start = parseInt(parts[0], 10);
     const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
     const chunkSize = end - start + 1;
     const fileStream = fs.createReadStream(resolvedPath, { start, end });

     res.writeHead(206, {
       'Content-Range': `bytes ${start}-${end}/${fileSize}`,
       'Accept-Ranges': 'bytes',
       'Content-Length': chunkSize,
       'Content-Type': mimeType,
     });
     fileStream.pipe(res);
   } else {
     res.writeHead(200, {
       'Content-Length': fileSize,
       'Accept-Ranges': 'bytes',
       'Content-Type': mimeType,
     });
     fs.createReadStream(resolvedPath).pipe(res);
   }
   ```

#### B. Inline Multimodal Cards in Consular Dialogue & Chat
When Nia, Ferric, or a cubicle agent emits a message containing multimodal media references:

1. **PDF Embed**:
   ```html
   <div class="multimodal-card media-pdf-card" data-file-url="/api/media/serve?path=...">
     <div class="card-header">
       <span class="file-icon">📑</span>
       <span class="file-name">SWARM_SYSTEM_ARCHITECTURE.pdf</span>
       <span class="file-size">1.4 MB</span>
       <button class="btn-open-pdf-modal">OPEN FULL INSPECTOR ↗</button>
     </div>
     <div class="pdf-inline-viewport">
       <iframe src="/api/media/serve?path=...#toolbar=0&navpanes=0" loading="lazy"></iframe>
     </div>
   </div>
   ```
2. **Image Cards & Click-to-Zoom Panopticon Lightbox**:
   ```html
   <div class="multimodal-card media-image-card">
     <div class="image-thumb-wrapper" onclick="panopticonLightbox.open('/api/media/serve?path=...', 'DIAGRAM.PNG')">
       <img src="/api/media/serve?path=..." alt="Generated Artifact" loading="lazy" />
       <div class="image-hover-reticle">
         <span>[CLICK TO EXPAND // PANOPTICON LIGHTBOX]</span>
       </div>
     </div>
     <div class="card-footer">
       <span class="meta-label">DIAGRAM.PNG</span>
       <span class="meta-dims">1920 × 1080</span>
     </div>
   </div>
   ```
3. **Video Player (`<video controls>`)**:
   ```html
   <div class="multimodal-card media-video-card">
     <div class="video-wrapper">
       <video controls preload="metadata" playsinline>
         <source src="/api/media/serve?path=..." type="video/mp4" />
         Your browser does not support HTML5 video streaming.
       </video>
     </div>
     <div class="card-footer">
       <span class="meta-label">VERIFICATION_RECORDING.MP4</span>
     </div>
   </div>
   ```
4. **Audio & Code Viewers**:
   - Audio: HTML5 `<audio controls>` player styled with amber telemetry and animated waveform bar.
   - Code / Markdown: Pre-rendered `<pre><code>` block with brutalist copy-to-clipboard button and monospace line numbering.

#### C. Full Panopticon Lightbox & Modal PDF Inspector Viewports
- **Panopticon Lightbox (`#panopticon-lightbox-modal`)**:
  - Full-screen high-contrast dark overlay (`background: rgba(10, 11, 14, 0.95)`).
  - Smooth pan-and-zoom: Mouse wheel zooms in/out (`scale(0.5)` to `scale(5.0)`), mouse drag pans the image around viewport.
  - Corner HUD showing coordinates, zoom level, and `[RESET 1:1]` button.
  - Dismissible via `ESC` key, close button, or background click.
- **Modal PDF Inspector (`#pdf-inspector-modal`)**:
  - Full-viewport modal HUD with top command bar:
    - Document title and download link
    - Zoom presets (`Fit Width`, `Fit Page`, `100%`, `150%`)
    - Exit button `[ESC / RETURN TO PANOPTICON]`.
  - Embedded high-resolution PDF viewer container.

---

### 2.4 System 4: Antigravity / Claude / GPT-Style Question Widget

#### A. Question Widget Architecture & DOM Hierarchy
Located in the Center Console. When a question is received from Nia, Ferric, or a cubicle agent, the interactive widget mounts dynamically:

```html
<!-- Interactive Consular Question Widget -->
<div class="consular-question-widget" id="consular-question-widget" data-active-id="q-001">
  <!-- Top Stepper Bar -->
  <div class="widget-stepper-header">
    <div class="stepper-origin">
      <span class="consul-badge consul-nia">CONSUL NIA NOVA ASKS:</span>
      <span class="stepper-indicator" id="question-step-text">QUESTION 1 OF 3</span>
    </div>
    <div class="stepper-progress-pills" id="stepper-pills">
      <div class="step-pill active" data-index="0"></div>
      <div class="step-pill" data-index="1"></div>
      <div class="step-pill" data-index="2"></div>
    </div>
    <div class="stepper-nav-controls">
      <button type="button" class="btn-step-nav" id="btn-step-prev" title="Previous Question (←)" disabled>←</button>
      <button type="button" class="btn-step-nav" id="btn-step-next" title="Next Question (→)">→</button>
    </div>
  </div>

  <!-- Question Prompt Body -->
  <div class="widget-prompt-container">
    <h3 class="widget-prompt-title" id="question-prompt-title">
      Should the Panopticon interface default to Dark Obsidian or Industrial Crimson?
    </h3>
    <p class="widget-prompt-context" id="question-prompt-context" style="display: none;"></p>

    <!-- Optional Media Attachment for Question -->
    <div class="widget-media-attachment" id="widget-media-container" style="display: none;"></div>
  </div>

  <!-- Enumerated Selectable Options List -->
  <div class="widget-options-container" id="widget-options-container">
    <!-- Option 1 -->
    <div class="option-row option-recommended" data-option-id="opt-1">
      <label class="option-label-wrapper">
        <input type="radio" name="consular_option" value="opt-1" class="option-input" />
        <span class="option-enumeration-badge">[1]</span>
        <div class="option-body">
          <div class="option-title-row">
            <span class="option-title">Obsidian & Crimson (#0a0b0e / #ef4444)</span>
            <span class="badge-recommended">RECOMMENDED BY NIA</span>
          </div>
          <p class="option-desc">Aggressive brutalist surveillance palette matching the Panopticon aesthetic.</p>
        </div>
      </label>
    </div>

    <!-- Option 2 -->
    <div class="option-row" data-option-id="opt-2">
      <label class="option-label-wrapper">
        <input type="radio" name="consular_option" value="opt-2" class="option-input" />
        <span class="option-enumeration-badge">[2]</span>
        <div class="option-body">
          <div class="option-title-row">
            <span class="option-title">Phosphor Monochrome (#051a10 / #10b981)</span>
          </div>
          <p class="option-desc">Vintage radar terminal aesthetic with green CRT scanlines.</p>
        </div>
      </label>
    </div>

    <!-- Default Custom Write-In Option -->
    <div class="option-row option-custom-write-in" data-option-id="__custom__">
      <label class="option-label-wrapper">
        <input type="radio" name="consular_option" value="__custom__" class="option-input" id="radio-custom-write-in" />
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
              placeholder="Type your custom requirement, rule, or preference..."
            />
          </div>
        </div>
      </label>
    </div>
  </div>

  <!-- Bottom Command Bar -->
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
</div>
```

#### B. Component Interaction & Behavioral Logic
1. **Multi-Question Queue & Stepper (`Question X of Y`)**:
   - The widget maintains an array of pending questions `questionsQueue: ConsularQuestion[]`.
   - Active index `currentIndex = 0`.
   - `Question X of Y` indicator updates dynamically (`QUESTION ${currentIndex + 1} OF ${questionsQueue.length}`).
   - Left arrow (`#btn-step-prev`) is disabled at index `0`; Right arrow (`#btn-step-next`) is disabled at last question.
   - Stepper dots/pills illuminate active and answered steps.
   - Keyboard shortcuts: `←` / `→` arrow keys navigate questions when not focused in the text input.
2. **Single-Select vs Multi-Select Support (`is_multi_select`)**:
   - When `is_multi_select: false`: Inputs are `<input type="radio">` with mutual exclusion. Clicking any row selects its radio.
   - When `is_multi_select: true`: Inputs are `<input type="checkbox">`. User can select multiple options simultaneously.
   - Number key shortcuts (`1`, `2`, `3`...): Pressing keys `1`..`9` toggles the corresponding enumerated option.
3. **Custom Write-In Field**:
   - Focus or text entry in `#input-custom-response` automatically selects the `__custom__` option.
   - Hitting `Enter` inside the write-in input submits the response.
4. **Media Attachments in Question**:
   - If an option has `media_attachment: { type, url }`, renders a thumbnail card. Clicking it invokes the Panopticon Lightbox or PDF Inspector so the user can inspect the visual choice before answering!
5. **Skip & Submit Action Processing**:
   - **Skip Action (`#btn-question-skip`)**:
     - Sends `POST /api/governance/questions/:id/answer` with body: `{ skipped: true }`.
     - Marks question as `SKIPPED`.
     - Advances to next question in queue or closes widget if queue is empty.
   - **Submit Action (`#btn-question-submit`)**:
     - Reads selected option IDs and custom write-in text:
       ```json
       {
         "selected_option_ids": ["opt-1"],
         "custom_write_in": "Ensure font is Consolas",
         "skipped": false
       }
       ```
     - Posts to `POST /api/governance/questions/:id/answer`.
     - Server executes `consularEngine.answerQuestion`:
       - Emits WebSocket event `CONSULAR_QUESTION_ANSWERED`.
       - Updates Nia's memory profile in `.swarm/memory/nia_growth.json` (increments `total_artistic_rules_championed`, appends to `advocated_goals`, updates `last_growth`).
       - Appends rule to `.agents/rules/USER_PREFERENCES.md` and indexes it in `PreferenceEngine` (`.swarm/memory/preferences.json`).
       - Unblocks asking Consul or cubicle agent.
     - Displays brief green confirmation badge `[PREFERENCE COMMITTED // NIA UPDATED]` and transitions to next question or unmounts.

---

## 3. Caveats

1. **Canvas Performance on Large Viewports**:
   The Twin Sauron Canvas 2D engine utilizes additive volumetric blending and animated dust motes. On 4K monitors (3840x2160), rendering full-screen raycasts without DPR clamping could increase CPU/GPU raster load.
   *Mitigation*: The blueprint specifies clamping DPR to a maximum of `2.0` (`Math.min(window.devicePixelRatio || 1, 2)`) and caching cubicle cell bounding boxes on resize rather than recalculating in every animation frame.
2. **Directory Junction / File Access Security in Disk Browser**:
   The server-backed local filesystem browser (`/api/filesystem/browse`) interacts with physical drives.
   *Mitigation*: Ensure paths are sanitized with `path.resolve` and prevent arbitrary system drive corruption by keeping the browse endpoint read-only.
3. **Browser Audio/Video Autoplay Policies**:
   Browsers may block automatic audio playback without prior user interaction.
   *Mitigation*: All inline media players are configured with `preload="metadata"` and require user interaction or explicit controls to trigger playback.
4. **Headless & Opaque-Box E2E Testing Compatibility**:
   In automated CLI test runners (e.g. Vitest running in Node.js without a DOM), Canvas and DOM elements do not natively exist.
   *Mitigation*: All state transitions, raycast target coordinates, question/answer persistence, and media streaming endpoints are backed by observable REST and WebSocket interfaces that can be tested in both headless Node and full browser environments.

---

## 4. Conclusion

1. **Architecture Completeness**: The technical blueprint comprehensively defines the mathematical, geometric, DOM, and network specifications for all four required Milestone 3 systems.
2. **No Backend Breaking Changes**: The existing `ConsularEngine` and `governance-routes.ts` already contain robust foundations for `SAURON_FOCUS_TARGET` and `ConsularQuestion`. The implementation only requires:
   - Wiring static asset middleware in `src/server/index.ts`
   - Adding `src/server/routes/media-routes.ts` (`/api/media/serve` supporting HTTP 206)
   - Adding `src/server/routes/filesystem-routes.ts` (`/api/filesystem/browse`)
   - Authoring frontend components in `src/public/js/` and `src/public/css/`.
3. **Synergy with Peer Explorers**: Clean boundaries are established with `explorer_m3_1` (3-section layout and multi-monitor engine) and `explorer_m3_3` (corner consular avatars and 12-scenario wrestling state machine).

---

## 5. Verification Method

To independently verify the implementation once executed by worker agents:

### 5.1 Verification Commands
From the project root (`H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm`):

```bash
# 1. Run all unit and E2E test suites:
npm test

# 2. Run Tier 1 Core Feature Coverage (includes F8 Sauron spotlight tests):
npx vitest run test/e2e/tier1-feature-coverage.test.ts

# 3. Run Tier 2 Boundary Cases (includes Sauron coordinate clamping and Lerp tests):
npx vitest run test/e2e/tier2-boundary-cases.test.ts

# 4. Run Tier 3 Pairwise Cross-Feature Interactions (includes CF-04 Sauron x Popout sync):
npx vitest run test/e2e/tier3-pairwise.test.ts
```

### 5.2 Verification Checklist & Invalidation Conditions
- **Twin Sauron Canvas Engine**:
  - `GET /` serves HTML containing `<canvas id="twin-sauron-canvas">` and the twin eye modules `#eye-consul-nia` and `#eye-consul-ferric`.
  - When a `SAURON_FOCUS_TARGET` event is broadcast with `CONVERGE_OFFENDING_CUBICLE`, both spotlight vectors smoothly converge on the target cubicle center within 250ms.
  - *Invalidation Condition*: Spotlight coordinates calculating as `NaN`, unhandled canvas resizing errors, or failure to lock onto cubicle on error alert.
- **Prompt Attachment System**:
  - Dropping a directory onto `#prompt-dropzone` parses file hierarchies using `webkitGetAsEntry` and renders removable brutalist chips.
  - `GET /api/filesystem/browse?path=.` returns directory entries with stats.
  - Submitting a prompt with attachments forwards paths into Gate 1 Consular deliberation.
  - *Invalidation Condition*: Dropped folders losing subfolder structure or failing to populate cubicle `allowed_paths`.
- **Rich Multimodal Media Renderer**:
  - `GET /api/media/serve?path=...` with `Range: bytes=0-1024` returns HTTP 206 Partial Content with `Accept-Ranges: bytes` and `Content-Range`.
  - PDFs render in inline `<iframe>` and expand to full modal inspector.
  - Images expand in the Panopticon Lightbox modal supporting wheel zoom and pan.
  - Videos stream via `<video controls>` without stalling.
  - *Invalidation Condition*: HTTP 500 on missing range headers, MIME type mismatches, or path traversal vulnerability.
- **Antigravity / Claude / GPT Question Widget**:
  - `GET /api/governance/questions` returns active questions.
  - Question widget renders stepper (`Question X of Y`), enumerated options `[1]`, `[2]`, `(Recommended)` badge, and custom write-in field.
  - Clicking `Skip →` sends `{ skipped: true }` and advances stepper.
  - Submitting an answer posts to `POST /api/governance/questions/:id/answer`, updates `.swarm/memory/nia_growth.json`, and appends the preference rule to `.agents/rules/USER_PREFERENCES.md`.
  - *Invalidation Condition*: Submitting answer does not persist to `nia_growth.json` or `USER_PREFERENCES.md`.
