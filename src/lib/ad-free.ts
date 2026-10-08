// Ad-free first paint for members (RiftCompare's lib/ad-free-boot.ts): the
// mc_adfree hint cookie, written by useMe() for Plus and Premium accounts, marks
// <html data-adfree> before the page paints, and CSS hides every
// [data-ad-placement]. A hint only: it unlocks nothing, and useMe() clears it
// the moment the account says otherwise.
export const AD_FREE_BOOT_SCRIPT = `try{if(document.cookie.split('; ').indexOf('mc_adfree=1')>-1)document.documentElement.setAttribute('data-adfree','')}catch(e){}`;
