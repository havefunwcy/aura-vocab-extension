/**
 * Aura Dict - Content Script
 * 新拟态 (Neumorphism) 与轻量触感硬件交互面板
 */

(function () {
  let hostEl = null;
  let shadowRoot = null;
  let popupBox = null;
  let currentWordData = null;
  let currentSelectionContext = '';
  let fadeTimer = null;
  let isEnabled = true;

  // 1. 初始化读取插件启用状态
  try {
    chrome.storage.local.get('enabled', (res) => {
      if (res && res.enabled !== undefined) {
        isEnabled = res.enabled;
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.enabled !== undefined) {
        isEnabled = changes.enabled.newValue;
        if (!isEnabled) hidePopup();
      }
    });
  } catch (err) {
    console.warn('[Aura Dict] 读取初始状态失败:', err);
  }

  // 2. 初始化 Shadow DOM 容器
  function ensureHostContainer() {
    if (hostEl && shadowRoot && popupBox) return shadowRoot;

    hostEl = document.createElement('div');
    hostEl.id = 'aura-dict-extension-root';
    shadowRoot = hostEl.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
      }
      *, *::before, *::after {
        box-sizing: border-box;
      }

      /* 主悬浮面板 - 柔和物理实体表面 */
      .aura-panel {
        position: fixed;
        z-index: 2147483647;
        width: 310px;
        background: #e9edf2;
        color: #2e3846;
        border-radius: 16px;
        padding: 16px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        box-shadow: 
          8px 8px 20px rgba(166, 175, 189, 0.45),
          -8px -8px 20px rgba(255, 255, 255, 0.95);
        display: none;
        opacity: 0;
        transform: translateY(6px) scale(0.98);
        transition: opacity 0.18s cubic-bezier(0.16, 1, 0.3, 1), transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        border: 1px solid rgba(255, 255, 255, 0.45);
        user-select: none;
      }

      .aura-panel.visible {
        display: block;
        opacity: 1;
        transform: translateY(0) scale(1);
      }

      /* 顶栏控制条 */
      .aura-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }

      .aura-device-badge {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.5px;
        color: #7d8b9e;
        text-transform: uppercase;
      }

      /* 状态微指示灯 */
      .aura-led {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #9ab3a8;
        box-shadow: 0 0 4px rgba(154, 179, 168, 0.8), inset 0 1px 1px rgba(255, 255, 255, 0.6);
        transition: background 0.2s, box-shadow 0.2s;
      }
      .aura-led.active {
        background: #d97736;
        box-shadow: 0 0 6px rgba(217, 119, 54, 0.8), inset 0 1px 1px rgba(255, 255, 255, 0.6);
      }

      .aura-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      /* 实体圆形微凸按键基类 */
      .aura-btn {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: none;
        background: #e9edf2;
        color: #617185;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        padding: 0;
        outline: none;
        box-shadow: 
          3px 3px 7px rgba(166, 175, 189, 0.42),
          -3px -3px 7px rgba(255, 255, 255, 0.95);
        transition: all 0.12s ease;
      }

      .aura-btn:hover {
        color: #2e3846;
        box-shadow: 
          2px 2px 5px rgba(166, 175, 189, 0.5),
          -2px -2px 5px rgba(255, 255, 255, 1);
      }

      .aura-btn:active, .aura-btn.depressed {
        box-shadow: 
          inset 2px 2px 5px rgba(166, 175, 189, 0.45),
          inset -2px -2px 5px rgba(255, 255, 255, 0.95);
        transform: translateY(1px);
      }

      /* 收藏按键已收藏状态 */
      .aura-btn.starred {
        color: #d97736;
        box-shadow: 
          inset 2px 2px 5px rgba(166, 175, 189, 0.45),
          inset -2px -2px 5px rgba(255, 255, 255, 0.95);
      }

      .aura-btn svg {
        width: 13px;
        height: 13px;
        fill: currentColor;
        pointer-events: none;
      }

      /* 单词与音标区 */
      .aura-word-row {
        display: flex;
        align-items: baseline;
        gap: 8px;
        margin-bottom: 10px;
        padding: 0 2px;
      }

      .aura-word {
        font-size: 16px;
        font-weight: 650;
        color: #252e3b;
        letter-spacing: -0.2px;
        line-height: 1.2;
        word-break: break-word;
      }

      .aura-phonetic {
        font-size: 12px;
        color: #7d8b9e;
        font-weight: 400;
        font-family: "Segoe UI", sans-serif;
      }

      /* 内嵌式释义展示槽 (Inset Sub-panel) */
      .aura-meaning-inset {
        background: #e9edf2;
        border-radius: 12px;
        padding: 10px 12px;
        box-shadow: 
          inset 2px 2px 5px rgba(166, 175, 189, 0.35),
          inset -2px -2px 5px rgba(255, 255, 255, 0.85);
        max-height: 170px;
        overflow-y: auto;
      }

      .aura-meaning-inset::-webkit-scrollbar {
        width: 4px;
      }
      .aura-meaning-inset::-webkit-scrollbar-thumb {
        background: rgba(166, 175, 189, 0.5);
        border-radius: 4px;
      }

      .aura-explains-list {
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .aura-explain-item {
        font-size: 12.5px;
        line-height: 1.55;
        color: #404b5a;
        padding: 3px 0;
        border-bottom: 1px solid rgba(166, 175, 189, 0.2);
        display: flex;
        align-items: baseline;
        gap: 6px;
      }

      .aura-explain-item:last-child {
        border-bottom: none;
      }

      .aura-explain-dot {
        width: 3px;
        height: 3px;
        border-radius: 50%;
        background: #9ab3a8;
        flex-shrink: 0;
      }

      /* 状态与加载 */
      .aura-status-msg {
        font-size: 12px;
        color: #7d8b9e;
        text-align: center;
        padding: 12px 0;
        font-style: italic;
      }

      /* 底部触感标签 */
      .aura-footer-tag {
        margin-top: 8px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 4px;
        font-size: 10.5px;
        color: #8c98a7;
      }
    `;
    shadowRoot.appendChild(style);

    popupBox = document.createElement('div');
    popupBox.className = 'aura-panel';
    shadowRoot.appendChild(popupBox);

    (document.body || document.documentElement).appendChild(hostEl);
    return shadowRoot;
  }

  // 3. 隐藏浮窗
  function hidePopup() {
    if (!popupBox) return;
    popupBox.classList.remove('visible');
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
      if (popupBox) popupBox.style.display = 'none';
      currentWordData = null;
    }, 200);
  }

  // 4. 检查是否在生词本
  async function checkIsSaved(word) {
    if (!word) return false;
    try {
      const { vocabBook = {} } = await chrome.storage.local.get('vocabBook');
      return !!vocabBook[word.toLowerCase().trim()];
    } catch {
      return false;
    }
  }

  // 5. 切换生词本状态
  async function toggleBookmark() {
    if (!currentWordData) return;
    const key = currentWordData.word.toLowerCase().trim();
    try {
      const { vocabBook = {} } = await chrome.storage.local.get('vocabBook');
      const starBtn = shadowRoot.querySelector('#btn-star');
      const ledEl = shadowRoot.querySelector('#top-led');

      if (vocabBook[key]) {
        delete vocabBook[key];
        if (starBtn) starBtn.classList.remove('starred');
        if (ledEl) ledEl.classList.remove('active');
      } else {
        let docTitle = document.title || '';
        if ((!docTitle || docTitle.startsWith('file://')) && window.location.protocol === 'file:') {
          try {
            docTitle = decodeURIComponent(window.location.pathname.split('/').filter(Boolean).pop() || '本地 PDF 文档');
          } catch {
            docTitle = '本地 PDF 文档';
          }
        }

        vocabBook[key] = {
          word: currentWordData.word,
          phonetic: currentWordData.phonetic || '',
          explains: currentWordData.explains || [],
          audioUrl: currentWordData.audioUrl || '',
          contextSentence: currentSelectionContext || '',
          sourceUrl: window.location.href,
          sourceTitle: docTitle,
          addTime: Date.now()
        };
        if (starBtn) starBtn.classList.add('starred');
        if (ledEl) ledEl.classList.add('active');
      }

      await chrome.storage.local.set({ vocabBook });
    } catch (err) {
      console.warn('[Aura Dict] 收藏操作失败:', err);
    }
  }

  // 6. 播放发音
  function playAudio() {
    if (!currentWordData) return;
    const audioBtn = shadowRoot.querySelector('#btn-audio');
    if (audioBtn) {
      audioBtn.classList.add('depressed');
      setTimeout(() => audioBtn.classList.remove('depressed'), 250);
    }

    if (currentWordData.audioUrl) {
      const audio = new Audio(currentWordData.audioUrl);
      audio.play().catch(() => {
        speakFallback(currentWordData.word);
      });
    } else {
      speakFallback(currentWordData.word);
    }
  }

  function speakFallback(text) {
    if ('speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = /[\u4e00-\u9fa5]/.test(text) ? 'zh-CN' : 'en-US';
      window.speechSynthesis.speak(utter);
    }
  }

  // 7. 提取上下文原句
  function extractContextSentence(selection) {
    try {
      const node = selection.anchorNode;
      if (!node || node.nodeType !== Node.TEXT_NODE) return '';
      const text = node.textContent;
      const offset = selection.anchorOffset;

      const startSub = text.slice(0, offset);
      const startMatch = startSub.search(/([.?!;。！？；]\s*)([^.?!;。！？；]*)$/);
      const startIdx = startMatch !== -1 ? startMatch + RegExp.$1.length : 0;

      const endSub = text.slice(offset);
      const endMatch = endSub.search(/[.?!;。！？；]/);
      const endIdx = endMatch !== -1 ? offset + endMatch + 1 : text.length;

      const sentence = text.slice(startIdx, endIdx).trim();
      return sentence.length < 250 ? sentence : '';
    } catch {
      return '';
    }
  }

  // 8. 核心渲染浮窗
  function renderPanel(word, pos) {
    ensureHostContainer();

    // 立即显示加载中的骨架屏（零等待视觉响应）
    popupBox.innerHTML = `
      <div class="aura-topbar">
        <div class="aura-device-badge">
          <span class="aura-led" id="top-led"></span>
          <span>AURA • 查词中</span>
        </div>
        <button class="aura-btn" id="btn-close" title="关闭面板">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
      <div class="aura-meaning-inset">
        <div class="aura-status-msg">正在感知 “${escapeHtml(word)}” 释义...</div>
      </div>
    `;

    positionPanel(pos);
    popupBox.style.display = 'block';
    requestAnimationFrame(() => popupBox.classList.add('visible'));

    shadowRoot.querySelector('#btn-close').onclick = hidePopup;

    // 发起查询请求
    try {
      chrome.runtime.sendMessage({ action: 'FETCH_YOUDAO', word }, async (res) => {
        if (!popupBox || !popupBox.classList.contains('visible')) return;

        if (chrome.runtime.lastError) {
          popupBox.querySelector('.aura-meaning-inset').innerHTML = `
            <div class="aura-status-msg" style="color: #bf6060;">
              扩展已更新，请刷新当前网页后使用。
            </div>
          `;
          return;
        }

        if (!res || !res.success || !res.data) {
          popupBox.querySelector('.aura-meaning-inset').innerHTML = `
            <div class="aura-status-msg" style="color: #bf6060;">
              ${escapeHtml(res ? res.error : '未查询到匹配释义')}
            </div>
          `;
          return;
        }

        currentWordData = res.data;
        const isStarred = await checkIsSaved(currentWordData.word);

        popupBox.innerHTML = `
          <div class="aura-topbar">
            <div class="aura-device-badge">
              <span class="aura-led ${isStarred ? 'active' : ''}" id="top-led"></span>
              <span>AURA • 有道词典</span>
            </div>
            <div class="aura-actions">
              <button class="aura-btn" id="btn-audio" title="发音">
                <svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
              </button>
              <button class="aura-btn ${isStarred ? 'starred' : ''}" id="btn-star" title="${isStarred ? '从生词本移出' : '收录至生词本'}">
                <svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
              </button>
              <button class="aura-btn" id="btn-close" title="关闭面板">
                <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
            </div>
          </div>

          <div class="aura-word-row">
            <div class="aura-word">${escapeHtml(currentWordData.word)}</div>
            ${currentWordData.phonetic ? `<div class="aura-phonetic">[${escapeHtml(currentWordData.phonetic)}]</div>` : ''}
          </div>

          <div class="aura-meaning-inset">
            <ul class="aura-explains-list">
              ${currentWordData.explains.map(item => `
                <li class="aura-explain-item">
                  <span class="aura-explain-dot"></span>
                  <span>${escapeHtml(item)}</span>
                </li>
              `).join('')}
            </ul>
          </div>

          <div class="aura-footer-tag">
            <span>触感数字面板</span>
            <span>${isStarred ? '● 已入库' : '○ 点击星标入库'}</span>
          </div>
        `;

        shadowRoot.querySelector('#btn-audio').onclick = playAudio;
        shadowRoot.querySelector('#btn-star').onclick = toggleBookmark;
        shadowRoot.querySelector('#btn-close').onclick = hidePopup;

        positionPanel(pos);
      });
    } catch (err) {
      console.error('[Aura Dict] 通信异常:', err);
    }
  }

  // 9. 定位计算
  function positionPanel(pos) {
    if (!popupBox) return;
    const panelWidth = 310;
    const margin = 12;

    let left = pos.left + (pos.width / 2) - (panelWidth / 2);
    if (left < margin) left = margin;
    if (left + panelWidth > window.innerWidth - margin) {
      left = window.innerWidth - panelWidth - margin;
    }

    let top = pos.bottom + 8;
    const estimatedHeight = 180;
    if (top + estimatedHeight > window.innerHeight - margin) {
      top = Math.max(margin, pos.top - estimatedHeight - 8);
    }

    popupBox.style.left = `${Math.round(left)}px`;
    popupBox.style.top = `${Math.round(top)}px`;
  }

  // 10. 划词事件监听
  document.addEventListener('mouseup', (e) => {
    // 插件休眠不响应
    if (!isEnabled) return;

    // 点击发生在浮窗内部不重复触发
    if (hostEl && e.composedPath().includes(hostEl)) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const rawText = selection.toString().trim();
    if (!rawText) return;

    // 修剪去除首尾标点符号
    const cleanText = rawText.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').trim();

    // 允许中英文短语与词汇（长度在 1~80 之间）
    if (!cleanText || cleanText.length > 80) return;

    const range = selection.getRangeAt(0);
    let rect = range.getBoundingClientRect();

    // 若 rect 获取异常则使用事件坐标兜底
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      rect = {
        left: e.clientX,
        right: e.clientX,
        top: e.clientY,
        bottom: e.clientY,
        width: 1,
        height: 1
      };
    }

    currentSelectionContext = extractContextSentence(selection);
    renderPanel(cleanText, rect);
  });

  // 11. 点击外部关闭
  document.addEventListener('mousedown', (e) => {
    if (hostEl && !e.composedPath().includes(hostEl)) {
      hidePopup();
    }
  });

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
