"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { usePageNavStack } from "@/hooks/use-page-nav-stack";
import type { NotePageRow } from "@/hooks/use-notes";

type PageNavStack = ReturnType<typeof usePageNavStack>;

type UseNotesNavigationParams = {
  selectedPageId: string | null;
  navStack: PageNavStack;
  allPages: NotePageRow[];
  transitionToEditor: (pageId: string) => void;
  transitionToOverview: () => void;
  /** Called when drawers should close (e.g. during a page switch on mobile) */
  onCloseMobileDrawers?: () => void;
  /** Readable title from the shell handle for building nav stack entries */
  shellPageTitleDraft?: string;
};

export function useNotesNavigation({
  selectedPageId,
  navStack,
  allPages,
  transitionToEditor,
  transitionToOverview,
  onCloseMobileDrawers,
  shellPageTitleDraft,
}: UseNotesNavigationParams) {
  const router = useRouter();

  const [editorPageTitle, setEditorPageTitle] = useState("");
  const appNavigationRef = useRef(false);
  const prevSelectedPageIdRef = useRef<string | null>(selectedPageId);

  // Reconcile nav stack when browser back/forward changes the URL externally
  useEffect(() => {
    const prev = prevSelectedPageIdRef.current;
    prevSelectedPageIdRef.current = selectedPageId;

    if (prev === selectedPageId) return;

    if (appNavigationRef.current) {
      appNavigationRef.current = false;
      return;
    }

    if (!selectedPageId) {
      navStack.clear();
      return;
    }

    const matchIdx = navStack.stack.findLastIndex((e) => e.pageId === selectedPageId);
    if (matchIdx !== -1) {
      const entry = navStack.stack[matchIdx];
      setEditorPageTitle(entry.title);
      navStack.popTo(selectedPageId);
    }
  }, [selectedPageId]);

  // Reset editor title when navigating to overview
  useEffect(() => {
    if (!selectedPageId) {
      setEditorPageTitle("");
    }
  }, [selectedPageId]);

  const currentPageTitle = editorPageTitle || shellPageTitleDraft || "";

  const goBack = useCallback(() => {
    const prev = navStack.pop();
    appNavigationRef.current = true;
    if (prev && prev.pageId !== "__overview__") {
      setEditorPageTitle(prev.title);
      transitionToEditor(prev.pageId);
      startTransition(() => { router.push(`/notes?page=${prev.pageId}`); });
    } else {
      transitionToOverview();
      router.push("/notes");
    }
  }, [navStack, transitionToEditor, transitionToOverview, router]);

  const openPageById = useCallback((pageId: string, targetTitle?: string) => {
    if (pageId === selectedPageId) return;

    if (pageId === "__back__") {
      goBack();
      return;
    }

    const resolvedTitle = targetTitle || allPages.find((p) => p.id === pageId)?.title || "";
    const prevPageId = selectedPageId;
    setEditorPageTitle(resolvedTitle);
    onCloseMobileDrawers?.();
    appNavigationRef.current = true;
    transitionToEditor(pageId);
    startTransition(() => {
      router.push(`/notes?page=${pageId}`);
    });
    queueMicrotask(() => {
      if (prevPageId) {
        navStack.push({ pageId: prevPageId, title: currentPageTitle });
      } else {
        navStack.clear();
        navStack.push({ pageId: "__overview__", title: "Overview" });
      }
    });
  }, [selectedPageId, allPages, currentPageTitle, navStack, transitionToEditor, router, goBack, onCloseMobileDrawers]);

  const navigateBreadcrumb = useCallback((pageId: string) => {
    const entry = navStack.stack.find((e) => e.pageId === pageId);
    navStack.popTo(pageId);
    appNavigationRef.current = true;
    if (pageId === "__overview__") {
      transitionToOverview();
      router.push("/notes");
    } else {
      if (entry) setEditorPageTitle(entry.title);
      transitionToEditor(pageId);
      startTransition(() => { router.push(`/notes?page=${pageId}`); });
    }
  }, [navStack, transitionToEditor, transitionToOverview, router]);

  const navigateFromPeek = useCallback((title: string, targetPageId: string) => {
    if (selectedPageId) {
      navStack.push({ pageId: selectedPageId, title: currentPageTitle });
    } else {
      navStack.clear();
      navStack.push({ pageId: "__overview__", title: "Overview" });
    }
    setEditorPageTitle(title.trim());
    appNavigationRef.current = true;
    transitionToEditor(targetPageId);
    startTransition(() => {
      router.push(`/notes?page=${targetPageId}`);
    });
  }, [selectedPageId, currentPageTitle, navStack, transitionToEditor, router]);

  return {
    editorPageTitle,
    currentPageTitle,
    appNavigationRef,
    openPageById,
    goBack,
    navigateBreadcrumb,
    navigateFromPeek,
  };
}
