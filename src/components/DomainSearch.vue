<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { decodeDomains, type Domain } from '../lib/geosite.ts'
import { normalizeHost, ruleMatchesHost } from '../lib/match.ts'
import { activeSourceId, isSelected, previewCategory, sources, toggleSelection } from '../state.ts'
import { formatNumber } from '../format.ts'
import TypeBadge from './TypeBadge.vue'

interface Hit {
  sourceId: string
  sourceLabel: string
  category: string
  rules: Domain[]
}

const query = ref('')
const mode = ref<'match' | 'substring'>('match')
const results = shallowRef<Hit[]>([])
const searching = ref(false)
const progress = ref(0)
const searchedFor = ref('')
let runId = 0

async function search(): Promise<void> {
  const raw = query.value.trim()
  const q = mode.value === 'match' ? normalizeHost(raw) : raw.toLowerCase()
  if (!q) return

  const id = ++runId
  searching.value = true
  progress.value = 0
  results.value = []

  const hits: Hit[] = []
  const total = sources.value.reduce((n, s) => n + s.file.categories.length, 0)
  let done = 0
  let lastYield = performance.now()

  for (const src of sources.value) {
    for (const cat of src.file.categories) {
      // Декодируем без кэша: иначе поиск по большому файлу держит в памяти миллионы объектов
      const rules = decodeDomains(src.file.buf, cat).filter((d) =>
        mode.value === 'match' ? ruleMatchesHost(d, q) : d.value.toLowerCase().includes(q),
      )
      if (rules.length) hits.push({ sourceId: src.id, sourceLabel: src.label, category: cat.name, rules })
      done++

      if (performance.now() - lastYield > 30) {
        progress.value = done / total
        await new Promise((r) => setTimeout(r))
        if (id !== runId) return
        lastYield = performance.now()
      }
    }
  }

  results.value = hits
  searchedFor.value = q
  searching.value = false
}

function open(hit: Hit): void {
  activeSourceId.value = hit.sourceId
  previewCategory.value = hit.category
}
</script>

<template>
  <section class="panel search">
    <h2>Поиск домена</h2>
    <form class="toolbar" @submit.prevent="search">
      <input v-model="query" type="search" class="grow" placeholder="youtube.com" :disabled="!sources.length" />
      <select v-model="mode">
        <option value="match">Срабатывающие правила</option>
        <option value="substring">Подстрока в правиле</option>
      </select>
      <button type="submit" :disabled="!sources.length || searching || !query.trim()">Найти</button>
    </form>
    <p class="muted small">
      <template v-if="mode === 'match'">
        Категории, правила которых сработают на этот хост в xray: domain, full, keyword и regexp.
      </template>
      <template v-else>Категории, где значение правила содержит строку.</template>
      Поиск идёт по всем загруженным источникам.
    </p>

    <progress v-if="searching" :value="progress" max="1" class="bar" />

    <template v-else-if="searchedFor">
      <p class="muted small">
        «{{ searchedFor }}»: {{ formatNumber(results.length) }} категорий
      </p>
      <ul class="hits">
        <li v-for="hit in results" :key="hit.sourceId + hit.category">
          <div class="hit-head">
            <input
              type="checkbox"
              :checked="isSelected(hit.sourceId, hit.category)"
              title="Добавить в конвертацию"
              @change="toggleSelection(hit.sourceId, hit.category)"
            />
            <a href="#" class="mono" @click.prevent="open(hit)">{{ hit.category }}</a>
            <span v-if="sources.length > 1" class="muted small">{{ hit.sourceLabel }}</span>
          </div>
          <div v-for="(r, i) in hit.rules.slice(0, 5)" :key="i" class="rule">
            <TypeBadge :type="r.type" /> <span class="mono">{{ r.value }}</span>
          </div>
          <div v-if="hit.rules.length > 5" class="muted small rule">
            …и ещё {{ formatNumber(hit.rules.length - 5) }}
          </div>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.search {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.toolbar {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.grow {
  flex: 1;
  min-width: 160px;
}
.bar {
  width: 100%;
}
.hits {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  flex: 1;
}
.hits li {
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}
.hit-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.rule {
  margin-left: 26px;
  font-size: 13px;
  word-break: break-all;
}
</style>
