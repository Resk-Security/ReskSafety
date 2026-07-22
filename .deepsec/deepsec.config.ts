import { defineConfig } from "deepsec/config";

export default defineConfig({
  projects: [
    { id: "Resk", root: ".." },
    // <deepsec:projects-insert-above>
  ],
  defaultAgent: "pi",
});
