"use client";

import { ChevronUpIcon } from "@/assets/icons";
import { cn } from "@/lib/utils";
import { useId } from "react";

/**
 * Versões controladas de `Select` e `TextAreaGroup` do template (as originais são
 * não-controladas), com o mesmo visual, para uso com react-hook-form `Controller`.
 */
type SelectFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: readonly { value: string; label: string }[];
  placeholder?: string;
  /** Exibe a opção vazia ("Não informado"). Desligue para campos obrigatórios. */
  allowEmpty?: boolean;
  className?: string;
};

export function SelectField({ label, value, onChange, items, placeholder, allowEmpty = true, className }: SelectFieldProps) {
  const id = useId();
  return (
    <div className={cn("space-y-3", className)}>
      <label htmlFor={id} className="block text-body-sm font-medium text-dark dark:text-white">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-lg border border-stroke bg-transparent px-5.5 py-3 text-dark outline-none transition focus:border-primary active:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white dark:focus:border-primary [&>option]:text-dark-5 dark:[&>option]:text-dark-6"
        >
          {allowEmpty && <option value="">{placeholder ?? "Não informado"}</option>}
          {items.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <ChevronUpIcon className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rotate-180" />
      </div>
    </div>
  );
}

type TextAreaFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  hint?: string;
};

export function TextAreaField({ label, value, onChange, placeholder, rows = 6, className, hint }: TextAreaFieldProps) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-3 block text-body-sm font-medium text-dark dark:text-white">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border-[1.5px] border-stroke bg-transparent px-5.5 py-3 text-dark outline-none transition focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white dark:focus:border-primary"
      />
      {hint && <p className="mt-2 text-body-xs text-dark-6">{hint}</p>}
    </div>
  );
}
