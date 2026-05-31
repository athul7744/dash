import { format } from "date-fns";

export type RelativeDateOffset = "today" | "tomorrow" | "yesterday" | "next-week" | "next-month" | "next-year";

export function formatDateToken(date: Date): string {
  return `{${format(date, "MMM d, yyyy")}}`;
}

export function getRelativeDate(offset: RelativeDateOffset): Date {
  const d = new Date();
  switch (offset) {
    case "today": return d;
    case "tomorrow": d.setDate(d.getDate() + 1); return d;
    case "yesterday": d.setDate(d.getDate() - 1); return d;
    case "next-week": d.setDate(d.getDate() + 7); return d;
    case "next-month": d.setMonth(d.getMonth() + 1); return d;
    case "next-year": d.setFullYear(d.getFullYear() + 1); return d;
  }
}
