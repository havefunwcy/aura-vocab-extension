/**
 * Aura Dict - Standalone Notebook Logic
 * 支持实时数据同步、全屏多列网格、发音播放、搜索检索与 Anki 词库导出
 */

document.addEventListener('DOMContentLoaded', async () => {
  const cardsGridEl = document.getElementById('cards-grid');
  const emptyWorkbenchEl = document.getElementById('empty-workbench');
  const totalCountEl = document.getElementById('total-count');
  const workbenchLedEl = document.getElementById('workbench-led');
  const searchInput = document.getElementById('nb-search');
  const clearSearchBtn = document.getElementById('nb-clear-search');
  const exportBtn = document.getElementById('btn-export-csv');
  const clearAllBtn = document.getElementById('btn-clear-all');
  const toastEl = document.getElementById('nb-toast');

  const openPdfBtn = document.getElementById('btn-open-pdf');

  if (openPdfBtn) {
    openPdfBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('reader.html') });
    });
  }

  let allVocab = [];
  let currentAudio = null;

  // 1. 初始化加载
  async function loadData() {
    const { vocabBook = {} } = await chrome.storage.local.get('vocabBook');
    allVocab = Object.values(vocabBook).sort((a, b) => (b.addTime || 0) - (a.addTime || 0));
    updateStats(allVocab.length);
    renderGrid(filterCards(searchInput.value.trim()));
  }

  // 2. 监听存储变动（当在网页划词新增或移除时，本页面自动无缝刷新）
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.vocabBook) {
      loadData();
    }
  });

  // 3. 状态指标
  function updateStats(count) {
    totalCountEl.textContent = count;
    if (count > 0) {
      workbenchLedEl.style.background = '#689f84';
      workbenchLedEl.style.boxShadow = '0 0 6px rgba(104, 159, 132, 0.8), inset 0 1px 1px rgba(255, 255, 255, 0.8)';
    } else {
      workbenchLedEl.style.background = '#aab5c2';
      workbenchLedEl.style.boxShadow = 'none';
    }
  }

  // 4. 搜索检索过滤
  function filterCards(kw) {
    if (!kw) return allVocab;
    const q = kw.toLowerCase();
    return allVocab.filter(item => {
      const matchWord = item.word && item.word.toLowerCase().includes(q);
      const matchExplain = item.explains && item.explains.some(e => e.toLowerCase().includes(q));
      const matchContext = item.contextSentence && item.contextSentence.toLowerCase().includes(q);
      return matchWord || matchExplain || matchContext;
    });
  }

  // 5. 渲染卡片网格
  function renderGrid(items) {
    cardsGridEl.innerHTML = '';

    if (items.length === 0) {
      cardsGridEl.style.display = 'none';
      emptyWorkbenchEl.style.display = 'flex';
      return;
    }

    cardsGridEl.style.display = 'grid';
    emptyWorkbenchEl.style.display = 'none';

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'vocab-card';

      const dateStr = item.addTime ? formatDate(item.addTime) : '';
      const domain = getDomain(item.sourceUrl);

      card.innerHTML = `
        <div class="card-top">
          <div class="card-title-box">
            <span class="word-heading">${escapeHtml(item.word)}</span>
            ${item.phonetic ? `<span class="word-ipa">[${escapeHtml(item.phonetic)}]</span>` : ''}
          </div>
          <div class="card-ctrls">
            <button class="tactile-circle-btn btn-audio" data-word="${escapeHtml(item.word)}" data-audio="${escapeHtml(item.audioUrl || '')}" title="播放有道真人发音">
              <svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
            </button>
            <button class="tactile-circle-btn danger btn-del" data-word="${escapeHtml(item.word)}" title="删除此条">
              <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
        </div>

        <div class="meaning-recess">
          <ul class="meaning-ul">
            ${(item.explains || []).map(exp => `
              <li class="meaning-li">
                <span class="meaning-dot"></span>
                <span>${escapeHtml(exp)}</span>
              </li>
            `).join('')}
          </ul>
        </div>

        ${item.contextSentence ? `
          <div class="context-quote-box" title="划词时的上下文语境">
            “${escapeHtml(item.contextSentence)}”
          </div>
        ` : ''}

        <div class="card-bottom-info">
          <span>${dateStr}</span>
          ${domain ? `<a class="source-link" href="${escapeHtml(item.sourceUrl || '#')}" target="_blank" title="${escapeHtml(item.sourceTitle || item.sourceUrl)}">${escapeHtml(domain)}</a>` : ''}
        </div>
      `;

      cardsGridEl.appendChild(card);
    });
  }

  // 6. 事件委托（发音与删除）
  cardsGridEl.addEventListener('click', async (e) => {
    const audioBtn = e.target.closest('.btn-audio');
    if (audioBtn) {
      audioBtn.classList.add('depressed');
      setTimeout(() => audioBtn.classList.remove('depressed'), 200);

      const word = audioBtn.dataset.word;
      const audioUrl = audioBtn.dataset.audio;
      playPronunciation(word, audioUrl);
      return;
    }

    const delBtn = e.target.closest('.btn-del');
    if (delBtn) {
      delBtn.classList.add('depressed');
      const word = delBtn.dataset.word.toLowerCase().trim();
      const { vocabBook = {} } = await chrome.storage.local.get('vocabBook');
      if (vocabBook[word]) {
        delete vocabBook[word];
        await chrome.storage.local.set({ vocabBook });
        showToast(`已移除生词: ${word}`);
        await loadData();
      }
    }
  });

  // 7. 发音播放
  function playPronunciation(word, audioUrl) {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }

    const soundUrl = audioUrl || `https://dict.youdao.com/dictvoice?type=2&audio=${encodeURIComponent(word)}`;
    currentAudio = new Audio(soundUrl);
    currentAudio.play().catch(() => {
      if ('speechSynthesis' in window) {
        const utter = new SpeechSynthesisUtterance(word);
        utter.lang = 'en-US';
        window.speechSynthesis.speak(utter);
      }
    });
  }

  // 8. 搜索输入
  searchInput.addEventListener('input', () => {
    const val = searchInput.value.trim();
    clearSearchBtn.style.display = val ? 'block' : 'none';
    renderGrid(filterCards(val));
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    renderGrid(allVocab);
    searchInput.focus();
  });

  // 9. 导出为 Anki / CSV
  exportBtn.addEventListener('click', () => {
    if (!allVocab.length) {
      showToast('生词库为空，无法导出');
      return;
    }

    exportBtn.classList.add('depressed');
    setTimeout(() => exportBtn.classList.remove('depressed'), 200);

    let csv = '\uFEFF';
    csv += '单词,音标,释义,上下文原句,来源网址,收录时间\n';

    allVocab.forEach(item => {
      const w = safeCsv(item.word);
      const p = safeCsv(item.phonetic ? `[${item.phonetic}]` : '');
      const exp = safeCsv((item.explains || []).join('; '));
      const ctx = safeCsv(item.contextSentence || '');
      const src = safeCsv(item.sourceUrl || '');
      const tm = safeCsv(formatDate(item.addTime));
      csv += `${w},${p},${exp},${ctx},${src},${tm}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.href = url;
    a.download = `Aura_Vocab_Anki_${now}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('已导出 Anki / CSV 词库文件');
  });

  // 10. 清空词本
  clearAllBtn.addEventListener('click', async () => {
    if (!allVocab.length) {
      showToast('生词库已是空的');
      return;
    }

    if (confirm('确认清空当前全部收录的生词吗？此操作无法撤销。')) {
      await chrome.storage.local.remove('vocabBook');
      showToast('生词库已清空');
      await loadData();
    }
  });

  // 11. Toast
  let toastTimer = null;
  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2200);
  }

  // 工具方法
  function safeCsv(str) {
    if (!str) return '""';
    return `"${String(str).replace(/"/g, '""')}"`;
  }

  function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    return `${m}-${day} ${hh}:${mm}`;
  }

  function getDomain(url) {
    if (!url) return '';
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  await loadData();
});
