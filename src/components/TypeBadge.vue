<script setup lang="ts">
import { DOMAIN_TYPE_PREFIX, type DomainType } from '../lib/geosite.ts'

defineProps<{ type: DomainType }>()
</script>

<template>
  <span class="badge" :class="`t${type}`">{{ DOMAIN_TYPE_PREFIX[type] ?? type }}</span>
</template>

<style scoped>
.badge {
  display: inline-block;
  min-width: 56px;
  text-align: center;
  font-size: 11px;
  padding: 1px 4px;
  border-radius: 4px;
  font-family: var(--mono);
  background: var(--hover);
  color: var(--muted);
}
.t2 {
  background: var(--badge-domain);
  color: var(--badge-domain-fg);
}
.t3 {
  background: var(--badge-full);
  color: var(--badge-full-fg);
}
.t0,
.t1 {
  background: var(--badge-skip);
  color: var(--badge-skip-fg);
}
</style>
