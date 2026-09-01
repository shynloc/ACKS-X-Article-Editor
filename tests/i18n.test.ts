import { describe, expect, it } from "vitest";
import { localizeIssue, translate } from "../src/i18n";

describe("interface localization", () => {
  it("translates interface labels and variables", () => {
    expect(translate("直接发布到 X", "en")).toBe("Publish directly to X");
    expect(
      translate("体验额度：剩余 {remaining} / {limit} 次", "en", {
        remaining: 1,
        limit: 2,
      }),
    ).toBe("Trial quota: 1 of 2 workflows remaining");
  });
  it("keeps Chinese UI and user-authored content unchanged when appropriate", () => {
    expect(translate("账号", "zh-CN")).toBe("账号");
    expect(translate("用户自己的 Markdown", "en")).toBe("用户自己的 Markdown");
  });
  it("localizes converter diagnostics by stable issue code", () => {
    expect(localizeIssue("TABLE_IMAGE", "表格将作为图片。", "en")).toContain(
      "published as an image",
    );
  });
});
