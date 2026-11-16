import type { Market, ProvenanceInfo } from '../types';
import { AI, BLUEPRINT, MLS, SFDC, TAPE } from './provenance';

// ── Data sources & integrations ────────────────────────────────
// Every source that feeds a displayed number, the fields it feeds, and the
// screens that show them. Rendered at /integrations. When a screen starts
// showing a new field, add it here with the same marker it uses on screen.

export type ScreenId =
  | 'dashboard'
  | 'intake'
  | 'underwriteBoard'
  | 'underwrite'
  | 'aiDraft'
  | 'scenario'
  | 'comps'
  | 'contractList'
  | 'contract'
  | 'asset'
  | 'portfolio'
  | 'marks'
  | 'accuracy'
  | 'construction'
  | 'forSale'
  | 'approvals';

/** Screen names, with an example link for routes that take an asset id. */
export const SCREENS: Record<ScreenId, { label: string; example: string }> = {
  dashboard: { label: 'Dashboard', example: '/' },
  intake: { label: 'Intake', example: '/intake' },
  underwriteBoard: { label: 'Underwrite board', example: '/underwrite' },
  underwrite: { label: 'Underwrite', example: '/underwrite/BOOL-002' },
  aiDraft: { label: 'AI draft', example: '/underwrite/BOOL-003/draft' },
  scenario: { label: 'Scenario engine', example: '/underwrite/BOOL-002/scenario' },
  comps: { label: 'Comp selection', example: '/underwrite/BOOL-002/scenario/comps' },
  contractList: { label: 'Under contract list', example: '/contract' },
  contract: { label: 'Under contract deal', example: '/contract/BOOL-001' },
  asset: { label: 'Asset detail', example: '/asset/BOOL-022' },
  portfolio: { label: 'Dashboard · All assets', example: '/' },
  marks: { label: 'Marks · Month-end marks', example: '/marks' },
  accuracy: { label: 'Marks · Underwriting accuracy', example: '/marks?tab=accuracy' },
  construction: { label: 'Construction', example: '/construction' },
  forSale: { label: 'For sale', example: '/for-sale' },
  approvals: { label: 'Needs your approval', example: '/approvals' },
};

export type IntegrationId = 'salesforce' | 'tape' | 'blueprint' | 'mls' | 'ai' | 'slack';

/** Each market's Slack channel; in production every notification posts to its asset's market channel. */
export const SLACK_CHANNELS: Record<Market, string> = {
  DFW: '#bool-dfw',
  Houston: '#bool-houston',
  Tampa: '#bool-tampa',
  'St. Pete': '#bool-st-pete',
  LA: '#bool-la',
};

export interface Integration {
  id: IntegrationId;
  name: string;
  kind: 'System of record' | 'AI model' | 'Notifications';
  description: string;
  marker?: ProvenanceInfo;    // the marker its values carry on screen; none for outbound-only sources
  fields: { field: string; screens: ScreenId[] }[];
}

export const INTEGRATIONS: Integration[] = [
  {
    id: 'salesforce',
    name: 'Salesforce',
    kind: 'System of record',
    description: 'Lead and deal records: the lot, its zoning, the asking or contracted land price, and contract terms.',
    marker: SFDC,
    fields: [
      { field: 'Lot sqft', screens: ['intake', 'underwriteBoard', 'underwrite', 'aiDraft', 'scenario', 'asset'] },
      { field: 'Lot dimensions (width × depth)', screens: ['underwrite', 'aiDraft', 'scenario'] },
      { field: 'Setbacks and max lot coverage', screens: ['aiDraft'] },
      { field: 'Asking or contracted land price', screens: ['aiDraft', 'scenario', 'contractList', 'contract', 'asset'] },
    ],
  },
  {
    id: 'tape',
    name: 'BOOL data tape',
    kind: 'System of record',
    description: 'Realized results on sold homes, used to check how underwriting held up.',
    marker: TAPE,
    fields: [
      { field: 'Realized cost lines (closing, build, carry, selling)', screens: ['asset', 'accuracy'] },
      { field: 'Realized total cost and margin', screens: ['asset', 'accuracy'] },
      { field: 'Realized closing cost as % of land', screens: ['asset', 'accuracy'] },
      { field: 'Variance vs. underwrite by line', screens: ['accuracy'] },
    ],
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    kind: 'System of record',
    description: 'Construction budgets, spend and schedules for owned lots, from pre-con through CO.',
    marker: BLUEPRINT,
    fields: [
      { field: 'Vertical budget and budget lines', screens: ['construction', 'asset'] },
      { field: 'Spend to date and % complete', screens: ['construction', 'asset'] },
      { field: 'Schedule: planned and forecast CO, milestones, weeks late', screens: ['construction', 'asset', 'approvals'] },
      { field: 'Change orders', screens: ['construction', 'asset'] },
      { field: 'Construction loan draws', screens: ['construction', 'asset'] },
    ],
  },
  {
    id: 'mls',
    name: 'MLS',
    kind: 'System of record',
    description: 'Comparable sales for pricing, and listing activity on homes we have for sale.',
    marker: MLS,
    fields: [
      { field: 'Comp sales (price, sqft, $/sqft, distance)', screens: ['aiDraft', 'comps', 'marks'] },
      { field: 'List price and price drops', screens: ['forSale', 'asset', 'approvals'] },
      { field: 'Days on market', screens: ['forSale', 'asset', 'dashboard', 'approvals'] },
      { field: 'Showings, views and saves', screens: ['forSale', 'asset'] },
      { field: 'Offers and concessions', screens: ['forSale', 'asset'] },
      { field: 'Sale price', screens: ['asset', 'accuracy'] },
    ],
  },
  {
    id: 'ai',
    name: 'AI',
    kind: 'AI model',
    description: 'Drafts and forecasts an analyst confirms or overrides. Values stay marked AI until someone signs off.',
    marker: AI,
    fields: [
      { field: 'Pre-screen detections and draft confidence', screens: ['underwriteBoard', 'underwrite', 'aiDraft'] },
      { field: 'Underwrite draft: ESP, build, cost stack, margin, max land price', screens: ['aiDraft', 'scenario', 'contractList', 'contract', 'asset', 'approvals'] },
      { field: 'Lot feasibility: buildable area, coverage, plan and ADU fit', screens: ['aiDraft', 'scenario'] },
      { field: 'ADU economics', screens: ['aiDraft', 'scenario', 'asset'] },
      { field: 'Comp adjustments and ML ESP', screens: ['comps'] },
      { field: 'Month-end mark proposals and drivers', screens: ['marks', 'dashboard', 'portfolio', 'asset', 'approvals'] },
      { field: 'Listing health diagnosis and recommendations', screens: ['forSale', 'approvals'] },
      { field: 'Estimate at completion and cost to complete', screens: ['construction', 'asset', 'approvals'] },
      { field: 'Margin impact of build overruns and slips', screens: ['construction', 'asset', 'approvals'] },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    kind: 'Notifications',
    description: `Outbound only. In production every in-app notification also posts to its market’s channel (${Object.values(SLACK_CHANNELS).join(', ')}), and @mentions in asset comments DM the person.`,
    fields: [
      { field: 'AI draft ready, Growth handoffs and AE counters', screens: ['underwriteBoard', 'aiDraft', 'asset'] },
      { field: 'Mark approvals needed and approved', screens: ['marks', 'approvals'] },
      { field: 'Inspection deadlines, stale listings and over-budget builds', screens: ['contract', 'forSale', 'construction'] },
      { field: '@mentions in asset comments', screens: ['asset'] },
    ],
  },
];
