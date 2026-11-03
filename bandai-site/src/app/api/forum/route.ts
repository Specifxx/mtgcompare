// POST /api/forum: start a thread, reply, or report a post (src/lib/forum/store.ts).
// POST only, so no crawler or page view ever runs it.
import { handleForumPost } from "@/lib/forum/store";
import { FORUM_SITE } from "@/lib/forum/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return handleForumPost(req, FORUM_SITE);
}
