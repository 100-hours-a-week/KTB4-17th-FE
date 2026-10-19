import { useCallback, useEffect, useRef, useState } from "react";
import { Practice } from "../features/aipractice/Practice.jsx";
import { SimulationTrackingContext } from "../features/aisimulation/context.jsx";
import { Report, Simulation } from "../features/aisimulation/pages.jsx";
import { useSimulationLaunch } from "../features/aisimulation/useSimulationLaunch.js";
import { useSimulationTracking } from "../features/aisimulation/useSimulationTracking.js";
import {
  beginKakaoLogin,
  completeOAuthCallback,
  logout as logoutAuth,
} from "../features/auth/api.js";
import {
  Login,
  RegistrationRestricted,
  SplashScreen,
} from "../features/auth/pages.jsx";
import { useLocalTestLogin } from "../features/auth/useLocalTestLogin.js";
import { ChatList, ChatRoom } from "../features/chat/Chat.jsx";
import { useUnreadMessageCount } from "../features/chat/useUnreadMessageCount.js";
import { Likes } from "../features/matching/Likes.jsx";
import { NotificationProvider } from "../features/notifications/NotificationProvider.jsx";
import { Notifications } from "../features/notifications/Notifications.jsx";
import { Onboarding } from "../features/onboarding/Onboarding.jsx";
import { Preferences } from "../features/preferences/Preferences.jsx";
import { OtherProfile } from "../features/profile/OtherProfile.jsx";
import {
  MyPage,
  MyProfile,
  Persona,
  Settings,
} from "../features/profile/pages.jsx";
import {
  Home,
  LegacyProfileRedirect,
} from "../features/recommendation/Home.jsx";
import { isHomePath } from "../features/recommendation/recommendationRefresh.js";
import { useRecommendationFeed } from "../features/recommendation/useRecommendationFeed.js";
import * as userApi from "../features/user/api.js";
import { executeUserWithdrawal } from "../features/user/withdrawal.js";
import {
  AUTH_EXPIRED_EVENT,
  clearAccessToken,
  getAccessToken,
} from "../shared/api/authToken.js";
import { refreshAuthSession } from "../shared/api/client.js";
import { apiErrorMessage } from "../shared/api/errorMessages.js";
import {
  AppStateProvider,
  makeInitialState,
  useAppState,
} from "../shared/appState.jsx";
import {
  BottomNav,
  EmptyState,
  PixelButton,
} from "../shared/ui/components.jsx";
import { useViewportHeight } from "../shared/useViewportHeight.js";
import { onboardingStepFromStatus } from "../shared/utils.js";

function profileReturnPath(search) {
  const requested = new URLSearchParams(search).get("returnTo");
  if (!requested) return "/home";

  try {
    const destination = new URL(requested, window.location.origin);
    if (destination.origin !== window.location.origin) return "/home";
    if (destination.pathname === "/notifications") return "/notifications";
    if (destination.pathname === "/likes") {
      const tab = destination.searchParams.get("tab");
      return tab === "sent" || tab === "received"
        ? `/likes?tab=${tab}`
        : "/likes";
    }
    return /^\/chats\/\d+$/.test(destination.pathname)
      ? destination.pathname
      : "/home";
  } catch {
    return "/home";
  }
}

