/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['klinecharts'],
  /**
   * Dev keeps `.next`. Production `npm run build` / `npm start` use `.next-build`
   * (via NEXT_DIST_DIR) so builds never wipe the running dev server cache.
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',
  /** Windows: file watcher misses saves → stale HMR chunks */
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 500,
        ignored: ['**/node_modules/**', '**/.git/**'],
      };
    }
    return config;
  },
};

export default nextConfig;
