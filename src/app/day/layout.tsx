import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Day | Dash.",
  icons: { icon: "/icon-day.svg" },
};

export default function DayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
