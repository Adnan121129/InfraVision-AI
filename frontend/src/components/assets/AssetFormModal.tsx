import { useEffect, useState, type FormEvent } from "react";

import { ApiError } from "@/api/client";
import { assetsApi } from "@/api/endpoints";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useMeta } from "@/contexts/MetaContext";
import { useToast } from "@/contexts/ToastContext";
import type { Asset, AssetInput } from "@/types/api";

const EMPTY: AssetInput = {
  asset_name: "",
  asset_type: "BRIDGE",
  material_type: "REINFORCED_CONCRETE",
  description: "",
  location: "",
  region: "",
  structural_system: "",
  dimensions: "",
  operator: "",
  inspection_interval_days: 180,
  latitude: null,
  longitude: null,
  installation_date: null,
};

function toInput(asset: Asset): AssetInput {
  return {
    asset_name: asset.asset_name,
    asset_type: asset.asset_type,
    material_type: asset.material_type,
    description: asset.description,
    location: asset.location,
    region: asset.region,
    structural_system: asset.structural_system,
    dimensions: asset.dimensions,
    operator: asset.operator,
    inspection_interval_days: asset.inspection_interval_days,
    latitude: asset.latitude,
    longitude: asset.longitude,
    installation_date: asset.installation_date,
  };
}

export function AssetFormModal({ open, asset, onClose, onSaved }: { open: boolean; asset?: Asset | null; onClose: () => void; onSaved: (asset: Asset) => void }) {
  const { meta } = useMeta();
  const { notify } = useToast();
  const [form, setForm] = useState<AssetInput>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(asset ? toInput(asset) : EMPTY);
      setErrors({});
      setFormError(null);
    }
  }, [open, asset]);

  const set = <K extends keyof AssetInput>(key: K, value: AssetInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);
    const payload: AssetInput = {
      ...form,
      latitude: form.latitude === "" ? null : form.latitude,
      longitude: form.longitude === "" ? null : form.longitude,
      installation_date: form.installation_date || null,
    };
    try {
      const saved = asset ? await assetsApi.update(asset.id, payload) : await assetsApi.create(payload);
      notify(asset ? "Asset updated" : "Asset created", { level: "success", description: `${saved.asset_code} · ${saved.asset_name}` });
      onSaved(saved);
      onClose();
    } catch (err) {
      const error = err as ApiError;
      setErrors(error.fieldErrors ?? {});
      setFormError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const err = (key: string) => errors[key]?.[0];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={asset ? `Edit ${asset.asset_code}` : "Register structural asset"}
      description="Asset metadata is used for risk analysis, inspection scheduling and the infrastructure map."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="asset-form" loading={saving}>
            {asset ? "Save changes" : "Create asset"}
          </Button>
        </>
      }
    >
      <form id="asset-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        {formError && (
          <p role="alert" className="rounded-lg border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-critical-ink sm:col-span-2">
            {formError}
          </p>
        )}
        <Input label="Asset name" required value={form.asset_name} onChange={(e) => set("asset_name", e.target.value)} error={err("asset_name")} wrapperClassName="sm:col-span-2" />
        <Select label="Asset type" value={form.asset_type} onChange={(e) => set("asset_type", e.target.value)} options={meta?.asset_types ?? []} error={err("asset_type")} />
        <Select label="Material" value={form.material_type} onChange={(e) => set("material_type", e.target.value)} options={meta?.material_types ?? []} error={err("material_type")} />
        <Input label="Location" required placeholder="City, corridor or site" value={form.location} onChange={(e) => set("location", e.target.value)} error={err("location")} />
        <Input label="Region" value={form.region} onChange={(e) => set("region", e.target.value)} error={err("region")} />
        <Input label="Latitude" inputMode="decimal" placeholder="47.6062" value={form.latitude ?? ""} onChange={(e) => set("latitude", e.target.value)} error={err("latitude") ?? err("non_field_errors")} />
        <Input label="Longitude" inputMode="decimal" placeholder="-122.3321" value={form.longitude ?? ""} onChange={(e) => set("longitude", e.target.value)} error={err("longitude")} />
        <Input label="Installation date" type="date" value={form.installation_date ?? ""} onChange={(e) => set("installation_date", e.target.value)} error={err("installation_date")} />
        <Input
          label="Inspection interval"
          hint="days"
          type="number"
          min={7}
          value={form.inspection_interval_days}
          onChange={(e) => set("inspection_interval_days", Number(e.target.value))}
          error={err("inspection_interval_days")}
        />
        <Input label="Structural system" placeholder="e.g. Box girder" value={form.structural_system} onChange={(e) => set("structural_system", e.target.value)} />
        <Input label="Dimensions" placeholder="e.g. 420 m span, 4 lanes" value={form.dimensions} onChange={(e) => set("dimensions", e.target.value)} />
        <Input label="Operator" value={form.operator} onChange={(e) => set("operator", e.target.value)} wrapperClassName="sm:col-span-2" />
        <Textarea label="Description" value={form.description} onChange={(e) => set("description", e.target.value)} wrapperClassName="sm:col-span-2" />
      </form>
    </Modal>
  );
}
