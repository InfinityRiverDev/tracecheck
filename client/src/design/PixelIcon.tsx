export const pixelIconNames = [
  'achievement',
  'arrow-right',
  'back',
  'badge',
  'bookmark',
  'calendar',
  'camera',
  'chat',
  'check',
  'checklist',
  'close',
  'code',
  'copy',
  'database',
  'delete',
  'dossier',
  'download',
  'edit',
  'email',
  'exp',
  'filter',
  'fingerprint',
  'flag',
  'folder',
  'github',
  'globe',
  'help',
  'hint',
  'history',
  'home',
  'info',
  'key',
  'levels',
  'link',
  'location',
  'lock',
  'login',
  'logout',
  'mascot',
  'menu',
  'network',
  'notes',
  'notification',
  'password',
  'pause',
  'photo',
  'play',
  'privacy',
  'profile',
  'progress',
  'ranking',
  'refresh',
  'repository',
  'search',
  'send',
  'settings',
  'shield',
  'unlock',
  'upload',
  'user-add',
  'users',
  'warning',
] as const

export type PixelIconName = typeof pixelIconNames[number]

type PixelIconProps = {
  name: PixelIconName
  label?: string
  className?: string
  size?: number
}

export function PixelIcon({ name, label, className = '', size = 24 }: PixelIconProps) {
  return (
    <img
      className={`pixel-icon ${className}`.trim()}
      src={`/icons/${name}.svg`}
      width={size}
      height={size}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      draggable={false}
    />
  )
}
