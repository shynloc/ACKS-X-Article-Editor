import type { Article } from "../core/types";
// Process-local source survives React's error boundary; never sent to a server.
let latest: Article | null = null;
export function captureDraft(article: Article) {
  latest = article;
}
export function emergencySource() {
  return latest ? `# ${latest.title}\n\n${latest.body}` : null;
}
