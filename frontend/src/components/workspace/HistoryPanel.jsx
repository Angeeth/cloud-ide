import React, { useState, useEffect, useContext } from 'react';
import { WorkspaceContext } from '../../context/WorkspaceContext';
import api from '../../services/api';
import { History, Plus, RotateCcw } from 'lucide-react';

export default function HistoryPanel() {
  const { project, refreshFilesTree } = useContext(WorkspaceContext);
  const [historyList, setHistoryList] = useState([]);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchHistory = async () => {
    if (!project) return;
    try {
      const res = await api.get(`/projects/${project.id}/history`);
      setHistoryList(res.data);
    } catch (err) {
      console.error('Failed to fetch history', err);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [project]);

  const handleCreateSnapshot = async (e) => {
    e.preventDefault();
    if (!project) return;
    setLoading(true);
    try {
      await api.post(`/projects/${project.id}/history`, {
        description: description || 'Manual Version Snapshot'
      });
      setDescription('');
      fetchHistory();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to create version');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (versionId, versionNumber) => {
    if (!project) return;
    if (window.confirm(`Are you sure you want to restore project to Version ${versionNumber}? Unsaved changes will be lost.`)) {
      try {
        await api.post(`/projects/${project.id}/history/restore`, { version_id: versionId });
        alert(`Restored project to Version ${versionNumber}`);
        refreshFilesTree();
        fetchHistory();
      } catch (err) {
        alert(err.response?.data?.detail || 'Failed to restore version');
      }
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: '#0d1117',
      borderLeft: '1px solid #30363d'
    }}>
      <div style={{
        padding: '0.5rem 0.75rem',
        borderBottom: '1px solid #30363d',
        fontSize: '0.75rem',
        fontWeight: '700',
        textTransform: 'uppercase',
        color: '#8b949e',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        <History size={14} color="#38bdf8" />
        <span>PROJECT HISTORY</span>
      </div>

      {project?.user_role !== 'VIEWER' && (
        <form onSubmit={handleCreateSnapshot} style={{ padding: '0.5rem', borderBottom: '1px solid #30363d' }}>
          <input
            type="text"
            className="input-field"
            placeholder="Version description..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem', marginBottom: '0.35rem' }}
          />
          <button type="submit" className="btn btn-secondary" disabled={loading} style={{ width: '100%', padding: '0.35rem', fontSize: '0.75rem' }}>
            <Plus size={12} />
            <span>{loading ? 'Creating...' : 'Create Snapshot'}</span>
          </button>
        </form>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
        {historyList.length === 0 ? (
          <div style={{ color: '#6e7681', fontSize: '0.8rem', textAlign: 'center', marginTop: '2rem' }}>
            No history versions recorded.
          </div>
        ) : (
          historyList.map((ver) => (
            <div key={ver.id} style={{
              padding: '0.5rem',
              backgroundColor: '#161b22',
              borderRadius: '6px',
              border: '1px solid #21262d',
              marginBottom: '0.5rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span style={{ fontWeight: '600', color: '#38bdf8', fontSize: '0.8125rem' }}>
                  Version {ver.version_number}
                </span>
                <span style={{ fontSize: '0.7rem', color: '#8b949e' }}>
                  {new Date(ver.created_at).toLocaleDateString()} {new Date(ver.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#f0f6fc', marginBottom: '0.35rem' }}>
                {ver.description || 'Snapshot'}
              </p>
              
              {project?.user_role !== 'VIEWER' && (
                <button
                  onClick={() => handleRestore(ver.id, ver.version_number)}
                  className="btn btn-secondary"
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', width: '100%', marginTop: '0.25rem' }}
                >
                  <RotateCcw size={11} />
                  <span>Restore Version</span>
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
