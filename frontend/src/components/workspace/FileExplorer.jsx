import React, { useState, useContext } from 'react';
import { WorkspaceContext } from '../../context/WorkspaceContext';
import api from '../../services/api';
import { Folder, FileCode, ChevronRight, ChevronDown, Plus, FolderPlus, RefreshCw, Trash2, Edit2, Upload } from 'lucide-react';

function TreeNode({ node, level = 0 }) {
  const { openFile, activeFile, refreshFilesTree, project, unsavedFiles, renameFile } = useContext(WorkspaceContext);
  const [expanded, setExpanded] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);

  const isFolder = node.type === 'folder';
  const isActive = activeFile && activeFile.id === node.id;
  const isUnsaved = unsavedFiles.has(node.id);
  const canEdit = project?.user_role !== 'VIEWER';

  const handleClick = (e) => {
    e.stopPropagation();
    if (isRenaming) return;
    if (isFolder) {
      setExpanded(!expanded);
    } else {
      openFile(node);
    }
  };

  const handleStartRename = (e) => {
    e.stopPropagation();
    if (!canEdit) return;
    setRenameValue(node.name);
    setIsRenaming(true);
  };

  const handleRenameSubmit = async (e) => {
    if (e) e.preventDefault();
    const cleanName = renameValue.trim();
    if (!cleanName || cleanName === node.name) {
      setIsRenaming(false);
      setRenameValue(node.name);
      return;
    }
    try {
      await renameFile(node.id, cleanName);
      setIsRenaming(false);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to rename item');
      setRenameValue(node.name);
      setIsRenaming(false);
    }
  };

  const handleRenameKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameSubmit(e);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsRenaming(false);
      setRenameValue(node.name);
    }
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!canEdit) return;
    if (window.confirm(`Delete ${node.name}?`)) {
      try {
        await api.delete(`/files/${node.id}`);
        await refreshFilesTree(true);
      } catch (err) {
        alert('Failed to delete file');
      }
    }
  };

  return (
    <div>
      <div
        onClick={handleClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.25rem 0.5rem',
          paddingLeft: `${0.5 + level * 0.75}rem`,
          fontSize: '0.8125rem',
          color: isActive ? '#f0f6fc' : '#8b949e',
          backgroundColor: isActive ? '#21262d' : 'transparent',
          borderRadius: '4px',
          cursor: 'pointer',
          userSelect: 'none'
        }}
        onMouseEnter={() => setShowMenu(true)}
        onMouseLeave={() => setShowMenu(false)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', overflow: 'hidden', flex: 1 }}>
          {isFolder ? (
            expanded ? <ChevronDown size={14} color="#8b949e" /> : <ChevronRight size={14} color="#8b949e" />
          ) : (
            <span style={{ width: '14px' }} />
          )}

          {isFolder ? (
            <Folder size={14} color="#38bdf8" />
          ) : (
            <FileCode size={14} color="#a855f7" />
          )}

          {isRenaming ? (
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={handleRenameSubmit}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              onFocus={(e) => e.target.select()}
              style={{
                background: '#161b22',
                border: '1px solid #818cf8',
                borderRadius: '3px',
                color: '#fafafa',
                fontSize: '0.8125rem',
                fontFamily: isFolder ? 'inherit' : 'Fira Code, monospace',
                padding: '0.05rem 0.35rem',
                outline: 'none',
                width: '100%',
                maxWidth: '160px'
              }}
            />
          ) : (
            <span style={{
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              fontFamily: isFolder ? 'inherit' : 'Fira Code, monospace',
              fontWeight: isActive ? '600' : '400'
            }}>
              {node.name}
            </span>
          )}

          {isUnsaved && <span style={{ color: '#eab308', fontWeight: 'bold' }}>•</span>}
        </div>

        {showMenu && canEdit && !isRenaming && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
            <Edit2
              size={12}
              color="#a1a1aa"
              onClick={handleStartRename}
              title="Rename"
              style={{ cursor: 'pointer', transition: 'color 0.15s ease' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#818cf8'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#a1a1aa'}
            />
            <Trash2
              size={12}
              color="#ef4444"
              onClick={handleDelete}
              title="Delete"
              style={{ cursor: 'pointer' }}
            />
          </div>
        )}
      </div>

      {isFolder && expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileExplorer({ onOpenUploadModal }) {
  const { filesTree, refreshFilesTree, project } = useContext(WorkspaceContext);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createType, setCreateType] = useState('file'); // 'file' or 'folder'
  const [newItemName, setNewItemName] = useState('');
  const canEdit = project?.user_role !== 'VIEWER';

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    const rawInput = newItemName.trim();
    if (!rawInput || !project) return;
    
    try {
      // Strip leading and trailing slashes so path and name are clean
      const cleanPath = rawInput.replace(/^[\/\\]+|[\/\\]+$/g, '');
      const parts = cleanPath.split(/[\/\\]+/);
      const name = parts[parts.length - 1];

      await api.post(`/projects/${project.id}/files`, {
        name: name,
        path: cleanPath,
        type: createType,
        content: createType === 'file' ? '' : undefined
      });
      setNewItemName('');
      setShowCreateModal(false);
      await refreshFilesTree(true);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to create item');
    }
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: '#0d1117',
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid #30363d'
    }}>
      {/* Header bar */}
      <div style={{
        padding: '0.5rem 0.75rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #30363d',
        fontSize: '0.75rem',
        fontWeight: '700',
        textTransform: 'uppercase',
        color: '#8b949e',
        letterSpacing: '0.05em'
      }}>
        <span>EXPLORER</span>
        {canEdit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <button
              onClick={() => { setCreateType('file'); setShowCreateModal(true); }}
              style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer' }}
              title="New File"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={() => { setCreateType('folder'); setShowCreateModal(true); }}
              style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer' }}
              title="New Folder"
            >
              <FolderPlus size={14} />
            </button>
            <button
              onClick={onOpenUploadModal}
              style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer' }}
              title="Import Local Folder / Zip"
            >
              <Upload size={14} />
            </button>
            <button
              onClick={refreshFilesTree}
              style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer' }}
              title="Refresh Explorer"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Tree view list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.25rem' }}>
        {filesTree.length === 0 ? (
          <div style={{ padding: '1rem', color: '#6e7681', fontSize: '0.8rem', textAlign: 'center' }}>
            No files in project
          </div>
        ) : (
          filesTree.map((node) => <TreeNode key={node.id} node={node} />)
        )}
      </div>

      {/* Inline item creation dialog */}
      {showCreateModal && (
        <form onSubmit={handleCreateSubmit} style={{ padding: '0.75rem', borderTop: '1px solid #30363d', backgroundColor: '#161b22' }}>
          <div style={{ fontSize: '0.75rem', color: '#38bdf8', marginBottom: '0.5rem', fontWeight: '600' }}>
            New {createType === 'file' ? 'File' : 'Folder'}
          </div>
          <input
            type="text"
            className="input-field"
            placeholder={createType === 'file' ? 'e.g., src/utils.py' : 'e.g., tests'}
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            autoFocus
            style={{ marginBottom: '0.5rem', fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
          />
          <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setShowCreateModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}>
              Create
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
