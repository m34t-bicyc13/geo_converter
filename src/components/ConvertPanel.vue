<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { convertToUpstream, type ConvertResult, type SkipReason } from '../lib/convert.ts'
import {
  activeSourceId,
  categoryOf,
  convertOptions as opts,
  previewCategory,
  selection,
  selectionKey,
  sourceById,
  type Selection,
} from '../state.ts'
import { formatNumber } from '../format.ts'

const result = shallowRef<ConvertResult | null>(null)
const copied = ref(false)
const showSkipped = ref(false)

const SKIP_LABELS: Record<SkipReason, string> = {
  keyword: 'keyword: — не поддерживается',
  regexp: 'regexp: — не поддерживается',
  full: 'full: — пропущены по настройке',
  invalid: 'некорректный домен',
}

function labelOf(sel: Selection): string {
  return `${sourceById(sel.sourceId)?.label ?? '?'}/${sel.category}`
}

function run(): void {
  const inputs = selection.value.flatMap((sel) => {
    const src = sourceById(sel.sourceId)
    const cat = categoryOf(sel)
    return src && cat ? [{ label: labelOf(sel), domains: src.file.domains(cat) }] : []
  })
  result.value = inputs.length ? convertToUpstream(inputs, { ...opts }) : null
  copied.value = false
}

let timer: ReturnType<typeof setTimeout> | undefined
watch(
  [selection, opts],
  () => {
    clearTimeout(timer)
    timer = setTimeout(run, 250)
  },
  { deep: true, immediate: true },
)

const skippedByReason = computed(() => {
  const groups = new Map<SkipReason, string[]>()
  for (const s of result.value?.skipped ?? []) {
    const list = groups.get(s.reason) ?? []
    list.push(`${s.rule}   (${s.source})`)
    groups.set(s.reason, list)
  }
  return groups
})

const lineCount = computed(() => (result.value?.text ? result.value.text.split('\n').length - 1 : 0))

const canExport = computed(() => !!result.value && result.value.errors.length === 0 && !!result.value.text)

