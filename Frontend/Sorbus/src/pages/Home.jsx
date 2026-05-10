import '../styles/Home.css'
import SideBar from '../components/SideBar.jsx'
import FileView from '../components/FileView.jsx'

function Home() {
  // tree, fileIds, currentPath, setCurrentPath come from context

  return (
    <div className="home">
      <SideBar />
      <FileView />
    </div>
  )
}

export default Home