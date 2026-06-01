'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'

const TTL_MS = 30_000

type CacheEntry = {
  data?: unknown
  error: Error | null
  updatedAt: number
  loading: boolean
}

const store = new Map<string, CacheEntry>()
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach(l => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(key: string): CacheEntry | undefined {
  return store.get(key)
}

async function fetchResource<T>(key: string, force = false): Promise<T | undefined> {
  const now = Date.now()
  const existing = store.get(key)
  if (!force && existing?.data !== undefined && now - existing.updatedAt < TTL_MS) {
    return existing.data as T
  }

  store.set(key, {
    data: existing?.data,
    error: null,
    updatedAt: existing?.updatedAt ?? 0,
    loading: true,
  })
  notify()

  try {
    const res = await fetch(key, { cache: 'no-store' })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      const message =
        typeof payload === 'object' &&
        payload !== null &&
        'error' in payload &&
        typeof (payload as { error: unknown }).error === 'string'
          ? (payload as { error: string }).error
          : 'Request failed'
      throw new Error(message)
    }
    store.set(key, { data: payload, error: null, updatedAt: Date.now(), loading: false })
    notify()
    return payload as T
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Request failed')
    store.set(key, {
      data: existing?.data,
      error,
      updatedAt: Date.now(),
      loading: false,
    })
    notify()
    throw error
  }
}

export function useDashboardResource<T>(key: string) {
  const entry = useSyncExternalStore(
    subscribe,
    () => getSnapshot(key),
    () => undefined,
  )

  useEffect(() => {
    void fetchResource<T>(key).catch(() => {})
  }, [key])

  const mutate = useCallback(async () => {
    return fetchResource<T>(key, true)
  }, [key])

  return {
    data: entry?.data as T | undefined,
    error: entry?.error ?? null,
    isLoading: !entry || (entry.loading && entry.data === undefined),
    isValidating: entry?.loading ?? false,
    mutate,
  }
}

export function useDashboardHome<T>() {
  return useDashboardResource<T>('/api/dashboard/home')
}

export function useTasksSummary<T>() {
  return useDashboardResource<T>('/api/dashboard/tasks-summary')
}
