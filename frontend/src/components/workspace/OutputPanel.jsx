import React, { useState, useContext, useEffect, useRef } from 'react';
import { WorkspaceContext } from '../../context/WorkspaceContext';
import api from '../../services/api';
import { Terminal as TerminalIcon, Clock, CheckCircle, XCircle, Play } from 'lucide-react';

export default function OutputPanel() {
  const { executionOutput, isExecuting, project } = useContext(WorkspaceContext);
  const [activeTab, setActiveTab] = useState('output'); // 'output', 'terminal', 'history'
  
  // Terminal State
  const [terminalHistory, setTerminalHistory] = useState([
    { type: 'sys', text: 'Mirage Terminal v1.0. Type "help" for a list of commands.' }
  ]);
  const [currentInput, setCurrentInput] = useState('');
  const [isExecTerminal, setIsExecTerminal] = useState(false);
  
  const terminalInputRef = useRef(null);
  const terminalScrollRef = useRef(null);

  // History State
  const [historyList, setHistoryList] = useState([]);

  useEffect(() => {
    if (activeTab === 'history' && project) {
      api.get(`/projects/${project.id}/executions`)
        .then((res) => setHistoryList(res.data))
        .catch((err) => console.error('Failed to fetch execution history', err));
    }
  }, [activeTab, project, executionOutput]);

  useEffect(() => {
    if (activeTab === 'terminal') {
      terminalScrollRef.current?.scrollTo({
        top: terminalScrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
      terminalInputRef.current?.focus();
    }
  }, [terminalHistory, activeTab, currentInput]);

  const handleTerminalSubmit = async (e) => {
    e.preventDefault();
    const cmd = currentInput.trim();
    if (!cmd || !project) return;

    const newHistory = [...terminalHistory, { type: 'cmd', text: cmd }];
    setTerminalHistory(newHistory);
    setCurrentInput('');

    if (cmd === 'clear') {
      setTerminalHistory([]);
      return;
    }

    setIsExecTerminal(true);
    try {
      const res = await api.post(`/projects/${project.id}/terminal`, { command: cmd });
      if (res.data.clear) {
        setTerminalHistory([]);
      } else {
        setTerminalHistory((prev) => [
          ...prev,
          { type: 'out', text: res.data.output, exitCode: res.data.exit_code }
        ]);
      }
    } catch (err) {
      setTerminalHistory((prev) => [
        ...prev,
        { type: 'err', text: err.response?.data?.detail || 'Terminal command failed.' }
      ]);
    } finally {
      setIsExecTerminal(false);
    }
  };

  const handleTerminalClick = () => {
    terminalInputRef.current?.focus();
  };

  return (
    <div style={{
      height: '100%',
      width: '100%',
      backgroundColor: '#09090b',
      borderTop: '1px solid #27272a',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Panel header tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#121215',
        borderBottom: '1px solid #27272a',
        padding: '0 0.5rem'
      }}>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            onClick={() => setActiveTab('output')}
            style={{
              padding: '0.4rem 0.85rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'output' ? '2px solid #818cf8' : '2px solid transparent',
              color: activeTab === 'output' ? '#fafafa' : '#a1a1aa',
              fontSize: '0.75rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <Play size={13} color="#10b981" />
            <span>OUTPUT</span>
          </button>

          <button
            onClick={() => setActiveTab('terminal')}
            style={{
              padding: '0.4rem 0.85rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'terminal' ? '2px solid #818cf8' : '2px solid transparent',
              color: activeTab === 'terminal' ? '#fafafa' : '#a1a1aa',
              fontSize: '0.75rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <TerminalIcon size={13} color="#818cf8" />
            <span>TERMINAL</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            style={{
              padding: '0.4rem 0.85rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'history' ? '2px solid #818cf8' : '2px solid transparent',
              color: activeTab === 'history' ? '#fafafa' : '#a1a1aa',
              fontSize: '0.75rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <Clock size={13} color="#a855f7" />
            <span>EXECUTION HISTORY</span>
          </button>
        </div>

        {executionOutput && activeTab === 'output' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.75rem', color: '#a1a1aa' }}>
            <span>Time: {executionOutput.execution_time_ms ? `${executionOutput.execution_time_ms}ms` : '0ms'}</span>
            <span>Exit Code: {executionOutput.exit_code ?? 0}</span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              color: executionOutput.status === 'SUCCESS' ? '#10b981' : '#f43f5e',
              fontWeight: '600'
            }}>
              {executionOutput.status === 'SUCCESS' ? <CheckCircle size={13} /> : <XCircle size={13} />}
              {executionOutput.status}
            </span>
          </div>
        )}
      </div>

      {/* Tab content body */}
      <div style={{ flex: 1, padding: '0.6rem 0.75rem', overflow: 'hidden', fontFamily: 'Fira Code, monospace', fontSize: '0.8125rem' }}>
        {activeTab === 'output' && (
          <div style={{ height: '100%', overflowY: 'auto' }}>
            {isExecuting ? (
              <div style={{ color: '#f59e0b' }}>Running Docker execution container...</div>
            ) : executionOutput ? (
              <div>
                {executionOutput.stdout && (
                  <pre style={{ color: '#10b981', whiteSpace: 'pre-wrap', margin: 0 }}>
                    {executionOutput.stdout}
                  </pre>
                )}
                {executionOutput.stderr && (
                  <pre style={{ color: '#f43f5e', whiteSpace: 'pre-wrap', margin: 0, marginTop: '0.5rem' }}>
                    {executionOutput.stderr}
                  </pre>
                )}
                {!executionOutput.stdout && !executionOutput.stderr && (
                  <div style={{ color: '#71717a' }}>[Process completed with no output]</div>
                )}
              </div>
            ) : (
              <div style={{ color: '#71717a' }}>
                Click <strong>RUN</strong> to execute current project code in Docker sandbox.
              </div>
            )}
          </div>
        )}

        {/* Authentic VS Code Integrated Terminal */}
        {activeTab === 'terminal' && (
          <div
            onClick={handleTerminalClick}
            ref={terminalScrollRef}
            style={{
              height: '100%',
              overflowY: 'auto',
              backgroundColor: '#09090b',
              cursor: 'text',
              paddingRight: '0.5rem'
            }}
          >
            {terminalHistory.map((item, idx) => (
              <div key={idx} style={{ marginBottom: '0.25rem', lineHeight: 1.4 }}>
                {item.type === 'sys' && (
                  <div style={{ color: '#6366f1' }}>{item.text}</div>
                )}
                {item.type === 'cmd' && (
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ color: '#10b981', fontWeight: '600', marginRight: '0.5rem' }}>
                      mirage@cloud-ide:~/workspace$
                    </span>
                    <span style={{ color: '#fafafa' }}>{item.text}</span>
                  </div>
                )}
                {item.type === 'out' && (
                  <pre style={{
                    color: item.exitCode === 0 ? '#d4d4d8' : '#f43f5e',
                    whiteSpace: 'pre-wrap',
                    margin: 0,
                    fontFamily: 'inherit',
                    fontSize: 'inherit'
                  }}>
                    {item.text}
                  </pre>
                )}
                {item.type === 'err' && (
                  <pre style={{ color: '#f43f5e', whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: 'inherit' }}>
                    {item.text}
                  </pre>
                )}
              </div>
            ))}

            {/* Continuous Inline Terminal Prompt Line */}
            <form onSubmit={handleTerminalSubmit} style={{ display: 'flex', alignItems: 'center', margin: 0, padding: 0 }}>
              <span style={{ color: '#10b981', fontWeight: '600', marginRight: '0.5rem', whiteSpace: 'nowrap' }}>
                mirage@cloud-ide:~/workspace$
              </span>
              <input
                ref={terminalInputRef}
                type="text"
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                disabled={isExecTerminal}
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  color: '#fafafa',
                  fontFamily: 'Fira Code, monospace',
                  fontSize: '0.8125rem',
                  padding: 0,
                  margin: 0
                }}
                autoFocus
              />
            </form>
          </div>
        )}

        {activeTab === 'history' && (
          <div style={{ height: '100%', overflowY: 'auto' }}>
            {historyList.length === 0 ? (
              <div style={{ color: '#71717a' }}>No execution history recorded yet.</div>
            ) : (
              historyList.map((item) => (
                <div key={item.id} style={{
                  padding: '0.4rem 0',
                  borderBottom: '1px solid #18181b',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <span style={{ color: item.status === 'SUCCESS' ? '#10b981' : '#f43f5e', fontWeight: '600', marginRight: '0.5rem' }}>
                      [{item.status}]
                    </span>
                    <span style={{ color: '#fafafa' }}>{item.language}</span>
                    <span style={{ color: '#a1a1aa', marginLeft: '0.5rem' }}>({item.execution_time_ms}ms)</span>
                  </div>
                  <span style={{ color: '#71717a', fontSize: '0.75rem' }}>
                    {new Date(item.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
