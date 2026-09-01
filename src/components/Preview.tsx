import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowSquareOut,
  ImageSquare,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  safeFilename,
  type Article,
  type Conversion,
  type TextNode,
  type RenderNode,
  type RenderedPart,
  type ImageNode,
} from "../core/types";
import { db } from "../services/database";
import { getRenderParts } from "../services/archive";
import { ImageTransfer } from "./ImageTransfer";
import { useI18n } from "../i18n";
export function useAssetUrl(id?: string) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true,
      created = "";
    setUrl("");
    if (id)
      db.assets.get(id).then((a) => {
        if (active && a) {
          created = URL.createObjectURL(a.blob);
          setUrl(created);
        }
      });
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [id]);
  return url;
}
export function AssetImage({
  id,
  alt,
  className,
}: {
  id: string;
  alt: string;
  className?: string;
}) {
  const url = useAssetUrl(id);
  return url ? (
    <img src={url} alt={alt} className={className} loading="lazy" />
  ) : (
    <div className="image-missing">
      <ImageSquare size={24} />
      图片资源无法读取
    </div>
  );
}
function RichText({ node }: { node: TextNode }) {
  const points = [
    ...new Set([
      0,
      node.text.length,
      ...node.spans.flatMap((s) => [s.offset, s.offset + s.length]),
    ]),
  ].sort((a, b) => a - b);
  return (
    <>
      {points.slice(0, -1).map((from, i) => {
        const to = points[i + 1],
          active = node.spans.filter(
            (s) => s.offset <= from && s.offset + s.length >= to,
          );
        let part: ReactNode = node.text.slice(from, to);
        if (active.some((s) => s.style === "bold"))
          part = <strong>{part}</strong>;
        if (active.some((s) => s.style === "italic")) part = <em>{part}</em>;
        if (active.some((s) => s.style === "strikethrough"))
          part = <s>{part}</s>;
        const link = active.find((s) => s.url);
        if (link)
          part = (
            <a href={link.url} target="_blank" rel="noopener noreferrer">
              {part}
            </a>
          );
        return <span key={from}>{part}</span>;
      })}
    </>
  );
}
function GeneratedImage({
  node,
  article,
  onError,
  ordinal,
}: {
  node: RenderNode;
  article: Article;
  onError: (id: string, message?: string) => void;
  ordinal: number;
}) {
  const { t } = useI18n();
  const [urls, setUrls] = useState<string[]>([]),
    [parts, setParts] = useState<RenderedPart[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const created: string[] = [];
    setUrls([]);
    setParts([]);
    setError("");
    getRenderParts(node, article)
      .then((parts) => {
        if (!active) return;
        for (const p of parts) created.push(URL.createObjectURL(p.blob));
        setUrls([...created]);
        setParts(parts);
        onError(node.id);
      })
      .catch((e) => {
        if (active) {
          const message = e instanceof Error ? e.message : "图片生成失败";
          setError(message);
          onError(node.id, message);
        }
      });
    return () => {
      active = false;
      created.forEach(URL.revokeObjectURL);
    };
  }, [node.source, node.lang, node.renderKind, article.id]);
  return (
    <figure className="generated-figure">
      {error ? (
        <div className="image-missing">
          <WarningCircle />
          {error}
        </div>
      ) : urls.length ? (
        urls.map((url, i) => (
          <div className="generated-part" key={url}>
            <img
              src={url}
              alt={`${node.renderKind === "table" ? "表格" : "代码"}图片，第 ${i + 1} 部分`}
              loading="lazy"
            />
            <ImageTransfer
              label={`图片 ${ordinal} · ${node.renderKind === "table" ? "表格" : "代码"}${urls.length > 1 ? ` · ${i + 1}/${urls.length}` : ""}`}
              filename={`${safeFilename(article.title)}-图片${ordinal}-${i + 1}.png`}
              getBlob={() => parts[i].blob}
              disabled={!parts[i]}
            />
          </div>
        ))
      ) : (
        <div className="render-pending">{t("正在本地生成图片…")}</div>
      )}
      <figcaption>
        <span className="conversion-badge">{t("将作为图片")}</span>
        {urls.length > 1 && <small>{urls.length} 张分片</small>}
        <details>
          <summary>
            {t("查看原始{kind}", {
              kind: t(node.renderKind === "table" ? "表格" : "代码"),
            })}
          </summary>
          <pre>{node.source}</pre>
        </details>
      </figcaption>
    </figure>
  );
}
function LocalImageFigure({
  node,
  article,
  ordinal,
  onLocate,
}: {
  node: ImageNode;
  article: Article;
  ordinal: number;
  onLocate: (from: number, to: number) => void;
}) {
  const { t } = useI18n();
  const asset = article.assets.find((a) => a.id === node.assetId),
    caption = node.caption || asset?.caption;
  return (
    <figure>
      {node.assetId ? (
        <>
          <AssetImage
            id={node.assetId}
            alt={node.alt || asset?.alt || "正文图片"}
          />
          <ImageTransfer
            label={`图片 ${ordinal} · 正文图`}
            filename={`${safeFilename(article.title)}-图片${ordinal}.png`}
            getBlob={async () => {
              const stored = await db.assets.get(node.assetId!);
              if (!stored) throw new Error("图片资源不存在，请重新关联。");
              return stored.blob;
            }}
          />
        </>
      ) : (
        <button
          className="image-missing"
          onClick={() => onLocate(node.from, node.to)}
        >
          <ImageSquare size={28} />
          {t("缺少图片")}：{node.path}
          <small>{t("在资源管理中重新关联本地文件")}</small>
        </button>
      )}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
export function Preview({
  article,
  conversion,
  onError,
  onLocate,
}: {
  article: Article;
  conversion: Conversion | null;
  onError: (id: string, message?: string) => void;
  onLocate: (from: number, to: number) => void;
}) {
  const elements: ReactNode[] = [];
  const nodes = conversion?.nodes ?? [];
  let imageOrdinal = 0;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.kind === "text") {
      if (n.type === "ordered-list-item" || n.type === "unordered-list-item") {
        const items: ReactNode[] = [];
        let j = i;
        while (
          j < nodes.length &&
          nodes[j].kind === "text" &&
          (nodes[j] as TextNode).type === n.type
        ) {
          const item = nodes[j] as TextNode;
          items.push(
            <li key={item.id}>
              <RichText node={item} />
            </li>,
          );
          j++;
        }
        i = j - 1;
        elements.push(
          n.type === "ordered-list-item" ? (
            <ol key={n.id}>{items}</ol>
          ) : (
            <ul key={n.id}>{items}</ul>
          ),
        );
      } else {
        const content = <RichText node={n} />;
        elements.push(
          n.type === "header-two" ? (
            <h2 key={n.id}>{content}</h2>
          ) : n.type === "blockquote" ? (
            <blockquote key={n.id}>{content}</blockquote>
          ) : (
            <p key={n.id} dir="auto">
              {content}
            </p>
          ),
        );
      }
    } else if (n.kind === "image")
      elements.push(
        <LocalImageFigure
          key={n.id}
          node={n}
          article={article}
          ordinal={++imageOrdinal}
          onLocate={onLocate}
        />,
      );
    else if (n.kind === "render")
      elements.push(
        <GeneratedImage
          key={n.id}
          node={n}
          article={article}
          onError={onError}
          ordinal={++imageOrdinal}
        />,
      );
    else if (n.kind === "divider") elements.push(<hr key={n.id} />);
    else
      elements.push(
        <div className="post-placeholder" key={n.id}>
          <small>嵌帖 · 离线占位</small>
          <p>帖子 {n.postId}</p>
          <a
            href={`https://x.com/i/status/${n.postId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            在 X 打开 <ArrowSquareOut size={14} />
          </a>
        </div>,
      );
  }
  return (
    <article className="article-preview" data-testid="article-preview">
      {article.coverId && (
        <AssetImage
          id={article.coverId}
          alt={
            article.assets.find((a) => a.id === article.coverId)?.alt ||
            "文章封面"
          }
          className="article-cover"
        />
      )}
      <div className="article-body">
        <div className="article-eyebrow">离线写作 · 本地文稿</div>
        <h1 dir="auto">{article.title || "未命名文章"}</h1>
        {elements.length ? (
          elements
        ) : (
          <p className="empty-copy">你的想法，会在这里成为文章。</p>
        )}
      </div>
    </article>
  );
}
