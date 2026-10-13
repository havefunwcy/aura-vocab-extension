/**
 * Aura Dict - Background Service Worker
 * 负责跨域网络请求代理：查询有道词典 API（支持 jsonapi + suggest 双源容灾）
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'FETCH_YOUDAO') {
    handleLookup(request.word)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message || '查询失败' }));
    return true; // 保持异步通信通道开启
  }
});

async function handleLookup(rawWord) {
  if (!rawWord) throw new Error('查询词为空');
  // 智能去除首尾标点符号与空白
  const word = rawWord.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  if (!word) throw new Error('查询词无效');

  // 1. 优先调用信息最完整的有道 jsonapi 接口
  try {
    const jsonApiUrl = `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(word)}`;
    const res = await fetch(jsonApiUrl);
    if (res.ok) {
      const data = await res.json();
      
      // 1.1 英文查词 (ec)
      if (data.ec && data.ec.word && data.ec.word.length > 0) {
        const wInfo = data.ec.word[0];
        const phonetic = wInfo.usphone || wInfo.ukphone || wInfo.phone || '';
        const explains = [];
        if (wInfo.trs && Array.isArray(wInfo.trs)) {
          wInfo.trs.forEach(item => {
            const exp = item.tr?.[0]?.l?.i?.[0];
            if (exp) explains.push(exp);
          });
        }
        if (explains.length > 0) {
          return {
            word: wInfo['return-phrase']?.l?.i || word,
            phonetic: phonetic,
            explains: explains,
            audioUrl: `https://dict.youdao.com/dictvoice?type=2&audio=${encodeURIComponent(word)}`
          };
        }
      }

      // 1.2 中文查词 (ce)
      if (data.ce && data.ce.word && data.ce.word.length > 0) {
        const cInfo = data.ce.word[0];
        const phonetic = cInfo.phone || '';
        const explains = [];
        if (cInfo.trs && Array.isArray(cInfo.trs)) {
          cInfo.trs.forEach(item => {
            const transObj = item.tr?.[0];
            const tranText = transObj?.['#tran'] || '';
            const linkWord = transObj?.l?.i?.find?.(x => typeof x === 'object' && x['#text'])?.['#text'] || '';
            const combined = [linkWord, tranText].filter(Boolean).join(': ');
            if (combined) explains.push(combined);
          });
        }
        if (explains.length > 0) {
          return {
            word: word,
            phonetic: phonetic,
            explains: explains,
            audioUrl: `https://dict.youdao.com/dictvoice?type=2&audio=${encodeURIComponent(word)}`
          };
        }
      }

      // 1.3 网络释义兜底 (web_trans)
      if (data.web_trans && data.web_trans['web-translation']) {
        const transList = data.web_trans['web-translation'];
        const explains = [];
        transList.slice(0, 3).forEach(t => {
          const val = t.trans?.[0]?.value;
          if (val) explains.push(val);
        });
        if (explains.length > 0) {
          return {
            word: word,
            phonetic: '',
            explains: explains,
            audioUrl: `https://dict.youdao.com/dictvoice?type=2&audio=${encodeURIComponent(word)}`
          };
        }
      }
    }
  } catch (e) {
    console.warn('[Aura Dict] jsonapi 异常，尝试 suggest 备用接口', e);
  }

  // 2. 备用接口：有道轻量 Suggest API (注意参数是 q=word)
  try {
    const suggestUrl = `https://dict.youdao.com/suggest?q=${encodeURIComponent(word)}&le=en&num=3&doctype=json`;
    const res = await fetch(suggestUrl);
    if (res.ok) {
      const json = await res.json();
      if (json && json.data && json.data.entries && json.data.entries.length > 0) {
        const entry = json.data.entries[0];
        const rawExplain = entry.explain || '';
        const explains = rawExplain.split(';').map(s => s.trim()).filter(Boolean);
        return {
          word: entry.entry || word,
          phonetic: entry.phonetic || '',
          explains: explains.length ? explains : [rawExplain || '暂无详细释义'],
          audioUrl: `https://dict.youdao.com/dictvoice?type=2&audio=${encodeURIComponent(entry.entry || word)}`
        };
      }
    }
  } catch (e) {
    console.error('[Aura Dict] suggest 备用接口失败', e);
  }

  throw new Error(`未收录 “${word}” 的释义`);
}
