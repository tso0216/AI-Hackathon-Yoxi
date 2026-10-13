// 小黃：一隻計程車黃的小狗。level 1 見習、2 上路（頭頂 yoxi 車燈）、3 老司機（司機帽）。
type Props = { level?: number; mood?: 'awake' | 'happy' | 'sleep'; gear?: string[]; size?: number }

const INK = '#1C1C1E'

export function Pup({ level = 1, mood = 'awake', gear = [], size = 64 }: Props) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className="pup" role="img" aria-label="小黃">
      <path d="M30 42 C14 42 8 68 16 84 C22 94 34 88 35 76 Z" fill="#E8A600" />
      <path d="M90 42 C106 42 112 68 104 84 C98 94 86 88 85 76 Z" fill="#E8A600" />
      <ellipse cx="60" cy="66" rx="36" ry="34" fill="#FFC400" />
      <ellipse cx="60" cy="84" rx="18" ry="13" fill="#FFE7A3" />
      <circle cx="37" cy="78" r="5.5" fill="#FF8F6B" opacity=".28" />
      <circle cx="83" cy="78" r="5.5" fill="#FF8F6B" opacity=".28" />
      {mood === 'awake' && <>
        <circle cx="46" cy="64" r="4.6" fill={INK} /><circle cx="74" cy="64" r="4.6" fill={INK} />
        <circle cx="44.6" cy="62.4" r="1.4" fill="#fff" /><circle cx="72.6" cy="62.4" r="1.4" fill="#fff" />
      </>}
      {mood === 'happy' && <g fill="none" stroke={INK} strokeWidth="3.4" strokeLinecap="round">
        <path d="M40.5 66 Q46 58.5 51.5 66" /><path d="M68.5 66 Q74 58.5 79.5 66" />
      </g>}
      {mood === 'sleep' && <g fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round">
        <path d="M40.5 63 Q46 68.5 51.5 63" /><path d="M68.5 63 Q74 68.5 79.5 63" />
      </g>}
      <ellipse cx="60" cy="77" rx="5.6" ry="4" fill={INK} />
      <path d="M60 81 V84 M53.5 85 Q57 88.5 60 84 Q63 88.5 66.5 85" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
      {gear.includes('raincoat') && <g>
        <path d="M21 72 C14 18 106 18 99 72 L91 70 C92 34 28 34 29 70 Z" fill="#4C9BE0" />
        <path d="M33 28 Q60 16 87 28" fill="none" stroke="#FFFFFF" strokeOpacity=".5" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M26 92 Q60 112 94 92 L98 106 Q60 126 22 106 Z" fill="#4C9BE0" />
        <circle cx="60" cy="110" r="2.6" fill="#FFC400" /><circle cx="48" cy="108" r="2.2" fill="#FFC400" /><circle cx="72" cy="108" r="2.2" fill="#FFC400" />
      </g>}
      {gear.includes('bowtie') && <g>
        <path d="M60 101 L45 93 Q42 101 45 109 Z" fill={INK} /><path d="M60 101 L75 93 Q78 101 75 109 Z" fill={INK} />
        <circle cx="60" cy="101" r="4" fill="#FFC400" stroke={INK} strokeWidth="1.5" />
      </g>}
      {level === 2 && <g>
        <rect x="53" y="31" width="14" height="5" rx="1.5" fill={INK} />
        <rect x="44" y="19" width="32" height="14" rx="5" fill={INK} />
        <text x="60" y="29.5" textAnchor="middle" fontSize="9" fontWeight="800" fill="#FFC400" fontFamily="-apple-system, sans-serif">yoxi</text>
      </g>}
      {level >= 3 && <g>
        <path d="M28 46 C28 22 92 22 92 46 Z" fill={INK} />
        <rect x="25" y="42" width="70" height="8" rx="4" fill="#3A3A3C" />
        <circle cx="60" cy="35" r="5" fill="#FFC400" />
      </g>}
      {mood === 'sleep' && <text x="96" y="30" fontSize="16" fontWeight="800" fill="#8E8E93" fontFamily="-apple-system, sans-serif">z</text>}
    </svg>
  )
}
