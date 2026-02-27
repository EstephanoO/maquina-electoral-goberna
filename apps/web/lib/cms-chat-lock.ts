"use client";

const LOCK_STORAGE_KEY = "goberna:cms-chat-locks:v1";
const PENDING_OPEN_STORAGE_KEY = "goberna:cms-chat-pending-open:v1";
const LOCK_TTL_MS = 20 * 60 * 1000;
const PENDING_TTL_MS = 10 * 60 * 1000;

export type CmsChatLockEntry = {
  campaignId: string;
  contactId: string;
  lockedByUserId: string;
  lockedByName: string;
  lockedAt: number;
  contacted: boolean;
};

type LockStore = Record<string, CmsChatLockEntry>;

type PendingOpen = {
  campaignId: string;
  contactId: string;
  createdAt: number;
};

function getLockKey(campaignId: string, contactId: string): string {
  return `${campaignId}:${contactId}`;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore localStorage quota errors.
  }
}

function isLockExpired(lock: CmsChatLockEntry, nowMs: number): boolean {
  if (lock.contacted) return false;
  return nowMs - lock.lockedAt >= LOCK_TTL_MS;
}

function cleanupLocks(store: LockStore, nowMs: number): { cleaned: LockStore; changed: boolean } {
  const cleaned: LockStore = {};
  let changed = false;

  for (const [key, lock] of Object.entries(store)) {
    if (!lock || !lock.campaignId || !lock.contactId || !lock.lockedByUserId) {
      changed = true;
      continue;
    }
    if (isLockExpired(lock, nowMs)) {
      changed = true;
      continue;
    }
    cleaned[key] = lock;
  }

  return { cleaned, changed };
}

function readAndCleanStore(nowMs = Date.now()): LockStore {
  const store = readJson<LockStore>(LOCK_STORAGE_KEY, {});
  const { cleaned, changed } = cleanupLocks(store, nowMs);
  if (changed) {
    writeJson(LOCK_STORAGE_KEY, cleaned);
  }
  return cleaned;
}

function writeStore(store: LockStore): void {
  writeJson(LOCK_STORAGE_KEY, store);
}

export function getCampaignLocks(campaignId: string, nowMs = Date.now()): Record<string, CmsChatLockEntry> {
  if (!campaignId) return {};
  const store = readAndCleanStore(nowMs);
  const result: Record<string, CmsChatLockEntry> = {};

  for (const lock of Object.values(store)) {
    if (lock.campaignId !== campaignId) continue;
    result[lock.contactId] = lock;
  }

  return result;
}

export function claimContactLock(args: {
  campaignId: string;
  contactId: string;
  userId: string;
  userName: string;
  nowMs?: number;
}): { ok: boolean; lock?: CmsChatLockEntry; reason?: string } {
  const { campaignId, contactId, userId, userName, nowMs = Date.now() } = args;
  if (!campaignId || !contactId || !userId) {
    return { ok: false, reason: "missing_data" };
  }

  const store = readAndCleanStore(nowMs);
  const key = getLockKey(campaignId, contactId);
  const existing = store[key];

  if (existing && existing.lockedByUserId !== userId) {
    return { ok: false, lock: existing, reason: "locked_by_other" };
  }

  const nextLock: CmsChatLockEntry = existing
    ? {
      ...existing,
      lockedByName: userName || existing.lockedByName,
      lockedAt: nowMs,
    }
    : {
      campaignId,
      contactId,
      lockedByUserId: userId,
      lockedByName: userName || "Operador",
      lockedAt: nowMs,
      contacted: false,
    };

  store[key] = nextLock;
  writeStore(store);
  return { ok: true, lock: nextLock };
}

export function markContactLockAsContacted(args: {
  campaignId: string;
  contactId: string;
  userId: string;
}): void {
  const { campaignId, contactId, userId } = args;
  if (!campaignId || !contactId || !userId) return;

  const store = readAndCleanStore();
  const key = getLockKey(campaignId, contactId);
  const existing = store[key];
  if (!existing) return;
  if (existing.lockedByUserId !== userId) return;
  if (existing.contacted) return;

  store[key] = { ...existing, contacted: true };
  writeStore(store);
}

export function releaseContactLock(args: {
  campaignId: string;
  contactId: string;
  userId?: string;
}): void {
  const { campaignId, contactId, userId } = args;
  if (!campaignId || !contactId) return;

  const store = readAndCleanStore();
  const key = getLockKey(campaignId, contactId);
  const existing = store[key];
  if (!existing) return;
  if (userId && existing.lockedByUserId !== userId) return;

  delete store[key];
  writeStore(store);
}

export function setPendingOpenContact(campaignId: string, contactId: string, nowMs = Date.now()): void {
  if (!campaignId || !contactId) return;
  const payload: PendingOpen = { campaignId, contactId, createdAt: nowMs };
  writeJson(PENDING_OPEN_STORAGE_KEY, payload);
}

export function consumePendingOpenContact(campaignId: string, nowMs = Date.now()): string | null {
  if (!campaignId) return null;
  if (!isBrowser()) return null;
  const payload = readJson<PendingOpen | null>(PENDING_OPEN_STORAGE_KEY, null);
  if (!payload) return null;

  window.localStorage.removeItem(PENDING_OPEN_STORAGE_KEY);

  if (payload.campaignId !== campaignId) return null;
  if (!payload.contactId) return null;
  if (nowMs - payload.createdAt > PENDING_TTL_MS) return null;

  return payload.contactId;
}
