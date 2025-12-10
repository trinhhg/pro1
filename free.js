document.addEventListener('DOMContentLoaded', () => {
    // CONFIG
    const STORAGE_KEY = 'trinh_hg_settings_free_v1';
    const INPUT_STATE_KEY = 'trinh_hg_input_free_v1';
    const MARKERS = { R_S:'\uE000', R_E:'\uE001', C_S:'\uE002', C_E:'\uE003', B_S:'\uE004', B_E:'\uE005' };
    
    // Device ID (Dùng để hiển thị trong Modal Login/Mua Key nếu cần)
    let deviceId = localStorage.getItem('trinh_hg_device_id');
    if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substring(2);
        localStorage.setItem('trinh_hg_device_id', deviceId);
    }

    // Default State (Reset sau 24h)
    const defaultState = {
        currentMode: 'default', activeTab: 'settings',
        timestamp: Date.now(),
        modes: { default: { pairs: [], matchCase: false, wholeWord: false, autoCaps: false, exceptions: '' } }
    };

    let state;
    try { state = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch(e){}
    
    // Auto Reset Free sau 24h
    if (state && state.timestamp) {
        if (Date.now() - state.timestamp > 24 * 60 * 60 * 1000) state = defaultState;
    }
    if (!state || !state.modes) state = defaultState;
    if (!state.modes[state.currentMode]) state.currentMode = 'default';
    
    // Update time
    state.timestamp = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    let currentSplitMode = 2;
    let saveTimeout;

    // DOM ELEMENTS
    const els = {
        modeSelect: document.getElementById('mode-select'),
        list: document.getElementById('punctuation-list'),
        matchCaseBtn: document.getElementById('match-case'),
        wholeWordBtn: document.getElementById('whole-word'),
        autoCapsBtn: document.getElementById('auto-caps'), 
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
        buyKeyBtn: document.getElementById('buy-key-btn'),
        modal: document.getElementById('buy-key-modal'),
        closeModal: document.querySelector('.modal-close')
    };

    // HELPERS
    function saveState() { 
        state.timestamp = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); 
    }
    function saveTempInput() {
        const data = { inputText: els.inputText.value, splitInput: els.splitInput.value };
        localStorage.setItem(INPUT_STATE_KEY, JSON.stringify(data));
    }
    function showNotification(msg, type='success') {
        const c = document.getElementById('notification-container');
        if(!c) return;
        const n = document.createElement('div'); n.className=`notification ${type}`; n.textContent=msg; c.appendChild(n);
        setTimeout(()=>{n.style.opacity='0'; setTimeout(()=>n.remove(),300);},2000);
    }
    function countWords(str) { return str.trim() ? str.trim().split(/\s+/).length : 0; }
    function normalizeText(text) { return (text||'').replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"').replace(/[\u2018\u2019]/g, "'"); }
    function escapeHTML(str) { return str.replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
    function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function preserveCase(o, r) {
        if(o===o.toUpperCase()) return r.toUpperCase();
        if(o[0]===o[0].toUpperCase()) return r.charAt(0).toUpperCase()+r.slice(1).toLowerCase();
        return r;
    }
    function debounceSave() { 
        clearTimeout(saveTimeout); 
        saveTimeout=setTimeout(()=>{ saveTempInput(); if(state.activeTab==='settings') savePairs(true); },500); 
    }
    function updateCounters() {
        els.inputCount.textContent = 'Words: ' + countWords(els.inputText.value);
        els.splitInputCount.textContent = 'Words: ' + countWords(els.splitInput.value);
        els.outputCount.textContent = 'Words: ' + countWords(els.outputText.innerText);
    }

    // --- CORE LOGIC (FREE LIMITS APPLIED) ---

    function performReplaceAll() {
        let rawText = els.inputText.value;
        if (!rawText) return showNotification("Chưa có nội dung!", "error");

        // FREE LIMIT: Cắt từ
        const wc = countWords(rawText);
        if (wc > 2000) {
            showNotification("Bản Free: Cắt xuống 2000 từ!", "warning");
            const words = rawText.trim().split(/\s+/);
            rawText = words.slice(0, 2000).join(" ");
            els.inputText.value = rawText; 
            updateCounters();
        }

        setTimeout(() => {
            const mode = state.modes[state.currentMode];
            let processed = normalizeText(rawText);
            processed = processed.replace(/\n\s*\n\s*\n+/g, '\n').split(/\r?\n/).filter(l=>l.trim()).join('\n\n');

            let cRep = 0, cCaps = 0;
            // FREE LIMIT: Max 10 pairs
            let pairs = mode.pairs || [];
            if (pairs.length > 10) pairs = pairs.slice(0, 10);

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
            saveTempInput();
            showNotification("Hoàn tất!");
        }, 10);
    }

    function performSplit() {
        const rawText = els.splitInput.value;
        if(!rawText.trim()) return showNotification('Chưa có nội dung!', 'error');

        let workingText = rawText;
        // FREE LIMIT: Split 10k words
        const wc = countWords(rawText);
        if (wc > 10000) {
            showNotification("Bản Free: Cắt xuống 10,000 từ!", "warning");
            const words = rawText.trim().split(/\s+/);
            workingText = words.slice(0, 10000).join(" ");
        }

        setTimeout(() => {
            // Free only has Count Mode
            let targetParts = currentSplitMode;
            if (targetParts > 4) targetParts = 4; // Max 4

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
            
            renderSplitPlaceholders(targetParts);

            for(let i = 0; i < targetParts; i++) {
                let content = parts[i] || ''; let h = `Phần ${i+1}`;
                if(header && content) { h = header.replace(/(\d+)/, (m, n) => `${n}.${i+1}`); content = h+'\n\n'+content; }
                const ta = document.getElementById(`out-split-${i}`);
                if(ta) { 
                    ta.value = content; 
                    const headerSpan = ta.parentElement.querySelector('.split-header span:first-child');
                    const badge = ta.parentElement.querySelector('.badge');
                    if(headerSpan) headerSpan.textContent = h;
                    if(badge) badge.textContent = countWords(content)+' W';
                }
            }
            showNotification(`Đã chia xong!`);
            saveTempInput();
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
    function bindCopyEvents() {
        els.splitWrapper.querySelectorAll('.copy-split-btn').forEach(b => {
            b.onclick = (e) => {
                const t = document.getElementById(e.target.dataset.target);
                if(t&&t.value){ navigator.clipboard.writeText(t.value); showNotification("Đã copy!"); }
            }
        });
    }

    // UI & EVENTS
    function renderModeSelect() {
        els.modeSelect.innerHTML = '';
        Object.keys(state.modes).sort().forEach(m => {
            const opt = document.createElement('option'); opt.value = m; opt.textContent = m;
            els.modeSelect.appendChild(opt);
        });
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
    
    function addPairToUI(find='', replace='', append=false) {
        // FREE LIMIT: Max 10
        if (els.list.children.length >= 10) return alert("Bản Free giới hạn 10 cặp! Nâng cấp VIP để mở khóa.");
        const item = document.createElement('div'); item.className = 'punctuation-item';
        item.innerHTML = `<span class="pair-index">#</span><input type="text" class="find" placeholder="Tìm" value="${find.replace(/"/g, '&quot;')}"><input type="text" class="replace" placeholder="Thay thế" value="${replace.replace(/"/g, '&quot;')}"><button class="remove" tabindex="-1">×</button>`;
        item.querySelector('.remove').onclick = () => { item.remove(); updatePairIndexes(); checkEmpty(); savePairs(true); };
        item.querySelectorAll('input').forEach(i => i.addEventListener('input', debounceSave));
        if (append) els.list.appendChild(item); else els.list.insertBefore(item, els.list.firstChild);
        updatePairIndexes(); checkEmpty();
    }
    function updatePairIndexes() {
        const items = Array.from(els.list.children);
        items.forEach((item, index) => { item.querySelector('.pair-index').textContent = items.length - index; });
    }
    function checkEmpty() { els.emptyState.classList.toggle('hidden', els.list.children.length > 0); }
    function savePairs(silent) {
        state.modes[state.currentMode].pairs = Array.from(els.list.children).map(i=>({find:i.querySelector('.find').value, replace:i.querySelector('.replace').value})).filter(p=>p.find);
        saveState(); if(!silent) showNotification('Đã lưu!');
    }
    function loadSettings() {
        els.list.innerHTML = '';
        const pairs = state.modes[state.currentMode].pairs || [];
        // FREE LIMIT: Show only 10
        const pairsToLoad = pairs.length > 10 ? pairs.slice(0, 10) : pairs;
        pairsToLoad.forEach(p=>addPairToUI(p.find, p.replace, true));
        updateModeUI(); checkEmpty();
    }
    function switchTab(tabId) {
        document.querySelectorAll('.tab-button').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === tabId));
        state.activeTab = tabId; saveState();
    }

    // EVENT BINDING (RESTRICTED FOR FREE)
    document.querySelectorAll('.tab-button').forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
    
    // Limits
    els.addModeBtn.onclick = () => showNotification("Free: Không được thêm Mode!", "error");
    els.copyModeBtn.onclick = () => showNotification("Free: Không được sao chép Mode!", "error");
    els.renameBtn.onclick = () => {
        const n = prompt('Tên mới:', state.currentMode); 
        if(n && n !== state.currentMode && !state.modes[n]) { state.modes[n] = state.modes[state.currentMode]; delete state.modes[state.currentMode]; state.currentMode = n; saveState(); renderModeSelect(); }
    };
    els.deleteBtn.onclick = () => {
        if(confirm('Xóa hết dữ liệu (Reset) chế độ này?')) { 
            state.modes[state.currentMode].pairs = []; 
            loadSettings(); saveState(); showNotification("Đã reset!");
        }
    };
    els.exportBtn.onclick = () => showNotification("Chức năng chỉ dành cho VIP!", "error");
    els.importBtn.onclick = () => showNotification("Chức năng chỉ dành cho VIP!", "error");

    // Standard Buttons
    const toggle = (p) => { state.modes[state.currentMode][p] = !state.modes[state.currentMode][p]; saveState(); updateModeUI(); };
    els.matchCaseBtn.onclick = () => toggle('matchCase');
    els.wholeWordBtn.onclick = () => toggle('wholeWord');
    els.autoCapsBtn.onclick = () => toggle('autoCaps');
    els.saveExceptionBtn.onclick = () => { state.modes[state.currentMode].exceptions = els.capsExceptionInput.value; saveState(); showNotification('Đã lưu!'); };
    els.modeSelect.onchange = (e) => { state.currentMode = e.target.value; saveState(); loadSettings(); };
    document.getElementById('add-pair').onclick = () => addPairToUI();
    document.getElementById('save-settings').onclick = () => savePairs();
    els.replaceBtn.onclick = performReplaceAll;
    document.getElementById('copy-button').onclick = () => { if(els.outputText.innerText) { navigator.clipboard.writeText(els.outputText.innerText).then(() => showNotification('Đã copy!')); }};

    // Split UI (Regex blocked)
    els.splitTypeRadios.forEach(r => r.addEventListener('change', e => {
        if(e.target.value === 'regex') {
            showNotification("Chức năng Regex dành cho VIP!", "error");
            els.splitTypeRadios[0].checked = true; return;
        }
        renderSplitPlaceholders(currentSplitMode);
    }));
    document.querySelectorAll('.split-mode-btn').forEach(btn => {
        btn.onclick = () => { 
            const val = parseInt(btn.dataset.split);
            if(val > 4) return showNotification("Bản Free tối đa 4 phần!", "error");
            document.querySelectorAll('.split-mode-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); 
            currentSplitMode = val; 
            renderSplitPlaceholders(currentSplitMode);
        };
    });
    els.splitActionBtn.onclick = performSplit;

    [els.inputText, els.splitInput].forEach(el => el.addEventListener('input', () => { updateCounters(); debounceSave(); }));

    // MODAL LOGIC (Always enabled for Free)
    els.buyKeyBtn.onclick = () => els.modal.classList.add('active');
    els.closeModal.onclick = () => els.modal.classList.remove('active');
    window.onclick = (e) => { if(e.target == els.modal) els.modal.classList.remove('active'); };

    // INIT
    renderModeSelect(); loadSettings();
    const tmp = JSON.parse(localStorage.getItem(INPUT_STATE_KEY));
    if(tmp){ els.inputText.value=tmp.inputText||''; els.splitInput.value=tmp.splitInput||''; updateCounters(); }
    if(state.activeTab) switchTab(state.activeTab);
    renderSplitPlaceholders(currentSplitMode);
});
