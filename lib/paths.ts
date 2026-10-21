// Page links as plain <a href> (full page load), prefixed with the deploy
// base path. Next's <Link> does a client-side fetch of the target's RSC
// payload, which can fail on static hosts and shows "page not found" even
// though the page itself exists. A normal link always works.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const HOME_HREF = `${BASE_PATH}/`;
export const ENTRY_HREF = `${BASE_PATH}/entry/`;
export const LOGO_HREF = `${BASE_PATH}/logo.png`;
export const LOGO_MARK_HREF = `${BASE_PATH}/logo-mark.png`;
