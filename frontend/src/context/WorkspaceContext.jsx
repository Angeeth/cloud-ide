import React, { createContext, useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';

export const WorkspaceContext = createContext(null);

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

  traverse(nodes || []);
  return firstCodeFile || firstAnyFile;
};

export function WorkspaceProvider({ children }) {
  const [project, setProject] = useState(null);
  const [filesTree, setFilesTree] = useState([]);
  const [openTabs, setOpenTabs] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [fileContents, setFileContents] = useState({});
  const [unsavedFiles, setUnsavedFiles] = useState(new Set());
  const [historyList, setHistoryList] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState({});
  
  const [executionOutput, setExecutionOutput] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [presenceList, setPresenceList] = useState([]);
  
  const [chatMessages, setChatMessages] = useState([]);
  const collaborationWs = useRef(null);
  const chatWs = useRef(null);

  const openTabsRef = useRef(openTabs);
  const activeFileRef = useRef(activeFile);
  const projectRef = useRef(project);

  useEffect(() => {
    openTabsRef.current = openTabs;
  }, [openTabs]);

  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const loadProject = async (projectId) => {
    try {
      // Clear previous workspace state when switching/loading project
      setOpenTabs([]);
      setActiveFile(null);
      setFileContents({});
      setHistoryList([]);
      setRemoteCursors({});

      const [projRes, filesRes, chatRes, historyRes] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/projects/${projectId}/files`),
        api.get(`/projects/${projectId}/messages`),
        api.get(`/projects/${projectId}/history`).catch(() => ({ data: [] }))
      ]);

      setProject(projRes.data);
      setFilesTree(filesRes.data);
      setChatMessages(chatRes.data);
      setHistoryList(historyRes.data || []);
      
      const starterFile = findBestStarterFile(filesRes.data);
      if (starterFile) {
        openFile(starterFile);
      }
    } catch (err) {
      console.error('Failed to load project workspace', err);
      throw err;
    }
  };

  const refreshProject = async (targetProjectId = null) => {
    const pId = targetProjectId || projectRef.current?.id;
    if (!pId) return;
    try {
      const res = await api.get(`/projects/${pId}`);
      setProject(res.data);
    } catch (err) {
      console.error('Failed to refresh project metadata', err);
    }
  };

  const renameProject = async (newName) => {
    const pId = projectRef.current?.id;
    if (!pId) return;
    try {
      const res = await api.put(`/projects/${pId}`, { name: newName });
      const updatedName = res.data.name || newName;
      setProject((prev) => prev ? { ...prev, name: updatedName } : prev);

      if (collaborationWs.current && collaborationWs.current.readyState === WebSocket.OPEN) {
        collaborationWs.current.send(JSON.stringify({
          type: 'project_update',
          project_name: updatedName
        }));
      }
      return res.data;
    } catch (err) {
      console.error('Failed to rename project', err);
      throw err;
    }
  };

  const refreshFilesTree = async (broadcast = false, targetProjectId = null) => {
    const pId = targetProjectId || projectRef.current?.id;
    if (!pId) return;
    try {
      const res = await api.get(`/projects/${pId}/files`);
      setFilesTree(res.data);
      if (broadcast && collaborationWs.current && collaborationWs.current.readyState === WebSocket.OPEN) {
        collaborationWs.current.send(JSON.stringify({
          type: 'tree_update'
        }));
      }
    } catch (err) {
      console.error('Failed to refresh files tree', err);
    }
  };

  const fetchHistory = async (targetProjectId = null) => {
    const pId = targetProjectId || projectRef.current?.id;
    if (!pId) return;
    try {
      const res = await api.get(`/projects/${pId}/history`);
      setHistoryList(res.data || []);
    } catch (err) {
      console.error('Failed to fetch history', err);
    }
  };

  const reloadRestoredWorkspace = async (targetProjectId = null) => {
    const pId = targetProjectId || projectRef.current?.id;
    if (!pId) return;

    try {
      const [filesRes, historyRes] = await Promise.all([
        api.get(`/projects/${pId}/files`),
        api.get(`/projects/${pId}/history`).catch(() => ({ data: [] }))
      ]);

      const newTree = filesRes.data || [];
      setFilesTree(newTree);
      setHistoryList(historyRes.data || []);

      // Flatten new tree to lookup by file path
      const filesByPath = {};
      const traverse = (items) => {
        for (const item of items) {
          if (item.type === 'file') {
            filesByPath[item.path] = item;
          }
          if (item.children) traverse(item.children);
        }
      };
      traverse(newTree);

      // Re-map previously open tabs to the new file nodes by path
      const prevTabs = openTabsRef.current || [];
      const nextTabs = [];
      for (const tab of prevTabs) {
        if (filesByPath[tab.path]) {
          nextTabs.push(filesByPath[tab.path]);
        }
      }

      // Determine active tab
      const prevActive = activeFileRef.current;
      let nextActive = null;
      if (prevActive && filesByPath[prevActive.path]) {
        nextActive = filesByPath[prevActive.path];
      } else if (nextTabs.length > 0) {
        nextActive = nextTabs[0];
      } else {
        nextActive = findBestStarterFile(newTree);
        if (nextActive) {
          nextTabs.push(nextActive);
        }
      }

      // Fetch fresh content from file-service for all restored tabs
      const newContents = {};
      await Promise.all(
        nextTabs.map(async (tab) => {
          try {
            const fileRes = await api.get(`/files/${tab.id}`);
            newContents[tab.id] = fileRes.data.content || '';
          } catch (e) {
            console.error('Failed to reload content for tab', tab.path, e);
          }
        })
      );

      setOpenTabs(nextTabs);
      setActiveFile(nextActive);
      setFileContents(newContents);
      setUnsavedFiles(new Set());

      // Broadcast active file presence
      if (nextActive && collaborationWs.current && collaborationWs.current.readyState === WebSocket.OPEN) {
        collaborationWs.current.send(JSON.stringify({
          type: 'active_file',
          file_id: nextActive.id
        }));
      }
    } catch (err) {
      console.error('Failed to reload restored workspace', err);
    }
  };

  const createSnapshot = async (description) => {
    const pId = projectRef.current?.id;
    if (!pId) return;
    try {
      const res = await api.post(`/projects/${pId}/history`, {
        description: description || 'Manual Version Snapshot'
      });
      await fetchHistory(pId);

      if (collaborationWs.current && collaborationWs.current.readyState === WebSocket.OPEN) {
        collaborationWs.current.send(JSON.stringify({
          type: 'history_update'
        }));
      }
      return res.data;
    } catch (err) {
      console.error('Failed to create snapshot', err);
      throw err;
    }
  };

  const restoreVersion = async (versionId, versionNumber) => {
    const pId = projectRef.current?.id;
    if (!pId) return;
    try {
      const res = await api.post(`/projects/${pId}/history/restore`, { version_id: versionId });
      await reloadRestoredWorkspace(pId);

      if (collaborationWs.current && collaborationWs.current.readyState === WebSocket.OPEN) {
        collaborationWs.current.send(JSON.stringify({
          type: 'version_restored',
          version_number: versionNumber
        }));
      }
      return res.data;
    } catch (err) {
      console.error('Failed to restore version', err);
      throw err;
    }
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
        const users = data.users || [];
        setPresenceList(users);
        const onlineIds = new Set(users.map((u) => u.user_id));
        setRemoteCursors((prev) => {
          let changed = false;
          const next = {};
          for (const uid in prev) {
            if (onlineIds.has(uid)) {
              next[uid] = prev[uid];
            } else {
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      } else if (data.type === 'cursor_position') {
        setRemoteCursors((prev) => ({
          ...prev,
          [data.sender_id]: {
            fileId: data.file_id,
            position: data.position,
            selection: data.selection,
            senderId: data.sender_id,
            senderName: data.sender_name || `User ${data.sender_id ? data.sender_id.slice(0, 5) : ''}`,
            lastUpdated: Date.now()
          }
        }));
      } else if (data.type === 'file_change') {
        setFileContents((prev) => ({
          ...prev,
          [data.file_id]: data.content
        }));
      } else if (data.type === 'tree_update') {
        refreshFilesTree(false, projectId);
      } else if (data.type === 'history_update') {
        fetchHistory(projectId);
      } else if (data.type === 'version_restored') {
        reloadRestoredWorkspace(projectId);
      } else if (data.type === 'project_update') {
        if (data.project_name) {
          setProject((prev) => prev ? { ...prev, name: data.project_name } : prev);
        } else {
          refreshProject(projectId);
        }
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

  const broadcastCursorPosition = useCallback((fileId, position, selection = null) => {
    if (collaborationWs.current && collaborationWs.current.readyState === WebSocket.OPEN) {
      collaborationWs.current.send(JSON.stringify({
        type: 'cursor_position',
        file_id: fileId,
        position: position,
        selection: selection
      }));
    }
  }, []);

  return (
    <WorkspaceContext.Provider value={{
      project,
      filesTree,
      openTabs,
      activeFile,
      fileContents,
      unsavedFiles,
      historyList,
      remoteCursors,
      executionOutput,
      isExecuting,
      presenceList,
      chatMessages,
      loadProject,
      refreshProject,
      renameProject,
      refreshFilesTree,
      fetchHistory,
      createSnapshot,
      restoreVersion,
      reloadRestoredWorkspace,
      openFile,
      closeTab,
      updateFileContent,
      saveCurrentFile,
      runCode,
      connectWebSockets,
      disconnectWebSockets,
      sendChatMessage,
      broadcastCursorPosition
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}
