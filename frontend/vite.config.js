import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Replace 'fritz' with your actual GitHub repo name
  base: "/fritz/",
});
