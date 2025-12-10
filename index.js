document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // 1. CONFIGURATION & STATE
    // =========================================================================
    
    // [VIP CHECK]
    const isVipUser = (typeof window.IS_VIP !== 'undefined' && window.IS_VIP === true);

    const STORAGE_KEY = 'trinh_hg_settings_v26_fixed';
    const INPUT_STATE_KEY = 'trinh_hg_input_state_v26';
  
    // MARKERS
    const MARK_REP_START  = '\uE000'; 
    const MARK_REP_END    = '\uE001';
    const MARK_CAP_START  = '\uE002'; 
    const MARK_CAP_END    = '\uE003';
    const MARK_BOTH_START = '\uE004'; 
    const MARK_BOTH_END   = '\uE005';
  
    const defaultState = {
      currentMode: 'default',
      activeTab: 'settings',
      modes: {
        default: { 
            pairs: [], 
            matchCase: false, 
            wholeWord: false, 
            autoCaps: false, 
            exceptions: 'jpg, png, com, vn, net'
        }
      }
    };
  
    let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;
    if (!state.activeTab) state.activeTab = 'settings';
    if (!state.modes || Object.keys(state.modes).length === 0) {
        state.modes = JSON.parse(JSON.stringify(defaultState.modes));
        state.currentMode = 'default';
    }
    if (!state.modes[state.currentMode]) state.currentMode = Object.keys(state.modes)[0] || 'default';
  
    let currentSplitMode = 2;
    let saveTimeout;

    // Device ID Logic
    let deviceId = localStorage.getItem('trinh_hg_device_id');
    if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
        localStorage.setItem('trinh_hg_device_id', deviceId);
    }
    const hiddenDeviceInput = document.getElementById('device-id-input');
    if (hiddenDeviceInput) hiddenDeviceInput.value = deviceId;

    // Heartbeat (VIP Only)
    if (isVipUser) {
        setInterval(() => {
            fetch('/api/heartbeat').then(res => { if (res.status === 401) window.location.reload(); }).catch(() => {});
        }, 30000);
    }
  
    // =========================================================================
    // 2. DOM ELEMENTS
    // =========================================================================
    const els = {
      modeSelect: document.getElementById('mode-select'),
      list: document.getElementById('punctuation-list'),
      matchCaseBtn: document.getElementById('match-case'),
      wholeWordBtn: document.getElementById('whole-word'),
      autoCapsBtn: document.getElementById('auto-caps'), 
      
      // Buttons
      addModeBtn: document.getElementById('add-mode'),
      copyModeBtn: document.getElementById('copy-mode'),
      renameBtn: document.getElementById('rename-mode'),
      deleteBtn: document.getElementById('delete-mode'),
      
      emptyState: document.getElementById('empty-state'),
      capsExceptionInput: document.getElementById('caps-exception'),
      saveExceptionBtn: document.getElementById('save-exception-btn'),
      
      importBtn: document.getElementById('import-settings'),
      exportBtn: document.getElementById('export-settings'),

      inputText: document.getElementById('input-text'),
      outputText: document.getElementById('output-text'),
      replaceBtn: document.getElementById('replace-button'),
      
      splitInput: document.getElementById('split-input-text'),
      splitWrapper: document.getElementById('split-outputs-wrapper'),
      splitRegexInput: document.getElementById('split-regex-input'),
      splitTypeRadios: document.getElementsByName('split-type'),
      splitControlCount: document.getElementById('split-type-count'),
      splitControlRegex: document.getElementById('split-type-regex'),
      splitActionBtn: document.getElementById('split-action-btn'),
      clearSplitRegexBtn: document.getElementById('clear-split-regex'),
      
      inputCount: document.getElementById('input-word-count'),
      outputCount: document.getElementById('output-word-count'),
      replaceCountBadge: document.getElementById('count-replace'),
      capsCountBadge: document.getElementById('count-caps'),
      splitInputCount: document.getElementById('split-input-word-count'),

      // Modal
      buyKeyBtn: document.getElementById('buy-key-btn'),
      modal: document.getElementById('buy-key-modal'),
      closeModal: document.querySelector('.modal-close')
    };
  
    // =========================================================================
    // 3. HELPER FUNCTIONS
    // =========================================================================
    function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    
    function showNotification(msg, type = 'success') {
      const container = document.getElementById('notification-container');
      if(!container) return;
      const note = document.createElement('div');
      note.className = `notification ${type}`;
      note.textContent = msg;
      container.appendChild(note);
      setTimeout(() => { note.style.opacity = '0'; setTimeout(() => note.remove(), 300); }, 2000); 
    }
  
    function normalizeText(text) {
      if (typeof text !== 'string') return '';
      if (text.length === 0) return text;
      return text.replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB\u275D\u275E\u301D-\u301F\uFF02\u02DD]/g, '"')
                 .replace(/[\u2018\u2019\u201A\u201B\u2039\u203A\u275B\u275C\u276E\u276F\uA78C\uFF07]/g, "'")
                 .replace(/\u00A0/g, ' ');
    }
    
    function escapeHTML(str) { return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
    function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function preserveCase(o, r) {
        if (o === o.toUpperCase() && o !== o.toLowerCase()) return r.toUpperCase();
        if (o[0] === o[0].toUpperCase()) return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
        return r;
    }
    function countWords(str) { return str.trim() ? str.trim().split(/\s+/).length : 0; }

    function debounceSave() { 
        clearTimeout(saveTimeout); 
        saveTimeout = setTimeout(() => { 
            saveTempInput(); 
            if(state.activeTab==='settings') saveCurrentPairsToState(true); 
        }, 500); 
    }
    function saveTempInput() { 
        const data = { inputText: els.inputText.value, splitInput: els.splitInput.value };
        localStorage.setItem(INPUT_STATE_KEY, JSON.stringify(data)); 
    }
    function updateCounters() {
      els.inputCount.textContent = 'Words: ' + countWords(els.inputText.value);
      els.splitInputCount.textContent = 'Words: ' + countWords(els.splitInput.value);
    }

    // =========================================================================
    // 4. CORE: FIND & REPLACE (2 PHASES)
    // =========================================================================
    
    function performReplaceAll() {
        let rawText = els.inputText.value;
        if (!rawText) return showNotification("Chưa có nội dung!", "error");

        // [VIP CHECK] Word Limit Logic
        if (!isVipUser) {
            const wc = countWords(rawText);
            if (wc > 2000) {
                showNotification("Free: Cắt xuống 2000 từ!", "warning");
                // Cắt ước lượng để tránh treo
                const limitChar = 2000 * 15; 
                if(rawText.length > limitChar) rawText = rawText.substring(0, limitChar);
                const words = rawText.trim().split(/\s+/);
                rawText = words.slice(0, 2000).join(" ");
                els.inputText.value = rawText; // Update UI với text đã cắt
            }
        }

        // [VIP CHECK] Use setTimeout to prevent UI freeze
        setTimeout(() => {
            const mode = state.modes[state.currentMode];
            let processedText = normalizeText(rawText);
            
            // Clean Spacing
            processedText = processedText.replace(/\n\s*\n\s*\n+/g, '\n').split(/\r?\n/).filter(line => line.trim() !== '').join('\n\n');

            let countReplace = 0;
            let countCaps = 0;

            // [VIP CHECK] Pairs Limit
            let pairs = mode.pairs || [];
            if (!isVipUser && pairs.length > 10) pairs = pairs.slice(0, 10);

            // --- BƯỚC 1: REPLACE ---
            if (pairs.length > 0) {
                const rules = pairs
                    .filter(p => p.find && p.find.trim())
                    .map(p => ({ find: normalizeText(p.find), replace: normalizeText(p.replace || '') }))
                    .sort((a,b) => b.find.length - a.find.length);

                rules.forEach(rule => {
                    const pattern = escapeRegExp(rule.find);
                    const flags = mode.matchCase ? 'g' : 'gi';
                    const regex = mode.wholeWord ? new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, flags + 'u') : new RegExp(pattern, flags);
                    
                    processedText = processedText.replace(regex, (match) => {
                        countReplace++;
                        let replacement = rule.replace;
                        if (!mode.matchCase) replacement = preserveCase(match, replacement);
                        return `${MARK_REP_START}${replacement}${MARK_REP_END}`;
                    });
                });
            }

            // --- BƯỚC 2: AUTO CAPS ---
            if (mode.autoCaps) {
                const exceptionList = (mode.exceptions || "").split(',').map(s => s.trim().toLowerCase()).filter(s => s);
                const autoCapsRegex = /(^|[.?!]\s+)(?:(\uE000)(.*?)(\uE001)|([^\s\uE000\uE001]+))/gmu;

                processedText = processedText.replace(autoCapsRegex, (match, prefix, mStart, mContent, mEnd, rawWord) => {
                    let targetWord = mContent || rawWord;
                    if (!targetWord) return match;
                    if (exceptionList.includes(targetWord.toLowerCase())) return match;
                    
                    let cappedWord = targetWord.charAt(0).toUpperCase() + targetWord.slice(1);
                    if (mStart) {
                        countCaps++;
                        return `${prefix}${MARK_BOTH_START}${cappedWord}${MARK_BOTH_END}`;
                    } else {
                        if (rawWord.charAt(0) === rawWord.charAt(0).toUpperCase()) return match;
                        countCaps++;
                        return `${prefix}${MARK_CAP_START}${cappedWord}${MARK_CAP_END}`;
                    }
                });
            }

            // --- RENDER HTML ---
            let finalHTML = ''; let buffer = '';
            for (let i = 0; i < processedText.length; i++) {
                const c = processedText[i];
                if (c === MARK_REP_START) { finalHTML += escapeHTML(buffer) + '<mark class="hl-yellow">'; buffer = ''; }
                else if (c === MARK_REP_END || c === MARK_CAP_END || c === MARK_BOTH_END) { finalHTML += escapeHTML(buffer) + '</mark>'; buffer = ''; }
                else if (c === MARK_CAP_START) { finalHTML += escapeHTML(buffer) + '<mark class="hl-blue">'; buffer = ''; }
                else if (c === MARK_BOTH_START) { finalHTML += escapeHTML(buffer) + '<mark class="hl-orange">'; buffer = ''; }
                else { buffer += c; }
            }
            finalHTML += escapeHTML(buffer);

            // Update UI
            els.outputText.innerHTML = finalHTML;
            els.replaceCountBadge.textContent = `Replace: ${countReplace}`;
            els.capsCountBadge.textContent = `Auto-Caps: ${countCaps}`;
            updateCounters();
            
            els.inputText.value = ''; saveTempInput();
            showNotification("Hoàn tất xử lý!");
        }, 10);
    }

    // =========================================================================
    // 5. SPLITTER
    // =========================================================================
    
    function renderSplitPlaceholders(count) {
        els.splitWrapper.innerHTML = ''; 
        for (let i = 1; i <= count; i++) {
             const div = document.createElement('div'); div.className = 'split-box';
             div.innerHTML = `
                <div class="split-header"><span>Phần ${i} (Chờ kết quả...)</span><span class="badge">0 W</span></div>
                <textarea id="out-split-${i-1}" class="custom-scrollbar" readonly placeholder="Kết quả phần ${i} sẽ hiện ở đây..."></textarea>
                <div class="split-footer"><button class="btn btn-success full-width copy-split-btn" data-target="out-split-${i-1}" data-seq="${i}">Sao chép ${i}</button></div>
            `;
            els.splitWrapper.appendChild(div);
        }
        bindCopyEvents();
    }

    function performSplit() {
        const text = els.splitInput.value;
        if(!text.trim()) return showNotification('Chưa có nội dung!', 'error');
        
        // [VIP CHECK] Split Limit
        let workingText = text;
        if (!isVipUser) {
            const wc = countWords(text);
            if (wc > 10000) {
                showNotification("Free: Cắt xuống 10,000 từ!", "warning");
                workingText = text.substring(0, 10000 * 8); // Slice rough
            }
        }

        setTimeout(() => {
            const splitType = document.querySelector('input[name="split-type"]:checked').value;

            if (splitType === 'regex') {
                const regexStr = els.splitRegexInput.value;
                if (!regexStr) return showNotification("Chưa nhập Regex!", "error");
                try {
                    const regex = new RegExp(regexStr, 'gmi');
                    const matches = [...workingText.matchAll(regex)];
                    if (matches.length === 0) return showNotification("Không tìm thấy chương nào!", "warning");
                    
                    let parts = [];
                    for (let i = 0; i < matches.length; i++) {
                        const start = matches[i].index;
                        const end = (i < matches.length - 1) ? matches[i+1].index : workingText.length;
                        let chunk = workingText.substring(start, end).trim().split(/\r?\n/).filter(l => l.trim()).join('\n\n');
                        const title = chunk.split('\n')[0].trim();
                        parts.push({ content: chunk, title: title || `Phần ${i+1}` });
                    }
                    renderFilledSplitGrid(parts); 
                    showNotification(`Đã tìm thấy ${parts.length} chương!`);
                } catch (e) { return showNotification("Regex không hợp lệ!", "error"); }
            } else {
                // Count Mode Logic
                // [VIP CHECK] Parts Limit
                let targetParts = currentSplitMode;
                if (!isVipUser && targetParts > 4) targetParts = 4;

                const lines = normalizeText(workingText).split('\n');
                let chapterHeader = '', contentBody = normalizeText(workingText);
                if (/^(Chương|Chapter|Hồi)\s+\d+/.test(lines[0].trim())) { chapterHeader = lines[0].trim(); contentBody = lines.slice(1).join('\n'); }
                const paragraphs = contentBody.split('\n').filter(p => p.trim());
                const targetWords = Math.ceil(countWords(contentBody) / targetParts);
                let currentPart = [], currentCount = 0, rawParts = [];
                
                for (let p of paragraphs) {
                    const wCount = countWords(p);
                    if (currentCount + wCount > targetWords && rawParts.length < targetParts - 1) { rawParts.push(currentPart.join('\n\n')); currentPart = [p]; currentCount = wCount; } 
                    else { currentPart.push(p); currentCount += wCount; }
                }
                if (currentPart.length) rawParts.push(currentPart.join('\n\n'));
                
                renderSplitPlaceholders(targetParts);

                for(let i = 0; i < targetParts; i++) {
                    let pContent = rawParts[i] || '';
                    let h = `Phần ${i+1}`;
                    if (chapterHeader && pContent) { h = chapterHeader.replace(/(\d+)/, (m, n) => `${n}.${i+1}`); pContent = h + '\n\n' + pContent; }
                    const textArea = document.getElementById(`out-split-${i}`);
                    const headerSpan = textArea ? textArea.parentElement.querySelector('.split-header span:first-child') : null;
                    const badge = textArea ? textArea.parentElement.querySelector('.badge') : null;
                    if (textArea) { textArea.value = pContent; if(headerSpan) headerSpan.textContent = pContent ? h : `Phần ${i+1} (Trống)`; if(badge) badge.textContent = countWords(pContent) + ' W'; }
                }
                showNotification(`Đã chia xong!`);
            }
            els.splitInput.value = ''; saveTempInput();
        }, 10);
    }

    function renderFilledSplitGrid(parts) {
        els.splitWrapper.innerHTML = '';
        parts.forEach((part, index) => {
            const div = document.createElement('div'); div.className = 'split-box';
            div.innerHTML = `
                <div class="split-header"><span>${part.title.substring(0,27)}...</span><span class="badge">${countWords(part.content)} W</span></div>
                <textarea id="out-split-${index}" class="custom-scrollbar" readonly>${part.content}</textarea>
                <div class="split-footer"><button class="btn btn-success full-width copy-split-btn" data-target="out-split-${index}" data-seq="${index+1}">Sao chép ${index+1}</button></div>`;
            els.splitWrapper.appendChild(div);
        });
        bindCopyEvents();
    }

    function bindCopyEvents() {
        els.splitWrapper.querySelectorAll('.copy-split-btn').forEach(b => {
            b.onclick = (e) => {
                const el = document.getElementById(e.target.dataset.target);
                if(el && el.value) { 
                    navigator.clipboard.writeText(el.value); 
                    e.target.textContent = `Đã chép ${e.target.dataset.seq}!`;
                    setTimeout(()=>{ e.target.textContent = `Sao chép ${e.target.dataset.seq}`; }, 1500);
                } else showNotification("Ô trống!", "warning");
            };
        });
    }

    // =========================================================================
    // 6. UI & EVENTS
    // =========================================================================
    function renderModeSelect() {
      els.modeSelect.innerHTML = '';
      Object.keys(state.modes).sort().forEach(m => {
        const opt = document.createElement('option'); opt.value = m; opt.textContent = m;
        els.modeSelect.appendChild(opt);
      });
      if(!state.modes[state.currentMode]) state.currentMode = 'default';
      els.modeSelect.value = state.currentMode;
      updateModeUI();
    }
  
    function updateModeUI() {
      const mode = state.modes[state.currentMode];
      if(mode) {
          const upd = (btn, act, txt) => { btn.textContent = `${txt}: ${act ? 'BẬT' : 'Tắt'}`; btn.classList.toggle('active', act); };
          upd(els.matchCaseBtn, mode.matchCase, 'Match Case');
          upd(els.wholeWordBtn, mode.wholeWord, 'Whole Word');
          upd(els.autoCapsBtn, mode.autoCaps, 'Auto Caps');
          els.capsExceptionInput.value = mode.exceptions || '';
      }
    }
  
    function addPairToUI(find = '', replace = '', append = false) {
      // [VIP CHECK] Pairs Limit
      if (!isVipUser && els.list.children.length >= 10) {
          return alert("Bản Free giới hạn 10 cặp! Nâng cấp VIP để mở khóa.");
      }

      const item = document.createElement('div'); item.className = 'punctuation-item';
      item.innerHTML = `<span class="pair-index">#</span><input type="text" class="find" placeholder="Tìm" value="${find.replace(/"/g, '&quot;')}"><input type="text" class="replace" placeholder="Thay thế" value="${replace.replace(/"/g, '&quot;')}"><button class="remove" tabindex="-1">×</button>`;
      item.querySelector('.remove').onclick = () => { item.remove(); updatePairIndexes(); checkEmptyState(); saveCurrentPairsToState(true); };
      item.querySelectorAll('input').forEach(inp => inp.addEventListener('input', debounceSave));
      if (append) els.list.appendChild(item); else els.list.insertBefore(item, els.list.firstChild);
      updatePairIndexes(); checkEmptyState();
    }
    
    function updatePairIndexes() {
        const items = Array.from(els.list.children);
        items.forEach((item, index) => { item.querySelector('.pair-index').textContent = items.length - index; });
    }

    function loadSettingsToUI() {
      els.list.innerHTML = '';
      const mode = state.modes[state.currentMode];
      if (mode && mode.pairs) mode.pairs.forEach(p => addPairToUI(p.find, p.replace, true));
      updateModeUI(); checkEmptyState();
    }
    function checkEmptyState() { els.emptyState.classList.toggle('hidden', els.list.children.length > 0); }
    function saveCurrentPairsToState(silent = false) {
      const items = Array.from(els.list.children);
      const newPairs = items.map(item => ({ find: item.querySelector('.find').value, replace: item.querySelector('.replace').value })).filter(p => p.find !== '');
      state.modes[state.currentMode].pairs = newPairs;
      saveState(); if (!silent) showNotification('Đã lưu cài đặt!', 'success');
    }
    
    // CSV Logic
    function parseCSVLine(text) {
        const result = []; let cell = ''; let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '"') { if (inQuotes && text[i+1] === '"') { cell += '"'; i++; } else { inQuotes = !inQuotes; } } 
            else if ((char === ',' || char === '\t') && !inQuotes) { result.push(cell.trim()); cell = ''; } 
            else { cell += char; }
        } result.push(cell.trim()); return result;
    }
    function importCSV(file) {
        if(!isVipUser) return showNotification("VIP Only!", "error");
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result; const lines = text.split(/\r?\n/);
            if (!lines[0].toLowerCase().includes('find') || !lines[0].toLowerCase().includes('replace')) return showNotification('Lỗi Header CSV!', 'error');
            let count = 0;
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim(); if (!line) continue;
                const cols = parseCSVLine(line);
                if (cols.length >= 2) {
                    const find = cols[0]; const replace = cols[1]; const modeName = cols[2] || 'default';
                    if (find) {
                        if (!state.modes[modeName]) state.modes[modeName] = JSON.parse(JSON.stringify(defaultState.modes.default));
                        state.modes[modeName].pairs.push({ find, replace }); count++;
                    }
                }
            }
            saveState(); renderModeSelect(); loadSettingsToUI(); showNotification(`Đã nhập ${count} cặp!`);
        }; reader.readAsText(file);
    }
    function exportCSV() {
        if(!isVipUser) return showNotification("VIP Only!", "error");
        saveCurrentPairsToState(true);
        let csvContent = "\uFEFFfind,replace,mode\n"; 
        Object.keys(state.modes).forEach(modeName => {
            const mode = state.modes[modeName];
            if (mode.pairs) mode.pairs.forEach(p => { csvContent += `"${(p.find||'').replace(/"/g, '""')}","${(p.replace||'').replace(/"/g, '""')}","${modeName.replace(/"/g, '""')}"\n`; });
        });
        const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'settings_full.csv'; a.click();
    }

    function loadTempInput() {
      const saved = JSON.parse(localStorage.getItem(INPUT_STATE_KEY));
      if(saved) { els.inputText.value = saved.inputText || ''; els.splitInput.value = saved.splitInput || ''; }
      updateCounters();
    }
    function switchTab(tabId) {
        document.querySelectorAll('.tab-button').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === tabId));
        state.activeTab = tabId; saveState();
    }

    function initEvents() {
      document.querySelectorAll('.tab-button').forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
      const toggleHandler = (prop) => { const m = state.modes[state.currentMode]; m[prop] = !m[prop]; saveState(); updateModeUI(); };
      els.matchCaseBtn.onclick = () => toggleHandler('matchCase');
      els.wholeWordBtn.onclick = () => toggleHandler('wholeWord');
      els.autoCapsBtn.onclick = () => toggleHandler('autoCaps');
      
      els.modeSelect.onchange = (e) => { 
          state.currentMode = e.target.value; 
          saveState(); 
          loadSettingsToUI(); 
      };
      
      els.saveExceptionBtn.onclick = () => {
          state.modes[state.currentMode].exceptions = els.capsExceptionInput.value;
          saveState();
          showNotification('Đã lưu ngoại lệ!');
      };

      // [VIP CHECK] Mode Actions
      els.addModeBtn.onclick = () => { 
          if (!isVipUser) return showNotification("Free: Không được thêm Mode!", "error");
          const n = prompt('Tên Mode mới:'); 
          if(n && !state.modes[n]) { state.modes[n] = JSON.parse(JSON.stringify(defaultState.modes.default)); state.currentMode = n; saveState(); renderModeSelect(); loadSettingsToUI(); }
      };
      els.copyModeBtn.onclick = () => {
        if (!isVipUser) return showNotification("Free: Không được sao chép Mode!", "error");
        const n = prompt('Tên Mode bản sao:'); 
        if(n && !state.modes[n]) { state.modes[n] = JSON.parse(JSON.stringify(state.modes[state.currentMode])); state.currentMode = n; saveState(); renderModeSelect(); loadSettingsToUI(); }
      };
      els.renameBtn.onclick = () => { 
          if (!isVipUser) return showNotification("Free: Không được đổi tên!", "error");
          const n = prompt('Tên mới:', state.currentMode); 
          if(n && n !== state.currentMode && !state.modes[n]) { state.modes[n] = state.modes[state.currentMode]; delete state.modes[state.currentMode]; state.currentMode = n; saveState(); renderModeSelect(); }
      };
      els.deleteBtn.onclick = () => { 
          if (!isVipUser && state.currentMode !== 'default') return showNotification("Free: Không được xóa Mode!", "error");
          if(confirm('Xóa chế độ này?')) { 
              delete state.modes[state.currentMode]; 
              const keys = Object.keys(state.modes);
              if (keys.length === 0) { state.modes['default'] = JSON.parse(JSON.stringify(defaultState.modes.default)); state.currentMode = 'default'; } else { state.currentMode = keys[0]; }
              saveState(); renderModeSelect(); loadSettingsToUI(); 
          }
      };
      document.getElementById('add-pair').onclick = () => addPairToUI();
      document.getElementById('save-settings').onclick = () => saveCurrentPairsToState();
      document.getElementById('export-settings').onclick = exportCSV;
      document.getElementById('import-settings').onclick = () => { 
          if(!isVipUser) return showNotification("VIP Only!", "error");
          const inp = document.createElement('input'); inp.type='file'; inp.accept='.csv'; inp.onchange = e => { if(e.target.files.length) importCSV(e.target.files[0]) }; inp.click(); 
      };
      els.replaceBtn.onclick = performReplaceAll;
      document.getElementById('copy-button').onclick = () => { if(els.outputText.innerText) { navigator.clipboard.writeText(els.outputText.innerText).then(() => { showNotification('Đã sao chép văn bản!'); }); }};

      // SPLIT EVENTS
      els.splitTypeRadios.forEach(radio => {
          radio.addEventListener('change', (e) => {
              if (e.target.value === 'regex' && !isVipUser) {
                  showNotification("VIP Only!", "error");
                  els.splitTypeRadios[0].checked = true; return;
              }
              const val = e.target.value;
              els.splitControlCount.classList.toggle('hidden', val !== 'count');
              els.splitControlRegex.classList.toggle('hidden', val !== 'regex');
              if(val === 'count') renderSplitPlaceholders(currentSplitMode);
              else els.splitWrapper.innerHTML = '';
          });
      });
      document.querySelectorAll('.split-mode-btn').forEach(btn => btn.onclick = () => { 
          const val = parseInt(btn.dataset.split);
          if(!isVipUser && val>4) return;
          document.querySelectorAll('.split-mode-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); 
          currentSplitMode = val; 
          renderSplitPlaceholders(currentSplitMode); // RENDER IMMEDIATE
      });
      els.splitActionBtn.onclick = performSplit;
      
      els.clearSplitRegexBtn.onclick = () => {
          els.splitWrapper.innerHTML = '';
          showNotification('Đã xóa kết quả chia!');
      };
      
      [els.inputText, els.splitInput].forEach(el => el.addEventListener('input', () => { updateCounters(); debounceSave(); }));

      // Modal
      if(els.buyKeyBtn) els.buyKeyBtn.onclick = () => els.modal.classList.add('active');
      if(els.closeModal) els.closeModal.onclick = () => els.modal.classList.remove('active');
      if(els.modal) window.onclick = (e) => { if(e.target == els.modal) els.modal.classList.remove('active'); };
    }

    // INIT
    renderModeSelect(); 
    loadSettingsToUI(); 
    loadTempInput(); 
    if(state.activeTab) switchTab(state.activeTab); 
    if (document.querySelector('input[name="split-type"]:checked').value === 'count') renderSplitPlaceholders(currentSplitMode);
    
    initEvents();
});
