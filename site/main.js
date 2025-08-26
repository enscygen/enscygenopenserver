/**
 * js/main.js
 * The main entry point for the ORFEX IDE.
 * Handles all UI setup, event listeners, and DOM manipulation.
 */

import { runORFEX } from './engine.js';
import { createTable, getPopoutScript, parseSequences, tableToPlainText, chartDataToPlainText, tableToCSV } from './utils.js';
import { AMINO_ACID_NAMES, BASE_NAMES, CODON_TABLE } from './constants.js';
import { COMMAND_DESCRIPTIONS } from './commands/index.js';
import { initHelpModal } from './help.js';

// --- Global UI Variables ---
let sequenceEditor, scriptEditor, splitInstance;
let popoutWindow = null;
let activeChart = null;

// --- Broadcast Channel for Live Cloning ---
const channel = new BroadcastChannel('orfex_sync');
const isClone = new URLSearchParams(window.location.search).get('clone') === 'true';
if (isClone) {
    document.title = "ORFEX IDE (Clone)";
}

channel.onmessage = (event) => {
    if (!isClone) return; // Only clones listen to messages
    const { type, payload } = event.data;
    if (type === 'sequenceUpdate' && sequenceEditor) {
        if (sequenceEditor.getValue() !== payload) {
            sequenceEditor.setValue(payload);
        }
    } else if (type === 'scriptUpdate' && scriptEditor) {
        if (scriptEditor.getValue() !== payload) {
            scriptEditor.setValue(payload);
        }
    } else if (type === 'outputUpdate') {
        document.getElementById('output').innerHTML = payload;
    }
};