async function copy(): Promise<void> {
  if (!result.value) return
  await navigator.clipboard.writeText(result.value.text)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

function download(): void {
  if (!result.value) return
  const name = selection.value.length === 1 ? selection.value[0].category : 'geosite-merged'
  const blob = new Blob([result.value.text], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `upstream-${name}.txt`
  a.click()
  URL.revokeObjectURL(a.href)
}

function open(sel: Selection): void {
  activeSourceId.value = sel.sourceId
  previewCategory.value = sel.category
}
</script>

<template>
  <section class="panel convert">
    <h2>Конвертация в upstream AdGuard Home</h2>

    <div class="block">
      <div class="label">Выбранные категории</div>
      <p v-if="!selection.length" class="muted small">
        Отметьте категории галочками в списке или в результатах поиска.
      </p>
      <ul v-else class="chips">
        <li v-for="sel in selection" :key="selectionKey(sel)">
          <a href="#" class="mono" @click.prevent="open(sel)">{{ labelOf(sel) }}</a>
          <span class="muted small">{{ formatNumber(categoryOf(sel)?.count ?? 0) }}</span>
          <button class="icon" title="Убрать" @click="selection.splice(selection.indexOf(sel), 1)">×</button>
        </li>
      </ul>
      <button v-if="selection.length > 1" class="link small" @click="selection = []">Очистить всё</button>
    </div>

    <div class="block">
      <label class="label" for="upstreams">Upstream для этих доменов</label>
      <input
        id="upstreams"
        v-model="opts.upstreams"
        class="mono full"
        placeholder="tls://dns.example.com https://dns.example.com/dns-query"
      />
      <p class="muted small">Можно несколько через пробел. <code>#</code> — основные upstream AdGuard Home.</p>
    </div>

    <div class="block options">
      <label>
        <input v-model="opts.collapseSubdomains" type="checkbox" />
        Убирать поддомены, покрытые родителем
      </label>
      <label>
        <input v-model="opts.fullMode" type="checkbox" true-value="skip" false-value="include" />
        Пропускать <code>full:</code> (в AGH они захватят и поддомены)
      </label>
      <label>
        <input v-model="opts.header" type="checkbox" />
        Комментарий с источниками в начале
      </label>
      <div class="inline">
        <label><input v-model="opts.layout" type="radio" value="grouped" /> По</label>
        <input v-model.number="opts.groupSize" type="number" min="1" max="10000" class="num" :disabled="opts.layout !== 'grouped'" />
        <span>доменов в строке</span>
        <label><input v-model="opts.layout" type="radio" value="perLine" /> по одному</label>
      </div>
      <details>
        <summary>Основные upstream (для upstream_dns_file)</summary>
        <textarea
          v-model="opts.defaultUpstreams"
          rows="3"
          class="mono full"
          placeholder="https://dns.cloudflare.com/dns-query&#10;tls://dns.google"
        />
        <p class="muted small">
          Файл, указанный в <code>upstream_dns_file</code>, заменяет весь список upstream, поэтому обычные серверы
          без доменов нужно добавить в него же. Эти строки встанут в начало.
        </p>
      </details>
    </div>

    <template v-if="result">
      <ul v-if="result.errors.length" class="errors">
        <li v-for="e in result.errors" :key="e" class="error">{{ e }}</li>
      </ul>

      <dl class="stats">
        <dt>Правил на входе</dt>
        <dd>{{ formatNumber(result.stats.totalRules) }}</dd>
        <dt>domain: / full:</dt>
        <dd>{{ formatNumber(result.stats.rootDomains) }} / {{ formatNumber(result.stats.fullIncluded) }}</dd>
        <dt>Дубликаты</dt>
        <dd>{{ formatNumber(result.stats.duplicates) }}</dd>
        <dt>Покрыты родителем</dt>
        <dd>{{ formatNumber(result.stats.collapsed) }}</dd>
        <dt>Пропущено</dt>
        <dd>
          <a v-if="result.skipped.length" href="#" @click.prevent="showSkipped = !showSkipped">
            {{ formatNumber(result.skipped.length) }}
          </a>
          <template v-else>0</template>
        </dd>
        <dt><strong>Доменов на выходе</strong></dt>
        <dd><strong>{{ formatNumber(result.stats.output) }}</strong></dd>
      </dl>

      <div v-if="showSkipped && result.skipped.length" class="skipped">
        <div v-for="[reason, rules] in skippedByReason" :key="reason">
          <div class="label">{{ SKIP_LABELS[reason] }}: {{ formatNumber(rules.length) }}</div>
          <textarea readonly rows="4" class="mono full" :value="rules.join('\n')" />
        </div>
      </div>

      <div class="actions">
        <button :disabled="!canExport" @click="copy">{{ copied ? 'Скопировано' : 'Копировать' }}</button>
        <button class="secondary" :disabled="!canExport" @click="download">Скачать .txt</button>
        <span class="muted small">{{ formatNumber(lineCount) }} строк</span>
      </div>
      <textarea readonly class="output mono full" :value="result.text" spellcheck="false" />
    </template>
  </section>
</template>

<style scoped>
.convert {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  overflow-y: auto;
}
.block {
  margin-bottom: 10px;
}
.label {
  display: block;
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 4px;
}
.full {
  width: 100%;
  box-sizing: border-box;
}
.chips {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.chips li {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.chips a {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.options {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}
.inline {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.num {
  width: 70px;
}
details textarea {
  margin-top: 4px;
}
.errors {
  list-style: none;
  padding: 0;
  margin: 0 0 6px;
}
.stats {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 12px;
  margin: 0 0 8px;
  font-size: 13px;
}
.stats dd {
  margin: 0;
  text-align: right;
}
.skipped {
  margin-bottom: 8px;
}
.actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.output {
  min-height: 220px;
  flex: 1;
  font-size: 12px;
  white-space: pre;
}
</style>
