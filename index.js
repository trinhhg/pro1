document.addEventListener('DOMContentLoaded', () => {
    const isVipUser = (typeof IS_VIP !== 'undefined' && IS_VIP === true);

    // --- DEVICE ID GENERATION ---
    let deviceId = localStorage.getItem('trinh_hg_device_id');
    if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('trinh_hg_device_id', deviceId);
    }
    // Inject Device ID into Login Form if exists
    const hiddenDeviceInput = document.getElementById('device-id-input');
    if (hiddenDeviceInput) hiddenDeviceInput.value = deviceId;

    // --- HEARTBEAT CHECK (AUTO KICK EXPIRED VIP) ---
    if (isVipUser) {
        setInterval(() => {
            fetch('/api/heartbeat').then(res => {
                if (res.status === 401) window.location.reload(); // Đá ra nếu hết hạn
            }).catch(e => console.log('Heartbeat skip', e));
        }, 30000); // Check mỗi 30s
    }

    // --- UI HELPERS ---
    const els = {
        modeSelect: document.getElementById('mode-select'),
        list: document.getElementById('punctuation-list'),
        matchCaseBtn: document.getElementById('match-case'),
        wholeWordBtn: document.getElementById('whole-word'),
        autoCapsBtn: document.getElementById('auto-caps'), 
        // Mode buttons
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

    // State & Config
    const STORAGE_KEY = 'trinh_hg_settings_v22_fixed';
    const INPUT_STATE_KEY = 'trinh_hg_input_v22';
    const MARKERS = { R_S:'\uE000', R_E:'\uE001', C_S:'\uE002', C_E:'\uE003', B_S:'\uE004', B_E:'\uE005' };
    
    const defaultState = {
        currentMode: 'default', activeTab: 'settings',
        modes: { default: { pairs: [], matchCase: false, wholeWord: false, autoCaps: false, exceptions: '' } }
    };
    let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;
    if (!state.modes[state.currentMode]) state.currentMode = 'default';

    let currentSplitMode = 2;
    let saveTimeout;

    // --- FUNCTIONS ---
    function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    function showNotification(msg, type='success') {
        const c = document.getElementById('notification-container');
        const n = document.createElement('div'); n.className=`notification ${type}`; n.textContent=msg; c.appendChild(n);
        setTimeout(()=>{n.style.opacity='0'; setTimeout(()=>n.remove(),300);},2000);
    }
    function countWords(str) { return str.trim() ? str.trim().split(/\s+/).length : 0; }
    function normalizeText(text) { 
        return (text||'').replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"').replace(/[\u2018\u2019]/g, "'"); 
    }
    function escapeHTML(str) { return str.replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
    function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function preserveCase(o, r) {
        if(o===o.toUpperCase()) return r.toUpperCase();
        if(o[0]===o[0].toUpperCase()) return r.charAt(0).toUpperCase()+r.slice(1).toLowerCase();
        return r;
    }

    // --- CORE REPLACE ---
    function performReplaceAll() {
        let rawText = els.inputText.value;
        if (!rawText) return showNotification("Chưa có nội dung!", "error");

        // [VIP] Word Limit
        if (!isVipUser) {
            const wc = countWords(rawText);
            if (wc > 2000) {
                // Fix hang: slice by char approx then trim
                const limitChar = 2000 * 10; // rough est
                if (rawText.length > limitChar) rawText = rawText.substring(0, limitChar); 
                const words = rawText.trim().split(/\s+/);
                rawText = words.slice(0, 2000).join(" ");
                els.inputText.value = rawText; // Update UI
                showNotification("Đã cắt xuống 2000 từ (Giới hạn Free)", "warning");
            }
        }

        setTimeout(() => { // Async to prevent UI freeze
            const mode = state.modes[state.currentMode];
            let processed = normalizeText(rawText);
            // Fix spacing issue: Double newline for clean separation
            processed = processed.replace(/\n\s*\n\s*\n+/g, '\n').split(/\r?\n/).filter(l=>l.trim()).join('\n\n');

            let cRep = 0, cCaps = 0;
            let pairs = mode.pairs || [];
            
            // [VIP] Pair Limit
            if (!isVipUser && pairs.length > 10) pairs = pairs.slice(0, 10);

            // Replace Phase
            if (pairs.length > 0) {
                const rules = pairs.filter(p=>p.find&&p.find.trim()).map(p=>({
                    find: normalizeText(p.find), replace: normalizeText(p.replace||'')
                })).sort((a,b)=>b.find.length-a.find.length);

                rules.forEach(r => {
                    const pat = escapeRegExp(r.find);
                    const flags = mode.matchCase ? 'g' : 'gi';
                    const regex = mode.wholeWord ? new RegExp(`(?<![\\p{L}\\p{N}_])${pat}(?![\\p{L}\\p{N}_])`, flags+'u') : new RegExp(pat, flags);
                    processed = processed.replace(regex, (m) => {
                        cRep++; return `${MARKERS.R_S}${!mode.matchCase?preserveCase(m,r.replace):r.replace}${MARKERS.R_E}`;
                    });
                });
            }

            // Auto Caps Phase
            if (mode.autoCaps) {
                const ex = (mode.exceptions||"").split(',').map(s=>s.trim().toLowerCase()).filter(s=>s);
                const rx = /(^|[.?!]\s+)(?:(\uE000)(.*?)(\uE001)|([^\s\uE000\uE001]+))/gmu;
                processed = processed.replace(rx, (m, pre, mS, mC, mE, rW) => {
                    let tW = mC || rW; if(!tW) return m;
                    if(ex.includes(tW.toLowerCase())) return m;
                    let cap = tW.charAt(0).toUpperCase() + tW.slice(1);
                    if(mS) { cCaps++; return `${pre}${MARKERS.B_S}${cap}${MARKERS.B_E}`; }
                    if(rW.charAt(0)===rW.charAt(0).toUpperCase()) return m;
                    cCaps++; return `${pre}${MARKERS.C_S}${cap}${MARKERS.C_E}`;
                });
            }

            // Render HTML
            let html = ''; let buf = '';
            for(let i=0; i<processed.length; i++) {
                const c = processed[i];
                if(Object.values(MARKERS).includes(c)) {
                    html += escapeHTML(buf); buf='';
                    if(c===MARKERS.R_S) html+='<mark class="hl-yellow">';
                    if(c===MARKERS.R_E||c===MARKERS.C_E||c===MARKERS.B_E) html+='</mark>';
                    if(c===MARKERS.C_S) html+='<mark class="hl-blue">';
                    if(c===MARKERS.B_S) html+='<mark class="hl-orange">';
                } else buf += c;
            }
            html += escapeHTML(buf);

            els.outputText.innerHTML = html;
            els.replaceCountBadge.textContent = `Replace: ${cRep}`;
            els.capsCountBadge.textContent = `Auto-Caps: ${cCaps}`;
            updateCounters();
            els.inputText.value = ''; saveTempInput();
            showNotification("Hoàn tất!");
        }, 10);
    }

    // --- SPLITTER ---
    function performSplit() {
        const rawText = els.splitInput.value;
        if(!rawText.trim()) return showNotification('Chưa có nội dung!', 'error');

        // [Free] Max 10k words logic
        let workingText = rawText;
        if (!isVipUser) {
             const wc = countWords(rawText);
             if (wc > 10000) {
                 showNotification("Free: Cắt xuống 10,000 từ!", "warning");
                 // Safe slice roughly
                 workingText = rawText.substring(0, 10000 * 8); 
             }
        }

        // [Fix Hang] 70k words -> Process inside timeout
        setTimeout(() => {
            const splitType = document.querySelector('input[name="split-type"]:checked').value;
            
            // [VIP] Regex
            if (splitType === 'regex') {
                const rStr = els.splitRegexInput.value;
                if (!rStr) return showNotification("Chưa nhập Regex!", "error");
                // Regex cải tiến: Bắt buộc Chương/Hồi phải có số hoặc chữ số đi kèm
                // Logic: (Tiền tố)(Dấu cách)(Số 0-9 HOẶC La mã HOẶC Chữ cái)
                const regex = new RegExp(rStr, 'gmi');
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
                showNotification(`Tìm thấy ${parts.length} chương!`);
            } else {
                // Count Mode
                // [VIP] Free max 3 parts
                let targetParts = currentSplitMode;
                if (!isVipUser && targetParts > 3) targetParts = 3;

                const lines = normalizeText(workingText).split('\n');
                let header = '', body = normalizeText(workingText);
                if (/^(Chương|Chapter|Hồi)\s+\d+/.test(lines[0].trim())) { header = lines[0].trim(); body = lines.slice(1).join('\n'); }
                const paras = body.split('\n').filter(p => p.trim());
                const targetW = Math.ceil(countWords(body) / targetParts);
                
                let curP = [], curC = 0, parts = [];
                for (let p of paras) {
                    const w = countWords(p);
                    if (curC + w > targetW && parts.length < targetParts - 1) { 
                        parts.push(curP.join('\n\n')); curP = [p]; curC = w; 
                    } else { curP.push(p); curC += w; }
                }
                if (curP.length) parts.push(curP.join('\n\n'));

                renderSplitPlaceholders(targetParts); // Reset UI
                
                for(let i=0; i<targetParts; i++) {
                    let content = parts[i] || ''; let h = `Phần ${i+1}`;
                    if(header && content) { h = header.replace(/(\d+)/, (m,n)=>`${n}.${i+1}`); content = h+'\n\n'+content; }
                    const ta = document.getElementById(`out-split-${i}`);
                    if(ta) { 
                        ta.value = content; 
                        ta.parentElement.querySelector('.split-header span').textContent = h;
                        ta.parentElement.querySelector('.badge').textContent = countWords(content)+' W';
                    }
                }
                showNotification("Chia xong!");
            }
            els.splitInput.value = ''; saveTempInput();
        }, 10);
    }

    function renderSplitPlaceholders(count) {
        els.splitWrapper.innerHTML = '';
        for(let i=1; i<=count; i++) {
            const div=document.createElement('div'); div.className='split-box';
            div.innerHTML=`<div class="split-header"><span>Phần ${i}</span><span class="badge">0 W</span></div><textarea id="out-split-${i-1}" class="custom-scrollbar" readonly></textarea><div class="split-footer"><button class="btn btn-success full-width copy-split-btn" data-target="out-split-${i-1}" data-seq="${i}">Sao chép ${i}</button></div>`;
            els.splitWrapper.appendChild(div);
        }
        bindCopyEvents();
    }
    function renderFilledSplitGrid(parts) {
        els.splitWrapper.innerHTML = '';
        parts.forEach((p,i)=>{
            const div=document.createElement('div'); div.className='split-box';
            div.innerHTML=`<div class="split-header"><span>${p.title.substr(0,25)}...</span><span class="badge">${countWords(p.content)} W</span></div><textarea id="out-split-${i}" class="custom-scrollbar" readonly>${p.content}</textarea><div class="split-footer"><button class="btn btn-success full-width copy-split-btn" data-target="out-split-${i}" data-seq="${i+1}">Sao chép ${i+1}</button></div>`;
            els.splitWrapper.appendChild(div);
        });
        bindCopyEvents();
    }
    function bindCopyEvents() {
        els.splitWrapper.querySelectorAll('.copy-split-btn').forEach(b => {
            b.onclick = (e) => {
                const t = document.getElementById(e.target.dataset.target);
                if(t&&t.value){ navigator.clipboard.writeText(t.value); showNotification("Đã copy!"); }
            }
        });
    }

    // --- PAIRS UI ---
    function addPairToUI(find='', replace='', append=false) {
        const item = document.createElement('div'); item.className = 'punctuation-item';
        // Add index placeholder
        item.innerHTML = `<span class="pair-index">#</span><input type="text" class="find" placeholder="Tìm" value="${find}"><input type="text" class="replace" placeholder="Thay thế" value="${replace}"><button class="remove" tabindex="-1">×</button>`;
        item.querySelector('.remove').onclick = () => { item.remove(); updatePairIndexes(); checkEmpty(); savePairs(true); };
        item.querySelectorAll('input').forEach(i => i.addEventListener('input', debounceSave));
        if (append) els.list.appendChild(item); else els.list.insertBefore(item, els.list.firstChild);
        updatePairIndexes(); checkEmpty();
    }
    
    function updatePairIndexes() {
        // [VIP] Numbering: Cặp trên đẩy cặp cũ xuống -> Cặp mới nhất (trên cùng) là số lớn nhất?
        // Requirement: "Đánh số thứ tự từ 1 ngược lên cặp đầu".
        // Nghĩa là: Bottom = 1, Top = N.
        const items = Array.from(els.list.children);
        const total = items.length;
        items.forEach((item, index) => {
            // Index trong DOM: 0 (Top) -> N-1 (Bottom)
            // Hiển thị: Top = Total, Bottom = 1
            const displayNum = total - index;
            item.querySelector('.pair-index').textContent = displayNum;
        });
    }

    function checkEmpty() { els.emptyState.classList.toggle('hidden', els.list.children.length > 0); }
    function savePairs(silent) {
        state.modes[state.currentMode].pairs = Array.from(els.list.children).map(i=>({find:i.querySelector('.find').value, replace:i.querySelector('.replace').value})).filter(p=>p.find);
        saveState(); if(!silent) showNotification('Đã lưu!');
    }
    function loadSettings() {
        els.list.innerHTML = '';
        (state.modes[state.currentMode].pairs||[]).forEach(p=>addPairToUI(p.find, p.replace, true));
        const m = state.modes[state.currentMode];
        els.matchCaseBtn.textContent=`Match Case: ${m.matchCase?'BẬT':'Tắt'}`; els.matchCaseBtn.classList.toggle('active', m.matchCase);
        els.wholeWordBtn.textContent=`Whole Word: ${m.wholeWord?'BẬT':'Tắt'}`; els.wholeWordBtn.classList.toggle('active', m.wholeWord);
        els.autoCapsBtn.textContent=`Auto Caps: ${m.autoCaps?'BẬT':'Tắt'}`; els.autoCapsBtn.classList.toggle('active', m.autoCaps);
        els.capsExceptionInput.value = m.exceptions || ''; // Default empty
    }

    // --- CSV (Copy logic) ---
    // [Giữ nguyên logic CSV cũ, chỉ thêm check VIP]
    // ... (Code CSV Import/Export như phiên bản trước) ...

    function updateCounters() {
        els.inputCount.textContent = 'Words: ' + countWords(els.inputText.value);
        els.splitInputCount.textContent = 'Words: ' + countWords(els.splitInput.value);
    }
    function debounceSave() { clearTimeout(saveTimeout); saveTimeout=setTimeout(()=>{localStorage.setItem(INPUT_STATE_KEY, JSON.stringify({inputText:els.inputText.value, splitInput:els.splitInput.value})); if(state.activeTab==='settings') savePairs(true);},500); }

    // --- EVENTS ---
    // [Free] Rename/Delete enabled
    els.addModeBtn.onclick = () => {
        if (!isVipUser) return showNotification("Free: Không được thêm Mode!", "error");
        // ... (Logic Add Mode cũ) ...
    };
    els.deleteBtn.onclick = () => {
        // [Free] Allowed now
        if(state.currentMode==='default') return showNotification("Không xóa Default!", "error");
        if(confirm('Xóa?')) { delete state.modes[state.currentMode]; state.currentMode='default'; saveState(); renderModeSelect(); loadSettings(); }
    };
    els.renameBtn.onclick = () => {
        // [Free] Allowed now
        const n = prompt('Tên mới:', state.currentMode);
        if(n && !state.modes[n]) { state.modes[n] = state.modes[state.currentMode]; delete state.modes[state.currentMode]; state.currentMode = n; saveState(); renderModeSelect(); }
    };

    // Modal Events
    if (els.buyKeyBtn) els.buyKeyBtn.onclick = () => els.modal.classList.add('active');
    if (els.closeModal) els.closeModal.onclick = () => els.modal.classList.remove('active');
    window.onclick = (e) => { if (e.target == els.modal) els.modal.classList.remove('active'); }

    // Replace & Split
    els.replaceBtn.onclick = performReplaceAll;
    els.splitActionBtn.onclick = performSplit;
    
    // Split Mode UI
    els.splitTypeRadios.forEach(r => r.addEventListener('change', e => {
        if(e.target.value === 'regex' && !isVipUser) {
            showNotification("VIP Only!", "error");
            els.splitTypeRadios[0].checked = true; return;
        }
        document.getElementById('split-type-count').classList.toggle('hidden', e.target.value!=='count');
        document.getElementById('split-type-regex').classList.toggle('hidden', e.target.value!=='regex');
    }));
    document.querySelectorAll('.split-mode-btn').forEach(b => b.onclick = () => {
        const val = parseInt(b.dataset.split);
        if(!isVipUser && val>3) return; // Ignore click for Free > 3
        currentSplitMode = val;
        document.querySelectorAll('.split-mode-btn').forEach(btn=>btn.classList.remove('active')); b.classList.add('active');
        renderSplitPlaceholders(val);
    });

    // INIT
    // Populate Mode Select
    function renderModeSelect() {
        els.modeSelect.innerHTML = '';
        Object.keys(state.modes).sort().forEach(m => { const o=document.createElement('option'); o.value=m; o.textContent=m; els.modeSelect.appendChild(o); });
        els.modeSelect.value = state.currentMode;
    }
    
    renderModeSelect(); loadSettings(); 
    // Load Temp Input
    const tmp = JSON.parse(localStorage.getItem(INPUT_STATE_KEY));
    if(tmp){ els.inputText.value=tmp.inputText||''; els.splitInput.value=tmp.splitInput||''; updateCounters(); }
    
    // Listeners for inputs
    [els.inputText, els.splitInput].forEach(el => el.addEventListener('input', () => { updateCounters(); debounceSave(); }));
    
    // CSV Events Placeholders
    els.importBtn.onclick = () => { if(isVipUser) { /* Call Import logic */ } else showNotification("VIP Only!", "error"); };
    els.exportBtn.onclick = () => { if(isVipUser) { /* Call Export logic */ } else showNotification("VIP Only!", "error"); };
    document.getElementById('add-pair').onclick = () => addPairToUI();
    document.getElementById('save-settings').onclick = () => savePairs();
});
