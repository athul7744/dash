/**
 * Keeps a redirect out of the precache.
 *
 * The service worker fetches every precache URL once, at install, and keeps
 * whatever came back until that entry's revision changes. Serwist follows a
 * redirect and stores the final response under the *original* URL — on purpose,
 * for sites that move files. Here the only redirect anything meets is the auth
 * gate sending a request to `/login`, so following it means caching the login
 * page as an icon, or as a whole screen, for as long as the file is unchanged.
 * A precached shell captured that way opens as the sign-in page offline.
 *
 * So a response that arrived by redirect is refused. Refusing any one entry
 * fails the whole install: the worker already running stays in charge and the
 * next update check tries again. That is the point — an update that cannot
 * precache cleanly should not replace one that did.
 *
 * Supplying any `cacheWillUpdate` plugin switches off Serwist's own default,
 * which rejects error responses, so that rule is repeated here.
 */

import type { SerwistPlugin } from "serwist";

export const refuseRedirectedPrecache: SerwistPlugin = {
  cacheWillUpdate: async ({ response }) => {
    if (!response || response.status >= 400 || response.redirected) return null;
    return response;
  },
};
