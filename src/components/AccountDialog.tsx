import { useEffect, useRef, useState } from "react";
import {
  CheckCircle,
  Copy,
  Key,
  LockSimple,
  ShieldCheck,
  SignOut,
  Ticket,
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
  updateAccountByAdmin,
  type XAccount,
  type XStatus,
} from "../services/xBridge";

export function AccountDialog({
  close,
  onNotice,
}: {
  close: () => void;
  onNotice: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<XStatus>();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [overview, setOverview] = useState<{
    users: XAccount[];
    invites: Array<{
      role: string;
      direct_limit: number;
      created_at: number;
      used: boolean;
    }>;
  }>();
  const [newCode, setNewCode] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const refresh = async () => {
    const next = await getXStatus();
    setStatus(next);
    if (next.account?.role === "admin") setOverview(await getAdminOverview());
  };
  useEffect(() => {
    dialog.current?.showModal();
    refresh().catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
    return () => dialog.current?.close();
  }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
      onNotice(mode === "login" ? "登录成功" : "账号注册成功");
    });
  const account = status?.account;
  return (
    <dialog
      ref={dialog}
      className="account-dialog"
      aria-label="体验账号"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
    >
      <div className="dialog-heading">
        <h2>{account ? "体验账号" : "登录编辑器"}</h2>
        <button
          className="icon-button"
          aria-label="关闭对话框"
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
            当前为自部署模式，直接发布不受体验账号额度限制。
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
                    ? "管理员 · 直接发布不限次数"
                    : `体验账号 · 已用 ${account.directUsed}/${account.directLimit} 次`}
                </small>
              </div>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await logoutAccount();
                    onNotice("已退出登录");
                    close();
                  })
                }
              >
                <SignOut />
                退出
              </button>
            </div>
            <details className="account-password">
              <summary>
                <Key />
                修改密码
              </summary>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="当前密码"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <input
                type="password"
                autoComplete="new-password"
                placeholder="新密码，至少 12 位"
                value={nextPassword}
                onChange={(e) => setNextPassword(e.target.value)}
              />
              <button
                className="secondary-button"
                disabled={busy || nextPassword.length < 12}
                onClick={() =>
                  run(async () => {
                    await changeAccountPassword(currentPassword, nextPassword);
                    setCurrentPassword("");
                    setNextPassword("");
                    onNotice("密码已更新");
                  })
                }
              >
                更新密码
              </button>
            </details>
            {account.role === "admin" && (
              <section className="admin-panel">
                <div className="admin-heading">
                  <div>
                    <ShieldCheck />
                    <strong>体验站管理</strong>
                  </div>
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const result = await createInvite("trial", 1);
                        setNewCode(result.code);
                        await refresh();
                      })
                    }
                  >
                    <Ticket />
                    生成一次体验邀请码
                  </button>
                </div>
                {newCode && (
                  <div className="new-invite">
                    <span>邀请码只显示在这里，请安全发给体验者。</span>
                    <code>{newCode}</code>
                    <button
                      className="icon-button"
                      aria-label="复制邀请码"
                      onClick={() => navigator.clipboard.writeText(newCode)}
                    >
                      <Copy />
                    </button>
                  </div>
                )}
                <div className="admin-users">
                  {(overview?.users ?? []).map((user) => (
                    <div className="admin-user" key={user.id}>
                      <span>
                        <strong>{user.username}</strong>
                        <small>
                          {user.role === "admin"
                            ? "管理员"
                            : `已用 ${user.directUsed}/${user.directLimit}`}
                          {user.disabled ? " · 已停用" : ""}
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
                            +1 额度
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
                            {user.disabled ? "启用" : "停用"}
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <>
            <div className="account-tabs">
              <button
                aria-pressed={mode === "login"}
                onClick={() => setMode("login")}
              >
                登录
              </button>
              <button
                aria-pressed={mode === "register"}
                onClick={() => setMode("register")}
              >
                邀请码注册
              </button>
            </div>
            <div className="account-form">
              <label>
                <span>用户名</span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  placeholder="3–32 位"
                />
              </label>
              <label>
                <span>密码</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  placeholder="至少 12 位"
                />
              </label>
              {mode === "register" && (
                <label>
                  <span>一次性邀请码</span>
                  <input
                    value={inviteCode}
                    onChange={(e) =>
                      setInviteCode(e.target.value.toUpperCase())
                    }
                    autoComplete="off"
                    placeholder="ACKS-…"
                  />
                </label>
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
                {busy ? "正在处理…" : mode === "login" ? "登录" : "注册并登录"}
              </button>
            </div>
            <p className="privacy-note">
              <LockSimple />
              登录只用于控制直接发布权限。文章、图片和历史仍保存在当前浏览器，不会因为登录自动上传到服务器。
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
