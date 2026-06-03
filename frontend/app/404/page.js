import { notFound } from "next/navigation";

/**
 * Internal target for middleware subdomain invalid-slug rewrites.
 * Not linked in UI; triggers the global not-found page.
 */
export default function SubdomainInvalidPage() {
  notFound();
}
