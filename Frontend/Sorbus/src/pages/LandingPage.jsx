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
      <div className="landing-content">
        <div className="landing-text">
          <h1>Your secure and private file storage solution.</h1>
          <Link to="/signup" className="cta-button">Get Started <span className="material-icons">arrow_forward</span></Link>
        </div>
        <div className="landing-logo">
          <img src={sorbusLogo} alt="Sorbus Logo" />
        </div>
      </div>
    </div>
  )
}

export default LandingPage