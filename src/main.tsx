import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

declare const __VITE_PWA_REGISTER__: ((options?: {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
  onRegisterError?: (error: Error) => void;
}) => (reloadPage: () => void) => void) | undefined;

if (import.meta.env.PROD && typeof __VITE_PWA_REGISTER__ === 'function') {
  __VITE_PWA_REGISTER__({
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