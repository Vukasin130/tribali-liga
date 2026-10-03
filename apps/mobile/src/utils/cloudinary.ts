// Every team logo and player avatar in this app comes from Cloudinary as a raw,
// original-resolution upload - often 1MB+ for a photo taken straight off a phone. Every
// screen that shows one (pitch views, bench strips, the player picker list, standings,
// fixtures) was downloading that full original just to shrink it down to a 30-60px
// thumbnail on screen, which is what actually burned through Cloudinary's free monthly
// bandwidth quota. Inserting a fixed resize+format transformation into the URL asks
// Cloudinary to deliver (and cache) a small, compressed derivative instead - Cloudinary
// only spends a transformation credit the FIRST time a given size is ever requested,
// every later view of that same size is served straight from its CDN cache.
//
// Only a handful of fixed sizes are used on purpose (not the exact pixel size of every
// call site) so that repeated views - even at slightly different on-screen sizes - land on
// the same cached derivative instead of each minting its own new transformation.
const THUMB_SIZES = [48, 96, 160] as const;

function nearestThumbSize(target: number): number {
  for (const size of THUMB_SIZES) {
    if (target <= size) return size;
  }
  return THUMB_SIZES[THUMB_SIZES.length - 1];
}

// `target` is the size the image actually renders at (in CSS/dp pixels) - doubled here for
// retina/high-DPI screens, then snapped to the nearest fixed bucket above.
export function cloudinaryThumb(url: string | undefined, target: number): string | undefined {
  if (!url) return url;
  const uploadMarker = "/upload/";
  const markerIndex = url.indexOf(uploadMarker);
  // Not a Cloudinary delivery URL (or already has transformations some other way) -
  // leave it exactly as-is rather than risk mangling an unrelated URL shape.
  if (!url.includes("res.cloudinary.com") || markerIndex === -1) return url;

  const size = nearestThumbSize(Math.round(target * 2));
  const transformation = `w_${size},h_${size},c_fill,g_auto,q_auto,f_auto`;
  const insertAt = markerIndex + uploadMarker.length;
  return `${url.slice(0, insertAt)}${transformation}/${url.slice(insertAt)}`;
}
