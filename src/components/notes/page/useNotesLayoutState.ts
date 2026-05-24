"use client";

import { useEffect, useState } from "react";

const NOTES_DESKTOP_PANEL_PREFERENCE_KEY = "notes.desktop-panels";

export function useNotesLayoutState() {
  const [showEditorAppHeader, setShowEditorAppHeader] = useState(false);
  const [showDesktopPagesRail, setShowDesktopPagesRail] = useState(true);
  const [showDesktopDetailsRail, setShowDesktopDetailsRail] = useState(false);
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
    mentions: true,
    attachments: true,
  });

  useEffect(() => {
    try {
      const rawPreference = window.localStorage.getItem(NOTES_DESKTOP_PANEL_PREFERENCE_KEY);
      if (!rawPreference) {
        return;
      }

      const parsedPreference = JSON.parse(rawPreference) as {
        showDesktopDetailsRail?: boolean;
        showDesktopPagesRail?: boolean;
      };

      if (typeof parsedPreference.showDesktopPagesRail === "boolean") {
        setShowDesktopPagesRail(parsedPreference.showDesktopPagesRail);
      }

      if (typeof parsedPreference.showDesktopDetailsRail === "boolean") {
        setShowDesktopDetailsRail(parsedPreference.showDesktopDetailsRail);
      }
    } catch {
      window.localStorage.removeItem(NOTES_DESKTOP_PANEL_PREFERENCE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      NOTES_DESKTOP_PANEL_PREFERENCE_KEY,
      JSON.stringify({
        showDesktopPagesRail,
        showDesktopDetailsRail,
      })
    );
  }, [showDesktopDetailsRail, showDesktopPagesRail]);

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
