import { describe, expect, it } from "vitest";
import {
  INTRO_ARCHITECTURE_PLACEHOLDER,
  INTRO_ARTICLE_BODY,
  INTRO_ARTICLE_TITLE,
} from "../src/core/introArticle";
import { convert } from "../src/core/convert";
import { newArticle } from "../src/core/types";
import { validateConversion } from "../src/core/validate";

describe("项目介绍文章模板", () => {
  it("覆盖编辑器能力并能生成无阻断错误的 X 结构", () => {
    const assetId = "intro-architecture-test";
    const body = INTRO_ARTICLE_BODY.replace(
      INTRO_ARCHITECTURE_PLACEHOLDER,
      assetId,
    );
    const article = newArticle(INTRO_ARTICLE_TITLE, body);
    article.assets = [
      {
        id: assetId,
        kind: "image",
        mime: "image/webp",
        filename: "architecture.webp",
        byteLength: 100,
        sha256: "a".repeat(64),
        width: 1600,
        height: 900,
        alt: "架构图",
        caption: "",
      },
    ];
    const conversion = convert(body);
    const errors = validateConversion(article, conversion).filter(
      (issue) => issue.severity === "error",
    );
    expect(errors).toEqual([]);
    expect(conversion.nodes.some((node) => node.kind === "image")).toBe(true);
    expect(
      conversion.nodes.filter((node) => node.kind === "render").length,
    ).toBeGreaterThanOrEqual(4);
    expect(body).toContain("**ACKS X Article Editor**");
    expect(body).toContain("- [x]");
    expect(body).toContain("[^1]");
    expect(body.length).toBeGreaterThan(4000);
  });
});
