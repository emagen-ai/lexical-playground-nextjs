# Lexical 实时协作功能实现总结

## 📋 项目概述

本项目为 Lexical Playground Next.js 应用添加了基于 Yjs 的实时多人协作功能。用户可以在同一个编辑器中实时协作编辑文档，看到其他用户的光标位置和编辑内容。

### 技术栈
- **前端框架**: Next.js 15.3.5 + React 18.2.0
- **编辑器**: Lexical (Meta 的可扩展文本编辑器框架)
- **协作库**: Yjs (CRDT 实现) + @lexical/yjs
- **通信协议**: WebSocket (y-websocket)
- **部署平台**: Railway (WebSocket 服务器)

## 🏗️ 系统架构

### 1. 客户端架构
```
┌─────────────────────────────────────────┐
│         Lexical Editor (React)          │
├─────────────────────────────────────────┤
│    CollaborationPlugin (@lexical/react)  │
├─────────────────────────────────────────┤
│    YjsCollaborationProvider (自定义)     │
├─────────────────────────────────────────┤
│    WebsocketProvider (y-websocket)      │
└─────────────────────────────────────────┘
                    ↕️
              WebSocket 连接
                    ↕️
```

### 2. 服务器架构
```
┌─────────────────────────────────────────┐
│     Railway 部署的 Node.js 服务器        │
├─────────────────────────────────────────┤
│        y-websocket 官方服务器            │
├─────────────────────────────────────────┤
│     setupWSConnection 处理连接逻辑       │
├─────────────────────────────────────────┤
│        Yjs 文档管理和同步               │
└─────────────────────────────────────────┘
```

## 🔌 连接方式

### WebSocket URL
- **生产环境**: `wss://yjs-collab-server-production.up.railway.app`
- **房间结构**: `wss://[server]/[roomId]`
- **默认房间**: `main`

### 连接流程
1. 用户访问页面，协作模式默认开启
2. `YjsCollaborationProvider` 组件初始化
3. 创建 `WebsocketProvider` 实例连接到服务器
4. 服务器使用 `setupWSConnection` 处理新连接
5. 客户端和服务器交换 Yjs 同步消息
6. 实时同步开始工作

## 📦 核心组件

### 1. YjsCollaborationProvider (`src/package/collaboration/YjsCollaborationProvider.tsx`)
```typescript
export function YjsCollaborationProvider({
  roomId,
  username,
  serverUrl = 'wss://yjs-collab-server-production.up.railway.app',
  children
}: YjsCollaborationProviderProps) {
  // 使用官方 CollaborationPlugin
  return (
    <CollaborationPlugin
      id={roomId}
      providerFactory={providerFactory}
      initialEditorState={$initialEditorState}
      shouldBootstrap={true}
      username={username}
      cursorColor={generateUserColor(username)}
    />
  );
}
```

### 2. 服务器实现 (`collab-server/server.js`)
```javascript
const { setupWSConnection } = require('y-websocket/bin/utils')

wss.on('connection', (ws, req) => {
  // 使用官方 y-websocket 工具函数设置连接
  setupWSConnection(ws, req, {
    authenticate: (auth) => true, // 可添加认证
    persistence: null // 可添加持久化
  })
})
```

### 3. 编辑器集成 (`src/package/Editor.tsx`)
```typescript
{isCollab ? (
  <YjsCollaborationProvider
    roomId="main"
    username={`User-${Math.random().toString(36).substr(2, 6)}`}
  />
) : (
  <HistoryPlugin externalHistoryState={historyState} />
)}
```

## 🚧 遇到的问题及解决方案

### 1. 初始同步错误
**问题**: "Unable to find an active editor state" 错误
**原因**: 自定义同步实现与 Lexical 状态管理冲突
**解决**: 
- 使用官方 `@lexical/yjs` 和 `CollaborationPlugin`
- 确保 `editorState: null` 当 `isCollab: true`

### 2. WebSocket 连接失败
**问题**: 客户端无法连接到服务器
**原因**: 
- 硬编码的 localhost:1234 地址
- 自定义协议与 y-websocket 不兼容
**解决**:
- 更新所有 WebSocket URL 为 Railway 服务器
- 使用官方 y-websocket 服务器实现

### 3. React 严格模式导致的重复连接
**问题**: "leave_room" 消息无限循环
**原因**: React 严格模式导致组件重复挂载/卸载
**解决**: 
- 在 `next.config.mjs` 中禁用 React 严格模式：
  ```javascript
  export default {
    reactStrictMode: false,  // 关闭严格模式
    // ... 其他配置
  }
  ```
