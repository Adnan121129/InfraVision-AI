import { ChevronDown } from "lucide-react";
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

import { cn } from "@/utils/cn";

const control =
  "w-full rounded-lg border border-line-strong bg-surface-2 px-3 text-sm text-ink placeholder:text-ink-3 transition-colors focus:border-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60";

export function Label({ htmlFor, children, hint }: { htmlFor?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-center justify-between text-xs font-medium text-ink-2">
      <span>{children}</span>
      {hint && <span className="font-normal text-ink-3">{hint}</span>}
    </label>
  );
}

function FieldWrapper({ id, label, error, hint, children, className }: { id: string; label?: ReactNode; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={id} hint={hint}>
          {label}
        </Label>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-critical-ink">
          {error}
        </p>
      )}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; error?: string; hint?: ReactNode; wrapperClassName?: string; leading?: ReactNode };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, error, hint, wrapperClassName, leading, className, id, ...props }, ref) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <FieldWrapper id={inputId} label={label} error={error} hint={hint} className={wrapperClassName}>
      <div className="relative">
        {leading && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3">{leading}</span>}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn(control, "h-9", leading && "pl-9", error && "border-critical/70", className)}
          {...props}
        />
      </div>
    </FieldWrapper>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; error?: string; hint?: ReactNode; wrapperClassName?: string; options: { value: string; label: string }[]; placeholder?: string };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, wrapperClassName, options, placeholder, className, id, ...props },
  ref,
) {
  const generated = useId();
  const selectId = id ?? generated;
  return (
    <FieldWrapper id={selectId} label={label} error={error} hint={hint} className={wrapperClassName}>
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={Boolean(error)}
          className={cn(control, "h-9 appearance-none pr-8", error && "border-critical/70", className)}
          {...props}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
      </div>
    </FieldWrapper>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; error?: string; hint?: ReactNode; wrapperClassName?: string };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ label, error, hint, wrapperClassName, className, id, ...props }, ref) {
  const generated = useId();
  const areaId = id ?? generated;
  return (
    <FieldWrapper id={areaId} label={label} error={error} hint={hint} className={wrapperClassName}>
      <textarea ref={ref} id={areaId} aria-invalid={Boolean(error)} className={cn(control, "min-h-20 py-2", className)} {...props} />
    </FieldWrapper>
  );
});
