import './theme/glass.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './theme/ThemeContext'

// Platform hook for CSS (native caption insets on Windows, etc.).
document.body.dataset.platform = window.api?.platform || ''

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
)
