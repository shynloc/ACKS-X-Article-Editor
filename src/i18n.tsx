import { createContext, useContext, useMemo, useState } from "react";

export type Language = "zh-CN" | "en";
const english: Record<string, string> = {
  本地写作: "Local writing",
  界面主题: "Theme",
  浅色: "Light",
  深色: "Dark",
  校验: "Validate",
  账号: "Account",
  "手动发布到 X": "Manual publish to X",
  "直接发布到 X": "Publish directly to X",
  导出资源包: "Export archive",
  文稿库: "Library",
  关于与存储设置: "About and storage",
  搜索文稿: "Search drafts",
  新建: "New",
  导入: "Import",
  全部: "All",
  归档: "Archived",
  回收站: "Trash",
  内容仅保存在此浏览器: "Content stays in this browser",
  已准备好离线使用: "Ready for offline use",
  离线资源准备中: "Preparing offline resources",
  离线工作中: "Working offline",
  "Markdown 源文": "Markdown source",
  "Markdown 正文": "Markdown body",
  "从一个想法开始…\n\n支持 Markdown，也可以拖入本地图片。":
    "Start with an idea…\n\nMarkdown is supported, and you can drop local images here.",
  "Markdown 格式工具栏": "Markdown formatting toolbar",
  "X 结构预览": "X structure preview",
  历史版本: "Version history",
  资源管理: "Assets",
  文章标题: "Article title",
  给这篇文章起个名字: "Give this article a title",
  更换封面: "Replace cover",
  选择图片: "Choose image",
  正文图: "Body image",
  复制标题: "Copy title",
  复制正文: "Copy body",
  复制图片: "Copy image",
  "下载 PNG": "Download PNG",
  "PNG 已复制。到 X 正文对应位置粘贴；若未插入图片，请下载后上传。":
    "PNG copied. Paste it at the matching position in X; if it is not inserted, download and upload the file instead.",
  "已生成 PNG 下载，请检查下载文件，再在 X 正文对应位置上传。":
    "PNG download created. Check the file, then upload it at the matching position in X.",
  "结构预览，非官方渲染": "Structure preview, not official rendering",
  转换校验: "Conversion validation",
  本地历史版本: "Local version history",
  图片与资源: "Images and assets",
  文稿操作: "Draft actions",
  关于与本地存储: "About and local storage",
  导出与备份: "Export and backup",
  "只校验本地结构，不代表 X 已接受内容。点击问题可定位到源文。":
    "This validates the local structure only; it does not mean X accepted the content. Select an issue to locate its source.",
  "{count} 个正文块": "{count} body blocks",
  "{count} 项图片化": "{count} rendered as images",
  "{count} 项降级": "{count} degradations",
  "第 {line} 行": "Line {line}",
  "当前本地结构未发现问题。":
    "No issues were found in the current local structure.",
  "查看转换结构 JSON": "View conversion JSON",
  "X 没有资源包导入入口。按下面顺序把标题、正文和图片放入 X Article 编辑器；你的内容不会由本站发送给 X。":
    "X does not provide an archive import. Follow these steps to place the title, body, and images in X Articles; this site will not send the content to X.",
  "打开 X Articles": "Open X Articles",
  "未登录时 X 会先显示登录页；登录后进入 Articles 页面。":
    "X will show sign-in first when needed, then open the Articles page.",
  复制并粘贴标题: "Copy and paste the title",
  复制并粘贴正文: "Copy and paste the body",
  "正文不含标题、封面和图片，粘贴后请检查格式。":
    "The body excludes the title, cover, and images. Review formatting after pasting.",
  逐张插入图片: "Insert images one at a time",
  "表格、代码块和本地图片请在右侧预览中使用“复制图片”或“下载 PNG”。外链图床地址只能成为链接，不能替代 X 原生图片上传。":
    "For tables, code blocks, and local images, use Copy image or Download PNG in the preview. External image URLs can only remain links and cannot replace native X image uploads.",
  "导出当前版本的 Markdown、完整文稿、转换结构和图片。下载完成后可在其他浏览器导入恢复。":
    "Export this revision with its Markdown, recovery document, conversion data, and images. Import it in another browser to restore the draft.",
  关闭对话框: "Close dialog",
  已保存到本地: "Saved locally",
  "正在保存到本地…": "Saving locally…",
  "保存失败 · 请导出恢复包": "Save failed · export a recovery archive",
  未保存: "Unsaved",
  尚未导出备份: "No backup exported",
  "尚未创建 X 草稿": "No X draft created",
  预览区: "Preview",
  "正文不含标题、封面和图片。表格/代码请用下方“复制图片”或“下载 PNG”。":
    "The body excludes the title, cover, and images. Use Copy image or Download PNG below for tables and code.",
  图片化: "Rendered",
  降级: "Degraded",
  待修复: "To fix",
  保存时间: "Saved at",
  上次生成下载: "Last export",
  字符: "characters",
  块: "blocks",
  另存副本: "Save a copy",
  关闭错误提示: "Dismiss error",
  有新版本可用: "A new version is available",
  保存并更新: "Save and update",
  "请先导出恢复包，再更新应用。":
    "Export a recovery archive before updating the application.",
  登录编辑器: "Sign in",
  体验账号: "Trial account",
  登录: "Sign in",
  邀请码注册: "Register with invite",
  用户名: "Username",
  密码: "Password",
  一次性邀请码: "Single-use invite code",
  注册并登录: "Register and sign in",
  "正在处理…": "Working…",
  退出: "Sign out",
  修改密码: "Change password",
  当前密码: "Current password",
  "新密码，至少 12 位": "New password, at least 12 characters",
  更新密码: "Update password",
  体验站管理: "Hosted trial administration",
  生成一次体验邀请码: "Generate a trial invite",
  "邀请码只显示在这里，请安全发给体验者。":
    "This invite is shown once. Share it securely.",
  管理员: "Administrator",
  "管理员 · 直接发布不限次数": "Administrator · unlimited direct publishing",
  "体验账号 · 已用 {used}/{limit} 次": "Trial account · {used}/{limit} used",
  "已用 {used}/{limit}": "{used}/{limit} used",
  " · 已停用": " · disabled",
  "当前为自部署模式，直接发布不受体验账号额度限制。":
    "Self-hosted mode: direct publishing has no trial quota.",
  登录成功: "Signed in",
  账号注册成功: "Account created",
  已退出登录: "Signed out",
  密码已更新: "Password updated",
  复制邀请码: "Copy invite code",
  "3–32 位": "3–32 characters",
  "至少 12 位": "At least 12 characters",
  "登录只用于控制直接发布权限。文章、图片和历史仍保存在当前浏览器，不会因为登录自动上传到服务器。":
    "Signing in controls direct publishing only. Articles, images, and history remain in this browser and are not uploaded automatically.",
  启用: "Enable",
  停用: "Disable",
  "+1 额度": "+1 quota",
  直接发布需要体验账号: "Direct publishing requires a trial account",
  "登录后可以使用自己的 X Developer Client ID。普通体验账号有一次完整直发额度；手动发布不受影响。":
    "Sign in to use your own X Developer Client ID. A trial account includes one complete direct-publishing workflow; manual publishing remains unrestricted.",
  "通过 X 官方 OAuth 和 Articles API 上传图片、创建草稿，再由你确认是否公开发布。本站不会要求 Client Secret，也不会把访问令牌交给浏览器。授权只连接账号，不会自动发布文章。":
    "Use the official X OAuth and Articles API to upload images and create a draft, then decide whether to publish it. This site never asks for a Client Secret or exposes access tokens to the browser. Authorization connects the account only; it does not publish automatically.",
  "上次授权没有收到 X 回调。请确认开发者后台已经保存精确回调地址，再重新发起授权。":
    "The previous authorization did not return an X callback. Confirm that the exact callback URL is saved in the Developer Portal, then try again.",
  "从 X Developer Portal 复制 Client ID":
    "Copy the Client ID from X Developer Portal",
  "OAuth 2.0 回调地址": "OAuth 2.0 callback URL",
  "正在读取…": "Loading…",
  复制回调地址: "Copy callback URL",
  "在 X Developer Portal 创建 OAuth 2.0 Public Client / SPA，并将上面的地址设为精确回调地址。所需权限：tweet.read、tweet.write、users.read、media.write、offline.access。":
    "Create an OAuth 2.0 Public Client / SPA in X Developer Portal and register the exact callback URL above. Required scopes: tweet.read, tweet.write, users.read, media.write, offline.access.",
  "体验额度：剩余 {remaining} / {limit} 次":
    "Trial quota: {remaining} of {limit} workflows remaining",
  "草稿不会公开。若已在 X 中检查并确定发布，请在下面输入确认词。":
    "The draft is not public. After reviewing it on X, enter the confirmation word below to publish.",
  输入: "Type",
  "请输入确认词以确认公开操作。":
    "Enter the confirmation word to approve public publishing.",
  "X API 能力、访问级别和配额由 X 决定。成功创建本地请求不代表 X 已接受；只有返回草稿 ID 或 Post ID 才视为对应步骤完成。":
    "X controls API availability, access, and quotas. A local request is not proof of acceptance; the step is complete only after X returns a draft ID or Post ID.",
  "正在上传图片 {number}…": "Uploading image {number}…",
  "正在上传{kind}图片 {current}/{total}…":
    "Uploading {kind} image {current}/{total}…",
  "正在创建 X Article 草稿…": "Creating X Article draft…",
  "X Article 已发布": "X Article published",
  代码: "code",
  "正在本地生成图片…": "Rendering image locally…",
  将作为图片: "Will be published as an image",
  "查看原始{kind}": "View original {kind}",
  缺少图片: "Missing image",
  在资源管理中重新关联本地文件: "Reassociate the local file in Assets",
  "请先登录体验账号。": "Sign in with a trial account first.",
  "账号已被停用。": "This account has been disabled.",
  "操作过于频繁，请稍后重试。": "Too many attempts. Try again later.",
  "当前部署未开放注册。": "Registration is disabled on this deployment.",
  "当前已经登录，请先退出。": "You are already signed in. Sign out first.",
  "用户名需为 3–32 位文字、数字、下划线或连字符。":
    "Username must be 3–32 letters, numbers, underscores, or hyphens.",
  "密码长度需为 12–128 个字符。": "Password must be 12–128 characters.",
  "邀请码无效或已使用。":
    "The invite code is invalid or has already been used.",
  "用户名已被使用。": "That username is already taken.",
  "用户名或密码不正确。": "Incorrect username or password.",
  "当前密码不正确。": "The current password is incorrect.",
  "新密码长度需为 12–128 个字符。":
    "The new password must be 12–128 characters.",
  "体验账号的一次直接发布额度已经使用。手动发布仍可继续使用。":
    "This trial account has used its direct-publishing workflow. Manual publishing is still available.",
  "该账号在另一个浏览器会话中有未完成的直接发布。":
    "This account has an unfinished direct-publishing workflow in another browser session.",
  "尚未连接 X 账号。": "No X account is connected.",
  "X 授权已过期，请重新连接。":
    "X authorization expired. Reconnect the account.",
  "直发工作流已失效，请重新开始。":
    "The direct-publishing workflow expired. Start again.",
  "会话校验失败，请刷新后重试。":
    "Session validation failed. Refresh and try again.",
  "请求来源不受信任。": "The request origin is not trusted.",
  登录或使用邀请码注册: "Sign in or register with an invite",
  "保存并连接 X": "Save and connect X",
  "重新发起 X 授权": "Restart X authorization",
  "正在跳转 X 授权…": "Opening X authorization…",
  "打开 X Developer Portal": "Open X Developer Portal",
  已连接: "Connected",
  断开: "Disconnect",
  "上传资源并创建 X 草稿": "Upload assets and create X draft",
  "正在准备草稿…": "Preparing draft…",
  "X 草稿已创建": "X draft created",
  "输入：发布": "Type: publish",
  "确认公开发布到 X": "Confirm public publish to X",
  "正在发布…": "Publishing…",
  "先到 X Articles 检查草稿": "Review the draft in X Articles first",
  撤销与重做: "Undo and redo",
  "撤销 (⌘Z)": "Undo (⌘Z)",
  "重做 (⇧⌘Z)": "Redo (⇧⌘Z)",
  标题: "Headings",
  一级标题: "Heading 1",
  二级标题: "Heading 2",
  三级标题: "Heading 3",
  四级标题: "Heading 4",
  五级标题: "Heading 5",
  六级标题: "Heading 6",
  文字样式: "Text styles",
  加粗: "Bold",
  斜体: "Italic",
  删除线: "Strikethrough",
  "下划线（X 将降级为普通文字）": "Underline (plain text on X)",
  "高亮（X 将降级为普通文字）": "Highlight (plain text on X)",
  "波浪线（X 将降级为普通文字）": "Wavy underline (plain text on X)",
  "上标（X 将降级为普通文字）": "Superscript (plain text on X)",
  "下标（X 将降级为普通文字）": "Subscript (plain text on X)",
  列表与引用: "Lists and quotes",
  无序列表: "Bulleted list",
  有序列表: "Numbered list",
  任务列表: "Task list",
  引用: "Blockquote",
  插入内容: "Insert",
  链接: "Link",
  插入本地图片: "Insert local image",
  表格: "Table",
  行内代码: "Inline code",
  代码块: "Code block",
  水平分隔线: "Horizontal rule",
  脚注: "Footnote",
  硬换行: "Hard line break",
  扩展语法: "Extended syntax",
  "行内公式（X 将图片化）": "Inline math (rendered as image for X)",
  "公式块（X 将图片化）": "Math block (rendered as image for X)",
  "Mermaid 图表（X 将图片化）": "Mermaid (rendered as image for X)",
};
const englishIssues: Record<string, string> = {
  MISSING_IMAGE:
    "The remote or referenced image is not associated with a local asset.",
  HEADING_DOWNGRADE:
    "This heading level will be converted to H2 for compatibility.",
  UNSAFE_URL:
    "The link is invalid or uses an unsupported protocol; its text is preserved without the link.",
  INLINE_CODE: "Inline code is preserved as plain text.",
  EXTENDED_STYLE:
    "This style is not native to X Articles; the text is preserved without the style.",
  HTML_TEXT: "HTML is escaped as text; scripts and styles are never executed.",
  FOOTNOTE: "The footnote is converted to visible plain text.",
  NESTED_LIST:
    "Nested lists are flattened and their depth is preserved with a text prefix.",
  LIST_START:
    "A numbered list that does not start at 1 is converted to paragraphs with visible numbers.",
  NESTED_QUOTE: "Nested blockquotes are merged into one quote level.",
  TABLE_IMAGE:
    "The table will be published as an image; its Markdown source remains in the archive.",
  CODE_IMAGE:
    "The code block will be published as an image; its source remains in the archive.",
  MERMAID_SOURCE:
    "Mermaid is currently rendered as a code image rather than a diagram.",
  UNSUPPORTED: "Unsupported syntax is preserved as text.",
  EMPTY_TITLE:
    "The article has no title. A title is required before creating an X draft.",
  TITLE_SOFT_LIMIT:
    "The title exceeds the editor's recommended 500-character limit.",
  MISSING_ASSET:
    "A referenced image asset is missing. Reassociate the local file.",
  INVALID_RANGE: "An inline style or link range is outside its text block.",
  UNSAFE_LINK: "A link uses an unsafe protocol.",
};

