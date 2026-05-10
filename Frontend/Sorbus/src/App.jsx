import { Routes, Route } from 'react-router-dom'
import './styles/App.css'
import Home from './pages/Home.jsx'
import Account from './pages/Account.jsx'

function App() {
  return (
    <FileProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/account" element={<Account />} />
      </Routes>
    </FileProvider>
  )
}

export default App