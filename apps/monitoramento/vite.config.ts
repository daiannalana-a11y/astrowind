import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Caminhos relativos: o mesmo build serve no navegador, em subpasta e dentro do app Android.
  base: "./",
  build: { target: "es2022", chunkSizeWarningLimit: 1200 },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon.svg"],
      manifest: {
        name: "Monitoramentos",
        short_name: "Monitoramentos",
        description: "Monitoramento ambiental de campo",
        lang: "pt-BR",
        theme_color: "#0b6e7f",
        background_color: "#eef2f3",
        display: "standalone",
        orientation: "portrait",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: { globPatterns: ["**/*.{js,css,html,svg,png,woff2,woff}"], navigateFallback: "index.html", maximumFileSizeToCacheInBytes: 6 * 1024 * 1024 }
    })
  ],
  test: { include: ["src/**/*.test.ts"], environment: "node" }
});
