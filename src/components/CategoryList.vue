<script setup lang="ts">
import { computed, ref } from 'vue'
import { activeSource, isSelected, previewCategory, toggleSelection } from '../state.ts'
import { formatNumber } from '../format.ts'

const filter = ref('')
const sort = ref<'name' | 'count'>('name')

const categories = computed(() => {
  const src = activeSource.value
  if (!src) return []
  const q = filter.value.trim().toLowerCase()
  const list = q ? src.file.categories.filter((c) => c.name.includes(q)) : [...src.file.categories]
  return sort.value === 'count'
    ? list.sort((a, b) => b.count - a.count)
    : list.sort((a, b) => a.name.localeCompare(b.name))
})
</script>

<template>
  <section class="panel categories">
    <h2>
      Категории
      <span v-if="activeSource" class="muted small">{{ activeSource.label }}</span>
    </h2>

    <template v-if="activeSource">
      <div class="toolbar">
        <input v-model="filter" type="search" placeholder="Фильтр: ru, google, ads…" />
        <select v-model="sort" title="Сортировка">
          <option value="name">А–Я</option>
          <option value="count">По размеру</option>
        </select>
      </div>
      <div class="muted small">Найдено: {{ formatNumber(categories.length) }}</div>

      <ul class="list">
        <li
          v-for="c in categories"
          :key="c.name"
          :class="{ active: previewCategory === c.name }"
          @click="previewCategory = c.name"
        >
          <input
            type="checkbox"
            :checked="isSelected(activeSource.id, c.name)"
            title="Добавить в конвертацию"
            @click.stop
            @change="toggleSelection(activeSource.id, c.name)"
          />
          <span class="name">{{ c.name }}</span>
          <span class="count">{{ formatNumber(c.count) }}</span>
        </li>
      </ul>
    </template>
    <p v-else class="muted">Загрузите источник, чтобы увидеть категории.</p>
  </section>
</template>

<style scoped>
.categories {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.toolbar {
  display: flex;
  gap: 6px;
  margin-bottom: 4px;
}
.toolbar input {
  flex: 1;
  min-width: 0;
}
.list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
  min-height: 120px;
}
.list li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-family: var(--mono);
  font-size: 13px;
}
.list li:hover {
  background: var(--hover);
}
.list li.active {
  background: var(--accent-soft);
}
.name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.count {
  color: var(--muted);
  font-size: 12px;
}
</style>
