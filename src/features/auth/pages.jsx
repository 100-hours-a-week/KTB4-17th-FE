import { useEffect, useState } from "react";
import { useAppState } from "../../shared/appState.jsx";
import { asset } from "../../shared/assets.js";
import { getRegistrationAgeRestriction } from "../user/registrationAge.js";
import { localTestAccounts, localTestAuthEnabled } from "./api.js";

export function Login({ onLogin, onLocalTestLogin }) {
  const [testAccounts, setTestAccounts] = useState([]);
  const [testTargetMemberId, setTestTargetMemberId] = useState(null);
  const [testAccountsLoading, setTestAccountsLoading] =
    useState(localTestAuthEnabled);
  const [testLoginPending, setTestLoginPending] = useState(false);
  const [testLoginError, setTestLoginError] = useState("");

  useEffect(() => {
    if (!localTestAuthEnabled) return undefined;
    let active = true;
    localTestAccounts()
      .then((result) => {
        if (!active) return;
        setTestAccounts(Array.isArray(result?.accounts) ? result.accounts : []);
        setTestTargetMemberId(result?.practiceTargetMemberId || null);
      })
      .catch((error) => {
        if (active) setTestLoginError(error?.code || "TEST_AUTH_UNAVAILABLE");
      })
      .finally(() => {
        if (active) setTestAccountsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function startPractice(account) {
    setTestLoginPending(true);
    setTestLoginError("");
    try {
      await onLocalTestLogin(account.memberId, testTargetMemberId);
    } catch (error) {
      setTestLoginError(error?.code || "TEST_LOGIN_FAILED");
    } finally {
      setTestLoginPending(false);
    }
  }

  return (
    <div
      className={`login-page${localTestAuthEnabled ? " local-test-login-page" : ""}`}
    >
      <div className="login-top-space" aria-hidden="true" />
      <div className="login-illustration">
        <img src={asset("logo-login.png")} alt="*23#" />
      </div>
      <h1>
        좋아하는 사람 앞에서는,
        <br />
        누구나 연습이 필요하니까.
      </h1>
      <button
        className="kakao-login-button"
        type="button"
        aria-label="카카오 로그인"
        onClick={onLogin}
      >
        <img
          src={asset("kakao_login_kr_large.svg")}
          alt=""
          aria-hidden="true"
        />
      </button>
      {localTestAuthEnabled && (
        <section
          className="local-test-login-card"
          aria-labelledby="local-test-login-title"
        >
          <h2 id="local-test-login-title">개발용 테스트 계정</h2>
          <p>카카오 로그인과 온보딩 없이 AI 연습 대화를 바로 확인해요.</p>
          {testAccountsLoading ? (
            <div className="local-test-login-status" role="status">
              테스트 계정을 확인하고 있어요…
            </div>
          ) : testAccounts.length ? (
            testAccounts.map((account) => (
              <button
                className="local-test-login-button"
                key={account.memberId}
                type="button"
                disabled={testLoginPending || !testTargetMemberId}
                onClick={() => startPractice(account)}
              >
                {testLoginPending ? "로그인 중…" : "테스트 계정으로 연습 시작"}
              </button>
            ))
          ) : (
            <div className="local-test-login-status" role="status">
              활성 테스트 계정이 없어요. 테스트 사용자 900001을 준비해주세요.
            </div>
          )}
          {testLoginError && (
            <div className="local-test-login-error" role="alert">
              테스트 로그인을 처리하지 못했어요 ({testLoginError})
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export function RegistrationRestricted({ onConfirm }) {
  const { data } = useAppState();
  const profile = data.profile;
  const ageRestriction = getRegistrationAgeRestriction(profile.birthDate);
  const birthDate = /^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate || "")
    ? profile.birthDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1. $2. $3")
    : "-";

  return (
    <main className="registration-restricted-page">
      <div className="registration-restricted-top-space" aria-hidden="true" />
      <h1>
        {ageRestriction?.heading || "가입 연령을 확인해주세요"}
        <br />
        {ageRestriction ? "이용할 수 있어요" : "다시 입력해주세요"}
      </h1>
      <p className="registration-restricted-subtitle">
        {ageRestriction?.description || "만 19세 이상, 만 40세 미만만 가입할 수 있어요."}
      </p>
      <dl className="registration-restricted-card">
        <div className="registration-restricted-row">
          <dt>확인된 계정</dt>
          <dd>카카오</dd>
        </div>
        <div className="registration-restricted-row">
          <dt>본명</dt>
          <dd>{profile.name || "-"}</dd>
        </div>
        <div className="registration-restricted-row">
          <dt>생년월일</dt>
          <dd>{birthDate}</dd>
        </div>
      </dl>
      <ul className="registration-restricted-notes">
        <li>카카오 계정에 등록된 생년월일 기준이에요</li>
        <li>입력한 정보는 저장되지 않고 즉시 폐기돼요</li>
        <li>기본 정보가 다르면 수정 후 다시 시도해주세요</li>
      </ul>
      <button
        className="registration-restricted-confirm"
        type="button"
        onClick={onConfirm}
      >
        확인
      </button>
    </main>
  );
}
