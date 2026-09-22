import { useEffect, useRef, useState } from "react";
import {
  CheckCircle,
  ClockCounterClockwise,
  Copy,
  Eye,
  EyeSlash,
  Info,
  Key,
  LockSimple,
  ShieldCheck,
  SignOut,
  Ticket,
  TrashSimple,
  UserCircle,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import {
  changeAccountPassword,
  createInvite,
  getAdminOverview,
  getXStatus,
  loginAccount,
  logoutAccount,
  registerAccount,
  revokeInvite,
  updateAccountByAdmin,
  type XAccount,
  type XStatus,
} from "../services/xBridge";
import { localizeKnownMessage, useI18n } from "../i18n";
import { trapDialogTab } from "./dialogFocus";

export function AccountDialog({
  close,
  onNotice,
}: {
  close: () => void;
  onNotice: (message: string) => void;
}) {
  const { t, language } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const usernameInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<XStatus>();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [overview, setOverview] = useState<{
    users: XAccount[];
    invites: Array<{
      id: string;
      role: string;
      direct_limit: number;
      created_at: number;
      used: boolean;
      used_at?: number | null;
    }>;
    audits: Array<{
      id: string;
      action: string;
      target_type: string;
      target_id?: string | null;
      created_at: number;
      admin_username?: string | null;
    }>;
  }>();
  const [newCode, setNewCode] = useState("");
  const [newInviteId, setNewInviteId] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const refresh = async () => {
    const next = await getXStatus();
    setStatus(next);
    if (next.account?.role === "admin") setOverview(await getAdminOverview());
  };
  useEffect(() => {
    dialog.current?.showModal();
    requestAnimationFrame(() => usernameInput.current?.focus());
    refresh().catch((e) =>
      setError(
        localizeKnownMessage(
          e instanceof Error ? e.message : String(e),
          language,
        ),
      ),
    );
    return () => dialog.current?.close();
  }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        localizeKnownMessage(
          e instanceof Error ? e.message : String(e),
          language,
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  const submit = () =>
    run(async () => {
      if (mode === "login") await loginAccount(username, password);
      else await registerAccount({ username, password, inviteCode });
      setPassword("");
      setInviteCode("");
      await refresh();
      onNotice(t(mode === "login" ? "登录成功" : "账号注册成功"));
    });
  const account = status?.account;
  const formatAdminTime = (value: number) =>
    new Date(value).toLocaleString(language === "en" ? "en" : "zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  const auditLabel = (action: string) =>
    t(
      action === "invite.create"
        ? "创建邀请码"
        : action === "invite.revoke"
          ? "撤销邀请码"
          : action === "user.update"
            ? "更新体验账号"
            : "管理员操作",
    );
  const readCapsLock = (event: React.KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(event.getModifierState("CapsLock"));
  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setError("");
    setCapsLock(false);
    requestAnimationFrame(() => usernameInput.current?.focus());
  };
  return (
    <dialog
      ref={dialog}
      className="account-dialog"
      aria-label={t("体验账号")}
      onCancel={close}
      onKeyDown={trapDialogTab}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
    >
      <div className="dialog-heading">
        <h2>{account ? t("体验账号") : t("登录编辑器")}</h2>
        <button
          className="icon-button"
          aria-label={t("关闭对话框")}
          onClick={close}
          disabled={busy}
        >
          <X size={22} />
        </button>
      </div>
      <div className="dialog-content">
        {status?.deploymentMode === "selfhost" ? (
          <div className="success-note">
            <CheckCircle />
            {t("当前为自部署模式，直接发布不受体验账号额度限制。")}
          </div>
        ) : account ? (
          <>
            <div className="account-card">
              {account.role === "admin" ? (
                <ShieldCheck size={30} />
              ) : (
                <UserCircle size={30} />
              )}
              <div>
                <strong>{account.username}</strong>
                <small>
                  {account.role === "admin"
                    ? t("管理员 · 直接发布不限次数")
                    : t("体验账号 · 已用 {used}/{limit} 次", {
                        used: account.directUsed,
                        limit: account.directLimit,
                      })}
                </small>
              </div>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await logoutAccount();
                    onNotice(t("已退出登录"));
                    close();
                  })
                }
              >
                <SignOut />
                {t("退出")}
              </button>
            </div>
            <details className="account-password">
              <summary>
                <Key />
                {t("修改密码")}
              </summary>
              <div className="password-input">
                <input
                  type={showChangePassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder={t("当前密码")}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  onKeyDown={readCapsLock}
                  onKeyUp={readCapsLock}
                  onBlur={() => setCapsLock(false)}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t(showChangePassword ? "隐藏密码" : "显示密码")}
                  onClick={() => setShowChangePassword((shown) => !shown)}
                >
                  {showChangePassword ? <EyeSlash /> : <Eye />}
                </button>
              </div>
              <div className="password-input">
                <input
                  type={showChangePassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder={t("新密码，至少 12 位")}
                  value={nextPassword}
                  onChange={(e) => setNextPassword(e.target.value)}
                  onKeyDown={readCapsLock}
                  onKeyUp={readCapsLock}
                  onBlur={() => setCapsLock(false)}
                />
              </div>
              {capsLock && (
                <small className="field-hint warning" role="status">
                  {t("大写锁定已开启")}
                </small>
              )}
              <button
                className="secondary-button"
                disabled={busy || nextPassword.length < 12}
                onClick={() =>
                  run(async () => {
                    await changeAccountPassword(currentPassword, nextPassword);
                    setCurrentPassword("");
                    setNextPassword("");
                    onNotice(t("密码已更新"));
                  })
                }
              >
                {t("更新密码")}
              </button>
            </details>
            {account.role === "admin" && (
              <section className="admin-panel">
                <div className="admin-heading">
                  <div>
                    <ShieldCheck />
                    <strong>{t("体验站管理")}</strong>
                  </div>
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const result = await createInvite("trial", 1);
                        setNewCode(result.code);
                        setNewInviteId(result.id);
                        await refresh();
                      })
                    }
                  >
                    <Ticket />
                    {t("生成一次体验邀请码")}
                  </button>
                </div>
                {newCode && (
                  <div className="new-invite">
                    <span>{t("邀请码只显示在这里，请安全发给体验者。")}</span>
                    <code>{newCode}</code>
                    <button
                      className="icon-button"
                      aria-label={t("复制邀请码")}
                      onClick={() => navigator.clipboard.writeText(newCode)}
                    >
                      <Copy />
                    </button>
                  </div>
                )}
                <section className="admin-invites">
                  <h3>
                    <Ticket />
                    {t("邀请码记录")}
                  </h3>
                  {(overview?.invites ?? []).length ? (
                    overview?.invites.map((invite) => (
                      <div className="admin-invite" key={invite.id}>
                        <span>
                          <strong>
                            {invite.role === "admin"
                              ? t("管理员邀请码")
                              : t("体验邀请码")}
                          </strong>
                          <small>
                            {formatAdminTime(invite.created_at)} ·{" "}
                            {invite.used ? t("已使用") : t("未使用")}
                          </small>
                        </span>
                        {!invite.used && (
                          <button
                            className="quiet-button danger-button"
                            disabled={busy}
                            onClick={() => {
                              if (!confirm(t("确认撤销这个未使用的邀请码？")))
                                return;
                              void run(async () => {
                                await revokeInvite(invite.id);
                                if (newInviteId === invite.id) {
                                  setNewCode("");
                                  setNewInviteId("");
                                }
                                await refresh();
                                onNotice(t("邀请码已撤销"));
                              });
                            }}
                          >
                            <TrashSimple />
                            {t("撤销")}
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="admin-empty">{t("尚无邀请码记录")}</p>
                  )}
                </section>
                <div className="admin-users">
                  {(overview?.users ?? []).map((user) => (
                    <div className="admin-user" key={user.id}>
                      <span>
                        <strong>{user.username}</strong>
                        <small>
                          {user.role === "admin"
                            ? t("管理员")
                            : t("已用 {used}/{limit}", {
                                used: user.directUsed,
                                limit: user.directLimit,
                              })}
                          {user.disabled ? t(" · 已停用") : ""}
                        </small>
                      </span>
                      {user.role !== "admin" && (
                        <>
                          <button
                            className="quiet-button"
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                await updateAccountByAdmin(user.id, {
                                  directLimit: user.directLimit + 1,
                                });
                                await refresh();
                              })
                            }
                          >
                            {t("+1 额度")}
                          </button>
                          <button
                            className="quiet-button"
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                await updateAccountByAdmin(user.id, {
                                  disabled: !user.disabled,
                                });
                                await refresh();
                              })
                            }
                          >
                            {user.disabled ? t("启用") : t("停用")}
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <details className="admin-audit">
                  <summary>
                    <ClockCounterClockwise />
                    {t("管理员操作记录")}
                  </summary>
                  <div>
                    {(overview?.audits ?? []).length ? (
                      overview?.audits.map((item) => (
                        <p key={item.id}>
                          <strong>{auditLabel(item.action)}</strong>
                          <span>
                            {formatAdminTime(item.created_at)} ·{" "}
                            {item.admin_username || t("管理员")}
                          </span>
                        </p>
                      ))
                    ) : (
                      <p className="admin-empty">{t("尚无管理员操作记录")}</p>
                    )}
                  </div>
                </details>
              </section>
            )}
          </>
        ) : (
          <>
            <div className="account-tabs" role="tablist">
              <button
                id="account-login-tab"
                role="tab"
                aria-selected={mode === "login"}
                onClick={() => switchMode("login")}
              >
                {t("登录")}
              </button>
              <button
                id="account-register-tab"
                role="tab"
                aria-selected={mode === "register"}
                onClick={() => switchMode("register")}
              >
                {t("邀请码注册")}
              </button>
            </div>
            <div
              className="account-form"
              role="tabpanel"
              aria-labelledby={
                mode === "login" ? "account-login-tab" : "account-register-tab"
              }
            >
              <label>
                <span>{t("用户名")}</span>
                <input
                  ref={usernameInput}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  placeholder={t("3–32 位")}
                />
              </label>
              <div className="account-field">
                <label htmlFor="account-password">{t("密码")}</label>
                <div className="password-input">
                  <input
                    id="account-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={readCapsLock}
                    onKeyUp={readCapsLock}
                    onBlur={() => setCapsLock(false)}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    aria-describedby="account-password-help"
                    placeholder={t("至少 12 位")}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t(showPassword ? "隐藏密码" : "显示密码")}
                    onClick={() => setShowPassword((shown) => !shown)}
                  >
                    {showPassword ? <EyeSlash /> : <Eye />}
                  </button>
                </div>
                <small
                  id="account-password-help"
                  className={`field-hint ${capsLock ? "warning" : ""}`}
                  role="status"
                >
                  {capsLock
                    ? t("大写锁定已开启")
                    : mode === "register"
                      ? t("使用 12–128 位密码；建议包含字母、数字和符号。")
                      : t("密码为 12–128 位。")}
                </small>
              </div>
              {mode === "register" && (
                <div className="account-field">
                  <label htmlFor="account-invite-code">
                    {t("一次性邀请码")}
                  </label>
                  <input
                    id="account-invite-code"
                    value={inviteCode}
                    onChange={(e) =>
                      setInviteCode(e.target.value.toUpperCase())
                    }
                    autoComplete="off"
                    aria-describedby="account-invite-help"
                    placeholder="ACKS-…"
                  />
                  <small id="account-invite-help" className="field-hint">
                    <Info />
                    {t(
                      "邀请码由站点管理员发放。可在项目介绍文章下评论或私信获取，每个邀请码仅能使用一次。",
                    )}
                  </small>
                </div>
              )}
              <button
                className="primary-button wide"
                disabled={
                  busy ||
                  !username.trim() ||
                  password.length < 12 ||
                  (mode === "register" && !inviteCode.trim())
                }
                onClick={submit}
              >
                {busy
                  ? t("正在处理…")
                  : mode === "login"
                    ? t("登录")
                    : t("注册并登录")}
              </button>
            </div>
            <p className="privacy-note">
              <LockSimple />
              {t(
                "登录只用于控制直接发布权限。文章、图片和历史仍保存在当前浏览器，不会因为登录自动上传到服务器。",
              )}
            </p>
          </>
        )}
        {error && (
          <p className="x-api-error" role="alert">
            <WarningCircle />
            {error}
          </p>
        )}
      </div>
    </dialog>
  );
}
