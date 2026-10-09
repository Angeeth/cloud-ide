import React, { useState, useContext, useEffect, useRef } from 'react';
import { WorkspaceContext } from '../../context/WorkspaceContext';
import { AuthContext } from '../../context/AuthContext';
import { Send, MessageSquare } from 'lucide-react';

export default function ChatPanel() {
  const { chatMessages, sendChatMessage } = useContext(WorkspaceContext);
  const { user } = useContext(AuthContext);
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    sendChatMessage(inputMessage.trim());
    setInputMessage('');
  };

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
        <MessageSquare size={14} color="#38bdf8" />
        <span>PROJECT CHAT</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {chatMessages.length === 0 ? (
          <div style={{ color: '#6e7681', fontSize: '0.8rem', textAlign: 'center', marginTop: '2rem' }}>
            No chat messages yet. Start collaborating!
          </div>
        ) : (
          chatMessages.map((msg, idx) => {
            const isMe = msg.user_id === user?.id || msg.user?.id === user?.id;
            const senderName = msg.user_name || msg.user?.name || 'Collaborator';

            return (
              <div key={msg.id || idx} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isMe ? 'flex-end' : 'flex-start'
              }}>
                <div style={{ fontSize: '0.7rem', color: '#8b949e', marginBottom: '0.15rem' }}>
                  {senderName} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  backgroundColor: isMe ? '#38bdf8' : '#21262d',
                  color: isMe ? '#040d1a' : '#f0f6fc',
                  fontWeight: isMe ? '500' : '400',
                  fontSize: '0.8125rem',
                  maxWidth: '85%',
                  wordBreak: 'break-word'
                }}>
                  {msg.message}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} style={{ padding: '0.5rem', borderTop: '1px solid #30363d', display: 'flex', gap: '0.35rem' }}>
        <input
          type="text"
          className="input-field"
          placeholder="Type a message..."
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
        />
        <button type="submit" className="btn btn-primary" style={{ padding: '0.4rem 0.75rem' }}>
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
