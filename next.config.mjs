import { withPayload } from '@payloadcms/next/withPayload'
import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-hosted build: bundle only the traced production files and a small
  // server into `.next/standalone`. This skips shipping the full
  // `node_modules`. Railpack runs `pnpm build`, then
  // `scripts/standalone-postbuild.mjs` copies `.next/static` and `public/`
  // next to `server.js`, since Next does not copy these files on its own.
  // Migrations (`prodMigrations`) and the admin `importMap.js` are static
  // imports, so they trace into the bundle and still run at boot. See
  // issue #471.
  output: 'standalone',
  // Keep dev and test files out of the standalone trace. Otherwise Next
  // copies these large directories into `.next/standalone`, and a local
  // `pnpm build` grows to many GB from `media/` and `seeds/`. Production
  // stores uploads in R2, not local `media/`, and never runs seeds or
  // tests, so excluding them here is safe. `.railwayignore` drops the same
  // kind of files through a different mechanism: it filters uploads, not
  // the build trace. See issue #471.
  outputFileTracingExcludes: {
    '*': [
      'media/**/*',
      'seeds/**/*',
      'tests/**/*',
      'playwright-report/**/*',
      'test-results/**/*',
      'coverage/**/*',
    ],
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  // Configure CSP headers for Fathom Analytics and Live Preview iframes
  async headers() {
    // Build `frame-src` from environment variables, with fallback values.
    // Next.js runs `headers()` at build time. Railway exposes every service
    // variable to the build, so this step reads the real WEMEDITATE_WEB_URL
    // and SAHAJATLAS_URL values. This keeps the build-time frame-src in
    // sync with the runtime `livePreview.url`. Without this, the browser
    // blocks the preview iframe under CSP. The literal URLs below are
    // fallbacks for local and CI runs.
    const frameSources = [
      "'self'",
      'https://app.usefathom.com',
      process.env.WEMEDITATE_WEB_URL || 'https://wemeditate.com',
      process.env.SAHAJATLAS_URL || 'https://atlas.sydevelopers.com',
    ].join(' ')

    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `frame-src ${frameSources};`,
          },
        ],
      },
    ]
  },
  images: {
    remotePatterns: [
      ...(process.env.CLOUDFLARE_R2_DELIVERY_URL
        ? [
            {
              protocol: 'https',
              hostname: new URL(process.env.CLOUDFLARE_R2_DELIVERY_URL).hostname,
            },
          ]
        : []),
      {
        protocol: 'https',
        hostname: '**.cloudflarestream.com', // For Stream thumbnails (issue #70)
      },
      {
        protocol: 'https',
        hostname: 'img.shields.io', // For status badges (issue #100)
      },
    ],
    // Next.js runs image optimization on the Node server, using sharp.
    // Cloudflare caches the optimized output at the edge.
  },
  // Publish the deployment name to the browser bundle.
  //
  // A browser never reads `process.env` at runtime, so the two client-side
  // Sentry call sites (`src/instrumentation-client.ts`,
  // `src/components/ErrorBoundary.tsx`) can only learn which deployment they
  // are from a value inlined at build time. Next inlines every `env` key here
  // as `process.env.<KEY>`, in both bundles.
  //
  // This needs no dashboard variable: Railway exposes every service variable
  // to the build (`headers()` above already relies on that, and
  // `scripts/postinstall.cjs` reads `RAILWAY_*` there too), and each Railway
  // environment builds separately — so a preview's own build sees
  // `RAILWAY_ENVIRONMENT_NAME=pr-<number>`. A bundle only ever serves the
  // deployment that built it, so a build-time value is the right shape.
  //
  // ⚠ This chain deliberately repeats `deploymentEnvironment()`
  // (`src/lib/env/deploymentEnvironment.ts`), which a `.mjs` config cannot
  // import. `tests/unit/client-deployment-environment.spec.ts` imports this
  // file and asserts the two agree, so the copies cannot drift. See #737.
  env: {
    NEXT_PUBLIC_DEPLOYMENT_ENVIRONMENT:
      process.env.RAILWAY_ENVIRONMENT_NAME ??
      process.env.RAILWAY_ENVIRONMENT ??
      process.env.NODE_ENV ??
      'development',
  },
  // External packages for server-side rendering
  serverExternalPackages: ['payload', 'jose'],
}

const configWithPayload = withPayload(nextConfig, { devBundleServerPackages: false })

// Wrap the config with Sentry. Sentry uploads source maps only when
// SENTRY_AUTH_TOKEN and the org and project settings are set, in CI or on
// Railway. Otherwise the build skips the upload. `silent` keeps local
// builds quiet.
export default withSentryConfig(configWithPayload, {
  silent: !process.env.CI,
})
