import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base relative : l'application est servie sous https://srcchi.github.io/GeneaGauche/app/
export default defineConfig({
  plugins: [react()],
  base: "./",
});
