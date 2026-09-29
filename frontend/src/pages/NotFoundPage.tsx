import { Compass } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function NotFoundPage() {
  useDocumentTitle("Not found");
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl border border-line bg-surface text-accent">
        <Compass className="size-6" />
      </div>
      <p className="font-mono text-xs text-ink-3">404</p>
      <h1 className="mt-1 text-xl font-semibold text-ink">This page could not be found</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-2">The asset, inspection or page you are looking for may have been archived or never existed.</p>
      <Link to="/app" className="mt-6">
        <Button variant="primary">Back to dashboard</Button>
      </Link>
    </div>
  );
}
