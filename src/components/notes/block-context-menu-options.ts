export type BlockContextMenuActionId = "move-up" | "move-down" | "indent" | "outdent" | "color" | "delete";

export type BlockContextMenuOption = {
  id: BlockContextMenuActionId;
  label: string;
  disabled?: boolean;
  tone?: "default" | "destructive";
};

type BlockContextMenuOptionsInput = {
  blockType: string;
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