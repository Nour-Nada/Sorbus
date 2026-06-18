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
import { getAccessToken, setAccessToken } from './context/AuthContext.jsx'
import axios from 'axios'
import './styles/App.css'

const clearSession = (err_code) => { //Clears the in-memory token, calls server logout to clear the cookie, then redirects — userId/username/access reset naturally on remount via restore()
  setAccessToken(null);
  axios.post('/api/user/logout', {}, { withCredentials: true, _retry: true }).catch(() => {});
  window.location.href = err_code === 401 ? '/unauthorized' : '/login';
};

let isRefreshing = false; //Tracks whether a /refresh call is already in flight
let failedQueue = []; //Holds resolve/reject pairs for requests that arrived while a refresh was in progress

const processQueue = (error, token = null) => { //Drains the queue after a refresh attempt, resolving or rejecting each waiting request
  failedQueue.forEach(({ resolve, reject }) => error ? reject(error) : resolve(token));
  failedQueue = [];
};

axios.interceptors.request.use((config) => { //Attaches the in-memory access token to every outgoing request
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

axios.interceptors.response.use( //On 401, silently refreshes the access token and retries; on 403 mismatch, clears session
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) { //Another refresh is already in flight — queue this request until it resolves
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest._retry = true;
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return axios(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post('/api/user/refresh', {}, { withCredentials: true, _retry: true });
        setAccessToken(data.jwt_token);
        processQueue(null, data.jwt_token);
        originalRequest.headers.Authorization = `Bearer ${data.jwt_token}`;
        return axios(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearSession(401);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (error.response?.status === 403 && error.response?.data === 'Access denied: user ID mismatch.') {
      clearSession(403);
    }

    return Promise.reject(error);
  }
);

function App() {
  return (
    <AccountProvider>
      <AuthProvider>
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
      </AuthProvider>
    </AccountProvider>
  )
}

export default App
