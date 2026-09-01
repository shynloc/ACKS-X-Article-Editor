import type { MediaBinding } from "../core/types";

export interface XStatus {
  configured: boolean;
  connected: boolean;
  clientId: string;
  csrf: string;
  redirectUri: string;
  user?: { id: string; name: string; username: string } | null;
}
let csrf = "";
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/x${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.method && init.method !== "GET"
        ? { "X-CSRF-Token": csrf }
        : {}),
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.error || `X 发布桥返回 ${response.status}`);
  return payload as T;
}
export async function getXStatus() {
  const status = await request<XStatus>("/status");
  csrf = status.csrf;
  return status;
}
export const configureX = (clientId: string) =>
  request<{ ok: true }>("/config", {
    method: "POST",
    body: JSON.stringify({ clientId }),
  });
export const authorizeX = () =>
  request<{ url: string }>("/authorize", { method: "POST", body: "{}" });
export const disconnectX = () =>
  request<{ ok: true }>("/disconnect", { method: "POST", body: "{}" });
function base64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片读取失败。"));
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || "");
    reader.readAsDataURL(blob);
  });
}
export async function uploadXMedia(blob: Blob): Promise<MediaBinding> {
  const result = await request<{ mediaId: string; mediaCategory: string }>(
    "/media",
    {
      method: "POST",
      body: JSON.stringify({ mime: blob.type, media: await base64(blob) }),
    },
  );
  return { media_id: result.mediaId, media_category: result.mediaCategory };
}
export const createXDraft = (article: unknown, requestHash: string) =>
  request<{ articleId: string }>("/draft", {
    method: "POST",
    body: JSON.stringify({ article, requestHash }),
  });
export const publishXDraft = (articleId: string, requestHash: string) =>
  request<{ articleId: string; postId?: string }>(
    `/publish/${encodeURIComponent(articleId)}`,
    { method: "POST", body: JSON.stringify({ confirm: true, requestHash }) },
  );
