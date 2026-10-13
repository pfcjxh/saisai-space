<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Droplet, Lock } from '@lucide/vue';
import AppButton from '@/components/common/AppButton.vue';
import { useKeyboardAvoid } from '@/composables/useKeyboardAvoid';
import type {
  FlowLevel,
  Mood,
  PainLevel,
  PeriodLog,
  PeriodSymptom,
  PeriodVisibility,
} from '@/types/database';

/**
 * PeriodLogSheet — 双层隐私打卡抽屉
 * 经量/痛感/症状/心情/备注 + 隐私开关：
 *   shared  公开给 TA（伴侣可见轻量状态）
 *   private 仅自己可见（数据库 RLS 强隔离，伴侣端查询返回空）
 */
export interface PeriodLogFormPayload {
  log_date: string;
  flow_level: FlowLevel | null;
  pain_level: PainLevel | null;
  mood: Mood | null;
  symptoms: string[];
  visibility: PeriodVisibility;
  notes: string | null;
}

const props = defineProps<{
  open: boolean;
  /** 打卡日期 YYYY-MM-DD */
  date: string;
  existing: PeriodLog | null;
}>();

const emit = defineEmits<{
  close: [];
  save: [payload: PeriodLogFormPayload];
  remove: [];
}>();

const PAIN_OPTIONS: { value: PainLevel; label: string }[] = [
  { value: 0, label: '无痛' },
  { value: 1, label: '微痛' },
  { value: 2, label: '轻度' },
  { value: 3, label: '明显' },
  { value: 4, label: '较重' },
  { value: 5, label: '剧烈' },
];

const SYMPTOM_OPTIONS: PeriodSymptom[] = [
  '腰酸',
  '腹胀',
  '疲惫',
  '嗜睡',
  '胸胀',
  '情绪低落',
];

const MOOD_OPTIONS: { value: Mood; label: string }[] = [
  { value: 'calm', label: '平静' },
  { value: 'happy', label: '开心' },
  { value: 'tired', label: '疲惫' },
  { value: 'caring', label: '被关怀' },
  { value: 'sleepy', label: '困倦' },
];

const flow = ref<FlowLevel | null>(null);
const pain = ref<PainLevel | null>(null);
const mood = ref<Mood | null>(null);
const symptoms = ref<Set<string>>(new Set());
const notes = ref('');
const visibility = ref<PeriodVisibility>('shared');

function symptomsFromExisting(existing: PeriodLog | null): Set<string> {
  if (!existing || !Array.isArray(existing.symptoms)) return new Set();
  return new Set(existing.symptoms.filter((s): s is string => typeof s === 'string'));
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    flow.value = props.existing?.flow_level ?? null;
    pain.value = props.existing?.pain_level ?? null;
    mood.value = (props.existing?.mood as Mood | null) ?? null;
    symptoms.value = symptomsFromExisting(props.existing);
    notes.value = props.existing?.notes ?? '';
    visibility.value = props.existing?.visibility ?? 'shared';
  },
);

function toggleSymptom(s: PeriodSymptom): void {
  const next = new Set(symptoms.value);
  if (next.has(s)) {
    next.delete(s);
  } else {
    next.add(s);
  }
  symptoms.value = next;
}

function onSave(): void {
  emit('save', {
    log_date: props.date,
    flow_level: flow.value,
    pain_level: pain.value,
    mood: mood.value,
    symptoms: [...symptoms.value],
    visibility: visibility.value,
    notes: notes.value.trim() || null,
  });
}

// ---------------------------------------------------------------- 键盘避让
// 逻辑统一由 useKeyboardAvoid 提供（原为 6 处逐行重复的实现）

const keyboardOffset = useKeyboardAvoid(computed(() => props.open));