// --- Monaco Editor Setup ---
require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });
window.MonacoEnvironment = {
    getWorkerUrl: function () {
        return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
        self.MonacoEnvironment = { baseUrl: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/' };
        importScripts('https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs/base/worker/workerMain.js');`)}`;
    }
};


require(["vs/editor/editor.main"], function () {
    // Language Definitions and Theme


    monaco.languages.register({ id: 'orfex-seq' });
    monaco.languages.setMonarchTokensProvider('orfex-seq', {
        tokenizer: {
            root: [
                [/^>.*/, 'keyword', '@sequence'],            // FASTA header
                [/^@@orfseq/, 'keyword', '@definition'],     // literal "@orfseq"
            ],

            definition: [
                [/\s+/, 'white'],

                // Match "name=VALUE" or "type=VALUE"
                [/(name)(=)(\w+)/, ['type', 'delimiter.equals', 'typenamevalue']],
                [/(type)(=)(\w+)/, ['type', 'delimiter.equals', 'typenamevalue']],

                // When line ends, switch to sequence state
                [/$/, { token: '', next: '@sequence' }]
            ],

            sequence: [
                [/^[ATGCUNRYWSMKBDHV*]+$/i, 'string'],       // DNA / protein sequences
                [/^@@orfseq.*/, { token: '@rematch', next: '@root' }],
                [/^>.*/, { token: '@rematch', next: '@root' }],
            ],
        }
    });

    monaco.languages.register({ id: 'orfex-script' });

    monaco.languages.setLanguageConfiguration('orfex-script', {
        autoClosingPairs: [
            { open: '(', close: ')' },
            { open: '[', close: ']' },
            { open: '{', close: '}' },
            { open: '"', close: '"' },
            { open: "'", close: "'" }
        ],
        surroundingPairs: [
            { open: '(', close: ')' },
            { open: '[', close: ']' },
            { open: '{', close: '}' },
            { open: '"', close: '"' },
            { open: "'", close: "'" }
        ],
        brackets: [
            ['(', ')'],
            ['[', ']'],
            ['{', '}']
        ]
    });

    monaco.languages.setMonarchTokensProvider('orfex-script', {
        tokenizer: {
            root: [
                // Commands like @pickprimers
                [/^@[a-zA-Z_]\w*\b/, 'keyword.command'],

                // Strings
                [/".*?"/, 'string'],
                [/'[^']*'/, 'string'],

                // Numbers
                [/[0-9]+/, 'number'],

                // Identifiers
                [/[a-zA-Z_$][\w$]*/, 'identifier'],

                // Delimiters
                [/[;,.]/, 'delimiter'],

                // Brackets
                [/[()]/, '@brackets'],

                // Whitespace
                [/\s+/, 'white'],

                // ✅ Fallback (prevents tokenizer freeze)
                [/./, 'text'],
            ],

            comment: [
                [/[^/*]+/, 'comment'],
                [/\/\*/, 'comment', '@push'],   // nested comment
                [/\*\//, 'comment', '@pop'],
                [/[\/*]/, 'comment'],
                [/./, 'comment'],               // ✅ fallback
            ],

            string: [
                [/[^\\"]+/, 'string'],
                [/\\./, 'string.escape'],
                [/"/, 'string', '@pop'],
                [/./, 'string'],                // ✅ fallback
            ],

            whitespace: [
                [/[ \t\r\n]+/, 'white'],
                [/\/\*/, 'comment', '@comment'],
                [/\/\/.*$/, 'comment'],
                [/./, 'white'],                 // ✅ fallback
            ],
        },
    });


    monaco.editor.defineTheme('orfex-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            // --- For the Script Editor (.orfex) ---
            { token: 'keyword', foreground: '58a6ff' },
            { token: 'keyword.command', foreground: '58a6ff' },       // Colors @commands (e.g., @info) and booleans (true/false)
            { token: 'parameter.name', foreground: 'ff44b2' }, // Colors parameter names (e.g., p_size, amplicon)
            { token: 'identifier.sequence', foreground: '4EC9B0' }, // NEW: For sequence names like TestDNA
            { token: 'identifier.variable', foreground: 'ff9e21' }, // NEW: For variables like mySeq
            { token: 'identifier', foreground: 'c9d1d9' },      // Colors variable and sequence names (e.g., rna_seq, TestDNA)
            { token: 'number.range', foreground: '46cd00' },      // Colors range values (e.g., 19-22)
            { token: 'number', foreground: '46cd00' },         // Colors standalone numbers
            { token: 'comment', foreground: '3b3d3b' },        // Colors entire comment lines (e.g., # --- Basic Analysis ---)
            { token: 'delimiter.equals', foreground: 'f14c4c' },      // Colors the equals sign (=)
            { token: 'delimiter.parenthesis', foreground: 'da70d6' },   // Colors parentheses ( )
            { token: 'delimiter', foreground: 'da70d6' },      // Colors other delimiters (e.g., [ ] : ,)

            // --- For the Sequence Editor (.orfseq) ---
            { token: 'type', foreground: '007fd4' },
            { token: 'typenamevalue', foreground: '4ec9b0' },            // Colors 'name=' and 'type=' in definition lines
            { token: 'string', foreground: 'c9d1d9' }          // Colors the actual sequence letters (ATGC...)
        ],
        colors: { 'editor.background': '#0d1117' }
    });

    // Escape regex special characters safely
    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // This function will dynamically update the script editor's syntax highlighting
    function updateScriptEditorSyntax() {
        if (!sequenceEditor || !scriptEditor) return;

        // 1. Find all sequence names from the sequence editor
        const sequenceContent = sequenceEditor.getValue();
        const seqNameRegex = /(?:^@orfseq\s+name=|^\>)([\w-]+)/gm;
        const sequenceNames = [...sequenceContent.matchAll(seqNameRegex)].map(m => escapeRegex(m[1]));

        // 2. Find all variable names from the script editor
        const scriptContent = scriptEditor.getValue();
        const varNameRegex = /^([a-zA-Z0-9_]+)\s*=/gm;
        const variableNames = [...scriptContent.matchAll(varNameRegex)].map(m => escapeRegex(m[1]));

        // 3. Build safe regex patterns
        const seqPattern = sequenceNames.length > 0 ? new RegExp(`\\b(${sequenceNames.join('|')})\\b`) : null;
        const varPattern = variableNames.length > 0 ? new RegExp(`\\b(${variableNames.join('|')})\\b`) : null;

        // 4. Re-register the tokenizer
        monaco.languages.setMonarchTokensProvider('orfex-script', {
            tokenizer: {
                root: [
                    // Highlight sequence names (must come before general identifier)
                    ...(seqPattern ? [[seqPattern, 'identifier.sequence']] : []),

                    // Highlight variable names (must come before general identifier)
                    ...(varPattern ? [[varPattern, 'identifier.variable']] : []),

                    // --- Original Static Rules ---
                    [/^#.*/, 'comment'],
                    [/@[a-zA-Z_]\w*/, 'keyword.command'],
                    [/[=]/, 'delimiter.equals'],
                    [/[()[\]:]/, 'delimiter'],
                    [/\d+-\d+/, 'number.range'],
                    [/\d+/, 'number'],
                    [/\b(?:true|false)\b/, 'keyword'],
                    [/[a-zA-Z_]\w*(?=\s*=)/, 'parameter.name'],

                    // ✅ fallback so tokenizer never freezes
                    [/./, 'text'],
                ]
            }
        });
    }


    monaco.languages.registerCompletionItemProvider('orfex-script', {
        triggerCharacters: ['@', ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789'],
        provideCompletionItems(model, position) {
            const line = model.getLineContent(position.lineNumber);
            const cursorIndex = position.column - 1;
            const before = line.slice(0, cursorIndex);

            // --- Case 1a: Typed ONLY '@' ---
            if (before.endsWith('@')) {
                const startColumn = position.column - 1;
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn,
                    endColumn: position.column,
                };

                const suggestions = Object.entries(COMMAND_DESCRIPTIONS).map(([label, details]) => ({
                    label,
                    kind: monaco.languages.CompletionItemKind.Function,
                    insertText: label,
                    filterText: label,
                    range,
                    detail: details.syntax,
                    documentation: details.description,
                    sortText: '000_' + label,
                }));

                // ✅ Return only commands, block everything else
                return { suggestions, incomplete: false };
            }

            // --- Case 1b: Typing @something ---
            const cmdMatch = before.match(/(@[A-Za-z_]([\w-]*)?)$/);
            if (cmdMatch) {
                const typed = cmdMatch[1];
                const startColumn = position.column - typed.length;
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn,
                    endColumn: position.column,
                };

                const typedLower = typed.toLowerCase();
                const filtered = Object.entries(COMMAND_DESCRIPTIONS).filter(([label]) =>
                    label.toLowerCase().startsWith(typedLower)
                );

                const suggestions = filtered.map(([label, details]) => ({
                    label,
                    kind: monaco.languages.CompletionItemKind.Function,
                    insertText: label,
                    filterText: label,
                    range,
                    detail: details.syntax,
                    documentation: details.description,
                    sortText: '000_' + label,
                }));

                return { suggestions, incomplete: false };
            }

            // --- Case 2: Variables & sequences (no @ present) ---
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            };

            const sequenceContent = sequenceEditor.getValue();
            const seqNameRegex = /(?:^@orfseq\s+name=|^>)([\w-]+)/gm;
            const sequenceNames = [...sequenceContent.matchAll(seqNameRegex)].map(m => m[1]);

            const scriptContent = scriptEditor.getValue();
            const varNameRegex = /^([a-zA-Z0-9_]+)\s*=/gm;
            const variableNames = [...scriptContent.matchAll(varNameRegex)].map(m => m[1]);

            const allNames = Array.from(new Set([...sequenceNames, ...variableNames]));

            const nameSuggestions = allNames.map(name => ({
                label: name,
                kind: monaco.languages.CompletionItemKind.Variable,
                insertText: name,
                range,
                detail: 'Sequence or Variable Name',
                sortText: '999_' + name,
            }));

            return { suggestions: nameSuggestions, incomplete: false };
        },
    });


    // Editor Initialization
    const editorOptions = {
        theme: "orfex-dark",
        fontSize: 14,
        automaticLayout: true,
        minimap: { enabled: false },
        wordWrap: 'on',
        readOnly: isClone,

        autoClosingBrackets: "always",
        autoClosingQuotes: "always",
        autoSurround: "languageDefined",
        autoIndent: "advanced",
    };

    const initialSequence = isClone ? localStorage.getItem('orfex_sequence') || '' : `@orfseq name=TestDNA type=DNA
ATGTGGGAATTCGGCATAGACGTTAG

>CompareDNA
ATGTGCGAATTCGACATAGACGTTAGCC

@orfseq name=TestRNA type=RNA
AUGUGGGAAUUCGGCAUAGACGUUAG

>TestProtein
MWGIQIFVATVLLCVGSLIC

@orfseq name=TestDNA2 type=DNA
ATGTGGATGTGGGAATTCGGCATAGGAATGTGGGAAATGTGGGAATTCGGCATAGTTCGGCATAGATTATGTGGGAATTCGGCATAGCGGCATAGACGTTAG

@orfseq name=PCRTemplate type=DNA
ATGTGATGTGGATGTGGGAATTCGGCATAGGAATGTGGGAAATGTGGGAATTCGGCATAGTTCGGCATGATGTGGGAATTCGGCATAGGAATGTGGGAAATGTGGGAATTCGGCATAGTTCGGCATAGATTATGTGGGAATTCGGCATAGCGGCATAGACGTTAGATGTGGATGTGGGAATTCGGCATAGGAATGTGGGAAATGTGGGAATTCGGCATAGTTCGGCATAGATTATGTGGGAATTCGGCATAGCGGCATAGACGTTAGATAGTTATAGTT

@orfseq name=oligoprimer type=DNA
ACCCTTAAGCCGTATCCTTACACCCTTTA`; // Default text
    const initialScript = isClone ? localStorage.getItem('orfex_script') || '' : `# --- Basic Analysis ---
@visualise TestDNA2
@info TestDNA
@composition TestDNA
@gccontent TestDNA
@molweight TestDNA

# --- Sequence Manipulation & Variable Assignment ---
rna_seq = @transcribe TestDNA
protein_seq = @translate rna_seq
rev_comp = @revcomp TestDNA
testdna_range = @getrange TestDNA [4:9]

# --- Using Variables & Showing Results ---
@info rna_seq
@info protein_seq
@show rev_comp
@show testdna_range

# --- Pattern Finding ---
@rebase TestDNA EcoRI
@findmotif TestDNA TAG

# --- Comparison & Alignment ---
@compare TestDNA CompareDNA
@align TestDNA CompareDNA
@bindto PCRTemplate oligoprimer

# --- Visualization ---
@findorfs TestDNA2 1
@plotgc CompareDNA 10
@plothydrophobicity TestProtein 5

@pickprimers TestDNA2 (p_size=5-10, amplicon=20-30, p_gc=10-55, gc_clamp=2, maxruns=4, getbest=10, maxselfany=3, maxself3=3)`; // Default text

    if (isClone) {
        document.getElementById('output').innerHTML = localStorage.getItem('orfex_output') || '';
    }

    sequenceEditor = monaco.editor.create(document.getElementById("sequence-editor"), { ...editorOptions, value: initialSequence, language: "orfex-seq" });
    scriptEditor = monaco.editor.create(document.getElementById("script-editor"), { ...editorOptions, value: initialScript, language: "orfex-script" });

    if (!isClone) {
        sequenceEditor.onDidChangeModelContent(() => {
            channel.postMessage({ type: 'sequenceUpdate', payload: sequenceEditor.getValue() });
            updateScriptEditorSyntax(); // Add this line
        });
        scriptEditor.onDidChangeModelContent(() => {
            channel.postMessage({ type: 'scriptUpdate', payload: scriptEditor.getValue() });
            updateScriptEditorSyntax(); // Add this line
        });
    }

    updateScriptEditorSyntax();

    document.getElementById("runButton").disabled = false;
    setupResponsiveLayout();
});

// --- UI Interactivity & Event Listeners ---

function setupResponsiveLayout() {
    if (window.innerWidth <= 768) {
        if (splitInstance) {
            splitInstance.destroy();
            splitInstance = null;
        }
    } else {
        if (!splitInstance) {
            updatePanelLayout();
        }
    }
}

function updatePanelLayout() {
    if (window.innerWidth <= 768) return;
    if (splitInstance) splitInstance.destroy();
    const visiblePanels = Array.from(document.querySelectorAll('.panel:not(.hidden)'));
    if (visiblePanels.length > 1) {
        splitInstance = Split(visiblePanels.map(el => `#${el.id}`), {
            gutterSize: 10,
            cursor: 'col-resize'
        });
    } else if (visiblePanels.length === 1) {
        visiblePanels[0].style.width = '100%';
    }
}

window.addEventListener('resize', setupResponsiveLayout);

document.querySelector('.dropdown-button').addEventListener('click', function () { this.nextElementSibling.classList.toggle('show'); });
window.onclick = function (event) { if (!event.target.matches('.dropdown-button')) { document.querySelectorAll('.dropdown-content').forEach(content => content.classList.remove('show')); } };
document.querySelectorAll('.dropdown-content a').forEach(item => { item.addEventListener('click', function (e) { e.preventDefault(); const panelId = this.dataset.panelId; const panel = document.getElementById(panelId); const checkmark = this.querySelector('.checkmark'); panel.classList.toggle('hidden'); checkmark.innerHTML = panel.classList.contains('hidden') ? '' : '✓'; updatePanelLayout(); }); });

document.getElementById("runButton").addEventListener("click", async () => {
    const outputEl = document.getElementById('output');
    outputEl.innerHTML = ''; // Clear UI before run

    // Pass the rendering functions directly to the engine
    await runORFEX(sequenceEditor.getValue(), scriptEditor.getValue(), renderResult, renderError);

    // After the run is complete, broadcast the final state of the output
    channel.postMessage({ type: 'outputUpdate', payload: outputEl.innerHTML });
});

document.getElementById("clearButton").addEventListener("click", () => {
    const outputEl = document.getElementById('output');
    outputEl.innerHTML = 'Output cleared.';
    channel.postMessage({ type: 'outputUpdate', payload: outputEl.innerHTML });
    if (popoutWindow && !popoutWindow.closed) { popoutWindow.document.getElementById('output').innerHTML = 'Output cleared.'; }
});

document.getElementById('file-input').addEventListener('change', (event) => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (e) => { if (sequenceEditor) sequenceEditor.setValue(e.target.result); }; reader.onerror = (e) => renderError("Failed to read the selected file.", "File Import"); reader.readAsText(file); event.target.value = ''; });
document.getElementById('cloneButton').addEventListener('click', () => { localStorage.setItem('orfex_sequence', sequenceEditor.getValue()); localStorage.setItem('orfex_script', scriptEditor.getValue()); localStorage.setItem('orfex_output', document.getElementById('output').innerHTML); window.open(window.location.pathname + '?clone=true', '_blank'); });
window.addEventListener('keydown', (event) => { if (event.key === 'F5') { event.preventDefault(); if (!document.getElementById('runButton').disabled) document.getElementById("runButton").click(); } });

