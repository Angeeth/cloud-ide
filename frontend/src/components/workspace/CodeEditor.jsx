import React, { useContext, useRef, useEffect } from 'react';
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

const COLLAB_COLORS = [
  { name: 'purple', caret: '#c084fc', line: 'rgba(192, 132, 252, 0.12)' },
  { name: 'cyan', caret: '#38bdf8', line: 'rgba(56, 189, 248, 0.12)' },
  { name: 'emerald', caret: '#34d399', line: 'rgba(52, 211, 153, 0.12)' },
  { name: 'amber', caret: '#fbbf24', line: 'rgba(251, 191, 36, 0.12)' },
  { name: 'rose', caret: '#fb7185', line: 'rgba(251, 113, 133, 0.12)' },
  { name: 'indigo', caret: '#818cf8', line: 'rgba(129, 140, 248, 0.12)' },
  { name: 'orange', caret: '#fb923c', line: 'rgba(251, 146, 60, 0.12)' },
  { name: 'teal', caret: '#2dd4bf', line: 'rgba(45, 212, 191, 0.12)' }
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
    broadcastCursorPosition,
    clientId
  } = useContext(WorkspaceContext);

  const canEdit = project?.user_role !== 'VIEWER';
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationsRef = useRef([]);
  const throttleRef = useRef(null);
  const activeFileRef = useRef(activeFile);
  const isApplyingRemoteRef = useRef(false);

  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  // Synchronize remote file changes without resetting or shifting the local user's cursor
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activeFile) return;
    const model = editor.getModel();
    if (!model) return;

    const remoteContent = fileContents[activeFile.id];
    if (remoteContent === undefined) return;

    const localContent = model.getValue();
    if (remoteContent === localContent) return;

    // Case 1: Initial file load (e.g. starter code when opening a newly created project)
    if (localContent === '' && remoteContent !== '') {
      isApplyingRemoteRef.current = true;
      model.setValue(remoteContent);
      setTimeout(() => {
        isApplyingRemoteRef.current = false;
      }, 50);
      return;
    }

    // Case 2: Minimal diff-based collaborative patching (allows parallel typing without cursor jumping)
    const oldText = localContent;
    const newText = remoteContent;

    let start = 0;
    while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) {
      start++;
    }

    let oldEnd = oldText.length;
    let newEnd = newText.length;
    while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }

    const startPos = model.getPositionAt(start);
    const endPos = model.getPositionAt(oldEnd);
    const replacementText = newText.substring(start, newEnd);

    // Capture active cursor position and selection
    const prevPosition = editor.getPosition();
    const prevSelection = editor.getSelection();
    const prevScrollTop = editor.getScrollTop();
    const prevScrollLeft = editor.getScrollLeft();

    isApplyingRemoteRef.current = true;

    if (monacoRef.current) {
      editor.executeEdits('remote-collaborator', [
        {
          range: new monacoRef.current.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
          text: replacementText,
          forceMoveMarkers: true
        }
      ]);
    } else {
      model.setValue(remoteContent);
    }

    // Restore local cursor position immediately
    if (prevPosition) {
      editor.setPosition(prevPosition);
    }
    if (prevSelection) {
      editor.setSelection(prevSelection);
    }
    editor.setScrollTop(prevScrollTop);
    editor.setScrollLeft(prevScrollLeft);

    setTimeout(() => {
      isApplyingRemoteRef.current = false;
    }, 50);
  }, [fileContents[activeFile?.id], activeFile?.id]);

  // Synchronize and render real-time collaborator cursors, line highlights, and name labels
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !activeFile) {
      if (editor && decorationsRef.current.length > 0) {
        decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
      }
      return;
    }

    // Filter out our own cursor using both clientId and user.id
    const relevantCursors = Object.values(remoteCursors || {}).filter((c) => {
      if (!c || c.fileId !== activeFile.id || !c.position || !c.position.lineNumber) return false;
      if (c.clientId && clientId && c.clientId === clientId) return false;
      if (!c.clientId && user?.id && c.senderId === user.id) return false;
      return true;
    });

    const newDecorations = [];

    relevantCursors.forEach((collab) => {
      const color = getCollabColor(collab.clientId || collab.senderId);
      const pos = collab.position;
      const sel = collab.selection;
      const name = collab.senderName || 'Collaborator';

      // Real-time colored blinking cursor pipe at collaborator's exact position
      newDecorations.push({
        range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
        options: {
          className: `remote-cursor-pipe remote-cursor-${color.name}`,
          hoverMessage: {
            value: `**${name}** is on line ${pos.lineNumber}, col ${pos.column}`
          },
          overviewRuler: {
            color: color.caret,
            position: monaco.editor.OverviewRulerLane.Right
          }
        }
      });

      // Subtle selection highlight if collaborator selected a text range
      if (
        sel &&
        (sel.startLineNumber !== sel.endLineNumber || sel.startColumn !== sel.endColumn)
      ) {
        newDecorations.push({
          range: new monaco.Range(
            sel.startLineNumber,
            sel.startColumn,
            sel.endLineNumber,
            sel.endColumn
          ),
          options: {
            className: `remote-selection remote-selection-${color.name}`
          }
        });
      }
    });

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
  }, [remoteCursors, activeFile, user?.id, clientId]);

  // Clean up decorations on unmount
  useEffect(() => {
    return () => {
      if (editorRef.current && decorationsRef.current.length > 0) {
        decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, []);
      }
    };
  }, []);

  if (!activeFile) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#121215',
        color: '#a1a1aa',
        fontSize: '0.9rem'
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

  const content = fileContents[activeFile.id] || '';
  const language = getLanguage(activeFile.name);

  const handleEditorWillMount = (monaco) => {
    setupIntelliSense(monaco);

    monaco.editor.defineTheme('mirage-obsidian-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '818cf8', fontStyle: 'bold' },
        { token: 'string', foreground: '10b981' },
        { token: 'number', foreground: 'f59e0b' },
        { token: 'comment', foreground: '71717a', fontStyle: 'italic' },
        { token: 'type', foreground: 'a855f7', fontStyle: 'bold' },
        { token: 'function', foreground: '06b6d4' },
        { token: 'variable', foreground: 'fafafa' }
      ],
      colors: {
        'editor.background': '#121215',
        'editor.foreground': '#fafafa',
        'editorCursor.foreground': '#818cf8',
        'editor.lineHighlightBackground': '#18181b',
        'editorLineNumber.foreground': '#52525b',
        'editorLineNumber.activeForeground': '#818cf8',
        'editor.selectionBackground': '#27272a',
        'editor.inactiveSelectionBackground': '#18181b',
        'editorIndentGuide.background': '#27272a',
        'editorIndentGuide.activeBackground': '#6366f1',
        // VS Code IntelliSense Widget Theme
        'editorSuggestWidget.background': '#18181b',
        'editorSuggestWidget.border': '#27272a',
        'editorSuggestWidget.foreground': '#f4f4f5',
        'editorSuggestWidget.selectedBackground': '#27272a',
        'editorSuggestWidget.highlightForeground': '#818cf8',
        'editorSuggestWidget.focusBorder': '#818cf8',
        'editorHoverWidget.background': '#18181b',
        'editorHoverWidget.border': '#27272a',
        'editorGhostText.foreground': 'rgba(161, 161, 170, 0.5)'
      }
    });
  };

  const handleEditorMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Immediately load content if already cached or available
    const currentId = activeFileRef.current?.id;
    if (currentId && fileContents[currentId] !== undefined) {
      const curContent = fileContents[currentId];
      if (editor.getValue() !== curContent) {
        isApplyingRemoteRef.current = true;
        editor.setValue(curContent);
        setTimeout(() => {
          isApplyingRemoteRef.current = false;
        }, 50);
      }
    }

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (canEdit) {
        saveCurrentFile();
      }
    });

    const sendPosition = () => {
      const curFile = activeFileRef.current;
      if (!curFile || !editor || !broadcastCursorPosition) return;
      const pos = editor.getPosition();
      const sel = editor.getSelection();
      if (pos) {
        broadcastCursorPosition(
          curFile.id,
          { lineNumber: pos.lineNumber, column: pos.column },
          sel ? {
            startLineNumber: sel.startLineNumber,
            startColumn: sel.startColumn,
            endLineNumber: sel.endLineNumber,
            endColumn: sel.endColumn
          } : null
        );
      }
    };

    // Smooth throttled position broadcast (~20fps)
    const onCursorChange = () => {
      if (throttleRef.current) return;
      throttleRef.current = setTimeout(() => {
        throttleRef.current = null;
        sendPosition();
      }, 50);
    };

    editor.onDidChangeCursorPosition(onCursorChange);
    editor.onDidChangeCursorSelection(onCursorChange);
  };

  return (
    <div style={{ flex: 1, width: '100%', height: '100%', backgroundColor: '#121215', overflow: 'hidden' }}>
      <Editor
        key={activeFile.id}
        height="100%"
        language={language}
        defaultValue={content}
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

          // VS Code Auto-Write & IntelliSense Engine
          quickSuggestions: {
            other: true,
            comments: false,
            strings: false
          },
          quickSuggestionsDelay: 40,
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: 'smart',
          tabCompletion: 'on',
          acceptSuggestionOnCommitCharacter: false,
          snippetSuggestions: 'inline',
          suggestSelection: 'first',
          wordBasedSuggestions: 'allDocuments',
          suggest: {
            preview: true,
            showWords: true,
            showSnippets: true,
            showFunctions: true,
            showKeywords: true,
            showVariables: true,
            showClasses: true,
            showMethods: true,
            showProperties: true,
            showConstants: true,
            showEnums: true,
            showInterfaces: true,
            showModules: true,
            showStructs: true,
            showEvents: true,
            showOperators: true,
            showUnits: true,
            showValues: true,
            showFolders: true,
            showFiles: true,
            showReferences: true,
            showColors: true,
            showTypeParameters: true,
            insertMode: 'insert',
            filterGraceful: true,
            shareSuggestSelections: true,
            localityBonus: true
          },
          parameterHints: {
            enabled: true,
            cycle: true
          },
          autoClosingBrackets: 'always',
          autoClosingQuotes: 'always',
          autoClosingDelete: 'always',
          autoClosingOvertype: 'always',
          autoSurround: 'languageDefined',
          formatOnType: true,
          formatOnPaste: true
        }}
        onChange={(value) => {
          if (isApplyingRemoteRef.current) return;
          if (canEdit && value !== undefined) {
            updateFileContent(activeFile.id, value, true);
          }
        }}
      />
    </div>
  );
}
