document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // 1. CONFIG & MIGRATION
    // =========================================================================
    const CURRENT_VERSION = '2025.12.11.01';
    const STORAGE_KEY = 'trinh_hg_settings_free_v2'; 
    const INPUT_STATE_KEY = 'trinh_hg_input_free_v2';
    
    // Markers
    const MARK_REP_START  = '\uE000'; const MARK_REP_END    = '\uE001';
    const MARK_CAP_START  = '\uE002'; const MARK_CAP_END    = '\uE003';
    const MARK_BOTH_START = '\uE004'; const MARK_BOTH_END   = '\uE005';

    // AUTO RELOAD LOGIC
    setTimeout(() => location.reload(), 24 * 60 * 60 * 1000);
    setInterval(checkForUpdate, 60 * 1000);

    async function checkForUpdate() {
        try {
            const res = await fetch('/api/version');
            if(res.ok) {
                const svVer = await res.text();
                if(svVer && svVer.trim() !== CURRENT_VERSION) {
                    showNotification("Web đã có update mới! F5 để tải lại...", "warning");
                    setTimeout(() => location.reload(), 3000);
                }
            }
        } catch(e){}
    }

    const defaultState = {
        currentMode: 'default', activeTab: 'settings',
        timestamp: Date.now(),
        modes: { default: { pairs: [], matchCase: false, wholeWord: false, autoCaps: false, exceptions: 'jpg, png, com' } }
    };

    let state;
    
    // === NEW MIGRATION LOGIC (NO PAIRS COPIED) ===
    const vipData = localStorage.getItem('trinh_hg_settings_v21_final_fixed');
    if (vipData) {
        try {
            const parsedVip = JSON.parse(vipData);
            const activeVipMode = parsedVip.currentMode || 'default';
            
            // Tạo state mới cho Free
            state = JSON.parse(JSON.stringify(defaultState));
            
            // Chỉ copy Settings, KHÔNG COPY PAIRS
            if(parsedVip.modes && parsedVip.modes[activeVipMode]) {
                const src = parsedVip.modes[activeVipMode];
                state.modes.default.matchCase = src.matchCase;
                state.modes.default.wholeWord = src.wholeWord;
                state.modes.default.autoCaps = src.autoCaps;
                state.modes.default.exceptions = src.exceptions;
                state.modes.default.pairs = []; // Reset cặp về rỗng
            }

            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            localStorage.removeItem('trinh_hg_settings_v21_final_fixed'); // Xóa data VIP cũ
        } catch(e) {
            state = defaultState;
        }
    } else {
        state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;
    }

    if (state.timestamp && (Date.now() - state.timestamp > 24 * 3600 * 1000)) state = defaultState;
    if(!state.modes || !state.modes.default) state = JSON.parse(JSON.stringify(defaultState));
    state.currentMode = 'default';
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
        splitTypeRadios: document.getElementsByName('split-type'),
        splitActionBtn: document.getElementById('split-action-btn'),
        outputCount: document.getElementById('output-word-count'),
        replaceCountBadge: document.getElementById('count-replace'),
        capsCountBadge: document.getElementById('count-caps'),
        buyKeyBtn: document.getElementById('buy-key-btn'),
        modal: document.getElementById('buy-key-modal'),
        closeModal: document.querySelector('.modal-close')
    };

    // HELPERS
    function saveState() { 
        state.timestamp = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); 
    }
    // Update logic lưu input: nếu rỗng thì lưu rỗng
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
    function normalizeText(text) { return (text||'').replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"').replace(/[\u2018\u2019]/g, "'").replace(/\u00A0/g, ' '); }
    function escapeHTML(str) { return str.replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
    function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function preserveCase(o, r) {
        if(o===o.toUpperCase()&&o!==o.toLowerCase()) return r.toUpperCase();
        if(o[0]===o[0].toUpperCase()) return r.charAt(0).toUpperCase()+r.slice(1).toLowerCase();
        return r;
    }
    function debounceSave() { 
        clearTimeout(saveTimeout); 
        saveTimeout=setTimeout(()=>{ saveTempInput(); if(state.activeTab==='settings') savePairs(true); },500); 
    }
    function updateCounters() {
        els.outputCount.textContent = 'Words: ' + countWords(els.outputText.innerText);
    }
    
    // === NEW LIMIT HELPER ===
    function enforceInputLimit(raw, mode) {
        const limit = mode === 'replace' ? 2000 : 10000;
        const words = raw.trim().split(/\s+/);
        if (words.length > limit) {
            return { value: words.slice(0, limit).join(" "), truncated: true };
        }
        return { value: raw, truncated: false };
    }

    // =========================================================================
    // CORE LOGIC
    // =========================================================================

    function performReplaceAll() {
        let rawText = els.inputText.value || "";
        if (!rawText.trim()) return showNotification("Chưa có nội dung!", "error");

        // 1. Enforce Limit & Update DOM
        const { value, truncated } = enforceInputLimit(rawText, 'replace');
        if (truncated) {
            els.inputText.value = value; // Cập nhật ngay cho user thấy
            showNotification("Bản Free: Đã tự động cắt xuống 2000 từ!", "warning");
        }
        rawText = value;

        setTimeout(() => {
            const mode = state.modes.default;
            let processedText = normalizeText(rawText);
            // Auto spacing logic
            processedText = processedText.split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 0).join('\n\n');

            let countReplace = 0;
            let countCaps = 0;
            const pairs = (mode.pairs || []).slice(0, 10);

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

            els.outputText.innerHTML = finalHTML;
            els.replaceCountBadge.textContent = `Replace: ${countReplace}`;
            els.capsCountBadge.textContent = `Auto-Caps: ${countCaps}`;
            updateCounters();

            // CLEAR INPUT AFTER PROCESS
            els.inputText.value = "";
            saveTempInput(); // Lưu trạng thái rỗng
            
            showNotification("Hoàn tất!");
        }, 10);
    }

    function performSplit() {
        let text = els.splitInput.value || "";
        if(!text.trim()) return showNotification('Chưa có nội dung!', 'error');

        // 1. Enforce Limit & Update DOM
        const { value, truncated } = enforceInputLimit(text, 'split');
        if (truncated) {
            els.splitInput.value = value;
            showNotification("Bản Free: Đã tự động cắt xuống 10.000 từ!", "warning");
        }
        text = value;

        setTimeout(() => {
            const lines = normalizeText(text).split('\n');
            let chapterHeader = '', contentBody = normalizeText(text);
            if (/^(Chương|Chapter|Hồi)\s+\d+/.test(lines[0].trim())) { chapterHeader = lines[0].trim(); contentBody = lines.slice(1).join('\n'); }
            
            // Auto spacing logic before split
            const paragraphs = contentBody.split(/\r?\n/).map(s=>s.trim()).filter(p => p.length > 0);
            
            const totalWords = paragraphs.reduce((acc, p) => acc + countWords(p), 0);
            const targetWords = Math.ceil(totalWords / currentSplitMode);
            
            let currentPart = [], currentCount = 0, rawParts = [];
            
            for (let p of paragraphs) {
                const wCount = countWords(p);
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
            
            renderSplitPlaceholders(currentSplitMode);

            for(let i = 0; i < currentSplitMode; i++) {
                let pContent = rawParts[i] || '';
                let h = `Phần ${i+1}`;
                if (chapterHeader && pContent) { h = chapterHeader.replace(/(\d+)/, (m, n) => `${n}.${i+1}`); pContent = h + '\n\n' + pContent; }
                const textArea = document.getElementById(`out-split-${i}`);
                if (textArea) { 
                    textArea.value = pContent; 
                    const headerSpan = textArea.parentElement.querySelector('.split-header span:first-child');
                    const badge = textArea.parentElement.querySelector('.badge');
                    if(headerSpan) headerSpan.textContent = h;
                    if(badge) badge.textContent = countWords(pContent) + ' W'; 
                }
            }
            showNotification(`Đã chia xong!`);
            
            // CLEAR INPUT
            els.splitInput.value = "";
            saveTempInput();

        }, 10);
    }

    // (UI Functions keeping same but stripped for brevity, ensure renderModeSelect/addPairToUI/etc are present as previous)
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
    function renderModeSelect() { els.modeSelect.innerHTML = '<option value="default">default</option>'; updateModeUI(); }
    function updateModeUI() {
        const mode = state.modes.default;
        const upd = (btn, act, txt) => { btn.textContent = `${txt}: ${act ? 'BẬT' : 'Tắt'}`; btn.classList.toggle('active', act); };
        upd(els.matchCaseBtn, mode.matchCase, 'Match Case');
        upd(els.wholeWordBtn, mode.wholeWord, 'Whole Word');
        upd(els.autoCapsBtn, mode.autoCaps, 'Auto Caps');
        els.capsExceptionInput.value = mode.exceptions || '';
    }
    function addPairToUI(find='', replace='', append=false) {
        if (els.list.children.length >= 10) return alert("Bản Free giới hạn 10 cặp! Nâng cấp VIP để mở khóa.");
        const item = document.createElement('div'); item.className = 'punctuation-item';
        item.innerHTML = `<span class="pair-index">#</span><input type="text" class="find" placeholder="Tìm" value="${find.replace(/"/g, '&quot;')}"><input type="text" class="replace" placeholder="Thay thế" value="${replace.replace(/"/g, '&quot;')}"><button class="remove" tabindex="-1">×</button>`;
        item.querySelector('.remove').onclick = () => { item.remove(); updatePairIndexes(); checkEmpty(); savePairs(true); };
        item.querySelectorAll('input').forEach(i => i.addEventListener('input', debounceSave));
        if (append) els.list.appendChild(item); else els.list.insertBefore(item, els.list.firstChild);
        updatePairIndexes(); checkEmpty();
    }
    function updatePairIndexes() { Array.from(els.list.children).forEach((item, index) => { item.querySelector('.pair-index').textContent = (els.list.children.length - index) + '.'; }); }
    function checkEmpty() { els.emptyState.classList.toggle('hidden', els.list.children.length > 0); }
    function savePairs(silent) {
        state.modes.default.pairs = Array.from(els.list.children).map(i=>({find:i.querySelector('.find').value, replace:i.querySelector('.replace').value})).filter(p=>p.find);
        saveState(); if(!silent) showNotification('Đã lưu!');
    }
    function loadSettings() {
        els.list.innerHTML = '';
        const pairs = state.modes.default.pairs || [];
        pairs.slice(0, 10).forEach(p=>addPairToUI(p.find, p.replace, true));
        updateModeUI(); checkEmpty();
    }
    function switchTab(tabId) {
        document.querySelectorAll('.tab-button').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === tabId));
        state.activeTab = tabId; saveState();
    }

    // EVENTS
    document.querySelectorAll('.tab-button').forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
    els.addModeBtn.onclick = () => showNotification("Free: Chỉ dùng chế độ Default!", "error");
    els.copyModeBtn.onclick = () => showNotification("Free: Chức năng VIP!", "error");
    els.renameBtn.onclick = () => showNotification("Free: Chức năng VIP!", "error");
    els.deleteBtn.onclick = () => {
        if(confirm('Reset toàn bộ cặp Free?')) { state.modes.default.pairs = []; loadSettings(); saveState(); showNotification("Đã xóa sạch!"); }
    };
    els.exportBtn.onclick = els.importBtn.onclick = () => showNotification("Chức năng chỉ dành cho VIP!", "error");
    const toggle = (p) => { state.modes.default[p] = !state.modes.default[p]; saveState(); updateModeUI(); };
    els.matchCaseBtn.onclick = () => toggle('matchCase');
    els.wholeWordBtn.onclick = () => toggle('wholeWord');
    els.autoCapsBtn.onclick = () => toggle('autoCaps');
    els.saveExceptionBtn.onclick = () => { state.modes.default.exceptions = els.capsExceptionInput.value; saveState(); showNotification('Đã lưu!'); };
    document.getElementById('add-pair').onclick = () => addPairToUI();
    document.getElementById('save-settings').onclick = () => savePairs();
    els.replaceBtn.onclick = performReplaceAll;
    document.getElementById('copy-button').onclick = () => { if(els.outputText.innerText) { navigator.clipboard.writeText(els.outputText.innerText).then(() => showNotification('Đã copy!')); }};
    els.splitTypeRadios.forEach(r => r.addEventListener('change', e => { if(e.target.value === 'regex') { showNotification("Chức năng Regex dành cho VIP!", "error"); els.splitTypeRadios[0].checked = true; } }));
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
    els.buyKeyBtn.onclick = () => els.modal.classList.add('active');
    els.closeModal.onclick = () => els.modal.classList.remove('active');
    window.onclick = (e) => { if(e.target == els.modal) els.modal.classList.remove('active'); };

    renderModeSelect(); loadSettings();
    const tmp = JSON.parse(localStorage.getItem(INPUT_STATE_KEY));
    if(tmp){ els.inputText.value=tmp.inputText||''; els.splitInput.value=tmp.splitInput||''; updateCounters(); }
    if(state.activeTab) switchTab(state.activeTab);
    renderSplitPlaceholders(currentSplitMode);
});