// --- Event Listeners for Panel Header Buttons ---

// Handles the SEQUENCE panel's upload button
document.getElementById('upload-sequence-btn').addEventListener('click', () => {
    document.getElementById('file-input').click();
});

// Handles the SCRIPT panel's upload button
document.getElementById('upload-script-btn').addEventListener('click', () => {
    document.getElementById('script-file-input').click();
});

// Handles downloading the SEQUENCE content
document.getElementById('download-sequence-btn').addEventListener('click', () => {
    if (!sequenceEditor) return;
    const content = sequenceEditor.getValue();
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'sequence.orfseq';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
});

// Handles downloading the SCRIPT content
document.getElementById('download-script-btn').addEventListener('click', () => {
    if (!scriptEditor) return;
    const content = scriptEditor.getValue();
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'script.orfex';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
});

// Add this new listener for the script file input
document.getElementById('script-file-input').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        if (scriptEditor) {
            scriptEditor.setValue(e.target.result);
        }
    };
    reader.onerror = (e) => {
        // You'll need to have a renderError function available in main.js for this
        renderError("Failed to read the script file.", "File Import");
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input to allow re-uploading the same file
});

// --- Modal Logic ---
const positionModal = document.getElementById('positionModal');
document.getElementById('showPositionsButton').addEventListener('click', showSequencePositions);
positionModal.querySelector('.modal-close').addEventListener('click', () => positionModal.style.display = 'none');
positionModal.querySelector('.modal-content').addEventListener('click', function (e) {
    const detailView = document.getElementById('base-details'); const clickedSpan = e.target.closest('span[data-pos]'); const currentActive = this.querySelector('.active-base'); if (clickedSpan) {
        if (currentActive) currentActive.classList.remove('active-base'); clickedSpan.classList.add('active-base'); const { pos, code, seqName, seqType } = clickedSpan.dataset; let fullName = (seqType === 'Protein') ? AMINO_ACID_NAMES[code] || 'Unknown' : BASE_NAMES[code] || 'Unknown'; detailView.innerHTML = `<div class="pt-cell" role="group" aria-label="Detail card">
    <div class="pt-head">
      <div class="pt-seq">${seqName}</div>
      <div class="pt-pos">${pos}</div>
    </div>
    <div class="pt-code">${code}</div>
    <div class="pt-name">${fullName}</div>
  </div>`;
    } else if (!e.target.closest('#find-highlight-section')) { if (currentActive) { currentActive.classList.remove('active-base'); detailView.innerHTML = 'Click a base to see details...'; } }
});
document.getElementById('highlight-btn').addEventListener('click', handleHighlight);
document.getElementById('clear-highlight-btn').addEventListener('click', clearHighlights);

