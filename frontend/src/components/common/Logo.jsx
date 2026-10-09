import React, { useState } from 'react';

export default function Logo({ size = 32 }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div style={{
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '8px',
      overflow: 'hidden',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#09090b',
      border: '1px solid rgba(168, 85, 247, 0.25)',
      boxShadow: '0 0 12px rgba(99, 102, 241, 0.2)',
      flexShrink: 0
    }}>
      {!imgError ? (
        <img
          src="/logo.jpg"
          alt="Mirage IDE Minimalist Logo"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }}
          onError={() => setImgError(true)}
        />
      ) : (
        /* Minimalist Vector SVG Logo Icon */
        <svg width={size * 0.65} height={size * 0.65} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M3 18L9 6L12 12L15 6L21 18"
            stroke="url(#gradient-logo)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <defs>
            <linearGradient id="gradient-logo" x1="3" y1="6" x2="21" y2="18" gradientUnits="userSpaceOnUse">
              <stop stopColor="#818cf8" />
              <stop offset="1" stopColor="#a855f7" />
            </linearGradient>
          </defs>
        </svg>
      )}
    </div>
  );
}
