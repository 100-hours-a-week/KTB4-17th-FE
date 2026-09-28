import { useEffect, useState } from "react";
import { Practice } from "../features/aipractice/Practice.jsx";
import { Report, Simulation } from "../features/aisimulation/pages.jsx";
import { useSimulationLaunch } from "../features/aisimulation/useSimulationLaunch.js";
import { beginKakaoLogin } from "../features/auth/api.js";
import { Login, RegistrationRestricted } from "../features/auth/pages.jsx";
import { useLocalTestLogin } from "../features/auth/useLocalTestLogin.js";
import { ChatList, ChatRoom } from "../features/chat/Chat.jsx";
import { Likes } from "../features/matching/Likes.jsx";
import { Notifications } from "../features/notifications/Notifications.jsx";
import { Onboarding } from "../features/onboarding/Onboarding.jsx";
import { Preferences } from "../features/preferences/Preferences.jsx";
import { MyPage, MyProfile, Persona } from "../features/profile/pages.jsx";
import {
  Home,
  LegacyProfileRedirect,
} from "../features/recommendation/Home.jsx";
import { useRecommendationFeed } from "../features/recommendation/useRecommendationFeed.js";
import * as userApi from "../features/user/api.js";
import { ensureCsrfToken } from "../shared/api/client.js";
import { AppStateProvider, useAppState } from "../shared/appState.jsx";
import { asset } from "../shared/assets.js";
import {
  BottomNav,
  EmptyState,
  PixelButton,
} from "../shared/ui/components.jsx";
import { onboardingStepFromStatus } from "../shared/utils.js";

function AppRouter() {
  const { data, setData } = useAppState();
  const [path, setPath] = useState(window.location.pathname);
  const [toastText, setToastText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sessionCheckError, setSessionCheckError] = useState(false);
  const { startSimulation, simulationStartingFor } = useSimulationLaunch({
    navigate: (to) => navigate(to),
    toast: (message) => toast(message),
  });
  const loginWithLocalTestAccount = useLocalTestLogin({
    navigate: (to) => navigate(to),
  });
  const feed = useRecommendationFeed({
    enabled: !loading && data.session && data.onboarded,
  });
  const {
    recommendations,
    currentIndex: recommendationIndex,
    hasNext,
    status: recommendationStatus,
    error: recommendationError,
    load: loadRecommendations,
    loadMore: loadMoreRecommendations,
    advance: advanceRecommendation,
  } = feed;

  useEffect(() => {
    const pop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  useEffect(() => {
    if (window.location.pathname.startsWith("/registration")) {
      if (window.location.pathname === "/registration") {
        setData((old) => ({
          ...old,
          onboardingStep: "identity",
          registrationInfoConfirmed: false,
        }));
      }
      setLoading(false);
      return undefined;
    }

    let active = true;
    userApi
      .onboarding()
      .then((status) => {
        if (!active) return;
        void ensureCsrfToken().catch(() => {});
        setData((old) => ({
          ...old,
          session: true,
          onboarded: status?.userStatus === "ACTIVE",
          onboardingStep:
            status?.userStatus === "ACTIVE"
              ? "complete"
              : onboardingStepFromStatus(status),
        }));
      })
      .catch((error) => {
        if (!active) return;
        if (
          error?.code === "AUTH_REQUIRED" ||
          error?.code === "USER_NOT_FOUND"
        ) {
          setData((old) => ({ ...old, session: false, onboarded: false }));
          return;
        }
        setSessionCheckError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [setData]);

  useEffect(() => {
    if (!toastText) return undefined;
    const timer = window.setTimeout(() => setToastText(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toastText]);

  function navigate(to) {
    if (window.location.pathname !== to) window.history.pushState({}, "", to);
    setPath(to);
    window.scrollTo(0, 0);
  }

  function toast(message) {
    setToastText(message);
  }

  const personId = Number(path.split("/").pop());
  const simulationRoute = path.match(/^\/ai\/simulations\/(\d+)(?:\/report)?$/);
  const simulationId = simulationRoute ? Number(simulationRoute[1]) : null;
  const showNav =
    data.onboarded && ["/home", "/likes", "/chats", "/my"].includes(path);

  let page;
  if (loading)
    page = (
      <div className="loading-page">
        <img src={asset("logo.png")} alt="" />
        <span>잠시만 기다려주세요</span>
      </div>
    );
  else if (sessionCheckError)
    page = (
      <div className="loading-page">
        <img src={asset("logo.png")} alt="" />
        <span>서버에 연결하지 못해 로그인 상태를 확인할 수 없어요.</span>
        <PixelButton onClick={() => window.location.reload()}>
          다시 시도
        </PixelButton>
      </div>
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
        key={recommendations[recommendationIndex]?.id || "recommendation-empty"}
        navigate={navigate}
        toast={toast}
        recommendations={recommendations}
        currentIndex={recommendationIndex}
        hasNext={hasNext}
        recommendationStatus={recommendationStatus}
        recommendationError={recommendationError}
        onRetryRecommendations={loadRecommendations}
        onAdvance={advanceRecommendation}
        onLoadMore={loadMoreRecommendations}
        onStartSimulation={startSimulation}
      />
    );
  else if (path.startsWith("/profiles/"))
    page = <LegacyProfileRedirect navigate={navigate} />;
  else if (path === "/likes")
    page = (
      <Likes
        toast={toast}
        onFindMatch={() => {
          navigate("/home");
          void loadRecommendations();
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
        simulationStartingFor={simulationStartingFor}
      />
    );
  else if (path.startsWith("/ai/practice/"))
    page = (
      <Practice
        targetMemberId={personId}
        navigate={navigate}
        onStartSimulation={startSimulation}
        simulationStartingFor={simulationStartingFor}
      />
    );
  else if (simulationRoute && !path.endsWith("/report"))
    page = <Simulation simulationId={simulationId} navigate={navigate} />;
  else if (simulationRoute && path.endsWith("/report"))
    page = <Report simulationId={simulationId} navigate={navigate} />;
  else if (path === "/my") page = <MyPage navigate={navigate} />;
  else if (path === "/my/profile")
    page = <MyProfile navigate={navigate} toast={toast} />;
  else if (path === "/my/persona") page = <Persona navigate={navigate} />;
  else if (path === "/preferences")
    page = <Preferences navigate={navigate} toast={toast} />;
  else if (path === "/notifications")
    page = <Notifications navigate={navigate} toast={toast} />;
  else
    page = (
      <EmptyState
        title="화면을 찾을 수 없어요"
        description="홈으로 돌아가 다시 시작해주세요."
        action={
          <PixelButton onClick={() => navigate("/home")}>
            홈으로 가기
          </PixelButton>
        }
      />
    );

  return (
    <div className="app-shell">
      <div className="app-screen">
        {page}
        {showNav && (
          <BottomNav
            path={path}
            navigate={navigate}
            onRefreshHome={loadRecommendations}
          />
        )}
        {toastText && (
          <div className="toast" role="status">
            {toastText}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <AppRouter />
    </AppStateProvider>
  );
}