const codonModal = document.getElementById('codonTableModal');
let codonTablePopulated = false;
function populateCodonTable() { const tableBody = document.getElementById('codon-table-body'); tableBody.innerHTML = ''; for (const codon in CODON_TABLE) { const aminoAcidCode = CODON_TABLE[codon]; const aminoAcidName = aminoAcidCode === '*' ? 'Stop' : AMINO_ACID_NAMES[aminoAcidCode]; const row = document.createElement('tr'); row.innerHTML = `<td>${codon}</td><td>${aminoAcidName}</td><td>${aminoAcidCode}</td>`; tableBody.appendChild(row); } codonTablePopulated = true; }
document.getElementById('showCodonTableButton').addEventListener('click', () => { if (!codonTablePopulated) populateCodonTable(); codonModal.style.display = 'flex'; });
codonModal.querySelector('.modal-close').addEventListener('click', () => { codonModal.style.display = 'none'; });
document.getElementById('codon-search-input').addEventListener('input', (e) => { const searchTerm = e.target.value.toUpperCase(); const rows = document.getElementById('codon-table-body').rows; for (let i = 0; i < rows.length; i++) { const cells = rows[i].cells; const match = [cells[0].textContent, cells[1].textContent.toUpperCase(), cells[2].textContent].some(text => text.includes(searchTerm)); rows[i].style.display = match ? '' : 'none'; } });