function pillClass(active: boolean): string {
  return active
    ? 'border-rose/40 bg-rose/15 text-rose'
    : 'border-transparent bg-card-2 text-fg-soft';
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
        @click="emit('close')"
      />
    </Transition>

    <Transition name="sheet">
      <div
        v-if="open"
        class="fixed inset-x-0 z-50 mx-auto w-full max-w-[420px]"
        :style="{ bottom: `${keyboardOffset}px` }"
        role="dialog"
        aria-modal="true"
        aria-label="经期打卡"
      >
        <div
          class="max-h-[85dvh] overflow-y-auto rounded-t-3xl border border-separator bg-card px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]"
        >
          <div class="mx-auto h-1 w-9 rounded-full bg-neutral-600" />
          <h2 class="mt-4 text-center text-base font-medium tabular-nums">
            {{ Number(date.slice(5, 7)) }}月{{ Number(date.slice(8, 10)) }}日 · 打卡
          </h2>

          <!-- 经量 -->
          <p class="mt-4 mb-2 text-[11px] text-fg-soft">经量</p>
          <div class="flex gap-2">
            <button
              v-for="level in [1, 2, 3, 4, 5]"
              :key="level"
              type="button"
              class="flex size-10 items-center justify-center rounded-xl border transition-all duration-200 ease-out-quart active:scale-95"
              :class="
                flow !== null && level <= flow
                  ? 'border-rose/40 bg-rose/15 text-rose'
                  : 'border-transparent bg-card-2 text-fg-mute'
              "
              :aria-label="`经量 ${level} 级`"
              @click="flow = flow === level ? null : (level as FlowLevel)"
            >
              <Droplet :size="16" :stroke-width="2" />
            </button>
          </div>

          <!-- 痛感 -->
          <p class="mt-4 mb-2 text-[11px] text-fg-soft">痛感</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="p in PAIN_OPTIONS"
              :key="p.value"
              type="button"
              class="h-8 rounded-full border px-3 text-xs transition-all duration-200 ease-out-quart active:scale-95"
              :class="pillClass(pain === p.value)"
              @click="pain = pain === p.value ? null : p.value"
            >
              {{ p.label }}
            </button>
          </div>

          <!-- 症状 -->
          <p class="mt-4 mb-2 text-[11px] text-fg-soft">伴随症状</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="s in SYMPTOM_OPTIONS"
              :key="s"
              type="button"
              class="h-8 rounded-full border px-3 text-xs transition-all duration-200 ease-out-quart active:scale-95"
              :class="pillClass(symptoms.has(s))"
              @click="toggleSymptom(s)"
            >
              {{ s }}
            </button>
          </div>

          <!-- 心情 -->
          <p class="mt-4 mb-2 text-[11px] text-fg-soft">心情</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="m in MOOD_OPTIONS"
              :key="m.value"
              type="button"
              class="h-8 rounded-full border px-3 text-xs transition-all duration-200 ease-out-quart active:scale-95"
              :class="pillClass(mood === m.value)"
              @click="mood = mood === m.value ? null : m.value"
            >
              {{ m.label }}
            </button>
          </div>

          <!-- 备注 -->
          <p class="mt-4 mb-2 text-[11px] text-fg-soft">备注</p>
          <textarea
            v-model="notes"
            rows="2"
            maxlength="200"
            placeholder="想记下的任何细节…"
            class="w-full resize-none rounded-xl border border-separator bg-card-2 px-4 py-3 text-sm text-fg placeholder-fg-mute outline-none focus:border-rose/50"
          />

          <!-- 隐私开关 -->
          <div class="mt-4 flex items-center justify-between rounded-2xl bg-card-2 p-3">
            <div>
              <p class="flex items-center gap-1.5 text-sm text-fg">
                <Lock :size="13" class="text-fg-soft" />
                {{ visibility === 'shared' ? '公开给 TA' : '仅自己可见' }}
              </p>
              <p class="mt-0.5 text-[10px] text-fg-soft">
                {{
                  visibility === 'shared'
                    ? 'TA 可以看到这条状态与关怀提示'
                    : 'RLS 数据库级隔离，TA 无法查看任何细节'
                }}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              :aria-checked="visibility === 'shared'"
              class="flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors duration-200"
              :class="visibility === 'shared' ? 'justify-end bg-rose' : 'justify-start bg-neutral-600'"
              @click="visibility = visibility === 'shared' ? 'private' : 'shared'"
            >
              <span class="block size-5 rounded-full bg-white shadow" />
            </button>
          </div>

          <div class="mt-5 flex gap-2">
            <AppButton
              v-if="existing"
              variant="secondary"
              class="shrink-0"
              @click="emit('remove')"
            >
              删除
            </AppButton>
            <AppButton block tone="amber" @click="onSave">
              {{ existing ? '保存修改' : '完成打卡' }}
            </AppButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 250ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.sheet-enter-active,
.sheet-leave-active {
  transition: transform 300ms cubic-bezier(0.25, 1, 0.5, 1);
}
.sheet-enter-from,
.sheet-leave-to {
  transform: translateY(100%);
}
</style>
