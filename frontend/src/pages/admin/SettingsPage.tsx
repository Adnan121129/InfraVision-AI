import { Activity, Save } from "lucide-react";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";

import { ApiError } from "@/api/client";
import { healthApi, settingsApi } from "@/api/endpoints";
import { PageHeader } from "@/components/layout/PageHeader";
import { DotBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input, Select } from "@/components/ui/Field";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/contexts/ToastContext";
import { useApi } from "@/hooks/useApi";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import type { PlatformSettings } from "@/types/api";
import { formatDateTime } from "@/utils/format";

export default function SettingsPage() {
  useDocumentTitle("Settings");
  const { notify } = useToast();
  const settings = useApi((signal) => settingsApi.get(signal), []);
  const health = useApi((signal) => healthApi.check(signal), []);
  const [form, setForm] = useState<PlatformSettings | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  if (settings.loading && !settings.data) return <PageSkeleton />;
  if (settings.error) return <ErrorState message={settings.error.message} onRetry={settings.refetch} />;
  if (!form) return null;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const updated = await settingsApi.update(form);
      settings.setData(updated);
      notify("Platform settings saved", { level: "success", description: "New thresholds apply to inspections completed from now on." });
    } catch (err) {
      setErrors((err as ApiError).fieldErrors);
      notify("Settings not saved", { level: "error", description: (err as ApiError).message });
    } finally {
      setSaving(false);
    }
  };

  const num = (key: keyof PlatformSettings) => ({
    value: String(form[key] ?? ""),
    onChange: (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: Number(e.target.value) }),
    error: errors[key]?.[0],
  });

  return (
    <>
      <PageHeader eyebrow="Administration" title="System configuration" subtitle={`Health bands, alerting rules and scheduling defaults · last updated ${formatDateTime(form.updated_at)}${form.updated_by_name ? ` by ${form.updated_by_name}` : ""}`} />
      <form onSubmit={save} className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Health & alerting rules" subtitle="Used when classifying inspection results and raising maintenance alerts" />
          <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
            <Input label="Organisation name" value={form.organization_name} onChange={(e) => setForm({ ...form, organization_name: e.target.value })} wrapperClassName="sm:col-span-2" />
            <Input label="Healthy threshold" hint="score ≥ this is healthy" type="number" min={0} max={100} step={1} {...num("healthy_threshold")} />
            <Input label="Critical threshold" hint="score < this is critical" type="number" min={0} max={100} step={1} {...num("critical_threshold")} />
            <Select
              label="Minimum alert severity"
              value={form.alert_min_severity}
              onChange={(e) => setForm({ ...form, alert_min_severity: e.target.value as PlatformSettings["alert_min_severity"] })}
              options={[{ value: "MEDIUM", label: "Medium and above" }, { value: "HIGH", label: "High and above" }, { value: "CRITICAL", label: "Critical only" }]}
            />
            <Input label="Minimum alert confidence" hint="0 – 1" type="number" min={0} max={1} step={0.05} {...num("alert_min_confidence")} />
            <Input label="Health-decline alert" hint="points dropped between inspections" type="number" min={1} max={100} {...num("health_drop_alert_points")} />
            <Input label="Default inspection interval" hint="days" type="number" min={7} {...num("default_inspection_interval_days")} />
            <label className="flex items-center gap-2 text-sm text-ink-2 sm:col-span-2">
              <input type="checkbox" className="size-4 accent-sky-400" checked={form.auto_alerts_enabled} onChange={(e) => setForm({ ...form, auto_alerts_enabled: e.target.checked })} />
              Automatically raise maintenance alerts from AI findings
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" variant="primary" loading={saving} icon={<Save className="size-4" />}>
                Save configuration
              </Button>
            </div>
          </div>
        </Card>
        <Card className="h-fit">
          <CardHeader icon={<Activity className="size-4" />} title="Service health" subtitle="Live dependency checks from the API" actions={<Button size="sm" variant="ghost" onClick={() => void health.refetch()} loading={health.refreshing}>Recheck</Button>} />
          <ul className="space-y-2 px-5 pb-5 text-sm">
            {health.data ? (
              Object.entries(health.data.checks).map(([name, ok]) => (
                <li key={name} className="flex items-center justify-between">
                  <span className="text-ink-2 capitalize">{name}</span>
                  <DotBadge color={ok ? "#0ca30c" : "#d03b3b"}>{ok ? "Operational" : "Unavailable"}</DotBadge>
                </li>
              ))
            ) : health.error ? (
              <li className="text-xs text-critical-ink">{health.error.message}</li>
            ) : (
              <li className="text-xs text-ink-3">Checking…</li>
            )}
            {health.data && (
              <li className="flex items-center justify-between border-t border-line pt-2 text-xs">
                <span className="text-ink-3">Object storage backend</span>
                <span className="text-ink-2 uppercase">{health.data.storage_backend}</span>
              </li>
            )}
          </ul>
        </Card>
      </form>
    </>
  );
}