// --- DOM MANIPULATION & RENDERING FUNCTIONS ---

function renderResult(result) {
    if (!result) return;
    const outputEl = document.getElementById('output');
    const block = document.createElement('div');
    block.className = 'result-block';
    const header = document.createElement('div');
    header.className = 'result-header';
    const headerContent = document.createElement('div');
    headerContent.style.display = 'flex';
    headerContent.style.justifyContent = 'space-between';
    headerContent.style.alignItems = 'center';
    const titleSpan = document.createElement('span');
    titleSpan.textContent = result.title;
    const iconContainer = document.createElement('div');
    iconContainer.className = 'header-icons';
    const wrapToggle = document.createElement('span');
    wrapToggle.className = 'wrap-toggle output-item-header-icon';
    wrapToggle.title = 'Toggle word wrap';
    wrapToggle.innerHTML = '<i class="bi bi-text-wrap"></i>';
    iconContainer.appendChild(wrapToggle);
    const copyBtn = document.createElement('span');
    copyBtn.className = 'copy-btn output-item-header-icon';
    copyBtn.title = 'Copy content';
    copyBtn.innerHTML = '<i class="bi bi-clipboard"></i><i class="bi bi-clipboard-check"></i>';
    iconContainer.appendChild(copyBtn);
    const downloadBtn = document.createElement('span');
    downloadBtn.className = 'download-btn output-item-header-icon'; // Re-use the same style for consistency
    downloadBtn.title = 'Download as .txt';
    downloadBtn.innerHTML = '<i class="bi bi-filetype-txt"></i>';
    iconContainer.appendChild(downloadBtn);

    // --- NEW: Conditionally add Download as CSV Button ---
    if (result.type === 'table') {
        const downloadCsvBtn = document.createElement('span');
        downloadCsvBtn.className = 'download-csv-btn output-item-header-icon';
        downloadCsvBtn.title = 'Download as .csv';
        downloadCsvBtn.innerHTML = '<i class="bi bi-filetype-csv"></i>';
        iconContainer.appendChild(downloadCsvBtn);

        downloadCsvBtn.addEventListener('click', function () {
            const title = result.title.replace(/[^a-z0-9_]/gi, '_').replace(/_{2,}/g, '_');
            const filename = `${title}.csv`;
            const tableElement = content.querySelector('table');
            if (tableElement) {
                const csvContent = tableToCSV(tableElement);
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
            }
        });
    }

    // --- START: MODIFICATION ---
    // Add the expand button to ALL result blocks
    const expandBtn = document.createElement('span');
    expandBtn.className = 'copy-btn output-item-header-icon'; // Re-use style
    expandBtn.title = 'Expand Content';
    expandBtn.innerHTML = '<i class="bi bi-arrows-angle-expand"></i>';

    // Add the "smart" click listener that decides which modal to open
    expandBtn.addEventListener('click', () => {
        if (result.type === 'plot') {
            openChartModal(result.data, result.options || {}, result.title);
        } else {
            openGenericModal(result);
        }
    });
    iconContainer.appendChild(expandBtn);
    // --- END: MODIFICATION ---


    headerContent.appendChild(titleSpan);
    headerContent.appendChild(iconContainer);
    header.appendChild(headerContent);
    block.appendChild(header);
    const content = document.createElement('div');
    content.className = 'result-content';
    wrapToggle.addEventListener('click', function () { this.classList.toggle('is-active'); content.classList.toggle('is-wrapped'); });
    copyBtn.addEventListener('click', function () {
        // Get the content element associated with this button
        const contentToCopy = this.closest('.result-header').nextElementSibling;

        // Create a range and select the content
        const range = document.createRange();
        range.selectNode(contentToCopy);
        window.getSelection().removeAllRanges(); // Clear any previous selection
        window.getSelection().addRange(range);

        try {
            // Execute the copy command
            document.execCommand('copy');

            // Add the 'copied' class to show the checkmark icon
            this.classList.add('copied');

            // After 3 seconds, remove the class to revert the icon
            setTimeout(() => {
                this.classList.remove('copied');
            }, 3000);

        } catch (err) {
            console.error('Failed to copy content: ', err);
        }

        // Deselect the text
        window.getSelection().removeAllRanges();
    });
    // --- ADD THIS NEW EVENT LISTENER ---
    downloadBtn.addEventListener('click', function () {
        const title = result.title.replace(/[^a-z0-9_]/gi, '_').replace(/_{2,}/g, '_');
        const filename = `${title}.txt`;

        let textContent;
        const tableElement = content.querySelector('table');
        const isChart = content.querySelector('canvas') && content.dataset.chartData;

        if (tableElement) {
            textContent = tableToPlainText(tableElement);
        } else if (isChart) {
            const rawData = JSON.parse(content.dataset.chartData);
            textContent = chartDataToPlainText(rawData);
        } else {
            textContent = content.textContent || content.innerText;
        }

        const fileContent = `${result.title}\n\n${textContent}`;
        const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    });
    switch (result.type) {
        case 'text': content.textContent = result.content; break;
        case 'table': content.appendChild(createTable(result.data)); break;
        case 'plot':
            const canvas = document.createElement('canvas');
            if (result.data.raw) content.dataset.chartData = JSON.stringify(result.data.raw);
            content.appendChild(canvas);
            createPlot(canvas, result.data, result.options || {});
            break;
        case 'orf-map': content.innerHTML = createOrfMap(result.data); break;
        default: content.textContent = 'Unsupported result type.';
    }
    block.appendChild(content);
    outputEl.appendChild(block);
    if (popoutWindow && !popoutWindow.closed) { popoutWindow.document.getElementById('output')?.appendChild(block.cloneNode(true)); }
}

