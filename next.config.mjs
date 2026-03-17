/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'firebasestorage.googleapis.com',
                pathname: '/v0/b/**',
            },
            {
                protocol: 'https',
                hostname: 'images.unsplash.com',
            },
            {
                protocol: 'https',
                hostname: 'maps.googleapis.com',
            },
            {
                protocol: 'https',
                hostname: 'lh3.googleusercontent.com',
            },
        ],
    },
    // Serve the Firebase messaging service worker via an API route so that
    // Firebase config values are injected from environment variables at
    // request time instead of being hardcoded in the public/ directory.
    async rewrites() {
        return [
            {
                source: '/firebase-messaging-sw.js',
                destination: '/api/firebase-messaging-sw',
            },
        ];
    },
};

export default nextConfig;
