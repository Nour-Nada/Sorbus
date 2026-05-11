import { Routes, Route } from 'react-router-dom'
import './styles/App.css'
import Home from './pages/Home.jsx'
import Account from './pages/Account.jsx'
import { FileProvider } from './context/FileContext.jsx'
import { AccountProvider } from './context/AccountContext.jsx'

function App() {
  return (
    <AccountProvider>
      <FileProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/account" element={<Account />} />
        </Routes>
      </FileProvider>
    </AccountProvider>
  )
}

export default App