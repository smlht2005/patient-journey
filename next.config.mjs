/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Zeabur：standalone output 大幅縮小部署包體積
  output: 'standalone',
  // 允許 Zeabur 內部健康檢查繞過 auth
  async headers() {
    return [
      {
        source: '/api/health',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};
export default nextConfig;
