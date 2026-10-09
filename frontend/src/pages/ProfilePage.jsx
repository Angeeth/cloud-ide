import React, { useContext } from 'react';
import Navbar from '../components/common/Navbar';
import { AuthContext } from '../context/AuthContext';
import { User, Mail, Calendar, ShieldCheck } from 'lucide-react';

export default function ProfilePage() {
  const { user } = useContext(AuthContext);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0d1117', color: '#f0f6fc', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      <main style={{ flex: 1, maxWidth: '600px', width: '100%', margin: '0 auto', padding: '3rem 1.5rem' }}>
        <div style={{
          backgroundColor: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '12px',
          padding: '2rem',
          boxShadow: 'var(--shadow-lg)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.75rem' }}>
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
              <h1 style={{ fontSize: '1.5rem', fontWeight: '700' }}>{user?.name}</h1>
              <p style={{ color: '#8b949e', fontSize: '0.9rem' }}>Mirage IDE Developer Account</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', backgroundColor: '#0d1117', borderRadius: '8px' }}>
              <Mail size={18} color="#38bdf8" />
              <div>
                <div style={{ fontSize: '0.75rem', color: '#8b949e' }}>Email Address</div>
                <div style={{ fontSize: '0.9rem', color: '#f0f6fc', fontWeight: '500' }}>{user?.email}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', backgroundColor: '#0d1117', borderRadius: '8px' }}>
              <ShieldCheck size={18} color="#22c55e" />
              <div>
                <div style={{ fontSize: '0.75rem', color: '#8b949e' }}>Account Status</div>
                <div style={{ fontSize: '0.9rem', color: '#22c55e', fontWeight: '600' }}>Active Cloud Developer</div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
