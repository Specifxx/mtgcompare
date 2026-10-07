// The OP Compare mark at every chrome call site (header, rail, phone menu, hero
// logo row): RiftCompare's BrandLogo, verbatim in shape. RiftCompare masks its
// "R" PNG and fills it with a green OKLCH gradient; OP Compare masks the
// straw-hat outline (/logo-mask.svg, the hat of /logo-mark.svg with the band
// cut out so it still reads as a hat in one colour) and fills it with the
// brand red ramp, #ff6b6b (brand-400, dark) → #d92b33 (brand-500).
//
// A plain <span> with a CSS mask, not an <img>: the fill follows the theme-free
// brand ramp, there is no extra request for a second coloured asset, and the
// element sizes like any other box (`h-9 w-9` by default, `h-8 w-8` in the hero).
export function BrandLogo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="OP Compare logo"
      className={`inline-block shrink-0 ${className}`}
      style={{
        backgroundImage: "linear-gradient(in oklch, #ff6b6b, #d92b33)",
        WebkitMaskImage: "url(/logo-mask.svg)",
        maskImage: "url(/logo-mask.svg)",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}
