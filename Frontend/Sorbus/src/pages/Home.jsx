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