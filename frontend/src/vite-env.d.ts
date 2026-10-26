/// <reference types="vite/client" />

declare module '*.svg' {
  const content: string;
  export default content;
}

// Versão do frontend injetada pelo Vite (vite.config.ts)
declare const __APP_VERSION__: string;
