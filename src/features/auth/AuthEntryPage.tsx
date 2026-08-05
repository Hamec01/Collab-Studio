import React, { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import AuthModal from "../../components/AuthModal";
import { useAuth } from "../../app/auth/AuthProvider";

type AuthEntryPageProps = {
  mode: "login" | "register";
};

export function AuthEntryPage({ mode }: AuthEntryPageProps) {
  const {
    currentUser,
    isCheckingSession,
    sessionExpired,
    authMessage,
    googleOAuthEnabled,
    publicRegistrationEnabled,
    login,
    register,
    logout,
    startGoogleAuth,
  } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (currentUser) {
      navigate("/app", { replace: true });
    }
  }, [currentUser, navigate]);

  if (currentUser) {
    return <Navigate to="/app" replace />;
  }

  return (
    <AuthModal
      onLogin={login}
      onRegister={register}
      onGoogleAuth={startGoogleAuth}
      currentUser={currentUser}
      onLogout={logout}
      authLoading={isCheckingSession}
      sessionExpired={sessionExpired}
      authMessage={authMessage}
      googleOAuthEnabled={googleOAuthEnabled}
      publicRegistrationEnabled={publicRegistrationEnabled}
      initialMode={mode}
    />
  );
}
