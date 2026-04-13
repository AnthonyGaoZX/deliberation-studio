import type { ReactNode } from "react";
import type { Locale, ProviderKind } from "@/types/debate";
import { text } from "@/lib/text-helpers";
import { describeModelVariant, getModelDocsUrl, getModelPresets, hasModelPreset } from "@/lib/model-presets";
import { PROVIDER_CATALOG } from "@/lib/provider-catalog";

export function Field({
  label,
  hint,
  children,
  full = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <label className={full ? "full-field" : "field"}>
      <span>
        <strong>{label}</strong>
      </span>
      {hint ? <span className="field-hint">{hint}</span> : null}
      {children}
    </label>
  );
}

export function ModelVariantField({
  provider,
  model,
  locale,
  label,
  onModelChange,
}: {
  provider: ProviderKind;
  model: string;
  locale: Locale;
  label: string;
  onModelChange: (model: string) => void;
}) {
  const docsUrl = getModelDocsUrl(provider);
  const presets = getModelPresets(provider);
  const selectValue = hasModelPreset(provider, model) ? model : "__custom__";
  const customLabel = text(locale, "手动填写", "Custom");

  return (
    <Field
      label={label}
      hint={describeModelVariant(provider, model, locale)}
      full
    >
      <div className="stacked-control">
        <select
          aria-label={label}
          value={selectValue}
          onChange={(event) => {
            if (event.target.value !== "__custom__") {
              onModelChange(event.target.value);
            }
          }}
        >
          {presets.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
          <option value="__custom__">{customLabel}</option>
        </select>
        <input
          aria-label={`${label} ${text(locale, "自定义", "custom")}`}
          value={model}
          placeholder={PROVIDER_CATALOG[provider].defaultModel}
          onChange={(event) => onModelChange(event.target.value)}
        />
        <div className="compact-note">
          <a href={docsUrl} target="_blank" rel="noreferrer">
            {text(locale, "查看该厂商官方模型名称", "Check this provider's official model names")}
          </a>
        </div>
      </div>
    </Field>
  );
}
