import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { I18nProvider } from './core/i18n'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider section="sim">
      <App />
    </I18nProvider>
  </StrictMode>,
)
