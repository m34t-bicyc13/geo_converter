<script setup lang="ts">
import { ref } from 'vue'
import { PRESETS } from '../presets.ts'
import {
  activeSourceId,
  customUrls,
  loadFromFile,
  loadFromUrl,
  loading,
  rememberUrl,
  removeSource,
  sources,
} from '../state.ts'
import { formatBytes, formatNumber } from '../format.ts'

const customUrl = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

function loadCustom(url = customUrl.value.trim()): void {
  if (!url) return
  rememberUrl(url)
  customUrl.value = ''
  void loadFromUrl(`url:${url}`, labelFromUrl(url), url)
}

function labelFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    // github.com/<owner>/<repo>/releases/... → owner/repo
    if (u.hostname === 'github.com' && parts.length >= 2) return `${parts[0]}/${parts[1]}`
    return `${u.hostname}/${parts.at(-1) ?? ''}`
  } catch {
    return url
  }
}

function onFile(e: Event): void {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) void loadFromFile(file)
  if (fileInput.value) fileInput.value.value = ''
}

function isLoaded(id: string): boolean {
  return sources.value.some((s) => s.id === id)
}
</script>

<template>
  <section class="panel">
    <h2>Источники</h2>

    <div class="presets">
      <button
        v-for="p in PRESETS"
        :key="p.id"
        :title="p.description"
        :class="{ loaded: isLoaded(`preset:${p.id}`) }"
        :disabled="loading.active"
        @click="loadFromUrl(`preset:${p.id}`, p.label, p.url)"
      >
        {{ p.label }}
      </button>
    </div>

    <form class="row" @submit.prevent="loadCustom()">
      <input
        v-model="customUrl"
        type="url"
        list="custom-urls"
        placeholder="https://…/geosite.dat"
        :disabled="loading.active"
      />
      <button type="submit" :disabled="loading.active || !customUrl.trim()">Загрузить</button>
      <datalist id="custom-urls">
        <option v-for="u in customUrls.list" :key="u" :value="u" />
      </datalist>
    </form>

    <div class="row">
      <button class="secondary wide" :disabled="loading.active" @click="fileInput?.click()">
        Открыть файл с диска…
      </button>
      <input ref="fileInput" type="file" accept=".dat,application/octet-stream" hidden @change="onFile" />
    </div>

    <div v-if="loading.active" class="progress">
      <div class="progress-label">
        {{ loading.label }}: {{ formatBytes(loading.received) }}
        <template v-if="loading.total"> из {{ formatBytes(loading.total) }}</template>
      </div>
      <progress :value="loading.received" :max="loading.total || undefined" />
    </div>
    <p v-if="loading.error" class="error">{{ loading.error }}</p>

    <ul v-if="sources.length" class="sources">
      <li
        v-for="s in sources"
        :key="s.id"
        :class="{ active: s.id === activeSourceId }"
        :title="s.origin"
        @click="activeSourceId = s.id"
      >
        <div class="source-name">{{ s.label }}</div>
        <div class="muted small">
          {{ formatNumber(s.file.categories.length) }} категорий ·
          {{ formatNumber(s.file.totalDomains) }} правил · {{ formatBytes(s.size) }}
        </div>
        <button class="icon" title="Убрать источник" @click.stop="removeSource(s.id)">×</button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.presets button.loaded {
  border-color: var(--accent);
}
.row {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}
.row input {
  flex: 1;
  min-width: 0;
}
.wide {
  flex: 1;
}
.progress {
  margin: 8px 0;
}
.progress progress {
  width: 100%;
}
.progress-label {
  font-size: 12px;
  margin-bottom: 4px;
}
.sources {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sources li {
  position: relative;
  padding: 6px 28px 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
}
.sources li.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.source-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sources .icon {
  position: absolute;
  top: 4px;
  right: 4px;
}
</style>
