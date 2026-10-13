<script setup lang="ts">
import { ref } from 'vue';
import { Check, ListTodo } from '@lucide/vue';
import AppCard from '@/components/common/AppCard.vue';
import IconTile from '@/components/common/IconTile.vue';
import CharacterAvatar from '@/components/common/CharacterAvatar.vue';
import type { Todo } from '@/types/database';

/**
 * 今日待办速览（参考设计：淡紫左色条 + 列表瓷贴 + 编号极简行）。
 * 最多 2 条，勾选即时乐观划线，450ms 后由父级移除并同步数据库。
 */
const props = defineProps<{ todos: Todo[] }>();

const emit = defineEmits<{ toggle: [todo: Todo, completed: boolean] }>();

/** 正在播放完成划线动画的任务 id */
const completingIds = ref<ReadonlySet<string>>(new Set());

function isCompleting(id: string): boolean {
  return completingIds.value.has(id);
}

function onToggle(todo: Todo): void {
  if (isCompleting(todo.id)) return;
  const next = new Set(completingIds.value);
  next.add(todo.id);
  completingIds.value = next;
  emit('toggle', todo, true);
}
</script>

<template>
  <AppCard accent="lilac">
    <div class="flex items-center gap-3">
      <IconTile tone="lilac">
        <ListTodo :size="20" :stroke-width="1.8" />
      </IconTile>
      <p class="text-sm font-medium">
        今日待办
        <span class="ml-1 text-xs text-fg-soft tabular-nums">· {{ props.todos.length }} 项</span>
      </p>
    </div>

    <!-- 治愈空状态 -->
    <div
      v-if="props.todos.length === 0"
      class="flex flex-col items-center gap-2 py-4 text-center"
    >
      <CharacterAvatar character="hachi" mood="sleepy" :size="44" />
      <p class="text-xs text-fg-soft">今日待办已清空，贴贴就好</p>
    </div>

    <ol v-else class="mt-2 flex flex-col">
      <li
        v-for="(todo, index) in props.todos"
        :key="todo.id"
        class="flex items-center gap-2.5 border-b border-separator py-2.5 last:border-b-0 last:pb-0"
      >
        <span class="w-4 text-xs text-fg-mute tabular-nums">{{ index + 1 }}.</span>
        <button
          type="button"
          class="flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-all duration-200 ease-out-quart active:scale-90"
          :class="isCompleting(todo.id) ? 'border-lilac bg-lilac' : 'border-neutral-600'"
          :aria-label="`完成「${todo.title}」`"
          @click="onToggle(todo)"
        >
          <Check v-if="isCompleting(todo.id)" :size="12" class="text-on-accent" :stroke-width="3" />
        </button>
        <span
          class="min-w-0 flex-1 truncate text-sm transition-colors duration-300"
          :class="isCompleting(todo.id) ? 'text-fg-mute line-through' : 'text-fg'"
        >
          {{ todo.title }}
        </span>
      </li>
    </ol>
  </AppCard>
</template>
