import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import AppFooter from './components/AppFooter';
import DemoPresenter from './components/DemoPresenter';
import DemoProvider from './components/DemoProvider';
import RoleProvider from './components/RoleProvider';
import ShowSourcesProvider from './components/ShowSourcesProvider';
import NavBar from './components/NavBar';
import NavHistoryProvider from './components/NavHistoryProvider';
import DraftReviewProvider from './components/DraftReviewProvider';
import MarkReviewProvider from './components/MarkReviewProvider';
import ListingActionProvider from './components/ListingActionProvider';
import IntakeProvider from './components/IntakeProvider';
import Dashboard from './pages/Dashboard';
import IntakePage from './pages/IntakePage';
import UnderwritePage from './pages/UnderwritePage';
import UnderwriteBoard from './pages/UnderwriteBoard';
import AIDraftPage from './pages/AIDraftPage';
import AssetDetailPage from './pages/AssetDetailPage';
import ScenarioEngine from './pages/ScenarioEngine';
import CompSelectionPage from './pages/CompSelectionPage';
import ApprovalsPage from './pages/ApprovalsPage';
import ContractListPage from './pages/ContractListPage';
import UnderContractPage from './pages/UnderContractPage';
import PortfolioPage from './pages/PortfolioPage';
import ForSalePage from './pages/ForSalePage';
import IntegrationsPage from './pages/IntegrationsPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <BrowserRouter>
      <DraftReviewProvider>
      <IntakeProvider>
        <MarkReviewProvider>
          <ListingActionProvider>
            <DemoProvider>
            <RoleProvider>
            <ShowSourcesProvider>
            <NavHistoryProvider>
            <NavBar />
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/intake" element={<IntakePage />} />
              <Route path="/queue" element={<Navigate to="/intake" replace />} />
              <Route path="/underwrite" element={<UnderwriteBoard />} />
              <Route path="/underwrite/:id" element={<UnderwritePage />} />
              <Route path="/underwrite/:id/draft" element={<AIDraftPage />} />
              <Route path="/underwrite/:id/scenario" element={<ScenarioEngine />} />
              <Route path="/underwrite/:id/scenario/comps" element={<CompSelectionPage />} />
              <Route path="/contract" element={<ContractListPage />} />
              <Route path="/contract/:id" element={<UnderContractPage />} />
              <Route path="/asset/:id" element={<AssetDetailPage />} />
              <Route path="/portfolio" element={<PortfolioPage />} />
              <Route path="/for-sale" element={<ForSalePage />} />
              <Route path="/integrations" element={<IntegrationsPage />} />
              <Route path="/approvals" element={<ApprovalsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
            <AppFooter />
            <DemoPresenter />
            </NavHistoryProvider>
            </ShowSourcesProvider>
            </RoleProvider>
            </DemoProvider>
          </ListingActionProvider>
        </MarkReviewProvider>
      </IntakeProvider>
      </DraftReviewProvider>
    </BrowserRouter>
  );
}
