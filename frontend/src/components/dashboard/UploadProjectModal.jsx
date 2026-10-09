import React, { useState } from 'react';
import api from '../../services/api';
import { Upload, FolderUp, FileArchive, X, CheckCircle } from 'lucide-react';

export default function UploadProjectModal({ isOpen, onClose, projectId, onUploadSuccess }) {
  const [uploadMode, setUploadMode] = useState('folder'); // 'folder' or 'zip'
  const [files, setFiles] = useState([]);
  const [zipFile, setZipFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  if (!isOpen) return null;

  const handleFolderSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
    setStatusMsg(`Detected ${selectedFiles.length} files in folder.`);
  };

  const handleZipSelect = (e) => {
    if (e.target.files[0]) {
      setZipFile(e.target.files[0]);
      setStatusMsg(`Selected zip archive: ${e.target.files[0].name}`);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!projectId) return;

    setUploading(true);
    setProgress(20);

    try {
      if (uploadMode === 'folder') {
        if (files.length === 0) {
          alert('Please select a local project folder first.');
          setUploading(false);
          return;
        }

        const formData = new FormData();
        files.forEach((f) => {
          formData.append('files', f);
          const relPath = f.webkitRelativePath || f.name;
          formData.append('relative_paths', relPath);
        });

        setProgress(60);
        await api.post(`/projects/${projectId}/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

      } else {
        if (!zipFile) {
          alert('Please select a zip archive file first.');
          setUploading(false);
          return;
        }

        const formData = new FormData();
        formData.append('zip_file', zipFile);

        setProgress(60);
        await api.post(`/projects/${projectId}/upload/zip`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      setProgress(100);
      setStatusMsg('Import completed successfully!');
      setTimeout(() => {
        onUploadSuccess();
        onClose();
      }, 600);

    } catch (err) {
      alert(err.response?.data?.detail || 'Import failed');
      setUploading(false);
      setProgress(0);
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
        maxWidth: '520px',
        padding: '1.5rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Upload size={22} color="#38bdf8" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#f0f6fc' }}>Import Local Project Folder</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Mode selector */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <button
            type="button"
            className={`btn ${uploadMode === 'folder' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem' }}
            onClick={() => setUploadMode('folder')}
          >
            <FolderUp size={16} />
            <span>Select Folder</span>
          </button>
          <button
            type="button"
            className={`btn ${uploadMode === 'zip' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem' }}
            onClick={() => setUploadMode('zip')}
          >
            <FileArchive size={16} />
            <span>Upload Zip Archive</span>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {uploadMode === 'folder' ? (
            <div style={{
              border: '2px dashed #30363d',
              borderRadius: '8px',
              padding: '2rem',
              textAlign: 'center',
              backgroundColor: '#0d1117',
              marginBottom: '1rem'
            }}>
              <FolderUp size={36} color="#38bdf8" style={{ marginBottom: '0.75rem' }} />
              <p style={{ fontSize: '0.9rem', color: '#f0f6fc', fontWeight: '500', marginBottom: '0.5rem' }}>
                Select folder from your local computer
              </p>
              <p style={{ fontSize: '0.75rem', color: '#8b949e', marginBottom: '1rem' }}>
                Preserves full relative directory structure (src, assets, pom.xml, README)
              </p>
              <input
                type="file"
                webkitdirectory="true"
                directory="true"
                multiple
                onChange={handleFolderSelect}
                style={{ display: 'none' }}
                id="folder-input"
              />
              <label htmlFor="folder-input" className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex' }}>
                Browse Project Folder
              </label>
            </div>
          ) : (
            <div style={{
              border: '2px dashed #30363d',
              borderRadius: '8px',
              padding: '2rem',
              textAlign: 'center',
              backgroundColor: '#0d1117',
              marginBottom: '1rem'
            }}>
              <FileArchive size={36} color="#a855f7" style={{ marginBottom: '0.75rem' }} />
              <p style={{ fontSize: '0.9rem', color: '#f0f6fc', fontWeight: '500', marginBottom: '0.5rem' }}>
                Select zip archive file
              </p>
              <input
                type="file"
                accept=".zip"
                onChange={handleZipSelect}
                style={{ display: 'none' }}
                id="zip-input"
              />
              <label htmlFor="zip-input" className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex' }}>
                Browse .zip File
              </label>
            </div>
          )}

          {statusMsg && (
            <div style={{ fontSize: '0.8rem', color: '#38bdf8', marginBottom: '1rem', textAlign: 'center' }}>
              {statusMsg}
            </div>
          )}

          {uploading && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#8b949e', marginBottom: '0.25rem' }}>
                <span>Importing Project...</span>
                <span>{progress}%</span>
              </div>
              <div style={{ height: '8px', backgroundColor: '#21262d', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress}%`, backgroundColor: '#38bdf8', transition: 'width 0.3s ease' }} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={uploading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={uploading}>
              {uploading ? 'Importing...' : 'Import Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
