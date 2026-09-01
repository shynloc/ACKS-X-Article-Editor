import source from "../../docs/INTRO_ARTICLE.md?raw";

export const INTRO_ARTICLE_ID = "acks-x-article-editor-intro-v1";
export const INTRO_ARTICLE_TITLE =
  "把 Markdown 写作者带回 X Article：我做了一个本地优先的长文编辑器";
export const INTRO_ARTICLE_BODY = source.replace(/^# .*\r?\n+/, "");
export const INTRO_ARCHITECTURE_PLACEHOLDER = "__ARCHITECTURE_ASSET__";
