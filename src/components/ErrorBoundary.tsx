import { Component, type ReactNode } from "react";
import { emergencySource } from "../services/recovery";
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="fatal-screen">
        <h1>写作台遇到了问题</h1>
        <p>
          已经保存的本地文稿不会被清空。请先下载当前内存中的源文备份，再重新打开。
        </p>
        <button
          onClick={() => {
            const source = emergencySource();
            if (source !== null) {
              const url = URL.createObjectURL(
                new Blob([source], { type: "text/markdown;charset=utf-8" }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = "当前文稿-紧急备份.md";
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 30000);
            }
          }}
        >
          下载当前源文备份
        </button>
        <button onClick={() => location.reload()}>重新打开写作台</button>
        <p>源文备份不含图片。不要清除浏览器数据，重开后仍可访问已保存图片。</p>
      </main>
    ) : (
      this.props.children
    );
  }
}
