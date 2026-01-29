import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Chrome Extension (MV3) popup build.
// Vite will output /dist with popup.html + assets.
// Put manifest.json + service-worker.js + content-script.js in /public so Vite copies them into /dist.

export default defineConfig({
  // ✅ critical for extension/GH Pages-style paths
  base: "./",

  plugins: [react()],

  // ✅ prevents "Invalid hook call" by ensuring a single React runtime in the bundle
  resolve: {
    dedupe: ["react", "react-dom"]
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true, // helps you see real errors (optional but recommended)
    rollupOptions: {
      input: {
        popup: "popup.html"
      }
    }
  }
});