interface I18nValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (source: string, variables?: Record<string, string | number>) => string;
}
const I18nContext = createContext<I18nValue | null>(null);

export function translate(
  source: string,
  language: Language,
  variables?: Record<string, string | number>,
) {
  let result = language === "en" ? (english[source] ?? source) : source;
  for (const [key, value] of Object.entries(variables ?? {}))
    result = result.replaceAll(`{${key}}`, String(value));
  return result;
}

function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem("acks-x-language");
    if (stored === "en" || stored === "zh-CN") return stored;
  } catch {}
  const configured = import.meta.env.VITE_DEFAULT_LANGUAGE;
  if (configured === "en" || configured === "zh-CN") return configured;
  return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, update] = useState<Language>(initialLanguage);
  const value = useMemo<I18nValue>(
    () => ({
      language,
      setLanguage(next) {
        update(next);
        document.documentElement.lang = next;
        try {
          localStorage.setItem("acks-x-language", next);
        } catch {}
      },
      t: (source, variables) => translate(source, language, variables),
    }),
    [language],
  );
  document.documentElement.lang = language;
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("I18nProvider missing");
  return value;
}

export function localizeKnownMessage(message: string, language: Language) {
  return translate(message, language);
}

export function localizeIssue(
  code: string,
  message: string,
  language: Language,
) {
  return language === "en"
    ? (englishIssues[code] ?? translate(message, language))
    : message;
}
