import { redirect } from "next/navigation";

/**
 * /shop/public-page is now merged into /shop/settings.
 * Permanently redirect with the #public anchor so bookmarks and
 * the sidebar link both land on the correct section.
 */
export default function Page() {
  redirect("/shop/settings#public");
}
