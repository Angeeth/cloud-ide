import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import { AuthContext } from '../context/AuthContext';
import { Mail, ArrowLeft, X } from 'lucide-react';

export default function ProfilePage() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0d1117', color: '#f0f6fc', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      <main style={{ flex: 1, maxWidth: '600px', width: '100%', margin: '0 auto', padding: '2.5rem 1.5rem' }}>
        {/* Back button on top */}
        <div style={{ marginBottom: '1.25rem' }}>
          <button
            onClick={handleBack}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              backgroundColor: '#161b22',
              border: '1px solid #30363d',
              borderRadius: '8px',
              padding: '0.45rem 0.9rem',
              color: '#cbd5e1',
              fontSize: '0.85rem',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#1f2937';
              e.currentTarget.style.borderColor = '#818cf8';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#161b22';
              e.currentTarget.style.borderColor = '#30363d';
              e.currentTarget.style.color = '#cbd5e1';
            }}
            title="Go back to previous screen"
          >
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
        </div>

        <div style={{
          backgroundColor: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '12px',
          padding: '2rem',
          boxShadow: 'var(--shadow-lg)',
          position: 'relative'
        }}>
          {/* Header with Close X */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #06b6d4, #a855f7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.75rem',
                fontWeight: 'bold',
                color: '#ffffff'
              }}>
                {user?.name?.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: '700', margin: 0 }}>{user?.name}</h1>
                <p style={{ color: '#8b949e', fontSize: '0.9rem', margin: '4px 0 0 0' }}>Mirage IDE Developer Account</p>
              </div>
            </div>

            <button
              onClick={handleBack}
              style={{
                background: 'none',
                border: 'none',
                color: '#8b949e',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.backgroundColor = '#21262d';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#8b949e';
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              title="Close and go back"
            >
              <X size={20} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', backgroundColor: '#0d1117', borderRadius: '8px' }}>
              <Mail size={18} color="#38bdf8" />
              <div>
                <div style={{ fontSize: '0.75rem', color: '#8b949e' }}>Email Address</div>
                <div style={{ fontSize: '0.9rem', color: '#f0f6fc', fontWeight: '500' }}>{user?.email}</div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
