// ============================================================
//   ___  ___  ____  ____  _   _  ___
//  / __)/ _ \(  _ \(  _ )/ ) ( \/ __)
//  \__ \ (_) ))   / ) _ (\ \/ / \__ \
//  (___/\___/(_)\_)(____/ \__/  (___/
//
// Self-Hosted Personal Cloud Storage — MIT License
// ============================================================
import { useNavigate, Link } from 'react-router-dom';
import '../styles/LandingPage.css'
import sorbusLogo from '../assets/sorbus_logo.png';

function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing-page">
      <div className="nav-bar">
        <button className="nav-logo" onClick={() => navigate('/')}>
          <img src={sorbusLogo} alt="Sorbus Logo" />
          <span className="nav-title">Sorbus</span>
        </button>
        <div className="nav-links">
          <Link to="/login" className="nav-link">Login</Link>
          <Link to="/signup" className="nav-link">Sign Up</Link>
        </div>
      </div>
      <div className="landing-hero">
        <div className="hero-glow" />
        <h1>Your secure and private<br />file storage solution.</h1>
        <p className="hero-subtitle">Access your local files from anywhere.</p>
        <Link to="/signup" className="cta-button">Get Started <span className="material-icons">arrow_forward</span></Link>
      </div>
    </div>
  )
}

export default LandingPage
