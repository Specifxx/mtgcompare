import { notFound, permanentRedirect } from "next/navigation";
import { TREATMENT_FACETS, facetBySlug } from "@/lib/facets";

// Legacy URL: /cards/printing/[printing] became /cards/treatment/[key] (the Magic treatment vocabulary). A key that exists moves permanently; any other
// word (any word that is not a treatment key) is a 404. Carries no data, so it needs no route config.
export default function Page({ params }: { params: { printing: string } }) {
  const f = facetBySlug(TREATMENT_FACETS, params.printing);
  if (!f) notFound();
  permanentRedirect(`/cards/treatment/${f.slug}`);
}
