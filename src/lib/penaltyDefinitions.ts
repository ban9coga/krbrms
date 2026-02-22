export type PenaltyCategory = 'Technical' | 'Safety' | 'Conduct'
export type PenaltyAction = 'none' | 'warning' | 'start_back' | 'position_drop' | 'DNF' | 'DQ'

export type PenaltyDefinition = {
  id: string
  label: string
  category: PenaltyCategory
  description: string
  points: number
  automatic_action: PenaltyAction
}

export const PENALTY_DEFINITIONS: PenaltyDefinition[] = [
  {
    id: 'SAFETY_HELM_STRAP',
    label: 'Helm tidak terpasang rapat saat race dimulai',
    category: 'Safety',
    description: 'Strap helm longgar atau tidak terkunci pada saat gate start.',
    points: 3,
    automatic_action: 'start_back',
  },
  {
    id: 'SAFETY_HELM_NON_STANDARD',
    label: 'Helm tidak standar / berbahaya',
    category: 'Safety',
    description: 'Helm tidak sesuai standar keselamatan atau kondisi helm berbahaya.',
    points: 5,
    automatic_action: 'DNF',
  },
  {
    id: 'TECH_PLATE_NOT_VISIBLE',
    label: 'Nomor plate tidak terlihat',
    category: 'Technical',
    description: 'Nomor plate tertutup, terlepas, atau tidak terbaca jelas.',
    points: 2,
    automatic_action: 'none',
  },
  {
    id: 'SAFETY_DANGEROUS_ACCESSORY',
    label: 'Aksesori berbahaya di helm/bike',
    category: 'Safety',
    description: 'Ada aksesori tajam/berbahaya di helm atau bike.',
    points: 4,
    automatic_action: 'DNF',
  },
  {
    id: 'SAFETY_NO_GLOVES',
    label: 'Sarung tangan tidak dipakai',
    category: 'Safety',
    description: 'Rider tidak memakai sarung tangan saat race.',
    points: 1,
    automatic_action: 'warning',
  },
  {
    id: 'SAFETY_SHOES_OPEN',
    label: 'Sepatu tidak tertutup',
    category: 'Safety',
    description: 'Rider memakai sandal atau sepatu terbuka.',
    points: 2,
    automatic_action: 'warning',
  },
  {
    id: 'SAFETY_NO_ELBOW_GUARD',
    label: 'Pelindung siku tidak dipakai',
    category: 'Safety',
    description: 'Rider tidak memakai pelindung siku.',
    points: 2,
    automatic_action: 'warning',
  },
  {
    id: 'SAFETY_NO_KNEE_GUARD',
    label: 'Pelindung lutut tidak dipakai',
    category: 'Safety',
    description: 'Rider tidak memakai pelindung lutut.',
    points: 2,
    automatic_action: 'warning',
  },
  {
    id: 'CONDUCT_FALSE_START',
    label: 'False start',
    category: 'Conduct',
    description: 'Rider bergerak sebelum gate start resmi.',
    points: 2,
    automatic_action: 'none',
  },
  {
    id: 'CONDUCT_BLOCKING',
    label: 'Blocking / memotong jalur',
    category: 'Conduct',
    description: 'Menghalangi atau memotong jalur rider lain secara tidak wajar.',
    points: 2,
    automatic_action: 'none',
  },
  {
    id: 'CONDUCT_DANGEROUS_PUSH',
    label: 'Dorongan yang membahayakan',
    category: 'Conduct',
    description: 'Dorongan/push yang menimbulkan risiko jatuh atau cedera.',
    points: 5,
    automatic_action: 'DNF',
  },
  {
    id: 'CONDUCT_PARENT_ON_TRACK',
    label: 'Orang tua masuk lintasan saat race',
    category: 'Conduct',
    description: 'Orang tua masuk lintasan selama race berlangsung.',
    points: 5,
    automatic_action: 'DQ',
  },
]
