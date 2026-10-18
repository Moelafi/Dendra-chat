import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/lexend'
import './index.css'
import App from './App.tsx'
import { initHistory } from './store/ui'

initHistory()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
