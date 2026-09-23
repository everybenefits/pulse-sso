"use client";

import { useEffect, useState, type ComponentType } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { type Auth, type User } from "firebase/auth";
import {
  asSsoClientError,
  clearHandoffCodeStash,
  clearSsoAttempt,
  clearStashedCustomToken,
  exchangeHandoffCode,
  markSsoAttempted,
  readStashedCustomToken,
  stashCustomToken,
  takeHandoffCode,
  type GetAppCheckToken,
} from "../client";
import { ssoMessageKeyForCode } from "../errors";
import { isSafeInternalPath, safeInternalPath } from "../paths";
import { isAllowedLogoutNext, isAllowedSsoReturnUrl } from "../urls";

type Step = "token" | "exchange" | "signin" | "open";

export type SsoConsumePageProps = {
  homePath?: string;
  /**
   * When `next` resolves to `/`, navigate here instead (Pulse uses `/home`).
   * Defaults to `homePath`.
   */
  rootRedirectPath?: string;
  LoadingUI: ComponentType<{ hint?: string }>;
  signInWithCustomToken: (token: string) => Promise<unknown>;
  getAuth: () => Auth;
  initFirebase?: () => void;
  getAppCheckToken?: GetAppCheckToken;
};


let ssoConsumePromise: Promise<void> | null = null;
let ssoConsumeDone = false;

function consumeSsoOnce(opts: {
  signInWithCustomToken: (token: string) => Promise<unknown>;
  getAuth: () => Auth;
  initFirebase?: () => void;
  getAppCheckToken?: GetAppCheckToken;
  onStep?: (step: Step) => void;
}): Promise<void> {
  if (ssoConsumeDone) return Promise.resolve();
  if (ssoConsumePromise) return ssoConsumePromise;
  ssoConsumePromise = (async () => {
    opts.initFirebase?.();

    const code = takeHandoffCode();
    if (code) {
      // A fresh/stashed handoff represents the identity selected on the source
      // origin. It must win over any stale session or interrupted custom token
      // on this destination origin.
      clearStashedCustomToken();
      opts.onStep?.("exchange");
      const customToken = await exchangeHandoffCode(
        code,
        opts.getAppCheckToken,
      );
      clearHandoffCodeStash();

      opts.onStep?.("signin");
      stashCustomToken(customToken);
      await opts.signInWithCustomToken(customToken);
      clearStashedCustomToken();
      clearSsoAttempt();
      ssoConsumeDone = true;
      return;
    }

    // Resume an exchange that succeeded before a refresh/crash interrupted
    // signInWithCustomToken. Only use this when there is no incoming handoff.
    const stashedToken = readStashedCustomToken();
    if (stashedToken) {
      opts.onStep?.("signin");
      await opts.signInWithCustomToken(stashedToken);
      clearStashedCustomToken();
      clearSsoAttempt();
      ssoConsumeDone = true;
      return;
    }

    if (opts.getAuth().currentUser) {
      clearSsoAttempt();
      ssoConsumeDone = true;
      return;
    }

    throw new Error("missing-token");
  })().catch((error) => {
    ssoConsumePromise = null;
    throw error;
  });
  return ssoConsumePromise;
}

export function SsoConsumePage({
  homePath = "/",
  rootRedirectPath,
  LoadingUI,
  signInWithCustomToken,
  getAuth,
  initFirebase,
  getAppCheckToken,
}: SsoConsumePageProps) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("token");

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        if (!ssoConsumeDone) {
          await consumeSsoOnce({
            signInWithCustomToken,
            getAuth,
            initFirebase,
            getAppCheckToken,
            onStep: (s) => {
              if (alive) setStep(s);
            },
          });
        }
        if (!alive) return;
        setStep("open");
        const next = safeInternalPath(params.get("next") || homePath, homePath);
        const root = rootRedirectPath ?? homePath;
        const destPath = next === "/" ? root : next;
        const suffix = destPath === "/" ? "" : destPath;
        router.replace(`/${locale}${suffix}`);
      } catch (err) {
        if (!alive) return;
        const clientErr = asSsoClientError(err);
        clearHandoffCodeStash();
        setError(t(ssoMessageKeyForCode(clientErr.code)));
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, [
    getAppCheckToken,
    getAuth,
    homePath,
    initFirebase,
    locale,
    params,
    router,
    rootRedirectPath,
    signInWithCustomToken,
    t,
  ]);

  if (error) {
    return (
      <div className="mesh-bg flex min-h-[100svh] items-center justify-center p-6 text-sm text-red-400">
        {error}
      </div>
    );
  }

  const hint =
    step === "exchange"
      ? t("ssoStepExchange")
      : step === "signin"
        ? t("ssoStepSignIn")
        : step === "open"
          ? t("ssoStepOpen")
          : t("ssoSigningIn");

  return <LoadingUI hint={hint} />;
}

