import { redirect } from "next/navigation";

// Plain /tracker has no view of its own — send it to the week view. The real
// tracker UI lives in the [view] segment (/tracker/week|activity|mood).
export default function TrackerIndexPage() {
  redirect("/tracker/week");
}
