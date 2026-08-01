import { useEffect, useState } from "react";
import { extractPhotoUrl } from "../lib/utils";
import { resolveDocumentUrl } from "../lib/documentStorage";

interface CandidateAvatarProps {
  source: any;
  alt: string;
  className?: string;
  fallback: React.ReactNode;
}

// extractPhotoUrl() can return either a ready-to-use URL (legacy public
// bucket, Google Drive, job boards) or a bare storage path into the private
// bucket that still needs resolveDocumentUrl() to become a signed URL —
// this component hides that async step behind one reusable <img>/fallback.
export function CandidateAvatar({ source, alt, className, fallback }: CandidateAvatarProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const raw = extractPhotoUrl(source);
    if (!raw) {
      setResolvedUrl(null);
      return;
    }
    resolveDocumentUrl(raw).then((url) => {
      if (!cancelled) setResolvedUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  if (!resolvedUrl) return <>{fallback}</>;

  return (
    <img
      src={resolvedUrl}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
    />
  );
}
