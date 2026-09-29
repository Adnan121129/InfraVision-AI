import { useState, type FormEvent } from "react";

import { ApiError } from "@/api/client";
import { authApi } from "@/api/endpoints";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { formatDateTime } from "@/utils/format";

export default function ProfilePage() {
  useDocumentTitle("Profile");
  const { user, refreshUser } = useAuth();
  const { notify } = useToast();
  const [profile, setProfile] = useState({ first_name: user?.first_name ?? "", last_name: user?.last_name ?? "", job_title: user?.job_title ?? "", organization: user?.organization ?? "", phone: user?.phone ?? "" });
  const [passwords, setPasswords] = useState({ current: "", next: "" });
  const [pwErrors, setPwErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await authApi.updateMe(profile);
      await refreshUser();
      notify("Profile updated", { level: "success" });
    } catch (err) {
      notify("Could not update profile", { level: "error", description: (err as ApiError).message });
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setChanging(true);
    setPwErrors({});
    try {
      await authApi.changePassword(passwords.current, passwords.next);
      setPasswords({ current: "", next: "" });
      notify("Password changed", { level: "success" });
    } catch (err) {
      setPwErrors((err as ApiError).fieldErrors);
    } finally {
      setChanging(false);
    }
  };

  return (
    <>
      <PageHeader title="Profile & security" subtitle={`${user?.email} · ${user?.role_display} · last sign-in ${formatDateTime(user?.last_login)}`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Personal details" subtitle="Your role is managed by an administrator." />
          <form onSubmit={saveProfile} className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
            <Input label="First name" value={profile.first_name} onChange={(e) => setProfile({ ...profile, first_name: e.target.value })} />
            <Input label="Last name" value={profile.last_name} onChange={(e) => setProfile({ ...profile, last_name: e.target.value })} />
            <Input label="Job title" value={profile.job_title} onChange={(e) => setProfile({ ...profile, job_title: e.target.value })} />
            <Input label="Organisation" value={profile.organization} onChange={(e) => setProfile({ ...profile, organization: e.target.value })} />
            <Input label="Phone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} wrapperClassName="sm:col-span-2" />
            <div className="sm:col-span-2">
              <Button type="submit" variant="primary" loading={saving}>
                Save profile
              </Button>
            </div>
          </form>
        </Card>
        <Card>
          <CardHeader title="Change password" subtitle="Minimum 10 characters; common and numeric-only passwords are rejected." />
          <form onSubmit={changePassword} className="space-y-4 px-5 pb-5">
            <Input label="Current password" type="password" autoComplete="current-password" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} error={pwErrors.current_password?.[0]} />
            <Input label="New password" type="password" autoComplete="new-password" value={passwords.next} onChange={(e) => setPasswords({ ...passwords, next: e.target.value })} error={pwErrors.new_password?.[0]} />
            <Button type="submit" loading={changing} disabled={!passwords.current || !passwords.next}>
              Update password
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