export type SsoBridgePageProps = {
  loginPath?: string;
  loadingMessageKey?: "loading" | "ssoBridging";
  buildHandoffUrl: (returnUrl: string, idToken: string) => Promise<string>;
  useAuthState: () => {
    user: User | null;
    loading: boolean;
  };
};

export function SsoBridgePage({
  loginPath = "/login",
  loadingMessageKey = "ssoBridging",
  buildHandoffUrl,
  useAuthState,
}: SsoBridgePageProps) {
  const t = useTranslations();
  const locale = useLocale();
  const params = useSearchParams();
  const { user, loading } = useAuthState();
  const [error, setError] = useState<string | null>(null);
  const returnUrl = params.get("return");
  const invalidReturn = !returnUrl || !isAllowedSsoReturnUrl(returnUrl);

  useEffect(() => {
    if (loading || invalidReturn || !returnUrl) return;

    const go = async () => {
      if (!user) {
        const resume = `/${locale}/auth/bridge?return=${encodeURIComponent(returnUrl)}`;
        const next = encodeURIComponent(resume);
        window.location.replace(`/${locale}${loginPath}?next=${next}`);
        return;
      }
      try {
        const idToken = await user.getIdToken();
        window.location.replace(await buildHandoffUrl(returnUrl, idToken));
      } catch (err) {
        const clientErr = asSsoClientError(err);
        setError(t(ssoMessageKeyForCode(clientErr.code)));
      }
    };
    void go();
  }, [
    buildHandoffUrl,
    invalidReturn,
    loading,
    locale,
    loginPath,
    returnUrl,
    t,
    user,
  ]);

  const message = invalidReturn
    ? t("ssoInvalidReturn")
    : (error ?? t(loadingMessageKey));

  return (
    <div className="mesh-bg flex min-h-[100svh] items-center justify-center px-4 text-sm text-muted">
      {message}
    </div>
  );
}

export type LogoutCascadePageProps = {
  LoadingUI: ComponentType<{ hint?: string }>;
  signOutLocal: () => Promise<void>;
  clearProfileCache?: () => void;
};

export function LogoutCascadePage({
  LoadingUI,
  signOutLocal,
  clearProfileCache,
}: LogoutCascadePageProps) {
  const t = useTranslations();
  const locale = useLocale();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        // Always clear this origin once per page load (no module singleton —
        // Next soft-nav / Strict Mode must not skip sign-out).
        await signOutLocal();
        clearProfileCache?.();
        clearSsoAttempt();
        markSsoAttempted();

        const next = params.get("next");
        if (next && isAllowedLogoutNext(next)) {
          // Absolute cross-origin cascade URLs must not get a locale prefix.
          if (isSafeInternalPath(next)) {
            window.location.replace(`/${locale}${next}`);
          } else {
            window.location.replace(next);
          }
          return;
        }
        window.location.replace(`/${locale}/login`);
      } catch {
        if (alive) setError(t("ssoFailed"));
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, [clearProfileCache, locale, params, signOutLocal, t]);

  if (error) {
    return (
      <div className="mesh-bg flex min-h-[100svh] items-center justify-center p-6 text-sm text-red-400">
        {error}
      </div>
    );
  }

  return <LoadingUI hint={t("logoutEverywhere")} />;
}

/** Reset module singletons (tests only). */
export function __resetSsoUiForTests() {
  ssoConsumePromise = null;
  ssoConsumeDone = false;
}
