import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import ProjectCard from '../components/dashboard/ProjectCard';
import CreateProjectModal from '../components/dashboard/CreateProjectModal';
import UploadProjectModal from '../components/dashboard/UploadProjectModal';
import CloneFromGithubModal from '../components/dashboard/CloneFromGithubModal';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';
import { Plus, Upload, Search, FolderGit2, GitBranch } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isCloneOpen, setIsCloneOpen] = useState(false);
  const [targetUploadProjectId, setTargetUploadProjectId] = useState(null);

  const fetchProjects = async () => {
    try {
      const res = await api.get('/projects');
      setProjects(res.data);
    } catch (err) {
      console.error('Failed to fetch projects', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleDeleteProject = async (projectId, projectName) => {
    if (window.confirm(`Are you sure you want to delete "${projectName}"? This action cannot be undone.`)) {
      try {
        await api.delete(`/projects/${projectId}`);
        fetchProjects();
      } catch (err) {
        alert(err.response?.data?.detail || 'Failed to delete project');
      }
    }
  };

  const handleOpenUploadForNew = async () => {
    try {
      const res = await api.post('/projects', {
        name: `Imported Project ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        description: 'Imported from local computer folder',
        language: 'python'
      });
      setTargetUploadProjectId(res.data.id);
      setIsUploadOpen(true);
    } catch (err) {
      alert('Failed to initialize import target');
    }
  };

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0d1117', color: '#f0f6fc', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      <main style={{ flex: 1, maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Top title and actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: '700', letterSpacing: '-0.02em' }}>My Projects</h1>
            <p style={{ color: '#8b949e', fontSize: '0.9rem', marginTop: '0.25rem' }}>
              Welcome back, <strong>{user?.name}</strong>. Manage and collaborate on your cloud IDE workspaces.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => setIsCloneOpen(true)}>
              <GitBranch size={16} color="#818cf8" />
              <span>Clone from GitHub</span>
            </button>
            <button className="btn btn-secondary" onClick={handleOpenUploadForNew}>
              <Upload size={16} />
              <span>Import Project Folder</span>
            </button>
            <button className="btn btn-primary" onClick={() => setIsCreateOpen(true)}>
              <Plus size={16} />
              <span>New Project</span>
            </button>
          </div>
        </div>

        {/* Search filter bar */}
        <div style={{ marginBottom: '1.5rem', position: 'relative', maxWidth: '400px' }}>
          <Search size={16} color="#8b949e" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            className="input-field"
            placeholder="Search projects by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>

        {/* Projects grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#8b949e' }}>Loading projects...</div>
        ) : filteredProjects.length === 0 ? (
          <div style={{
            backgroundColor: '#161b22',
            border: '1px dashed #30363d',
            borderRadius: '12px',
            padding: '4rem 2rem',
            textAlign: 'center'
          }}>
            <FolderGit2 size={48} color="#38bdf8" style={{ marginBottom: '1rem' }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '0.5rem' }}>No projects found</h3>
            <p style={{ color: '#8b949e', fontSize: '0.9rem', maxWidth: '450px', margin: '0 auto 1.5rem' }}>
              Create a new software project, clone from any public GitHub repository, or import a local folder.
            </p>
            <div style={{ display: 'inline-flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => setIsCreateOpen(true)}>
                <Plus size={16} />
                <span>Create New Project</span>
              </button>
              <button className="btn btn-secondary" onClick={() => setIsCloneOpen(true)}>
                <GitBranch size={16} color="#818cf8" />
                <span>Clone from GitHub</span>
              </button>
              <button className="btn btn-secondary" onClick={handleOpenUploadForNew}>
                <Upload size={16} />
                <span>Import Local Folder</span>
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {filteredProjects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onDelete={handleDeleteProject}
              />
            ))}
          </div>
        )}
      </main>

      {/* Modals */}
      <CreateProjectModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onProjectCreated={(newProj) => {
          fetchProjects();
          navigate(`/projects/${newProj.id}`);
        }}
      />

      <CloneFromGithubModal
        isOpen={isCloneOpen}
        onClose={() => setIsCloneOpen(false)}
        onProjectCloned={() => {
          fetchProjects();
        }}
      />

      <UploadProjectModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        projectId={targetUploadProjectId}
        onUploadSuccess={() => {
          fetchProjects();
          if (targetUploadProjectId) {
            navigate(`/projects/${targetUploadProjectId}`);
          }
        }}
      />
    </div>
  );
}
