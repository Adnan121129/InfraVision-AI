import { UserPlus } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

import { AuthShell } from "./AuthShell";

export default function RegisterPage() {
  useDocumentTitle("Create account");
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", organization: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/app" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setErrors({});
    try {
      await register(form);
      navigate("/app", { replace: true });
    } catch (err) {
      const apiError = err as ApiError;
      setErrors(apiError.fieldErrors ?? {});
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  };

  const bind = (key: keyof typeof form) => ({ value: form[key], onChange: (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })), error: errors[key]?.[0] });

  return (
    <AuthShell title="Create your account" subtitle="New accounts start with read-only Viewer access. An administrator can grant inspector or engineer roles.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && (
          <p role="alert" className="rounded-lg border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-critical-ink">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label="First name" autoComplete="given-name" {...bind("first_name")} />
          <Input label="Last name" autoComplete="family-name" {...bind("last_name")} />
        </div>
        <Input label="Work email" type="email" autoComplete="email" required {...bind("email")} />
        <Input label="Organisation" autoComplete="organization" {...bind("organization")} />
        <Input label="Password" type="password" autoComplete="new-password" hint="min. 10 characters" required {...bind("password")} />
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading} icon={<UserPlus className="size-4" />}>
          Create account
        </Button>
      </form>
      <p className="mt-5 text-center text-xs text-ink-3">
        Already have an account?{" "}
        <Link to="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
