const WebSocket = require('ws');
const Y = require('yjs');

const PORT = process.env.PORT || 9090;

// 创建 WebSocket 服务器
const wss = new WebSocket.Server({ 
  port: PORT,
  verifyClient: (info) => {
    console.log('WebSocket 连接请求:', {
      origin: info.origin,
      url: info.req.url
    });
    return true; // 允许所有连接
  }
});

// 存储房间的 Yjs 文档
const docs = new Map();

function getDoc(docname) {
  let doc = docs.get(docname);
  if (!doc) {
    doc = new Y.Doc();
    docs.set(docname, doc);
    console.log(`创建新文档: ${docname}`);
  }
  return doc;
}

wss.on('connection', (ws, req) => {
  console.log('新的 WebSocket 连接');
  
  // 解析 URL 获取房间ID
  const url = new URL(req.url, 'http://localhost');
  const docname = url.pathname.slice(1) || 'default';
  
  console.log(`客户端加入房间: ${docname}`);
  
  const doc = getDoc(docname);
  
  // 处理消息
  ws.on('message', (message) => {
    try {
      // Yjs 使用 Uint8Array 格式的消息
      const uint8Array = new Uint8Array(message);
      
      // 应用更新到文档
      Y.applyUpdate(doc, uint8Array);
      
      // 广播给同一房间的其他客户端
      wss.clients.forEach((client) => {
        if (client !== ws && 
            client.readyState === WebSocket.OPEN && 
            client.docname === docname) {
          client.send(uint8Array);
        }
      });
      
      console.log(`转发消息到房间 ${docname}, 消息长度: ${uint8Array.length}`);
    } catch (error) {
      console.error('处理消息错误:', error);
    }
  });
  
  // 设置客户端的房间名称
  ws.docname = docname;
  
  // 发送当前文档状态给新客户端
  const stateVector = Y.encodeStateVector(doc);
  const update = Y.encodeStateAsUpdate(doc, stateVector);
  if (update.length > 0) {
    ws.send(update);
    console.log(`发送初始状态给新客户端, 大小: ${update.length}`);
  }
  
  // 监听文档更新
  const updateHandler = (update, origin) => {
    if (origin !== ws) {
      ws.send(update);
    }
  };
  
  doc.on('update', updateHandler);
  
  ws.on('close', () => {
    console.log(`客户端断开连接，房间: ${docname}`);
    doc.off('update', updateHandler);
    
    // 检查是否还有其他客户端在这个房间
    const hasOtherClients = Array.from(wss.clients).some(
      client => client.docname === docname && client.readyState === WebSocket.OPEN
    );
    
    if (!hasOtherClients) {
      console.log(`房间 ${docname} 已空，保留文档`);
      // 可以选择在这里清理文档或保持持久化
    }
  });
  
  ws.on('error', (error) => {
    console.error(`WebSocket 错误:`, error);
  });
});

wss.on('error', (error) => {
  console.error('WebSocket 服务器错误:', error);
});

console.log(`Yjs WebSocket 服务器运行在端口 ${PORT}`);
console.log(`WebSocket URL: ws://localhost:${PORT}`);

// 优雅关闭
process.on('SIGINT', () => {
  console.log('正在关闭服务器...');
  wss.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

// 定期清理空文档
setInterval(() => {
  console.log(`活跃文档数量: ${docs.size}, 活跃连接: ${wss.clients.size}`);
}, 30000);