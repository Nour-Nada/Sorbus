// ============================================================
//   ___  ___  ____  ____  _   _  ___
//  / __)/ _ \(  _ \(  _ )/ ) ( \/ __)
//  \__ \ (_) ))   / ) _ (\ \/ / \__ \
//  (___/\___/(_)\_)(____/ \__/  (___/
//
// Self-Hosted Personal Cloud Storage — MIT License
// ============================================================
import '../styles/Home.css'
import SideBar from '../components/SideBar.jsx'
import FileView from '../components/FileView.jsx'
import UploadToast from '../components/UploadToast.jsx'

function Home() {

  return (
    <div className="home">
      <SideBar />
      <FileView />
      <UploadToast />
    </div>
  )
}

export default Home