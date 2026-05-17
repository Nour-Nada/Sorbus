import { useNavigate } from 'react-router-dom';
import '../styles/RedirectPage.css';
import sorbusLogo from '../assets/sorbus_logo.png';

function RedirectPage() {
  const navigate = useNavigate();

  return (
    <div className="redirect-page">
      <div className="redirect-box">
        <div className="redirect-logo">
          <img src={sorbusLogo} alt="Sorbus Logo" />
          <p>Sorbus</p>
        </div>
        <p className="redirect-code">404</p>
        <p className="redirect-message">This page doesn't exist.</p>
        <div className="redirect-actions">
          <button onClick={() => navigate('/landingpage')}>Go to Home</button>
          <button onClick={() => navigate('/login')}>Go to Login</button>
        </div>
      </div>
    </div>
  );
}

export default RedirectPage;
