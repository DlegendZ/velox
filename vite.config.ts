import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 4500,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "physics", test: /rapier/ },
            { name: "graphics", test: /three|postprocessing/ },
          ],
        },
      },
    },
  },
});
