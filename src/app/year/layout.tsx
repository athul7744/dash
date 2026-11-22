import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Year | Dash.",
  icons: { icon: "/icon-year.svg" },
};

export default function YearLayout({ children }: { children: React.ReactNode }) {
  return children;
}
