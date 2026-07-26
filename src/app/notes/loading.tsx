"use client";

import { usePathname } from "next/navigation";

import { NotesLoadingSkeleton } from "@/components/skeletons/NotesLoadingSkeleton";

export default function Loading() {
  const path = usePathname();
  const mode = path === "/notes/graph" ? "graph" : /^\/notes\/.+/.test(path) ? "editor" : "overview";
  return <NotesLoadingSkeleton mode={mode} />;
}
