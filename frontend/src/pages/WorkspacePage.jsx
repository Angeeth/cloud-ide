import React, { useEffect, useState, useContext, useRef } from 'react';
import { useParams } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import FileExplorer from '../components/workspace/FileExplorer';
import EditorTabs from '../components/workspace/EditorTabs';
import CodeEditor from '../components/workspace/CodeEditor';
import OutputPanel from '../components/workspace/OutputPanel';
import ChatPanel from '../components/workspace/ChatPanel';
import MemberList from '../components/workspace/MemberList';
import HistoryPanel from '../components/workspace/HistoryPanel';
import ShareModal from '../components/dashboard/ShareModal';
import UploadProjectModal from '../components/dashboard/UploadProjectModal';
import { WorkspaceContext } from '../context/WorkspaceContext';
import { MessageSquare, Users, History, X } from 'lucide-react';

export default function WorkspacePage() {
  const { id: projectId } = useParams();
  const {
    project,
    loadProject,
    refreshProject,
    connectWebSockets,
    disconnectWebSockets,
    saveCurrentFile,
    runCode,
    isExecuting,
    unsavedFiles,
    activeFile,
    refreshFilesTree
  } = useContext(WorkspaceContext);

  const [loading, setLoading] = useState(true);
  const [rightPanel, setRightPanel] = useState('chat'); // 'chat', 'members', 'history'
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // Dynamic Layout Resizing & Visibility States (Persisted in localStorage)
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = localStorage.getItem('mirage_left_width');
    return saved ? parseInt(saved, 10) : 260;
  });

  const [rightWidth, setRightWidth] = useState(() => {
    const saved = localStorage.getItem('mirage_right_width');
    return saved ? parseInt(saved, 10) : 300;
  });

  const [bottomHeight, setBottomHeight] = useState(() => {
    const saved = localStorage.getItem('mirage_bottom_height');
    return saved ? parseInt(saved, 10) : 220;
  });

  const [showLeft, setShowLeft] = useState(() => {
    const saved = localStorage.getItem('mirage_show_left');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [showRight, setShowRight] = useState(() => {
    const saved = localStorage.getItem('mirage_show_right');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [showBottom, setShowBottom] = useState(() => {
    const saved = localStorage.getItem('mirage_show_bottom');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [isDragging, setIsDragging] = useState(null); // 'left' | 'right' | 'bottom' | null
  const mainAreaRef = useRef(null);

  // Persist Visibility Changes
  const toggleLeft = () => {
    setShowLeft((prev) => {
      const next = !prev;
      localStorage.setItem('mirage_show_left', JSON.stringify(next));
      return next;
    });
  };

  const toggleRight = () => {
    setShowRight((prev) => {
      const next = !prev;
      localStorage.setItem('mirage_show_right', JSON.stringify(next));
      return next;
    });
  };

  const toggleBottom = () => {
    setShowBottom((prev) => {
      const next = !prev;
      localStorage.setItem('mirage_show_bottom', JSON.stringify(next));
      return next;
    });
  };

  // Drag Resizing Listeners
  const startResizing = (type) => (e) => {
    e.preventDefault();
    setIsDragging(type);

    const handleMouseMove = (moveEvent) => {
      if (type === 'left') {
        const newWidth = Math.max(160, Math.min(500, moveEvent.clientX));
        setLeftWidth(newWidth);
        localStorage.setItem('mirage_left_width', newWidth);
      } else if (type === 'right') {
        const newWidth = Math.max(180, Math.min(600, window.innerWidth - moveEvent.clientX));
        setRightWidth(newWidth);
        localStorage.setItem('mirage_right_width', newWidth);
      } else if (type === 'bottom') {
        if (mainAreaRef.current) {
          const rect = mainAreaRef.current.getBoundingClientRect();
          const newHeight = Math.max(80, Math.min(rect.height - 120, rect.bottom - moveEvent.clientY));
          setBottomHeight(newHeight);
          localStorage.setItem('mirage_bottom_height', newHeight);
        }
      }
    };

    const handleMouseUp = () => {
      setIsDragging(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    loadProject(projectId)
      .then(() => {
        if (isMounted) {
          connectWebSockets(projectId);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Workspace load error', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
      disconnectWebSockets();
    };
  }, [projectId]);

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        backgroundColor: '#0d1117',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#38bdf8',
        fontWeight: '600'
      }}>
        Initializing Mirage IDE Workspace...
      </div>
    );
  }

  const workspaceProps = {
    project,
    saveCurrentFile,
    runCode,
    isExecuting,
    unsavedFiles,
    activeFile,
    onOpenShare: () => setIsShareOpen(true),
    showLeft,
    showRight,
    showBottom,
    toggleLeft,
    toggleRight,
    toggleBottom
  };

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', backgroundColor: '#0d1117', overflow: 'hidden', userSelect: isDragging ? 'none' : 'auto' }}>
      <Navbar workspaceProps={workspaceProps} />

      {/* Main IDE Grid */}
      <div ref={mainAreaRef} style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        
        {/* Left Sidebar: File Explorer */}
        {showLeft && (
          <div style={{ width: `${leftWidth}px`, height: '100%', flexShrink: 0, overflow: 'hidden' }}>
            <FileExplorer onOpenUploadModal={() => setIsUploadOpen(true)} />
          </div>
        )}

        {/* Left Resizer Handle */}
        {showLeft && (
          <div
            onMouseDown={startResizing('left')}
            className={`layout-splitter-v ${isDragging === 'left' ? 'dragging' : ''}`}
            title="Drag to resize File Explorer"
          />
        )}

        {/* Center: Monaco Editor & Bottom Output Panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', minWidth: '200px' }}>
          <EditorTabs />
          
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <CodeEditor />
          </div>

          {/* Bottom Resizer Handle */}
          {showBottom && (
            <div
              onMouseDown={startResizing('bottom')}
              className={`layout-splitter-h ${isDragging === 'bottom' ? 'dragging' : ''}`}
              title="Drag to resize Output & Terminal panel"
            />
          )}

          {/* Bottom Output Panel */}
          {showBottom && (
            <div style={{ height: `${bottomHeight}px`, width: '100%', flexShrink: 0, overflow: 'hidden' }}>
              <OutputPanel />
            </div>
          )}
        </div>

        {/* Right Resizer Handle */}
        {showRight && (
          <div
            onMouseDown={startResizing('right')}
            className={`layout-splitter-v ${isDragging === 'right' ? 'dragging' : ''}`}
            title="Drag to resize Chat & Members panel"
          />
        )}

        {/* Right Sidebar: Chat, Members, History */}
        {showRight && (
          <div style={{ width: `${rightWidth}px`, height: '100%', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
            {/* Right panel toggle header */}
            <div style={{
              display: 'flex',
              backgroundColor: '#161b22',
              borderBottom: '1px solid #30363d',
              borderLeft: '1px solid #30363d'
            }}>
              <button
                onClick={() => setRightPanel('chat')}
                style={{
                  flex: 1,
                  padding: '0.4rem',
                  background: 'none',
                  border: 'none',
                  borderBottom: rightPanel === 'chat' ? '2px solid #38bdf8' : '2px solid transparent',
                  color: rightPanel === 'chat' ? '#f0f6fc' : '#8b949e',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem'
                }}
                title="Chat"
              >
                <MessageSquare size={13} />
                <span>Chat</span>
              </button>

              <button
                onClick={() => setRightPanel('members')}
                style={{
                  flex: 1,
                  padding: '0.4rem',
                  background: 'none',
                  border: 'none',
                  borderBottom: rightPanel === 'members' ? '2px solid #38bdf8' : '2px solid transparent',
                  color: rightPanel === 'members' ? '#f0f6fc' : '#8b949e',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem'
                }}
                title="Members"
              >
                <Users size={13} />
                <span>Members</span>
              </button>

              <button
                onClick={() => setRightPanel('history')}
                style={{
                  flex: 1,
                  padding: '0.4rem',
                  background: 'none',
                  border: 'none',
                  borderBottom: rightPanel === 'history' ? '2px solid #38bdf8' : '2px solid transparent',
                  color: rightPanel === 'history' ? '#f0f6fc' : '#8b949e',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem'
                }}
                title="History"
              >
                <History size={13} />
                <span>History</span>
              </button>

              <button
                onClick={toggleRight}
                style={{
                  padding: '0.4rem 0.6rem',
                  background: 'none',
                  border: 'none',
                  color: '#71717a',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Hide Panel"
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ flex: 1, overflow: 'hidden' }}>
              {rightPanel === 'chat' && <ChatPanel />}
              {rightPanel === 'members' && <MemberList />}
              {rightPanel === 'history' && <HistoryPanel />}
            </div>
          </div>
        )}

        {/* Dragging transparent overlay to prevent iframe / monaco text selection while resizing */}
        {isDragging && (
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            cursor: isDragging === 'bottom' ? 'row-resize' : 'col-resize'
          }} />
        )}
      </div>

      {/* Modals */}
      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        project={project}
        onMembersUpdated={() => refreshProject(projectId)}
      />

      <UploadProjectModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        projectId={projectId}
        onUploadSuccess={() => refreshFilesTree(true)}
      />
    </div>
  );
}
