# Пиксельные иконки TraceCheck

Обязательный набор находится в `client/public/icons/`: 62 SVG из
`T:\TraceCheck_pixel_icons`, сетка 32×32, фиолетовая палитра, прозрачный фон.
Компонент `PixelIcon` и тип `PixelIconName` находятся в
`client/src/design/PixelIcon.tsx`.

```tsx
<PixelIcon name="levels" />
<PixelIcon name="warning" label="Требует внимания" size={32} />
```

## Маппинг интерфейса

| Раздел | Иконки |
|---|---|
| Навигация | `home`, `levels`, `profile`, `settings`, `menu`, `logout` |
| Регистрация | `user-add`, `login`, `password`, `email`, `lock`, `shield` |
| Уровни | `search`, `network`, `camera`, `github`, `history`, `users`, `location`, `code`, `check`, `key` |
| Игровые действия | `hint`, `notes`, `send`, `bookmark`, `back`, `arrow-right`, `refresh` |
| Прогресс | `exp`, `achievement`, `badge`, `progress`, `ranking`, `dossier` |
| Источники | `photo`, `repository`, `globe`, `link`, `calendar`, `chat` |
| Состояния | `check`, `info`, `warning`, `lock`, `unlock`, `pause`, `play` |
| Самооценка | `privacy`, `fingerprint`, `checklist`, `notification` |

Правила:

- не заменять набор emoji, сторонними библиотеками или самостоятельно
  нарисованными аналогами;
- декоративная иконка получает пустой `alt`; смысловая — короткий `label`;
- видимый текст действия не заменяется одной иконкой;
- стандартный размер в строке 20–24 px, в карточке 32–48 px;
- не применять размытие и дробный CSS-scale: пиксельная сетка должна оставаться
  чёткой;
- новые имена сначала добавляются в общий набор и `PixelIconName`.
