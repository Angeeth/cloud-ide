import React, { useContext } from 'react';
import Editor from '@monaco-editor/react';
import { WorkspaceContext } from '../../context/WorkspaceContext';
import Logo from '../common/Logo';

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

export default function CodeEditor() {
  const { activeFile, fileContents, updateFileContent, saveCurrentFile, project } = useContext(WorkspaceContext);
  const canEdit = project?.user_role !== 'VIEWER';

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
        'editorIndentGuide.activeBackground': '#6366f1'
      }
    });
  };

  const handleEditorMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (canEdit) {
        saveCurrentFile();
      }
    });
  };

  return (
    <div style={{ flex: 1, width: '100%', height: '100%', backgroundColor: '#121215', overflow: 'hidden' }}>
      <Editor
        height="100%"
        language={language}
        value={content}
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
          cursorSmoothCaretAnimation: 'on'
        }}
        onChange={(value) => {
          if (canEdit && value !== undefined) {
            updateFileContent(activeFile.id, value, true);
          }
        }}
      />
    </div>
  );
}
