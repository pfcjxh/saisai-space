import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

declare module 'vue-router' {
  interface RouteMeta {
    /** 标记为公开路由，未登录也可访问 */
    public?: boolean;
    /** 隐藏底部 TabBar（登录/配对等全屏流程页） */
    hideTabBar?: boolean;
    /** 页面标题（用于 document.title 与 TabBar 语义） */
    title?: string;
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/auth',
    name: 'auth',
    component: () => import('@/views/AuthView.vue'),
    meta: { public: true, hideTabBar: true, title: '登录' },
  },
  { path: '/', redirect: '/today' },
  {
    path: '/today',
    name: 'today',
    component: () => import('@/views/TodayView.vue'),
    // 允许未登录访问：Today 内置 Mock 演示模式，不产生任何真实数据请求泄露
    meta: { title: '今日', public: true },
  },
  {
    path: '/together',
    name: 'together',
    component: () => import('@/views/TogetherView.vue'),
    // 各 Tab 均开放未登录访问：未登录时进入 Mock 演示模式，数据仅本地生效
    meta: { title: '我们', public: true },
  },
  {
    path: '/cycle',
    name: 'cycle',
    component: () => import('@/views/CycleView.vue'),
    meta: { title: '生理期', public: true },
  },
  {
    path: '/diary',
    name: 'diary',
    component: () => import('@/views/DiaryView.vue'),
    meta: { title: '日记', public: true },
  },
  {
    path: '/wishes',
    name: 'wishes',
    component: () => import('@/views/WishesView.vue'),
    meta: { title: '心愿', public: true },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    // 与其他 Tab 一致开放未登录访问：未登录时进入演示态，可预览界面
    meta: { title: '设置', public: true },
  },
  { path: '/:pathMatch(.*)*', redirect: '/today' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

/**
 * 鉴权守卫：
 * - 首次导航前确保 Supabase 会话已恢复；
 * - 非公开路由要求已登录，否则重定向至 /auth；
 * - /auth 始终可达：已登录未配对的用户需停留在此完成"创建空间/邀请码配对"，
 *   配对完成与否由 AuthView 自行判定并跳转。
 */
router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.ensureSession();

  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: 'auth' };
  }
  return true;
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · 赛赛` : '赛赛 · 双人空间';
});
