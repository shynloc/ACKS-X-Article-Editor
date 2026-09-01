import { describe, expect, it } from "vitest";
import {
  inlineFormat,
  lineFormat,
  listEnterPlan,
  tableBlock,
} from "../src/core/editorFormatting";

describe("Markdown 编辑命令", () => {
  it("按真实顺序写入有序列表源文", () => {
    const source = "第一项\n第二项\n第三项";
    expect(lineFormat(source, 0, source.length, { type: "ordered" }).text).toBe(
      "1. 第一项\n2. 第二项\n3. 第三项",
    );
  });

  it("有序列表回车时修正当前项、后续项并插入下一编号", () => {
    const source = "1. 第一项\n1. 第二项\n1. 第四项";
    const offset = source.indexOf("\n1. 第四项");
    const plan = listEnterPlan(source, offset);
    expect(plan?.insert).toBe("1. 第一项\n2. 第二项\n3. \n4. 第四项");
    expect(plan?.anchor).toBe("1. 第一项\n2. 第二项\n3. ".length);
  });

  it("空列表项回车退出列表", () => {
    const ordered = "1. 第一项\n2. ";
    expect(listEnterPlan(ordered, ordered.length)?.insert).toBe("1. 第一项\n");
    const bullet = "- 第一项\n- ";
    expect(listEnterPlan(bullet, bullet.length)?.insert).toBe("- 第一项\n");
  });

  it("无序和任务列表继续使用相同标记", () => {
    const bullet = "* 第一项";
    expect(listEnterPlan(bullet, bullet.length)?.insert).toBe("* 第一项\n* ");
    const task = "- [x] 完成";
    expect(listEnterPlan(task, task.length)?.insert).toBe("- [x] 完成\n- [ ] ");
  });

  it("重复点击成对行内格式可解除格式", () => {
    const first = inlineFormat("文字", 0, 2, "**");
    expect(first.text).toBe("**文字**");
    expect(inlineFormat(first.text, first.from, first.to, "**").text).toBe(
      "文字",
    );
  });

  it("表格的源文列数和行数可控", () => {
    const table = tableBlock(4, 2).split("\n");
    expect(table).toHaveLength(5);
    expect(table[0]).toBe("| 标题 1 | 标题 2 |");
  });
});
