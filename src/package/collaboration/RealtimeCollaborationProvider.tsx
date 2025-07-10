import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { 
  $getRoot, 
  $getSelection,
  EditorState,
  LexicalEditor,
  SerializedEditorState
} from 'lexical';

// 消息类型
export const MESSAGE_TYPES = {
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  EDITOR_STATE: 'editor_state', 
  CURSOR_POSITION: 'cursor_position',
  USER_LIST: 'user_list',
  OPERATION: 'operation',
  ERROR: 'error'
} as const;

// 用户接口
export interface CollabUser {
  id: string;
  username: string;
  cursor?: {
    anchorOffset: number;
    focusOffset: number;
    anchorKey: string;
    focusKey: string;
  };
}

// 操作接口
export interface CollabOperation {
  type: 'insert' | 'delete' | 'format';
  index?: number;
  timestamp?: number;
  userId?: string;
  data: any;
}

// Context接口
interface CollaborationContextType {
  isConnected: boolean;
  users: CollabUser[];
  currentUserId: string | null;
  joinRoom: (roomId: string, username: string) => void;
  leaveRoom: () => void;
  sendOperation: (operation: CollabOperation) => void;
}

const CollaborationContext = createContext<CollaborationContextType | null>(null);

interface Props {
  children: React.ReactNode;
  serverUrl?: string;
}

export function RealtimeCollaborationProvider({ 
  children, 
  serverUrl = 'wss://collab-server-production-2ff6.up.railway.app'
}: Props) {
  const [editor] = useLexicalComposerContext();
  const [isConnected, setIsConnected] = useState(false);
  const [users, setUsers] = useState<CollabUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const isApplyingRemoteChange = useRef(false);

  // 连接WebSocket
  const connectWebSocket = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(serverUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket连接已建立');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleMessage(message);
      } catch (error) {
        console.error('解析消息失败:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket连接已关闭');
      setIsConnected(false);
      // 重连逻辑
      setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket错误:', error);
    };
  };

  // 处理接收到的消息
  const handleMessage = (message: any) => {
    switch (message.type) {
      case MESSAGE_TYPES.JOIN_ROOM:
        if (message.data.success) {
          setCurrentUserId(message.data.userId);
        }
        break;

      case MESSAGE_TYPES.USER_LIST:
        setUsers(message.data);
        break;

      case MESSAGE_TYPES.EDITOR_STATE:
        applyRemoteEditorState(message.data);
        break;

      case MESSAGE_TYPES.OPERATION:
        applyRemoteOperation(message.data);
        break;

      case MESSAGE_TYPES.ERROR:
        console.error('服务器错误:', message.data.message);
        break;
    }
  };

  // 应用远程编辑器状态
  const applyRemoteEditorState = (state: SerializedEditorState) => {
    if (isApplyingRemoteChange.current) return;
    
    isApplyingRemoteChange.current = true;
    
    editor.update(() => {
      const editorState = editor.parseEditorState(JSON.stringify(state));
      editor.setEditorState(editorState);
    }, { discrete: true });
    
    setTimeout(() => {
      isApplyingRemoteChange.current = false;
    }, 0);
  };

  // 应用远程操作
  const applyRemoteOperation = (operation: CollabOperation) => {
    if (isApplyingRemoteChange.current) return;
    if (operation.userId === currentUserId) return;

    isApplyingRemoteChange.current = true;
    
    editor.update(() => {
      // 简单的操作应用逻辑，可以根据需要扩展
      console.log('应用远程操作:', operation);
    }, { discrete: true });
    
    setTimeout(() => {
      isApplyingRemoteChange.current = false;
    }, 0);
  };

  // 发送消息
  const sendMessage = (message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  // 加入房间
  const joinRoom = (roomId: string, username: string) => {
    roomIdRef.current = roomId;
    if (!isConnected) {
      connectWebSocket();
    }
    
    sendMessage({
      type: MESSAGE_TYPES.JOIN_ROOM,
      data: { roomId, username }
    });
  };

  // 离开房间
  const leaveRoom = () => {
    if (roomIdRef.current) {
      sendMessage({
        type: MESSAGE_TYPES.LEAVE_ROOM,
        data: { roomId: roomIdRef.current }
      });
    }
    roomIdRef.current = null;
    setUsers([]);
    setCurrentUserId(null);
  };

  // 发送操作
  const sendOperation = (operation: CollabOperation) => {
    sendMessage({
      type: MESSAGE_TYPES.OPERATION,
      data: operation
    });
  };

  // 监听编辑器变化
  useEffect(() => {
    if (!editor) return;

    const removeListener = editor.registerUpdateListener(
      ({ editorState, dirtyElements, dirtyLeaves, prevEditorState }) => {
        if (isApplyingRemoteChange.current) return;
        if (!roomIdRef.current || !currentUserId) return;

        // 发送编辑器状态变化
        editorState.read(() => {
          const serialized = editorState.toJSON();
          sendMessage({
            type: MESSAGE_TYPES.EDITOR_STATE,
            data: serialized
          });
        });

        // 发送光标位置
        const selection = $getSelection();
        if (selection) {
          sendMessage({
            type: MESSAGE_TYPES.CURSOR_POSITION,
            data: {
              anchorOffset: selection.anchor.offset,
              focusOffset: selection.focus.offset,
              anchorKey: selection.anchor.key,
              focusKey: selection.focus.key
            }
          });
        }
      }
    );

    return removeListener;
  }, [editor, currentUserId]);

  // 清理连接
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const contextValue: CollaborationContextType = {
    isConnected,
    users,
    currentUserId,
    joinRoom,
    leaveRoom,
    sendOperation
  };

  return (
    <CollaborationContext.Provider value={contextValue}>
      {children}
    </CollaborationContext.Provider>
  );
}

export function useRealtimeCollaboration() {
  const context = useContext(CollaborationContext);
  if (!context) {
    throw new Error('useRealtimeCollaboration must be used within RealtimeCollaborationProvider');
  }
  return context;
}