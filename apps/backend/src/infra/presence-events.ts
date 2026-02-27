/**
 * Presence event bus — decouples auth (login/logout) from agents (SSE broadcast).
 *
 * Auth module emits events when users log in / log out.
 * Agents module listens and broadcasts to SSE dashboard clients.
 *
 * This avoids circular dependencies between modules.
 */

export type PresenceEvent = {
  userId: string;
  userName: string;
  campaignIds: string[];
};

type PresenceListener = (event: PresenceEvent) => void;

const onLoginListeners: PresenceListener[] = [];
const onLogoutListeners: PresenceListener[] = [];

export function onAgentLogin(listener: PresenceListener): void {
  onLoginListeners.push(listener);
}

export function onAgentLogout(listener: PresenceListener): void {
  onLogoutListeners.push(listener);
}

export function emitAgentLogin(event: PresenceEvent): void {
  for (const listener of onLoginListeners) {
    try {
      listener(event);
    } catch {
      // listener errors should not propagate
    }
  }
}

export function emitAgentLogout(event: PresenceEvent): void {
  for (const listener of onLogoutListeners) {
    try {
      listener(event);
    } catch {
      // listener errors should not propagate
    }
  }
}
