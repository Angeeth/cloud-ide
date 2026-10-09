import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

export const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ children }) {
  const [project, setProject] = useState(null);
  const [filesTree, setFilesTree] = useState([]);
  const [openTabs, setOpenTabs] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [fileContents, setFileContents] = useState({});
  const [unsavedFiles, setUnsavedFiles] = useState(new Set());
  
  const [executionOutput, setExecutionOutput] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [presenceList, setPresenceList] = useState([]);
  
  const [chatMessages, setChatMessages] = useState([]);
  const collaborationWs = useRef(null);
  const chatWs = useRef(null);

  const loadProject = async (projectId) => {
    try {
      // Clear previous workspace state when switching/loading project
      setOpenTabs([]);
      setActiveFile(null);
      setFileContents({});

      const [projRes, filesRes, chatRes] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/projects/${projectId}/files`),
        api.get(`/projects/${projectId}/messages`)
      ]);

      setProject(projRes.data);
      setFilesTree(filesRes.data);
      setChatMessages(chatRes.data);
      
      // Auto open first main file if available (prefer main.py/index.js over README)
      const findBestStarterFile = (nodes) => {
        let firstCodeFile = null;
        let firstAnyFile = null;

        const traverse = (items) => {
          for (const item of items) {
            if (item.type === 'file') {
              if (!firstAnyFile) firstAnyFile = item;
              if (item.name !== 'README.md' && !firstCodeFile) {
                firstCodeFile = item;
              }
            }
            if (item.children) traverse(item.children);
          }
        };

        traverse(nodes);
        return firstCodeFile || firstAnyFile;
      };

      const starterFile = findBestStarterFile(filesRes.data);
      if (starterFile) {
        openFile(starterFile);
      }
    } catch (err) {
      console.error('Failed to load project workspace', err);
      throw err;
    }
  };

  const refreshFilesTree = async () => {
    if (!project) return;
    const res = await api.get(`/projects/${project.id}/files`);
    setFilesTree(res.data);
  };

  const openFile = async (fileNode) => {
    if (!fileNode || fileNode.type !== 'file') return;
    
    // Check if tab already open inside state updater to prevent duplicate tabs
    setOpenTabs((prev) => {
      if (prev.some((t) => t.id === fileNode.id)) {
        return prev;
      }
      return [...prev, fileNode];
    });
    setActiveFile(fileNode);

    // Fetch content if not cached
    if (!(fileNode.id in fileContents)) {
      try {
        const res = await api.get(`/files/${fileNode.id}`);
        setFileContents((prev) => ({
          ...prev,
          [fileNode.id]: res.data.content || ''
        }));
      } catch (err) {
        console.error('Failed to fetch file content', err);
      }
    }

    // Broadcast active file presence
    if (collaborationWs.current && collaborationWs.current.readyState === WebSocket.OPEN) {
      collaborationWs.current.send(JSON.stringify({
        type: 'active_file',
        file_id: fileNode.id
      }));
    }
  };

  const closeTab = (fileId) => {
    setOpenTabs((prev) => {
      const newTabs = prev.filter((t) => t.id !== fileId);
      if (activeFile && activeFile.id === fileId) {
        setActiveFile(newTabs.length > 0 ? newTabs[newTabs.length - 1] : null);
      }
      return newTabs;
    });
  };

  const updateFileContent = (fileId, newContent, broadcast = true) => {
    setFileContents((prev) => ({
      ...prev,
      [fileId]: newContent
    }));
    setUnsavedFiles((prev) => new Set(prev).add(fileId));

    if (broadcast && collaborationWs.current && collaborationWs.current.readyState === WebSocket.OPEN) {
      collaborationWs.current.send(JSON.stringify({
        type: 'file_change',
        file_id: fileId,
        content: newContent
      }));
    }
  };

  const saveCurrentFile = async () => {
    if (!activeFile) return;
    const content = fileContents[activeFile.id] || '';
    try {
      await api.put(`/files/${activeFile.id}`, { content });
      setUnsavedFiles((prev) => {
        const next = new Set(prev);
        next.delete(activeFile.id);
        return next;
      });
    } catch (err) {
      console.error('Failed to save file', err);
      throw err;
    }
  };

  const runCode = async () => {
    if (!project) return;
    setIsExecuting(true);
    setExecutionOutput({ status: 'Running...', stdout: '', stderr: '', execution_time_ms: 0 });
    
    // Save current active file first if unsaved
    if (activeFile && unsavedFiles.has(activeFile.id)) {
      await saveCurrentFile();
    }

    try {
      const res = await api.post('/execute', { project_id: project.id });
      setExecutionOutput(res.data);
    } catch (err) {
      setExecutionOutput({
        status: 'ERROR',
        stdout: '',
        stderr: err.response?.data?.detail || 'Failed to execute code.',
        execution_time_ms: 0
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const connectWebSockets = (projectId) => {
    const token = localStorage.getItem('mirage_token');
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;

    // Collaboration WS
    const collabUrl = `${protocol}//${host}/ws/projects/${projectId}/collaboration?token=${token}`;
    const cWs = new WebSocket(collabUrl);

    cWs.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'presence_update') {
        setPresenceList(data.users || []);
      } else if (data.type === 'file_change') {
        setFileContents((prev) => ({
          ...prev,
          [data.file_id]: data.content
        }));
      }
    };
    collaborationWs.current = cWs;

    // Chat WS
    const chatUrl = `${protocol}//${host}/ws/projects/${projectId}/chat?token=${token}`;
    const chWs = new WebSocket(chatUrl);

    chWs.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'chat_message') {
        setChatMessages((prev) => [...prev, data]);
      }
    };
    chatWs.current = chWs;
  };

  const disconnectWebSockets = () => {
    if (collaborationWs.current) {
      collaborationWs.current.close();
      collaborationWs.current = null;
    }
    if (chatWs.current) {
      chatWs.current.close();
      chatWs.current = null;
    }
  };

  const sendChatMessage = (messageText) => {
    if (chatWs.current && chatWs.current.readyState === WebSocket.OPEN) {
      chatWs.current.send(JSON.stringify({ message: messageText }));
    }
  };

  return (
    <WorkspaceContext.Provider value={{
      project,
      filesTree,
      openTabs,
      activeFile,
      fileContents,
      unsavedFiles,
      executionOutput,
      isExecuting,
      presenceList,
      chatMessages,
      loadProject,
      refreshFilesTree,
      openFile,
      closeTab,
      updateFileContent,
      saveCurrentFile,
      runCode,
      connectWebSockets,
      disconnectWebSockets,
      sendChatMessage
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}
