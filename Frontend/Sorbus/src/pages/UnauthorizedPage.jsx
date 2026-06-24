// ============================================================
//   ___  ___  ____  ____  _   _  ___
//  / __)/ _ \(  _ \(  _ )/ ) ( \/ __)
//  \__ \ (_) ))   / ) _ (\ \/ / \__ \
//  (___/\___/(_)\_)(____/ \__/  (___/
//
// Self-Hosted Personal Cloud Storage — MIT License
// ============================================================
import { useNavigate } from 'react-router-dom';
import '../styles/RedirectPage.css';
import sorbusLogo from '../assets/sorbus_logo.png';

function UnauthorizedPage() {
  const navigate = useNavigate();

  return (
    <div className="redirect-page">
      <div className="redirect-box">
        <div className="redirect-logo">
          <img src={sorbusLogo} alt="Sorbus Logo" />
          <p>Sorbus</p>
        </div>
        <p className="redirect-code">403</p>
        <p className="redirect-message">You are not authorized to access this page.</p>
        <div className="redirect-actions">
          <button onClick={() => navigate('/')}>Go to Home</button>
          <button onClick={() => navigate('/login')}>Go to Login</button>
        </div>
      </div>
    </div>
  );
}

export default UnauthorizedPage;