function AppRouter() {
  const viewportRef = useRef(null);
  useViewportHeight(viewportRef);
  const { data, setData } = useAppState();
  const [path, setPath] = useState(window.location.pathname);
  const [search, setSearch] = useState(window.location.search);
  const [toastText, setToastText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sessionCheckError, setSessionCheckError] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [userWithdrawalPending, setUserWithdrawalPending] = useState(false);
  const accountActionPendingRef = useRef(false);
  const unreadMessageCount = useUnreadMessageCount({
    enabled: !loading && !sessionCheckError && data.session && data.onboarded,
    path,
  });
  const navigate = useCallback((to, options = {}) => {
    const destination = new URL(to, window.location.origin);
    const destinationUrl = `${destination.pathname}${destination.search}${destination.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (currentUrl !== destinationUrl) {
      if (options.replace) window.history.replaceState({}, "", destinationUrl);
      else window.history.pushState({}, "", destinationUrl);
    }
    setPath(destination.pathname);
    setSearch(destination.search);
    window.scrollTo(0, 0);
  }, []);
  const tracking = useSimulationTracking({
    enabled: !loading && !sessionCheckError && data.session && data.onboarded,
  });
  const completion = tracking.snapshot.completions[0];
  useEffect(() => {
    // Persistent server notifications now own the global completion banner.
    if (completion) tracking.manager.acknowledge(completion.simulationId);
  }, [completion, tracking.manager]);
  const { startSimulation, cancelSimulation, simulationStartingFor } =
    useSimulationLaunch({
      path,
      tracking: tracking.manager,
      navigate: (to) => navigate(to),
      toast: (message) => toast(message),
    });
  const loginWithLocalTestAccount = useLocalTestLogin({
    navigate: (to) => navigate(to),
  });
  const feed = useRecommendationFeed({
    enabled: !loading && data.session && data.onboarded,
    isHome: isHomePath(path),
  });
  const {
    recommendations,
    currentIndex: recommendationIndex,
    exhausted: recommendationExhausted,
    hasNext,
    status: recommendationStatus,
    error: recommendationError,
    refreshing: recommendationRefreshing,
    load: loadRecommendations,
    reloadAfterPreferences: reloadRecommendationsAfterPreferences,
    loadMore: loadMoreRecommendations,
    refresh: refreshRecommendations,
    advance: advanceRecommendation,
    retreat: retreatRecommendation,
    dismiss: dismissRecommendation,
    pass: passRecommendation,
  } = feed;

  useEffect(() => {
    const pop = () => {
      setPath(window.location.pathname);
      setSearch(window.location.search);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  useEffect(() => {
    let active = true;
    let sessionCheckId = 0;
    let hasAuthenticatedSession = false;

    async function bootstrapSession({ resuming = false } = {}) {
      const checkId = ++sessionCheckId;
      const isCurrentCheck = () => active && checkId === sessionCheckId;
      const registrationPath =
        window.location.pathname.startsWith("/registration");
      const hadAccessToken =
        hasAuthenticatedSession || (resuming && Boolean(getAccessToken()));
      if (resuming && hadAccessToken) hasAuthenticatedSession = true;
      setLoading(true);
      setSessionCheckError(false);
      try {
        if (registrationPath) {
          // The OAuth registration callback clears the refresh cookie for a new
          // account. Check that cookie before trusting a previous access token.
          await refreshAuthSession();
        } else {
          await completeOAuthCallback();
        }
        if (!isCurrentCheck()) return;

        const status = await userApi.onboarding({
          cache: "no-store",
          notifyAuthExpired: false,
        });
        if (!isCurrentCheck()) return;
        const registeredIdentity =
          status?.userStatus === "ACTIVE"
            ? null
            : await userApi.onboardingProfile();
        if (!isCurrentCheck()) return;
        hasAuthenticatedSession = true;
        setData((old) => ({
          ...old,
          session: true,
          onboarded: status?.userStatus === "ACTIVE",
          registrationInfoConfirmed: true,
          ...(registeredIdentity
            ? {
                profile: {
                  ...old.profile,
                  birthDate: registeredIdentity.birthDate || "",
                  gender: registeredIdentity.gender || "",
                },
              }
            : {}),
          onboardingStep:
            status?.userStatus === "ACTIVE"
              ? "complete"
              : onboardingStepFromStatus(status),
        }));
        if (
          registrationPath &&
          window.location.pathname.startsWith("/registration")
        ) {
          navigate(status?.userStatus === "ACTIVE" ? "/home" : "/onboarding", {
            replace: true,
          });
        }
      } catch (error) {
        if (!isCurrentCheck()) return;
        if (
          error?.code === "AUTH_REQUIRED" ||
          error?.status === 401 ||
          error?.code === "USER_NOT_FOUND"
        ) {
          hasAuthenticatedSession = false;
          clearAccessToken();
          setData((old) => ({
            ...old,
            session: false,
            onboarded: false,
            registrationInfoConfirmed: false,
            ...(registrationPath ? { onboardingStep: "identity" } : {}),
          }));
          if (
            resuming &&
            hadAccessToken &&
            window.location.pathname.startsWith("/registration")
          ) {
            navigate("/login", { replace: true });
          }
          return;
        }
        setSessionCheckError(true);
      } finally {
        if (isCurrentCheck()) setLoading(false);
      }
    }

    function recheckRegistration() {
      if (!window.location.pathname.startsWith("/registration")) return;
      setPath(window.location.pathname);
      setSearch(window.location.search);
      void bootstrapSession({ resuming: true });
    }

    function handlePageShow(event) {
      if (event.persisted) recheckRegistration();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") recheckRegistration();
    }

    window.addEventListener("popstate", recheckRegistration);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void bootstrapSession();
    return () => {
      active = false;
      window.removeEventListener("popstate", recheckRegistration);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [setData, navigate]);

  useEffect(() => {
    if (
      loading ||
      !path.startsWith("/registration") ||
      !data.session ||
      !data.registrationInfoConfirmed
    )
      return;

    navigate(data.onboarded ? "/home" : "/onboarding", { replace: true });
  }, [
    loading,
    path,
    data.session,
    data.registrationInfoConfirmed,
    data.onboarded,
    navigate,
  ]);

  useEffect(() => {
    function handleAuthExpired() {
      clearAccessToken();
      setData((old) => ({ ...old, session: false, onboarded: false }));
      navigate("/login");
    }

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () =>
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, [setData, navigate]);

  useEffect(() => {
    if (!toastText) return undefined;
    const timer = window.setTimeout(() => setToastText(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toastText]);

  function toast(message) {
    setToastText(message);
  }

  async function handleLogout() {
    if (accountActionPendingRef.current) return;
    accountActionPendingRef.current = true;
    setLogoutPending(true);
    try {
      await logoutAuth();
      clearAccessToken();
      setData(makeInitialState());
      navigate("/login");
    } catch {
      toast("로그아웃을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      accountActionPendingRef.current = false;
      setLogoutPending(false);
    }
  }

  async function handleUserWithdrawal() {
    if (accountActionPendingRef.current) return;
    accountActionPendingRef.current = true;
    setUserWithdrawalPending(true);
    try {
      await executeUserWithdrawal({
        withdrawUser: userApi.withdrawUser,
        clearSession: clearAccessToken,
        resetAppState: () => setData(makeInitialState()),
        navigateToLogin: () => navigate("/login", { replace: true }),
        notifySuccess: () => toast("계정 탈퇴가 완료됐어요."),
        notifyFailure: (error) =>
          toast(
            apiErrorMessage(
              error,
              "계정 탈퇴를 완료하지 못했어요. 로그인 상태를 확인한 뒤 다시 시도해 주세요.",
            ),
          ),
      });
    } finally {
      accountActionPendingRef.current = false;
      setUserWithdrawalPending(false);
    }
  }

  const personId = Number(path.split("/").pop());
  const chatRoomIdParam = new URLSearchParams(search).get("chatRoomId");
  const parsedChatRoomId = Number(chatRoomIdParam);
  const chatRoomId =
    chatRoomIdParam !== null &&
    Number.isSafeInteger(parsedChatRoomId) &&
    parsedChatRoomId > 0
      ? parsedChatRoomId
      : null;
  const simulationRoute = path.match(/^\/ai\/simulations\/(\d+)(?:\/report)?$/);
  const simulationId = simulationRoute ? Number(simulationRoute[1]) : null;
  const showNav =
    data.onboarded &&
    ["/", "/home", "/likes", "/chats", "/my", "/notifications"].includes(path);

  let page;
  if (loading) page = <SplashScreen message="잠시만 기다려 주세요…" />;
  else if (sessionCheckError)
    page = (
      <SplashScreen
        message="서버에 연결하지 못해 로그인 상태를 확인할 수 없어요."
        action={
          <PixelButton onClick={() => window.location.reload()}>
            다시 시도
          </PixelButton>
        }
      />
    );
  else if (path === "/registration/restricted")
    page = (
      <RegistrationRestricted onConfirm={() => navigate("/registration")} />
    );
  else if (path === "/registration")
    page = <Onboarding navigate={navigate} toast={toast} />;
  else if (!data.session || path === "/login")
    page = (
      <Login
        onLocalTestLogin={loginWithLocalTestAccount}
        onLogin={beginKakaoLogin}
      />
    );
  else if (!data.onboarded)
    page = <Onboarding navigate={navigate} toast={toast} />;
  else if (path === "/home" || path === "/")
    page = (
      <Home
        navigate={navigate}
        toast={toast}
        recommendations={recommendations}
        currentIndex={recommendationIndex}
        recommendationExhausted={recommendationExhausted}
        hasNext={hasNext}
        recommendationStatus={recommendationStatus}
        recommendationError={recommendationError}
        recommendationRefreshing={recommendationRefreshing}
        onRetryRecommendations={loadRecommendations}
        onRefreshRecommendations={refreshRecommendations}
        onAdvance={advanceRecommendation}
        onRetreat={retreatRecommendation}
        onDismiss={dismissRecommendation}
        onPass={passRecommendation}
        onLoadMore={loadMoreRecommendations}
        onStartSimulation={startSimulation}
      />
    );
  else if (/^\/profiles\/\d+$/.test(path))
    page = (
      <OtherProfile
        userId={Number(path.split("/").pop())}
        returnTo={profileReturnPath(search)}
        navigate={navigate}
        onStartSimulation={startSimulation}
        simulationStartingFor={simulationStartingFor}
      />
    );
  else if (path.startsWith("/profiles/"))
    page = <LegacyProfileRedirect navigate={navigate} />;
  else if (path === "/likes")
    page = (
      <Likes
        toast={toast}
        navigate={navigate}
        initialTab={new URLSearchParams(search).get("tab")}
        onFindMatch={() => {
          navigate("/home");
        }}
      />
    );
  else if (path === "/chats") page = <ChatList navigate={navigate} />;
  else if (path.startsWith("/chats/"))
    page = (
      <ChatRoom
        navigate={navigate}
        toast={toast}
        onStartSimulation={startSimulation}
        onCancelSimulation={cancelSimulation}
        simulationStartingFor={simulationStartingFor}
      />
    );
  else if (path.startsWith("/ai/practice/"))
    page = (
      <Practice
        targetUserId={personId}
        chatRoomId={chatRoomId}
        navigate={navigate}
        onStartSimulation={startSimulation}
        simulationStartingFor={simulationStartingFor}
      />
    );
  else if (simulationRoute && !path.endsWith("/report"))
    page = (
      <Simulation
        simulationId={simulationId}
        chatRoomId={chatRoomId}
        navigate={navigate}
      />
    );
  else if (simulationRoute && path.endsWith("/report"))
    page = (
      <Report
        simulationId={simulationId}
        chatRoomId={chatRoomId}
        navigate={navigate}
      />
    );
  else if (path === "/my") page = <MyPage navigate={navigate} toast={toast} />;
  else if (path === "/settings")
    page = (
      <Settings
        navigate={navigate}
        onLogout={handleLogout}
        onWithdrawUser={handleUserWithdrawal}
        isLoggingOut={logoutPending}
        isWithdrawingUser={userWithdrawalPending}
      />
    );
  else if (path === "/my/profile/view")
    page = <OtherProfile isOwn returnTo="/my" navigate={navigate} />;
  else if (path === "/my/profile")
    page = (
      <MyProfile
        navigate={navigate}
        toast={toast}
        returnTo={
          new URLSearchParams(search).get("returnTo") === "/my/profile/view"
            ? "/my/profile/view"
            : "/settings"
        }
      />
    );
  else if (path === "/my/persona") page = <Persona navigate={navigate} />;
  else if (path === "/preferences")
    page = (
      <Preferences
        navigate={navigate}
        toast={toast}
        onSaved={reloadRecommendationsAfterPreferences}
      />
    );
  else if (path === "/notifications")
    page = (
      <Notifications
        navigate={navigate}
        toast={toast}
        initialCategory={new URLSearchParams(search).get("category")}
      />
    );
  else
    page = (
      <main id="main-content" tabIndex={-1}>
        <h1 className="sr-only">화면을 찾을 수 없어요</h1>
        <EmptyState
          title="화면을 찾을 수 없어요"
          description="홈으로 돌아가 다시 시작해 주세요."
          action={
            <PixelButton onClick={() => navigate("/home")}>
              홈으로 가기
            </PixelButton>
          }
        />
      </main>
    );

  return (
    <SimulationTrackingContext.Provider value={tracking}>
      <div className="app-shell" ref={viewportRef}>
        <div
          className="app-screen"
          data-has-nav={showNav}
          data-view={
            /^\/(chats\/|ai\/practice\/|ai\/simulations\/\d+$)/.test(path)
              ? "conversation"
              : /^\/(profiles\/|my\/profile\/view)/.test(path)
                ? "profile"
                : "standard"
          }
        >
          <a className="skip-link" href="#main-content">
            본문으로 건너뛰기
          </a>
          <NotificationProvider
            enabled={
              !loading &&
              !sessionCheckError &&
              data.session &&
              data.onboarded &&
              path !== "/login"
            }
            path={path}
            search={search}
            navigate={navigate}
            toast={toast}
            blocked={Boolean(toastText)}
          >
            {page}
            {showNav && (
              <BottomNav
                path={path}
                unreadMessageCount={unreadMessageCount}
                navigate={navigate}
              />
            )}
            {toastText && (
              <div
                className={`toast${path === "/" || path === "/home" ? " toast-home" : ""}`}
                role="status"
              >
                {toastText}
              </div>
            )}
          </NotificationProvider>
        </div>
      </div>
    </SimulationTrackingContext.Provider>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <AppRouter />
    </AppStateProvider>
  );
}
