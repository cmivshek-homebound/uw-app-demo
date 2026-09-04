import { BrowserRouter, Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar';
import OpportunityQueue from './pages/OpportunityQueue';
import UnderwritePage from './pages/UnderwritePage';
import ScenarioEngine from './pages/ScenarioEngine';
import CompSelectionPage from './pages/CompSelectionPage';
import UnderContractPage from './pages/UnderContractPage';

export default function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <Routes>
        <Route path="/" element={<OpportunityQueue />} />
        <Route path="/underwrite" element={<UnderwritePage />} />
        <Route path="/underwrite/:id" element={<UnderwritePage />} />
        <Route path="/underwrite/:id/scenario" element={<ScenarioEngine />} />
        <Route path="/underwrite/:id/scenario/comps" element={<CompSelectionPage />} />
        <Route path="/contract" element={<UnderContractPage />} />
        <Route path="/contract/:id" element={<UnderContractPage />} />
      </Routes>
    </BrowserRouter>
  );
}
