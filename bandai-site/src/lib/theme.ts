// Dark by default (owner: "default dark theme"); a visitor's choice of light is
// remembered in localStorage and applied before first paint.
export const THEME_KEY = "theme";
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark")}catch(e){document.documentElement.setAttribute("data-theme","dark")}})();`;
