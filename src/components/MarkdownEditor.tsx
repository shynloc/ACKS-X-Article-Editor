import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { EditorState, Compartment, EditorSelection } from "@codemirror/state";
import { EditorView, lineNumbers, keymap, placeholder } from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import type { Theme } from "../core/types";
export interface EditorHandle {
  insert(text: string): void;
  focusRange(from: number, to: number): void;
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
    callbacks = useRef({ onChange, onImage }),
    themeConfig = useRef(new Compartment()),
    readConfig = useRef(new Compartment());
  callbacks.current = { onChange, onImage };
  useImperativeHandle(
    ref,
    () => ({
      insert(text) {
        const v = view.current;
        if (!v) return;
        v.dispatch(v.state.replaceSelection(text));
        v.focus();
      },
      focusRange(from, to) {
        const v = view.current;
        if (!v) return;
        const start = Math.min(from, v.state.doc.length),
          end = Math.min(to, v.state.doc.length);
        v.dispatch({
          selection: EditorSelection.range(start, end),
          effects: EditorView.scrollIntoView(start, { y: "center" }),
        });
        v.focus();
      },
    }),
    [],
  );
  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
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
                (f) => f.type.startsWith("image/"),
              );
              if (image) {
                event.preventDefault();
                callbacks.current.onImage(image);
                return true;
              }
              return false;
            },
            drop(event) {
              const image = Array.from(event.dataTransfer?.files ?? []).find(
                (f) => f.type.startsWith("image/"),
              );
              if (image) {
                event.preventDefault();
                callbacks.current.onImage(image);
                return true;
              }
              return false;
            },
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = undefined;
    };
  }, []);
  useEffect(() => {
    const v = view.current;
    if (v && value !== v.state.doc.toString())
      v.dispatch({
        changes: { from: 0, to: v.state.doc.length, insert: value },
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
