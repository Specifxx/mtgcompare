import type { Metadata } from "next";
import { FeedbackForm } from "@/components/FeedbackForm";
import { Breadcrumbs } from "@/components/ui";

export const metadata: Metadata = {
  title: "Feedback",
  description: "Tell OP Compare what to keep, fix or add. Rate the site and leave a note; nothing is shown publicly unless you say so.",
  alternates: { canonical: "/feedback" },
};

export default function FeedbackPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Breadcrumbs trail={[{ name: "Feedback" }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Feedback</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-slate-300">
        OP Compare is built by one person. A rating, a sentence or both helps decide what comes next. Nothing you send is shown publicly unless you tick the box,
        and even then only after review.
      </p>
      <div className="mt-6">
        <FeedbackForm />
      </div>
    </div>
  );
}
