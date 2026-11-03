export type Post = {
  id: string
  title: string
  caption: string
  location?: string
  visual: string
  clueIds: readonly string[]
}

export type Clue = {
  id: string
  postId: string
  label: string
  source: 'visual' | 'location' | 'caption'
  description: string
}

export type Question = {
  id: string
  topic: string
  label: string
  options: readonly { id: string; label: string }[]
}

export type RiskRule = {
  id: string
  conditions: readonly { questionId: string; optionId: string }[]
  priority: number
  explanation: string
  recommendationIds: readonly string[]
}

export const posts = [
  {
    id: 'entrance',
    title: 'Селфи у подъезда',
    caption: 'Наконец-то дома',
    location: 'Сиреневая аллея, 14 · Листоград',
    visual: 'На стене за Димой видна табличка «Сиреневая аллея, 14».',
    clueIds: ['address-sign', 'address-location', 'home-caption'],
  },
  {
    id: 'train-ticket',
    title: 'Билет на поезд',
    caption: 'Уезжаю на все выходные!',
    visual: 'Билет на 7 ноября. Маршрут Листоград → Озёрный. Данные и код скрыты.',
    clueIds: ['weekend-trip'],
  },
] satisfies readonly Post[]

export const clues = [
  { id: 'address-sign', postId: 'entrance', label: 'Табличка с адресом', source: 'visual', description: 'На табличке указаны улица и номер дома.' },
  { id: 'address-location', postId: 'entrance', label: 'Геометка', source: 'location', description: 'Геометка указывает на тот же дом.' },
  { id: 'home-caption', postId: 'entrance', label: '«Наконец-то дома»', source: 'caption', description: 'Подпись связывает место съёмки с вероятным домом Димы.' },
  { id: 'weekend-trip', postId: 'train-ticket', label: 'Дата и планы поездки', source: 'visual', description: 'Дата на билете вместе с подписью указывает на планы уехать на выходные.' },
] satisfies readonly Clue[]

export const findings = [
  {
    id: 'home-and-trip',
    title: 'Вероятный адрес дома и планы отъезда',
    // Для вывода нужна хотя бы одна активная улика из каждой группы.
    requiredClueGroups: [['address-sign', 'address-location'], ['home-caption'], ['weekend-trip']],
    confidence: 'вероятно',
    explanation: 'Адрес на селфи и подпись «Наконец-то дома» указывают, где Дима может жить. Билет и подпись раскрывают планы на выходные.',
    limits: 'По постам нельзя подтвердить место проживания, факт поездки или то, будет ли дома кто-то ещё.',
  },
]

export const editActions = [
  { id: 'remove-location', postId: 'entrance', label: 'Убрать геометку', hidesClueIds: ['address-location'], preview: 'Геометка скрыта' },
  { id: 'hide-sign', postId: 'entrance', label: 'Скрыть табличку', hidesClueIds: ['address-sign'], preview: 'Табличка закрыта' },
  { id: 'remove-caption', postId: 'entrance', label: 'Убрать подпись о доме', hidesClueIds: ['home-caption'], preview: 'Подпись скрыта' },
]

export const questions = [
  {
    id: 'ticket-details',
    topic: 'Билеты и документы',
    label: 'Когда ты публикуешь фото билета, видны ли номер или код?',
    options: [
      { id: 'visible', label: 'Да, видны' },
      { id: 'hidden', label: 'Скрываю их или не публикую билеты' },
      { id: 'unknown', label: 'Не уверен' },
    ],
  },
] satisfies readonly Question[]

export const riskRules = [
  {
    id: 'visible-ticket-details',
    conditions: [{ questionId: 'ticket-details', optionId: 'visible' }],
    priority: 1,
    explanation: 'Ты указал, что на фото билета могут быть видны номер или код.',
    recommendationIds: ['hide-ticket-details'],
  },
  {
    id: 'unknown-ticket-details',
    conditions: [{ questionId: 'ticket-details', optionId: 'unknown' }],
    priority: 2,
    explanation: 'Ты не уверен, видны ли номер или код на фото билета.',
    recommendationIds: ['check-ticket-details'],
  },
] satisfies readonly RiskRule[]

export const recommendations = [
  { id: 'hide-ticket-details', title: 'Скрой номер и код билета', action: 'Проверь опубликованные фото и замени их версиями с закрытыми номером и кодом.', topic: 'Билеты и документы' },
  { id: 'check-ticket-details', title: 'Проверь фото билетов', action: 'Открой недавние публикации и проверь, читаются ли номер и код.', topic: 'Билеты и документы' },
]
