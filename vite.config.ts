import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localTrustedLayerPlugin } from "./localTrusted/vitePlugin";

export default defineConfig({
  plugins: [react(), localTrustedLayerPlugin()],
  server: {
    proxy: {
      "/hermes-local": {
        target: "http://127.0.0.1:8642",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hermes-local/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.removeHeader("origin");
          });
        },
      },
      "/hermes-hooper": {
        target: "https://hooper.ink",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/hermes-hooper/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.removeHeader("origin");
          });
        },
      },
    },
  },
});
