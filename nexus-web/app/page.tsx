import { redirect } from "next/navigation";

/**
 * Root page — redirects to the dashboard map.
 * Auth check happens in the (dashboard) layout.
 * If not authenticated, dashboard layout redirects to /login.
 */
export default function RootPage() {
  redirect("/map");
}
