#!/usr/bin/env node

/**
 * 官方 y-websocket 服务器
 * 
 * 这是一个基于官方 y-websocket 包的简单服务器实现
 * 支持多房间协作和文档持久化
 */

const WebSocket = require('ws')
const http = require('http')
const { setupWSConnection } = require('y-websocket/bin/utils')

const PORT = process.env.PORT || 9090

// 创建 HTTP 服务器
const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' })
  response.end('Yjs WebSocket Server\n')
})

// 创建 WebSocket 服务器
const wss = new WebSocket.Server({ 
  server,
  verifyClient: (info) => {
    console.log('WebSocket 连接请求:', {
      origin: info.origin,
      url: info.req.url,
      userAgent: info.req.headers['user-agent']
    })
    return true // 允许所有连接
  }
})

// 连接统计
let connectionCount = 0
const rooms = new Set()

wss.on('connection', (ws, req) => {
  connectionCount++
  const connId = connectionCount
  
  console.log(`[${connId}] 新的 WebSocket 连接`)
  console.log(`[${connId}] URL: ${req.url}`)
  console.log(`[${connId}] 总连接数: ${wss.clients.size}`)
  
  // 解析房间名称
  const url = new URL(req.url, 'http://localhost')
  const roomName = url.pathname.slice(1) || 'default'
  rooms.add(roomName)
  
  console.log(`[${connId}] 加入房间: ${roomName}`)
  console.log(`[${connId}] 活跃房间: ${Array.from(rooms).join(', ')}`)
  
  // 使用官方 y-websocket 工具函数设置连接
  setupWSConnection(ws, req, {
    // 可选：添加认证逻辑
    authenticate: (auth) => {
      console.log(`[${connId}] 认证信息:`, auth)
      return true // 暂时允许所有连接
    },
    // 可选：添加文档持久化 (暂时禁用)
    persistence: null
  })
  
  // 监听连接关闭
  ws.on('close', (code, reason) => {
    console.log(`[${connId}] 连接关闭 - 代码: ${code}, 原因: ${reason}`)
    console.log(`[${connId}] 剩余连接数: ${wss.clients.size}`)
  })
  
  ws.on('error', (error) => {
    console.error(`[${connId}] WebSocket 错误:`, error)
  })
})

// 服务器错误处理
wss.on('error', (error) => {
  console.error('WebSocket 服务器错误:', error)
})

// 启动服务器
server.listen(PORT, () => {
  console.log('=================================')
  console.log(`🚀 Yjs WebSocket 服务器已启动`)
  console.log(`📡 端口: ${PORT}`)
  console.log(`🔗 WebSocket URL: ws://localhost:${PORT}`)
  console.log(`🌐 HTTP URL: http://localhost:${PORT}`)
  console.log('=================================')
})

// 优雅关闭处理
const gracefulShutdown = (signal) => {
  console.log(`\n收到 ${signal} 信号，正在优雅关闭服务器...`)
  
  // 关闭 WebSocket 服务器
  wss.close(() => {
    console.log('WebSocket 服务器已关闭')
    
    // 关闭 HTTP 服务器
    server.close(() => {
      console.log('HTTP 服务器已关闭')
      console.log('服务器完全关闭，再见！👋')
      process.exit(0)
    })
  })
}

// 监听终止信号
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// 定期输出统计信息
setInterval(() => {
  console.log(`📊 统计 - 活跃连接: ${wss.clients.size}, 活跃房间: ${rooms.size}`)
  if (rooms.size > 0) {
    console.log(`📋 房间列表: ${Array.from(rooms).join(', ')}`)
  }
}, 30000)

// 进程异常处理
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error)
  gracefulShutdown('uncaughtException')
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise 拒绝:', reason, 'at:', promise)
})