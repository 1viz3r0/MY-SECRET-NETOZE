import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

window.addEventListener('unhandledrejection', (event) => {
  console.error('CRITICAL UNHANDLED IPC/PROMISE REJECTION:', event.reason)
})
window.addEventListener('error', (event) => {
  console.error('CRITICAL FRONTEND ERROR:', event.error)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
