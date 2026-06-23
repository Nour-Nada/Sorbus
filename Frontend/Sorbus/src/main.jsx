import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import axios from 'axios'

axios.defaults.baseURL = import.meta.env.VITE_API_URL || '';
import { BrowserRouter } from 'react-router-dom'
import './styles/index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)