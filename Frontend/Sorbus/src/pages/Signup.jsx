// ============================================================
//   ___  ___  ____  ____  _   _  ___
//  / __)/ _ \(  _ \(  _ )/ ) ( \/ __)
//  \__ \ (_) ))   / ) _ (\ \/ / \__ \
//  (___/\___/(_)\_)(____/ \__/  (___/
//
// Self-Hosted Personal Cloud Storage — MIT License
// ============================================================
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuthContext } from '../context/AuthContext.jsx';
import { useAccountContext } from '../context/AccountContext.jsx';
import { useFileContext } from '../context/FileContext.jsx';
import axios from 'axios';
import '../styles/Login-Signup.css'
import sorbusLogo from '../assets/sorbus_logo.png';

function Signup() {
  const [error, setError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [regKey, setRegKey] = useState('');

  const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+\[\]{};':",.<>/?\\|`~]).{8,}$/;

  const validatePassword = (val) => {
    // Returns an error string if password does not meet requirements, empty string if valid
    if (val.length < 8) return 'At least 8 characters required.';
    if (!/[A-Z]/.test(val)) return 'Must include at least one uppercase letter.';
    if (!/[a-z]/.test(val)) return 'Must include at least one lowercase letter.';
    if (!/\d/.test(val)) return 'Must include at least one number.';
    if (!/[!@#$%^&*()\-_=+\[\]{};':",.<>/?\\|`~]/.test(val)) return 'Must include at least one special character.';
    return '';
  };

  const { login, isLoggedIn } = useAuthContext();
  const { updateUserId, setUsername: setAccountUsername, setAccess } = useAccountContext();
  const { runInitialScan } = useFileContext();
  const navigate = useNavigate();
  const location = useLocation();

  const signUp = async () => {
    // Sends signup request and stores session data on success
    const pwErr = validatePassword(password);
    if (pwErr) { setPasswordError(pwErr); return; }
    try {
      const response = await axios.post(`/api/user/signup`, { username, email, password, reg_key: regKey }, { withCredentials: true, _retry: true });
      const { user_id, username: returnedUsername, access, jwt_token } = response.data;
      login(jwt_token);
      updateUserId(user_id);
      setAccountUsername(returnedUsername);
      setAccess(access);
      navigate('/home');
      if (access === 'owner') runInitialScan(user_id); // index the configured folder after auth, shown as loading in the file view
    } catch (err) {
      setError(err.response?.data || 'Could not create account. Check your registration key.');
    }
  };

  if(isLoggedIn) return <Navigate to="/home" replace/>; //routes them to the file page if they are already logged in

  return (
    <div className="login">
      <div className="login-box">
        <button className="login-logo" onClick={() => navigate('/')}>
          <img src={sorbusLogo} alt="Sorbus Logo" />
          <p>Sorbus</p>
        </button>
        {error && (
          <div className="error-text">
            <p>{error}</p>
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
        <form className="login-form" onSubmit={(e) => { e.preventDefault(); signUp(); }}>
          <p className="form-label">USERNAME</p>
          <input
            type="text"
            placeholder="Enter your username"
            value={username}
            pattern="[a-zA-Z0-9_]+"
            required
            onChange={(e) => { setUsername(e.target.value); setUsernameError(''); }}
            onInvalid={(e) => { e.preventDefault(); setUsernameError(e.target.validity.valueMissing ? 'Username is required.' : 'Only letters, numbers, and underscores allowed.'); }}
          />
          {usernameError && <p className="field-error">{usernameError}</p>}
          <p className="form-label">EMAIL</p>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            required
            onChange={(e) => { setEmail(e.target.value); setEmailError(''); }}
            onInvalid={(e) => { e.preventDefault(); setEmailError(e.target.validity.valueMissing ? 'Email is required.' : 'Please enter a valid email address.'); }}
          />
          {emailError && <p className="field-error">{emailError}</p>}
          <p className="form-label">PASSWORD</p>
          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            required
            onChange={(e) => { setPassword(e.target.value); setPasswordError(validatePassword(e.target.value)); setError(''); }}
          />
          {passwordError && <p className="field-error">{passwordError}</p>}
          <p className="form-label">REGISTRATION KEY</p>
          <input type="password" placeholder="Enter your registration key" value={regKey} onChange={(e) => setRegKey(e.target.value)} required />
          <p className="helper-text">Contact your server owner for a registration key.</p>
          <button type="submit" className="submit-btn">Create Account</button>
        </form>
      </div>
    </div>
  )
}

export default Signup
