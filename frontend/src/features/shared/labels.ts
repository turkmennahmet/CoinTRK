import type { AnomalyType, CrossType, DivergenceType, PositioningBias } from '../../api/types'
import type { BadgeTone } from '../../components/ui/Badge'

interface Label {
  label: string
  tone: BadgeTone
  description: string
}

export const ANOMALY_LABELS: Record<AnomalyType, Label> = {
  volume_breakout: {
    label: 'Hacimli kırılım',
    tone: 'warn',
    description: 'Olağandışı hacimle birlikte olağandışı fiyat hareketi. Hareketin arkasında gerçek katılım var.',
  },
  absorption: {
    label: 'Emilim',
    tone: 'violet',
    description: 'Hacim patlamış ama fiyat neredeyse kıpırdamamış. Büyük emirler karşı tarafça emiliyor olabilir.',
  },
  thin_move: {
    label: 'Hacimsiz hareket',
    tone: 'info',
    description: 'Sert fiyat hareketi, ama hacim sıradan. Katılımsız hareketler kolay geri dönebilir.',
  },
  volume_spike: {
    label: 'Hacim patlaması',
    tone: 'neutral',
    description: 'Olağandışı hacim, orta büyüklükte fiyat hareketi.',
  },
}

export const CROSS_LABELS: Record<CrossType, Label> = {
  golden: { label: 'Golden cross', tone: 'up', description: 'Hızlı ortalama yavaş ortalamayı yukarı kesti.' },
  death: { label: 'Death cross', tone: 'down', description: 'Hızlı ortalama yavaş ortalamayı aşağı kesti.' },
}

export const DIVERGENCE_LABELS: Record<DivergenceType, Label> = {
  bullish: {
    label: 'Pozitif uyumsuzluk',
    tone: 'up',
    description: 'Fiyat daha düşük dip yaptı, RSI daha yüksek dip yaptı. Satış baskısı zayıflıyor olabilir.',
  },
  bearish: {
    label: 'Negatif uyumsuzluk',
    tone: 'down',
    description: 'Fiyat daha yüksek tepe yaptı, RSI daha düşük tepe yaptı. Alış gücü zayıflıyor olabilir.',
  },
}

export const BIAS_LABELS: Record<PositioningBias, Label> = {
  long_buildup: {
    label: 'Long birikimi',
    tone: 'up',
    description: 'OI ↑ fiyat ↑ — yeni long pozisyonlar açılıyor.',
  },
  short_buildup: {
    label: 'Short birikimi',
    tone: 'down',
    description: 'OI ↑ fiyat ↓ — yeni short pozisyonlar açılıyor.',
  },
  short_covering: {
    label: 'Short kapanışı',
    tone: 'info',
    description: 'OI ↓ fiyat ↑ — shortlar kapanıyor (short squeeze olabilir).',
  },
  long_unwinding: {
    label: 'Long kapanışı',
    tone: 'warn',
    description: 'OI ↓ fiyat ↓ — longlar kapanıyor / tasfiye oluyor.',
  },
}
