import { useState } from 'react';
import '../styles/SideBar.css';
import sorbusLogo from '../assets/sorbus_logo.png';

function SideBar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button className="hamburger" onClick={() => setIsOpen(!isOpen)}>
        <span className="material-icons">{isOpen ? 'close' : 'menu'}</span>
      </button>
      <div className={`side-bar ${isOpen ? 'open' : ''}`}>
        <div className="side-bar-logo">
          <img src={sorbusLogo} alt="Sorbus Logo" />
        </div>
      </div>
    </>
  );
}

export default SideBar;
