import { inspectArchive } from "./archive-inspect";
self.onmessage = async (
  event: MessageEvent<{ bytes: Uint8Array; allowRecovery: boolean }>,
) => {
  try {
    self.postMessage({
      result: await inspectArchive(event.data.bytes, event.data.allowRecovery),
    });
  } catch (e) {
    self.postMessage({
      error: e instanceof Error ? e.message : "资源包检查失败",
    });
  }
};
