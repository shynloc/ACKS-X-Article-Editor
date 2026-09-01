import type { RefObject } from "react";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  BracketsCurly,
  CheckSquare,
  Code,
  FileCode,
  Function,
  HighlighterCircle,
  Image,
  Link,
  ListBullets,
  ListNumbers,
  MathOperations,
  Minus,
  Quotes,
  Table,
  TextB,
  TextHFive,
  TextHFour,
  TextHOne,
  TextHSix,
  TextHThree,
  TextHTwo,
  TextItalic,
  TextStrikethrough,
  TextSubscript,
  TextSuperscript,
  TextUnderline,
  TreeStructure,
  WaveSine,
} from "@phosphor-icons/react";
import type { EditorHandle } from "./MarkdownEditor";

function Tool({
  label,
  action,
  children,
}: {
  label: string;
  action: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="markdown-tool"
      aria-label={label}
      title={label}
      onClick={action}
    >
      {children}
    </button>
  );
}
function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="markdown-tool-group" role="group" aria-label={label}>
      {children}
    </div>
  );
}
export function MarkdownToolbar({
  editor,
  onImage,
}: {
  editor: RefObject<EditorHandle | null>;
  onImage: () => void;
}) {
  const command = (run: (handle: EditorHandle) => void) => () => {
    if (editor.current) run(editor.current);
  };
  return (
    <div
      className="markdown-toolbar"
      role="toolbar"
      aria-label="Markdown 格式工具栏"
    >
      <Group label="撤销与重做">
        <Tool label="撤销 (⌘Z)" action={command((e) => e.undo())}>
          <ArrowCounterClockwise />
        </Tool>
        <Tool label="重做 (⇧⌘Z)" action={command((e) => e.redo())}>
          <ArrowClockwise />
        </Tool>
      </Group>
      <Group label="标题">
        <Tool
          label="一级标题"
          action={command((e) => e.line({ type: "heading", level: 1 }))}
        >
          <TextHOne />
        </Tool>
        <Tool
          label="二级标题"
          action={command((e) => e.line({ type: "heading", level: 2 }))}
        >
          <TextHTwo />
        </Tool>
        <Tool
          label="三级标题"
          action={command((e) => e.line({ type: "heading", level: 3 }))}
        >
          <TextHThree />
        </Tool>
        <Tool
          label="四级标题"
          action={command((e) => e.line({ type: "heading", level: 4 }))}
        >
          <TextHFour />
        </Tool>
        <Tool
          label="五级标题"
          action={command((e) => e.line({ type: "heading", level: 5 }))}
        >
          <TextHFive />
        </Tool>
        <Tool
          label="六级标题"
          action={command((e) => e.line({ type: "heading", level: 6 }))}
        >
          <TextHSix />
        </Tool>
      </Group>
      <Group label="文字样式">
        <Tool
          label="加粗"
          action={command((e) => e.inline("**", undefined, "粗体文字"))}
        >
          <TextB />
        </Tool>
        <Tool
          label="斜体"
          action={command((e) => e.inline("*", undefined, "斜体文字"))}
        >
          <TextItalic />
        </Tool>
        <Tool
          label="删除线"
          action={command((e) => e.inline("~~", undefined, "删除文字"))}
        >
          <TextStrikethrough />
        </Tool>
        <Tool
          label="下划线（X 将降级为普通文字）"
          action={command((e) => e.inline("<u>", "</u>", "下划线文字"))}
        >
          <TextUnderline />
        </Tool>
        <Tool
          label="高亮（X 将降级为普通文字）"
          action={command((e) => e.inline("<mark>", "</mark>", "重点文字"))}
        >
          <HighlighterCircle />
        </Tool>
        <Tool
          label="波浪线（X 将降级为普通文字）"
          action={command((e) =>
            e.inline('<span data-md-wavy="true">', "</span>", "波浪线文字"),
          )}
        >
          <WaveSine />
        </Tool>
        <Tool
          label="上标（X 将降级为普通文字）"
          action={command((e) => e.inline("<sup>", "</sup>", "上标"))}
        >
          <TextSuperscript />
        </Tool>
        <Tool
          label="下标（X 将降级为普通文字）"
          action={command((e) => e.inline("<sub>", "</sub>", "下标"))}
        >
          <TextSubscript />
        </Tool>
      </Group>
      <Group label="列表与引用">
        <Tool
          label="无序列表"
          action={command((e) => e.line({ type: "bullet" }))}
        >
          <ListBullets />
        </Tool>
        <Tool
          label="有序列表"
          action={command((e) => e.line({ type: "ordered" }))}
        >
          <ListNumbers />
        </Tool>
        <Tool
          label="任务列表"
          action={command((e) => e.line({ type: "task" }))}
        >
          <CheckSquare />
        </Tool>
        <Tool label="引用" action={command((e) => e.line({ type: "quote" }))}>
          <Quotes />
        </Tool>
      </Group>
      <Group label="插入内容">
        <Tool label="链接" action={command((e) => e.link())}>
          <Link />
        </Tool>
        <Tool label="插入本地图片" action={onImage}>
          <Image />
        </Tool>
        <Tool label="表格" action={command((e) => e.table())}>
          <Table />
        </Tool>
        <Tool
          label="行内代码"
          action={command((e) => e.inline("`", undefined, "代码"))}
        >
          <Code />
        </Tool>
        <Tool
          label="代码块"
          action={command((e) => e.block("```\n", "\n```", "代码"))}
        >
          <FileCode />
        </Tool>
        <Tool
          label="水平分隔线"
          action={command((e) => e.block("---\n", "", ""))}
        >
          <Minus />
        </Tool>
        <Tool label="脚注" action={command((e) => e.footnote())}>
          <BracketsCurly />
        </Tool>
        <Tool label="硬换行" action={command((e) => e.insert("  \n"))}>
          <TreeStructure />
        </Tool>
      </Group>
      <Group label="扩展语法">
        <Tool
          label="行内公式（X 将图片化）"
          action={command((e) => e.inline("$", undefined, "E = mc^2"))}
        >
          <Function />
        </Tool>
        <Tool
          label="公式块（X 将图片化）"
          action={command((e) => e.block("$$\n", "\n$$", "E = mc^2"))}
        >
          <MathOperations />
        </Tool>
        <Tool
          label="Mermaid 图表（X 将图片化）"
          action={command((e) =>
            e.block("```mermaid\n", "\n```", "graph TD\n  A --> B"),
          )}
        >
          <TreeStructure />
        </Tool>
      </Group>
    </div>
  );
}
