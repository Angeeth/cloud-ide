import React, { useContext } from 'react';
import { WorkspaceContext } from '../../context/WorkspaceContext';
import { Users, Circle } from 'lucide-react';

export default function MemberList() {
  const { project, presenceList } = useContext(WorkspaceContext);

  const allMembers = project?.members || [];
  const onlineUserIds = new Set(presenceList.map((u) => u.user_id));

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
        <Users size={14} color="#38bdf8" />
        <span>PROJECT MEMBERS ({allMembers.length})</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
        {allMembers.map((m) => {
          const isOnline = onlineUserIds.has(m.user_id) || m.user_id === project.owner_id;

          return (
            <div key={m.id} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.4rem 0.5rem',
              borderRadius: '6px',
              backgroundColor: '#161b22',
              marginBottom: '0.35rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Circle size={8} fill={isOnline ? '#22c55e' : '#6e7681'} color={isOnline ? '#22c55e' : '#6e7681'} />
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: '500', color: '#f0f6fc' }}>
                    {m.user?.name}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#8b949e' }}>
                    {m.user?.email}
                  </div>
                </div>
              </div>

              <span className={`badge badge-${m.role.toLowerCase()}`}>
                {m.role}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
