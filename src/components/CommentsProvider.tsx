import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { CommentContext, SEED_COMMENTS, mentionsIn } from '../data/comments';
import type { AssetComment, CommentStore } from '../data/comments';
import { demoNow } from '../data/dates';
import { assetAddress, mentionAudience, useNotifications } from '../data/notifications';

/** Seeded comment threads plus comments added this session. A new @mention notifies that person. */
export default function CommentsProvider({ children }: { children: ReactNode }) {
  const [added, setAdded] = useState<AssetComment[]>([]);
  const { notify } = useNotifications();

  const addComment = useCallback((assetId: string, author: string, text: string) => {
    const at = demoNow();
    setAdded((prev) => [...prev, { id: `c-${at}-${prev.length}`, assetId, author, at, text }]);
    for (const recipient of mentionsIn(text).filter((p) => p !== author)) {
      notify({
        type: 'mention',
        title: `${author} mentioned ${recipient}`,
        detail: `On ${assetAddress(assetId)}: ${text}`,
        assetId,
        to: `/asset/${assetId}#comments`,
        at,
        mention: { by: author, recipient },
        ...mentionAudience(recipient),
      });
    }
  }, [notify]);

  const store = useMemo<CommentStore>(() => ({ comments: [...SEED_COMMENTS, ...added], addComment }), [added, addComment]);
  return <CommentContext.Provider value={store}>{children}</CommentContext.Provider>;
}
