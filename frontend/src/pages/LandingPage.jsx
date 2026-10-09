import React, { useState, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import Logo from '../components/common/Logo';
import { Users, Play, FolderUp, ShieldCheck, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';

export default function LandingPage() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [activeFeatureIndex, setActiveFeatureIndex] = useState(0);

  const featuresList = [
    {
      id: 'collaboration',
      icon: <Users size={24} color="#818cf8" />,
      title: 'Real-Time Collaboration',
      tagline: 'Work simultaneously with your engineering team',
      description: 'Experience live multi-user editing, cursor tracking, presence indicators, and instant project chat. Every change is synchronized across connected workspace members.',
      highlights: ['WebSocket real-time sync', 'Live cursor & active tab tracking', 'Project-level chat history']
    },
    {
      id: 'execution',
      icon: <Play size={24} color="#a855f7" />,
      title: 'Docker Code Execution',
      tagline: 'Isolated sandbox environment for instant runs',
      description: 'Execute Python, JavaScript, Java, and C code inside isolated ephemeral Docker containers. Output streams, execution time, and exit codes are displayed in real time.',
      highlights: ['Pre-configured language runtimes', 'Memory & CPU hardware bounds', 'Execution duration logging']
    },
    {
      id: 'import',
      icon: <FolderUp size={24} color="#06b6d4" />,
      title: 'Local Project Import',
      tagline: 'Upload existing local folders with zero path loss',
      description: 'Select project folders directly from your computer. Mirage IDE preserves your nested relative paths while preventing path traversal vulnerabilities.',
      highlights: ['Full directory structure preservation', 'Zip archive import support', 'Path traversal security validation']
    },
    {
      id: 'security',
      icon: <ShieldCheck size={24} color="#10b981" />,
      title: 'Role-Based Access Control',
      tagline: 'Enterprise permissions for project protection',
      description: 'Manage collaborators with Owner, Editor, and Viewer roles. Enforced backend permissions ensure Viewers cannot alter code or trigger execution.',
      highlights: ['Owner, Editor, and Viewer roles', 'Email invitation management', 'Strict API endpoint authorization']
    }
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#09090b', color: '#fafafa', display: 'flex', flexDirection: 'column' }}>
      {/* Top Header Navigation */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: 'rgba(9, 9, 11, 0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid #27272a',
        padding: '1rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none' }}>
            <Logo size={36} />
            <span style={{ fontSize: '1.25rem', fontWeight: '700', letterSpacing: '-0.02em', color: '#ffffff' }}>
              Mirage IDE
            </span>
          </Link>

          <nav style={{ display: 'flex', gap: '1.75rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
            <a href="#features" style={{ color: 'inherit', textDecoration: 'none' }}>Features</a>
            <a href="#how-it-works" style={{ color: 'inherit', textDecoration: 'none' }}>How It Works</a>
            <a href="#languages" style={{ color: 'inherit', textDecoration: 'none' }}>Languages</a>
          </nav>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {user ? (
            <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
              Go to Dashboard
            </button>
          ) : (
            <>
              <Link to="/login" className="btn btn-secondary" style={{ textDecoration: 'none' }}>Sign In</Link>
              <Link to="/register" className="btn btn-primary" style={{ textDecoration: 'none' }}>Get Started</Link>
            </>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1 }}>
        {/* Hero Section */}
        <section style={{ padding: '6rem 1.5rem 4rem', textAlign: 'center', maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.4rem 1.1rem',
            borderRadius: '9999px',
            backgroundColor: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            color: '#818cf8',
            fontSize: '0.85rem',
            fontWeight: '600',
            marginBottom: '2rem'
          }}>
            <Sparkles size={16} color="#a855f7" />
            <span>Next-Gen Collaborative Cloud Development</span>
          </div>

          <h1 style={{
            fontSize: '3.75rem',
            fontWeight: '800',
            lineHeight: 1.12,
            letterSpacing: '-0.03em',
            marginBottom: '1.5rem',
            background: 'linear-gradient(180deg, #ffffff 0%, #a1a1aa 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Build & Collaborate in the Cloud.
          </h1>

          <p style={{ fontSize: '1.2rem', color: '#a1a1aa', maxWidth: '780px', margin: '0 auto 2.75rem', lineHeight: 1.6 }}>
            <strong>Mirage IDE is a collaborative cloud development environment that allows multiple users to create, import, edit, execute, and manage software projects together through a web browser.</strong>
          </p>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" style={{ padding: '0.9rem 2.25rem', fontSize: '1rem' }} onClick={() => navigate(user ? '/dashboard' : '/register')}>
              Launch Workspace
              <ArrowRight size={18} />
            </button>
            <a href="#features" className="btn btn-secondary" style={{ padding: '0.9rem 2rem', fontSize: '1rem', textDecoration: 'none' }}>
              Explore Features
            </a>
          </div>
        </section>

        {/* Interactive Feature Showcase Section */}
        <section id="features" style={{ maxWidth: '1100px', margin: '2rem auto 6rem', padding: '0 1.5rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <h2 style={{ fontSize: '2.25rem', fontWeight: '700', letterSpacing: '-0.02em', marginBottom: '0.5rem', color: '#ffffff' }}>
              Everything in One Shared Space
            </h2>
            <p style={{ color: '#a1a1aa', fontSize: '1rem' }}>
              Click a feature below to discover how Mirage IDE transforms development
            </p>
          </div>

          {/* Interactive Feature Selection Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            {featuresList.map((feature, idx) => {
              const isSelected = activeFeatureIndex === idx;
              return (
                <div
                  key={feature.id}
                  onClick={() => setActiveFeatureIndex(idx)}
                  className="glass-card"
                  style={{
                    padding: '1.25rem',
                    cursor: 'pointer',
                    borderColor: isSelected ? '#6366f1' : 'rgba(255, 255, 255, 0.08)',
                    backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.08)' : '#121215',
                    boxShadow: isSelected ? '0 0 16px rgba(99, 102, 241, 0.2)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    {feature.icon}
                    <span style={{ fontWeight: '600', color: isSelected ? '#ffffff' : '#a1a1aa', fontSize: '0.95rem' }}>
                      {feature.title}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#71717a' }}>
                    {feature.tagline}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Active Interactive Feature Detail Card */}
          <div className="glass-card" style={{ padding: '2.5rem', backgroundColor: '#121215', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {featuresList[activeFeatureIndex].icon}
              </div>
              <div>
                <h3 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#ffffff' }}>
                  {featuresList[activeFeatureIndex].title}
                </h3>
                <span style={{ fontSize: '0.85rem', color: '#818cf8', fontWeight: '500' }}>
                  {featuresList[activeFeatureIndex].tagline}
                </span>
              </div>
            </div>

            <p style={{ fontSize: '1rem', color: '#a1a1aa', lineHeight: 1.7, marginBottom: '1.75rem' }}>
              {featuresList[activeFeatureIndex].description}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              {featuresList[activeFeatureIndex].highlights.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.9rem', color: '#fafafa' }}>
                  <CheckCircle2 size={16} color="#10b981" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 3-Step "How It Works" Section */}
        <section id="how-it-works" style={{ maxWidth: '1100px', margin: '0 auto 6rem', padding: '0 1.5rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <h2 style={{ fontSize: '2.25rem', fontWeight: '700', letterSpacing: '-0.02em', marginBottom: '0.5rem', color: '#ffffff' }}>
              How Mirage IDE Works
            </h2>
            <p style={{ color: '#a1a1aa', fontSize: '1rem' }}>
              Start collaborating on software projects in 3 simple steps
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
            <div className="glass-card" style={{ padding: '2rem', position: 'relative' }}>
              <div style={{ fontSize: '2.5rem', fontWeight: '800', color: 'rgba(99, 102, 241, 0.3)', marginBottom: '0.5rem' }}>01</div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '0.5rem', color: '#ffffff' }}>
                Create or Import Project
              </h3>
              <p style={{ fontSize: '0.9rem', color: '#a1a1aa', lineHeight: 1.6 }}>
                Create a project from a template or upload an existing project folder from your local computer.
              </p>
            </div>

            <div className="glass-card" style={{ padding: '2rem', position: 'relative' }}>
              <div style={{ fontSize: '2.5rem', fontWeight: '800', color: 'rgba(168, 85, 247, 0.3)', marginBottom: '0.5rem' }}>02</div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '0.5rem', color: '#ffffff' }}>
                Invite Teammates
              </h3>
              <p style={{ fontSize: '0.9rem', color: '#a1a1aa', lineHeight: 1.6 }}>
                Share access with your team via email and assign permissions (`Owner`, `Editor`, `Viewer`).
              </p>
            </div>

            <div className="glass-card" style={{ padding: '2rem', position: 'relative' }}>
              <div style={{ fontSize: '2.5rem', fontWeight: '800', color: 'rgba(16, 185, 129, 0.3)', marginBottom: '0.5rem' }}>03</div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '0.5rem', color: '#ffffff' }}>
                Edit & Run Code
              </h3>
              <p style={{ fontSize: '0.9rem', color: '#a1a1aa', lineHeight: 1.6 }}>
                Edit code live with your team and click **RUN** to execute code safely inside Docker containers.
              </p>
            </div>
          </div>
        </section>

        {/* Supported Languages Section */}
        <section id="languages" style={{ maxWidth: '950px', margin: '0 auto 6rem', padding: '0 1.5rem', textAlign: 'center' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#818cf8', marginBottom: '2rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Supported Languages
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem' }}>
            <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🐍</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '600', color: '#ffffff' }}>Python</div>
            </div>
            <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚡</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '600', color: '#ffffff' }}>JavaScript</div>
            </div>
            <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>☕</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '600', color: '#ffffff' }}>Java</div>
            </div>
            <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚙️</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '600', color: '#ffffff' }}>C</div>
            </div>
          </div>
        </section>

        {/* Bottom Call-To-Action Banner */}
        <section style={{ maxWidth: '1100px', margin: '0 auto 6rem', padding: '0 1.5rem' }}>
          <div className="glass-card" style={{
            padding: '4rem 2rem',
            textAlign: 'center',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(168, 85, 247, 0.12) 100%)',
            border: '1px solid rgba(99, 102, 241, 0.3)'
          }}>
            <h2 style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '1rem', color: '#ffffff', letterSpacing: '-0.02em' }}>
              Ready to code together?
            </h2>
            <p style={{ fontSize: '1.1rem', color: '#a1a1aa', maxWidth: '600px', margin: '0 auto 2.25rem', lineHeight: 1.6 }}>
              Create your account now and start building software projects with your team.
            </p>
            <button className="btn btn-primary" style={{ padding: '0.9rem 2.5rem', fontSize: '1rem' }} onClick={() => navigate(user ? '/dashboard' : '/register')}>
              Launch Mirage IDE
              <ArrowRight size={18} />
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer style={{ padding: '2.5rem 2rem', borderTop: '1px solid #27272a', backgroundColor: '#09090b', color: '#71717a', fontSize: '0.875rem' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Logo size={28} />
            <span style={{ fontWeight: '700', color: '#ffffff', fontSize: '1rem' }}>Mirage IDE</span>
          </div>

          <div>
            © 2026 Mirage IDE Inc. All rights reserved. Collaborative Cloud Development Environment.
          </div>
        </div>
      </footer>
    </div>
  );
}
