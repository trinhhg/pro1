document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // 1. CONFIGURATION & STATE MANAGEMENT
    // =========================================================================
    
    const STORAGE_KEY = 'trinh_hg_settings_v21_full_unlocked';
    const INPUT_STATE_KEY = 'trinh_hg_input_state_v21';
  
    // MARKERS (Private Use Area - Ký tự ẩn để đánh dấu màu)
    const MARK_REP_START  = '\uE000'; // Vàng (Thay thế)
    const MARK_REP_END    = '\uE001';
    const MARK_CAP_START  = '\uE002'; // Xanh (Auto Caps)
    const MARK_CAP_END    = '\uE003';
    const MARK_BOTH_START = '\uE004'; // Cam (Cả hai)
    const MARK_BOTH_END   = '\uE005';
  
    // State mặc định
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
  
    // Load State từ LocalStorage
    let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;
    
    // Kiểm tra tính toàn vẹn dữ liệu (tránh lỗi khi update version)
    if (!state.activeTab) state.activeTab = 'settings';
    if (!state.modes || Object.keys(state.modes).length === 0) {
        state.modes = JSON.parse(JSON.stringify(defaultState.modes));
        state.currentMode = 'default';
    }
    if (!state.modes[state.currentMode]) {
        state.currentMode = Object.keys(state.modes)[0] || 'default';
    }
  
    let currentSplitMode = 2; // Mặc định chia 2 phần
    let saveTimeout;
  
    // =========================================================================
    // 2. DOM ELEMENTS CACHING
    // =========================================================================
    const els = {
      // General
      modeSelect: document.getElementById('mode-select'),
      
      // Settings Tab
      list: document.getElementById('punctuation-list'),
      matchCaseBtn: document.getElementById('match-case'),
      wholeWordBtn: document.getElementById('whole-word'),
      autoCapsBtn: document.getElementById('auto-caps'), 
      renameBtn: document.getElementById('rename-mode'),
      deleteBtn: document.getElementById('delete-mode'),
      emptyState: document.getElementById('empty-state'),
      capsExceptionInput: document.getElementById('caps-exception'),
      
      // Replace Tab
      inputText: document.getElementById('input-text'),
      outputText: document.getElementById('output-text'),
      replaceBtn: document.getElementById('replace-button'),
      
      // Split Tab
      splitInput: document.getElementById('split-input-text'),
      splitWrapper: document.getElementById('split-outputs-wrapper'),
      splitRegexInput: document.getElementById('split-regex-input'),
      splitTypeRadios: document.getElementsByName('split-type'),
      splitControlCount: document.getElementById('split-type-count'),
      splitControlRegex: document.getElementById('split-type-regex'),
      splitActionBtn: document.getElementById('split-action-btn'),
      
      // Counters
      inputCount: document.getElementById('input-word-count'),
      outputCount: document.getElementById('output-word-count'),
      splitInputCount: document.getElementById('split-input-word-count')
    };
  
    // =========================================================================
    // 3. UTILITY FUNCTIONS
    // =========================================================================
  
    function saveState() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  
    function showNotification(msg, type = 'success') {
      const container = document.getElementById('notification-container');
      const note = document.createElement('div');
      note.className = `notification ${type}`;
      note.textContent = msg;
      container.appendChild(note);
      
      // Animation fade out
      setTimeout(() => {
        note.style.opacity = '0';
        setTimeout(() => note.remove(), 300); 
      }, 2000); 
    }
  
    // Chuẩn hóa văn bản: Chuyển quotes thông minh thành ASCII, xóa ký tự lạ
    function normalizeText(text) {
      if (typeof text !== 'string') return '';
      if (text.length === 0) return text;
      return text
        .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB\u275D\u275E\u301D-\u301F\uFF02\u02DD]/g, '"')
        .replace(/[\u2018\u2019\u201A\u201B\u2039\u203A\u275B\u275C\u276E\u276F\uA78C\uFF07]/g, "'")
        .replace(/\u00A0/g, ' ');
    }
  
    // Escape HTML để chống XSS và hiển thị đúng trong innerHTML
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
  
    // Giữ nguyên kiểu chữ (Hoa/Thường) khi replace
    function preserveCase(original, replacement) {
        // Nếu từ gốc VIẾT HOA HẾT
        if (original === original.toUpperCase() && original !== original.toLowerCase()) {
            return replacement.toUpperCase();
        }
        // Nếu từ gốc Viết Hoa Chữ Đầu
        if (original[0] === original[0].toUpperCase()) {
            return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
        }
        return replacement;
    }
    
    // Đếm từ
    function countWords(str) { 
        return str.trim() ? str.trim().split(/\s+/).length : 0; 
    }

    // =========================================================================
    // 4. CORE FEATURE: FIND & REPLACE (XỬ LÝ MÀU VÀNG, XANH, CAM)
    // =========================================================================
    
    function performReplaceAll() {
        const rawText = els.inputText.value;
        if (!rawText) return showNotification("Chưa có nội dung để thay thế!", "error");

        try {
            const mode = state.modes[state.currentMode];
            let processedText = normalizeText(rawText);

            // --- BƯỚC 1: CLEANER (Tự động dọn dòng trắng) ---
            // Gộp nhiều dòng trắng thành 1 dòng, sau đó tách ra để đảm bảo chuẩn cách 1 dòng
            processedText = processedText.replace(/\n\s*\n\s*\n+/g, '\n'); 
            // Tách mảng, lọc dòng rỗng, sau đó nối lại bằng 2 dấu xuống dòng (\n\n)
            processedText = processedText.split(/\r?\n/).filter(line => line.trim() !== '').join('\n\n');

            // --- BƯỚC 2: REPLACE (Highlight Vàng \uE000...\uE001) ---
            if (mode.pairs && mode.pairs.length > 0) {
                // Sắp xếp từ dài thay trước để tránh lỗi đè
                const rules = mode.pairs
                    .filter(p => p.find && p.find.trim())
                    .map(p => ({ 
                        find: normalizeText(p.find), 
                        replace: normalizeText(p.replace || '') 
                    }))
                    .sort((a,b) => b.find.length - a.find.length);

                rules.forEach(rule => {
                    const pattern = escapeRegExp(rule.find);
                    let regex;
                    const flags = mode.matchCase ? 'g' : 'gi';

                    // Xử lý Whole Word bằng Unicode Lookbehind/Lookahead
                    if (mode.wholeWord) {
                        regex = new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, flags + 'u');
                    } else {
                        regex = new RegExp(pattern, flags);
                    }

                    processedText = processedText.replace(regex, (match) => {
                        let replacement = rule.replace;
                        if (!mode.matchCase) {
                            replacement = preserveCase(match, replacement);
                        }
                        return `${MARK_REP_START}${replacement}${MARK_REP_END}`;
                    });
                });
            }

            // --- BƯỚC 3: AUTO CAPS (Highlight Xanh/Cam) ---
            if (mode.autoCaps) {
                const exceptionList = (mode.exceptions || "")
                    .split(',')
                    .map(s => s.trim().toLowerCase())
                    .filter(s => s);
                
                // Regex tìm: (Dấu câu + Space) + (MarkerVàng hoặc Từ thường)
                const autoCapsRegex = /([.?!]\s+)(?:(\uE000)(.*?)(\uE001)|([^\s\uE000\uE001]+))/gmu;

                processedText = processedText.replace(autoCapsRegex, (match, prefix, mStart, mContent, mEnd, rawWord) => {
                    // Xác định từ cần check viết hoa
                    let targetWord = mContent || rawWord;
                    if (!targetWord) return match;

                    // Bỏ qua ngoại lệ (.jpg, .com...)
                    if (exceptionList.includes(targetWord.toLowerCase())) return match;
                    
                    // Thực hiện viết hoa
                    let cappedWord = targetWord.charAt(0).toUpperCase() + targetWord.slice(1);

                    if (mStart) {
                        // CASE CAM: Đã thay thế (Vàng) + Cần viết hoa -> CAM (Both)
                        return `${prefix}${MARK_BOTH_START}${cappedWord}${MARK_BOTH_END}`;
                    } else {
                        // CASE XANH: Từ thường + Cần viết hoa -> XANH (Caps)
                        // Nếu vốn dĩ nó đã viết hoa rồi thì thôi (tránh bôi xanh cả tên riêng đúng)
                        if (rawWord.charAt(0) === rawWord.charAt(0).toUpperCase()) return match;
                        
                        return `${prefix}${MARK_CAP_START}${cappedWord}${MARK_CAP_END}`;
                    }
                });
            }

            // --- BƯỚC 4: RENDER HTML ---
            let finalHTML = '';
            let buffer = '';
            
            // Quét từng ký tự để xây dựng HTML (Hiệu năng tốt hơn Regex replace nhiều lần)
            for (let i = 0; i < processedText.length; i++) {
                const c = processedText[i];
                if (c === MARK_REP_START) {
                    finalHTML += escapeHTML(buffer); buffer = '';
                    finalHTML += '<mark class="hl-yellow">';
                } else if (c === MARK_REP_END || c === MARK_CAP_END || c === MARK_BOTH_END) {
                    finalHTML += escapeHTML(buffer); buffer = '';
                    finalHTML += '</mark>';
                } else if (c === MARK_CAP_START) {
                    finalHTML += escapeHTML(buffer); buffer = '';
                    finalHTML += '<mark class="hl-blue">';
                } else if (c === MARK_BOTH_START) {
                    finalHTML += escapeHTML(buffer); buffer = '';
                    finalHTML += '<mark class="hl-orange">';
                } else {
                    buffer += c;
                }
            }
            finalHTML += escapeHTML(buffer);

            // Cập nhật DOM
            els.outputText.innerHTML = finalHTML;
            
            // Reset Input & Update số lượng từ
            updateCounters();
            els.inputText.value = ''; 
            saveTempInput();
            showNotification("Hoàn tất xử lý!");

        } catch (e) {
            console.error(e);
            showNotification("Lỗi: " + e.message, "error");
        }
    }

    // =========================================================================
    // 5. CORE FEATURE: SPLITTER (CHIA CHƯƠNG)
    // =========================================================================

    // Hàm 1: Render khung output rỗng (Placeholder) - Yêu cầu "hiện sẵn ô output"
    function renderSplitPlaceholders(count) {
        els.splitWrapper.innerHTML = ''; // Clear cũ
        
        for (let i = 1; i <= count; i++) {
             const div = document.createElement('div'); 
             div.className = 'split-box';
             // Lưu ý: data-seq là số thứ tự hiển thị (1-based), id là index (0-based)
             div.innerHTML = `
                <div class="split-header">
                    <span>Phần ${i} (Chờ kết quả...)</span>
                    <span class="badge">0 W</span>
                </div>
                <textarea id="out-split-${i-1}" class="custom-scrollbar" readonly placeholder="Kết quả phần ${i} sẽ hiện ở đây sau khi bạn ấn 'Thực Hiện Chia'"></textarea>
                <div class="split-footer">
                    <button class="btn btn-success full-width copy-split-btn" data-target="out-split-${i-1}" data-seq="${i}">Sao chép ${i}</button>
                </div>
            `;
            els.splitWrapper.appendChild(div);
        }
        // Gắn sự kiện click copy ngay sau khi render DOM
        bindCopyEvents();
    }

    // Hàm 2: Logic chia thực sự khi ấn nút
    function performSplit() {
        const text = els.splitInput.value;
        if(!text.trim()) return showNotification('Chưa có nội dung để chia!', 'error');

        const splitType = document.querySelector('input[name="split-type"]:checked').value;

        // --- MODE A: REGEX (Chia theo từ khóa Chương/Chapter) ---
        if (splitType === 'regex') {
            const regexStr = els.splitRegexInput.value;
            if (!regexStr) return showNotification("Chưa nhập Regex!", "error");
            
            try {
                const regex = new RegExp(regexStr, 'gmi');
                const matches = [...text.matchAll(regex)];
                
                if (matches.length === 0) return showNotification("Không tìm thấy chương nào khớp Regex!", "warning");
                
                let parts = [];
                for (let i = 0; i < matches.length; i++) {
                    const start = matches[i].index;
                    const end = (i < matches.length - 1) ? matches[i+1].index : text.length;
                    
                    let chunk = text.substring(start, end).trim();
                    // Auto clean dòng trắng cho đẹp
                    chunk = chunk.split(/\r?\n/).filter(line => line.trim() !== '').join('\n\n');
                    
                    // Lấy dòng đầu làm Title
                    const title = chunk.split('\n')[0].trim();
                    parts.push({ content: chunk, title: title || `Phần ${i+1}` });
                }
                
                // Regex số lượng không cố định -> Phải render lại grid
                renderFilledSplitGrid(parts); 
                showNotification(`Đã tìm thấy và chia thành ${parts.length} chương!`);
            } catch (e) {
                return showNotification("Regex không hợp lệ! Hãy kiểm tra cú pháp.", "error");
            }

        } else {
            // --- MODE B: COUNT (Chia đều theo số phần) ---
            const normalizedText = normalizeText(text);
            const lines = normalizedText.split('\n');
            
            // Tách Header nếu có (Ví dụ dòng đầu là "Chương 1")
            let chapterHeader = '', contentBody = normalizedText;
            if (/^(Chương|Chapter|Hồi)\s+\d+/.test(lines[0].trim())) {
                chapterHeader = lines[0].trim(); 
                contentBody = lines.slice(1).join('\n');
            }
            
            const paragraphs = contentBody.split('\n').filter(p => p.trim());
            const totalWords = countWords(contentBody);
            const targetWords = Math.ceil(totalWords / currentSplitMode);
            
            let currentPart = [], currentCount = 0;
            let rawParts = [];
            
            // Thuật toán chia đoạn
            for (let p of paragraphs) {
                const wCount = countWords(p);
                // Nếu cộng thêm đoạn này mà vượt target, và chưa phải phần cuối
                if (currentCount + wCount > targetWords && rawParts.length < currentSplitMode - 1) {
                    rawParts.push(currentPart.join('\n\n')); 
                    currentPart = [p]; 
                    currentCount = wCount;
                } else { 
                    currentPart.push(p); 
                    currentCount += wCount; 
                }
            }
            if (currentPart.length) rawParts.push(currentPart.join('\n\n'));
            
            // Điền dữ liệu vào các ô đã render sẵn (để tránh giật lag)
            // Kiểm tra xem số lượng ô hiện tại có khớp không (phòng trường hợp DOM bị đổi)
            const existingBoxes = els.splitWrapper.children;
            if (existingBoxes.length !== currentSplitMode) {
                 renderSplitPlaceholders(currentSplitMode);
            }

            for(let i = 0; i < currentSplitMode; i++) {
                let pContent = rawParts[i] || ''; // Có thể văn bản ngắn quá không đủ chia
                
                // Nối header vào từng phần con (Chương 1.1, Chương 1.2)
                let h = `Phần ${i+1}`;
                if (chapterHeader && pContent) {
                    h = chapterHeader.replace(/(\d+)/, (m, n) => `${n}.${i+1}`);
                    pContent = h + '\n\n' + pContent;
                }
                
                // Update DOM
                const textArea = document.getElementById(`out-split-${i}`);
                const headerSpan = existingBoxes[i].querySelector('.split-header span:first-child');
                const badge = existingBoxes[i].querySelector('.badge');
                
                if (textArea) {
                    textArea.value = pContent;
                    if(headerSpan) {
                         headerSpan.textContent = pContent ? h : `Phần ${i+1} (Trống)`;
                         headerSpan.title = h;
                    }
                    if(badge) badge.textContent = countWords(pContent) + ' W';
                }
            }
            showNotification(`Đã chia đều thành ${currentSplitMode} phần!`);
        }
        
        // Reset input
        els.splitInput.value = ''; 
        saveTempInput();
    }

    // Hàm hỗ trợ render grid khi có dữ liệu (Dùng cho Regex Mode)
    function renderFilledSplitGrid(parts) {
        els.splitWrapper.innerHTML = '';
        parts.forEach((part, index) => {
            const div = document.createElement('div'); 
            div.className = 'split-box';
            const displayTitle = part.title.length > 30 ? part.title.substring(0, 27) + '...' : part.title;
            const seqNum = index + 1;
            
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
        bindCopyEvents();
    }

    // Gán sự kiện click cho các nút copy sinh ra động
    function bindCopyEvents() {
        els.splitWrapper.querySelectorAll('.copy-split-btn').forEach(b => {
            b.onclick = (e) => {
                const el = document.getElementById(e.target.dataset.target);
                const seq = e.target.dataset.seq;
                
                if(el && el.value) { 
                    navigator.clipboard.writeText(el.value); 
                    const originalText = e.target.textContent;
                    e.target.textContent = `Đã chép ${seq}!`;
                    // Reset text sau 1.5s
                    setTimeout(() => { e.target.textContent = `Sao chép ${seq}`; }, 1500);
                } else {
                    showNotification("Ô này không có dữ liệu!", "warning");
                }
            };
        });
    }

    // =========================================================================
    // 6. UI HANDLING & EVENT LISTENERS
    // =========================================================================

    function renderModeSelect() {
      els.modeSelect.innerHTML = '';
      Object.keys(state.modes).sort().forEach(m => {
        const opt = document.createElement('option'); 
        opt.value = m; 
        opt.textContent = m;
        els.modeSelect.appendChild(opt);
      });
      // Đảm bảo mode hiện tại hợp lệ
      if(!state.modes[state.currentMode]) state.currentMode = 'default';
      els.modeSelect.value = state.currentMode;
      updateModeUI();
    }
  
    function updateModeUI() {
      const mode = state.modes[state.currentMode];
      if(mode) {
          // Update trạng thái các nút Toggle
          const updateBtn = (btn, isActive, text) => {
              btn.textContent = `${text}: ${isActive ? 'BẬT' : 'Tắt'}`;
              btn.classList.toggle('active', isActive);
          };
          updateBtn(els.matchCaseBtn, mode.matchCase, 'Match Case');
          updateBtn(els.wholeWordBtn, mode.wholeWord, 'Whole Word');
          updateBtn(els.autoCapsBtn, mode.autoCaps, 'Auto Caps');
          
          els.capsExceptionInput.value = mode.exceptions || '';
      }
    }
  
    function addPairToUI(find = '', replace = '', append = false) {
      const item = document.createElement('div'); 
      item.className = 'punctuation-item';
      
      item.innerHTML = `
        <input type="text" class="find" placeholder="Tìm" value="${find.replace(/"/g, '&quot;')}">
        <input type="text" class="replace" placeholder="Thay thế" value="${replace.replace(/"/g, '&quot;')}">
        <button class="remove" tabindex="-1">×</button>
      `;
  
      // Nút xóa cặp
      item.querySelector('.remove').onclick = () => { 
          item.remove(); 
          checkEmptyState(); 
          saveCurrentPairsToState(true); 
      };
      
      // Auto save khi gõ
      item.querySelectorAll('input').forEach(inp => inp.addEventListener('input', debounceSave));
  
      if (append) els.list.appendChild(item);
      else els.list.insertBefore(item, els.list.firstChild);
      
      checkEmptyState();
    }
  
    function loadSettingsToUI() {
      els.list.innerHTML = '';
      const mode = state.modes[state.currentMode];
      if (mode && mode.pairs) {
          mode.pairs.forEach(p => addPairToUI(p.find, p.replace, true));
      }
      updateModeUI();
      checkEmptyState();
    }
  
    function checkEmptyState() { 
        els.emptyState.classList.toggle('hidden', els.list.children.length > 0); 
    }
  
    function saveCurrentPairsToState(silent = false) {
      const items = Array.from(els.list.children);
      const newPairs = items.map(item => ({
        find: item.querySelector('.find').value,
        replace: item.querySelector('.replace').value 
      })).filter(p => p.find !== ''); // Lọc bỏ dòng trống
  
      state.modes[state.currentMode].pairs = newPairs;
      state.modes[state.currentMode].exceptions = els.capsExceptionInput.value;
      
      saveState();
      if (!silent) showNotification('Đã lưu cài đặt!', 'success');
    }

    // --- CSV IMPORTER (3 Cột: find, replace, mode) ---
    function parseCSVLine(text) {
        const result = []; 
        let cell = ''; 
        let inQuotes = false;
        
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '"') {
                if (inQuotes && text[i+1] === '"') { cell += '"'; i++; } 
                else { inQuotes = !inQuotes; }
            } else if ((char === ',' || char === '\t') && !inQuotes) {
                result.push(cell.trim()); cell = '';
            } else { 
                cell += char; 
            }
        }
        result.push(cell.trim());
        return result;
    }

    function importCSV(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split(/\r?\n/);
            
            // Check Header
            const header = lines[0].toLowerCase();
            if (!header.includes('find') || !header.includes('replace')) {
                 return showNotification('Lỗi CSV! Header phải có find,replace,mode', 'error');
            }
            
            let count = 0;
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const cols = parseCSVLine(line);
                
                // Logic import 3 cột
                if (cols.length >= 2) {
                    const find = cols[0];
                    const replace = cols[1];
                    const modeName = cols[2] || 'default'; // Mặc định nếu thiếu
                    
                    if (find) {
                        // Tự tạo mode nếu chưa có
                        if (!state.modes[modeName]) {
                             state.modes[modeName] = JSON.parse(JSON.stringify(defaultState.modes.default));
                        }
                        state.modes[modeName].pairs.push({ find, replace });
                        count++;
                    }
                }
            }
            saveState(); 
            renderModeSelect(); 
            loadSettingsToUI();
            showNotification(`Đã nhập thành công ${count} cặp từ khóa!`);
        };
        reader.readAsText(file);
    }

    function exportCSV() {
        saveCurrentPairsToState(true);
        let csvContent = "\uFEFFfind,replace,mode\n"; 
        
        // Xuất tất cả các mode
        Object.keys(state.modes).forEach(modeName => {
            const mode = state.modes[modeName];
            if (mode.pairs) {
                mode.pairs.forEach(p => {
                    const f = (p.find||'').replace(/"/g, '""');
                    const r = (p.replace||'').replace(/"/g, '""');
                    const m = modeName.replace(/"/g, '""');
                    csvContent += `"${f}","${r}","${m}"\n`;
                });
            }
        });
        
        const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; 
        a.download = 'settings_full_backup.csv'; 
        a.click();
    }
  
    // Helpers cho Input/State
    function updateCounters() {
      els.inputCount.textContent = 'Words: ' + countWords(els.inputText.value);
      els.outputCount.textContent = 'Words: ' + countWords(els.outputText.innerText);
      els.splitInputCount.textContent = 'Words: ' + countWords(els.splitInput.value);
    }
    
    function debounceSave() { 
      clearTimeout(saveTimeout); 
      saveTimeout = setTimeout(() => { 
          saveTempInput(); 
          if(state.activeTab === 'settings') saveCurrentPairsToState(true); 
      }, 500); 
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
  
    // =========================================================================
    // 7. INITIALIZATION (EVENT BINDING)
    // =========================================================================

    function initEvents() {
      // --- TABS ---
      document.querySelectorAll('.tab-button').forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
      
      // --- SETTINGS: TOGGLES ---
      const toggleHandler = (prop) => { 
          const m = state.modes[state.currentMode]; 
          m[prop] = !m[prop]; 
          saveState(); 
          updateModeUI(); 
      };
      els.matchCaseBtn.onclick = () => toggleHandler('matchCase');
      els.wholeWordBtn.onclick = () => toggleHandler('wholeWord');
      els.autoCapsBtn.onclick = () => toggleHandler('autoCaps');
      
      // --- SETTINGS: MODE ACTIONS ---
      els.modeSelect.onchange = (e) => { 
          state.currentMode = e.target.value; 
          saveState(); 
          loadSettingsToUI(); 
      };
      
      document.getElementById('add-mode').onclick = () => { 
          const n = prompt('Tên Mode mới:'); 
          if(n && !state.modes[n]) { 
              state.modes[n] = JSON.parse(JSON.stringify(defaultState.modes.default)); 
              state.currentMode = n; 
              saveState(); 
              renderModeSelect(); 
              loadSettingsToUI(); 
          }
      };
      
      document.getElementById('copy-mode').onclick = () => {
        const n = prompt('Tên Mode bản sao:'); 
        if(n && !state.modes[n]) { 
            state.modes[n] = JSON.parse(JSON.stringify(state.modes[state.currentMode])); 
            state.currentMode = n; 
            saveState(); 
            renderModeSelect(); 
            loadSettingsToUI(); 
        }
      };
      
      els.renameBtn.onclick = () => { 
          const n = prompt('Tên mới:', state.currentMode); 
          if(n && n !== state.currentMode && !state.modes[n]) { 
              state.modes[n] = state.modes[state.currentMode]; 
              delete state.modes[state.currentMode]; 
              state.currentMode = n; 
              saveState(); 
              renderModeSelect(); 
          }
      };
      
      els.deleteBtn.onclick = () => { 
          if(confirm('Bạn chắc chắn muốn xóa chế độ này?')) { 
              delete state.modes[state.currentMode]; 
              
              // Nếu xóa hết, tạo lại default
              const keys = Object.keys(state.modes);
              if (keys.length === 0) {
                   state.modes['default'] = JSON.parse(JSON.stringify(defaultState.modes.default));
                   state.currentMode = 'default';
              } else {
                   state.currentMode = keys[0];
              }
              saveState(); 
              renderModeSelect(); 
              loadSettingsToUI(); 
          }
      };
      
      // --- SETTINGS: LIST & CSV ---
      document.getElementById('add-pair').onclick = () => addPairToUI();
      document.getElementById('save-settings').onclick = () => saveCurrentPairsToState();
      els.capsExceptionInput.addEventListener('input', debounceSave);

      document.getElementById('export-settings').onclick = exportCSV;
      document.getElementById('import-settings').onclick = () => { 
          const inp = document.createElement('input'); 
          inp.type='file'; 
          inp.accept='.csv'; 
          inp.onchange = e => { if(e.target.files.length) importCSV(e.target.files[0]) }; 
          inp.click(); 
      };
  
      // --- REPLACE TAB ACTIONS ---
      els.replaceBtn.onclick = performReplaceAll;
      
      document.getElementById('copy-button').onclick = () => { 
          if(els.outputText.innerText) { 
              navigator.clipboard.writeText(els.outputText.innerText).then(() => {
                  showNotification('Đã sao chép văn bản!');
              });
          }
      };
  
      // --- SPLIT TAB ACTIONS (YÊU CẦU: CHUYỂN TAB MƯỢT, HIỆN Ô SẴN) ---
      
      // 1. Sự kiện đổi Radio (Regex vs Count)
      els.splitTypeRadios.forEach(radio => {
          radio.addEventListener('change', (e) => {
              const val = e.target.value;
              
              // Toggle hiển thị control
              els.splitControlCount.classList.toggle('hidden', val !== 'count');
              els.splitControlRegex.classList.toggle('hidden', val !== 'regex');
              
              // Xử lý hiển thị Grid ngay lập tức
              if(val === 'count') {
                  // Quay lại chế độ count -> Render lại placeholder ô chia
                  renderSplitPlaceholders(currentSplitMode);
              } else {
                  // Chế độ Regex -> Xóa grid, hiện thông báo chờ
                  els.splitWrapper.innerHTML = '';
                  const msg = document.createElement('div');
                  msg.className = 'empty-message';
                  msg.style.padding = '20px';
                  msg.style.textAlign = 'center';
                  msg.textContent = 'Chế độ Regex: Nhập biểu thức và nhấn "Thực Hiện Chia" để xem kết quả.';
                  els.splitWrapper.appendChild(msg);
              }
          });
      });

      // 2. Sự kiện chọn số phần (2,3...10)
      document.querySelectorAll('.split-mode-btn').forEach(btn => btn.onclick = () => { 
          // Active UI
          document.querySelectorAll('.split-mode-btn').forEach(b=>b.classList.remove('active')); 
          btn.classList.add('active'); 
          
          // Cập nhật state
          currentSplitMode = parseInt(btn.dataset.split); 
          
          // QUAN TRỌNG: Render ngay lập tức các ô trống (Placeholder)
          renderSplitPlaceholders(currentSplitMode);
      });
      
      // 3. Nút Thực hiện
      els.splitActionBtn.onclick = performSplit;
      
      // 4. Input listener
      [els.inputText, els.splitInput].forEach(el => el.addEventListener('input', () => { 
          updateCounters(); 
          debounceSave(); 
      }));
    }
  
    // =========================================================================
    // 8. BOOTSTRAP
    // =========================================================================
    
    // Khởi tạo
    renderModeSelect(); 
    loadSettingsToUI(); 
    loadTempInput(); 
    
    // Mở đúng Tab cũ
    if(state.activeTab) switchTab(state.activeTab); 
    
    // Khởi tạo trạng thái ban đầu cho Split Grid (Mặc định là Count Mode)
    // Đảm bảo khi load trang là hiện ô ngay
    const initSplitType = document.querySelector('input[name="split-type"]:checked').value;
    if (initSplitType === 'count') {
        renderSplitPlaceholders(currentSplitMode);
    }
    
    initEvents();
});
