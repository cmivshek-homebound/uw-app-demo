import AssetStageTable from '../components/AssetStageTable';
import { assetsByStage } from '../data/selectors';

export default function PortfolioPage() {
  const byStage = assetsByStage();
  const assets = [...byStage.precon, ...byStage.construction];

  return (
    <div className="oq-page">
      <div className="oq-header">
        <div>
          <h1 className="oq-title">Portfolio</h1>
          <p className="oq-subtitle">
            Owned lots in pre-con and construction — budget, draw and schedule tracking is coming soon.
          </p>
        </div>
      </div>
      <AssetStageTable assets={assets} />
    </div>
  );
}
