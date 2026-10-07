"use client";

// A <select> that submits its form on change — the sort and page-size pickers.
export function AutoSubmitSelect({ name, value, options, label, form }: { name: string; value: string; options: [string, string][]; label: string; form?: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-400">
      <span className="hidden sm:inline">{label}</span>
      <select
        name={name}
        form={form}
        defaultValue={value}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-11 rounded-md border border-ink-700 bg-ink-900 px-3 text-sm font-medium text-slate-100 outline-none focus:border-brand-500 focus-visible:ring-1 focus-visible:ring-brand-500/50"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
