import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { useAppStore } from './stores/app';
import { initTheme } from '@/composables/useTheme';
import './styles/main.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

useAppStore().bindNetworkListeners();

// 挂载前重放持久化主题（index.html 内联脚本已负责首帧，这里接管监听与状态）
initTheme();

app.mount('#app');
