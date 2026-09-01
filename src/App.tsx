import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText,
  Plus,
  UploadSimple,
  MagnifyingGlass,
  Sun,
  Moon,
  LockSimple,
  ClockCounterClockwise,
  ImageSquare,
  DotsThree,
  X,
  CheckCircle,
  WarningCircle,
  DownloadSimple,
  CaretRight,
  ArrowCounterClockwise,
  ArrowsOutSimple,
  SidebarSimple,
  WifiSlash,
  Copy,
  XLogo,
  PaperPlaneTilt,
  ArrowSquareOut,
  UserCircle,
} from "@phosphor-icons/react";
import { MarkdownEditor, type EditorHandle } from "./components/MarkdownEditor";
import { MarkdownToolbar } from "./components/MarkdownToolbar";
import { XPublishDialog } from "./components/XPublishDialog";
import { AccountDialog } from "./components/AccountDialog";
import { Preview, AssetImage } from "./components/Preview";
import {
  convert,
  importMarkdown,
  normalizePath,
  bindImage,
} from "./core/convert";
import { validateConversion } from "./core/validate";
import {
  newArticle,
  SAMPLE_TITLE,
  safeFilename,
  type Article,
  type Conversion,
  type Theme,
  type Snapshot,
} from "./core/types";
import {
  db,
  changes,
  ConflictError,
  insertArticle,
  listArticles,
  pruneHistory,
  saveArticle,
  seedLibrary,
} from "./services/database";
import { ingestImage } from "./services/images";
import {
  archiveFilename,
  downloadBlob,
  exportArchive,
  importArchive,
} from "./services/archive";
import type { OfflineState } from "./services/offline";
import { registerOffline } from "./services/offline";
import { captureDraft } from "./services/recovery";
import { buildClipboardBody } from "./core/clipboardBody";
import { copyBody, copyTitle, copyErrorMessage } from "./services/clipboard";
import { APP_VERSION } from "./core/version";
import { localizeIssue, useI18n } from "./i18n";

type Panel =
  | "validation"
  | "export"
  | "history"
  | "assets"
  | "about"
  | "menu"
  | "manual-x"
  | "direct-x"
  | "account"
  | null;
