import { ASSETS } from './assets';
import { useBlueprint, withBudgetPromotions } from './blueprint';
import { useIntake, withIntakeDecisions } from './intake';
import { useListingActions, withListingActions } from './listingActions';
import { useMarkReviews, withMarkReviews } from './markReview';
import { useDraftReviews, withReviewStatus } from './review';
import type { Asset } from '../types';

/**
 * Every asset with all of this session's changes applied: mark reviews,
 * intake decisions, draft submissions, listing actions and Blueprint budget
 * promotions. One place so every screen sees the same state.
 */
export function useSessionAssets(): Asset[] {
  const { reviews: markReviews, published } = useMarkReviews();
  const { decisions } = useIntake();
  const { reviews: draftReviews } = useDraftReviews();
  const { actions } = useListingActions();
  const { promotions } = useBlueprint();
  return withBudgetPromotions(
    withListingActions(
      withReviewStatus(withIntakeDecisions(withMarkReviews(ASSETS, markReviews, published), decisions), draftReviews),
      actions,
    ),
    promotions,
  );
}
