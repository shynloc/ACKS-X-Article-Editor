import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, placeholder } from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo,
  undo,
} from "@codemirror/commands";
import {
  insertNewlineContinueMarkup,
  markdown,
  markdownKeymap,
} from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import type { Theme } from "../core/types";
import {
  inlineFormat,
  insertBlock,
  lineFormat,
  listEnterPlan,
  tableBlock,
  type LineStyle,
  type TextTransform,
} from "../core/editorFormatting";

export interface EditorHandle {
  insert(text: string): void;
  focusRange(from: number, to: number): void;
  focus(): void;
  undo(): void;
  redo(): void;
  inline(open: string, close?: string, placeholder?: string): void;
  line(style: LineStyle): void;
  block(before: string, after: string, placeholder?: string): void;
  link(url?: string, label?: string): void;
  table(rows?: number, columns?: number): void;
  footnote(): void;
}

function minimalChange(before: string, after: string) {
  let from = 0;
  while (from < before.length && before[from] === after[from]) from++;
  let beforeEnd = before.length,
    afterEnd = after.length;
  while (
    beforeEnd > from &&
    afterEnd > from &&
    before[beforeEnd - 1] === after[afterEnd - 1]
  ) {
    beforeEnd--;
    afterEnd--;
  }
  return { from, to: beforeEnd, insert: after.slice(from, afterEnd) };
}

export const MarkdownEditor = forwardRef<
  EditorHandle,
  {
    value: string;
    onChange: (value: string) => void;
    theme: Theme;
    readOnly?: boolean;
    onImage: (file: File) => void;
  }
>(({ value, onChange, theme, readOnly, onImage }, ref) => {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | undefined>(undefined),
    callbacks = useRef({ onChange, onImage });
  const themeConfig = useRef(new Compartment()),
    readConfig = useRef(new Compartment());
  callbacks.current = { onChange, onImage };
  const apply = (
    transform: (text: string, from: number, to: number) => TextTransform,
  ) => {
    const current = view.current;
    if (!current) return;
    const selection = current.state.selection.main,
      before = current.state.doc.toString();
    const result = transform(before, selection.from, selection.to),
      change = minimalChange(before, result.text);
    current.dispatch({
      changes: change,
      selection: EditorSelection.range(result.from, result.to),
      scrollIntoView: true,
    });
    current.focus();
  };
  useImperativeHandle(
    ref,
    () => ({
      insert(text) {
        const current = view.current;
        if (!current) return;
        current.dispatch(current.state.replaceSelection(text));
        current.focus();
      },
      focusRange(from, to) {
        const current = view.current;
        if (!current) return;
        const start = Math.min(from, current.state.doc.length),
          end = Math.min(to, current.state.doc.length);
        current.dispatch({
          selection: EditorSelection.range(start, end),
          effects: EditorView.scrollIntoView(start, { y: "center" }),
        });
        current.focus();
      },
      focus() {
        view.current?.focus();
      },
      undo() {
        if (view.current) undo(view.current);
      },
      redo() {
        if (view.current) redo(view.current);
      },
      inline(open, close, text) {
        apply((doc, from, to) =>
          inlineFormat(doc, from, to, open, close, text),
        );
      },
      line(style) {
        apply((doc, from, to) => lineFormat(doc, from, to, style));
      },
      block(before, after, text) {
        apply((doc, from, to) =>
          insertBlock(doc, from, to, before, after, text),
        );
      },
      link(url = "https://", label) {
        apply((doc, from, to) => {
          const selected = doc.slice(from, to) || label || "链接文字",
            insert = `[${selected}](${url})`,
            urlStart = from + selected.length + 3;
          return {
            text: doc.slice(0, from) + insert + doc.slice(to),
            from: url === "https://" ? urlStart : from + 1,
            to:
              url === "https://"
                ? urlStart + url.length
                : from + 1 + selected.length,
          };
        });
      },
      table(rows = 3, columns = 3) {
        apply((doc, from, to) =>
          insertBlock(doc, from, to, "", "", tableBlock(rows, columns)),
        );
      },
      footnote() {
        apply((doc, from, to) => {
          let index = 1;
          while (doc.includes(`[^${index}]`)) index++;
          const reference = `[^${index}]`,
            selected = doc.slice(from, to),
            suffix = `${doc.endsWith("\n") ? "\n" : "\n\n"}[^${index}]: 注释内容`,
            body = selected ? `${selected}${reference}` : reference,
            next = doc.slice(0, from) + body + doc.slice(to) + suffix,
            noteStart = next.length - "注释内容".length;
          return { text: next, from: noteStart, to: next.length };
        });
      },
    }),
    [],
  );
  useEffect(() => {
    const continueList = (editorView: EditorView) => {
      const selection = editorView.state.selection.main;
      if (!selection.empty) return false;
      const before = editorView.state.doc.toString(),
        plan = listEnterPlan(before, selection.head);
      if (!plan) return insertNewlineContinueMarkup(editorView);
      editorView.dispatch({
        changes: minimalChange(before, plan.insert),
        selection: EditorSelection.cursor(plan.anchor),
        scrollIntoView: true,
      });
      return true;
    };
    const editorView = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([
            { key: "Enter", run: continueList },
            ...markdownKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          markdown(),
          EditorView.lineWrapping,
          placeholder("从一个想法开始…\n\n支持 Markdown，也可以拖入本地图片。"),
          syntaxHighlighting(
            HighlightStyle.define([
              {
                tag: [tags.heading, tags.processingInstruction],
                color: "var(--accent)",
                fontWeight: "600",
              },
              { tag: tags.strong, fontWeight: "700" },
              { tag: tags.emphasis, fontStyle: "italic" },
              { tag: tags.link, color: "var(--accent)" },
              { tag: tags.monospace, color: "var(--code)" },
            ]),
          ),
          themeConfig.current.of(
            EditorView.theme({}, { dark: theme === "dark" }),
          ),
          readConfig.current.of(EditorState.readOnly.of(!!readOnly)),
          EditorView.contentAttributes.of({
            "aria-label": "Markdown 正文",
            "data-testid": "markdown-input",
            spellcheck: "false",
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              callbacks.current.onChange(update.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            paste(event) {
              const image = Array.from(event.clipboardData?.files ?? []).find(
                (file) => file.type.startsWith("image/"),
              );
              if (!image) return false;
              event.preventDefault();
              callbacks.current.onImage(image);
              return true;
            },
            drop(event) {
              const image = Array.from(event.dataTransfer?.files ?? []).find(
                (file) => file.type.startsWith("image/"),
              );
              if (!image) return false;
              event.preventDefault();
              callbacks.current.onImage(image);
              return true;
            },
          }),
        ],
      }),
    });
    view.current = editorView;
    return () => {
      editorView.destroy();
      view.current = undefined;
    };
  }, []);
  useEffect(() => {
    const current = view.current;
    if (current && value !== current.state.doc.toString())
      current.dispatch({
        changes: { from: 0, to: current.state.doc.length, insert: value },
      });
  }, [value]);
  useEffect(() => {
    view.current?.dispatch({
      effects: themeConfig.current.reconfigure(
        EditorView.theme({}, { dark: theme === "dark" }),
      ),
    });
  }, [theme]);
  useEffect(() => {
    view.current?.dispatch({
      effects: readConfig.current.reconfigure(
        EditorState.readOnly.of(!!readOnly),
      ),
    });
  }, [readOnly]);
  return <div className="markdown-editor" ref={host} />;
});
