<script setup lang="ts">
import { computed, ref } from 'vue';
import { Heart, MessageCircle, Send, Trash2 } from '@lucide/vue';
import AppCard from '@/components/common/AppCard.vue';
import ImageGrid from './ImageGrid.vue';
import { commentsOf, imagesOf } from '@/services/diaryService';
import type { Diary, Mood } from '@/types/database';
import { formatDateTimeInTimezone } from '@/utils/date';

/**
 * DiaryCard — 时间轴日记卡片（Apple Journaling 质感）
 * 头部：作者化身 + 昵称 + 时间 + 心情胶囊；正文 leading-relaxed；
 * 媒体网格 + 灯箱；底部点赞心动 + 伴侣评论气泡；双击卡片亦可点赞。
 */
const props = defineProps<{
  diary: Diary;
  author: { nickname: string; avatarUrl: string };
  mediaUrls: Record<string, string>;
  myId: string | null;
  timezone: string;
  /** 仅作者可见删除 */
  isAuthor: boolean;
}>();

const emit = defineEmits<{
  like: [];
  comment: [content: string];
  remove: [];
  openImage: [urls: string[], index: number];
}>();

const MOOD_LABELS: Record<Mood, string> = {
  calm: '平静',
  happy: '开心',
  tired: '疲惫',
  caring: '关怀',
  sleepy: '困倦',
};

const urls = computed(() =>
  imagesOf(props.diary).map((p) => props.mediaUrls[p] ?? p),
);

const comments = computed(() => commentsOf(props.diary));

const liked = computed(() =>
  props.myId ? props.diary.liked_by.includes(props.myId) : false,
);

const mood = computed<Mood | null>(() => (props.diary.mood as Mood | null) ?? null);

const timeLabel = computed(() =>
  formatDateTimeInTimezone(props.diary.created_at, props.timezone),
);

// ---------------------------------------------------------------- 评论输入

const commentOpen = ref(false);
const commentText = ref('');

function submitComment(): void {
  const text = commentText.value.trim();
  if (!text) return;
  emit('comment', text);
  commentText.value = '';
  commentOpen.value = false;
}
</script>

<template>
  <AppCard @dblclick="emit('like')">
    <!-- 头部 -->
    <div class="flex items-center gap-2.5">
      <img
        :src="author.avatarUrl"
        :alt="author.nickname"
        class="size-9 shrink-0 rounded-full bg-white object-cover ring-1 ring-separator"
      />
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium">{{ author.nickname }}</p>
        <p class="text-[10px] text-fg-soft tabular-nums">{{ timeLabel }}</p>
      </div>
      <span
        v-if="mood"
        class="flex shrink-0 items-center gap-1 rounded-full bg-card-2 px-2 py-0.5 text-[10px] text-fg-soft"
      >
        <span class="size-1.5 rounded-full bg-serene" />
        {{ MOOD_LABELS[mood] }}
      </span>
    </div>

    <!-- 标题与正文 -->
    <h3 v-if="diary.title" class="mt-3 text-base font-semibold">{{ diary.title }}</h3>
    <p class="mt-2 text-sm leading-relaxed whitespace-pre-line text-fg">
      {{ diary.content }}
    </p>

    <!-- 媒体 -->
    <div class="mt-3">
      <ImageGrid :urls="urls" @open="(i: number) => emit('openImage', urls, i)" />
    </div>

    <!-- 操作栏 -->
    <div class="mt-3 flex items-center gap-4 border-t border-separator pt-2.5">
      <button
        type="button"
        class="flex items-center gap-1.5 text-xs transition-all duration-200 ease-out-quart active:scale-90"
        :class="liked ? 'text-rose' : 'text-fg-soft'"
        :aria-label="liked ? '取消心动' : '心动'"
        @click="emit('like')"
      >
        <Heart :size="16" :fill="liked ? 'currentColor' : 'none'" :stroke-width="2" />
        <span v-if="diary.liked_by.length > 0" class="tabular-nums">
          {{ diary.liked_by.length }}
        </span>
      </button>

      <button
        type="button"
        class="flex items-center gap-1.5 text-xs text-fg-soft transition-all duration-200 ease-out-quart active:scale-90"
        aria-label="回复"
        @click="commentOpen = !commentOpen"
      >
        <MessageCircle :size="16" :stroke-width="2" />
        <span v-if="comments.length > 0" class="tabular-nums">{{ comments.length }}</span>
      </button>

      <button
        v-if="isAuthor"
        type="button"
        class="ml-auto flex items-center gap-1 text-xs text-fg-mute transition-all duration-200 ease-out-quart active:scale-90"
        aria-label="删除日记"
        @click="emit('remove')"
      >
        <Trash2 :size="14" :stroke-width="2" />
      </button>
    </div>

    <!-- 评论气泡 -->
    <div v-if="comments.length > 0" class="mt-2 flex flex-col gap-1.5">
      <div
        v-for="(c, i) in comments"
        :key="i"
        class="rounded-2xl rounded-tl-sm bg-card-2 px-3 py-2 text-xs"
      >
        <span class="font-medium text-serene">{{ c.nickname }}：</span>
        <span class="text-fg-soft">{{ c.content }}</span>
      </div>
    </div>

    <!-- 评论输入 -->
    <div v-if="commentOpen" class="mt-2 flex items-center gap-2">
      <input
        v-model="commentText"
        type="text"
        maxlength="100"
        placeholder="说点什么…"
        class="h-9 min-w-0 flex-1 rounded-full border border-separator bg-card-2 px-3.5 text-xs text-fg placeholder-fg-mute outline-none focus:border-serene/50"
        @keyup.enter="submitComment"
      />
      <button
        type="button"
        class="flex size-9 shrink-0 items-center justify-center rounded-full bg-serene text-on-accent transition-transform duration-200 ease-out-quart active:scale-90"
        aria-label="发送回复"
        @click="submitComment"
      >
        <Send :size="14" :stroke-width="2.2" />
      </button>
    </div>
  </AppCard>
</template>
