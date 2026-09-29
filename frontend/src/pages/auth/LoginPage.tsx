import { KeyRound, LogIn, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

import { AuthShell } from "./AuthShell";

const DEMO_ACCOUNTS = [
  { email: "admin@infravision.ai", role: "Administrator" },
  { email: "engineer@infravision.ai", role: "Engineer" },
  { email: "inspector@infravision.ai", role: "Inspector" },
  { email: "viewer@infravision.ai", role: "Viewer" },
];

export default function LoginPage() {
  useDocumentTitle("Sign in");
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(params.get("expired") ? "Your session expired. Please sign in again." : null);
  const [loading, setLoading] = useState(false);
  const next = params.get("next")?.startsWith("/app") ? params.get("next")! : "/app";

  if (user) return <Navigate to={next} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Sign in to InfraVision" subtitle="Use your organisation account to access the monitoring platform.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && (
          <p role="alert" className="rounded-lg border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-critical-ink">
            {error}
          </p>
        )}
        <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} leading={<Mail className="size-4" />} />
        <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} leading={<KeyRound className="size-4" />} />
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading} icon={<LogIn className="size-4" />} disabled={!email || !password}>
          Sign in
        </Button>
      </form>
      <p className="mt-5 text-center text-xs text-ink-3">
        New to the platform?{" "}
        <Link to="/register" className="text-accent hover:underline">
          Request viewer access
        </Link>
      </p>
      <div className="mt-8 rounded-xl border border-line bg-surface p-4">
        <p className="label-eyebrow">Demo accounts</p>
        <p className="mt-1 text-[11px] text-ink-3">Seeded by <code className="font-mono text-ink-2">seed_demo</code>; password is set by DEMO_USER_PASSWORD (default in README).</p>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => setEmail(account.email)}
              className="rounded-md border border-line px-2 py-1.5 text-left hover:border-accent/50 hover:bg-surface-2"
            >
              <span className="block text-xs font-medium text-ink">{account.role}</span>
              <span className="block truncate text-[10px] text-ink-3">{account.email}</span>
            </button>
          ))}
        </div>
      </div>
    </AuthShell>
  );
}
