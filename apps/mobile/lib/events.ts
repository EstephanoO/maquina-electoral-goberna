/**
 * Minimal typed event emitter for cross-screen communication.
 *
 * Avoids polling: screens subscribe to specific events and only
 * re-render when data actually changes.
 *
 * Usage:
 *   appEvents.emit('forms:changed');
 *   const unsub = appEvents.on('forms:changed', () => loadData());
 *   // later: unsub();
 */

type EventName = 'forms:changed' | 'meets:changed' | 'members:changed';
type Listener = () => void;

const listeners = new Map<EventName, Set<Listener>>();

function on(event: EventName, fn: Listener): () => void {
  let set = listeners.get(event);
  if (!set) {
    set = new Set();
    listeners.set(event, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
  };
}

function emit(event: EventName): void {
  const set = listeners.get(event);
  if (set) {
    for (const fn of set) {
      try {
        fn();
      } catch {
        // never break emitter loop
      }
    }
  }
}

export const appEvents = { on, emit };
