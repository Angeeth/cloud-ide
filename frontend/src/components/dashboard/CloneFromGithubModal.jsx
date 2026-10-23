import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { GitBranch, X, Loader2, Github } from 'lucide-react';

export default function CloneFromGithubModal({ isOpen, onClose, onProjectCloned }) {
  const [repoUrl, setRepoUrl] = useState('');
  const [customName, setCustomName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!repoUrl.trim()) {
      setError('Please enter a GitHub repository URL.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.post('/projects/clone-github', {
        repo_url: repoUrl.trim(),
        name: customName.trim() || undefined
      });

      if (onProjectCloned) {
        onProjectCloned(res.data);
      }
      onClose();
      navigate(`/projects/${res.data.id}`);
    } catch (err) {
      const serverError = err.response?.data?.detail || err.response?.data?.message || err.message;
      let errorMessage = 'Failed to clone repository. Make sure the repository is public and the URL is correct.';
      if (typeof serverError === 'string') {
        errorMessage = serverError;
      } else if (Array.isArray(serverError)) {
        errorMessage = serverError.map(e => e.msg || (typeof e === 'string' ? e : JSON.stringify(e))).join(', ');
      } else if (serverError && typeof serverError === 'object') {
        errorMessage = JSON.stringify(serverError);
      }
      setError(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: '#121215',
        border: '1px solid #27272a',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '500px',
        padding: '1.75rem',
        boxShadow: 'var(--shadow-lg)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              backgroundColor: '#18181b',
              border: '1px solid #27272a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Github size={18} color="#fafafa" />
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#fafafa' }}>
              Clone from GitHub
            </h2>
          </div>
          <button onClick={onClose} disabled={loading} style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {error && (
          <div style={{
            backgroundColor: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            borderRadius: '8px',
            padding: '0.75rem',
            color: '#f43f5e',
            fontSize: '0.85rem',
            marginBottom: '1rem'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.15rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', color: '#fafafa', marginBottom: '0.4rem' }}>
              Repository URL *
            </label>
            <input
              type="url"
              className="input-field"
              placeholder="https://github.com/username/repository.git"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              required
              disabled={loading}
              autoFocus
            />
            <span style={{ fontSize: '0.75rem', color: '#71717a', display: 'block', marginTop: '0.35rem' }}>
              Paste any public GitHub repository HTTPS URL.
            </span>
          </div>

          <div style={{ marginBottom: '1.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', color: '#fafafa', marginBottom: '0.4rem' }}>
              Project Name (Optional)
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="Auto-detected from repository name..."
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Cloning Repo...</span>
                </>
              ) : (
                <>
                  <GitBranch size={15} />
                  <span>Clone Repository</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
