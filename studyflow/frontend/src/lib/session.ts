import type { QueryClient } from "@tanstack/react-query";
import type { Me } from "./api";

/** Switch the signed-in user (or sign out with `null`) and drop every other user's cached data.
 *  Note: `queryClient.clear()` would also detach the mounted ["me"] observer, so the UI would never update. */
export function setSession(qc: QueryClient, me: Me | null) {
  qc.setQueryData(["me"], me);
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
}
