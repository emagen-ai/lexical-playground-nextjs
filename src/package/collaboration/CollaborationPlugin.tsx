import React, { useEffect, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useRealtimeCollaboration } from './RealtimeCollaborationProvider';
import './collaboration.css';

interface Props {
  roomId?: string;
  username?: string;
  enabled?: boolean;
}

export function CollaborationPlugin({ 
  roomId = 'default',
  username = `User-${Math.random().toString(36).substr(2, 9)}`,
  enabled = true 
}: Props) {
  const [editor] = useLexicalComposerContext();
  const { isConnected, joinRoom, leaveRoom, users } = useRealtimeCollaboration();
  const [hasJoined, setHasJoined] = useState(false);

  useEffect(() => {
    if (enabled && !hasJoined) {
      joinRoom(roomId, username);
      setHasJoined(true);
    }

    return () => {
      if (hasJoined) {
        leaveRoom();
        setHasJoined(false);
      }
    };
  }, [enabled, roomId, username, hasJoined, joinRoom, leaveRoom]);

  if (!enabled) {
    return null;
  }

  return (
    <div className="collaboration-status">
      <div className={`connection-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
        {isConnected ? '🟢 已连接' : '🔴 未连接'}
      </div>
      <div className="user-list">
        在线用户 ({users.length}): {users.map(user => user.username).join(', ')}
      </div>
    </div>
  );
}