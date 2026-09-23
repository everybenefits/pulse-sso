import { type ComponentType } from "react";
import { type Auth, type User } from "firebase/auth";
import { type GetAppCheckToken } from "../client";
export type SsoConsumePageProps = {
    homePath?: string;
    /**
     * When `next` resolves to `/`, navigate here instead (Pulse uses `/home`).
     * Defaults to `homePath`.
     */
    rootRedirectPath?: string;
    LoadingUI: ComponentType<{
        hint?: string;
    }>;
    signInWithCustomToken: (token: string) => Promise<unknown>;
    getAuth: () => Auth;
    initFirebase?: () => void;
    getAppCheckToken?: GetAppCheckToken;
};
export declare function SsoConsumePage({ homePath, rootRedirectPath, LoadingUI, signInWithCustomToken, getAuth, initFirebase, getAppCheckToken, }: SsoConsumePageProps): import("react").JSX.Element;
export type SsoBridgePageProps = {
    loginPath?: string;
    loadingMessageKey?: "loading" | "ssoBridging";
    buildHandoffUrl: (returnUrl: string, idToken: string) => Promise<string>;
    useAuthState: () => {
        user: User | null;
        loading: boolean;
    };
};
export declare function SsoBridgePage({ loginPath, loadingMessageKey, buildHandoffUrl, useAuthState, }: SsoBridgePageProps): import("react").JSX.Element;
export type LogoutCascadePageProps = {
    LoadingUI: ComponentType<{
        hint?: string;
    }>;
    signOutLocal: () => Promise<void>;
    clearProfileCache?: () => void;
};
export declare function LogoutCascadePage({ LoadingUI, signOutLocal, clearProfileCache, }: LogoutCascadePageProps): import("react").JSX.Element;
/** Reset module singletons (tests only). */
export declare function __resetSsoUiForTests(): void;
//# sourceMappingURL=pages.d.ts.map