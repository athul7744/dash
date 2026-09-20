import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Graph | Dash.",
  icons: { icon: "/icon-graph.svg" },
};

export default function GraphLayout({ children }: { children: React.ReactNode }) {
  return children;
}
