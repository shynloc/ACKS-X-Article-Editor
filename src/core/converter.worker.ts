import { convert } from "./convert";
self.onmessage = (event: MessageEvent<{ id: number; source: string }>) => {
  try {
    self.postMessage({
      id: event.data.id,
      conversion: convert(event.data.source),
    });
  } catch {
    self.postMessage({ id: event.data.id, error: "转换失败，原稿仍然保留。" });
  }
};
