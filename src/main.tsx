import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './app/App'
import { installSeedHook } from './app/devSeed'
import { applyTheme, readTheme } from './app/theme'
import './index.css'

applyTheme(readTheme())
await installSeedHook()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
