import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderGit2, Calendar, User, Trash2, ExternalLink } from 'lucide-react';

export default function ProjectCard({ project, onDelete }) {
  const navigate = useNavigate();

  return (
    <div style={{
      backgroundColor: '#161b22',
      border: '1px solid #30363d',
      borderRadius: '8px',
      padding: '1.25rem',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      transition: 'border-color 0.15s ease',
      cursor: 'pointer'
    }}
    onMouseEnter={(e) => e.currentTarget.style.borderColor = '#38bdf8'}
    onMouseLeave={(e) => e.currentTarget.style.borderColor = '#30363d'}
    onClick={() => navigate(`/projects/${project.id}`)}
    >
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FolderGit2 size={20} color="#38bdf8" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#f0f6fc' }}>
              {project.name}
            </h3>
          </div>
          <span className={`badge badge-${project.user_role?.toLowerCase() || 'editor'}`}>
            {project.user_role || 'EDITOR'}
          </span>
        </div>

        <p style={{ fontSize: '0.85rem', color: '#8b949e', marginBottom: '1rem', minHeight: '40px' }}>
          {project.description || 'No description provided.'}
        </p>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6e7681', borderTop: '1px solid #21262d', paddingTop: '0.75rem', marginBottom: '0.75rem' }}>
          <span style={{ textTransform: 'capitalize', color: '#a855f7', fontWeight: '600' }}>
            {project.language}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Calendar size={12} />
            <span>{new Date(project.updated_at).toLocaleDateString()}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="btn btn-primary"
            style={{ flex: 1, padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/projects/${project.id}`);
            }}
          >
            <ExternalLink size={14} />
            <span>Open IDE</span>
          </button>

          {project.user_role === 'OWNER' && (
            <button
              className="btn btn-danger"
              style={{ padding: '0.4rem 0.6rem' }}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(project.id, project.name);
              }}
              title="Delete project"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
