import React, { useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import Logo from './Logo';
import { Play, Save, Share2, LogOut, Home, User, PanelLeft, PanelBottom, PanelRight } from 'lucide-react';

export default function Navbar({ workspaceProps }) {
  const { user, logout } = useContext(AuthContext);
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

  const isUnsaved = activeFile && unsavedFiles?.has(activeFile.id);
  const canEdit = project?.user_role !== 'VIEWER';

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
            <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#818cf8' }}>
              {project.name}
            </span>
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
              style={{ height: '34px', padding: '0 0.85rem', fontSize: '0.8rem' }}
              title="Invite members"
            >
              <Share2 size={14} color="#a855f7" />
              <span>Share</span>
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {/* Layout Toggle Buttons (VS Code Style) */}
        {isWorkspace && toggleLeft && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', backgroundColor: '#18181b', padding: '3px', borderRadius: '6px', border: '1px solid #27272a', marginRight: '0.5rem' }}>
            <button
              onClick={toggleLeft}
              style={{
                background: showLeft ? '#27272a' : 'transparent',
                border: 'none',
                color: showLeft ? '#ffffff' : '#71717a',
                padding: '4px 6px',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Toggle Primary Sidebar (Explorer)"
            >
              <PanelLeft size={16} />
            </button>
            <button
              onClick={toggleBottom}
              style={{
                background: showBottom ? '#27272a' : 'transparent',
                border: 'none',
                color: showBottom ? '#ffffff' : '#71717a',
                padding: '4px 6px',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Toggle Bottom Panel (Output & Terminal)"
            >
              <PanelBottom size={16} />
            </button>
            <button
              onClick={toggleRight}
              style={{
                background: showRight ? '#27272a' : 'transparent',
                border: 'none',
                color: showRight ? '#ffffff' : '#71717a',
                padding: '4px 6px',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Toggle Secondary Sidebar (Chat & Members)"
            >
              <PanelRight size={16} />
            </button>
          </div>
        )}

        <Link to="/dashboard" style={{ color: '#a1a1aa', display: 'flex', alignItems: 'center' }} title="Dashboard">
          <Home size={19} />
        </Link>
        <Link to="/profile" style={{ color: '#a1a1aa', display: 'flex', alignItems: 'center' }} title="Profile">
          <User size={19} />
        </Link>
        {user && (
          <button
            onClick={() => { logout(); navigate('/login'); }}
            style={{ background: 'none', border: 'none', color: '#f43f5e', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            title="Logout"
          >
            <LogOut size={19} />
          </button>
        )}
      </div>
    </nav>
  );
}
