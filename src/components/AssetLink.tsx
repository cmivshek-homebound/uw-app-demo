import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './AssetLink.css';

/**
 * Link to an asset's record (/asset/:id). Inherits the surrounding text's
 * look and underlines on hover, so ids and addresses can be clickable
 * without restyling the row they sit in. `record` renders the standard
 * "View asset record →" link instead.
 */
export default function AssetLink({
  id,
  children,
  className = '',
  record = false,
}: {
  id: string;
  children?: ReactNode;
  className?: string;
  record?: boolean;
}) {
  return (
    <Link
      to={`/asset/${id}`}
      className={`${record ? 'asset-record-link' : 'asset-link'} ${className}`.trim()}
      onClick={(e) => e.stopPropagation()}
    >
      {record ? 'View asset record →' : children}
    </Link>
  );
}
