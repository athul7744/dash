import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Events | Dash.",
  icons: { icon: "/icon-events.svg" },
};

export default function EventsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
