import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { useAppStore } from './stores/app';
import { initTheme } from '@/composables/useTheme';
import { reportError } from '@/utils/errors';
import { registerSW } from 'virtual:pwa-register';
import './styles/main.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

// ---------------------------------------------------------------- 全局错误兜底
// 三层覆盖：Vue 内部（渲染/事件/生命周期/watch）→ 路由懒加载 → 浏览器全局。
// 此前项目没有任何兜底，任何一个未捕获异常都会静默失败且无从排查。

app.config.errorHandler = (err, _instance, info) => {
  reportError(err, { operation: `vue:${info}` });
};

// Vue 默认在生产环境只打 console 不抛出，错误监控因此收不到线上错误
app.config.throwUnhandledErrorInProduction = true;

window.addEventListener('error', (event) => {
  reportError(event.error ?? event.message, { operation: 'window.error' });
});

window.addEventListener('unhandledrejection', (event) => {
  reportError(event.reason, { operation: 'window.unhandledrejection' });
});

// 部署后旧页面去 import 已被删除的 chunk 会 404（Vite 官方推荐的处置方式）。
// 加 sessionStorage 标志防 reload 循环：只在一次会话里自动重载一次。
window.addEventListener('vite:preloadError', (event) => {
  reportError(event.payload, { operation: 'vite:preloadError' });
  const KEY = 'saisai:preload-reloaded';
  if (sessionStorage.getItem(KEY)) return;
  sessionStorage.setItem(KEY, '1');
  window.location.reload();
});

// 路由懒加载失败（同样常见于部署切换瞬间）
router.onError((err) => {
  reportError(err, { operation: 'router' });
});

// ---------------------------------------------------------------- 启动

useAppStore().bindNetworkListeners();

// 挂载前重放持久化主题（index.html 内联脚本已负责首帧，这里接管监听与状态）
initTheme();

app.mount('#app');

// ---------------------------------------------------------------- 版本自动更新
//
// 修复（用户反馈「生理期用不了 / 天气改不了」的真因之一）：
// vite.config.ts 配了 registerType: 'autoUpdate'，但本项目**从未导入
// virtual:pwa-register**——index.html 里注入的 registerSW.js 只是最朴素的
// `navigator.serviceWorker.register(...)`，不含任何更新检测。结果：
// 新版本部署后 Service Worker 虽在后台更新成功，已打开的页面**不会重载**，
// 用户手机长期停留在旧 bundle（旧版生理期页对伴侣视角是只读的，
// 于是「点开生理期没有办法记录」——功能其实早已上线，只是没送达）。
//
// 现在显式注册并启用自动更新：检测到新版本即自动 skipWaiting 并重载一次。
// 重载用定时器错开，避免与首屏挂载竞争。
registerSW({
  immediate: true,
  onNeedRefresh() {
    window.setTimeout(() => window.location.reload(), 800);
  },
});
