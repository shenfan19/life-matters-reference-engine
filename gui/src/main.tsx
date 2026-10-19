import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { unstableSetRender } from 'antd'
import './index.css'
import App from './App.tsx'
import { I18nProvider } from './core/i18n'

// antd 5 draws message, notification and Modal.confirm through the legacy render call, which React 19 removed,
// so without this they are never drawn. This is what @ant-design/v5-patch-for-react-19 does.
type RenderTarget = Element & { _reactRoot?: ReturnType<typeof createRoot> }
unstableSetRender((node, container) => {
  const target = container as RenderTarget
  target._reactRoot ||= createRoot(target)
  const root = target._reactRoot
  root.render(node)
  return async () => {
    await Promise.resolve()
    root.unmount()
    delete target._reactRoot
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider section="engine">
      <App />
    </I18nProvider>
  </StrictMode>,
)
