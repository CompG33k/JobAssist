import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Chrome Extension (MV3) popup build.
// Vite will output /dist with popup.html + assets.
// Put manifest.json in /public so Vite copies it into /dist.

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: "popup.html"
      },
      output: {
        // Keep filenames stable-ish for MV3; hashing is fine because popup.html references assets.
        // Content script + service worker are copied from /public and are not bundled by Vite here.
      }
    }
  }
});