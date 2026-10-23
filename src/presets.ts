export interface Preset {
  id: string
  label: string
  url: string
  description: string
}

export const PRESETS: Preset[] = [
  {
    id: 'loyalsoldier',
    label: 'Loyalsoldier',
    url: 'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat',
    description: 'Расширенный v2fly: gfw, greatfire, реклама — ~11 МБ',
  },
  {
    id: 'v2fly',
    label: 'v2fly',
    url: 'https://github.com/v2fly/domain-list-community/releases/latest/download/dlc.dat',
    description: 'Оригинальный domain-list-community — ~2 МБ',
  },
  {
    id: 'runetfreedom',
    label: 'runetfreedom',
    url: 'https://github.com/runetfreedom/russia-v2ray-rules-dat/releases/latest/download/geosite.dat',
    description: 'Российские блокировки: ru-blocked, ru-available-only-inside — ~75 МБ',
  },
  {
    id: 'iran',
    label: 'Iran (chocolate4u)',
    url: 'https://github.com/chocolate4u/Iran-v2ray-rules/releases/latest/download/geosite.dat',
    description: 'Иранские списки поверх v2fly — ~8 МБ',
  },
]
