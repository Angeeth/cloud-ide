import React, { useContext, useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { WorkspaceContext } from '../../context/WorkspaceContext';
import Logo from './Logo';
import { Play, Save, Share2, LogOut, Home, User, PanelLeft, PanelBottom, PanelRight, Check, X } from 'lucide-react';

export default function Navbar({ workspaceProps }) {
  const { user, logout } = useContext(AuthContext);
  const workspaceContext = useContext(WorkspaceContext);
  const navigate = useNavigate();

  const isWorkspace = !!workspaceProps;
  const {
    project,
    saveCurrentFile,
    runCode,
    isExecuting,
    unsavedFiles,
    activeFile,
    onOpenShare,
    showLeft,
    showRight,
    showBottom,
    toggleLeft,
    toggleRight,
    toggleBottom
  } = workspaceProps || {};

  const renameProject = workspaceContext?.renameProject;

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [isNameHovered, setIsNameHovered] = useState(false);
  const nameInputRef = useRef(null);

  const isUnsaved = activeFile && unsavedFiles?.has(activeFile.id);
  const canEdit = project?.user_role !== 'VIEWER';

  const handleStartEditing = () => {
    if (!canEdit) return;
    setNameInput(project?.name || '');
    setIsEditingName(true);
  };

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === project?.name) {
      setIsEditingName(false);
      return;
    }
    setIsSavingName(true);
    try {
      if (renameProject) {
        await renameProject(trimmed);
      }
      setIsEditingName(false);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to rename project');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleCancelEditing = () => {
    setIsEditingName(false);
    setNameInput(project?.name || '');
  };

  const handleKeyDownName = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveName();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEditing();
    }
  };

  return (
    <nav style={{
      height: '50px',
      backgroundColor: '#121215',
      borderBottom: '1px solid #27272a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 1.25rem',
      userSelect: 'none'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Link to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', textDecoration: 'none' }}>
          <Logo size={32} />
          <span style={{ fontWeight: '700', color: '#ffffff', fontSize: '1.05rem', letterSpacing: '-0.02em' }}>
            Mirage IDE
          </span>
        </Link>

        {isWorkspace && project && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', paddingLeft: '0.85rem', borderLeft: '1px solid #27272a' }}>
            {isEditingName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={handleKeyDownName}
                  onBlur={handleSaveName}
                  disabled={isSavingName}
                  style={{
                    backgroundColor: '#161b22',
                    border: '1px solid #818cf8',
                    borderRadius: '4px',
                    color: '#f0f6fc',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    padding: '2px 8px',
                    outline: 'none',
                    minWidth: '150px',
                    maxWidth: '260px'
                  }}
                />
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleSaveName(); }}
                  disabled={isSavingName}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#10b981',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px'
                  }}
                  title="Save name"
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleCancelEditing(); }}
                  disabled={isSavingName}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ef4444',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px'
                  }}
                  title="Cancel"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  cursor: canEdit ? 'pointer' : 'default',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: isNameHovered && canEdit ? 'rgba(129, 140, 248, 0.1)' : 'transparent',
                  transition: 'background-color 0.15s ease'
                }}
                onMouseEnter={() => setIsNameHovered(true)}
                onMouseLeave={() => setIsNameHovered(false)}
                onDoubleClick={handleStartEditing}
                title={canEdit ? 'Double-click or click pencil to rename' : undefined}
              >
                <span style={{
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  color: isNameHovered && canEdit ? '#a5b4fc' : '#818cf8',
                  textDecoration: isNameHovered && canEdit ? 'underline' : 'none',
                  textUnderlineOffset: '3px'
                }}>
                  {project.name}
                </span>

                {canEdit && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEditing();
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: isNameHovered ? '#818cf8' : '#71717a',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '2px',
                      opacity: isNameHovered ? 1 : 0.6,
                      transition: 'opacity 0.15s ease, color 0.15s ease'
                    }}
                    title="Rename project"
                  >
                  </button>
                )}
              </div>
            )}

            <span className={`badge badge-${project.user_role?.toLowerCase() || 'editor'}`}>
              {project.user_role || 'EDITOR'}
            </span>
          </div>
        )}
      </div>

      {isWorkspace && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {canEdit && (
            <button
              onClick={saveCurrentFile}
              disabled={!activeFile}
              className="btn btn-secondary"
              style={{
                height: '34px',
                padding: '0 0.85rem',
                fontSize: '0.8rem',
                opacity: activeFile ? 1 : 0.5
              }}
              title="Save file (Ctrl+S)"
            >
              <Save size={14} color={isUnsaved ? '#f59e0b' : '#818cf8'} />
              <span>{isUnsaved ? 'Unsaved*' : 'Saved'}</span>
            </button>
          )}

          {canEdit && (
            <button
              onClick={runCode}
              disabled={isExecuting}
              className="btn btn-primary"
              style={{
                height: '34px',
                padding: '0 1rem',
                fontSize: '0.8rem'
              }}
              title="Run project code"
            >
              <Play size={14} fill="#09090b" color="#09090b" />
              <span>{isExecuting ? 'Executing...' : 'RUN'}</span>
            </button>
          )}

          {project?.user_role === 'OWNER' && (
            <button
              onClick={onOpenShare}
              className="btn btn-secondary"
              style={{
                height: '34px',
                padding: '0 0.85rem',
                fontSize: '0.8rem'
              }}
              title="Invite collaborators"
            >
              <Share2 size={14} color="#a855f7" />
              <span>Share</span>
            </button>
          )}

          {/* VS Code Style Panel Toggle Controls */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#18181b',
            borderRadius: '6px',
            border: '1px solid #27272a',
            padding: '2px',
            marginLeft: '0.25rem'
          }}>
            <button
              onClick={toggleLeft}
              style={{
                background: showLeft ? '#27272a' : 'transparent',
                border: 'none',
                color: showLeft ? '#fafafa' : '#71717a',
                padding: '4px 6px',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Toggle Primary Side Bar (Explorer)"
            >
              <PanelLeft size={14} />
            </button>
            <button
              onClick={toggleBottom}
              style={{
                background: showBottom ? '#27272a' : 'transparent',
                border: 'none',
                color: showBottom ? '#fafafa' : '#71717a',
                padding: '4px 6px',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Toggle Panel (Terminal / Output)"
            >
              <PanelBottom size={14} />
            </button>
            <button
              onClick={toggleRight}
              style={{
                background: showRight ? '#27272a' : 'transparent',
                border: 'none',
                color: showRight ? '#fafafa' : '#71717a',
                padding: '4px 6px',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Toggle Secondary Side Bar (Chat / Members / History)"
            >
              <PanelRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* User profile & Logout */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Link
          to="/profile"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            color: '#a1a1aa',
            textDecoration: 'none',
            fontSize: '0.85rem'
          }}
        >
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            backgroundColor: '#818cf8',
            color: '#09090b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: '700',
            fontSize: '0.8rem'
          }}>
            {user?.name ? user.name[0].toUpperCase() : 'U'}
          </div>
          <span style={{ color: '#fafafa', fontWeight: '500' }}>{user?.name || 'Developer'}</span>
        </Link>

        <button
          onClick={logout}
          style={{
            background: 'none',
            border: 'none',
            color: '#71717a',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: '4px'
          }}
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </nav>
  );
}
