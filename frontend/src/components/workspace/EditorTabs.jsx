import React, { useContext } from 'react';
import { WorkspaceContext } from '../../context/WorkspaceContext';
import { X, FileCode } from 'lucide-react';

export default function EditorTabs() {
  const { openTabs, activeFile, openFile, closeTab, unsavedFiles } = useContext(WorkspaceContext);

  if (openTabs.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      backgroundColor: '#0f0c1b',
      borderBottom: '1px solid #332959',
      overflowX: 'auto',
      userSelect: 'none'
    }}>
      {openTabs.map((tab) => {
        const isActive = activeFile && activeFile.id === tab.id;
        const isUnsaved = unsavedFiles.has(tab.id);

        return (
          <div
            key={tab.id}
            onClick={() => openFile(tab)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.85rem',
              fontSize: '0.8125rem',
              fontFamily: 'Fira Code, monospace',
              color: isActive ? '#f3e8ff' : '#a78bfa',
              backgroundColor: isActive ? '#18132a' : '#0f0c1b',
              borderRight: '1px solid #241c3f',
              borderTop: isActive ? '2px solid #a855f7' : '2px solid transparent',
              cursor: 'pointer',
              boxShadow: isActive ? 'inset 0 1px 0 rgba(168, 85, 247, 0.4)' : 'none'
            }}
          >
            <FileCode size={13} color={isActive ? '#c084fc' : '#818cf8'} />
            <span>{tab.name}</span>
            
            {isUnsaved && (
              <span style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: '#fbbf24',
                boxShadow: '0 0 6px #fbbf24'
              }} />
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#7c3aed',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '1px',
                marginLeft: '0.25rem',
                borderRadius: '3px'
              }}
              title="Close tab"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