function renderError(message, commandLine) {
    const outputEl = document.getElementById('output');
    const block = document.createElement('div');
    block.className = 'result-block';
    const header = document.createElement('div');
    header.className = 'result-header error';
    header.textContent = 'Error';
    block.appendChild(header);
    const content = document.createElement('div');
    content.className = 'result-content error';
    content.textContent = `Command: ${commandLine}\nError: ${message}`;
    block.appendChild(content);
    outputEl.appendChild(block);
    if (popoutWindow && !popoutWindow.closed) { popoutWindow.document.getElementById('output')?.appendChild(block.cloneNode(true)); }
}

function createPlot(canvas, data, customOptions = {}) {
    const defaultOptions = { scales: { y: {} }, plugins: { legend: { display: true } } };
    const finalOptions = { ...defaultOptions, ...customOptions };
    new Chart(canvas, { type: 'line', data: data.chart || data, options: finalOptions });
}

function createOrfMap(orfs) {
    if (!orfs || !orfs.length) return '<p>No ORFs found meeting the criteria.</p>';
    let html = '<div class="orf-map">';
    for (let i = 1; i <= 3; i++) {
        const frameOrfs = orfs.filter(orf => orf.frame === i);
        html += `<div class="frame"><strong>Frame ${i}:</strong> `;
        if (frameOrfs.length) {
            frameOrfs.forEach(orf => {
                html += `<span class="orf" title="Protein: ${orf.protein}">${orf.start}..${orf.end} (${orf.length}aa)</span>`;
            });
        } else {
            html += 'None';
        }
        html += '</div>';
    }
    html += '</div>';
    return html;
}

