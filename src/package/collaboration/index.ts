export { RealtimeCollaborationProvider, useRealtimeCollaboration } from './RealtimeCollaborationProvider';
export { CollaborationPlugin } from './CollaborationPlugin';
export type { CollabUser, CollabOperation } from './RealtimeCollaborationProvider';

// Re-export for backward compatibility with the original collaboration.ts
export { createWebsocketProvider } from '../collaboration';