document.addEventListener('DOMContentLoaded', () => {
    // === 1. CONFIG & STATE ===
    const STORAGE_KEY = 'trinh_hg_settings_v19_final';
    const INPUT_STATE_KEY = 'trinh_hg_input_state_v19';
  
    // MARKERS (Private Use Area)
    const MARK_REP_START = '\uE000'; const MARK_REP_END   = '\uE001';
    const MARK_CAP_START = '\uE002'; const MARK_CAP_END   = '\uE003';
    const MARK_BOTH_START = '\uE004'; const MARK_BOTH_END   = '\uE005';
  
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
    
    // Đảm bảo dữ liệu không lỗi
    if (!state.activeTab) state.activeTab = 'settings';
    if (!state.modes || Object.keys(state.modes).length === 0) {
        state.modes = { default: { pairs: [], matchCase: false, wholeWord: false, autoCaps: false, exceptions: 'jpg, png, com, vn, net' } };
        state.currentMode = 'default';
    }
    // Nếu mode hiện tại không tồn tại, lấy cái đầu tiên
    if (!state.modes[state.currentMode]) state.currentMode = Object.keys(state.modes)[0] || 'default';
  
    let currentSplitMode = 2;
    let saveTimeout;
  
    // DOM ELEMENTS
    const els = {
      modeSelect: document.getElementById('mode-select'),
      list: document.getElementById('punctuation-list'),
      inputText: document.getElementById('input-text'),
      outputText: document.getElementById('output-text'),
      
      splitInput: document.getElementById('split-input-text'),
      splitWrapper: document.getElementById('split-outputs-wrapper'),
      splitRegexInput: document.getElementById('split-regex-input'),
      splitTypeRadios: document.getElementsByName('split-type'),
      splitControlCount: document.getElementById('split-type-count'),
      splitControlRegex: document.getElementById('split-type-regex'),
      
      matchCaseBtn: document.getElementById('match-case'),
      wholeWordBtn: document.getElementById('whole-word'),
      autoCapsBtn: document.getElementById('auto-caps'), 
      renameBtn: document.getElementById('rename-mode'),
      deleteBtn: document.getElementById('delete-mode'),
      emptyState: document.getElementById('empty-state'),
      
      replaceBtn: document.getElementById('replace-button'),
      capsExceptionInput: document.getElementById('caps-exception'),
      
      inputCount: document.getElementById('input-word-count'),
      outputCount: document.getElementById('output-word-count'),
      splitInputCount: document.getElementById('split-input-word-count')
    };
  
    // === 2. HELPER FUNCTIONS ===
  
    function saveState() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  
    function showNotification(msg, type = 'success') {
      const container = document.getElementById('notification-container');
      const note = document.createElement('div');
      note.className = `notification ${type}`;
      note.textContent = msg;
      container.appendChild(note);
      setTimeout(() => {
        note.style.opacity = '0';
        setTimeout(() => note.remove(), 300); 
      }, 2000); 
    }
  
    function normalizeText(text) {
      if (typeof text !== 'string') return '';
      if (text.length === 0) return text;
      return text
        .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB\u275D\u275E\u301D-\u301F\uFF02\u02DD]/g, '"')
        .replace(/[\u2018\u2019\u201A\u201B\u2039\u203A\u275B\u275C\u276E\u276F\uA78C\uFF07]/g, "'")
        .replace(/\u00A0/g, ' ');
    }
  
    function escapeHTML(str) {
        return str.replace(/[&<>"']/g, function(m) {
            switch (m) {
                case '&': return '&amp;';
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '"': return '&quot;';
                case "'": return '&#039;';
            }
        });
    }
  
    function escapeRegExp(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  
    function preserveCase(original, replacement) {
        if (original === original.toUpperCase() && original !== original.toLowerCase()) return replacement.toUpperCase();
        if (original[0] === original[0].toUpperCase()) return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
        return replacement;
    }

    // === 3. CORE LOGIC (SYNCHRONOUS & DIRECT) ===
    
    function performReplaceAll() {
        const rawText = els.inputText.value;
        if (!rawText) return showNotification("Chưa có nội dung!", "error");

        try {
            const mode = state.modes[state.currentMode];
            let processedText = normalizeText(rawText);

            // AUTO CLEANER: 1 dòng trắng giữa các đoạn
            // Bước 1: Replace tất cả nhiều dòng trống thành \n
            processedText = processedText.replace(/\n\s*\n\s*\n+/g, '\n');
            // Bước 2: Replace \n thành \n\n (để tạo khoảng cách) nhưng cẩn thận với dòng trống đã có
            // Cách đơn giản và hiệu quả nhất: Split bởi \n+, filter empty, join bởi \n\n
            processedText = processedText.split(/\r?\n/).filter(line => line.trim() !== '').join('\n\n');

            // 1. REPLACEMENT (YELLOW)
            if (mode.pairs && mode.pairs.length > 0) {
                const rules = mode.pairs
                    .filter(p => p.find && p.find.trim())
                    .map(p => ({ find: normalizeText(p.find), replace: normalizeText(p.replace || '') }))
                    .sort((a,b) => b.find.length - a.find.length);

                rules.forEach(rule => {
                    const pattern = escapeRegExp(rule.find);
                    let regex;
                    const flags = mode.matchCase ? 'g' : 'gi';
                    if (mode.wholeWord) {
                        regex = new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, flags + 'u');
                    } else {
                        regex = new RegExp(pattern, flags);
                    }
                    processedText = processedText.replace(regex, (match) => {
                        let replacement = rule.replace;
                        if (!mode.matchCase) replacement = preserveCase(match, replacement);
                        return `${MARK_REP_START}${replacement}${MARK_REP_END}`;
                    });
                });
            }

            // 2. AUTO CAPS (BLUE & ORANGE)
            if (mode.autoCaps) {
                const exceptionList = (mode.exceptions || "").split(',').map(s => s.trim().toLowerCase()).filter(s => s);
                const autoCapsRegex = /([.?!]\s+)(?:(\uE000)(.*?)(\uE001)|([^\s\uE000\uE001]+))/gmu;

                processedText = processedText.replace(autoCapsRegex, (match, prefix, mStart, mContent, mEnd, rawWord) => {
                    let targetWord = mContent || rawWord;
                    if (!targetWord) return match;
                    if (exceptionList.includes(targetWord.toLowerCase())) return match;
                    
                    let cappedWord = targetWord.charAt(0).toUpperCase() + targetWord.slice(1);

                    if (mStart) return `${prefix}${MARK_BOTH_START}${cappedWord}${MARK_BOTH_END}`;
                    else {
                        if (rawWord.charAt(0) === rawWord.charAt(0).toUpperCase()) return match;
                        return `${prefix}${MARK_CAP_START}${cappedWord}${MARK_CAP_END}`;
                    }
                });
            }

            // 3. RENDER HTML
            let finalHTML = '';
            let buffer = '';
            for (let i = 0; i < processedText.length; i++) {
                const c = processedText[i];
                if (c === MARK_REP_START) { finalHTML += escapeHTML(buffer) + '<mark class="hl-yellow">'; buffer = ''; }
                else if (c === MARK_REP_END || c === MARK_CAP_END || c === MARK_BOTH_END) { finalHTML += escapeHTML(buffer) + '</mark>'; buffer = ''; }
                else if (c === MARK_CAP_START) { finalHTML += escapeHTML(buffer) + '<mark class="hl-blue">'; buffer = ''; }
                else if (c === MARK_BOTH_START) { finalHTML += escapeHTML(buffer) + '<mark class="hl-orange">'; buffer = ''; }
                else { buffer += c; }
            }
            finalHTML += escapeHTML(buffer);

            els.outputText.innerHTML = finalHTML;
            updateCounters();
            els.inputText.value = ''; 
            saveTempInput();
            showNotification("Hoàn tất xử lý!");

        } catch (e) {
            console.error(e);
            showNotification("Lỗi: " + e.message, "error");
        }
    }

    // === 4. SPLIT LOGIC ===
    
    function performSplit() {
        const text = els.splitInput.value;
        if(!text.trim()) return showNotification('Chưa có nội dung!', 'error');

        let parts = [];
        const splitType = document.querySelector('input[name="split-type"]:checked').value;

        if (splitType === 'regex') {
            const regexStr = els.splitRegexInput.value;
            if (!regexStr) return showNotification("Chưa nhập Regex!", "error");
            
            try {
                const regex = new RegExp(regexStr, 'gmi');
                const matches = [...text.matchAll(regex)];
                
                if (matches.length === 0) return showNotification("Không tìm thấy chương nào theo Regex!", "warning");

                for (let i = 0; i < matches.length; i++) {
                    const start = matches[i].index;
                    const end = (i < matches.length - 1) ? matches[i+1].index : text.length;
                    let chunk = text.substring(start, end).trim();
                    
                    // Auto Clean Space cho Regex Split
                    chunk = chunk.split(/\r?\n/).filter(line => line.trim() !== '').join('\n\n');

                    const title = chunk.split('\n')[0].trim();
                    parts.push({ content: chunk, title: title || `Phần ${i+1}` });
                }
            } catch (e) {
                return showNotification("Regex không hợp lệ!", "error");
            }

        } else {
            // CHIA THEO SỐ LƯỢNG (Khôi phục logic cũ)
            const normalizedText = normalizeText(text);
            const lines = normalizedText.split('\n');
            let chapterHeader = '', contentBody = normalizedText;
            if (/^(Chương|Chapter|Hồi)\s+\d+/.test(lines[0].trim())) {
                chapterHeader = lines[0].trim(); contentBody = lines.slice(1).join('\n');
            }
            
            const paragraphs = contentBody.split('\n').filter(p => p.trim());
            const totalWords = countWords(contentBody);
            const targetWords = Math.ceil(totalWords / currentSplitMode);
            
            let currentPart = [], currentCount = 0;
            let rawParts = [];
            
            for (let p of paragraphs) {
                const wCount = countWords(p);
                // Nếu thêm đoạn này mà vượt quá target VÀ chưa phải phần cuối cùng
                if (currentCount + wCount > targetWords && rawParts.length < currentSplitMode - 1) {
                    rawParts.push(currentPart.join('\n\n')); 
                    currentPart = [p]; currentCount = wCount;
                } else { 
                    currentPart.push(p); currentCount += wCount; 
                }
            }
            // Push phần còn lại
            if (currentPart.length) rawParts.push(currentPart.join('\n\n'));
            
            // Nếu chia chưa đủ số phần (do văn bản quá ngắn), hệ thống sẽ chỉ trả về bấy nhiêu phần thực tế.
            
            parts = rawParts.map((p, idx) => {
                let h = `Phần ${idx+1}`;
                let c = p;
                if (chapterHeader) {
                    h = chapterHeader.replace(/(\d+)/, (m, n) => `${n}.${idx+1}`);
                    c = h + '\n\n' + p;
                }
                return { content: c, title: h };
            });
        }

        renderSplitGrid(parts);
        els.splitInput.value = '';
        saveTempInput();
        showNotification(`Đã chia thành ${parts.length} phần!`);
    }

    function renderSplitGrid(parts) {
        els.splitWrapper.innerHTML = '';
        // Grid CSS đã xử lý layout, ta chỉ cần append
        parts.forEach((part, index) => {
            const div = document.createElement('div'); 
            div.className = 'split-box';
            const displayTitle = part.title.length > 30 ? part.title.substring(0, 27) + '...' : part.title;
            const seqNum = index + 1; // Số thứ tự
            
            div.innerHTML = `
                <div class="split-header" title="${part.title}">
                    <span>${displayTitle}</span>
                    <span class="badge">${countWords(part.content)} W</span>
                </div>
                <textarea id="out-split-${index}" class="custom-scrollbar" readonly>${part.content}</textarea>
                <div class="split-footer">
                    <button class="btn btn-success full-width copy-split-btn" data-target="out-split-${index}" data-seq="${seqNum}">Sao chép ${seqNum}</button>
                </div>
            `;
            els.splitWrapper.appendChild(div);
        });

        els.splitWrapper.querySelectorAll('.copy-split-btn').forEach(b => {
            b.onclick = (e) => {
                const el = document.getElementById(e.target.dataset.target);
                const seq = e.target.dataset.seq;
                if(el) { 
                    navigator.clipboard.writeText(el.value); 
                    e.target.textContent = `Đã chép ${seq}!`;
                    setTimeout(()=>{ e.target.textContent = `Sao chép ${seq}`; }, 1500);
                }
            };
        });
    }

    // === 5. UI & EVENTS ===
  
    function renderModeSelect() {
      els.modeSelect.innerHTML = '';
      Object.keys(state.modes).sort().forEach(m => {
        const opt = document.createElement('option');
        opt.value = m; opt.textContent = m;
        els.modeSelect.appendChild(opt);
      });
      if(!state.modes[state.currentMode]) state.currentMode = 'default';
      els.modeSelect.value = state.currentMode;
      updateModeUI();
    }
  
    function updateModeUI() {
      const mode = state.modes[state.currentMode];
      if(mode) {
          els.matchCaseBtn.textContent = `Match Case: ${mode.matchCase ? 'BẬT' : 'Tắt'}`;
          els.matchCaseBtn.classList.toggle('active', mode.matchCase);
          
          els.wholeWordBtn.textContent = `Whole Word: ${mode.wholeWord ? 'BẬT' : 'Tắt'}`;
          els.wholeWordBtn.classList.toggle('active', mode.wholeWord);
          
          els.autoCapsBtn.textContent = `Auto Caps: ${mode.autoCaps ? 'BẬT' : 'Tắt'}`;
          els.autoCapsBtn.classList.toggle('active', mode.autoCaps);

          els.capsExceptionInput.value = mode.exceptions || '';
      }
    }
  
    function addPairToUI(find = '', replace = '', append = false) {
      const item = document.createElement('div');
      item.className = 'punctuation-item';
      // Chỉ escape dấu ngoặc kép để hiển thị trong value=""
      const safeFind = find.replace(/"/g, '&quot;');
      const safeReplace = replace.replace(/"/g, '&quot;');
  
      item.innerHTML = `
        <input type="text" class="find" placeholder="Tìm" value="${safeFind}">
        <input type="text" class="replace" placeholder="Thay thế" value="${safeReplace}">
        <button class="remove" tabindex="-1">×</button>
      `;
  
      item.querySelector('.remove').onclick = () => { item.remove(); checkEmptyState(); saveCurrentPairsToState(true); };
      item.querySelectorAll('input').forEach(inp => inp.addEventListener('input', debounceSave));
  
      if (append) els.list.appendChild(item);
      else els.list.insertBefore(item, els.list.firstChild);
      checkEmptyState();
    }
  
    function loadSettingsToUI() {
      els.list.innerHTML = '';
      const mode = state.modes[state.currentMode];
      if (mode && mode.pairs) mode.pairs.forEach(p => addPairToUI(p.find, p.replace, true)); 
      updateModeUI();
      checkEmptyState();
    }
  
    function checkEmptyState() { els.emptyState.classList.toggle('hidden', els.list.children.length > 0); }
  
    function saveCurrentPairsToState(silent = false) {
      const items = Array.from(els.list.children);
      const newPairs = items.map(item => ({
        find: item.querySelector('.find').value,
        replace: item.querySelector('.replace').value 
      })).filter(p => p.find !== '');
  
      const m = state.modes[state.currentMode];
      m.pairs = newPairs;
      m.exceptions = els.capsExceptionInput.value;
      saveState();
      if (!silent) showNotification('Đã lưu cài đặt!', 'success');
    }

    // CSV LOGIC (3 Cột: find, replace, mode)
    function parseCSVLine(text) {
        const result = [];
        let cell = '';
        let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '"') {
                if (inQuotes && text[i+1] === '"') { cell += '"'; i++; } 
                else { inQuotes = !inQuotes; }
            } else if ((char === ',' || char === '\t') && !inQuotes) { // Hỗ trợ cả dấu phẩy và tab
                result.push(cell.trim()); cell = '';
            } else { cell += char; }
        }
        result.push(cell.trim());
        return result;
    }

    function importCSV(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split(/\r?\n/);
            // Check Header sơ bộ
            if (!lines[0].toLowerCase().includes('find') || !lines[0].toLowerCase().includes('replace')) {
                 return showNotification('Lỗi Header! Cần: find,replace,mode', 'error');
            }
            
            let count = 0;
            
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const cols = parseCSVLine(line);
                
                // cols[0]=find, cols[1]=replace, cols[2]=mode
                if (cols.length >= 2) {
                    const find = cols[0];
                    const replace = cols[1];
                    const modeName = cols[2] || 'default'; // Mặc định là default nếu thiếu

                    if (find) {
                        // Tạo mode nếu chưa có
                        if (!state.modes[modeName]) {
                             state.modes[modeName] = { 
                                 pairs: [], matchCase: false, wholeWord: false, autoCaps: false, exceptions: 'jpg, png, com, vn'
                             };
                        }
                        state.modes[modeName].pairs.push({ find, replace });
                        count++;
                    }
                }
            }
            saveState(); 
            renderModeSelect(); // Re-render vì có thể thêm mode mới
            loadSettingsToUI();
            showNotification(`Đã nhập ${count} cặp!`);
        };
        reader.readAsText(file);
    }

    function exportCSV() {
        saveCurrentPairsToState(true);
        // Xuất tất cả các Mode
        let csvContent = "\uFEFFfind,replace,mode\n"; 
        
        Object.keys(state.modes).forEach(modeName => {
            const mode = state.modes[modeName];
            if (mode.pairs) {
                mode.pairs.forEach(p => {
                    const safeFind = `"${(p.find||'').replace(/"/g, '""')}"`;
                    const safeReplace = `"${(p.replace||'').replace(/"/g, '""')}"`;
                    const safeMode = `"${modeName.replace(/"/g, '""')}"`;
                    csvContent += `${safeFind},${safeReplace},${safeMode}\n`;
                });
            }
        });

        const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'settings_all_modes.csv'; a.click();
    }
  
    // COMMON UTILS
    function countWords(str) { return str.trim() ? str.trim().split(/\s+/).length : 0; }
    
    function updateCounters() {
      els.inputCount.textContent = 'Words: ' + countWords(els.inputText.value);
      els.outputCount.textContent = 'Words: ' + countWords(els.outputText.innerText);
      els.splitInputCount.textContent = 'Words: ' + countWords(els.splitInput.value);
    }
  
    function debounceSave() { 
      clearTimeout(saveTimeout); 
      saveTimeout = setTimeout(() => { saveTempInput(); saveCurrentPairsToState(true); }, 500); 
    }
    
    function saveTempInput() { 
      localStorage.setItem(INPUT_STATE_KEY, JSON.stringify({ 
          inputText: els.inputText.value, 
          splitInput: els.splitInput.value 
      })); 
    }
    
    function loadTempInput() {
      const saved = JSON.parse(localStorage.getItem(INPUT_STATE_KEY));
      if(saved) { 
          els.inputText.value = saved.inputText || ''; 
          els.splitInput.value = saved.splitInput || ''; 
      }
      updateCounters();
    }
    
    function switchTab(tabId) {
        document.querySelectorAll('.tab-button').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === tabId));
        state.activeTab = tabId; 
        saveState();
    }
  
    function initEvents() {
      document.querySelectorAll('.tab-button').forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
      
      const toggleHandler = (prop) => {
          const m = state.modes[state.currentMode]; m[prop] = !m[prop];
          saveState(); updateModeUI();
      };
      els.matchCaseBtn.onclick = () => toggleHandler('matchCase');
      els.wholeWordBtn.onclick = () => toggleHandler('wholeWord');
      els.autoCapsBtn.onclick = () => toggleHandler('autoCaps');
      
      // Mode Actions
      els.modeSelect.onchange = (e) => { state.currentMode = e.target.value; saveState(); loadSettingsToUI(); };
      
      // ADD NEW MODE (EMPTY)
      document.getElementById('add-mode').onclick = () => { 
          const n = prompt('Tên Mode mới:'); 
          if(n && !state.modes[n]) { 
              // Tạo mode mới trắng trơn
              state.modes[n] = { pairs: [], matchCase: false, wholeWord: false, autoCaps: false, exceptions: 'jpg, png, com, vn' }; 
              state.currentMode = n; saveState(); renderModeSelect(); loadSettingsToUI(); 
          }
      };
      
      document.getElementById('copy-mode').onclick = () => {
        const n = prompt('Tên Mode bản sao:'); 
        if(n && !state.modes[n]) { 
            state.modes[n] = JSON.parse(JSON.stringify(state.modes[state.currentMode])); 
            state.currentMode = n; saveState(); renderModeSelect(); loadSettingsToUI(); 
        }
      };
      
      els.renameBtn.onclick = () => { 
          const n = prompt('Tên mới:', state.currentMode); 
          if(n && n !== state.currentMode && !state.modes[n]) { 
              state.modes[n] = state.modes[state.currentMode]; 
              delete state.modes[state.currentMode]; 
              state.currentMode = n; saveState(); renderModeSelect(); 
          }
      };
      
      // DELETE DEFAULT LOGIC
      els.deleteBtn.onclick = () => { 
          if(confirm('Xóa chế độ này?')) { 
              delete state.modes[state.currentMode];
              const remainingModes = Object.keys(state.modes);
              
              if (remainingModes.length === 0) {
                  // Nếu xóa hết, tạo lại Default
                  state.modes['default'] = { pairs: [], matchCase: false, wholeWord: false, autoCaps: false, exceptions: 'jpg, png, com, vn' };
                  state.currentMode = 'default';
              } else {
                  // Chuyển sang mode đầu tiên còn lại
                  state.currentMode = remainingModes[0];
              }
              saveState(); renderModeSelect(); loadSettingsToUI(); 
          }
      };
      
      document.getElementById('add-pair').onclick = () => addPairToUI();
      document.getElementById('save-settings').onclick = () => saveCurrentPairsToState();
      els.capsExceptionInput.addEventListener('input', debounceSave);

      document.getElementById('export-settings').onclick = exportCSV;
      document.getElementById('import-settings').onclick = () => { 
          const inp = document.createElement('input'); inp.type='file'; inp.accept='.csv'; 
          inp.onchange=e=>{if(e.target.files.length) importCSV(e.target.files[0])}; 
          inp.click(); 
      };
  
      els.replaceBtn.onclick = performReplaceAll;
      
      // COPY TEXT ONLY
      document.getElementById('copy-button').onclick = () => { 
          if(els.outputText.innerText) { 
              navigator.clipboard.writeText(els.outputText.innerText).then(() => {
                  showNotification('Đã sao chép văn bản!');
              });
          }
      };
  
      els.splitTypeRadios.forEach(radio => {
          radio.addEventListener('change', (e) => {
              const val = e.target.value;
              els.splitControlCount.classList.toggle('hidden', val !== 'count');
              els.splitControlRegex.classList.toggle('hidden', val !== 'regex');
          });
      });

      document.querySelectorAll('.split-mode-btn').forEach(btn => btn.onclick = () => { 
          document.querySelectorAll('.split-mode-btn').forEach(b=>b.classList.remove('active')); 
          btn.classList.add('active'); 
          currentSplitMode = parseInt(btn.dataset.split); 
      });
      document.getElementById('split-action-btn').onclick = performSplit;
      
      [els.inputText, els.splitInput].forEach(el => el.addEventListener('input', () => { 
          updateCounters(); saveTempInputDebounced(); 
      }));
    }

    function saveTempInputDebounced() {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveTempInput, 1000);
    }
  
    // INIT
    renderModeSelect(); 
    loadSettingsToUI(); 
    loadTempInput(); 
    if(state.activeTab) switchTab(state.activeTab); 
    initEvents();
});
