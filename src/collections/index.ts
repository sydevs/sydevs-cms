import { Users } from './Users'
import { Media } from './Media'
import { Narrators } from './Narrators'
import { Meditations } from './Meditations'
import { Tags } from './Tags'
import { Music } from './Music'
import { Frames } from './Frames'
import { Clients } from './Clients'

// Export all collections as an array
export const collections = [
  // Content
  Meditations,
  Music,
  Frames,
  // Resources
  Media,
  Narrators,
  Tags,
  // Access
  Users,
  Clients,
]

export const collectionNames = {
  // Content
  meditations: "Meditations",
  music: "Music",
  frames: "Frames",
  // Resources
  media: "Media",
  narrators: "Narrators",
  tags: "Tags",
  // Access
  users: "Users",
  clients: "Clients",
}

export {
  Users,
  Media,
  Narrators,
  Meditations,
  Tags,
  Music,
  Frames,
  Clients,
}
