import type { Article } from "./types";
export type ShelfGroup = "draft" | "published" | "archived" | "deleted";
export type ShelfAction =
  "draft" | "published" | "trash" | "restore" | "archive";
export function shelfGroup(a: Article): ShelfGroup {
  return a.deletedAt
    ? "deleted"
    : a.archived
      ? "archived"
      : (a.shelfStatus ?? "draft");
}
export function fileArticle(
  a: Article,
  action: ShelfAction,
  now = new Date().toISOString(),
): Article {
  if (action === "trash") return { ...a, deletedAt: now };
  if (action === "restore")
    return a.deletedAt
      ? { ...a, deletedAt: undefined }
      : { ...a, archived: false };
  if (action === "archive") return { ...a, archived: true };
  return { ...a, shelfStatus: action };
}
