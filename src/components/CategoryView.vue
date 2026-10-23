<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { DOMAIN_TYPE_PREFIX, DomainType, type Domain } from '../lib/geosite.ts'
import { activeSource, isSelected, previewCategory, toggleSelection } from '../state.ts'
import { formatNumber } from '../format.ts'
import TypeBadge from './TypeBadge.vue'

const PAGE = 500
const ALL_TYPES = [DomainType.RootDomain, DomainType.Full, DomainType.Plain, DomainType.Regex]

const filter = ref('')
const limit = ref(PAGE)
const shownTypes = reactive(new Set<DomainType>(ALL_TYPES))

const domains = computed<Domain[]>(() => {
  const src = activeSource.value
  const cat = previewCategory.value ? src?.file.find(previewCategory.value) : undefined
  return src && cat ? src.file.domains(cat) : []
})

const typeCounts = computed(() => {
  const counts = new Map<DomainType, number>()
  for (const d of domains.value) counts.set(d.type, (counts.get(d.type) ?? 0) + 1)
  return counts
})

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return domains.value.filter(
    (d) => shownTypes.has(d.type) && (!q || d.value.toLowerCase().includes(q) || d.attrs.some((a) => a.includes(q))),
  )
})

watch([previewCategory, filter], () => (limit.value = PAGE))

function toggleType(t: DomainType): void {
  if (shownTypes.has(t)) shownTypes.delete(t)
  else shownTypes.add(t)
}
</script>

<template>
  <section class="panel view">
    <template v-if="activeSource && previewCategory">
      <header class="head">
        <h2 class="mono">geosite:{{ previewCategory }}</h2>
        <button
          :class="isSelected(activeSource.id, previewCategory) ? 'secondary' : ''"
          @click="toggleSelection(activeSource.id, previewCategory)"
        >
          {{ isSelected(activeSource.id, previewCategory) ? 'Убрать из конвертации' : 'Добавить в конвертацию' }}
        </button>
      </header>

      <div class="toolbar">
        <label v-for="t in ALL_TYPES" :key="t" class="type-toggle" :class="{ off: !shownTypes.has(t) }">
          <input type="checkbox" :checked="shownTypes.has(t)" @change="toggleType(t)" />
          <TypeBadge :type="t" />
          <span class="muted small">{{ formatNumber(typeCounts.get(t) ?? 0) }}</span>
        </label>
        <input v-model="filter" type="search" class="grow" placeholder="Фильтр по домену или атрибуту" />
      </div>

      <p v-if="(typeCounts.get(DomainType.Plain) ?? 0) + (typeCounts.get(DomainType.Regex) ?? 0) > 0" class="hint">
        Правила {{ DOMAIN_TYPE_PREFIX[DomainType.Plain] }} и {{ DOMAIN_TYPE_PREFIX[DomainType.Regex] }}
        не переносятся в upstream-синтаксис AdGuard Home и будут пропущены.
      </p>

      <div class="muted small">Показано {{ formatNumber(Math.min(limit, filtered.length)) }} из {{ formatNumber(filtered.length) }}</div>
      <ul class="rules">
        <li v-for="(d, i) in filtered.slice(0, limit)" :key="i">
          <TypeBadge :type="d.type" />
          <span class="value">{{ d.value }}</span>
          <span v-for="a in d.attrs" :key="a" class="attr">@{{ a }}</span>
        </li>
      </ul>
      <button v-if="filtered.length > limit" class="secondary more" @click="limit += PAGE * 4">
        Показать ещё
      </button>
    </template>
    <p v-else class="muted">Выберите категорию слева, чтобы посмотреть её правила.</p>
  </section>
</template>

<style scoped>
.view {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.head h2 {
  margin: 0;
  word-break: break-all;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: 10px 0 6px;
}
.type-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.type-toggle.off {
  opacity: 0.5;
}
.grow {
  flex: 1;
  min-width: 160px;
}
.rules {
  list-style: none;
  margin: 6px 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
  min-height: 120px;
}
.rules li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 4px;
  font-family: var(--mono);
  font-size: 13px;
}
.rules li:hover {
  background: var(--hover);
}
.value {
  word-break: break-all;
}
.attr {
  font-size: 11px;
  color: var(--muted);
}
.more {
  align-self: center;
}
</style>
