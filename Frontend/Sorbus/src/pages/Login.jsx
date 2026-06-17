import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuthContext } from '../context/AuthContext.jsx';
import { useAccountContext } from '../context/AccountContext.jsx';
import axios from 'axios';
import '../styles/Login-Signup.css'
import sorbusLogo from '../assets/sorbus_logo.png';

// Test account for reviewers — username: testuser · email: test · password: test123

function Login() {
  const [error, setError] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const { login, isLoggedIn } = useAuthContext();
  const { updateUserId, setUsername: setAccountUsername, setAccess } = useAccountContext();
  const navigate = useNavigate();
  const location = useLocation();

  const signIn = async () => {
    // Sends login request and stores session data on success
    try {
      const response = await axios.post(`/api/user/login/${username}`, { password }, { _retry: true });
      const { user_id, username: returnedUsername, access, jwt_token } = response.data;
      login(jwt_token);
      updateUserId(user_id);
      setAccountUsername(returnedUsername);
      setAccess(access);
      navigate('/home');
    } catch {
      setError(true);
    }
  };

  if(isLoggedIn) return <Navigate to="/home"/>; //routes them to the file page if they are already logged in

  return (
    <div className="login">
      <div className="login-box">
        <button className="login-logo" onClick={() => navigate('/')}>
          <img src={sorbusLogo} alt="Sorbus Logo" />
          <p>Sorbus</p>
        </button>
        {error && (
          <div className="error-text">
            <p>Invalid username or password.</p>
          </div>
        )}
        <div className="two-buttons">
          <button className="login-btn" onClick={() => navigate('/login')} style={location.pathname === '/login' ? { backgroundColor: 'white' } : {}}>
            Login
          </button>
          <button className="signup-btn" onClick={() => navigate('/signup')} style={location.pathname === '/signup' ? { backgroundColor: 'white' } : {}}>
            Sign Up
          </button>
        </div>
        <form className="login-form" onSubmit={(e) => { e.preventDefault(); signIn(); }}>
          <p className="form-label">USERNAME OR EMAIL</p>
          <input type="text" placeholder="Enter your username or email" value={username} onChange={(e) => setUsername(e.target.value)} />
          <p className="form-label">PASSWORD</p>
          <input type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" className="submit-btn">Sign In</button>
        </form>
      </div>
    </div>
  )
}

export default Login