function showSequencePositions() {
    if (!sequenceEditor) return;
    const { sequences } = parseSequences(sequenceEditor.getValue());
    const view = document.getElementById('position-view');
    view.innerHTML = '';
    document.getElementById('base-details').innerHTML = 'Click a base to see details...';
    clearHighlights();
    const seqNames = Object.keys(sequences);
    if (seqNames.length === 0) {
        view.innerHTML = 'No sequences found in the editor.';
        positionModal.style.display = 'flex';
        return;
    }
    const selectEl = document.getElementById('sequence-select');
    selectEl.innerHTML = '';
    seqNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        selectEl.appendChild(option);
    });
    let finalHtml = '';
    for (const name of seqNames) {
        const seqData = sequences[name];
        finalHtml += `<h4>${name} (${seqData.type})</h4>`;
        const lineLength = 60;
        let sequenceBlockHtml = '';
        for (let i = 0; i < seqData.seq.length; i += lineLength) {
            const chunk = seqData.seq.substring(i, i + lineLength);
            let ruler = '';
            for (let j = 0; j < chunk.length; j += 10) {
                ruler += String(i + j + 1).padEnd(10, ' ');
            }
            let sequenceHTML = '';
            for (let k = 0; k < chunk.length; k++) {
                const pos = i + k + 1;
                const code = chunk[k];
                sequenceHTML += `<span data-pos="${pos}" data-code="${code}" data-seq-name="${name}" data-seq-type="${seqData.type}">${code}</span>`;
            }
            sequenceBlockHtml += `<div class="ruler">${ruler}</div>`;
            sequenceBlockHtml += `<div class="sequence">${sequenceHTML}</div>\n`;
        }
        finalHtml += sequenceBlockHtml + '<hr style="border-color: var(--border-color); margin: 1rem 0;border-style: dashed;">';
    }
    view.innerHTML = finalHtml;
    positionModal.style.display = 'flex';
}

function parseRangeString(rangeStr) {
    const positions = new Set();
    if (!rangeStr) return positions;
    const parts = rangeStr.split(',');
    for (const part of parts) {
        const trimmedPart = part.trim();
        if (trimmedPart.includes('-')) {
            const [start, end] = trimmedPart.split('-').map(Number);
            if (!isNaN(start) && !isNaN(end) && start <= end) {
                for (let i = start; i <= end; i++) {
                    positions.add(i);
                }
            }
        } else {
            const num = Number(trimmedPart);
            if (!isNaN(num)) {
                positions.add(num);
            }
        }
    }
    return positions;
}

function clearHighlights() {
    document.querySelectorAll('.range-highlight').forEach(el => el.classList.remove('range-highlight'));
    document.getElementById('highlight-results').innerHTML = '';
}

function handleHighlight() {
    clearHighlights();
    const { sequences } = parseSequences(sequenceEditor.getValue());
    const selectedSeqName = document.getElementById('sequence-select').value;
    const rangeStr = document.getElementById('range-input').value;
    if (!selectedSeqName || !rangeStr) return;
    const positions = parseRangeString(rangeStr);
    const targetSequence = sequences[selectedSeqName].seq;
    const resultsTable = [];
    positions.forEach(pos => {
        const span = document.querySelector(`span[data-seq-name="${selectedSeqName}"][data-pos="${pos}"]`);
        if (span) {
            span.classList.add('range-highlight');
        }
    });
    const parts = rangeStr.split(',');
    for (const part of parts) {
        const trimmedPart = part.trim();
        let sequenceChunk = '';
        if (trimmedPart.includes('-')) {
            const [start, end] = trimmedPart.split('-').map(Number);
            if (!isNaN(start) && !isNaN(end)) {
                sequenceChunk = targetSequence.substring(start - 1, end);
            }
        } else {
            const num = Number(trimmedPart);
            if (!isNaN(num)) {
                sequenceChunk = targetSequence[num - 1] || '';
            }
        }
        if (sequenceChunk) {
            resultsTable.push([trimmedPart, sequenceChunk]);
        }
    }
    if (resultsTable.length > 0) {
        const tableData = {
            headers: ['Range/Position', 'Sequence'],
            rows: resultsTable
        };
        document.getElementById('highlight-results').appendChild(createTable(tableData));
    }
}

