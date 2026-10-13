<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { Component } from 'vue';
import {
  Sun,
  Moon,
  CloudSun,
  CloudMoon,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
} from '@lucide/vue';
import AppCard from '@/components/common/AppCard.vue';
import IconTile from '@/components/common/IconTile.vue';
import { useWeather } from '@/composables/useWeather';
import type { WeatherInfo } from '@/composables/useWeather';

/**
 * 双城天气卡（参考设计：蓝左色条 + 今明两行温区 + 底部数据来源标注）。
 * 数据来自 Open-Meteo（Cache-First 6h），网络异常时展示过期缓存并标注「缓存」。
 */
const props = defineProps<{
  myCity: string;
  partnerCity: string;
  myLat?: number | null;
  myLon?: number | null;
  partnerLat?: number | null;
  partnerLon?: number | null;
}>();

interface WeatherMeta {
  icon: Component;
  label: string;
}

/** WMO 天气代码 -> 图标与文案 */
function weatherMeta(code: number, isDay: boolean): WeatherMeta {
  if (code === 0) return { icon: isDay ? Sun : Moon, label: '晴' };
  if (code === 1) return { icon: isDay ? CloudSun : CloudMoon, label: '多云间晴' };
  if (code === 2) return { icon: isDay ? CloudSun : Cloud, label: '多云' };
  if (code === 3) return { icon: Cloud, label: '阴' };
  if (code === 45 || code === 48) return { icon: CloudFog, label: '雾' };
  if ([51, 53, 55, 56, 57].includes(code)) return { icon: CloudDrizzle, label: '毛毛雨' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { icon: CloudRain, label: '雨' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: CloudSnow, label: '雪' };
  if ([95, 96, 99].includes(code)) return { icon: CloudLightning, label: '雷阵雨' };
  return { icon: Cloud, label: '未知' };
}

const { fetchWeather } = useWeather();

const mine = ref<WeatherInfo | null>(null);
const partner = ref<WeatherInfo | null>(null);
const failed = ref(false);

async function refresh(): Promise<void> {
  failed.value = false;
  const [m, p] = await Promise.allSettled([
    fetchWeather(props.myCity, props.myLat ?? null, props.myLon ?? null),
    fetchWeather(props.partnerCity, props.partnerLat ?? null, props.partnerLon ?? null),
  ]);
  if (m.status === 'fulfilled') mine.value = m.value;
  if (p.status === 'fulfilled') partner.value = p.value;
  if (m.status === 'rejected' && p.status === 'rejected') failed.value = true;
}

onMounted(refresh);
defineExpose({ refresh });

const isStale = computed(() => Boolean(mine.value?.stale || partner.value?.stale));

const diffText = computed(() => {
  if (!mine.value || !partner.value) return null;
  if (props.myCity === props.partnerCity) return '同一座城，同一片天空';
  const diff = Math.abs(mine.value.temperature - partner.value.temperature);
  if (diff === 0) return '两座城，此刻同温';
  return `两地温差 ${diff}°C`;
});

interface CityRow {
  dayLabel: string;
  meta: WeatherMeta;
  min: number;
  max: number;
}

interface CityBlock {
  tag: string;
  city: string;
  info: WeatherInfo | null;
  rows: CityRow[];
}

function buildRows(info: WeatherInfo): CityRow[] {
  return [
    {
      dayLabel: '今天',
      meta: weatherMeta(info.weatherCode, info.isDay),
      min: info.todayMin,
      max: info.todayMax,
    },
    {
      dayLabel: '明天',
      meta: weatherMeta(info.tomorrowCode, true),
      min: info.tomorrowMin,
      max: info.tomorrowMax,
    },
  ];
}

const columns = computed<CityBlock[]>(() => [
  {
    tag: '我',
    city: props.myCity,
    info: mine.value,
    rows: mine.value ? buildRows(mine.value) : [],
  },
  {
    tag: 'TA',
    city: props.partnerCity,
    info: partner.value,
    rows: partner.value ? buildRows(partner.value) : [],
  },
]);
</script>

<template>
  <AppCard accent="serene">
    <div class="flex items-center gap-3">
      <IconTile tone="serene">
        <CloudSun :size="20" :stroke-width="1.8" />
      </IconTile>
      <p class="text-sm font-medium">天气</p>
      <span v-if="isStale" class="ml-auto text-[10px] text-fg-mute">缓存</span>
    </div>

    <div class="mt-3 flex flex-col gap-3">
      <div
        v-for="(block, index) in columns"
        :key="block.tag"
        class="border-separator"
        :class="index > 0 ? 'border-t pt-3' : ''"
      >
        <p class="text-[11px] text-fg-soft">{{ block.tag }} · {{ block.city }}</p>

        <template v-if="block.info">
          <div
            v-for="row in block.rows"
            :key="row.dayLabel"
            class="mt-1.5 flex items-center justify-between text-sm"
          >
            <span class="flex items-center gap-2">
              <span class="w-8 text-fg-soft">{{ row.dayLabel }}</span>
              <component
                :is="row.meta.icon"
                :size="16"
                class="text-serene"
                :stroke-width="1.8"
                aria-hidden="true"
              />
              <span class="text-fg">{{ row.meta.label }}</span>
            </span>
            <span class="text-fg tabular-nums">{{ row.min }}~{{ row.max }}°</span>
          </div>
        </template>

        <!-- 加载骨架 / 失败占位 -->
        <template v-else>
          <div class="mt-1.5 space-y-2">
            <div class="h-5 w-full animate-pulse rounded-lg bg-card-2" />
            <div class="h-5 w-full animate-pulse rounded-lg bg-card-2" />
          </div>
          <p class="mt-1 text-[10px] text-fg-mute">
            {{ failed ? '暂不可用' : '加载中' }}
          </p>
        </template>
      </div>
    </div>

    <div class="mt-3 flex items-center justify-between">
      <p class="text-[10px] text-fg-mute">天气数据来自 Open-Meteo</p>
      <p v-if="diffText" class="text-[10px] text-fg-soft tabular-nums">{{ diffText }}</p>
    </div>
  </AppCard>
</template>
