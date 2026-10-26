import AssetStageTable from '../components/AssetStageTable';
import { assetsByStage } from '../data/selectors';

export default function ForSalePage() {
  const assets = assetsByStage().for_sale;

  return (
    <div className="oq-page">
      <div className="oq-header">
        <div>
          <h1 className="oq-title">For Sale</h1>
          <p className="oq-subtitle">
            Listed homes — showings, price drops and days-on-market tracking is coming soon.
          </p>
        </div>
      </div>
      <AssetStageTable assets={assets} />
    </div>
  );
}
