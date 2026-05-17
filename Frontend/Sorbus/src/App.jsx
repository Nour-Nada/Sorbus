import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { AccountProvider } from './context/AccountContext.jsx'
import { FileProvider } from './context/FileContext.jsx'
import Home from './pages/Home.jsx'
import Account from './pages/Account.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import LandingPage from './pages/LandingPage.jsx'
import RedirectPage from './pages/RedirectPage.jsx'
import UnauthorizedPage from './pages/UnauthorizedPage.jsx'
import ProtectedRoutes from './utils/ProtectedRoutes.jsx'
import axios from 'axios'
import './styles/App.css'

const clearSession = (err_code) => { //Clears the session and redirects to login
  localStorage.removeItem('token');
  localStorage.removeItem('userId');
  //To refresh the app we use this method instead of a navigate because we need to reset all the state in the app and this is the most straightforward way to do it without having to set up a global state for it or something like that
  if (err_code === 401) { //executes if the JWT token is invalid which can occur when it expires or is tampered with (a more gracefull logout then randomly directed to login)
    //window.location.href = '/unauthorized'; // eslint-disable-line
    //trusts that the ProtectedRoute component will redirect to the unauthorized page and just directs to the login page so that the user doesn't see a flash of the unauthorized page which can be confusing and isn't really necessary since the user is being logged out anyway
  }
  else { //executes if tampering was done with the stored user id of some other error occured that caused an abrubt logout (a more abrupt logout but this should be a very rare edge case and the user is being logged out anyway so it isn't really a problem)
    //A small flash happens when redirecting if this route is taken. However this can be tolerated as the only reason this route would be hit is if something went very wrong or somone malicous is trying to gain unauthorized access and in either case the user is being logged out anyway so it isn't really a problem.
    window.location.href = '/login'; // eslint-disable-line
  }
};

axios.interceptors.request.use((config) => { //Attaches JWT to every outgoing request
  const token = localStorage.getItem('token');
  if (token) { //checks if the token exists and if it does it adds it to the header of the request
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axios.interceptors.response.use( //Clears session on invalid or mismatched session
  (response) => response,
  (error) => {
    if ((error.response?.status === 401 && error.response?.data === 'Invalid JWT token.')) {
      clearSession(401);
    }
    else if ((error.response?.status === 403 && error.response?.data === 'Access denied: user ID mismatch.')) {
      clearSession(403);
    }
    return Promise.reject(error);
  }
);

function App() {
  return (
    <AuthProvider>
      <AccountProvider>
        <FileProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/" element={<LandingPage />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />
            <Route path="*" element={<RedirectPage />} />

            <Route element={<ProtectedRoutes />}>
              <Route path="/home" element={<Home />} />
              <Route path="/account" element={<Account />} />
            </Route>
          </Routes>
        </FileProvider>
      </AccountProvider>
    </AuthProvider>
  )
}

export default App
