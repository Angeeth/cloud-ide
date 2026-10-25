import React, { useContext, useRef, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { WorkspaceContext } from '../../context/WorkspaceContext';
import { AuthContext } from '../../context/AuthContext';
import Logo from '../common/Logo';
import { setupIntelliSense } from '../../utils/monacoIntelliSense';

function getLanguage(filename = '') {
  const ext = filename.split('.').pop().toLowerCase();
  switch (ext) {
    case 'py': return 'python';
    case 'js': return 'javascript';
    case 'jsx': return 'javascript';
    case 'java': return 'java';
    case 'cpp': return 'cpp';
    case 'c': return 'cpp';
    case 'h': return 'cpp';
    case 'hpp': return 'cpp';
    case 'json': return 'json';
    case 'md': return 'markdown';
    case 'html': return 'html';
    case 'css': return 'css';
    case 'xml': return 'xml';
    default: return 'plaintext';
  }
}

// 8 distinct colors for collaborator cursors
const COLLAB_COLORS = [
  { name: 'purple',  caret: '#c084fc' },
  { name: 'cyan',    caret: '#38bdf8' },
  { name: 'emerald', caret: '#34d399' },
  { name: 'amber',   caret: '#fbbf24' },
  { name: 'rose',    caret: '#fb7185' },
  { name: 'indigo',  caret: '#818cf8' },
  { name: 'orange',  caret: '#fb923c' },
  { name: 'teal',    caret: '#2dd4bf' },
];

function getCollabColor(id = '') {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return COLLAB_COLORS[Math.abs(hash) % COLLAB_COLORS.length];
}

export default function CodeEditor() {
  const { user } = useContext(AuthContext);
  const {
    activeFile,
    fileContents,
    updateFileContent,
    saveCurrentFile,
    project,
    remoteCursors,
    lastRemoteChange,
    broadcastCursorPosition,
    clientId,
  } = useContext(WorkspaceContext);

  const canEdit = project?.user_role !== 'VIEWER';

  // Stable refs so callbacks never go stale
  const editorRef       = useRef(null);
  const monacoRef       = useRef(null);
  const decorationsRef  = useRef([]);
  const throttleRef     = useRef(null);
  const activeFileRef   = useRef(activeFile);
  // TRUE while we are programmatically writing into the model — suppresses our own onChange echo
  const applyingRef     = useRef(false);

  // Keep activeFileRef in sync
  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  // ─── EFFECT 1: File tab switch ─────────────────────────────────────────────
  // When the user clicks a different tab we get a new Editor (key={activeFile.id})
  // so handleEditorMount already populates it. This effect handles the case
  // where the content arrives AFTER mount (async API response).
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activeFile) return;
    const model = editor.getModel();
    if (!model) return;

    const wanted = fileContents[activeFile.id];
    if (wanted === undefined) return;

    // Only overwrite if the editor is still showing empty placeholder
    if (model.getValue() === '' && wanted !== '') {
      applyingRef.current = true;
      model.setValue(wanted);
      setTimeout(() => { applyingRef.current = false; }, 50);
    }
  // Intentionally depend only on activeFile.id so we run once per tab switch
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile?.id]);

  // ─── EFFECT 2: Incoming remote delta (Google-Docs-style) ───────────────────
  // This is the ONLY place we apply remote edits. We use model.applyEdits()
  // directly on the ITextModel — it NEVER moves the local user's cursor.
  useEffect(() => {
    if (!lastRemoteChange) return;
    if (!activeFile || lastRemoteChange.fileId !== activeFile.id) return;

    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;

    applyingRef.current = true;

    try {
      const { changes, content } = lastRemoteChange;

      if (changes && changes.length > 0) {
        // ✅ PREFERRED PATH: apply the exact granular ops the sender produced
        model.applyEdits(
          changes.map((ch) => ({
            range: new monaco.Range(
              ch.range.startLineNumber,
              ch.range.startColumn,
              ch.range.endLineNumber,
              ch.range.endColumn
            ),
            text: ch.text,
            forceMoveMarkers: true,
          }))
        );
      } else if (content !== undefined) {
        // FALLBACK: compute minimal diff and apply only changed span
        const old = model.getValue();
        if (old === content) return;

        let s = 0;
        while (s < old.length && s < content.length && old[s] === content[s]) s++;
        let oe = old.length;
        let ne = content.length;
        while (oe > s && ne > s && old[oe - 1] === content[ne - 1]) { oe--; ne--; }

        const sp = model.getPositionAt(s);
        const ep = model.getPositionAt(oe);
        model.applyEdits([{
          range: new monaco.Range(sp.lineNumber, sp.column, ep.lineNumber, ep.column),
          text: content.substring(s, ne),
          forceMoveMarkers: true,
        }]);
      }
    } catch (err) {
      // Last resort — only if model.applyEdits threw
      console.warn('[collab] applyEdits error, falling back to setValue:', err);
      if (lastRemoteChange.content !== undefined) {
        const model2 = editorRef.current?.getModel();
        if (model2) model2.setValue(lastRemoteChange.content);
      }
    } finally {
      // Release flag after microtask queue flushes so onChange is not triggered
      setTimeout(() => { applyingRef.current = false; }, 30);
    }
  }, [lastRemoteChange]);

  // ─── EFFECT 3: Draw colored cursor pipes for every remote collaborator ─────
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    if (!editor || !monaco || !activeFile) {
      if (editor && decorationsRef.current.length > 0) {
        decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
      }
      return;
    }

    const cursors = Object.values(remoteCursors || {}).filter((c) => {
      if (!c || c.fileId !== activeFile.id) return false;
      if (!c.position?.lineNumber) return false;
      // Exclude our own cursor (matched by clientId first, then user.id)
      if (c.clientId && clientId && c.clientId === clientId) return false;
      if (!c.clientId && user?.id && c.senderId === user.id) return false;
      return true;
    });

    const decs = [];

    cursors.forEach((collab) => {
      const { name: colorName, caret } = getCollabColor(collab.clientId || collab.senderId);
      const pos  = collab.position;
      const sel  = collab.selection;
      const label = collab.senderName || 'Teammate';

      // Vertical cursor pipe | — className controls the colored left-border; no background
      decs.push({
        range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
        options: {
          className: `remote-cursor-pipe remote-cursor-${colorName}`,
          hoverMessage: { value: `**${label}** — line ${pos.lineNumber}, col ${pos.column}` },
          overviewRuler: { color: caret, position: monaco.editor.OverviewRulerLane.Right },
          zIndex: 100,
        },
      });

      // Selection highlight — ONLY when the teammate actually has text selected
      if (sel && (sel.startLineNumber !== sel.endLineNumber || sel.startColumn !== sel.endColumn)) {
        decs.push({
          range: new monaco.Range(sel.startLineNumber, sel.startColumn, sel.endLineNumber, sel.endColumn),
          options: { className: `remote-selection remote-selection-${colorName}` },
        });
      }
    });

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decs);
  }, [remoteCursors, activeFile, user?.id, clientId]);

  // Clean up decorations when component unmounts
  useEffect(() => () => {
    if (editorRef.current && decorationsRef.current.length > 0) {
      editorRef.current.deltaDecorations(decorationsRef.current, []);
    }
  }, []);

  // ─── EMPTY STATE ───────────────────────────────────────────────────────────
  if (!activeFile) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#121215', color: '#a1a1aa', fontSize: '0.9rem',
      }}>
        <div style={{ marginBottom: '1rem' }}>
          <Logo size={56} />
        </div>
        <p style={{ fontWeight: '600', color: '#fafafa', marginBottom: '0.25rem', fontSize: '1.1rem' }}>
          Mirage IDE Workspace
        </p>
        <p style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>
          Select a file from the explorer to begin editing
        </p>
      </div>
    );
  }

  // ─── MONACO THEME ──────────────────────────────────────────────────────────
  const handleEditorWillMount = (monaco) => {
    setupIntelliSense(monaco);
    monaco.editor.defineTheme('mirage-obsidian-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword',  foreground: '818cf8', fontStyle: 'bold' },
        { token: 'string',   foreground: '10b981' },
        { token: 'number',   foreground: 'f59e0b' },
        { token: 'comment',  foreground: '71717a', fontStyle: 'italic' },
        { token: 'type',     foreground: 'a855f7', fontStyle: 'bold' },
        { token: 'function', foreground: '06b6d4' },
        { token: 'variable', foreground: 'fafafa' },
      ],
      colors: {
        'editor.background':                    '#121215',
        'editor.foreground':                    '#fafafa',
        'editorCursor.foreground':              '#818cf8',
        'editor.lineHighlightBackground':       '#18181b',
        'editorLineNumber.foreground':          '#52525b',
        'editorLineNumber.activeForeground':    '#818cf8',
        'editor.selectionBackground':           '#27272a',
        'editor.inactiveSelectionBackground':   '#18181b',
        'editorIndentGuide.background':         '#27272a',
        'editorIndentGuide.activeBackground':   '#6366f1',
        'editorSuggestWidget.background':       '#18181b',
        'editorSuggestWidget.border':           '#27272a',
        'editorSuggestWidget.foreground':       '#f4f4f5',
        'editorSuggestWidget.selectedBackground':'#27272a',
        'editorSuggestWidget.highlightForeground':'#818cf8',
        'editorSuggestWidget.focusBorder':      '#818cf8',
        'editorHoverWidget.background':         '#18181b',
        'editorHoverWidget.border':             '#27272a',
        'editorGhostText.foreground':           'rgba(161, 161, 170, 0.5)',
      },
    });
  };

  // ─── EDITOR MOUNT ──────────────────────────────────────────────────────────
  const handleEditorMount = (editor, monaco) => {
    editorRef.current  = editor;
    monacoRef.current  = monaco;

    // Populate content immediately if the API response already arrived
    const initContent = fileContents[activeFileRef.current?.id];
    if (initContent !== undefined && editor.getValue() !== initContent) {
      applyingRef.current = true;
      editor.setValue(initContent);
      setTimeout(() => { applyingRef.current = false; }, 50);
    }

    // Ctrl/Cmd+S → save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (canEdit) saveCurrentFile();
    });

    // ── LOCAL TYPING → broadcast granular delta ──────────────────────────────
    // onDidChangeModelContent gives us the exact edit operations Monaco produced.
    // We forward these ops over WebSocket so remote peers can apply them with
    // model.applyEdits — never touching their cursor positions.
    editor.onDidChangeModelContent((event) => {
      if (applyingRef.current) return;   // ← this is a remote-applied change, skip
      if (!canEdit) return;
      const curFile = activeFileRef.current;
      if (!curFile) return;

      const fullValue = editor.getValue();

      // Serialize Monaco's native IModelContentChange[] for the peer
      const changes = event.changes.map((ch) => ({
        range: {
          startLineNumber: ch.range.startLineNumber,
          startColumn:     ch.range.startColumn,
          endLineNumber:   ch.range.endLineNumber,
          endColumn:       ch.range.endColumn,
        },
        text: ch.text,
      }));

      updateFileContent(curFile.id, fullValue, /* broadcast */ true, changes);
    });

    // ── CURSOR / SELECTION → broadcast position for remote pipe rendering ────
    const sendPosition = () => {
      if (applyingRef.current) return;
      const curFile = activeFileRef.current;
      if (!curFile || !broadcastCursorPosition) return;
      const pos = editor.getPosition();
      const sel = editor.getSelection();
      if (!pos) return;
      broadcastCursorPosition(
        curFile.id,
        { lineNumber: pos.lineNumber, column: pos.column },
        sel && (sel.startLineNumber !== sel.endLineNumber || sel.startColumn !== sel.endColumn)
          ? { startLineNumber: sel.startLineNumber, startColumn: sel.startColumn,
              endLineNumber: sel.endLineNumber,   endColumn:   sel.endColumn }
          : null
      );
    };

    // Throttle at ~25 fps so we don't flood the WebSocket
    const onCursorChange = () => {
      if (applyingRef.current) return;
      if (throttleRef.current) return;
      throttleRef.current = setTimeout(() => {
        throttleRef.current = null;
        sendPosition();
      }, 40);
    };

    editor.onDidChangeCursorPosition(onCursorChange);
    editor.onDidChangeCursorSelection(onCursorChange);
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────
  const initialContent = fileContents[activeFile.id] ?? '';
  const language       = getLanguage(activeFile.name);

  return (
    <div style={{ flex: 1, width: '100%', height: '100%', backgroundColor: '#121215', overflow: 'hidden' }}>
      {/*
        key={activeFile.id} — React unmounts + remounts Editor on tab switch.
        defaultValue     — sets content once at mount; we manage all further
                           updates via model.applyEdits / model.setValue directly
                           so Monaco never resets the cursor.
        NOTE: we do NOT use the `onChange` prop here — we use
              onDidChangeModelContent inside handleEditorMount instead,
              so we have full control over the applyingRef guard.
      */}
      <Editor
        key={activeFile.id}
        height="100%"
        language={language}
        defaultValue={initialContent}
        theme="mirage-obsidian-dark"
        beforeMount={handleEditorWillMount}
        onMount={handleEditorMount}
        options={{
          fontSize: 14,
          fontFamily: "'Fira Code', Consolas, monospace",
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          readOnly: !canEdit,
          automaticLayout: true,
          tabSize: 4,
          wordWrap: 'on',
          lineNumbers: 'on',
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          quickSuggestions: { other: true, comments: false, strings: false },
          quickSuggestionsDelay: 40,
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: 'smart',
          tabCompletion: 'on',
          acceptSuggestionOnCommitCharacter: false,
          snippetSuggestions: 'inline',
          suggestSelection: 'first',
          wordBasedSuggestions: 'allDocuments',
          suggest: {
            preview: true, showWords: true, showSnippets: true,
            showFunctions: true, showKeywords: true, showVariables: true,
            showClasses: true, showMethods: true, showProperties: true,
            showConstants: true, showEnums: true, showInterfaces: true,
            showModules: true, showStructs: true, showEvents: true,
            showOperators: true, showUnits: true, showValues: true,
            showFolders: true, showFiles: true, showReferences: true,
            showColors: true, showTypeParameters: true,
            insertMode: 'insert', filterGraceful: true,
            shareSuggestSelections: true, localityBonus: true,
          },
          parameterHints: { enabled: true, cycle: true },
          autoClosingBrackets: 'always',
          autoClosingQuotes: 'always',
          autoClosingDelete: 'always',
          autoClosingOvertype: 'always',
          autoSurround: 'languageDefined',
          formatOnType: true,
          formatOnPaste: true,
        }}
      />
    </div>
  );
}
