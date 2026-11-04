import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar';
import DraftReviewProvider from './components/DraftReviewProvider';
import MarkReviewProvider from './components/MarkReviewProvider';
import ListingActionProvider from './components/ListingActionProvider';
import Dashboard from './pages/Dashboard';
import OpportunityQueue from './pages/OpportunityQueue';
import UnderwritePage from './pages/UnderwritePage';
import UnderwriteBoard from './pages/UnderwriteBoard';
import AIDraftPage from './pages/AIDraftPage';
import AssetDetailPage from './pages/AssetDetailPage';
import ScenarioEngine from './pages/ScenarioEngine';
import CompSelectionPage from './pages/CompSelectionPage';
import UnderContractPage from './pages/UnderContractPage';
import PortfolioPage from './pages/PortfolioPage';
import ForSalePage from './pages/ForSalePage';
import { DEMO_DEAL_ID } from './data/contracts';

export default function App() {
  return (
    <BrowserRouter>
      <DraftReviewProvider>
        <MarkReviewProvider>
          <ListingActionProvider>
            <NavBar />
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/queue" element={<OpportunityQueue />} />
              <Route path="/underwrite" element={<UnderwriteBoard />} />
              <Route path="/underwrite/:id" element={<UnderwritePage />} />
              <Route path="/underwrite/:id/draft" element={<AIDraftPage />} />
              <Route path="/underwrite/:id/scenario" element={<ScenarioEngine />} />
              <Route path="/underwrite/:id/scenario/comps" element={<CompSelectionPage />} />
              <Route path="/contract" element={<Navigate to={`/contract/${DEMO_DEAL_ID}`} replace />} />
              <Route path="/contract/:id" element={<UnderContractPage />} />
              <Route path="/asset/:id" element={<AssetDetailPage />} />
              <Route path="/portfolio" element={<PortfolioPage />} />
              <Route path="/for-sale" element={<ForSalePage />} />
            </Routes>
          </ListingActionProvider>
        </MarkReviewProvider>
      </DraftReviewProvider>
    </BrowserRouter>
  );
}
