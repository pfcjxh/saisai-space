/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import type { PrecacheEntry } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { clientsClaim } from 'workbox-core';

/**
 * 赛赛 · Service Worker（injectManifest 模式）
 *
 * 三块职责：
 * 1. App Shell 预缓存（Stale-While-Revalidate 由 workbox-precaching 内建）；
 * 2. 运行时缓存：Open-Meteo 天气 / 外部字体 Cache-First 6h，
 *    Supabase 数据请求 Network-First（离线回退最近快照）；
 * 3. Web Push：push 事件唤起系统通知；notificationclick 聚焦或唤起 PWA
 *    并按 payload.data.url 路由。
 */

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

// ---------------------------------------------------------------- 生命周期

self.skipWaiting();
clientsClaim();

// ---------------------------------------------------------------- 预缓存与路由

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA 路由全部回退到离线可渲染的 index.html
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// ---------------------------------------------------------------- 运行时缓存

registerRoute(
  /^https:\/\/api\.open-meteo\.com\/.*$/i,
  new CacheFirst({
    cacheName: 'open-meteo-weather',
    plugins: [
      new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 6 * 60 * 60 }),
    ],
  }),
);

// 地理编码：把用户填写的任意城市名解析为坐标（支持改成任何城市）。
// 坐标结果长期不变，缓存 30 天以减少请求。
registerRoute(
  /^https:\/\/geocoding-api\.open-meteo\.com\/.*$/i,
  new CacheFirst({
    cacheName: 'open-meteo-geocoding',
    plugins: [
      new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  }),
);

registerRoute(
  /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*$/i,
  new CacheFirst({
    cacheName: 'web-fonts',
    plugins: [new ExpirationPlugin({ maxEntries: 16, maxAgeSeconds: 6 * 60 * 60 })],
  }),
);

registerRoute(
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/.*$/i,
  new NetworkFirst({
    cacheName: 'supabase-api',
    networkTimeoutSeconds: 10,
    plugins: [
      new ExpirationPlugin({ maxEntries: 128, maxAgeSeconds: 24 * 60 * 60 }),
    ],
  }),
);

// ---------------------------------------------------------------- Web Push

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: { url?: string };
}

const DEFAULT_ICON = '/icons/icon-192.png';

function parsePushPayload(event: PushEvent): PushPayload {
  const fallback: PushPayload = { title: '赛赛', body: '有新的消息', data: { url: '/today' } };
  try {
    const raw = event.data?.text();
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return fallback;
    const record = parsed as Record<string, unknown>;
    const data = typeof record.data === 'object' && record.data !== null
      ? (record.data as Record<string, unknown>)
      : {};
    return {
      title: typeof record.title === 'string' ? record.title : fallback.title,
      body: typeof record.body === 'string' ? record.body : fallback.body,
      icon: typeof record.icon === 'string' ? record.icon : DEFAULT_ICON,
      badge: typeof record.badge === 'string' ? record.badge : DEFAULT_ICON,
      data: { url: typeof data.url === 'string' ? data.url : '/today' },
    };
  } catch {
    return fallback;
  }
}

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon ?? DEFAULT_ICON,
      badge: payload.badge ?? DEFAULT_ICON,
      data: { url: payload.data?.url ?? '/today' },
      tag: 'saisai-push',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = event.notification.data as { url?: unknown } | null;
  const url = typeof raw?.url === 'string' ? raw.url : '/today';

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clientList) {
        const windowClient = client as WindowClient;
        if ('focus' in windowClient) {
          await windowClient.navigate(url);
          return windowClient.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});

// ---------------------------------------------------------------- 立即接管新版本

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});