const boot = async () => {
  await db.open();
  await seedLibrary();
  return listArticles();
};
let bootPromise: ReturnType<typeof boot> | undefined;
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      aria-label={title}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label={t("关闭对话框")}
          onClick={close}
        >
          <X size={22} />
        </button>
      </div>
      <div className="dialog-content">{children}</div>
    </dialog>
  );
}
function formatTime(at?: string) {
  return at
    ? new Date(at).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "尚未保存";
}
export function App() {
  const { t, language, setLanguage } = useI18n();
  const [article, setArticle] = useState<Article | null>(null),
    [library, setLibrary] = useState<Article[]>([]),
    [conversion, setConversion] = useState<Conversion | null>(null),
    [theme, setTheme] = useState<Theme>(() => {
      try {
        return localStorage.getItem("acks-x-theme") === "dark"
          ? "dark"
          : "light";
      } catch {
        return "light";
      }
    });
  const [status, setStatus] = useState<"clean" | "dirty" | "saving" | "error">(
      "clean",
    ),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [conflict, setConflict] = useState(false),
    [panel, setPanel] = useState<Panel>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState<"active" | "archived" | "deleted">("active"),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState<"source" | "preview">("source"),
    [sidebar, setSidebar] = useState(false),
    [snapshots, setSnapshots] = useState<Snapshot[]>([]),
    [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null),
    [renderErrors, setRenderErrors] = useState<Record<string, string>>({}),
    [storage, setStorage] = useState<{
      persistent?: boolean;
      usage?: number;
      quota?: number;
    }>({}),
    [offline, setOffline] = useState<OfflineState>({
      ready: false,
      online: navigator.onLine,
    }),
    [fatal, setFatal] = useState("");
  const [copying, setCopying] = useState(false),
    [copyFeedback, setCopyFeedback] = useState("");
  const editor = useRef<EditorHandle>(null),
    fileInput = useRef<HTMLInputElement>(null),
    coverInput = useRef<HTMLInputElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    associateInput = useRef<HTMLInputElement>(null);
  const draft = useRef<Article | null>(null),
    base = useRef(0),
    dirty = useRef(false),
    epoch = useRef(0),
    saveFlight = useRef<Promise<Article | null> | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    maxTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    worker = useRef<Worker | null>(null),
    requestId = useRef(0),
    associatePath = useRef("");
  useEffect(() => {
    const url = new URL(location.href);
    const outcome = url.searchParams.get("x"),
      reason = url.searchParams.get("reason");
    let pending = false;
    try {
      pending = sessionStorage.getItem("acks-x-oauth-pending") === "1";
      if (outcome === "connected")
        sessionStorage.removeItem("acks-x-oauth-pending");
    } catch {}
    if (outcome || pending) {
      setPanel("direct-x");
      if (outcome === "error") {
        const messages: Record<string, string> = {
          state_mismatch:
            "X 授权回调与发起授权的浏览器会话不一致，请在同一浏览器标签重新授权。",
          access_denied: "你取消了 X 授权，账号尚未连接。",
          missing_code: "X 回调没有包含授权码，请检查开发者后台的回调地址。",
          token_exchange_failed:
            "X 授权码交换失败，请核对当前 Client ID、应用类型和回调地址。",
        };
        setError(messages[reason ?? ""] ?? "X 授权回调失败，请重新授权。");
      }
      url.searchParams.delete("x");
      url.searchParams.delete("reason");
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, []);
  const refresh = useCallback(async () => setLibrary(await listArticles()), []);
  const load = useCallback((next: Article) => {
    const contentChanged =
      draft.current?.id !== next.id || draft.current?.body !== next.body;
    draft.current = next;
    captureDraft(next);
    base.current = next.revision;
    dirty.current = false;
    epoch.current++;
    setArticle(next);
    if (contentChanged) setConversion(null);
    setStatus("clean");
    setError("");
    setConflict(false);
    if (contentChanged) setRenderErrors({});
    setSelectedSnapshot(null);
    setCopyFeedback("");
    try {
      localStorage.setItem("acks-x-active", next.id);
    } catch {}
  }, []);
  const flush = useCallback(async (): Promise<Article | null> => {
    if (saveFlight.current) {
      await saveFlight.current;
      if (dirty.current) return flush();
      return draft.current;
    }
    const current = draft.current;
    if (!current || !dirty.current) return current;
    const captured = epoch.current;
    setStatus("saving");
    const operation = saveArticle(current, base.current)
      .then((saved) => {
        if (draft.current?.id === saved.id) {
          base.current = saved.revision;
          if (epoch.current === captured) {
            draft.current = saved;
            dirty.current = false;
            setArticle(saved);
            setStatus("clean");
          } else {
            draft.current = { ...draft.current, revision: saved.revision };
            setArticle(draft.current);
            setStatus("dirty");
          }
          setError("");
        }
        void refresh();
        return saved;
      })
      .catch((e) => {
        setStatus("error");
        setError(
          e instanceof Error ? e.message : "本地保存失败，请立即导出恢复包。",
        );
        if (e instanceof ConflictError) setConflict(true);
        throw e;
      })
      .finally(() => {
        saveFlight.current = null;
      });
    saveFlight.current = operation;
    return operation;
  }, [refresh]);
  const edit = useCallback(
    (patch: Partial<Article>) => {
      const current = draft.current;
      if (!current) return;
      if (
        Object.entries(patch).every(
          ([k, v]) => current[k as keyof Article] === v,
        )
      )
        return;
      const next = { ...current, ...patch };
      captureDraft(next);
      draft.current = next;
      epoch.current++;
      dirty.current = true;
      setArticle(next);
      setStatus("dirty");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush().catch(() => {});
      }, 750);
      if (!maxTimer.current)
        maxTimer.current = setTimeout(() => {
          maxTimer.current = undefined;
          void flush().catch(() => {});
        }, 1800);
    },
    [flush],
  );
  useEffect(() => {
    bootPromise ??= boot();
    let active = true;
    bootPromise
      .then((items) => {
        if (!active) return;
        setLibrary(items);
        let last = "";
        try {
          last = localStorage.getItem("acks-x-active") ?? "";
        } catch {}
        const selected =
          items.find((a) => a.id === last && !a.deletedAt) ||
          items.find((a) => a.title === SAMPLE_TITLE) ||
          items[0];
        if (selected) load(selected);
      })
      .catch(() => {
        if (active)
          setFatal(
            "浏览器无法打开本地数据库。请检查存储权限或退出隐私模式；不会清除已有数据。",
          );
      });
    return () => {
      active = false;
    };
  }, [load]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("acks-x-theme", theme);
    } catch {}
  }, [theme]);
  useEffect(() => {
    const w = new Worker(
      new URL("./core/converter.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = w;
    w.onmessage = (e) => {
      if (e.data.id !== requestId.current) return;
      if (e.data.error) {
        setError(e.data.error);
        return;
      }
      setConversion(e.data.conversion);
      setRenderErrors({});
    };
    w.onerror = () => setError("转换任务中断，原稿仍然保留。");
    return () => w.terminate();
  }, []);
  useEffect(() => {
    if (!article) return;
    const id = ++requestId.current;
    const timeout = setTimeout(
      () => worker.current?.postMessage({ id, source: article.body }),
      250,
    );
    return () => clearTimeout(timeout);
  }, [article?.body, article?.id]);
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (
        event.data.id !== draft.current?.id ||
        event.data.revision <= base.current
      )
        return;
      if (dirty.current || saveFlight.current) {
        setConflict(true);
        setError("这篇文稿已在另一标签页更新，请将当前修改另存为副本。");
        setStatus("error");
      } else
        db.articles.get(event.data.id).then((a) => {
          if (a) load(a);
        });
    };
    changes?.addEventListener("message", handler);
    return () => changes?.removeEventListener("message", handler);
  }, [load]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const hide = () => {
      if (document.visibilityState === "hidden") void flush().catch(() => {});
    };
    window.addEventListener("beforeunload", before);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("beforeunload", before);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [flush]);
  useEffect(() => {
    navigator.storage
      ?.estimate()
      .then((e) => setStorage((s) => ({ ...s, ...e })));
    navigator.storage
      ?.persisted()
      .then((persistent) => setStorage((s) => ({ ...s, persistent })));
    void pruneHistory().catch(() => {});
    return registerOffline(setOffline);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (panel === "history" && article)
      db.snapshots
        .where("articleId")
        .equals(article.id)
        .sortBy("at")
        .then((rows) => setSnapshots(rows.reverse()));
  }, [panel, article?.id, article?.revision]);
  const onRenderError = useCallback(
    (id: string, message?: string) =>
      setRenderErrors((old) => {
        const next = { ...old };
        if (message) next[id] = message;
        else delete next[id];
        return next;
      }),
    [],
  );
  async function copyForX(kind: "title" | "body") {
    const current = draft.current;
    if (!current) return;
    setCopying(true);
    setCopyFeedback("");
    try {
      if (kind === "title") {
        await copyTitle(current.title);
        if (draft.current?.id !== current.id) return;
        setCopyFeedback("标题已复制，请粘贴到 X 顶部“添加标题”栏。");
      } else {
        const payload = buildClipboardBody(
          convert(current.body),
          current.assets,
        );
        const mode = await copyBody(payload);
        if (draft.current?.id !== current.id) return;
        setCopyFeedback(
          `${mode === "html" ? "正文富文本" : "正文纯文本"}已复制${mode === "plain" ? "（当前浏览器不支持富文本，请在 X 检查格式）" : ""}。${payload.imageCount ? `含 ${payload.imageCount} 处图片位置提示；请逐张复制图片或下载上传，插入后删除对应提示。` : "标题和封面需单独填写。"}${payload.postCount ? " 嵌帖按链接复制，请在 X 核对。" : ""} 尚未发送到 X。`,
        );
      }
    } catch (error) {
      setError(copyErrorMessage(error));
    } finally {
      setCopying(false);
    }
  }
  async function switchTo(next: Article) {
    try {
      await flush();
      load((await db.articles.get(next.id)) ?? next);
      setSidebar(false);
    } catch {
      setPanel("export");
    }
  }
  async function create() {
    try {
      await flush();
      const next = await insertArticle(newArticle());
      await refresh();
      load(next);
      setSidebar(false);
    } catch (e) {
      setError(String(e));
    }
  }
  async function duplicate() {
    if (!draft.current) return;
    const current = draft.current;
    const next = await insertArticle(
      {
        ...current,
        id: crypto.randomUUID(),
        revision: 0,
        title: `${current.title || "未命名文章"}（副本）`,
        lastExportAt: undefined,
        lastExportRevision: undefined,
        deletedAt: undefined,
        archived: false,
      },
      [],
      "另存副本",
    );
    load(next);
    await refresh();
    setNotice("已另存为独立副本");
    setPanel(null);
  }
  async function addImage(file: File, cover = false, path?: string) {
    if (!draft.current) return;
    const docId = draft.current.id;
    const pending = `pending:${crypto.randomUUID()}`;
    if (!cover && !path)
      editor.current?.insert(
        `\n\n![${file.name.replace(/[\[\]\\]/g, "")}](${pending})\n\n`,
      );
    setBusy(true);
    try {
      const { asset, stored } = await ingestImage(
        file,
        file.name,
        cover ? "cover" : "image",
      );
      await db.assets.put(stored);
      if (draft.current?.id !== docId)
        throw new Error("文稿已切换，请重新插入图片。");
      const assets = [
        ...draft.current.assets.filter((a) => a.id !== asset.id),
        asset,
      ];
      if (cover) edit({ assets, coverId: asset.id });
      else if (path) {
        const body = bindImage(draft.current.body, path, asset.id);
        edit({ assets, body });
      } else {
        // Reserve position before decoding; undoing the placeholder cancels the insertion.
        if (draft.current.body.includes(pending))
          edit({
            assets,
            body: bindImage(draft.current.body, pending, asset.id),
          });
      }
      await flush();
      setNotice(cover ? "封面已保存到本地" : "图片已保存在正文位置");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function importFiles(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    try {
      await flush();
      const zip = files.find((f) => /\.zip$/i.test(f.name));
      if (zip) {
        if (files.length !== 1) throw new Error("请单独选择一个资源包。");
        load(await importArchive(zip));
      } else {
        const md = files.filter((f) => /\.md$/i.test(f.name));
        if (md.length !== 1)
          throw new Error("请选择一个 Markdown 文件，可同时选择它引用的图片。");
        if (md[0].size > 2 * 1024 * 1024)
          throw new Error("Markdown 文件不能超过 2 MiB。");
        const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
            await md[0].arrayBuffer(),
          ),
          parsed = importMarkdown(decoded);
        const next = newArticle(
          parsed.title || md[0].name.replace(/\.md$/i, ""),
          parsed.body,
        );
        const blobs = [];
        const names = new Map<string, File>();
        for (const f of files.filter((f) => f !== md[0])) {
          const name = normalizePath(f.webkitRelativePath || f.name);
          if (names.has(name))
            throw new Error("所选图片有重名，请使用资源包或逐项关联。");
          names.set(name, f);
        }
        const references = convert(next.body).nodes.filter(
          (n) => n.kind === "image" && n.path,
        );
        for (const n of references) {
          if (n.kind !== "image" || !n.path || /^https?:/i.test(n.path))
            continue;
          let normalized: string;
          try {
            normalized = normalizePath(decodeURIComponent(n.path));
          } catch {
            continue;
          }
          const f =
            names.get(normalized) ||
            ([...names.values()].filter(
              (f) => f.name === normalized.split("/").at(-1),
            ).length === 1
              ? [...names.values()].find(
                  (f) => f.name === normalized.split("/").at(-1),
                )
              : undefined);
          if (!f) continue;
          const { asset, stored } = await ingestImage(f, f.name);
          if (!next.assets.some((a) => a.id === asset.id)) {
            next.assets.push(asset);
            blobs.push(stored);
          }
          next.body = bindImage(next.body, n.path, asset.id);
        }
        load(await insertArticle(next, blobs, "导入 Markdown"));
      }
      await refresh();
      setNotice("导入完成，原有文稿未被覆盖");
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败，原有数据未改动。");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function doExport(recovery = false) {
    setBusy(true);
    try {
      let current = draft.current!;
      try {
        current = (await flush()) || current;
      } catch {
        if (!recovery)
          throw new Error("本地保存失败，请使用恢复包保留当前修改。");
        current = draft.current!;
      }
      const result = convert(current.body),
        issues = validateConversion(current, result);
      if (!recovery && issues.some((i) => i.severity === "error"))
        throw new Error("请先修复缺图或安全问题；也可以导出恢复包。");
      const blob = await exportArchive(current, result, recovery);
      downloadBlob(
        blob,
        `${recovery ? "恢复包-" : ""}${archiveFilename(current)}`,
      );
      if (!recovery) {
        await db.articles.update(current.id, {
          lastExportRevision: current.revision,
          lastExportAt: new Date().toISOString(),
        });
        if (draft.current?.id === current.id) {
          draft.current = {
            ...draft.current,
            lastExportRevision: current.revision,
            lastExportAt: new Date().toISOString(),
          };
          setArticle(draft.current);
        }
        await refresh();
      }
      setNotice(
        `已生成 ${recovery ? "恢复包" : "资源包"}下载 · r${current.revision}，请检查下载文件`,
      );
      setPanel(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function restore(snapshot: Snapshot) {
    try {
      await flush();
      const restored = await saveArticle(
        { ...snapshot.article, id: draft.current!.id },
        base.current,
        "历史恢复",
      );
      load(restored);
      await refresh();
      setPanel(null);
      setNotice("历史内容已恢复为新版本，原版本仍然保留");
    } catch (e) {
      setError(String(e));
    }
  }
  async function setLifecycle(action: "archive" | "trash" | "restore") {
    try {
      await flush();
      edit(
        action === "archive"
          ? { archived: true }
          : action === "trash"
            ? { deletedAt: new Date().toISOString() }
            : { archived: false, deletedAt: undefined },
      );
      await flush();
      setPanel(null);
      setNotice(
        action === "trash"
          ? "文稿已移入回收站，可以恢复"
          : action === "archive"
            ? "文稿已归档"
            : "文稿已恢复",
      );
    } catch (e) {
      setError(String(e));
    }
  }
  function updateAsset(id: string, patch: Partial<Article["assets"][number]>) {
    if (draft.current)
      edit({
        assets: draft.current.assets.map((a) =>
          a.id === id ? { ...a, ...patch } : a,
        ),
      });
  }
  if (fatal)
    return (
      <main className="fatal-screen">
        <WarningCircle size={44} />
        <h1>本地存储不可用</h1>
        <p>{fatal}</p>
        <button onClick={() => location.reload()}>重新检查</button>
      </main>
    );
  if (!article)
    return (
      <main className="loading-screen">
        <FileText size={32} />
        <p>正在打开你的本地写作台…</p>
      </main>
    );
  const issues = conversion ? validateConversion(article, conversion) : [],
    errors = issues.filter((i) => i.severity === "error"),
    warnings = issues.filter((i) => i.severity === "warning"),
    renderCount =
      conversion?.nodes.filter((n) => n.kind === "render").length ?? 0;
  const visible = library
    .filter((a) =>
      filter === "deleted"
        ? !!a.deletedAt
        : filter === "archived"
          ? a.archived && !a.deletedAt
          : !a.archived && !a.deletedAt,
    )
    .filter((a) =>
      (a.title + a.body).toLowerCase().includes(search.toLowerCase()),
    );
  const statusText =
    status === "clean"
      ? `${t("已保存到本地")} · r${article.revision}`
      : status === "saving"
        ? t("正在保存到本地…")
        : status === "error"
          ? t("保存失败 · 请导出恢复包")
          : t("未保存");
  return (
    <div className={`app-shell ${sidebar ? "sidebar-visible" : ""}`}>
      <header className="app-header">
        <div className="brand">
          <button
            className="icon-button mobile-menu"
            aria-label="展开文稿库"
            onClick={() => setSidebar(!sidebar)}
          >
            <SidebarSimple size={24} />
          </button>
          <FileText size={30} weight="light" />
          <span>ACKS X Article Editor</span>
        </div>
        <div className="header-context">{t("本地写作")}</div>
        <div className="header-actions">
          <div className="theme-switch" aria-label={t("界面主题")}>
            <button
              aria-pressed={theme === "light"}
              aria-label={t("浅色")}
              onClick={() => setTheme("light")}
            >
              <Sun size={19} />
              <span>{t("浅色")}</span>
            </button>
            <button
              aria-pressed={theme === "dark"}
              aria-label={t("深色")}
              onClick={() => setTheme("dark")}
            >
              <Moon size={19} />
              <span>{t("深色")}</span>
            </button>
          </div>
          <div className="language-switch" aria-label="Language">
            <button
              aria-pressed={language === "zh-CN"}
              onClick={() => setLanguage("zh-CN")}
            >
              中
            </button>
            <button
              aria-pressed={language === "en"}
              onClick={() => setLanguage("en")}
            >
              EN
            </button>
          </div>
          <button
            className="quiet-button validation-trigger"
            onClick={() => setPanel("validation")}
          >
            {t("校验")}
            {errors.length > 0 && <span className="error-dot" />}
          </button>
          <button
            className="secondary-button header-account-button"
            onClick={() => setPanel("account")}
          >
            <UserCircle size={18} />
            {t("账号")}
          </button>
          <button
            className="secondary-button header-publish-button"
            onClick={() => setPanel("manual-x")}
          >
            <XLogo size={17} />
            {t("手动发布到 X")}
          </button>
          <button
            className="primary-button header-publish-button"
            onClick={() => setPanel("direct-x")}
          >
            <PaperPlaneTilt size={17} />
            {t("直接发布到 X")}
          </button>
          <button
            className="primary-button"
            onClick={() => setPanel("export")}
            disabled={busy}
          >
            <DownloadSimple className="compact-icon" size={17} />
            {t("导出资源包")}
          </button>
        </div>
      </header>
      <aside className="sidebar">
        <div className="library-heading">
          <h2>{t("文稿库")}</h2>
          <button
            className="icon-button"
            aria-label={t("关于与存储设置")}
            onClick={() => setPanel("about")}
          >
            <DotsThree size={23} />
          </button>
        </div>
        <label className="search-field">
          <MagnifyingGlass size={18} />
          <input
            aria-label={t("搜索文稿")}
            placeholder={t("搜索文稿")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="library-actions">
          <button onClick={create} disabled={busy}>
            <Plus size={20} />
            {t("新建")}
          </button>
          <button onClick={() => fileInput.current?.click()} disabled={busy}>
            <UploadSimple size={20} />
            {t("导入")}
          </button>
        </div>
        <nav className="document-list" aria-label="文稿列表">
          {visible.length ? (
            visible.map((a) => (
              <button
                key={a.id}
                className={`document-row ${article.id === a.id ? "active" : ""}`}
                onClick={() => switchTo(a)}
              >
                <span>{a.title || "未命名文章"}</span>
                <small>{formatTime(a.updatedAt)}</small>
              </button>
            ))
          ) : (
            <p className="library-empty">
              {search ? "没有找到匹配的文稿" : "这里还没有文稿"}
            </p>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="library-filters">
            <button
              aria-pressed={filter === "active"}
              onClick={() => setFilter("active")}
            >
              {t("全部")}
            </button>
            <button
              aria-pressed={filter === "archived"}
              onClick={() => setFilter("archived")}
            >
              {t("归档")}
            </button>
            <button
              aria-pressed={filter === "deleted"}
              onClick={() => setFilter("deleted")}
            >
              {t("回收站")}
            </button>
          </div>
          <p>
            <LockSimple size={18} />
            {t("内容仅保存在此浏览器")}
          </p>
          <button className="storage-link" onClick={() => setPanel("about")}>
            {offline.online ? (
              offline.ready ? (
                t("已准备好离线使用")
              ) : (
                t("离线资源准备中")
              )
            ) : (
              <>
                <WifiSlash size={14} />
                {t("离线工作中")}
              </>
            )}
          </button>
        </div>
      </aside>
      <div className="mobile-view-switch">
        <button
          aria-pressed={tab === "source"}
          onClick={() => setTab("source")}
        >
          {t("Markdown 源文")}
        </button>
        <button
          aria-pressed={tab === "preview"}
          onClick={() => setTab("preview")}
        >
          {t("X 结构预览")}
        </button>
      </div>
      <main className={`workspace show-${tab}`}>
        <section className="editor-pane" aria-label="编辑区">
          <div className="pane-heading">
            <h2>{t("Markdown 源文")}</h2>
            <div className="pane-actions">
              <button
                className="icon-button"
                aria-label={t("历史版本")}
                onClick={() => setPanel("history")}
              >
                <ClockCounterClockwise size={19} />
              </button>
              <button
                className="icon-button"
                aria-label={t("资源管理")}
                onClick={() => setPanel("assets")}
              >
                <ImageSquare size={20} />
              </button>
              <button
                className="icon-button"
                aria-label={t("文稿操作")}
                onClick={() => setPanel("menu")}
              >
                <DotsThree size={22} />
              </button>
            </div>
          </div>
          <div className="editor-top">
            <input
              className="title-input"
              aria-label={t("文章标题")}
              placeholder={t("给这篇文章起个名字")}
              value={article.title}
              onChange={(e) => edit({ title: e.target.value })}
            />
            <div className="cover-row">
              {article.coverId ? (
                <AssetImage
                  id={article.coverId}
                  alt="文章封面缩略图"
                  className="cover-thumbnail"
                />
              ) : (
                <button
                  className="cover-placeholder"
                  onClick={() => coverInput.current?.click()}
                >
                  <ImageSquare size={25} />
                  <span>添加封面</span>
                </button>
              )}
              <button
                className="quiet-button"
                onClick={() => coverInput.current?.click()}
                disabled={busy}
              >
                <ArrowsOutSimple size={14} />
                {article.coverId ? t("更换封面") : t("选择图片")}
              </button>
              <button
                className="quiet-button insert-image"
                onClick={() => imageInput.current?.click()}
                disabled={busy}
              >
                <Plus size={15} />
                {t("正文图")}
              </button>
            </div>
          </div>
          <MarkdownToolbar
            editor={editor}
            onImage={() => imageInput.current?.click()}
          />
          <MarkdownEditor
            key={article.id}
            ref={editor}
            value={article.body}
            theme={theme}
            onChange={(body) => edit({ body })}
            onImage={(file) => {
              void addImage(file);
            }}
          />
        </section>
        <section className="preview-pane" aria-label={t("预览区")}>
          <div className="pane-heading preview-heading">
            <h2>{t("X 结构预览")}</h2>
            <div className="preview-copy-actions" data-copy-ui="true">
              <button
                className="quiet-button"
                disabled={copying || !article.title.trim()}
                onClick={() => copyForX("title")}
              >
                <Copy size={14} />
                {t("复制标题")}
              </button>
              <button
                className="secondary-button copy-body-button"
                disabled={copying || !article.body.trim()}
                onClick={() => copyForX("body")}
              >
                <Copy size={15} />
                {t("复制正文")}
              </button>
            </div>
            <span>{t("结构预览，非官方渲染")}</span>
          </div>
          <div className="copy-guidance" data-copy-ui="true">
            <span>
              {t(
                "正文不含标题、封面和图片。表格/代码请用下方“复制图片”或“下载 PNG”。",
              )}
            </span>
            {copyFeedback && <p role="status">{copyFeedback}</p>}
          </div>
          <div className="preview-scroll">
            <Preview
              article={article}
              conversion={conversion}
              onError={onRenderError}
              onLocate={(from, to) => {
                setTab("source");
                editor.current?.focusRange(from, to);
              }}
            />
          </div>
          <button
            className="conversion-summary"
            onClick={() => setPanel("validation")}
          >
            <span>
              {t("图片化")} {renderCount}
            </span>
            <span>
              {t("降级")} {warnings.length}
            </span>
            <span
              className={
                errors.length + Object.keys(renderErrors).length
                  ? "text-error"
                  : ""
              }
            >
              {t("待修复")} {errors.length + Object.keys(renderErrors).length}
            </span>
            <CaretRight size={15} />
          </button>
        </section>
      </main>
      <footer className="statusbar">
        <button
          className={`save-indicator ${status}`}
          onClick={() =>
            status === "error" ? setPanel("export") : setPanel("history")
          }
          title={`${t("保存时间")}：${formatTime(article.updatedAt)}`}
        >
          <span className="status-dot" />
          {statusText}
        </button>
        <span className="export-state">
          {article.lastExportRevision
            ? `${t("上次生成下载")} r${article.lastExportRevision}`
            : t("尚未导出备份")}
        </span>
        <span className="word-count">
          {Array.from(article.body).length.toLocaleString()} {t("字符")} ·{" "}
          {conversion?.nodes.length ?? 0} {t("块")}
        </span>
        <span className="remote-state">{t("尚未创建 X 草稿")}</span>
      </footer>
      {error && (
        <div className="error-banner" role="alert">
          <WarningCircle size={19} />
          <span>{error}</span>
          {conflict && <button onClick={duplicate}>{t("另存副本")}</button>}
          <button
            className="icon-button"
            aria-label={t("关闭错误提示")}
            onClick={() => setError("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <CheckCircle size={18} />
          {notice}
        </div>
      )}
      {offline.update && (
        <div className="update-banner">
          {t("有新版本可用")}
          <button
            onClick={async () => {
              try {
                await flush();
                offline.update?.();
              } catch {
                setError(t("请先导出恢复包，再更新应用。"));
              }
            }}
          >
            {t("保存并更新")}
          </button>
        </div>
      )}
      <input
        hidden
        ref={fileInput}
        type="file"
        multiple
        accept=".md,.zip,image/png,image/jpeg,image/webp"
        onChange={(e) => {
          void importFiles(Array.from(e.target.files ?? []));
        }}
      />
      <input
        hidden
        ref={coverInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void addImage(f, true);
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void addImage(f);
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={associateInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void addImage(f, false, associatePath.current);
          e.target.value = "";
        }}
      />
      {panel === "validation" && (
        <Modal title={t("转换校验")} close={() => setPanel(null)}>
          <p className="dialog-intro">
            {t("只校验本地结构，不代表 X 已接受内容。点击问题可定位到源文。")}
          </p>
          <div className="report-counts">
            <span>
              {t("{count} 个正文块", { count: conversion?.nodes.length ?? 0 })}
            </span>
            <span>{t("{count} 项图片化", { count: renderCount })}</span>
            <span>{t("{count} 项降级", { count: warnings.length })}</span>
          </div>
          {issues.length ? (
            issues.map((i, k) => (
              <button
                className={`issue-row ${i.severity}`}
                key={`${i.code}-${k}`}
                onClick={() => {
                  setPanel(null);
                  setTab("source");
                  editor.current?.focusRange(i.from, i.to);
                }}
              >
                {i.severity === "error" ? (
                  <WarningCircle size={20} />
                ) : (
                  <CheckCircle size={20} />
                )}
                <span>
                  {localizeIssue(i.code, i.message, language)}
                  <small>
                    {t("第 {line} 行", { line: i.line })} · {i.code}
                  </small>
                </span>
                <CaretRight size={17} />
              </button>
            ))
          ) : (
            <div className="success-note">
              <CheckCircle size={24} />
              {t("当前本地结构未发现问题。")}
            </div>
          )}
          {Object.entries(renderErrors).map(([id, message]) => (
            <p className="text-error" key={id}>
              {message}
            </p>
          ))}
          <details className="json-details">
            <summary>{t("查看转换结构 JSON")}</summary>
            <pre>{JSON.stringify(conversion, null, 2)}</pre>
          </details>
        </Modal>
      )}
      {panel === "manual-x" && (
        <Modal title={t("手动发布到 X")} close={() => setPanel(null)}>
          <p className="dialog-intro">
            {t(
              "X 没有资源包导入入口。按下面顺序把标题、正文和图片放入 X Article 编辑器；你的内容不会由本站发送给 X。",
            )}
          </p>
          <ol className="publish-steps">
            <li>
              <strong>{t("打开 X Articles")}</strong>
              <span>
                {t("未登录时 X 会先显示登录页；登录后进入 Articles 页面。")}
              </span>
              <a
                className="secondary-button"
                href="https://x.com/compose/articles"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ArrowSquareOut size={17} />
                {t("打开 X Articles")}
              </a>
            </li>
            <li>
              <strong>{t("复制并粘贴标题")}</strong>
              <button
                className="secondary-button"
                disabled={copying || !article.title.trim()}
                onClick={() => copyForX("title")}
              >
                <Copy size={16} />
                复制标题
              </button>
            </li>
            <li>
              <strong>{t("复制并粘贴正文")}</strong>
              <span>{t("正文不含标题、封面和图片，粘贴后请检查格式。")}</span>
              <button
                className="primary-button"
                disabled={copying || !article.body.trim()}
                onClick={() => copyForX("body")}
              >
                <Copy size={16} />
                复制正文
              </button>
            </li>
            <li>
              <strong>{t("逐张插入图片")}</strong>
              <span>
                {t(
                  "表格、代码块和本地图片请在右侧预览中使用“复制图片”或“下载 PNG”。外链图床地址只能成为链接，不能替代 X 原生图片上传。",
                )}
              </span>
            </li>
          </ol>
          {copyFeedback && <p className="success-note">{copyFeedback}</p>}
        </Modal>
      )}
      {panel === "direct-x" && (
        <XPublishDialog
          article={article}
          conversion={conversion}
          close={() => setPanel(null)}
          onNotice={setNotice}
          onRequireAccount={() => setPanel("account")}
        />
      )}
      {panel === "account" && (
        <AccountDialog close={() => setPanel(null)} onNotice={setNotice} />
      )}
      {panel === "export" && (
        <Modal title={t("导出与备份")} close={() => !busy && setPanel(null)}>
          <p className="dialog-intro">
            {t(
              "导出当前版本的 Markdown、完整文稿、转换结构和图片。下载完成后可在其他浏览器导入恢复。",
            )}
          </p>
          <div className="export-preview">
            <FileText size={34} />
            <div>
              <strong>{article.title || "未命名文章"}</strong>
              <small>
                当前本地版本 r{article.revision} · {article.assets.length}{" "}
                项资源
              </small>
            </div>
          </div>
          <p className="privacy-note">
            <LockSimple size={18} />
            资源包包含原文与原图，原图可能含 EXIF 信息；分享前请检查。
          </p>
          {(errors.length > 0 || Object.keys(renderErrors).length > 0) && (
            <p className="text-error">
              存在未关联图片或出图问题，请修复后导出完整包；恢复包仍可保留当前源码。
            </p>
          )}
          <ul className="export-files">
            <li>
              article.md <span>可在其他编辑器继续写作</span>
            </li>
            <li>
              article.json <span>完整恢复真源</span>
            </li>
            <li>
              conversion.json / validation.json <span>转换结果与诊断</span>
            </li>
            <li>
              assets/ + manifest.json <span>原图、派生图与哈希清单</span>
            </li>
          </ul>
          <div className="secondary-exports">
            <button
              onClick={() => {
                downloadBlob(
                  new Blob([`# ${article.title}\n\n${article.body}`], {
                    type: "text/markdown;charset=utf-8",
                  }),
                  `${safeFilename(article.title)}.md`,
                );
                setNotice("已生成 Markdown 下载；图片不包含在单文件中");
              }}
            >
              仅 Markdown
            </button>
            <button
              onClick={() =>
                downloadBlob(
                  new Blob([JSON.stringify(conversion, null, 2)], {
                    type: "application/json",
                  }),
                  "conversion.json",
                )
              }
            >
              转换 JSON
            </button>
            <button onClick={() => doExport(true)} disabled={busy}>
              导出恢复包
            </button>
          </div>
          <button
            className="primary-button wide"
            disabled={
              busy || errors.length > 0 || Object.keys(renderErrors).length > 0
            }
            onClick={() => doExport()}
          >
            {busy ? "正在生成并校验资源包…" : "导出完整资源包"}
          </button>
          <p className="fine-print">
            生成下载不等于文件已经落盘。请检查下载结果，重要文稿建议重新导入自检。
          </p>
        </Modal>
      )}
      {panel === "history" && (
        <Modal title={t("本地历史版本")} close={() => setPanel(null)}>
          <p className="dialog-intro">
            恢复会创建新版本，不覆盖历史。最近 24 小时保留细粒度记录，之后按 5
            分钟压缩保留 30 天；命名与导入快照保留。
          </p>
          <button
            className="secondary-button"
            onClick={async () => {
              try {
                const a = await flush();
                if (a) {
                  const s = await saveArticle(a, a.revision, "手动快照");
                  load(s);
                  await refresh();
                  setNotice("已建立保留快照");
                }
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            建立保留快照
          </button>
          <div className="history-list">
            {snapshots.map((s) => (
              <button
                className={`history-row ${selectedSnapshot?.id === s.id ? "selected" : ""}`}
                key={s.id}
                onClick={() => setSelectedSnapshot(s)}
              >
                <ClockCounterClockwise size={18} />
                <span>
                  r{s.revision} · {formatTime(s.at)}
                  <small>
                    {s.reason}
                    {s.pinned ? " · 保留" : ""}
                  </small>
                </span>
                <CaretRight size={16} />
              </button>
            ))}
          </div>
          {selectedSnapshot && (
            <div className="snapshot-preview">
              <h3>{selectedSnapshot.article.title || "未命名文章"}</h3>
              <pre>{selectedSnapshot.article.body}</pre>
              <button
                className="primary-button"
                onClick={() => restore(selectedSnapshot)}
              >
                恢复为新版本
              </button>
            </div>
          )}
        </Modal>
      )}
      {panel === "assets" && (
        <Modal title={t("图片与资源")} close={() => setPanel(null)}>
          <p className="dialog-intro">
            图片保存在本地。修改说明不会自动上传到
            X；切换界面主题不会改写原图或派生图片。
          </p>
          <button
            className="secondary-button"
            onClick={() => imageInput.current?.click()}
          >
            插入正文图片
          </button>
          {conversion?.nodes
            .filter((n) => n.kind === "image" && !n.assetId)
            .map(
              (n) =>
                n.kind === "image" && (
                  <div className="missing-resource" key={n.id}>
                    <WarningCircle />
                    {n.path}
                    <button
                      onClick={() => {
                        associatePath.current = n.path ?? "";
                        associateInput.current?.click();
                      }}
                    >
                      关联本地文件
                    </button>
                  </div>
                ),
            )}
          {article.assets.map((a) => (
            <div className="asset-row" key={a.id}>
              <AssetImage id={a.id} alt={a.alt || a.filename} />
              <div>
                <strong>{a.filename}</strong>
                <small>
                  {a.width} × {a.height} · {(a.byteLength / 1024).toFixed(0)} KB
                  {a.id === article.coverId ? " · 封面" : ""}
                </small>
                <label>
                  图片说明
                  <input
                    value={a.alt}
                    onChange={(e) => updateAsset(a.id, { alt: e.target.value })}
                    placeholder="用文字描述图片内容"
                  />
                </label>
                <label>
                  图注
                  <input
                    value={a.caption}
                    onChange={(e) =>
                      updateAsset(a.id, { caption: e.target.value })
                    }
                    placeholder="可选的可见图注"
                  />
                </label>
              </div>
            </div>
          ))}
          {article.coverId && (
            <button
              className="secondary-button"
              onClick={() => edit({ coverId: undefined })}
            >
              移除封面引用（保留原图）
            </button>
          )}
        </Modal>
      )}
      {panel === "menu" && (
        <Modal title={t("文稿操作")} close={() => setPanel(null)}>
          <button className="menu-row" onClick={duplicate}>
            另存为副本 <CaretRight />
          </button>
          {article.archived || article.deletedAt ? (
            <button
              className="menu-row"
              onClick={() => setLifecycle("restore")}
            >
              恢复到文稿库 <ArrowCounterClockwise />
            </button>
          ) : (
            <>
              <button
                className="menu-row"
                onClick={() => setLifecycle("archive")}
              >
                归档文稿 <CaretRight />
              </button>
              <button
                className="menu-row"
                onClick={() => setLifecycle("trash")}
              >
                移入回收站（可以恢复）
                <CaretRight />
              </button>
            </>
          )}
          <p className="fine-print">此版本不会自动永久清理文稿或图片。</p>
        </Modal>
      )}
      {panel === "about" && (
        <Modal title={t("关于与本地存储")} close={() => setPanel(null)}>
          <div className="about-brand">
            <FileText size={38} />
            <h3>ACKS X Article Editor</h3>
          </div>
          <p>
            离线优先的 Markdown
            写作台。文稿与图片只保存在当前浏览器；服务器仅提供应用文件，无稿件上传接口。
          </p>
          <dl className="storage-stats">
            <dt>当前版本</dt>
            <dd>{APP_VERSION} · 离线核心预览版</dd>
            <dt>离线资源</dt>
            <dd>
              {offline.ready ? "已缓存，可断网使用" : "等待应用资源缓存完成"}
            </dd>
            <dt>持久化权限</dt>
            <dd>
              {storage.persistent
                ? "已获准（用户清理仍会删除数据）"
                : "未获准，建议经常导出备份"}
            </dd>
            <dt>估计使用空间</dt>
            <dd>{((storage.usage ?? 0) / 1024 / 1024).toFixed(1)} MiB</dd>
          </dl>
          <button
            className="secondary-button"
            onClick={async () => {
              const persistent = await navigator.storage?.persist();
              setStorage((s) => ({ ...s, persistent }));
              setNotice(
                persistent
                  ? "浏览器已授予持久化存储"
                  : "浏览器暂未授予权限，请保留外部备份",
              );
            }}
          >
            申请持久化存储
          </button>
          <p className="privacy-note">
            不同浏览器、设备和域名之间不会自动同步。清除站点数据会删除本地稿件，请先导出资源包。
          </p>
          <p className="fine-print">
            当前不提供 X
            登录、媒体上传或发布。那些功能需要独立的账户授权与真实接口验证。
          </p>
        </Modal>
      )}
    </div>
  );
}
