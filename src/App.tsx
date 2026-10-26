import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar';
import Dashboard from './pages/Dashboard';
import OpportunityQueue from './pages/OpportunityQueue';
import UnderwritePage from './pages/UnderwritePage';
import ScenarioEngine from './pages/ScenarioEngine';
import CompSelectionPage from './pages/CompSelectionPage';
import UnderContractPage from './pages/UnderContractPage';
import PortfolioPage from './pages/PortfolioPage';
import ForSalePage from './pages/ForSalePage';
import { DEMO_DEAL_ID } from './data/contracts';

export default function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/queue" element={<OpportunityQueue />} />
        <Route path="/underwrite" element={<UnderwritePage />} />
        <Route path="/underwrite/:id" element={<UnderwritePage />} />
        <Route path="/underwrite/:id/scenario" element={<ScenarioEngine />} />
        <Route path="/underwrite/:id/scenario/comps" element={<CompSelectionPage />} />
        <Route path="/contract" element={<Navigate to={`/contract/${DEMO_DEAL_ID}`} replace />} />
        <Route path="/contract/:id" element={<UnderContractPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/for-sale" element={<ForSalePage />} />
      </Routes>
    </BrowserRouter>
  );
}
