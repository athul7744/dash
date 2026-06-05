import { getBlockContextMenuActionIds, getBlockContextMenuOptions } from "@/components/notes/block-context-menu-options";

it("returns the default action set for text blocks", () => {
  expect(getBlockContextMenuActionIds("text")).toEqual(["move-up", "move-down", "indent", "outdent", "color", "delete"]);
  expect(getBlockContextMenuOptions({ blockType: "text" })).toEqual([
    { id: "color", label: "Block color" },
    { id: "delete", label: "Delete block", tone: "destructive" },
  ]);
});

it("falls back to the default action set for unknown block types", () => {
  expect(getBlockContextMenuActionIds("image")).toEqual(["move-up", "move-down", "indent", "outdent", "color", "delete"]);
});

it("includes move-up and move-down when available", () => {
  const options = getBlockContextMenuOptions({ blockType: "text", canMoveUp: true, canMoveDown: true });
  expect(options.find((o) => o.id === "move-up")).toEqual({ id: "move-up", label: "Move block up" });
  expect(options.find((o) => o.id === "move-down")).toEqual({ id: "move-down", label: "Move block down" });
});

it("omits move-up and move-down when not available", () => {
  const options = getBlockContextMenuOptions({ blockType: "text" });
  expect(options.find((o) => o.id === "move-up")).toBeUndefined();
  expect(options.find((o) => o.id === "move-down")).toBeUndefined();
});

it("includes indent when canIndent is true", () => {
  const options = getBlockContextMenuOptions({ blockType: "text", canIndent: true });
  expect(options.find((o) => o.id === "indent")).toEqual({ id: "indent", label: "Indent block" });
});

it("includes outdent when canOutdent is true", () => {
  const options = getBlockContextMenuOptions({ blockType: "text", canOutdent: true });
  expect(options.find((o) => o.id === "outdent")).toEqual({ id: "outdent", label: "Outdent block" });
});

it("omits indent and outdent when not available", () => {
  const options = getBlockContextMenuOptions({ blockType: "text" });
  expect(options.find((o) => o.id === "indent")).toBeUndefined();
  expect(options.find((o) => o.id === "outdent")).toBeUndefined();
});

it("includes heading conversions for paragraph blocks", () => {
  const options = getBlockContextMenuOptions({ blockType: "text", textStyle: "paragraph" });
  expect(options.map((option) => option.id)).toEqual([
    "convert-heading-1",
    "convert-heading-2",
    "convert-heading-3",
    "convert-heading-4",
    "convert-heading-5",
    "color",
    "delete",
  ]);
});

it("includes paragraph and other heading conversions for heading blocks", () => {
  const options = getBlockContextMenuOptions({ blockType: "text", textStyle: "heading-3" });
  expect(options.map((option) => option.id)).toEqual([
    "convert-paragraph",
    "convert-heading-1",
    "convert-heading-2",
    "convert-heading-4",
    "convert-heading-5",
    "color",
    "delete",
  ]);
});

it("omits text style conversions when a text block is not paragraph or heading content", () => {
  const options = getBlockContextMenuOptions({ blockType: "text", textStyle: null });
  expect(options.map((option) => option.id)).toEqual(["color", "delete"]);
});