document.getElementById('clear-sequence-btn').addEventListener('click', () => {
    if (sequenceEditor) sequenceEditor.setValue('');
});
document.getElementById('clear-script-btn').addEventListener('click', () => {
    if (scriptEditor) scriptEditor.setValue('');
});

// --- Add these listeners for the new Help Modal ---
const helpModal = document.getElementById('helpModal');
document.getElementById('helpButton').addEventListener('click', () => {
    initHelpModal(); // Initialize or re-initialize the content
    helpModal.style.display = 'flex';
});

helpModal.querySelector('.modal-close').addEventListener('click', () => {
    helpModal.style.display = 'none';
});

// --- START: NEW Chart Modal Logic ---

const chartModal = document.getElementById('chartModal');
const genericModal = document.getElementById('genericModal');
const chartModalTitle = document.getElementById('chart-modal-title');
const chartCanvasContainer = document.getElementById('chart-modal-canvas-container');
const chartWidthBaseInput = document.getElementById('chart-width-base-input');
const chartWidthTotalInput = document.getElementById('chart-width-total-input');
const chartHeightInput = document.getElementById('chart-height-input');
const downloadChartBtn = document.getElementById('download-chart-btn');

let currentChartData = null;
let currentChartOptions = null;

function openChartModal(chartData, chartOptions, title) {
    currentChartData = chartData;
    currentChartOptions = chartOptions;
    chartModalTitle.textContent = title;

    // Reset inputs
    chartWidthBaseInput.value = '';
    chartWidthTotalInput.value = '';
    chartHeightInput.value = '300';

    drawChartInModal();
    chartModal.style.display = 'flex';
}

function drawChartInModal() {
    if (activeChart) {
        activeChart.destroy();
    }
    chartCanvasContainer.innerHTML = '';
    const canvas = document.createElement('canvas');
    chartCanvasContainer.appendChild(canvas);

    const sequenceLength = currentChartData.chart.labels.length;
    let chartWidth = Math.max(600, sequenceLength * 10); // Default dynamic width
    const chartHeight = parseInt(chartHeightInput.value, 10) || 300;

    if (chartWidthBaseInput.value) {
        chartWidth = sequenceLength * (parseInt(chartWidthBaseInput.value, 10) || 10);
    } else if (chartWidthTotalInput.value) {
        chartWidth = parseInt(chartWidthTotalInput.value, 10) || chartWidth;
    }

    chartCanvasContainer.style.height = `${chartHeight}px`;
    canvas.parentElement.style.height = `${chartHeight}px`;
    canvas.parentElement.style.width = `${chartWidth}px`;

    const finalOptions = { ...currentChartOptions, maintainAspectRatio: false };
    activeChart = new Chart(canvas, {
        type: 'line',
        data: currentChartData.chart,
        options: finalOptions
    });
}

chartModal.querySelector('.modal-close').addEventListener('click', () => {
    chartModal.style.display = 'none';
    if (activeChart) {
        activeChart.destroy();
        activeChart = null;
    }
});

chartWidthBaseInput.addEventListener('input', () => {
    chartWidthTotalInput.disabled = !!chartWidthBaseInput.value;
    drawChartInModal();
});
chartWidthTotalInput.addEventListener('input', () => {
    chartWidthBaseInput.disabled = !!chartWidthTotalInput.value;
    drawChartInModal();
});
chartHeightInput.addEventListener('input', drawChartInModal);

downloadChartBtn.addEventListener('click', () => {
    if (activeChart) {
        const link = document.createElement('a');
        link.href = activeChart.toBase64Image();
        link.download = `${chartModalTitle.textContent.replace(/[^a-z0-9_]/gi, '_')}.png`;
        link.click();
    }
});

// --- END: NEW Chart Modal Logic ---



// NEW: Function to open the generic content modal
const genericModalTitle = document.getElementById('generic-modal-title');
const genericModalContent = document.getElementById('generic-modal-content-container');

function openGenericModal(result) {
    genericModalTitle.textContent = result.title;
    genericModalContent.innerHTML = ''; // Clear previous content

    // Re-render the content inside the modal for a clean view
    switch (result.type) {
        case 'text':
            const pre = document.createElement('pre');
            pre.textContent = result.content;
            genericModalContent.appendChild(pre);
            break;
        case 'table':
            genericModalContent.appendChild(createTable(result.data));
            break;
        case 'orf-map':
            genericModalContent.innerHTML = createOrfMap(result.data);
            break;
    }
    genericModal.style.display = 'flex';
}

genericModal.querySelector('.modal-close').addEventListener('click', () => {
    genericModal.style.display = 'none';
});

// --- END: NEW Logic ---