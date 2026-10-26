/**
 * src/public/js/media-renderer.js
 *
 * Rich Multimodal Media Renderer & Panopticon Lightbox Controller.
 * Supports inline rendering and modal inspection of PDFs, images, videos, and audio.
 */

export class MediaRenderer {
  constructor() {
    this.lightboxModal = document.getElementById('panopticon-lightbox-modal');
    this.lightboxImg = document.getElementById('lightbox-image-target');
    this.lightboxTitle = document.getElementById('lightbox-filename-title');
    this.lightboxZoomReadout = document.getElementById('lightbox-zoom-readout');
    this.btnZoomIn = document.getElementById('lightbox-zoom-in');
    this.btnZoomOut = document.getElementById('lightbox-zoom-out');
    this.btnZoomReset = document.getElementById('lightbox-zoom-reset');
    this.btnLightboxClose = document.getElementById('lightbox-close');
    this.lightboxViewport = document.getElementById('lightbox-viewport');

    this.pdfModal = document.getElementById('pdf-inspector-modal');
    this.pdfIframe = document.getElementById('pdf-inspector-iframe');
    this.pdfTitle = document.getElementById('pdf-modal-title');
    this.btnPdfClose = document.getElementById('pdf-modal-close');

    this.currentZoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;

    this.bindEvents();
  }

  bindEvents() {
    if (this.btnLightboxClose) {
      this.btnLightboxClose.addEventListener('click', () => this.closeLightbox());
    }
    if (this.btnZoomIn) {
      this.btnZoomIn.addEventListener('click', () => this.adjustZoom(0.25));
    }
    if (this.btnZoomOut) {
      this.btnZoomOut.addEventListener('click', () => this.adjustZoom(-0.25));
    }
    if (this.btnZoomReset) {
      this.btnZoomReset.addEventListener('click', () => this.resetZoom());
    }

    if (this.lightboxViewport) {
      this.lightboxViewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.2 : -0.2;
        this.adjustZoom(delta);
      });

      this.lightboxViewport.addEventListener('mousedown', (e) => {
        if (e.target === this.lightboxImg || e.target === this.lightboxViewport) {
          this.isDragging = true;
          this.startX = e.clientX - this.panX;
          this.startY = e.clientY - this.panY;
        }
      });

      window.addEventListener('mousemove', (e) => {
        if (!this.isDragging) return;
        this.panX = e.clientX - this.startX;
        this.panY = e.clientY - this.startY;
        this.updateTransform();
      });

      window.addEventListener('mouseup', () => {
        this.isDragging = false;
      });
    }

    if (this.btnPdfClose && this.pdfModal) {
      this.btnPdfClose.addEventListener('click', () => this.closePdfModal());
    }

    // Global ESC to close modals
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeLightbox();
        this.closePdfModal();
      }
    });
  }

  openLightbox(url, title = 'Artifact Inspection') {
    if (!this.lightboxModal || !this.lightboxImg) return;
    this.lightboxImg.src = url;
    if (this.lightboxTitle) this.lightboxTitle.textContent = title;
    this.resetZoom();
    this.lightboxModal.classList.remove('hidden');
  }

  closeLightbox() {
    if (this.lightboxModal) {
      this.lightboxModal.classList.add('hidden');
      if (this.lightboxImg) this.lightboxImg.src = '';
    }
  }

  adjustZoom(delta) {
    this.currentZoom = Math.max(0.5, Math.min(5.0, this.currentZoom + delta));
    this.updateTransform();
  }

  resetZoom() {
    this.currentZoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.updateTransform();
  }

  updateTransform() {
    if (this.lightboxImg) {
      this.lightboxImg.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.currentZoom})`;
    }
    if (this.lightboxZoomReadout) {
      this.lightboxZoomReadout.textContent = `${Math.round(this.currentZoom * 100)}%`;
    }
  }

  openPdfModal(url, title = 'PDF Document Inspector') {
    if (!this.pdfModal || !this.pdfIframe) return;
    this.pdfIframe.src = url;
    if (this.pdfTitle) this.pdfTitle.textContent = title;
    this.pdfModal.classList.remove('hidden');
  }

  closePdfModal() {
    if (this.pdfModal) {
      this.pdfModal.classList.add('hidden');
      if (this.pdfIframe) this.pdfIframe.src = 'about:blank';
    }
  }

  renderMediaCard(media) {
    const card = document.createElement('div');
    const type = (media.type || 'image').toLowerCase();
    const url = media.url || `/api/media/serve?path=${encodeURIComponent(media.path || '')}`;
    const name = media.name || (media.path ? media.path.split(/[\/\\]/).pop() : 'Artifact');

    if (type === 'pdf') {
      card.className = 'multimodal-card media-pdf-card';
      card.innerHTML = `
        <div class="card-header">
          <span>📑 <strong class="file-name">${name}</strong></span>
          <button type="button" class="btn-open-pdf-modal">OPEN FULL INSPECTOR ↗</button>
        </div>
        <div class="pdf-inline-viewport">
          <iframe src="${url}#toolbar=0" loading="lazy"></iframe>
        </div>
      `;
      card.querySelector('.btn-open-pdf-modal').addEventListener('click', () => {
        this.openPdfModal(url, name);
      });
    } else if (type === 'video') {
      card.className = 'multimodal-card media-video-card';
      card.innerHTML = `
        <div class="card-header">
          <span>🎬 <strong class="file-name">${name}</strong></span>
        </div>
        <div class="video-wrapper">
          <video controls preload="metadata" playsinline>
            <source src="${url}" type="video/mp4" />
            Your browser does not support HTML5 video streaming.
          </video>
        </div>
      `;
    } else if (type === 'audio') {
      card.className = 'multimodal-card media-audio-card';
      card.innerHTML = `
        <div class="card-header">
          <span>🎵 <strong class="file-name">${name}</strong></span>
        </div>
        <div class="audio-wrapper">
          <audio controls preload="metadata">
            <source src="${url}" type="audio/mpeg" />
            Your browser does not support audio playback.
          </audio>
        </div>
      `;
    } else {
      // Default: Image
      card.className = 'multimodal-card media-image-card';
      card.innerHTML = `
        <div class="card-header">
          <span>🖼️ <strong class="file-name">${name}</strong></span>
        </div>
        <div class="image-thumb-wrapper">
          <img src="${url}" alt="${name}" loading="lazy" />
          <div class="image-hover-reticle">
            <span>[CLICK TO EXPAND // LIGHTBOX]</span>
          </div>
        </div>
      `;
      card.querySelector('.image-thumb-wrapper').addEventListener('click', () => {
        this.openLightbox(url, name);
      });
    }

    return card;
  }
}

let mediaRendererInstance = null;
export function initMediaRenderer() {
  if (!mediaRendererInstance) {
    mediaRendererInstance = new MediaRenderer();
  }
  return mediaRendererInstance;
}
export function getMediaRenderer() {
  return mediaRendererInstance;
}
