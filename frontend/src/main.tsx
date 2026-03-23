import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ThemeProvider } from './components/theme-provider.tsx'
import { loadRuntimeConfig } from './lib/config.ts'

// Carrega configuração pública (runtime-config.json em produção Docker,
// ou import.meta.env em desenvolvimento local) ANTES de montar o React.
// Assim getBaseUrl() já está resolvido quando qualquer componente faz fetch.
loadRuntimeConfig().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <App />
      </ThemeProvider>
    </React.StrictMode>,
  )
})