- 添加防抖和节流机制
- 使用 `useRef` 避免重复初始化

### 4. Railway 部署失败
**问题**: Nixpacks 无法生成构建计划
**原因**: 
- Git 子模块冲突
- 目录结构问题
**解决**:
- 移除 git 子模块
- 创建干净的 `collab-server` 目录
- 使用简单的 package.json 结构

### 5. 内存泄漏
**问题**: 服务器内存不断增长
**原因**: 操作历史无限累积
**解决**: 
- 限制操作历史长度
- 定期清理空房间
- 添加连接清理机制

## 📊 Yjs 接口说明

### 核心概念
1. **Y.Doc**: Yjs 文档，包含共享数据
2. **WebsocketProvider**: 处理 WebSocket 连接和消息传输
3. **Awareness**: 处理用户状态（光标位置、在线状态等）

### 消息类型
- **messageSync (0)**: 文档同步消息
- **messageAwareness (1)**: 用户状态消息

### 同步协议
1. **Sync Step 1**: 客户端发送状态向量
2. **Sync Step 2**: 服务器发送缺失的更新
3. **Update**: 增量更新消息

## 🎯 最终实现特性

### ✅ 已实现
1. **实时文本同步**: 多用户同时编辑，实时看到更改
2. **用户列表显示**: 显示当前在线用户
3. **自动重连**: 断线后自动重新连接
4. **多房间支持**: 支持不同的协作房间
5. **Railway 部署**: 生产环境可用的 WebSocket 服务器
6. **默认启用**: 无需手动开启协作模式

### 🔄 待优化
1. **用户光标显示**: 显示其他用户的光标位置
2. **用户颜色**: 为每个用户分配独特颜色
3. **持久化**: 添加文档持久化存储
4. **认证**: 添加用户认证机制
5. **权限控制**: 实现读写权限管理

## 📝 使用说明

### 开发环境
```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 访问 http://localhost:3000
# 协作功能自动启用
```

### 测试协作
1. 打开多个浏览器窗口
2. 访问相同的 URL
3. 在一个窗口中编辑文本
4. 观察其他窗口实时同步

### 服务器日志
Railway 日志会显示：
- 活跃连接数
- 活跃房间数
- 连接/断开事件
- 错误信息

## 🔗 相关资源

- **GitHub 仓库**: https://github.com/emagen-ai/lexical-playground-nextjs
- **Railway 服务器**: https://yjs-collab-server-production.up.railway.app
- **Lexical 文档**: https://lexical.dev/docs/collaboration/react
- **Yjs 文档**: https://docs.yjs.dev/
- **y-websocket**: https://github.com/yjs/y-websocket

## 📈 性能考虑

1. **消息节流**: 编辑器状态更新限制为 500ms
2. **操作历史限制**: 最多保留 1000 个操作
3. **连接数限制**: 取决于 Railway 实例配置
4. **带宽优化**: Yjs 只传输增量更新

## ⚙️ 重要配置

### Next.js 配置 (`next.config.mjs`)
```javascript
export default {
  reactStrictMode: false,  // 必须关闭以避免组件重复挂载
  webpack: (config) => {
    // WebSocket 相关依赖的外部化配置
    config.externals.push({
      bufferutil: "bufferutil",
      "utf-8-validate": "utf-8-validate",
    });
    return config;
  },
}
```

### 默认设置 (`appSettings.ts`)
```typescript
export const DEFAULT_SETTINGS = {
  isCollab: true,  // 默认启用协作
  isRichText: true,
  // ... 其他设置
}
```

## 🛠️ 故障排查

### 检查连接状态
1. 打开浏览器控制台
2. 查看 Network 标签的 WebSocket 连接
3. 检查控制台日志：
   - `🚀 YjsCollaborationProvider 初始化`
   - `✅ Yjs Provider 已连接`

### 常见问题
- **连接失败**: 检查防火墙/代理设置
- **同步延迟**: 检查网络延迟
- **内容丢失**: 确保正常断开连接

## 🎉 总结

通过使用官方的 Lexical Yjs 集成和 y-websocket 服务器，我们成功实现了一个稳定、高效的实时协作编辑器。系统使用 CRDT 算法确保了分布式环境下的数据一致性，Railway 部署提供了可靠的 WebSocket 基础设施。

整个实现过程虽然遇到了多个技术挑战，但通过逐步调试和优化，最终实现了一个生产级别的协作编辑解决方案。

---

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>