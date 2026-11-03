import Link from "@/components/Link";
import { SearchBox } from "@/components/SearchBox";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="font-display text-3xl font-black">Page not found</h1>
      <p className="mt-2 text-muted">Search for the card instead:</p>
      <div className="mt-6"><SearchBox big /></div>
      <Link href="/" className="link mt-6 inline-block">Home</Link>
    </div>
  );
}
