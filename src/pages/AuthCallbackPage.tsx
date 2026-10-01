import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";
import Brand from "../components/Brand";
import AuthPage from "./AuthPage";
import { authService, authErrorMessage } from "../services/authService";

export default function AuthCallbackPage({
  recovery = false,
}: {
  recovery?: boolean;
}) {
  const {
    ready,
    session,
    recovery: verifiedRecovery,
    acceptSession,
    beginRecovery,
    clearRecovery,
  } = useAuthStore();
  const { search, hash } = useLocation();
  const navigate = useNavigate();
  const code = new URLSearchParams(search).get("code");
  const linkError = new URLSearchParams(search || hash.replace("#", "?")).get(
    "error_description",
  );
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    if (!ready || !code) return;
    let active = true;
    clearRecovery();
    void authService
      .exchangeCode(code, recovery ? "recovery" : "signup")
      .then((newSession) => {
        if (!active) return;
        if (recovery) {
          beginRecovery(newSession);
          navigate("/reset-password", { replace: true });
        } else acceptSession(newSession);
        setVerified(true);
      })
      .catch((reason) => {
        if (active) setError(authErrorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [
    ready,
    code,
    recovery,
    acceptSession,
    beginRecovery,
    clearRecovery,
    navigate,
  ]);
  if (recovery && !code && !linkError)
    return <AuthPage key="reset" mode="reset" />;
  if (!recovery && verified && session) return <Navigate to="/app" replace />;
  if (recovery && verified && verifiedRecovery && session)
    return <AuthPage key="reset" mode="reset" />;
  const failed = !!error || !!linkError || (ready && !code);
  return (
    <main className="safe-gutters flex min-h-dvh flex-col items-center justify-center bg-white py-10">
      <Brand />
      <section className="mt-10 w-full max-w-md text-center">
        <h1 className="page-heading">
          {failed
            ? "This link couldn’t be verified."
            : "Checking your email link…"}
        </h1>
        <p
          role={failed ? "alert" : "status"}
          className="mt-4 text-sm leading-relaxed text-slate-500"
        >
          {failed
            ? "The link may have expired or already been used. Request a new link and try again."
            : "We’re securely verifying this link before opening your account."}
        </p>
        {failed && (
          <>
            <Link to="/login" className="btn-primary mt-6 w-full">
              Sign in
            </Link>
            <Link to="/forgot-password" className="btn-secondary mt-3 w-full">
              Get a new reset link
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
