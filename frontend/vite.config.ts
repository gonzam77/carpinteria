import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// Identificador unico de cada build. Se inyecta en el bundle y se publica en
// /version.json para que la app pueda detectar que hay una version nueva.
const buildVersion = `${Date.now()}`;

function versionManifest(): Plugin {
  return {
    name: "carpinteria-version-manifest",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ version: buildVersion })
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), versionManifest()],
  define: {
    __BUILD_VERSION__: JSON.stringify(buildVersion)
  },
  server: {
    port: 5173
  }
});
