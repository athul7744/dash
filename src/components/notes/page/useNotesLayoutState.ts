"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

const NOTES_DESKTOP_PANEL_PREFERENCE_KEY = "notes.desktop-panels";

type DesktopPanelPreference = {
  showDesktopDetailsRail: boolean;
  showDesktopPagesRail: boolean;
};

const DEFAULT_DESKTOP_PANEL_PREFERENCE: DesktopPanelPreference = {
  showDesktopDetailsRail: false,
  showDesktopPagesRail: true,
};

const desktopPanelPreferenceListeners = new Set<() => void>();
let cachedDesktopPanelPreferenceRaw: string | null | undefined;
let cachedDesktopPanelPreference = DEFAULT_DESKTOP_PANEL_PREFERENCE;

function readDesktopPanelPreference(): DesktopPanelPreference {
  const rawPreference = window.localStorage.getItem(NOTES_DESKTOP_PANEL_PREFERENCE_KEY);
  if (rawPreference === cachedDesktopPanelPreferenceRaw) return cachedDesktopPanelPreference;

  cachedDesktopPanelPreferenceRaw = rawPreference;
  if (!rawPreference) {
    cachedDesktopPanelPreference = DEFAULT_DESKTOP_PANEL_PREFERENCE;
    return cachedDesktopPanelPreference;
  }

  try {
    const parsedPreference = JSON.parse(rawPreference) as Partial<DesktopPanelPreference>;
    cachedDesktopPanelPreference = {
      showDesktopDetailsRail:
        typeof parsedPreference.showDesktopDetailsRail === "boolean"
          ? parsedPreference.showDesktopDetailsRail
          : DEFAULT_DESKTOP_PANEL_PREFERENCE.showDesktopDetailsRail,
      showDesktopPagesRail:
        typeof parsedPreference.showDesktopPagesRail === "boolean"
          ? parsedPreference.showDesktopPagesRail
          : DEFAULT_DESKTOP_PANEL_PREFERENCE.showDesktopPagesRail,
    };
  } catch {
    cachedDesktopPanelPreference = DEFAULT_DESKTOP_PANEL_PREFERENCE;
  }

  return cachedDesktopPanelPreference;
}

function subscribeToDesktopPanelPreference(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === NOTES_DESKTOP_PANEL_PREFERENCE_KEY) callback();
  };
  desktopPanelPreferenceListeners.add(callback);
  window.addEventListener("storage", onStorage);
  return () => {
    desktopPanelPreferenceListeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

function writeDesktopPanelPreference(next: DesktopPanelPreference) {
  const rawPreference = JSON.stringify(next);
  window.localStorage.setItem(NOTES_DESKTOP_PANEL_PREFERENCE_KEY, rawPreference);
  cachedDesktopPanelPreferenceRaw = rawPreference;
  cachedDesktopPanelPreference = next;
  desktopPanelPreferenceListeners.forEach((listener) => listener());
}

export function useNotesLayoutState() {
  const [showEditorAppHeader, setShowEditorAppHeader] = useState(false);
  const desktopPanelPreference = useSyncExternalStore(
    subscribeToDesktopPanelPreference,
    readDesktopPanelPreference,
    () => DEFAULT_DESKTOP_PANEL_PREFERENCE,
  );
  const setShowDesktopPagesRail = useCallback((showDesktopPagesRail: boolean) => {
    writeDesktopPanelPreference({ ...readDesktopPanelPreference(), showDesktopPagesRail });
  }, []);
  const setShowDesktopDetailsRail = useCallback((showDesktopDetailsRail: boolean) => {
    writeDesktopPanelPreference({ ...readDesktopPanelPreference(), showDesktopDetailsRail });
  }, []);
  const { showDesktopPagesRail, showDesktopDetailsRail } = desktopPanelPreference;
  const [isMobilePagesDrawerOpen, setIsMobilePagesDrawerOpen] = useState(false);
  const [isMobileDetailsDrawerOpen, setIsMobileDetailsDrawerOpen] = useState(false);
  const [pageRailSectionOpen, setPageRailSectionOpen] = useState({
    favorites: true,
    recent: true,
    tags: true,
  });
  const [tagDirectoryOpen, setTagDirectoryOpen] = useState<Record<string, boolean>>({});
  const [detailsSectionOpen, setDetailsSectionOpen] = useState({
    outline: true,
    summary: true,
    references: true,
    attachments: true,
    timeline: true,
  });

  const togglePageRailSection = (section: keyof typeof pageRailSectionOpen) => {
    setPageRailSectionOpen((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  const toggleTagDirectoryGroup = (tagKey: string) => {
    setTagDirectoryOpen((current) => ({
      ...current,
      [tagKey]: !current[tagKey],
    }));
  };

  const toggleDetailsSection = (section: keyof typeof detailsSectionOpen) => {
    setDetailsSectionOpen((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  const areAllPageRailSectionsOpen = Object.values(pageRailSectionOpen).every(Boolean);

  const toggleAllPageRailSections = () => {
    setPageRailSectionOpen({
      favorites: !areAllPageRailSectionsOpen,
      recent: !areAllPageRailSectionsOpen,
      tags: !areAllPageRailSectionsOpen,
    });
  };

  return {
    showEditorAppHeader,
    setShowEditorAppHeader,
    showDesktopPagesRail,
    setShowDesktopPagesRail,
    showDesktopDetailsRail,
    setShowDesktopDetailsRail,
    isMobilePagesDrawerOpen,
    setIsMobilePagesDrawerOpen,
    isMobileDetailsDrawerOpen,
    setIsMobileDetailsDrawerOpen,
    pageRailSectionOpen,
    tagDirectoryOpen,
    setTagDirectoryOpen,
    detailsSectionOpen,
    setDetailsSectionOpen,
    togglePageRailSection,
    toggleTagDirectoryGroup,
    toggleDetailsSection,
    areAllPageRailSectionsOpen,
    toggleAllPageRailSections,
  };
}
