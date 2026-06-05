export type BlockContextMenuTextStyle = "paragraph" | "heading-1" | "heading-2" | "heading-3" | "heading-4" | "heading-5";

export type BlockContextMenuActionId =
  | "move-up"
  | "move-down"
  | "indent"
  | "outdent"
  | "convert-paragraph"
  | "convert-heading-1"
  | "convert-heading-2"
  | "convert-heading-3"
  | "convert-heading-4"
  | "convert-heading-5"
  | "color"
  | "delete";

export type BlockContextMenuOption = {
  id: BlockContextMenuActionId;
  label: string;
  disabled?: boolean;
  tone?: "default" | "destructive";
};

type BlockContextMenuOptionsInput = {
  blockType: string;
  textStyle?: BlockContextMenuTextStyle | null;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  canIndent?: boolean;
  canOutdent?: boolean;
};

const BLOCK_CONTEXT_ACTION_IDS_BY_TYPE: Record<string, BlockContextMenuActionId[]> = {
  default: ["move-up", "move-down", "indent", "outdent", "color", "delete"],
  text: ["move-up", "move-down", "indent", "outdent", "color", "delete"],
};

export function getBlockContextMenuActionIds(blockType: string): BlockContextMenuActionId[] {
  return BLOCK_CONTEXT_ACTION_IDS_BY_TYPE[blockType] ?? BLOCK_CONTEXT_ACTION_IDS_BY_TYPE.default;
}

export function getBlockContextMenuOptions({
  blockType,
  textStyle = null,
  canMoveUp = false,
  canMoveDown = false,
  canIndent = false,
  canOutdent = false,
}: BlockContextMenuOptionsInput): BlockContextMenuOption[] {
  const options: BlockContextMenuOption[] = [];

  getBlockContextMenuActionIds(blockType).forEach((actionId) => {
    switch (actionId) {
      case "move-up":
        if (canMoveUp) {
          options.push({
            id: actionId,
            label: "Move block up",
          });
        }
        return;
      case "move-down":
        if (canMoveDown) {
          options.push({
            id: actionId,
            label: "Move block down",
          });
        }
        return;
      case "indent":
        if (canIndent) {
          options.push({
            id: actionId,
            label: "Indent block",
          });
        }
        return;
      case "outdent":
        if (canOutdent) {
          options.push({
            id: actionId,
            label: "Outdent block",
          });
        }
        return;
      case "color":
        if (textStyle) {
          if (textStyle !== "paragraph") {
            options.push({
              id: "convert-paragraph",
              label: "Text",
            });
          }

          ([1, 2, 3, 4, 5] as const).forEach((level) => {
            const id = `convert-heading-${level}` as const;
            if (textStyle === `heading-${level}`) {
              return;
            }

            options.push({
              id,
              label: `Heading ${level}`,
            });
          });
        }

        options.push({
          id: actionId,
          label: "Block color",
        });
        return;
      case "delete":
        options.push({
          id: actionId,
          label: "Delete block",
          tone: "destructive",
        });
        return;
      default:
        return;
    }
  });

  return options;
}