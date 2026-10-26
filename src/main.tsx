import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

if (import.meta.env.PROD) {
  registerSW({
    onNeedRefresh() {
      if (confirm('Nova versão disponível. Atualizar?')) {
        window.location.reload()
      }
    },
    onOfflineReady() {
      console.log('App pronto para uso offline')
    },
    onRegisterError(error) {
      console.error('Erro ao registrar Service Worker:', error)
    },
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)