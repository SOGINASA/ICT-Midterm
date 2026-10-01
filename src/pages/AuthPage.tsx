import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Mail,
  ShieldCheck,
} from "lucide-react";
import Brand from "../components/Brand";
import { useAuthStore } from "../store/useAuthStore";
import { authService, authErrorMessage } from "../services/authService";
import {
  backendUnavailableMessage,
  developmentInboxUrl,
  isApiConfigured,
} from "../services/apiClient";
import {
  emailSchema,
  loginSchema,
  registrationSchema,
  resetPasswordSchema,
} from "../utils/authValidation";

type Mode = "login" | "register" | "forgot" | "reset";
const copy = {
  login: {
    title: "Good to have you back.",
    description: "Sign in to pick up where you left off.",
    action: "Sign in",
  },
  register: {
    title: "A fresh start for your money.",
    description: "Create your personal TengeFlow workspace.",
    action: "Create account",
  },
  forgot: {
    title: "Let’s get you back in.",
    description: "We’ll send a password reset link to your email.",
    action: "Send reset link",
  },
  reset: {
    title: "Choose a new password.",
    description: "Make it something strong and unique to you.",
    action: "Save new password",
  },
};

function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  isNew = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  isNew?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          className="field !pr-12"
          autoComplete={isNew ? "new-password" : "current-password"}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          placeholder={isNew ? "At least 8 characters" : "Your password"}
        />
        <button
          className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:text-brand-700"
          type="button"
          aria-label={
            visible
              ? `Hide ${label.toLowerCase()}`
              : `Show ${label.toLowerCase()}`
          }
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-2 text-xs text-red-700"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export default function AuthPage({ mode }: { mode: Mode }) {
  const auth = useAuthStore();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (auth.session && !auth.demo && (mode === "login" || mode === "register"))
    return <Navigate to="/app" replace />;
  const needsEmail = mode !== "reset";
  const needsPassword = mode !== "forgot";
  const confirmed = mode === "register" || mode === "reset";
  const resetExpired =
    mode === "reset" && auth.ready && (!auth.session || !auth.recovery);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed =
      mode === "register"
        ? registrationSchema.safeParse({
            displayName,
            email,
            password,
            confirmPassword,
          })
        : mode === "login"
          ? loginSchema.safeParse({ email, password })
          : mode === "forgot"
            ? emailSchema.safeParse(email)
            : resetPasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        next[String(issue.path[0] || "email")] = issue.message;
      });
      setErrors(next);
      return;
    }
    if (!isApiConfigured) {
      setErrors({ form: backendUnavailableMessage });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      if (mode === "login") {
        const session = await authService.signIn(
          email.trim().toLowerCase(),
          password,
        );
        if (!mounted.current) return;
        auth.acceptSession(session);
        navigate("/app", { replace: true });
      } else if (mode === "register") {
        const session = await authService.signUp(
          displayName.trim(),
          email.trim().toLowerCase(),
          password,
        );
        if (!mounted.current) return;
        if (session) {
          auth.acceptSession(session);
          navigate("/app", { replace: true });
        } else {
          setPassword("");
          setConfirmPassword("");
          setSent(true);
        }
      } else if (mode === "forgot") {
        await authService.requestPasswordReset(email.trim().toLowerCase());
        if (!mounted.current) return;
        setSent(true);
      } else {
        if (!auth.session || !auth.recovery)
          throw new Error(
            "Open a new password reset link before changing your password.",
          );
        const session = await authService.updatePassword(password, auth.session.user.id);
        if (!mounted.current) return;
        auth.acceptSession(session);
        setPassword("");
        setConfirmPassword("");
        setSent(true);
      }
    } catch (error) {
      if (mounted.current) setErrors({ form: authErrorMessage(error) });
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-white lg:grid lg:grid-cols-[1fr_1.08fr]">
      <aside className="relative hidden min-h-dvh flex-col justify-between overflow-hidden bg-[#edf4e9] p-12 lg:flex xl:p-16">
        <Brand />
        <div className="max-w-md">
          <span className="eyebrow !text-brand-700">Room for what matters</span>
          <h2 className="mt-6 text-[48px] font-medium leading-[1.12] tracking-[-0.05em] text-brand-900">
            Your everyday spending.
            <br />A clearer perspective.
          </h2>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-[#577361]">
            From the morning coffee to the bigger plans. A simple space to
            understand your money, one expense at a time.
          </p>
          <div className="mt-10 space-y-4 text-sm text-brand-900">
            {[
              "Track purchases in a few taps",
              "Give every category a budget",
              "See your month come together",
            ].map((text) => (
              <p key={text} className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/80">
                  <Check size={14} />
                </span>
                {text}
              </p>
            ))}
          </div>
        </div>
        <p className="text-xs text-[#577361]">
          TengeFlow · Personal finance, made more personal.
        </p>
      </aside>
      <div className="safe-gutters flex min-h-dvh flex-col px-6 py-6 sm:px-10 lg:px-16 lg:py-10">
        <div className="flex items-center justify-between">
          <span className="lg:hidden">
            <Brand compact />
          </span>
          <Link
            to="/"
            className="ml-auto inline-flex min-h-11 items-center gap-2 text-xs text-slate-500 hover:text-brand-700"
          >
            <ArrowLeft size={15} /> Back to home
          </Link>
        </div>
        <main className="mx-auto flex w-full max-w-[410px] flex-1 flex-col justify-center py-10 sm:py-14">
          {sent ? (
            <div>
              <span className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                {mode === "reset" ? (
                  <CheckCircle2 size={27} />
                ) : (
                  <Mail size={27} />
                )}
              </span>
              <h1 className="text-3xl font-semibold tracking-tight">
                {mode === "reset"
                  ? "Your password is updated."
                  : "Check your inbox."}
              </h1>
              <p
                role="status"
                className="mt-4 text-sm leading-relaxed text-slate-500"
              >
                {mode === "register"
                  ? `If this email is eligible, we’ve sent a confirmation link to ${email}. Follow it to finish creating your account. If you already have an account, sign in.`
                  : mode === "forgot"
                    ? `If an account exists for ${email}, you’ll receive a link to reset its password. Check spam too.`
                    : "You’re ready to return to your workspace."}
              </p>
              {mode !== "reset" && developmentInboxUrl && (
                <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm leading-relaxed text-brand-900">
                  This local version sends email to the test inbox instead of
                  your real mailbox.
                  <a
                    href={developmentInboxUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 flex min-h-11 items-center font-semibold underline"
                  >
                    Open local inbox
                  </a>
                  <p className="text-xs">
                    Open the confirmation or reset link to continue.
                  </p>
                </div>
              )}
              <Link
                to={mode === "reset" ? "/app" : "/login"}
                className="btn-primary mt-7 w-full"
              >
                {mode === "reset" ? "Open my workspace" : "Back to sign in"}
                <ArrowRight size={17} />
              </Link>
              {mode !== "reset" && (
                <button
                  onClick={() => setSent(false)}
                  className="mt-4 min-h-11 w-full text-sm text-slate-500"
                >
                  Use a different email
                </button>
              )}
            </div>
          ) : resetExpired ? (
            <div>
              <h1 className="page-heading">This link is no longer active.</h1>
              <p className="mt-4 text-sm leading-relaxed text-slate-500">
                Request a new password reset email, then open its link.
              </p>
              <Link to="/forgot-password" className="btn-primary mt-6 w-full">
                Get a new reset link
              </Link>
            </div>
          ) : (
            <>
              <span className="eyebrow mb-3 !text-brand-600">
                {mode === "register"
                  ? "Start with a little clarity"
                  : mode === "login"
                    ? "Your personal workspace"
                    : "Account recovery"}
              </span>
              <h1 className="text-[29px] font-semibold leading-tight tracking-[-0.04em] sm:text-[34px]">
                {copy[mode].title}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-500">
                {copy[mode].description}
              </p>
              {!isApiConfigured && (
                <div
                  className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-relaxed text-amber-900"
                  role="status"
                >
                  {backendUnavailableMessage}{" "}
                  <Link to="/demo" className="font-semibold underline">
                    Try the demo
                  </Link>
                </div>
              )}
              <form onSubmit={submit} noValidate className="mt-7 space-y-5">
                {mode === "register" && (
                  <div>
                    <label className="label" htmlFor="display-name">
                      Your name
                    </label>
                    <input
                      id="display-name"
                      className="field"
                      autoComplete="name"
                      autoFocus
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="How should we call you?"
                      maxLength={60}
                      aria-invalid={!!errors.displayName}
                      aria-describedby={
                        errors.displayName ? "name-error" : undefined
                      }
                    />
                    {errors.displayName && (
                      <p
                        id="name-error"
                        role="alert"
                        className="mt-2 text-xs text-red-700"
                      >
                        {errors.displayName}
                      </p>
                    )}
                  </div>
                )}
                {needsEmail && (
                  <div>
                    <label className="label" htmlFor="email">
                      Email address
                    </label>
                    <input
                      id="email"
                      className="field"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      autoFocus={mode !== "register"}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      aria-invalid={!!errors.email}
                      aria-describedby={
                        errors.email ? "email-error" : undefined
                      }
                    />
                    {errors.email && (
                      <p
                        id="email-error"
                        role="alert"
                        className="mt-2 text-xs text-red-700"
                      >
                        {errors.email}
                      </p>
                    )}
                  </div>
                )}
                {needsPassword && (
                  <PasswordField
                    id="password"
                    label={mode === "reset" ? "New password" : "Password"}
                    value={password}
                    onChange={setPassword}
                    error={errors.password}
                    isNew={confirmed}
                  />
                )}
                {confirmed && (
                  <PasswordField
                    id="confirm-password"
                    label="Confirm password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    error={errors.confirmPassword}
                    isNew
                  />
                )}
                {mode === "login" && (
                  <div className="-mt-2 text-right">
                    <Link
                      to="/forgot-password"
                      className="inline-flex min-h-11 items-center text-xs font-medium text-brand-700"
                    >
                      Forgot password?
                    </Link>
                  </div>
                )}
                {(errors.form || auth.error) && (
                  <p
                    role="alert"
                    className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm leading-relaxed text-red-700"
                  >
                    {errors.form || auth.error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={busy || !auth.ready}
                  className="btn-primary w-full"
                >
                  {busy ? "Please wait…" : copy[mode].action}
                  <ArrowRight size={17} />
                </button>
              </form>
              {(mode === "login" || mode === "register") && (
                <>
                  <p className="mt-6 text-center text-sm text-slate-500">
                    {mode === "login"
                      ? "New to TengeFlow?"
                      : "Already have an account?"}{" "}
                    <Link
                      className="inline-flex min-h-11 items-center font-semibold text-brand-700"
                      to={mode === "login" ? "/register" : "/login"}
                    >
                      {mode === "login" ? "Create an account" : "Sign in"}
                    </Link>
                  </p>
                  <div className="my-5 flex items-center gap-4">
                    <span className="h-px flex-1 bg-slate-100" />
                    <span className="text-xs text-slate-400">
                      or take a look first
                    </span>
                    <span className="h-px flex-1 bg-slate-100" />
                  </div>
                  <Link to="/demo" className="btn-secondary w-full">
                    Explore the demo
                  </Link>
                </>
              )}
              {mode === "forgot" && (
                <Link
                  to="/login"
                  className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 text-sm text-slate-500"
                >
                  <ArrowLeft size={15} /> Back to sign in
                </Link>
              )}
            </>
          )}
          <p className="mt-8 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand-600" />
            No bank credentials or card numbers. Just your account and the
            expenses you choose to record.
          </p>
        </main>
        <footer className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500">
          <span>© {new Date().getFullYear()} TengeFlow</span>
          <Link
            className="inline-flex min-h-11 items-center hover:text-brand-700"
            to="/#privacy"
          >
            About your data
          </Link>
        </footer>
      </div>
    </div>
  );
}
