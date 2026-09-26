import type { Article, Asset, MediaBinding } from "../core/types";

export interface XStatus {
  deploymentMode: "hosted" | "selfhost";
  registrationMode: "invite" | "disabled";
  account: XAccount | null;
  workflow?: XWorkflow | null;
  configured: boolean;
  connected: boolean;
  pending: boolean;
  clientId: string;
  csrf: string;
  redirectUri: string;
  user?: { id: string; name: string; username: string } | null;
}
export interface XAccount {
  id: string;
  username: string;
  role: "admin" | "trial";
  disabled: boolean;
  directLimit: number;
  directUsed: number;
  directRemaining: number;
}
export interface XWorkflow {
  id: string;
  status: "active" | "draft";
  articleId?: string;
  requestHash?: string;
}
export interface CloudArticleRecord {
  article: Article;
  cloudRevision: number;
  serverUpdatedAt: number;
}
export interface ApiTokenRecord {
  id: string;
  name: string;
  scopes: string[];
  createdAt: number;
  lastUsedAt?: number | null;
  revoked: boolean;
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
  if (!response.ok) {
    const error = new Error(
      payload.error || `X 发布桥返回 ${response.status}`,
    ) as Error & { status?: number; cloudRevision?: number };
    error.status = response.status;
    if (Number.isInteger(payload.cloudRevision))
      error.cloudRevision = payload.cloudRevision;
    throw error;
  }
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
export const registerAccount = (input: {
  username: string;
  password: string;
  inviteCode: string;
}) =>
  request<{ account: XAccount }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const loginAccount = (username: string, password: string) =>
  request<{ account: XAccount }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
export const logoutAccount = () =>
  request<{ ok: true }>("/auth/logout", { method: "POST", body: "{}" });
export const changeAccountPassword = (
  currentPassword: string,
  nextPassword: string,
) =>
  request<{ ok: true }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, nextPassword }),
  });
export const createInvite = (role: "trial" | "admin", directLimit = 1) =>
  request<{ code: string; role: string; directLimit: number; id: string }>(
    "/admin/invites/create",
    { method: "POST", body: JSON.stringify({ role, directLimit }) },
  );
export const getAdminOverview = () =>
  request<{
    users: XAccount[];
    invites: Array<{
      id: string;
      role: string;
      direct_limit: number;
      created_at: number;
      used: boolean;
      used_at?: number | null;
      used_by?: string | null;
    }>;
    audits: Array<{
      id: string;
      action: string;
      target_type: string;
      target_id?: string | null;
      details_json?: string | null;
      created_at: number;
      admin_username?: string | null;
    }>;
  }>("/admin/overview", { method: "POST", body: "{}" });
export const revokeInvite = (inviteId: string) =>
  request<{ ok: true }>("/admin/invites/revoke", {
    method: "POST",
    body: JSON.stringify({ inviteId }),
  });
export const listApiTokens = () =>
  request<{ tokens: ApiTokenRecord[] }>("/account/tokens/list", {
    method: "POST",
    body: "{}",
  });
export const createApiToken = (name: string, scopes?: string[]) =>
  request<{
    id: string;
    name: string;
    scopes: string[];
    token: string;
  }>("/account/tokens/create", {
    method: "POST",
    body: JSON.stringify({ name, scopes }),
  });
export const revokeApiToken = (tokenId: string) =>
  request<{ ok: true }>("/account/tokens/revoke", {
    method: "POST",
    body: JSON.stringify({ tokenId }),
  });
export const listCloudArticles = () =>
  request<{
    articles: CloudArticleRecord[];
    storageUsed: number;
    storageLimit: number;
  }>("/cloud/articles/list", { method: "POST", body: "{}" });
export const uploadCloudAsset = async (asset: Asset, blob: Blob) =>
  request<{ asset: Asset }>("/cloud/assets/upload", {
    method: "POST",
    body: JSON.stringify({
      asset: { ...asset, data: await base64(blob) },
    }),
  });
export const upsertCloudArticle = (
  article: Article,
  baseRevision: number,
  mutationId: string,
) =>
  request<CloudArticleRecord>("/cloud/articles/upsert", {
    method: "POST",
    body: JSON.stringify({ article, baseRevision, mutationId }),
  });
export const getCloudAsset = (assetId: string) =>
  request<{
    asset: Asset & { data: string };
  }>("/cloud/assets/get", {
    method: "POST",
    body: JSON.stringify({ assetId }),
  });
export const updateAccountByAdmin = (
  userId: string,
  patch: { directLimit?: number; disabled?: boolean },
) =>
  request<{ account: XAccount }>("/admin/users/update", {
    method: "POST",
    body: JSON.stringify({ userId, ...patch }),
  });
export const startDirectWorkflow = () =>
  request<{ workflow: XWorkflow }>("/workflow/start", {
    method: "POST",
    body: "{}",
  });
function base64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片读取失败。"));
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || "");
    reader.readAsDataURL(blob);
  });
}
export async function uploadXMedia(
  blob: Blob,
  workflowId: string,
): Promise<MediaBinding> {
  const result = await request<{ mediaId: string; mediaCategory: string }>(
    "/media",
    {
      method: "POST",
      headers: { "X-Workflow-Id": workflowId },
      body: JSON.stringify({ mime: blob.type, media: await base64(blob) }),
    },
  );
  return { media_id: result.mediaId, media_category: result.mediaCategory };
}
export const createXDraft = (
  article: unknown,
  requestHash: string,
  workflowId: string,
) =>
  request<{ articleId: string }>("/draft", {
    method: "POST",
    headers: { "X-Workflow-Id": workflowId },
    body: JSON.stringify({ article, requestHash }),
  });
export const publishXDraft = (
  articleId: string,
  requestHash: string,
  workflowId: string,
) =>
  request<{ articleId: string; postId?: string }>(
    `/publish/${encodeURIComponent(articleId)}`,
    {
      method: "POST",
      headers: { "X-Workflow-Id": workflowId },
      body: JSON.stringify({ confirm: true, requestHash }),
    },
  );
