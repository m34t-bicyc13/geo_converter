<script setup lang="ts">
import { ref, watch } from 'vue'
import SourcesPanel from './components/SourcesPanel.vue'
import CategoryList from './components/CategoryList.vue'
import CategoryView from './components/CategoryView.vue'
import DomainSearch from './components/DomainSearch.vue'
import ConvertPanel from './components/ConvertPanel.vue'
import { previewCategory } from './state.ts'

const tab = ref<'view' | 'search'>('view')

// выбор категории (в т.ч. из поиска или списка выбранных) переключает на просмотр
watch(previewCategory, (c) => {
  if (c) tab.value = 'view'
})
</script>

<template>
  <header class="topbar">
    <h1>Geo Converter</h1>
    <span class="muted small">geosite.dat → upstream-правила AdGuard Home</span>
  </header>

  <main class="layout">
    <aside class="col left">
      <SourcesPanel />
      <CategoryList />
    </aside>

    <div class="col center">
      <nav class="tabs">
        <button :class="{ on: tab === 'view' }" @click="tab = 'view'">Категория</button>
        <button :class="{ on: tab === 'search' }" @click="tab = 'search'">Поиск домена</button>
      </nav>
      <!-- v-show, чтобы не терять результаты поиска при переключении -->
      <CategoryView v-show="tab === 'view'" />
      <DomainSearch v-show="tab === 'search'" />
    </div>

    <aside class="col right">
      <ConvertPanel />
    </aside>
  </main>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
}
.topbar h1 {
  font-size: 18px;
  margin: 0;
}
.layout {
  display: grid;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr) minmax(320px, 440px);
  gap: 12px;
  padding: 12px 16px;
  height: calc(100vh - 50px);
  box-sizing: border-box;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  min-width: 0;
}
.left > :last-child,
.center > :not(.tabs),
.right > :last-child {
  flex: 1;
}
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: -8px;
}
.tabs button {
  border-radius: 6px 6px 0 0;
  background: transparent;
  color: var(--fg);
  border-color: transparent;
}
.tabs button.on {
  background: var(--panel);
  border-color: var(--border);
  border-bottom-color: var(--panel);
}

@media (max-width: 1100px) {
  .layout {
    grid-template-columns: 1fr;
    height: auto;
  }
  .col > * {
    max-height: none;
  }
  .left > :last-child,
  .center > :not(.tabs) {
    height: 60vh;
  }
}
</style>
