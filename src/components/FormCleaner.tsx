"use client";

import { useEffect } from "react";

// Keeps GET-form URLs clean and shareable: empty fields (and the default sort
// and page size) are left out of the query string on submit.
export function FormCleaner({ formId, defaults = {} }: { formId: string; defaults?: Record<string, string> }) {
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const onSubmit = () => {
      const fields = [...form.elements, ...document.querySelectorAll(`[form="${formId}"]`)] as HTMLInputElement[];
      for (const el of fields) {
        if (!el.name) continue;
        if (el.value === "" || defaults[el.name] === el.value) {
          el.disabled = true;
          setTimeout(() => (el.disabled = false), 0);
        }
      }
    };
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [formId, defaults]);
  return null;
}
