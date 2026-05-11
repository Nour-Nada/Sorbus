import { Routes, Route } from 'react-router-dom'
import './styles/App.css'
import Home from './pages/Home.jsx'
import Account from './pages/Account.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { AccountProvider } from './context/AccountContext.jsx'
import { FileProvider } from './context/FileContext.jsx'

function App() {
  return (
    <AuthProvider>
      <AccountProvider>
        <FileProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/account" element={<Account />} />
          </Routes>
        </FileProvider>
      </AccountProvider>
    </AuthProvider>
  )
}

export default App