import { Pencil, Search, UserPlus, UserX } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { ApiError } from "@/api/client";
import { usersApi } from "@/api/endpoints";
import { PageHeader } from "@/components/layout/PageHeader";
import { DotBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Input, Select } from "@/components/ui/Field";
import { KpiCard } from "@/components/ui/KpiCard";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { useAuth } from "@/contexts/AuthContext";
import { useMeta } from "@/contexts/MetaContext";
import { useToast } from "@/contexts/ToastContext";
import { useApi } from "@/hooks/useApi";
import { useDebounce } from "@/hooks/useDebounce";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import type { Role, User } from "@/types/api";
import { relativeTime } from "@/utils/format";

const ROLE_COLOR: Record<Role, string> = { ADMINISTRATOR: "#38bdf8", ENGINEER: "#3987e5", INSPECTOR: "#199e70", VIEWER: "#74829a" };

type FormState = { email: string; first_name: string; last_name: string; job_title: string; role: Role; password: string; is_active: boolean };
const EMPTY: FormState = { email: "", first_name: "", last_name: "", job_title: "", role: "INSPECTOR", password: "", is_active: true };

export default function UsersPage() {
  useDocumentTitle("Users & roles");
  const { user: me } = useAuth();
  const { meta } = useMeta();
  const { notify } = useToast();
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<User | null | "new">(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [deactivate, setDeactivate] = useState<User | null>(null);

  useEffect(() => setPage(1), [debounced, role]);
  const query = useMemo(() => ({ search: debounced, role, page, page_size: 20 }), [debounced, role, page]);
  const users = useApi((signal) => usersApi.list(query, signal), [query]);
  const summary = useApi((signal) => usersApi.summary(signal), []);

  const open = (target: User | "new") => {
    setEditing(target);
    setErrors({});
    setForm(target === "new" ? EMPTY : { email: target.email, first_name: target.first_name, last_name: target.last_name, job_title: target.job_title, role: target.role, password: "", is_active: target.is_active });
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const payload = { ...form, username: form.email.split("@")[0], password: form.password || undefined };
      if (editing === "new") await usersApi.create({ ...payload, password: form.password });
      else if (editing) await usersApi.update(editing.id, payload);
      notify(editing === "new" ? "User created" : "User updated", { level: "success" });
      setEditing(null);
      void users.refetch();
      void summary.refetch();
    } catch (err) {
      const e = err as ApiError;
      setErrors({ ...e.fieldErrors, _: [e.message] });
    } finally {
      setSaving(false);
    }
  };

  const confirmDeactivate = async () => {
    if (!deactivate) return;
    try {
      await usersApi.deactivate(deactivate.id);
      notify(`${deactivate.full_name} deactivated`, { level: "success" });
      void users.refetch();
      void summary.refetch();
    } catch (err) {
      notify("Could not deactivate user", { level: "error", description: (err as ApiError).message });
    } finally {
      setDeactivate(null);
    }
  };

  const columns: Column<User>[] = [
    {
      key: "user",
      header: "User",
      render: (u) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{u.full_name}</p>
          <p className="truncate text-[11px] text-ink-3">{u.email}</p>
        </div>
      ),
    },
    { key: "role", header: "Role", render: (u) => <DotBadge color={ROLE_COLOR[u.role]}>{u.role_display}</DotBadge> },
    { key: "title", header: "Job title", hideBelow: "md", render: (u) => u.job_title || "—" },
    { key: "status", header: "Status", render: (u) => <DotBadge color={u.is_active ? "#0ca30c" : "#74829a"}>{u.is_active ? "Active" : "Deactivated"}</DotBadge> },
    { key: "login", header: "Last sign-in", hideBelow: "lg", render: (u) => relativeTime(u.last_login) },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      render: (u) => (
        <span className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" aria-label={`Edit ${u.full_name}`} icon={<Pencil className="size-3.5" />} onClick={() => open(u)} />
          {u.is_active && u.id !== me?.id && <Button size="sm" variant="ghost" aria-label={`Deactivate ${u.full_name}`} icon={<UserX className="size-3.5" />} onClick={() => setDeactivate(u)} />}
        </span>
      ),
    },
  ];

  const s = summary.data;
  return (
    <>
      <PageHeader eyebrow="Administration" title="Users & roles" subtitle="Manage platform access. Roles are hierarchical: Viewer → Inspector → Engineer → Administrator." actions={<Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => open("new")}>Add user</Button>} />
      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Administrators" value={s?.administrator ?? "—"} icon={<span className="text-xs font-bold">A</span>} accent={ROLE_COLOR.ADMINISTRATOR} footnote="Full platform control" />
        <KpiCard label="Engineers" value={s?.engineer ?? "—"} icon={<span className="text-xs font-bold">E</span>} accent={ROLE_COLOR.ENGINEER} footnote="Assets, reviews, resolutions" />
        <KpiCard label="Inspectors" value={s?.inspector ?? "—"} icon={<span className="text-xs font-bold">I</span>} accent={ROLE_COLOR.INSPECTOR} footnote="Upload & run inspections" />
        <KpiCard label="Viewers" value={s?.viewer ?? "—"} icon={<span className="text-xs font-bold">V</span>} accent={ROLE_COLOR.VIEWER} footnote="Read-only access" />
      </section>
      <Card>
        <div className="flex flex-wrap gap-2.5 p-3">
          <Input aria-label="Search users" placeholder="Search name, email, organisation…" value={search} onChange={(e) => setSearch(e.target.value)} leading={<Search className="size-4" />} wrapperClassName="w-full sm:w-72" />
          <Select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)} options={meta?.roles ?? []} placeholder="All roles" wrapperClassName="w-44" />
        </div>
        <DataTable rows={users.data?.results} columns={columns} rowKey={(u) => u.id} loading={users.loading} refreshing={users.refreshing} error={users.error?.message} onRetry={users.refetch} emptyTitle="No users found" caption="Users" />
        {users.data && <Pagination page={users.data.page} totalPages={users.data.total_pages} count={users.data.count} pageSize={20} onPageChange={setPage} />}
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add user" : `Edit ${editing?.full_name ?? ""}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form="user-form" loading={saving}>Save</Button>
          </>
        }
      >
        <form id="user-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2" noValidate>
          {errors._ && <p role="alert" className="rounded-lg border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-critical-ink sm:col-span-2">{errors._[0]}</p>}
          <Input label="First name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} error={errors.first_name?.[0]} />
          <Input label="Last name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} error={errors.last_name?.[0]} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email?.[0]} wrapperClassName="sm:col-span-2" />
          <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} options={meta?.roles ?? []} error={errors.role?.[0]} />
          <Input label="Job title" value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
          <Input
            label={editing === "new" ? "Password" : "New password"}
            hint={editing === "new" ? "min. 10 characters" : "leave blank to keep"}
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            error={errors.password?.[0]}
            wrapperClassName="sm:col-span-2"
          />
          {editing !== "new" && (
            <label className="flex items-center gap-2 text-sm text-ink-2 sm:col-span-2">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="size-4 accent-sky-400" />
              Account active
            </label>
          )}
        </form>
      </Modal>
      <ConfirmDialog
        open={Boolean(deactivate)}
        title="Deactivate user?"
        message={`${deactivate?.full_name} will no longer be able to sign in. Their inspection history is preserved.`}
        confirmLabel="Deactivate"
        destructive
        onCancel={() => setDeactivate(null)}
        onConfirm={confirmDeactivate}
      />
    </>
  );
}
