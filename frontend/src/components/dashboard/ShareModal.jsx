import React, { useState } from 'react';
import api from '../../services/api';
import { Share2, UserPlus, X, Trash2 } from 'lucide-react';

export default function ShareModal({ isOpen, onClose, project, onMembersUpdated }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('EDITOR');
  const [loading, setLoading] = useState(false);

  if (!isOpen || !project) return null;

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    try {
      await api.post(`/projects/${project.id}/members`, {
        email: email.trim().toLowerCase(),
        role
      });
      setEmail('');
      onMembersUpdated();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to add member');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.put(`/projects/${project.id}/members/${userId}`, { role: newRole });
      onMembersUpdated();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update member role');
    }
  };

  const handleRemoveMember = async (userId, name) => {
    if (window.confirm(`Remove ${name} from project?`)) {
      try {
        await api.delete(`/projects/${project.id}/members/${userId}`);
        onMembersUpdated();
      } catch (err) {
        alert(err.response?.data?.detail || 'Failed to remove member');
      }
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: '#161b22',
        border: '1px solid #30363d',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '540px',
        padding: '1.5rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Share2 size={22} color="#a855f7" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#f0f6fc' }}>Share Project</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Invite Form */}
        <form onSubmit={handleInvite} style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', color: '#f0f6fc', marginBottom: '0.35rem' }}>
            Invite Collaborator by Email
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="email"
              className="input-field"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ flex: 1 }}
            />
            <select
              className="input-field"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{ width: '110px' }}
            >
              <option value="EDITOR">EDITOR</option>
              <option value="VIEWER">VIEWER</option>
            </select>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <UserPlus size={16} />
              <span>Send</span>
            </button>
          </div>
        </form>

        {/* Member List */}
        <div>
          <h3 style={{ fontSize: '0.9rem', fontWeight: '600', color: '#8b949e', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Project Members ({project.members?.length || 0})
          </h3>
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {project.members?.map((m) => (
              <div key={m.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.5rem 0.75rem',
                backgroundColor: '#0d1117',
                borderRadius: '6px',
                marginBottom: '0.4rem'
              }}>
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#f0f6fc' }}>
                    {m.user?.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#8b949e' }}>
                    {m.user?.email}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {m.role === 'OWNER' ? (
                    <span className="badge badge-owner">OWNER</span>
                  ) : (
                    <>
                      <select
                        className="input-field"
                        value={m.role}
                        onChange={(e) => handleRoleChange(m.user_id, e.target.value)}
                        style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', width: '90px' }}
                      >
                        <option value="EDITOR">EDITOR</option>
                        <option value="VIEWER">VIEWER</option>
                      </select>

                      <button
                        onClick={() => handleRemoveMember(m.user_id, m.user?.name)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                        title="Remove member"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
