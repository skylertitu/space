
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@tabler/icons-react',
      'framer-motion',
      'recharts',
    ],
  },
  images: {
    remotePatterns: [
      // From next.config.mjs
      {
        protocol: 'https',
        hostname: 'source.unsplash.com',
        port: '',
        pathname: '/random/**',
      },
      // From next.config.ts
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'via.placeholder.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // WhatsApp bots route rename
      {
        source: '/home/:entityId/cto/automation/chatbots',
        destination: '/home/:entityId/cto/automation/whatsappbots',
        permanent: true,
      },
      {
        source: '/home/:entityId/cto/automation/chatbots/:id',
        destination: '/home/:entityId/cto/automation/whatsappbots/:id',
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/socket.io/:path*',
        destination: 'http://localhost:4000/socket.io/:path*',
      },
      {
        source: '/api/internal/:path*',
        destination: 'http://localhost:4000/api/internal/:path*',
      }
    ];
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
