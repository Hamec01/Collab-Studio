import React, { useState } from "react";
import { User } from "../types";
import { LogIn, UserPlus, Sparkles } from "lucide-react";

interface AuthModalProps {
  onLogin: (user: User) => void;
  currentUser: User | null;
  onLogout: () => void;
  inviteProjectTitle?: string | null;
}

export default function AuthModal({ onLogin, currentUser, onLogout, inviteProjectTitle }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Demo users for quick login
  const demoUsers = [
    { username: "admin", password: "admin123", label: "Алексей (Producer)" },
    { username: "maria", password: "maria123", label: "Мария (Singer)" },
    { username: "vlad", password: "vlad123", label: "Влад (Beatmaker)" },
  ];

  const handleDemoLogin = async (un: string, pw: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: un, password: pw }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        onLogin(data.user);
      } else {
        setError(data.message || "Ошибка авторизации");
      }
    } catch (err) {
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const endpoint = isLogin ? "/api/auth/login" : "/api/auth/register";
    const body = isLogin
      ? { username, password }
      : { username, password, displayName };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();

      if (response.ok && (data.success || isLogin)) {
        onLogin(data.user);
      } else {
        setError(data.message || "Ошибка выполнения запроса");
      }
    } catch (err) {
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
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
          onClick={onLogout}
          className="text-[10px] sm:text-xs bg-red-950/40 hover:bg-red-900/40 text-red-400 font-medium px-2 sm:px-3 py-1 rounded-full border border-red-900/30 transition-colors cursor-pointer"
        >
          Выйти
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative overflow-hidden">
        {/* Glow decoration */}
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-teal-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-3 rounded-xl bg-indigo-950/50 border border-indigo-900/30 text-indigo-400 mb-3">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-sans font-semibold text-white tracking-tight">
            Collabs Songwriter Space
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            Совместная студия написания песен и ведения демо-версий
          </p>
        </div>

        {inviteProjectTitle && (
          <div className="bg-indigo-950/60 border border-indigo-900/60 text-indigo-300 text-xs p-3.5 rounded-xl mb-4 text-left flex items-start gap-2.5 shadow-lg">
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5 animate-pulse" />
            <div>
              <p className="font-semibold text-white">Приглашение в проект "{inviteProjectTitle}"</p>
              <p className="text-[11px] text-indigo-300 mt-1">
                Войдите под своим аккаунтом или зарегистрируйте новый, чтобы автоматически добавиться в соавторы проекта!
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-950/50 border border-red-900/30 text-red-400 text-xs p-3 rounded-lg mb-4 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-xs font-mono text-neutral-400 mb-1">ИМЯ ИЛИ ПСЕВДОНИМ</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Например, MC Рифмач"
                className="w-full bg-neutral-900 border border-neutral-800 focus:border-indigo-500 rounded-lg p-2.5 text-sm text-white focus:outline-none transition-colors"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-mono text-neutral-400 mb-1">ЛОГИН</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Введите логин"
              className="w-full bg-neutral-900 border border-neutral-800 focus:border-indigo-500 rounded-lg p-2.5 text-sm text-white focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-neutral-400 mb-1">ПАРОЛЬ</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-neutral-900 border border-neutral-800 focus:border-indigo-500 rounded-lg p-2.5 text-sm text-white focus:outline-none transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
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
            {isLogin ? "Создать новый аккаунт соавтора" : "Уже есть аккаунт? Войти"}
          </button>
        </div>

        {/* Quick Demo Switcher Panel */}
        <div className="mt-6 pt-6 border-t border-neutral-900">
          <div className="text-center text-xs font-mono text-neutral-500 mb-3">
            БЫСТРЫЙ ВХОД ДЛЯ ТЕСТИРОВАНИЯ КОЛЛАБОРАЦИИ
          </div>
          <div className="grid grid-cols-1 gap-2">
            {demoUsers.map((u) => (
              <button
                key={u.username}
                type="button"
                onClick={() => handleDemoLogin(u.username, u.password)}
                className="flex items-center justify-between bg-neutral-900/40 hover:bg-neutral-900 border border-neutral-800 hover:border-indigo-500/50 p-2 rounded-lg text-left text-xs transition-all text-neutral-300 cursor-pointer group"
              >
                <div>
                  <span className="font-medium text-white group-hover:text-indigo-400 transition-colors">
                    {u.label}
                  </span>
                  <span className="block text-[10px] text-neutral-500 mt-0.5">
                    Логин: <strong className="font-mono text-neutral-400">{u.username}</strong>, Пароль: <strong className="font-mono text-neutral-400">{u.password}</strong>
                  </span>
                </div>
                <div className="text-[10px] bg-neutral-800 px-2 py-0.5 rounded text-neutral-400 border border-neutral-700 font-mono">
                  Войти
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
