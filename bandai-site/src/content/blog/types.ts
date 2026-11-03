export interface Post {
  slug: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  updated?: string;
  keywords: string[];
  /** HTML body. Product links use /card/<slug>. */
  html: string;
  faq?: { q: string; a: string }[];
}
