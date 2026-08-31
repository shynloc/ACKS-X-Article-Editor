import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowSquareOut,
  ImageSquare,
  WarningCircle,
} from "@phosphor-icons/react";
import type { Article, Conversion, TextNode, RenderNode } from "../core/types";
import { db } from "../services/database";
import { getRenderParts } from "../services/archive";
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
}: {
  node: RenderNode;
  article: Article;
  onError: (id: string, message?: string) => void;
}) {
  const [urls, setUrls] = useState<string[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const created: string[] = [];
    setUrls([]);
    setError("");
    getRenderParts(node, article)
      .then((parts) => {
        if (!active) return;
        for (const p of parts) created.push(URL.createObjectURL(p.blob));
        setUrls([...created]);
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
          <img
            key={url}
            src={url}
            alt={`${node.renderKind === "table" ? "表格" : "代码"}图片，第 ${i + 1} 部分`}
            loading="lazy"
          />
        ))
      ) : (
        <div className="render-pending">正在本地生成图片…</div>
      )}
      <figcaption>
        <span className="conversion-badge">将作为图片</span>
        {urls.length > 1 && <small>{urls.length} 张分片</small>}
        <details>
          <summary>
            查看原始{node.renderKind === "table" ? "表格" : "代码"}
          </summary>
          <pre>{node.source}</pre>
        </details>
      </figcaption>
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
        <figure key={n.id}>
          {n.assetId ? (
            <AssetImage
              id={n.assetId}
              alt={
                n.alt ||
                article.assets.find((a) => a.id === n.assetId)?.alt ||
                "正文图片"
              }
            />
          ) : (
            <button
              className="image-missing"
              onClick={() => onLocate(n.from, n.to)}
            >
              <ImageSquare size={28} />
              缺少图片：{n.path}
              <small>在资源管理中重新关联本地文件</small>
            </button>
          )}
          {n.caption && <figcaption>{n.caption}</figcaption>}
        </figure>,
      );
    else if (n.kind === "render")
      elements.push(
        <GeneratedImage
          key={n.id}
          node={n}
          article={article}
          onError={onError}
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
