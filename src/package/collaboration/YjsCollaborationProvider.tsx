import React, { useCallback } from 'react';
import { CollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';

interface YjsCollaborationProviderProps {
  roomId: string;
  username: string;
  serverUrl?: string;
  children?: React.ReactNode;
}

// 创建初始编辑器状态
function $initialEditorState() {
  const root = $getRoot();
  if (root.getFirstChild() === null) {
    const paragraph = $createParagraphNode();
    paragraph.append($createTextNode('Welcome to collaborative editing!'));
    root.append(paragraph);
  }
}

// 全局的 Yjs 文档映射
const yjsDocMap = new Map<string, Y.Doc>();

function getDocFromMap(id: string, docMap: Map<string, Y.Doc>): Y.Doc {
  let doc = docMap.get(id);
  if (!doc) {
    doc = new Y.Doc();
    docMap.set(id, doc);
  }
  return doc;
}

export function YjsCollaborationProvider({
  roomId,
  username,
  serverUrl = 'wss://yjs-collab-server-production.up.railway.app',
  children
}: YjsCollaborationProviderProps) {
  // 提供者工厂函数
  const providerFactory = useCallback(
    (id: string, yjsDocMap: Map<string, Y.Doc>) => {
      console.log('创建 Yjs 提供者，房间ID:', id);
      const doc = getDocFromMap(id, yjsDocMap);
      
      // 使用我们的 Railway WebSocket 服务器
      const provider = new WebsocketProvider(serverUrl, id, doc, {
        connect: true,
        // 添加认证信息
        params: {
          username: username
        }
      });

      // 监听连接状态
      provider.on('status', (event: any) => {
        console.log('Yjs Provider 状态:', event.status);
      });

      provider.on('connection-close', (event: any) => {
        console.log('Yjs Provider 连接关闭:', event);
      });

      provider.on('connection-error', (event: any) => {
        console.error('Yjs Provider 连接错误:', event);
      });

      return provider;
    },
    [serverUrl, username]
  );

  return (
    <>
      <CollaborationPlugin
        id={roomId}
        providerFactory={providerFactory}
        initialEditorState={$initialEditorState}
        shouldBootstrap={true}
        username={username}
        cursorColor={`hsl(${Math.abs(username.hashCode() % 360)}, 70%, 50%)`}
      />
      {children}
    </>
  );
}

// 简单的字符串哈希函数，用于生成用户颜色
declare global {
  interface String {
    hashCode(): number;
  }
}

String.prototype.hashCode = function() {
  var hash = 0;
  for (var i = 0; i < this.length; i++) {
    var char = this.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为32位整数
  }
  return hash;
};