import { Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import MapaPage from './pages/MapaPage'
import DetallPage from './pages/DetallPage'
import CasDetallPage from './pages/CasDetallPage'
import AlertesPage from './pages/AlertesPage'
import InfoPage from './pages/InfoPage'
import EstadistiquesPage from './pages/EstadistiquesPage'

function App() {
  return (
    <div className="app">
      <Header />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<MapaPage />} />
          <Route path="/estadistiques" element={<EstadistiquesPage />} />
          <Route path="/provincia/:codi" element={<DetallPage />} />
          <Route path="/cas/:id" element={<CasDetallPage />} />
          <Route path="/alertes" element={<AlertesPage />} />
          <Route path="/info" element={<InfoPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
