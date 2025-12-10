document.addEventListener('DOMContentLoaded', () => {
    // CONFIG
    const STORAGE_KEY = 'trinh_hg_settings_vip_v1';
    const INPUT_STATE_KEY = 'trinh_hg_input_vip_v1';
    const MARKERS = { R_S:'\uE000', R_E:'\uE001', C_S:'\uE002', C_E:'\uE003', B_S:'\uE004', B_E:'\uE005' };
    
    // Heartbeat & Device Check
    setInterval(() => {
        fetch('/api/heartbeat').then(res => { if (res.status === 401) window.location.reload(); }).catch(() => {});
    }, 30000);

    const defaultState = {
        currentMode: 'default', activeTab: 'settings',
        modes: { default: { pairs: [], matchCase: false, wholeWord: false, autoCaps: false, exceptions: '' } }
    };

    let state;
    try { state = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch(e){}
    if (!state || !state.modes) state = defaultState;
    if (!state.modes[state.currentMode]) state.currentMode = 'default';

    let currentSplitMode = 2;
    let saveTimeout;

    // DOM (No Modal)
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
        splitInputCount: document.getElementById('split-input-word-count')
    };

    // HELPERS
    function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
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

    // CORE LOGIC (UNLIMITED)
    function performReplaceAll() {
        let rawText = els.inputText.value;
        if (!rawText) return showNotification("Chưa có nội dung!", "error");

        setTimeout(() => {
            const mode = state.modes[state.currentMode];
            let processed = normalizeText(rawText);
            processed = processed.replace(/\n\s*\n\s*\n+/g, '\n').split(/\r?\n/).filter(l=>l.trim()).join('\n\n');

            let cRep = 0, cCaps = 0;
            let pairs = mode.pairs || [];

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

        setTimeout(() => {
            const splitType = document.querySelector('input[name="split-type"]:checked').value;
            
            if (splitType === 'regex') {
                const rStr = els.splitRegexInput.value;
                if (!rStr) return showNotification("Chưa nhập Regex!", "error");
                try {
                    const regex = new RegExp(rStr, 'gmi');
                    const matches = [...rawText.matchAll(regex)];
                    if (matches.length === 0) return showNotification("Không tìm thấy chương nào!", "warning");
                    let parts = [];
                    for (let i = 0; i < matches.length; i++) {
                        const start = matches[i].index;
                        const end = (i < matches.length - 1) ? matches[i+1].index : rawText.length;
                        let chunk = rawText.substring(start, end).trim().split(/\r?\n/).filter(l => l.trim()).join('\n\n');
                        const title = chunk.split('\n')[0].trim();
                        parts.push({ content: chunk, title: title || `Phần ${i+1}` });
                    }
                    renderFilledSplitGrid(parts); showNotification(`Tìm thấy ${parts.length} chương!`);
                } catch (e) { return showNotification("Regex không hợp lệ!", "error"); }
            } else {
                let targetParts = currentSplitMode;
                const lines = normalizeText(rawText).split('\n');
                let header = '', body = normalizeText(rawText);
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
                    if(ta) { ta.value = content; ta.parentElement.querySelector('.split-header span:first-child').textContent = h; ta.parentElement.querySelector('.badge').textContent = countWords(content)+' W'; }
                }
                showNotification(`Đã chia xong!`);
            }
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
            b.onclick = (e) => { const el = document.getElementById(e.target.dataset.target); if(el&&el.value){ navigator.clipboard.writeText(el.value); showNotification("Đã copy!"); } };
        });
    }

    // UI & EVENTS
    function renderModeSelect() {
        els.modeSelect.innerHTML = '';
        Object.keys(state.modes).sort().forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = m; els.modeSelect.appendChild(o); });
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
        const item = document.createElement('div'); item.className = 'punctuation-item';
        item.innerHTML = `<span class="pair-index">#</span><input type="text" class="find" placeholder="Tìm" value="${find.replace(/"/g, '&quot;')}"><input type="text" class="replace" placeholder="Thay thế" value="${replace.replace(/"/g, '&quot;')}"><button class="remove" tabindex="-1">×</button>`;
        item.querySelector('.remove').onclick = () => { item.remove(); updatePairIndexes(); checkEmpty(); savePairs(true); };
        item.querySelectorAll('input').forEach(i => i.addEventListener('input', debounceSave));
        if (append) els.list.appendChild(item); else els.list.insertBefore(item, els.list.firstChild);
        updatePairIndexes(); checkEmpty();
    }
    function updatePairIndexes() { const items = Array.from(els.list.children); items.forEach((item, index) => { item.querySelector('.pair-index').textContent = items.length - index; }); }
    function checkEmpty() { els.emptyState.classList.toggle('hidden', els.list.children.length > 0); }
    function savePairs(silent) {
        state.modes[state.currentMode].pairs = Array.from(els.list.children).map(i=>({find:i.querySelector('.find').value, replace:i.querySelector('.replace').value})).filter(p=>p.find);
        saveState(); if(!silent) showNotification('Đã lưu!');
    }
    function loadSettings() {
        els.list.innerHTML = '';
        (state.modes[state.currentMode].pairs||[]).forEach(p=>addPairToUI(p.find, p.replace, true));
        updateModeUI(); checkEmpty();
    }
    function switchTab(tabId) {
        document.querySelectorAll('.tab-button').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === tabId));
        state.activeTab = tabId; saveState();
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
            saveState(); renderModeSelect(); loadSettings(); showNotification(`Đã nhập ${count} cặp!`);
        }; reader.readAsText(file);
    }
    function exportCSV() {
        savePairs(true);
        let csvContent = "\uFEFFfind,replace,mode\n"; 
        Object.keys(state.modes).forEach(modeName => {
            const mode = state.modes[modeName];
            if (mode.pairs) mode.pairs.forEach(p => { csvContent += `"${(p.find||'').replace(/"/g, '""')}","${(p.replace||'').replace(/"/g, '""')}","${modeName.replace(/"/g, '""')}"\n`; });
        });
        const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'settings_full.csv'; a.click();
    }

    // EVENT BINDING
    document.querySelectorAll('.tab-button').forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
    
    els.addModeBtn.onclick = () => { const n = prompt('Tên Mode mới:'); if(n && !state.modes[n]) { state.modes[n] = JSON.parse(JSON.stringify(defaultState.modes.default)); state.currentMode = n; saveState(); renderModeSelect(); loadSettings(); } };
    els.copyModeBtn.onclick = () => { const n = prompt('Tên Mode bản sao:'); if(n && !state.modes[n]) { state.modes[n] = JSON.parse(JSON.stringify(state.modes[state.currentMode])); state.currentMode = n; saveState(); renderModeSelect(); loadSettings(); } };
    els.renameBtn.onclick = () => { const n = prompt('Tên mới:', state.currentMode); if(n && n !== state.currentMode && !state.modes[n]) { state.modes[n] = state.modes[state.currentMode]; delete state.modes[state.currentMode]; state.currentMode = n; saveState(); renderModeSelect(); } };
    els.deleteBtn.onclick = () => { 
        if(state.currentMode==='default') return showNotification("Không xóa Default!", "error");
        if(confirm('Xóa?')) { delete state.modes[state.currentMode]; state.currentMode = Object.keys(state.modes)[0]; saveState(); renderModeSelect(); loadSettings(); }
    };

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
    els.exportBtn.onclick = exportCSV;
    els.importBtn.onclick = () => { const inp = document.createElement('input'); inp.type='file'; inp.accept='.csv'; inp.onchange = e => { if(e.target.files.length) importCSV(e.target.files[0]) }; inp.click(); };

    els.splitActionBtn.onclick = performSplit;
    els.clearSplitRegexBtn.onclick = () => { els.splitWrapper.innerHTML = ''; showNotification('Đã xóa!'); };
    els.splitTypeRadios.forEach(r => r.addEventListener('change', e => {
        document.getElementById('split-type-count').classList.toggle('hidden', e.target.value!=='count');
        document.getElementById('split-type-regex').classList.toggle('hidden', e.target.value!=='regex');
        if(e.target.value === 'regex') els.splitWrapper.innerHTML = '';
        else renderSplitPlaceholders(currentSplitMode);
    }));
    document.querySelectorAll('.split-mode-btn').forEach(btn => btn.onclick = () => { 
        const val = parseInt(btn.dataset.split);
        document.querySelectorAll('.split-mode-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); 
        currentSplitMode = val; 
        renderSplitPlaceholders(currentSplitMode);
    });

    [els.inputText, els.splitInput].forEach(el => el.addEventListener('input', () => { updateCounters(); debounceSave(); }));

    // INIT
    renderModeSelect(); loadSettings();
    const tmp = JSON.parse(localStorage.getItem(INPUT_STATE_KEY));
    if(tmp){ els.inputText.value=tmp.inputText||''; els.splitInput.value=tmp.splitInput||''; updateCounters(); }
    if(state.activeTab) switchTab(state.activeTab);
    renderSplitPlaceholders(currentSplitMode);
});
