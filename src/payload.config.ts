// storage-adapter-import-placeholder
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { payloadCloudPlugin } from '@payloadcms/payload-cloud'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig, Config } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { collections, Users } from './collections'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const payloadConfig = (overrides?: Config) => {
  return buildConfig({
    admin: {
      user: Users.slug,
      importMap: {
        baseDir: path.resolve(dirname),
      },
      components: {
        providers: [
          {
            path: './components/AdminProvider.tsx',
          },
        ],
      },
    },
    collections,
    editor: lexicalEditor(),
    secret: process.env.PAYLOAD_SECRET || '',
    typescript: {
      outputFile: path.resolve(dirname, 'payload-types.ts'),
    },
    db: mongooseAdapter({
      url: process.env.DATABASE_URI || '',
    }),
    sharp,
    plugins: [
      payloadCloudPlugin(),
      // storage-adapter-placeholder
    ],
    ...overrides,
  })
}

export default payloadConfig
