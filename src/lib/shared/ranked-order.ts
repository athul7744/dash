import { LexoRank } from "lexorank";

export interface RankedOrderItem {
  id: string;
  sort_rank: string | null | undefined;
}

function normalizeParentId(parentId: string | null | undefined) {
  return parentId ?? null;
}

export function parseRank(sortRank: string | null | undefined) {
  if (!sortRank) return null;

  try {
    return LexoRank.parse(sortRank);
  } catch {
    return null;
  }
}

export function getNextRank(sortRanks: Array<string | null | undefined> = []) {
  const ranks = sortRanks
    .map((sortRank) => parseRank(sortRank))
    .filter((rank): rank is LexoRank => rank !== null)
    .sort((left, right) => left.compareTo(right));

  if (ranks.length === 0) {
    return LexoRank.middle().format();
  }

  return ranks[ranks.length - 1].genNext().format();
}

export function getRankAfter(currentSortRank?: string | null, nextSiblingSortRank?: string | null) {
  const currentRank = parseRank(currentSortRank);
  const nextSiblingRank = parseRank(nextSiblingSortRank);

  if (!currentRank) {
    return getNextRank(nextSiblingSortRank ? [nextSiblingSortRank] : []);
  }

  if (nextSiblingRank) {
    return currentRank.between(nextSiblingRank).format();
  }

  return currentRank.genNext().format();
}

export function getSiblingItems<TItem extends RankedOrderItem>(
  items: TItem[],
  parentId: string | null | undefined,
  getParentId: (item: TItem) => string | null | undefined,
  excludeItemId?: string
) {
  const normalizedParentId = normalizeParentId(parentId);

  return items.filter((item) => {
    if (normalizeParentId(getParentId(item)) !== normalizedParentId) {
      return false;
    }

    return excludeItemId ? item.id !== excludeItemId : true;
  });
}

export function getRankAtParentEnd<TItem extends RankedOrderItem>(
  items: TItem[],
  parentId: string | null | undefined,
  getParentId: (item: TItem) => string | null | undefined,
  excludeItemId?: string
) {
  const siblingItems = getSiblingItems(items, parentId, getParentId, excludeItemId);
  return getNextRank(siblingItems.map((item) => item.sort_rank));
}

export function getRankAfterItem<TItem extends RankedOrderItem>(
  items: TItem[],
  siblingItemId: string,
  parentId: string | null | undefined,
  getParentId: (item: TItem) => string | null | undefined,
  excludeItemId?: string
) {
  const siblingItems = getSiblingItems(items, parentId, getParentId, excludeItemId)
    .sort((left, right) => (left.sort_rank ?? "").localeCompare(right.sort_rank ?? ""));
  const siblingIndex = siblingItems.findIndex((item) => item.id === siblingItemId);
  const currentSibling = siblingIndex >= 0 ? siblingItems[siblingIndex] : null;
  const nextSibling = siblingIndex >= 0 ? siblingItems[siblingIndex + 1] : null;

  return currentSibling
    ? getRankAfter(currentSibling.sort_rank, nextSibling?.sort_rank ?? null)
    : getNextRank(siblingItems.map((item) => item.sort_rank));
}
