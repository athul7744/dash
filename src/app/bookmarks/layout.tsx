import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bookmarks | Dash.",
  icons: { icon: "/icon-bookmarks.svg" },
};

export default function BookmarksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
