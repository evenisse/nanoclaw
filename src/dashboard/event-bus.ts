import { EventEmitter } from 'events';

export type DashboardEvent =
  | { type: 'session-status'; sessionId: string; agentGroupId: string; containerStatus: string }
  | { type: 'tool-active'; sessionId: string; agentGroupId: string; tool: string; startedAt: string }
  | { type: 'tool-done'; sessionId: string; agentGroupId: string }
  | { type: 'sweep-tick'; timestamp: string };

export const dashboardBus = new EventEmitter();
dashboardBus.setMaxListeners(0);

export function emitDashboardEvent(event: DashboardEvent): void {
  dashboardBus.emit('event', event);
}
