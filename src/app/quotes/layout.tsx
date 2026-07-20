import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Quotes | Dash.",
  icons: { icon: "/icon-quotes.svg" },
};

export default function QuotesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
