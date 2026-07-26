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

  // Reconcile the nav stack when the URL changes externally (browser back/
  // forward). App-driven navigations set `appNavigationRef` and manage the stack
  // themselves, so they're skipped. This only writes to the external nav-stack
  // store — no React state — so it stays a plain synchronization effect.
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
    } else if (navStack.stack.some((e) => e.pageId === selectedPageId)) {
      navStack.popTo(selectedPageId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPageId]);

  // The live shell title wins once the editor reports it; `editorPageTitle` is
  // the optimistic value set on navigation so the breadcrumb isn't blank first.
  // Empty on the overview (no page selected) — no reset effect needed.
  const currentPageTitle = selectedPageId ? shellPageTitleDraft || editorPageTitle || "" : "";

  const goBack = useCallback(() => {
    const prev = navStack.pop();
    appNavigationRef.current = true;
    if (prev && prev.pageId !== "__overview__") {
      setEditorPageTitle(prev.title);
      transitionToEditor(prev.pageId);
      startTransition(() => { router.push(`/notes/${prev.pageId}`); });
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
      router.push(`/notes/${pageId}`);
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
      startTransition(() => { router.push(`/notes/${pageId}`); });
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
      router.push(`/notes/${targetPageId}`);
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
