export type V1InItem = {
  feature: string
  description: string
  priority: string
}

export type ScreenItem = {
  screen: string
  elements: string
}

export type PrdContent = {
  tagline?: string
  problem?: string
  solution?: string
  v1In?: V1InItem[]
  v1Out?: string[]
  screens?: ScreenItem[]
  metrics?: string[]
}
