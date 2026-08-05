import React from "react";
import { Link } from "react-router-dom";
import AppShell from "../../app/shell/AppShell";
import StateView from "../../shared/ui/StateView";
import { useAuth } from "../../app/auth/AuthProvider";
import { DmInbox } from "../../components/DmInbox";

export default function DmInboxPage() {
  const { currentUser, authPhase, isCheckingSession } = useAuth();

  return (
    <AppShell
      title="Личные сообщения"
      headerRight={
        <Link to="/app" className="text-sm text-indigo-300 hover:text-indigo-200">
          К проектам
        </Link>
      }
      currentUser={currentUser}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
        {isCheckingSession ? (
          <StateView kind="loading" message="Загружаем сообщения..." />
        ) : authPhase !== "authenticated" || !currentUser ? (
          <StateView kind="readOnly" message="Войдите в аккаунт, чтобы открыть личные сообщения." />
        ) : (
          <DmInbox />
        )}
      </div>
    </AppShell>
  );
}
