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
  const lastMessageTime = useRef<number>(0);
  const lastLeaveTime = useRef<number>(0);
  const lastEditorStateTime = useRef<number>(0);
  const MESSAGE_THROTTLE = 100; // 100ms内最多发送一条消息
  const LEAVE_THROTTLE = 1000; // leave_room消息1秒内最多发送一次
  const EDITOR_STATE_THROTTLE = 500; // 编辑器状态500ms内最多发送一次

  // 连接WebSocket
  const connectWebSocket = () => {
    // 如果已经有连接且状态正常，不重复连接
    if (wsRef.current?.readyState === WebSocket.OPEN || 
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    // 清理之前的连接
    if (wsRef.current) {
      wsRef.current.close();
    }

    console.log('尝试连接到:', serverUrl);
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

    ws.onclose = (event) => {
      console.log('WebSocket连接已关闭，代码:', event.code, '原因:', event.reason);
      setIsConnected(false);
      
      // 只在非正常关闭时重连（避免手动关闭时重连）
      if (event.code !== 1000 && roomIdRef.current) {
        console.log('3秒后尝试重连...');
        setTimeout(() => {
          if (roomIdRef.current) { // 确保仍然需要连接
            connectWebSocket();
          }
        }, 3000);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket错误:', error);
      setIsConnected(false);
    };
  };

  // 处理接收到的消息
  const handleMessage = (message: any) => {
    console.log('收到服务器消息:', message.type, message.data);
    
    switch (message.type) {
      case MESSAGE_TYPES.JOIN_ROOM:
        if (message.data.success) {
          console.log('成功加入房间，用户ID:', message.data.userId);
          setCurrentUserId(message.data.userId);
        }
        break;

      case MESSAGE_TYPES.USER_LIST:
        console.log('更新用户列表:', message.data);
        setUsers(message.data);
        break;

      case MESSAGE_TYPES.EDITOR_STATE:
        console.log('收到编辑器状态更新');
        applyRemoteEditorState(message.data);
        break;

      case MESSAGE_TYPES.OPERATION:
        console.log('收到远程操作:', message.data);
        applyRemoteOperation(message.data);
        break;

      case MESSAGE_TYPES.ERROR:
        console.error('服务器错误:', message.data.message);
        break;
    }
  };

  // 应用远程编辑器状态
  const applyRemoteEditorState = (state: SerializedEditorState) => {
    if (isApplyingRemoteChange.current) {
      console.log('跳过远程状态应用（正在应用中）');
      return;
    }
    
    try {
      const currentState = editor.getEditorState();
      
      // 简单的冲突检测：如果内容完全相同，跳过更新
      const currentContent = JSON.stringify(currentState.toJSON());
      const remoteContent = JSON.stringify(state);
      
      if (currentContent === remoteContent) {
        console.log('内容相同，跳过远程状态应用');
        return;
      }
      
      console.log('开始应用远程编辑器状态');
      isApplyingRemoteChange.current = true;
      
      // 检查用户是否正在编辑（有选择或焦点）
      const currentSelection = editor.getEditorState().read(() => $getSelection());
      const hasUserFocus = currentSelection && currentSelection.getTextContent() !== '';
      
      // 如果用户正在编辑，延迟应用远程状态
      if (hasUserFocus) {
        console.log('用户正在编辑，延迟应用远程状态');
        setTimeout(() => {
          applyRemoteEditorState(state);
        }, 1000);
        isApplyingRemoteChange.current = false;
        return;
      }
      
      // 使用discrete模式应用远程状态，减少对用户编辑的干扰
      editor.update(() => {
        try {
          const remoteEditorState = editor.parseEditorState(JSON.stringify(state));
          editor.setEditorState(remoteEditorState);
          console.log('远程编辑器状态应用成功');
        } catch (parseError) {
          console.error('解析远程状态失败:', parseError);
        }
      }, { 
        discrete: true,
        tag: 'remote-collaboration-update'
      });
      
      // 重置标志
      setTimeout(() => {
        isApplyingRemoteChange.current = false;
        console.log('远程状态应用标志已重置');
      }, 0);
      
    } catch (error) {
      console.error('应用远程编辑器状态失败:', error);
      isApplyingRemoteChange.current = false;
    }
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

  // 发送消息（带防抖）
  const sendMessage = (message: any) => {
    const now = Date.now();
    
    // 特殊处理leave_room消息，更严格的防抖
    if (message.type === MESSAGE_TYPES.LEAVE_ROOM) {
      if (now - lastLeaveTime.current < LEAVE_THROTTLE) {
        console.log('leave_room消息被防抖限制');
        return;
      }
      lastLeaveTime.current = now;
    }
    
    // 特殊处理editor_state消息，使用专门的防抖
    if (message.type === MESSAGE_TYPES.EDITOR_STATE) {
      if (now - lastEditorStateTime.current < EDITOR_STATE_THROTTLE) {
        console.log('editor_state消息被防抖限制');
        return;
      }
      lastEditorStateTime.current = now;
    }
    
    // 防抖：除了join_room消息，其他消息限制频率
    if (message.type !== MESSAGE_TYPES.JOIN_ROOM && 
        message.type !== MESSAGE_TYPES.EDITOR_STATE && // 编辑器状态消息已经有专门的防抖
        now - lastMessageTime.current < MESSAGE_THROTTLE) {
      console.log('消息被防抖限制:', message.type);
      return;
    }
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      console.log('发送消息:', message.type);
      lastMessageTime.current = now;
    } else {
      console.warn('WebSocket未连接，无法发送消息:', message.type);
    }
  };

  // 加入房间
  const joinRoom = (roomId: string, username: string) => {
    roomIdRef.current = roomId;
    
    // 确保连接建立
    if (!isConnected || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      connectWebSocket();
      
      // 等待连接建立后发送加入房间消息
      const checkConnection = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          sendMessage({
            type: MESSAGE_TYPES.JOIN_ROOM,
            data: { roomId, username }
          });
        } else if (wsRef.current?.readyState === WebSocket.CONNECTING) {
          // 如果还在连接中，继续等待
          setTimeout(checkConnection, 100);
        }
      };
      
      setTimeout(checkConnection, 100);
    } else {
      // 连接已建立，直接发送消息
      sendMessage({
        type: MESSAGE_TYPES.JOIN_ROOM,
        data: { roomId, username }
      });
    }
  };

  // 离开房间
  const leaveRoom = () => {
    if (roomIdRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
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
    
    console.log('注册编辑器监听器');

    const removeListener = editor.registerUpdateListener(
      ({ editorState, dirtyElements, dirtyLeaves, prevEditorState, tags }) => {
        console.log('编辑器状态变化:', {
          isApplyingRemoteChange: isApplyingRemoteChange.current,
          roomId: roomIdRef.current,
          userId: currentUserId,
          wsState: wsRef.current?.readyState,
          dirtyElements: dirtyElements.size,
          dirtyLeaves: dirtyLeaves.size,
          tags: Array.from(tags || [])
        });

        // 跳过远程同步产生的更新
        if (isApplyingRemoteChange.current || tags?.has('remote-collaboration-update')) {
          console.log('跳过远程变化应用');
          return;
        }
        
        if (!roomIdRef.current || !currentUserId) {
          console.log('房间或用户ID未设置');
          return;
        }
        
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          console.log('WebSocket未连接');
          return;
        }

        // 避免频繁发送，使用防抖
        if (prevEditorState && editorState.isEmpty() && prevEditorState.isEmpty()) {
          console.log('跳过空状态变化');
          return;
        }

        // 检查是否有实际内容变化
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) {
          console.log('没有实际内容变化');
          return;
        }

        // 检查是否有实际文本变化
        const currentContent = editorState.read(() => $getRoot().getTextContent());
        const previousContent = prevEditorState?.read(() => $getRoot().getTextContent()) || '';
        
        if (currentContent === previousContent) {
          console.log('文本内容未变化，跳过发送');
          return;
        }

        console.log('准备发送编辑器状态');

        // 使用防抖机制发送编辑器状态变化
        editorState.read(() => {
          const serialized = editorState.toJSON();
          console.log('发送编辑器状态');
          sendMessage({
            type: MESSAGE_TYPES.EDITOR_STATE,
            data: serialized
          });
        });

        // 发送光标位置（频率较低）
        editorState.read(() => {
          const selection = $getSelection();
          if (selection) {
            console.log('发送光标位置');
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
        });
      }
    );

    return removeListener;
  }, [editor, currentUserId]); // 重新添加currentUserId依赖，但使用正确的方式

  // 清理连接
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
        wsRef.current = null;
      }
      roomIdRef.current = null;
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