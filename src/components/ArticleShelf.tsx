import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Plus,
  List,
  SquaresFour,
  CheckCircle,
  PencilSimple,
  Trash,
  ArrowCounterClockwise,
  Archive,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import type { Article } from "../core/types";
import {
  shelfGroup,
  type ShelfGroup,
  type ShelfAction,
} from "../core/articleShelf";
import { useI18n } from "../i18n";
import { trapDialogTab } from "./dialogFocus";
import "./articleShelf.css";

type Tab = ShelfGroup | "all";
const labels: Record<Tab, string> = {
  all: "全部",
  draft: "草稿箱",
  published: "已发布",
  archived: "归档",
  deleted: "回收站",
};
const pageSize = 36;
export function ArticleShelf({
  articles,
  initial,
  initialQuery,
  onClose,
  onOpen,
  onNew,
  onFile,
}: {
  articles: Article[];
  initial: Tab;
  initialQuery: string;
  onClose: () => void;
  onOpen: (a: Article) => Promise<void>;
  onNew: () => Promise<void>;
  onFile: (a: Article, op: ShelfAction) => Promise<void>;
}) {
  const { t, language } = useI18n(),
    dialog = useRef<HTMLDialogElement>(null),
    searchBox = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>(initial),
    [search, setSearch] = useState(initialQuery),
    [order, sort] = useState("updatedAt");
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem("acks-x-shelf-view") === "cards"
        ? "cards"
        : "list";
    } catch {
      return "list";
    }
  });
  const [limit, show] = useState(pageSize),
    [pending, ask] = useState(""),
    [msg, report] = useState(""),
    [busy, lock] = useState(false);
  const flight = useRef(false);
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    searchBox.current?.focus();
    return () => el.close();
  }, []);
  const mode = (v: string) => {
    setView(v);
    try {
      localStorage.setItem("acks-x-shelf-view", v);
    } catch {}
  };
  const run = async (fn: () => Promise<void>) => {
    if (flight.current) return;
    flight.current = true;
    lock(true);
    report("");
    try {
      await fn();
      ask("");
    } catch (e) {
      report(e instanceof Error ? e.message : String(e));
    } finally {
      flight.current = false;
      lock(false);
    }
  };
  const file = (a: Article, op: ShelfAction) =>
    run(async () => {
      await onFile(a, op);
      report(t("文章分类已更新"));
    });
  const match = (a: Article, g: Tab) =>
    g === "all" ? !a.deletedAt : shelfGroup(a) === g;
  const q = search.trim().toLocaleLowerCase();
  const rows = articles
    .filter(
      (a) =>
        match(a, tab) &&
        (!q ||
          [a.title, a.body].some((v) => v.toLocaleLowerCase().includes(q))),
    )
    .sort((a, b) =>
      order === "title"
        ? a.title.localeCompare(b.title, language)
        : order === "createdAt"
          ? b.createdAt.localeCompare(a.createdAt)
          : b.updatedAt.localeCompare(a.updatedAt),
    );
  const icon = (
    name: string,
    glyph: React.ReactNode,
    click: () => void,
    pressed?: boolean,
  ) => (
    <button
      type="button"
      disabled={busy}
      className="shelf-icon"
      aria-label={t(name)}
      title={t(name)}
      aria-pressed={pressed}
      onClick={click}
    >
      {glyph}
    </button>
  );
  return (
    <dialog
      ref={dialog}
      className="article-shelf"
      aria-label={t("文章管理")}
      onKeyDown={trapDialogTab}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="shelf-frame">
        <header className="shelf-heading">
          {icon("返回编辑器", <ArrowLeft />, onClose)}
          <h1>{t("文章管理")}</h1>
          {icon("新建", <Plus />, () => run(onNew))}
        </header>
        <div className="shelf-controls">
          <label>
            <MagnifyingGlass />
            <input
              ref={searchBox}
              type="search"
              aria-label={t("搜索标题或正文")}
              placeholder={t("搜索标题或正文")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                show(pageSize);
              }}
            />
          </label>
          <select
            aria-label={t("文稿排序")}
            value={order}
            onChange={(e) => {
              sort(e.target.value);
              show(pageSize);
            }}
          >
            {[
              ["updatedAt", "最近编辑"],
              ["createdAt", "创建时间"],
              ["title", "标题"],
            ].map(([k, v]) => (
              <option value={k} key={k}>
                {t(v)}
              </option>
            ))}
          </select>
          <div className="shelf-modes">
            {icon("列表", <List />, () => mode("list"), view === "list")}
            {icon(
              "卡片",
              <SquaresFour />,
              () => mode("cards"),
              view === "cards",
            )}
          </div>
        </div>
        <nav className="shelf-tabs" aria-label={t("文章分类")}>
          {(Object.keys(labels) as Tab[]).map((k) => (
            <button
              key={k}
              aria-pressed={tab === k}
              onClick={() => {
                setTab(k);
                show(pageSize);
                ask("");
              }}
            >
              {t(labels[k])}{" "}
              <small>{articles.filter((a) => match(a, k)).length}</small>
            </button>
          ))}
        </nav>
        <p className="shelf-notice" role="status">
          {msg || (!rows.length ? t("没有匹配的文章") : "")}
        </p>
        <div className={"shelf-results " + view}>
          {rows.slice(0, limit).map((a) => (
            <article key={a.id} className="shelf-item">
              <button
                className="shelf-open"
                disabled={busy || !!a.deletedAt}
                onClick={() => run(() => onOpen(a))}
              >
                <strong>{a.title || t("未命名文章")}</strong>
                <span>{a.body.slice(0, 190).replace(/\s+/g, " ")}</span>
              </button>
              <footer>
                <div className="shelf-meta">
                  {t(labels[shelfGroup(a)])} ·{" "}
                  {new Date(a.updatedAt).toLocaleDateString(language)}
                </div>
                <div className="shelf-actions">
                  {a.deletedAt ? (
                    icon("恢复文章", <ArrowCounterClockwise />, () =>
                      file(a, "restore"),
                    )
                  ) : (
                    <>
                      {!a.archived &&
                        icon(
                          a.shelfStatus === "published"
                            ? "标记为草稿"
                            : "标记为已发布",
                          a.shelfStatus === "published" ? (
                            <PencilSimple />
                          ) : (
                            <CheckCircle />
                          ),
                          () =>
                            file(
                              a,
                              a.shelfStatus === "published"
                                ? "draft"
                                : "published",
                            ),
                        )}
                      {icon(
                        a.archived ? "取消归档" : "归档",
                        a.archived ? <ArrowCounterClockwise /> : <Archive />,
                        () => file(a, a.archived ? "restore" : "archive"),
                      )}
                      {icon("移入回收站", <Trash />, () => ask(a.id))}
                    </>
                  )}
                </div>
              </footer>
              {pending === a.id && (
                <div className="shelf-confirm">
                  {t("将此文移入回收站？")}{" "}
                  <button disabled={busy} onClick={() => ask("")}>
                    {t("取消")}
                  </button>
                  <button disabled={busy} onClick={() => file(a, "trash")}>
                    {t("确认移入")}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
        {limit < rows.length && (
          <button
            className="shelf-more"
            onClick={() => show((n) => n + pageSize)}
          >
            {t("加载更多")}
          </button>
        )}
      </div>
    </dialog>
  );
}
