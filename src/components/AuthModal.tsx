import React, { useState } from "react";
import { LogIn, Sparkles, UserPlus } from "lucide-react";
import { ApiError } from "../api/client";
import { AuthUser } from "../types";

interface AuthModalProps {
  onLogin: (payload: { login: string; password: string }) => Promise<void>;
  onRegister: (payload: { username: string; displayName: string; password: string; email?: string }) => Promise<void>;
  currentUser: AuthUser | null;
  onLogout: () => Promise<void> | void;
  inviteProjectTitle?: string | null;
  authLoading?: boolean;
  sessionExpired?: boolean;
}

export default function AuthModal({
  onLogin,
  onRegister,
  currentUser,
  onLogout,
  inviteProjectTitle,
  authLoading = false,
  sessionExpired = false,
}: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [login, setLogin] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const mapError = (err: unknown) => {
    if (!(err instanceof ApiError)) return "Ошибка сети. Попробуйте позже.";
    if (err.status === 401) return "Неверный логин или пароль.";
    if (err.status === 403 && err.code === "REGISTRATION_DISABLED") return "Публичная регистрация отключена.";
    if (err.status === 409) return "Логин или email уже заняты.";
    if (err.status === 429) return "Слишком много попыток. Повторите позже.";
    return err.message || "Ошибка авторизации.";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isLogin) {
        await onLogin({ login: login.trim(), password });
      } else {
        await onRegister({
          username: username.trim(),
          displayName: displayName.trim(),
          password,
          email: email.trim() || undefined,
        });
      }
      setPassword("");
    } catch (err) {
      setError(mapError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLogoutLoading(true);
    try {
      await onLogout();
    } finally {
      setLogoutLoading(false);
    }
  };

  if (currentUser) {
    return (
      <div id="auth_header" className="flex items-center gap-1.5 sm:gap-3 bg-neutral-900/60 border border-neutral-850 p-1 sm:p-2 sm:px-3 rounded-full">
        {currentUser.avatarUrl && (
          <img
            src={currentUser.avatarUrl}
            alt={currentUser.displayName}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-neutral-700 bg-neutral-800 object-cover"
            referrerPolicy="no-referrer"
          />
        )}
        <div className="text-left hidden md:block">
          <div className="text-[10px] text-neutral-400 font-mono leading-none">Соавтор</div>
          <div className="text-xs font-medium text-white">{currentUser.displayName}</div>
        </div>
        <button
          id="logout_btn"
          onClick={handleLogout}
          disabled={logoutLoading}
          className="text-[10px] sm:text-xs bg-red-950/40 hover:bg-red-900/40 text-red-400 font-medium px-2 sm:px-3 py-1 rounded-full border border-red-900/30 transition-colors cursor-pointer"
        >
          {logoutLoading ? "Выход..." : "Выйти"}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-teal-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-3 rounded-xl bg-indigo-950/50 border border-indigo-900/30 text-indigo-400 mb-3">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-sans font-semibold text-white tracking-tight">Collabs Songwriter Space</h2>
          <p className="text-sm text-neutral-400 mt-1">Session-auth вход через защищенную cookie</p>
        </div>

        {inviteProjectTitle && (
          <div className="bg-indigo-950/60 border border-indigo-900/60 text-indigo-300 text-xs p-3.5 rounded-xl mb-4 text-left">
            <p className="font-semibold text-white">Приглашение в проект "{inviteProjectTitle}"</p>
            <p className="text-[11px] text-indigo-300 mt-1">Войдите и откройте проект из списка. Авто-join endpoint больше не используется.</p>
          </div>
        )}

        {sessionExpired && (
          <div className="bg-amber-950/50 border border-amber-900/40 text-amber-300 text-xs p-3 rounded-lg mb-3 text-center">
            Сессия истекла. Войдите снова.
          </div>
        )}

        {authLoading && (
          <div className="bg-neutral-900 border border-neutral-800 text-neutral-300 text-xs p-3 rounded-lg mb-3 text-center">
            Проверяем сессию...
          </div>
        )}

        {error && <div className="bg-red-950/50 border border-red-900/30 text-red-400 text-xs p-3 rounded-lg mb-4 text-center">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isLogin ? (
            <div>
              <label className="block text-xs font-mono text-neutral-400 mb-1">ЛОГИН ИЛИ EMAIL</label>
              <input
                type="text"
                required
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="username или email"
                className="w-full bg-neutral-900 border border-neutral-800 focus:border-indigo-500 rounded-lg p-2.5 text-sm text-white focus:outline-none transition-colors"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-mono text-neutral-400 mb-1">ЛОГИН</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 focus:border-indigo-500 rounded-lg p-2.5 text-sm text-white focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-neutral-400 mb-1">DISPLAY NAME</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 focus:border-indigo-500 rounded-lg p-2.5 text-sm text-white focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-neutral-400 mb-1">EMAIL (опционально)</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 focus:border-indigo-500 rounded-lg p-2.5 text-sm text-white focus:outline-none transition-colors"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-mono text-neutral-400 mb-1">ПАРОЛЬ</label>
            <input
              type="password"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Минимум 12 символов"
              className="w-full bg-neutral-900 border border-neutral-800 focus:border-indigo-500 rounded-lg p-2.5 text-sm text-white focus:outline-none transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading || authLoading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-medium p-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            {isLogin ? (
              <>
                <LogIn className="w-4 h-4" />
                {loading ? "Вход..." : "Войти"}
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                {loading ? "Регистрация..." : "Зарегистрироваться"}
              </>
            )}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError("");
            }}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
          >
            {isLogin ? "Создать новый аккаунт" : "Уже есть аккаунт? Войти"}
          </button>
        </div>
      </div>
    </div>
  );
}
