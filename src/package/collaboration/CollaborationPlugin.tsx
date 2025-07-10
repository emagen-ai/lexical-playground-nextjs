import React, { useEffect, useRef } from 'react';
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
  username,
  enabled = true 
}: Props) {
  // 使用稳定的username，避免每次渲染都重新生成
  const stableUsername = useRef(username || `User-${Math.random().toString(36).substr(2, 9)}`).current;
  const [editor] = useLexicalComposerContext();
  const { isConnected, joinRoom, leaveRoom, users } = useRealtimeCollaboration();
  const hasJoinedRef = useRef(false);
  const currentRoomRef = useRef<string | null>(null);
  const usernameRef = useRef(stableUsername);

  // 只在enabled, roomId真正变化时执行
  useEffect(() => {
    if (!enabled) {
      if (hasJoinedRef.current) {
        leaveRoom();
        hasJoinedRef.current = false;
        currentRoomRef.current = null;
      }
      return;
    }

    // 避免重复加入同一个房间
    if (hasJoinedRef.current && 
        currentRoomRef.current === roomId && 
        usernameRef.current === stableUsername) {
      return;
    }

    // 如果之前加入过房间，先离开
    if (hasJoinedRef.current) {
      leaveRoom();
      hasJoinedRef.current = false;
    }

    // 延迟加入新房间，避免频繁切换
    const timeoutId = setTimeout(() => {
      if (enabled) { // 再次检查enabled状态
        joinRoom(roomId, stableUsername);
        hasJoinedRef.current = true;
        currentRoomRef.current = roomId;
        usernameRef.current = stableUsername;
      }
    }, 100);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [enabled, roomId, stableUsername]); // 使用稳定的username

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (hasJoinedRef.current) {
        leaveRoom();
        hasJoinedRef.current = false;
        currentRoomRef.current = null;
      }
    };
  }, []); // 空依赖数组，只在组件卸载时执行

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