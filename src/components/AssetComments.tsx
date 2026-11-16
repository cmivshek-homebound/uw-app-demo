import { Fragment, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { MENTION_PATTERN, PEOPLE, useComments } from '../data/comments';
import { relativeTime } from '../data/dates';
import { viewer } from '../data/notifications';
import { useCanAct, useRole } from '../data/role';
// Buttons reuse the shared pf-btn styles.
import '../pages/PortfolioPage.css';
import './AssetComments.css';

function initials(name: string) {
  return name.replace('.', '').split(/\s+/).map((p) => p[0]).join('').toUpperCase();
}

/** Comment text with @mentions highlighted. */
function withMentions(text: string): ReactNode {
  // split() with a capture group puts each mentioned name at the odd indexes.
  return text.split(MENTION_PATTERN).map((part, i) =>
    i % 2 ? <span key={i} className="ac-mention">@{part}</span> : <Fragment key={i}>{part}</Fragment>,
  );
}

/** Thread at the bottom of the asset record; a new @mention notifies that person. */
export default function AssetComments({ assetId }: { assetId: string }) {
  const { comments, addComment } = useComments();
  const { role, analyst } = useRole();
  const canAct = useCanAct();
  const me = viewer(role, analyst);
  const { hash } = useLocation();
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const thread = comments.filter((c) => c.assetId === assetId);

  // Notification links land here (#comments).
  useEffect(() => {
    if (hash !== '#comments') return;
    const t = window.setTimeout(() => document.getElementById('comments')?.scrollIntoView({ block: 'start' }), 50);
    return () => window.clearTimeout(t);
  }, [hash, assetId]);

  // Suggest people while the last word is an @partial.
  const partial = text.match(/@([A-Za-z.]*(?: [A-Za-z]*)?)$/)?.[1];
  const suggestions = partial === undefined
    ? []
    : PEOPLE.filter((p) => p !== me && p.toLowerCase().startsWith(partial.toLowerCase())).slice(0, 5);
  const pick = (name: string) => {
    setText((t) => t.replace(/@([A-Za-z.]*(?: [A-Za-z]*)?)$/, `@${name} `));
    inputRef.current?.focus();
  };

  const post = () => {
    if (!me || !text.trim()) return;
    addComment(assetId, me, text.trim());
    setText('');
  };

  return (
    <section className="uw-card as-card ac" id="comments">
      <div className="as-card-header">
        <h2 className="as-card-title">Comments</h2>
        <span className="as-card-caption">{thread.length} {thread.length === 1 ? 'comment' : 'comments'}</span>
      </div>

      {thread.length === 0 ? (
        <p className="ac-empty">No comments yet.</p>
      ) : (
        <ul className="ac-list">
          {thread.map((c) => (
            <li key={c.id} className="ac-item">
              <span className="ac-avatar" aria-hidden="true">{initials(c.author)}</span>
              <div className="ac-body">
                <div className="ac-meta">
                  <span className="ac-author">{c.author}</span>
                  <span className="ac-time">{relativeTime(c.at)}</span>
                </div>
                <p className="ac-text">{withMentions(c.text)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canAct && me ? (
        <form
          className="ac-form"
          onSubmit={(e) => {
            e.preventDefault();
            post();
          }}
        >
          <span className="ac-avatar" aria-hidden="true">{initials(me)}</span>
          <div className="ac-compose">
            <textarea
              ref={inputRef}
              className="ac-input"
              rows={2}
              value={text}
              placeholder="Add a comment. Type @ to mention someone."
              aria-label="Add a comment"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post();
                if (e.key === 'Tab' && suggestions.length > 0) {
                  e.preventDefault();
                  pick(suggestions[0]);
                }
              }}
            />
            {suggestions.length > 0 && (
              <div className="ac-suggest" role="listbox" aria-label="Mention someone">
                {suggestions.map((p) => (
                  <button key={p} type="button" role="option" aria-selected={false} className="ac-suggest-item" onClick={() => pick(p)}>
                    @{p}
                  </button>
                ))}
              </div>
            )}
            <div className="ac-actions">
              <span className="ac-hint">Commenting as {me} · ⌘↵ to post</span>
              <button type="submit" className="pf-btn pf-btn--small pf-btn--primary" disabled={!text.trim()}>Comment</button>
            </div>
          </div>
        </form>
      ) : (
        <p className="ac-empty">Executive view: comments are read-only.</p>
      )}
    </section>
  );
}
