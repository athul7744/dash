import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reminders | Dash.",
  icons: { icon: "/icon-reminders.svg" },
};

export default function RemindersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
