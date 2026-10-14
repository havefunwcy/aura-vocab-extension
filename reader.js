/**
 * Aura Dict - Standalone Continuous Scroll PDF Reader
 * Mozilla 官方标准 PDFViewer 架构：零错位严丝合缝划词、连续滚轮排版、顶栏平滑折叠与历史页码记忆
 */

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'libs/pdf.worker.min.js';
}

document.addEventListener('DOMContentLoaded', () => {
  const header = document.getElementById('reader-header');
  const btnCollapseHeader = document.getElementById('btn-collapse-header');
  const btnExpandHeader = document.getElementById('btn-expand-header');
  const fileInput = document.getElementById('pdf-file-input');
  const dropZone = document.getElementById('drop-zone');
  const viewerContainer = document.getElementById('viewerContainer');
  const viewerEl = document.getElementById('viewer');
  const docTitlePill = document.getElementById('doc-title-pill');
  const pageMeter = document.getElementById('page-meter');
  const pageNumEl = document.getElementById('page-num');
  const pageCountEl = document.getElementById('page-count');
  const zoomTextEl = document.getElementById('zoom-text');
  const btnPrev = document.getElementById('btn-prev-page');
  const btnNext = document.getElementById('btn-next-page');
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnOpenNotebook = document.getElementById('btn-open-notebook');

  let pdfDoc = null;
  let currentPage = 1;
  let targetSavedPage = 1;
  let currentFileName = '本地 PDF 文档';
  let currentFileSize = 0;
  let currentFileKey = null;
  let saveTimer = null;

  // 1. 初始化 Mozilla PDF.js 官方标准 PDFViewer 架构
  const eventBus = new pdfjsViewer.EventBus();
  const linkService = new pdfjsViewer.PDFLinkService({
    eventBus: eventBus,
  });

  const pdfViewer = new pdfjsViewer.PDFViewer({
    container: viewerContainer,
    viewer: viewerEl,
    eventBus: eventBus,
    linkService: linkService,
    l10n: pdfjsViewer.NullL10n,
    removePageBorders: true,
  });
  linkService.setViewer(pdfViewer);

  // 2. 监听官方 EventBus 事件流
  eventBus.on('pagesinit', () => {
    // 设置舒适阅读默认缩放比例 (130%)
    pdfViewer.currentScale = 1.3;
    updateZoomDisplay(pdfViewer.currentScale);

    // 智能恢复上次阅读位置
    if (targetSavedPage > 1 && targetSavedPage <= pdfDoc.numPages) {
      pdfViewer.currentPageNumber = targetSavedPage;
      currentPage = targetSavedPage;
      pageNumEl.textContent = currentPage;
      showToast(`已自动跳转至上次阅读位置：第 ${targetSavedPage} / ${pdfDoc.numPages} 页`);
    } else {
      currentPage = 1;
      pageNumEl.textContent = 1;
    }
  });

  eventBus.on('pagechanging', (evt) => {
    const pageNum = evt.pageNumber;
    if (pageNum && pageNum !== currentPage) {
      currentPage = pageNum;
      pageNumEl.textContent = currentPage;
      saveProgressDebounced(currentPage);
    }
  });

  eventBus.on('scalechanging', (evt) => {
    if (evt && typeof evt.scale === 'number') {
      updateZoomDisplay(evt.scale);
    }
  });

  // 文本层渲染完成后做连字/字距微碎片合并（双重保险，防止极端特殊字体碎片断开）
  eventBus.on('textlayerrendered', (evt) => {
    try {
      if (evt.source && evt.source.div) {
        unifyFragmentedSpans(evt.source.div);
      }
    } catch (e) {
      console.warn('unifyFragmentedSpans error:', e);
    }
  });

  // 3. 顶栏折叠与展开功能 (支持 H 快捷键)
  function setHeaderCollapsed(collapsed) {
    if (collapsed) {
      header.classList.add('collapsed');
      viewerContainer.classList.add('header-collapsed');
      btnExpandHeader.style.display = 'flex';
    } else {
      header.classList.remove('collapsed');
      viewerContainer.classList.remove('header-collapsed');
      btnExpandHeader.style.display = 'none';
    }
  }

  btnCollapseHeader.addEventListener('click', () => setHeaderCollapsed(true));
  btnExpandHeader.addEventListener('click', () => setHeaderCollapsed(false));

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'h' || e.key === 'H') {
      setHeaderCollapsed(!header.classList.contains('collapsed'));
    }
  });

  // 4. 翻页与缩放控制
  function updateZoomDisplay(val) {
    zoomTextEl.textContent = `${Math.round(val * 100)}%`;
  }

  btnZoomIn.addEventListener('click', () => {
    if (!pdfDoc) return;
    const current = pdfViewer.currentScale || 1.3;
    const next = Math.min(3.0, current + 0.15);
    pdfViewer.currentScale = Math.round(next * 100) / 100;
  });

  btnZoomOut.addEventListener('click', () => {
    if (!pdfDoc) return;
    const current = pdfViewer.currentScale || 1.3;
    const next = Math.max(0.5, current - 0.15);
    pdfViewer.currentScale = Math.round(next * 100) / 100;
  });

  btnPrev.addEventListener('click', () => {
    if (!pdfDoc || pdfViewer.currentPageNumber <= 1) return;
    pdfViewer.previousPage();
  });

  btnNext.addEventListener('click', () => {
    if (!pdfDoc || pdfViewer.currentPageNumber >= pdfDoc.numPages) return;
    pdfViewer.nextPage();
  });

  // 页码点击快速跳转
  if (pageMeter) {
    pageMeter.addEventListener('click', () => {
      if (!pdfDoc) return;
      const input = prompt(`请输入要跳转的页码 (1 - ${pdfDoc.numPages}):`, pdfViewer.currentPageNumber);
      if (input !== null) {
        const p = parseInt(input.trim(), 10);
        if (!isNaN(p) && p >= 1 && p <= pdfDoc.numPages) {
          pdfViewer.currentPageNumber = p;
          saveProgressImmediate(p);
        }
      }
    });
  }

  // 快捷键支持
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (!pdfDoc) return;

    if (e.key === 'PageUp' || e.key === 'ArrowLeft') {
      if (pdfViewer.currentPageNumber > 1) pdfViewer.previousPage();
    } else if (e.key === 'PageDown' || e.key === 'ArrowRight') {
      if (pdfViewer.currentPageNumber < pdfDoc.numPages) pdfViewer.nextPage();
    } else if (e.key === '+' || e.key === '=') {
      const next = Math.min(3.0, (pdfViewer.currentScale || 1.3) + 0.15);
      pdfViewer.currentScale = Math.round(next * 100) / 100;
    } else if (e.key === '-') {
      const next = Math.max(0.5, (pdfViewer.currentScale || 1.3) - 0.15);
      pdfViewer.currentScale = Math.round(next * 100) / 100;
    }
  });

  // 5. 文件加载与拖拽事件
  fileInput.addEventListener('click', () => {
    fileInput.value = '';
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadPdfFile(file);
  });

  viewerContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  viewerContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'application/pdf') {
      loadPdfFile(files[0]);
    }
  });

  dropZone.addEventListener('click', () => {
    fileInput.click();
  });

  btnOpenNotebook.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('notebook.html') });
  });

  function loadPdfFile(file) {
    currentFileName = file.name;
    currentFileSize = file.size;
    currentFileKey = `pdf_${encodeURIComponent(file.name)}_${file.size}`;

    docTitlePill.textContent = currentFileName;
    docTitlePill.title = currentFileName;
    document.title = `${currentFileName} - Aura 触感阅读器`;

    const reader = new FileReader();
    reader.onload = async function () {
      const typedarray = new Uint8Array(this.result);
      try {
        const loadingTask = pdfjsLib.getDocument({ data: typedarray });
        pdfDoc = await loadingTask.promise;
        pageCountEl.textContent = pdfDoc.numPages;

        targetSavedPage = 1;
        try {
          const { pdfHistory = {} } = await chrome.storage.local.get('pdfHistory');
          const record = pdfHistory[currentFileKey];
          if (record && record.page && record.page >= 1 && record.page <= pdfDoc.numPages) {
            targetSavedPage = record.page;
          }
        } catch (e) {
          console.warn('获取阅读历史失败:', e);
        }

        dropZone.style.display = 'none';
        viewerEl.style.display = 'block';

        pdfViewer.setDocument(pdfDoc);
        linkService.setDocument(pdfDoc, null);
      } catch (err) {
        alert('解析 PDF 失败: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // 6. 新拟态实体浮窗：严丝合缝划词查词与智能页码归档
  let popupBox = null;
  let currentWordData = null;
  let currentSelectionContext = '';
  let activePageNum = 1;

  function ensurePopup() {
    if (popupBox) return popupBox;
    popupBox = document.createElement('div');
    popupBox.id = 'aura-pdf-floating-panel';
    popupBox.style.cssText = `
      position: fixed;
      z-index: 999999;
      width: 310px;
      background: #e9edf2;
      color: #2e3846;
      border-radius: 16px;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      box-shadow: 8px 8px 20px rgba(166, 175, 189, 0.45), -8px -8px 20px rgba(255, 255, 255, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.5);
      display: none;
      user-select: none;
    `;
    document.body.appendChild(popupBox);
    return popupBox;
  }

  function hidePopup() {
    if (popupBox) popupBox.style.display = 'none';
  }

  // 监听全文阅读区的划词事件
  viewerContainer.addEventListener('mouseup', (e) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    // 智能整词补全与边缘吸附（消除首尾残缺错位，如 uff -> stuff、oncer -> concern）
    expandSelectionToFullWord(selection);

    const rawText = selection.toString().trim();
    if (!rawText) return;

    const cleanText = rawText.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').trim();
    if (!cleanText || cleanText.length > 80) return;

    // 自动感知选区所在的是哪一页
    const anchor = selection.anchorNode;
    const pageEl = anchor ? (anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement).closest('.page') : null;
    activePageNum = pageEl ? parseInt(pageEl.getAttribute('data-page-number'), 10) : pdfViewer.currentPageNumber;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    currentSelectionContext = extractContext(selection);
    showLookup(cleanText, rect, activePageNum);
  });

  document.addEventListener('mousedown', (e) => {
    if (popupBox && !popupBox.contains(e.target)) {
      hidePopup();
    }
  });

  // 合并 PDF.js 文本层因字距/连字被切割的断词碎片 (如 st + uff 或 c + oncern)
  function unifyFragmentedSpans(textLayerEl) {
    if (!textLayerEl) return;
    const spans = Array.from(textLayerEl.querySelectorAll('span'));
    if (spans.length <= 1) return;

    for (let i = 0; i < spans.length - 1; i++) {
      const curr = spans[i];
      const next = spans[i + 1];
      if (!curr || !next || !curr.parentNode || !next.parentNode) continue;

      const currText = curr.textContent;
      const nextText = next.textContent;
      if (!currText || !nextText) continue;

      // 如果当前 span 以字母/数字结尾，下一个 span 以字母/数字开头（非空格隔开）
      if (/[\p{L}\p{N}]$/u.test(currText) && /^[\p{L}\p{N}]/u.test(nextText)) {
        const currRect = curr.getBoundingClientRect();
        const nextRect = next.getBoundingClientRect();
        const isSameLine = Math.abs(currRect.top - nextRect.top) < 6;
        const gap = nextRect.left - currRect.right;

        // 在同一行且水平间距极小 (属于同一个单词的排版碎片，通常 gap < 8px)
        if (isSameLine && gap > -10 && gap < 8) {
          curr.textContent = currText + nextText;
          next.remove();
          spans.splice(i + 1, 1);
          i--;
        }
      }
    }
  }

  // 智能整词吸附与补全：如果用户双击或划词时裁切在单词中段，自动补全首尾残缺部分并修正可视选区
  function expandSelectionToFullWord(selection) {
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);

    const raw = selection.toString();
    if (!raw.trim()) return null;

    // 如果选中的是长篇句子（超过 6 个单词），尊重用户意图不自动补词
    if (raw.trim().split(/\s+/).length > 6) return range;

    let startNode = range.startContainer;
    let startOffset = range.startOffset;

    // 1. 向前探索单词前缀 (Prefix)
    if (startNode.nodeType === Node.TEXT_NODE) {
      const textBefore = startNode.textContent.slice(0, startOffset);
      const match = textBefore.match(/[\p{L}\p{N}]+$/u);
      if (match) {
        try {
          range.setStart(startNode, startOffset - match[0].length);
        } catch (e) {}
      } else if (startOffset === 0) {
        // 向前检查紧邻的同级 Span
        let currentSpan = startNode.parentElement;
        if (currentSpan && currentSpan.tagName === 'SPAN') {
          let prevSpan = currentSpan.previousElementSibling;
          if (prevSpan && prevSpan.tagName === 'SPAN') {
            const currRect = currentSpan.getBoundingClientRect();
            const prevRect = prevSpan.getBoundingClientRect();
            const isSameLine = Math.abs(currRect.top - prevRect.top) < 6;
            const isAdjacent = Math.abs(currRect.left - prevRect.right) < 10;

            if (isSameLine && isAdjacent) {
              const prevText = prevSpan.textContent;
              const prevMatch = prevText.match(/[\p{L}\p{N}]+$/u);
              if (prevMatch) {
                try {
                  const targetNode = prevSpan.firstChild || prevSpan;
                  range.setStart(targetNode, prevText.length - prevMatch[0].length);
                } catch (e) {}
              }
            }
          }
        }
      }
    }

    // 2. 向后探索单词后缀 (Suffix)
    let endNode = range.endContainer;
    let endOffset = range.endOffset;

    if (endNode.nodeType === Node.TEXT_NODE) {
      const textAfter = endNode.textContent.slice(endOffset);
      const match = textAfter.match(/^[\p{L}\p{N}]+/u);
      if (match) {
        try {
          range.setEnd(endNode, endOffset + match[0].length);
        } catch (e) {}
      } else if (endOffset >= endNode.textContent.length) {
        // 向后检查紧邻的同级 Span
        let currentSpan = endNode.parentElement;
        if (currentSpan && currentSpan.tagName === 'SPAN') {
          let nextSpan = currentSpan.nextElementSibling;
          if (nextSpan && nextSpan.tagName === 'SPAN') {
            const currRect = currentSpan.getBoundingClientRect();
            const nextRect = nextSpan.getBoundingClientRect();
            const isSameLine = Math.abs(currRect.top - nextRect.top) < 6;
            const isAdjacent = Math.abs(nextRect.left - currRect.right) < 10;

            if (isSameLine && isAdjacent) {
              const nextText = nextSpan.textContent;
              const nextMatch = nextText.match(/^[\p{L}\p{N}]+/u);
              if (nextMatch) {
                try {
                  const targetNode = nextSpan.firstChild || nextSpan;
                  range.setEnd(targetNode, nextMatch[0].length);
                } catch (e) {}
              }
            }
          }
        }
      }
    }

    // 更新视图中的文字高亮，使之完整覆盖整个单词
    try {
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (e) {}

    return range;
  }

  function extractContext(selection) {
    try {
      const node = selection.anchorNode;
      const text = node ? node.textContent : '';
      return text.length < 220 ? text.trim() : '';
    } catch {
      return '';
    }
  }

  async function showLookup(word, rect, pageNum) {
    const box = ensurePopup();
    box.innerHTML = `
      <div style="font-size: 11px; font-weight:600; color:#7d8b9e; margin-bottom: 6px;">AURA • 正在查询 PDF 单词...</div>
      <div style="font-size: 13px; color: #4a5568;">${escapeHtml(word)}</div>
    `;

    positionPanel(box, rect);
    box.style.display = 'block';

    chrome.runtime.sendMessage({ action: 'FETCH_YOUDAO', word }, async (res) => {
      if (!res || !res.success || !res.data) {
        box.innerHTML = `<div style="font-size: 12px; color: #bf6060;">未收录该单词释义</div>`;
        return;
      }

      currentWordData = res.data;
      const isStarred = await checkStarred(currentWordData.word);

      box.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div style="font-size:11px; font-weight:700; color:#7d8b9e; letter-spacing:0.5px;">AURA • 有道词典 (第 ${pageNum} 页)</div>
          <div style="display:flex; gap:6px;">
            <button id="pdf-btn-audio" class="tactile-circle-btn" title="播放发音">🔊</button>
            <button id="pdf-btn-star" class="tactile-circle-btn" style="color:${isStarred ? '#d97736' : '#7d8b9e'}" title="加入生词本">${isStarred ? '★' : '☆'}</button>
            <button id="pdf-btn-close" class="tactile-circle-btn" title="关闭">×</button>
          </div>
        </div>

        <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:8px;">
          <span style="font-size:16px; font-weight:700; color:#252e3b;">${escapeHtml(currentWordData.word)}</span>
          ${currentWordData.phonetic ? `<span style="font-size:12px; color:#7d8b9e;">[${escapeHtml(currentWordData.phonetic)}]</span>` : ''}
        </div>

        <div style="background:#e9edf2; border-radius:10px; padding:8px 10px; box-shadow:inset 2px 2px 4px rgba(166,175,189,0.38), inset -2px -2px 4px rgba(255,255,255,0.9); max-height:130px; overflow-y:auto; margin-bottom:8px;">
          <ul style="list-style:none; padding:0; margin:0; font-size:12px; color:#3b4655; line-height:1.5;">
            ${currentWordData.explains.map((item) => `<li style="padding:2px 0;">• ${escapeHtml(item)}</li>`).join('')}
          </ul>
        </div>

        <div style="display:flex; justify-content:space-between; font-size:10px; color:#9caab9;">
          <span>来源: ${escapeHtml(currentFileName)} [P.${pageNum}]</span>
          <span>${isStarred ? '● 已收录' : '○ 点击星标入库'}</span>
        </div>
      `;

      box.querySelector('#pdf-btn-audio').onclick = () => {
        new Audio(currentWordData.audioUrl).play();
      };

      box.querySelector('#pdf-btn-star').onclick = async () => {
        const starBtn = box.querySelector('#pdf-btn-star');
        const key = currentWordData.word.toLowerCase().trim();
        const { vocabBook = {} } = await chrome.storage.local.get('vocabBook');

        if (vocabBook[key]) {
          delete vocabBook[key];
          starBtn.textContent = '☆';
          starBtn.style.color = '#7d8b9e';
        } else {
          vocabBook[key] = {
            word: currentWordData.word,
            phonetic: currentWordData.phonetic || '',
            explains: currentWordData.explains || [],
            audioUrl: currentWordData.audioUrl || '',
            contextSentence: currentSelectionContext || '',
            sourceUrl: `PDF: ${currentFileName} (第 ${pageNum} 页)`,
            sourceTitle: `${currentFileName} [第 ${pageNum} 页]`,
            addTime: Date.now()
          };
          starBtn.textContent = '★';
          starBtn.style.color = '#d97736';
        }
        await chrome.storage.local.set({ vocabBook });
      };

      box.querySelector('#pdf-btn-close').onclick = hidePopup;
    });
  }

  function positionPanel(box, rect) {
    const margin = 10;
    const w = 310;
    let left = rect.left + rect.width / 2 - w / 2;
    if (left < margin) left = margin;
    if (left + w > window.innerWidth - margin) left = window.innerWidth - w - margin;

    let top = rect.bottom + 8;
    if (top + 180 > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - 188);
    }
    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(top)}px`;
  }

  async function checkStarred(word) {
    const { vocabBook = {} } = await chrome.storage.local.get('vocabBook');
    return !!vocabBook[word.toLowerCase().trim()];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 7. 阅读进度持久化存储与通知系统
  function saveProgressDebounced(page) {
    if (!currentFileKey || !pdfDoc || !page) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveProgressImmediate(page);
    }, 350);
  }

  async function saveProgressImmediate(page) {
    if (!currentFileKey || !pdfDoc || !page) return;
    try {
      const { pdfHistory = {} } = await chrome.storage.local.get('pdfHistory');
      pdfHistory[currentFileKey] = {
        fileName: currentFileName,
        fileSize: currentFileSize,
        page: page,
        totalPages: pdfDoc.numPages,
        lastReadTime: Date.now()
      };
      await chrome.storage.local.set({ pdfHistory });
    } catch (err) {
      console.warn('保存阅读进度失败:', err);
    }
  }

  let toastTimer = null;
  function showToast(msg) {
    let toast = document.getElementById('reader-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'reader-toast';
      toast.className = 'reader-toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<span class="reader-toast-icon">🔖</span><span>${escapeHtml(msg)}</span>`;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('visible');
    }, 2800);
  }

  // 离开页面或切换后台时立即归档进度
  window.addEventListener('beforeunload', () => {
    if (pdfDoc && currentPage) saveProgressImmediate(currentPage);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && pdfDoc && currentPage) {
      saveProgressImmediate(currentPage);
    }
  });
});
