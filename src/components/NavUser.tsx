"use client";

import { UserMenu } from "./UserMenu";
import { useMe } from "@/lib/use-me";

// The header's account corner (RiftCompare's NavUser). Until /api/me answers it
// holds the signed-out cluster's width (sm:w-[7.25rem]) so the header does not
// jump when "Log in · Sign up free" or the avatar arrives.
export function NavUser() {
  const { me, loaded } = useMe();
  if (!loaded) return <div aria-hidden className="tap-icon sm:h-9 sm:w-[7.25rem]" />;
  return <UserMenu user={me.user} />;
}
