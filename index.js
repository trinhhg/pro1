document.addEventListener('DOMContentLoaded', () => {
    // === 1. CONFIG & STATE ===
    const STORAGE_KEY = 'trinh_hg_settings_v18_ultimate';
    const INPUT_STATE_KEY = 'trinh_hg_input_state_v18';
  
    // MARKERS (Private Use Area)
    // Dùng để đánh dấu nội dung mà không ảnh hưởng hiển thị
    // MARK_REP: Vàng (Thay thế thường)
    const MARK_REP_START = '\uE000';
    const MARK_REP_END   = '\uE001';
    // MARK_CAP: Xanh (Auto Caps)
    const MARK_CAP_START = '\uE002';
    const MARK_CAP_END   = '\uE003';
    // MARK_BOTH: Cam (Được thay thế VÀ được Auto Caps)
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
            exceptions: 'jpg, png, com, vn, net', // Mặc định
            cleanerSmart: true
        }
      }
    };
  
    let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;
    
    // Fallback data integrity
    if (!state.activeTab) state.activeTab = 'settings';
    if (!state.modes || Object.keys(state.modes).length === 0) {
        state.modes = defaultState.modes;
        state.currentMode = 'default';
    }
    if (!state.modes[state.currentMode]) state.currentMode = Object.keys(state.modes)[0] || 'default';
    
    // Ensure new fields exist in old data
    if(state.modes[state.currentMode].exceptions === undefined) state.modes[state.currentMode].exceptions = '';
    if(state.modes[state.currentMode].cleanerSmart === undefined) state.modes[state.currentMode].cleanerSmart = true;
  
    let currentSplitMode = 2; // Default splits count
    let saveTimeout;
  
    // DOM ELEMENTS
    const els = {
      modeSelect: document.getElementById('mode-select'),
      list: document.getElementById('punctuation-list'),
      inputText: document.getElementById('input-text'),
      outputText: document.getElementById('output-text'),
      
      // Split Elements
      splitInput: document.getElementById('split-input-text'),
      splitWrapper: document.getElementById('split-outputs-wrapper'),
      splitRegexInput: document.getElementById('split-regex-input'),
      splitTypeRadios: document.getElementsByName('split-type'),
      splitControlCount: document.getElementById('split-type-count'),
      splitControlRegex: document.getElementById('split-type-regex'),
      
      // Buttons & Labels
      matchCaseBtn: document.getElementById('match-case'),
      wholeWordBtn: document.getElementById('whole-word'),
      autoCapsBtn: document.getElementById('auto-caps'), 
      renameBtn: document.getElementById('rename-mode'),
      deleteBtn: document.getElementById('delete-mode'),
      emptyState: document.getElementById('empty-state'),
      
      replaceBtn: document.getElementById('replace-button'),
      
      // Advanced Settings
      capsExceptionInput: document.getElementById('caps-exception'),
      smartSpacingCheck: document.getElementById('smart-spacing'),
      
      // Loaders
      loader: document.getElementById('loading-overlay'),
      loaderText: document.getElementById('loading-text'),
  
      // Counts
      inputCount: document.getElementById('input-word-count'),
      outputCount: document.getElementById('output-word-count'),
      splitInputCount: document.getElementById('split-input-word-count')
    };
  
    // === 2. UTILS & HELPERS ===
  
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
      }, 2800); 
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
  
    function showLoader(show, text = 'Đang xử lý...') {
        els.loader.classList.toggle('hidden', !show);
        els.loaderText.textContent = text;
    }

    // === 3. CORE LOGIC (ASYNC & OPTIMIZED) ===
    
    async function performReplaceAll() {
        const rawText = els.inputText.value;
        if (!rawText) return showNotification("Chưa có nội dung!", "error");

        els.replaceBtn.disabled = true;
        showLoader(true, "Đang khởi tạo...");

        // Chờ 50ms để UI update loader
        await new Promise(r => setTimeout(r, 50));

        try {
            const mode = state.modes[state.currentMode];
            let processedText = normalizeText(rawText);

            // 1. CLEANER FIRST (Optional based on settings?)
            // Mặc định luôn chạy cleaner cơ bản, smart spacing theo checkbox
            if (mode.cleanerSmart) {
                // Giữ 1 dòng trống (tức là 2 ký tự \n)
                processedText = processedText.replace(/\n\s*\n\s*\n+/g, '\n\n');
            } else {
                // Do nothing specific or user custom
            }

            // 2. REPLACEMENT PHASE (YELLOW)
            if (mode.pairs && mode.pairs.length > 0) {
                showLoader(true, "Đang thay thế từ khóa...");
                const rules = mode.pairs
                    .filter(p => p.find && p.find.trim())
                    .map(p => ({
                        find: normalizeText(p.find), 
                        replace: normalizeText(p.replace || '') 
                    }))
                    .sort((a,b) => b.find.length - a.find.length); // Longest first

                // Chunking logic for Replace is hard because regex needs full context.
                // However, string replace in JS is quite fast. We will do synchronous replace
                // but if text is HUGE, we might block. For now, optimize Regex.
                
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

            // 3. AUTO CAPS PHASE (BLUE & ORANGE)
            if (mode.autoCaps) {
                showLoader(true, "Đang kiểm tra viết hoa...");
                await new Promise(r => setTimeout(r, 10)); // Yield

                const exceptionList = (mode.exceptions || "").split(',').map(s => s.trim().toLowerCase()).filter(s => s);
                
                // Regex: Tìm Dấu câu (.?!) + Space + (Nội dung)
                // Nội dung có thể là:
                // Case A: Một từ đã replace (được bọc trong MARK_REP)
                // Case B: Một từ thường
                
                // Logic regex:
                // Group 1: Dấu câu + space
                // Group 2: MARK_REP_START (nếu có)
                // Group 3: Nội dung bên trong MARK_REP (nếu có)
                // Group 4: MARK_REP_END (nếu có)
                // Group 5: Từ thường (nếu không có mark)
                
                // Cải tiến regex để bắt chính xác: 
                // Tìm: ([.?!]\s+) sau đó là (MARK_REP...MARK_REP) HOẶC (Word)
                const autoCapsRegex = /([.?!]\s+)(?:(\uE000)(.*?)(\uE001)|([^\s\uE000\uE001]+))/gmu;

                processedText = processedText.replace(autoCapsRegex, (match, prefix, mStart, mContent, mEnd, rawWord) => {
                    let targetWord = mContent || rawWord;
                    if (!targetWord) return match;

                    // Check Exception
                    if (exceptionList.includes(targetWord.toLowerCase())) return match;
                    
                    // Xử lý viết hoa ký tự đầu
                    let cappedWord = targetWord.charAt(0).toUpperCase() + targetWord.slice(1);

                    if (mStart) {
                        // CASE ORANGE: Đã replace + Cần viết hoa
                        // Thay đổi marker sang BOTH
                        return `${prefix}${MARK_BOTH_START}${cappedWord}${MARK_BOTH_END}`;
                    } else {
                        // CASE BLUE: Chỉ Auto Caps
                        // Nếu từ đó vốn dĩ đã viết hoa rồi thì thôi (tránh bôi xanh vô lý)
                        if (rawWord.charAt(0) === rawWord.charAt(0).toUpperCase()) return match;

                        return `${prefix}${MARK_CAP_START}${cappedWord}${MARK_CAP_END}`;
                    }
                });
            }

            // 4. RENDERING HTML (Expensive Part - Chunking needed)
            showLoader(true, "Đang hiển thị kết quả...");
            await new Promise(r => setTimeout(r, 10));

            // Chunking HTML building
            const CHUNK_SIZE = 10000;
            let finalHTML = '';
            for (let i = 0; i < processedText.length; i += CHUNK_SIZE) {
                const chunk = processedText.slice(i, i + CHUNK_SIZE);
                // Xử lý marker trong chunk này
                // Lưu ý: Nếu marker bị cắt đôi giữa 2 chunk thì sẽ lỗi.
                // Tuy nhiên, logic replace chuỗi đơn giản thì ta có thể xử lý từng char.
                // Cách an toàn nhất: Duyệt từng ký tự toàn bộ chuỗi (như code cũ) nhưng chia loop ra.
            }
            
            // Rewrite Render loop with Async Yield
            finalHTML = await renderHTMLAsync(processedText);

            els.outputText.innerHTML = finalHTML;
            updateCounters();
            els.inputText.value = ''; // Clear input if successful
            saveTempInput();
            showNotification("Hoàn tất xử lý!");

        } catch (e) {
            console.error(e);
            showNotification("Lỗi: " + e.message, "error");
        } finally {
            els.replaceBtn.disabled = false;
            showLoader(false);
        }
    }

    function renderHTMLAsync(text) {
        return new Promise((resolve) => {
            let result = '';
            let buffer = '';
            let i = 0;
            const len = text.length;
            
            function processChunk() {
                const start = performance.now();
                while (i < len) {
                    const c = text[i];
                    if (c === MARK_REP_START) {
                        result += escapeHTML(buffer) + '<mark class="hl-yellow">'; buffer = '';
                    } else if (c === MARK_REP_END || c === MARK_CAP_END || c === MARK_BOTH_END) {
                        result += escapeHTML(buffer) + '</mark>'; buffer = '';
                    } else if (c === MARK_CAP_START) {
                        result += escapeHTML(buffer) + '<mark class="hl-blue">'; buffer = '';
                    } else if (c === MARK_BOTH_START) {
                        result += escapeHTML(buffer) + '<mark class="hl-orange">'; buffer = '';
                    } else {
                        buffer += c;
                    }
                    i++;

                    // Yield mỗi 20ms để UI không đơ
                    if (performance.now() - start > 20) {
                        setTimeout(processChunk, 0);
                        return;
                    }
                }
                result += escapeHTML(buffer);
                resolve(result);
            }
            processChunk();
        });
    }

    function performCleanLines() {
        if(!els.list.offsetParent && !els.inputText.offsetParent) return; // Chỉ chạy khi ở tab Settings hoặc Replace đang active
        // Nhưng function này chỉ gọi từ nút Settings.
        // Ta cần biết user muốn clean cái gì?
        // Logic mới: Có nút Clean ở Settings, nhưng nó không tác động trực tiếp vào Input Replace.
        // Đổi lại: Logic Clean sẽ tích hợp vào nút Replace, hoặc tạo nút riêng ở tab Replace?
        // Theo yêu cầu: "Nút Xóa dòng trắng".
        // Để tiện, ta sẽ làm nút Clean này tác động vào Textarea đang active (nếu có) hoặc báo user.
        // Vì nút Clean nằm trong Settings, ta sẽ giả định nó Clean input của tab Replace hoặc báo user.
        // Tốt nhất: Chỉ set setting, việc clean diễn ra khi ấn Replace.
        // Tuy nhiên, có nút "Xóa dòng trắng ngay". Ta sẽ clean InputText.
        
        let text = els.inputText.value;
        if(!text) return showNotification("Không có văn bản trong Tab Thay Thế!", "warning");
        
        // Remove empty lines: \n\s*\n -> \n
        text = text.replace(/^\s*[\r\n]/gm, ''); // Xóa dòng trống đầu
        text = text.replace(/\n\s*\n/g, '\n'); // Gộp dòng
        
        // Nếu smart spacing ON:
        if (state.modes[state.currentMode].cleanerSmart) {
             text = text.replace(/\n/g, '\n\n'); // Tạm thời double
             text = text.replace(/\n\s*\n\s*\n+/g, '\n\n'); // Fix lại
        }
        
        els.inputText.value = text;
        saveTempInput();
        updateCounters();
        showNotification("Đã dọn dẹp dòng trắng!");
    }

    // === 4. SPLIT LOGIC ===
    
    async function performSplit() {
        const text = els.splitInput.value;
        if(!text.trim()) return showNotification('Chưa có nội dung!', 'error');

        showLoader(true, "Đang phân tích...");
        await new Promise(r => setTimeout(r, 20));

        let parts = [];
        const splitType = document.querySelector('input[name="split-type"]:checked').value;

        if (splitType === 'regex') {
            // MODE: CHIA THEO REGEX (CHƯƠNG)
            const regexStr = els.splitRegexInput.value;
            if (!regexStr) return showNotification("Chưa nhập Regex!", "error");
            
            try {
                // Regex tìm header chương. Flag 'gm' để tìm đầu dòng.
                // Logic: Tìm vị trí các match. Cắt từ match này đến match kia.
                const regex = new RegExp(regexStr, 'gmi');
                const matches = [...text.matchAll(regex)];
                
                if (matches.length === 0) {
                    showLoader(false);
                    return showNotification("Không tìm thấy chương nào theo Regex này!", "warning");
                }

                for (let i = 0; i < matches.length; i++) {
                    const start = matches[i].index;
                    const end = (i < matches.length - 1) ? matches[i+1].index : text.length;
                    const chunk = text.substring(start, end).trim();
                    
                    // Lấy title để làm header đẹp (dòng đầu tiên)
                    const title = chunk.split('\n')[0].trim();
                    // Nếu cần smart renaming: Có thể xử lý title ở đây.
                    
                    parts.push({ content: chunk, title: title || `Phần ${i+1}` });
                }
            } catch (e) {
                showLoader(false);
                return showNotification("Regex không hợp lệ!", "error");
            }

        } else {
            // MODE: CHIA ĐỀU (COUNT)
            const normalizedText = normalizeText(text);
            // Giữ header chương nếu có
            const lines = normalizedText.split('\n');
            let chapterHeader = '', contentBody = normalizedText;
            if (/^(Chương|Chapter|Hồi)\s+\d+/.test(lines[0].trim())) {
                chapterHeader = lines[0].trim(); contentBody = lines.slice(1).join('\n');
            }
            
            const paragraphs = contentBody.split('\n').filter(p => p.trim());
            const totalWords = countWords(contentBody);
            const targetWords = Math.ceil(totalWords / currentSplitMode);
            
            let currentPart = [], currentCount = 0;
            let partIndex = 1;
            
            // Logic chia đoạn
            let rawParts = [];
            for (let p of paragraphs) {
                const wCount = countWords(p);
                if (currentCount + wCount > targetWords && rawParts.length < currentSplitMode - 1) {
                    rawParts.push(currentPart.join('\n\n')); 
                    currentPart = [p]; currentCount = wCount;
                } else { 
                    currentPart.push(p); currentCount += wCount; 
                }
            }
            if (currentPart.length) rawParts.push(currentPart.join('\n\n'));
            
            // Format output
            parts = rawParts.map((p, idx) => {
                let h = `Phần ${idx+1}`;
                let c = p;
                if (chapterHeader) {
                    // Smart naming sub-part: Chương 1.1, 1.2
                    h = chapterHeader.replace(/(\d+)/, (m, n) => `${n}.${idx+1}`);
                    c = h + '\n\n' + p;
                }
                return { content: c, title: h };
            });
        }

        renderSplitGrid(parts);
        els.splitInput.value = '';
        saveTempInput();
        showLoader(false);
        showNotification(`Đã chia thành ${parts.length} phần!`);
    }

    function renderSplitGrid(parts) {
        els.splitWrapper.innerHTML = '';
        // Grid auto-flow logic handled by CSS, simple loop here
        parts.forEach((part, index) => {
            const div = document.createElement('div'); 
            div.className = 'split-box';
            // Limit title length display
            const displayTitle = part.title.length > 30 ? part.title.substring(0, 27) + '...' : part.title;
            
            div.innerHTML = `
                <div class="split-header" title="${part.title}">
                    <span>${displayTitle}</span>
                    <span class="badge">${countWords(part.content)} W</span>
                </div>
                <textarea id="out-split-${index}" class="custom-scrollbar" readonly>${part.content}</textarea>
                <div class="split-footer">
                    <button class="btn btn-secondary full-width copy-split-btn" data-target="out-split-${index}">Sao chép</button>
                </div>
            `;
            els.splitWrapper.appendChild(div);
        });

        // Bind events
        els.splitWrapper.querySelectorAll('.copy-split-btn').forEach(b => {
            b.onclick = (e) => {
                const el = document.getElementById(e.target.dataset.target);
                if(el) { 
                    navigator.clipboard.writeText(el.value); 
                    // Visual feedback
                    e.target.textContent = 'Đã chép!';
                    e.target.classList.remove('btn-secondary'); e.target.classList.add('btn-success');
                    setTimeout(()=>{ 
                        e.target.textContent = 'Sao chép';
                        e.target.classList.add('btn-secondary'); e.target.classList.remove('btn-success');
                    }, 1500);
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
      const isDefault = state.currentMode === 'default';
      els.renameBtn.classList.toggle('hidden', isDefault);
      els.deleteBtn.classList.toggle('hidden', isDefault);
      
      const mode = state.modes[state.currentMode];
      if(mode) {
          els.matchCaseBtn.textContent = `Match Case: ${mode.matchCase ? 'BẬT' : 'Tắt'}`;
          els.matchCaseBtn.classList.toggle('active', mode.matchCase);
          
          els.wholeWordBtn.textContent = `Whole Word: ${mode.wholeWord ? 'BẬT' : 'Tắt'}`;
          els.wholeWordBtn.classList.toggle('active', mode.wholeWord);
          
          els.autoCapsBtn.textContent = `Auto Caps: ${mode.autoCaps ? 'BẬT' : 'Tắt'}`;
          els.autoCapsBtn.classList.toggle('active', mode.autoCaps);

          els.capsExceptionInput.value = mode.exceptions || '';
          els.smartSpacingCheck.checked = mode.cleanerSmart || false;
      }
    }
  
    function addPairToUI(find = '', replace = '', append = false) {
      const item = document.createElement('div');
      item.className = 'punctuation-item';
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
      m.cleanerSmart = els.smartSpacingCheck.checked;
      
      saveState();
      if (!silent) showNotification('Đã lưu cài đặt!', 'success');
    }

    // CSV LOGIC
    function parseCSVLine(text) {
        const result = [];
        let cell = '';
        let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '"') {
                if (inQuotes && text[i+1] === '"') { cell += '"'; i++; } 
                else { inQuotes = !inQuotes; }
            } else if (char === ',' && !inQuotes) {
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
            if (!lines[0].toLowerCase().includes('find,replace')) return showNotification('Lỗi Header CSV!', 'error');
            
            let count = 0;
            // Mode hiện tại
            const mode = state.modes[state.currentMode];
            
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const cols = parseCSVLine(line);
                // Hỗ trợ cả 2 cột (Find,Replace) hoặc 3 cột
                if (cols.length >= 2) {
                    const find = cols[0];
                    const replace = cols[1];
                    if (find) {
                        mode.pairs.push({ find, replace });
                        count++;
                    }
                }
            }
            saveState(); 
            loadSettingsToUI();
            showNotification(`Đã nhập ${count} cặp vào chế độ ${state.currentMode}!`);
        };
        reader.readAsText(file);
    }

    function exportCSV() {
        saveCurrentPairsToState(true);
        let csvContent = "\uFEFFfind,replace\n"; 
        const mode = state.modes[state.currentMode];
        if (mode.pairs) {
            mode.pairs.forEach(p => {
                const safeFind = `"${(p.find||'').replace(/"/g, '""')}"`;
                const safeReplace = `"${(p.replace||'').replace(/"/g, '""')}"`;
                csvContent += `${safeFind},${safeReplace}\n`;
            });
        }
        const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `settings_${state.currentMode}.csv`; a.click();
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
      // Tabs
      document.querySelectorAll('.tab-button').forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
      
      // Mode Toggles
      const toggleHandler = (prop) => {
          const m = state.modes[state.currentMode]; m[prop] = !m[prop];
          saveState(); updateModeUI();
      };
      els.matchCaseBtn.onclick = () => toggleHandler('matchCase');
      els.wholeWordBtn.onclick = () => toggleHandler('wholeWord');
      els.autoCapsBtn.onclick = () => toggleHandler('autoCaps');
      
      // Mode Management
      els.modeSelect.onchange = (e) => { state.currentMode = e.target.value; saveState(); loadSettingsToUI(); };
      document.getElementById('add-mode').onclick = () => { 
          const n = prompt('Tên Mode mới:'); 
          if(n && !state.modes[n]) { 
              state.modes[n] = JSON.parse(JSON.stringify(defaultState.modes.default)); 
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
      els.deleteBtn.onclick = () => { 
          if(state.currentMode !== 'default' && confirm('Xóa chế độ này?')) { 
              delete state.modes[state.currentMode]; 
              state.currentMode = 'default'; 
              saveState(); renderModeSelect(); loadSettingsToUI(); 
          }
      };
      
      // Settings Actions
      document.getElementById('add-pair').onclick = () => addPairToUI();
      document.getElementById('save-settings').onclick = () => saveCurrentPairsToState();
      document.getElementById('clean-lines-btn').onclick = performCleanLines;
      els.capsExceptionInput.addEventListener('input', debounceSave);
      els.smartSpacingCheck.addEventListener('change', debounceSave);

      // Import/Export
      document.getElementById('export-settings').onclick = exportCSV;
      document.getElementById('import-settings').onclick = () => { 
          const inp = document.createElement('input'); inp.type='file'; inp.accept='.csv'; 
          inp.onchange=e=>{if(e.target.files.length) importCSV(e.target.files[0])}; 
          inp.click(); 
      };
  
      // REPLACE ACTIONS
      els.replaceBtn.onclick = performReplaceAll;
      document.getElementById('copy-button').onclick = () => { 
          if(els.outputText.innerText) { 
            // Copy HTML text content (not tags) is default behavior of clipboard
            // But we want user to paste somewhere else without colors? Or with colors?
            // "Sao chép (Giữ màu)" -> Copy HTML? No, plain text usually doesn't keep color unless Rich Text.
            // Copy innerText gets text without tags.
            // To copy with style to Word/GDocs, we need to copy HTML.
            
            const range = document.createRange();
            range.selectNode(els.outputText);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            document.execCommand('copy');
            window.getSelection().removeAllRanges();
            showNotification('Đã sao chép (Rich Text)!'); 
          }
      };
      document.getElementById('copy-clean-button').onclick = () => {
          if(els.outputText.innerText) {
              navigator.clipboard.writeText(els.outputText.innerText).then(() => {
                  showNotification('Đã sao chép văn bản sạch!');
              });
          }
      };
  
      // SPLIT ACTIONS
      // Toggle Split Type
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
      
      // Inputs
      [els.inputText, els.splitInput].forEach(el => el.addEventListener('input', () => { 
          updateCounters(); saveTempInputDebounced(); 
      }));
    }

    // Debounce Helper
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
