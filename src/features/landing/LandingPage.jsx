import { useState } from "react";
import "./styles.css";

const landingAsset = (name) => `/assets/landing/${name}.svg`;

const features = [
  {
    icon: "persona",
    title: "AI 페르소나로 시작하는 온보딩",
    lines: ["간단한 질문만으로", "나만의 연애 페르소나를 만들어요."],
  },
  {
    icon: "chat",
    title: "AI와 대화 연습",
    lines: ["실제 상황처럼,", "편하게 대화를 연습해요."],
  },
  {
    icon: "simulation",
    title: "AI 시뮬레이션",
    lines: ["나와 상대방의 입장에서", "대화를 미리 경험해요."],
  },
  {
    icon: "connection",
    title: "진짜 사람과의 연결",
    lines: ["연습을 넘어,", "설레는 인연을 만나보세요."],
  },
  {
    icon: "star",
    title: "지금, 더 나은 나",
    lines: ["대화를 통해", "더 멋진 내가 될 수 있어요."],
  },
];

const stories = [
  {
    avatar: "boy",
    lines: ["AI랑 먼저 연습하니까", "실제 대화할 때 훨씬 편했어요!"],
  },
  {
    avatar: "rose",
    lines: ["제 성향에 맞는 사람을 만나서", "요즘 매일이 즐거워요. 😻"],
  },
  {
    avatar: "violet",
    lines: ["연애가 막막했는데,", "이제는 조금 자신감이 생겼어요!"],
  },
];

function Arrow() {
  return (
    <svg
      width="22"
      height="20"
      viewBox="0 0 22 20"
      fill="none"
      aria-hidden="true"
    >
      <path d="M3 10h15M12 4l6 6-6 6" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function PixelHeart({ className = "" }) {
  return (
    <svg
      className={`landing-pixel-heart ${className}`}
      viewBox="0 0 24 22"
      fill="none"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <path
        d="M3 2h6v2h6V2h6v2h3v9h-3v3h-3v3h-3v3H9v-3H6v-3H3v-3H0V4h3Z"
        fill="#191629"
      />
      <path d="M3 5h6v2h6V5h6v8h-3v3h-3v3H9v-3H6v-3H3Z" fill="#F797C4" />
      <path d="M4 6h4v3H4Z" fill="#FFE4EF" />
    </svg>
  );
}

function Brand({ compact = false }) {
  return (
    <a
      className="landing-brand"
      href="#intro"
      aria-label="star23sharp 처음으로"
    >
      <img src={landingAsset("brand-star")} alt="" width="40" height="40" />
      <span className="landing-brand-copy">
        <strong>star23sharp</strong>
        {!compact && <span># 더 좋은 나, 더 가까운 우리</span>}
      </span>
    </a>
  );
}

function StartButton({ onStart, small = false }) {
  return (
    <button
      type="button"
      className={`landing-start-button${small ? " landing-start-button-small" : ""}`}
      onClick={onStart}
    >
      지금 시작하기 <Arrow />
    </button>
  );
}

function PersonaPreview() {
  const [selectedStyle, setSelectedStyle] = useState("재밌는 대화");
  const styles = ["재밌는 대화", "진지한 대화", "편안한 대화", "기타"];

  return (
    <div className="landing-persona-preview">
      <p>
        어떤 스타일의
        <br />
        대화를 좋아하나요?
      </p>
      <fieldset
        className="landing-persona-options"
        aria-label="대화 스타일 예시"
      >
        {styles.map((style) => (
          <button
            type="button"
            key={style}
            onClick={() => setSelectedStyle(style)}
            aria-pressed={selectedStyle === style}
          >
            {style}
          </button>
        ))}
      </fieldset>
    </div>
  );
}

function PracticePreview() {
  return (
    <div className="landing-practice-preview">
      <div className="landing-preview-intro">
        <img src={landingAsset("avatar-boy")} alt="" width="40" height="40" />
        <p>
          처음 만난 상황에서
          <br />
          어떤 말을 건네볼까요?
        </p>
      </div>
      <div className="landing-chat-bubble">만나서 반가워 ☺️</div>
      <div className="landing-chat-bubble">요즘 어떻게 지내?</div>
      <div className="landing-typing" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function SimulationPreview() {
  return (
    <div className="landing-simulation-preview">
      <div className="landing-preview-intro">
        <img src={landingAsset("avatar-girl")} alt="" width="58" height="58" />
        <p className="landing-thought-bubble">
          이런 대화는
          <br />
          어때요?
        </p>
      </div>
      <ul>
        <li>내 대화 스타일 분석</li>
        <li>상대방의 반응 예측</li>
        <li>더 좋은 표현 제안</li>
      </ul>
    </div>
  );
}

function ConnectionPreview() {
  return (
    <div className="landing-connection-preview">
      <div className="landing-mini-confetti" aria-hidden="true">
        ✧ · ✦
      </div>
      <div className="landing-match-avatars">
        <span>
          <img
            src={landingAsset("avatar-girl")}
            alt=""
            width="57"
            height="57"
          />
        </span>
        <PixelHeart />
        <span>
          <img src={landingAsset("avatar-boy")} alt="" width="57" height="57" />
        </span>
      </div>
      <p>
        좋은 사람과
        <br />
        연결되었어요!
      </p>
    </div>
  );
}

const steps = [
  {
    title: "나를 알아요",
    preview: PersonaPreview,
    lines: ["간단한 질문으로", "나만의 AI 페르소나를 만들어요."],
  },
  {
    title: "AI와 연습해요",
    preview: PracticePreview,
    lines: ["다양한 상황에서", "AI와 대화를 연습해요."],
  },
  {
    title: "시뮬레이션으로 성장해요",
    preview: SimulationPreview,
    lines: ["AI가 피드백을 통해", "더 나은 대화를 도와줘요."],
  },
  {
    title: "진짜 인연을 만나요",
    preview: ConnectionPreview,
    lines: ["이제, 설레는 사람과", "진짜 대화를 시작해보세요."],
  },
];

export function LandingPage({ onStart }) {
  return (
    <div className="landing-page">
      <a className="landing-skip-link" href="#intro">
        서비스 소개로 바로가기
      </a>
      <header className="landing-header">
        <div className="landing-header-inner">
          <Brand />
          <nav className="landing-nav" aria-label="서비스 안내">
            <a href="#intro">서비스 소개</a>
            <a href="#features">주요 기능</a>
            <a href="#how-it-works">특별한 이유</a>
            <a href="#stories">리얼 스토리</a>
          </nav>
          <StartButton onStart={onStart} small />
        </div>
      </header>

      <main>
        <section
          className="landing-hero"
          id="intro"
          aria-labelledby="landing-title"
        >
          <div className="landing-hero-content">
            <p className="landing-hero-handwriting" lang="en">
              Better Conversations
              <br />
              <span>Brighter Relationships</span>
            </p>
            <h1 id="landing-title">
              <span>연애도</span>,
              <br />
              <span>연습</span>이 필요하니까.
            </h1>
            <p className="landing-hero-description">
              star23sharp는 AI와 함께 대화를 연습하고,
              <br className="landing-desktop-break" />
              진짜 사람과 이어지는 새로운 데이팅 경험을 만들어요.
            </p>
            <div className="landing-hero-action">
              <StartButton onStart={onStart} />
              <p className="landing-action-note">
                ← 좋은 대화가
                <br />
                <span>좋은 인연을 만든다!</span>
                <svg viewBox="0 0 88 31" fill="none" aria-hidden="true">
                  <path
                    d="M5 4c9 24 44 29 73 9m-12 1 13-2-5 11"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                </svg>
              </p>
            </div>
          </div>
        </section>

        <section
          className="landing-features"
          id="features"
          aria-label="주요 기능"
        >
          <div className="landing-features-inner">
            {features.map((feature) => (
              <article className="landing-feature" key={feature.icon}>
                <img
                  src={landingAsset(`feature-${feature.icon}`)}
                  alt=""
                  width="58"
                  height="58"
                  loading="lazy"
                />
                <h2>{feature.title}</h2>
                <p>
                  {feature.lines[0]}
                  <br />
                  {feature.lines[1]}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="landing-how"
          id="how-it-works"
          aria-labelledby="landing-how-title"
        >
          <div className="landing-section-heading">
            <h2 id="landing-how-title">
              How It Works <span>♡</span>
            </h2>
            <p>
              작은 대화가
              <br />
              <span>행복한 인연이 되는 곳,</span>
              <br />
              <span>star23sharp</span>
            </p>
          </div>
          <div className="landing-steps">
            {steps.map(({ title, preview: Preview, lines }, index) => (
              <article className="landing-step" key={title}>
                <h3>
                  <span>{`0${index + 1}`}</span>
                  {title}
                </h3>
                <div className="landing-step-preview">
                  <Preview />
                </div>
                <p className="landing-step-description">
                  {lines[0]}
                  <br />
                  {lines[1]}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="landing-stories"
          id="stories"
          aria-labelledby="landing-stories-title"
        >
          <h2 id="landing-stories-title">
            이런 시작을 상상해요 · 서비스 이용 예시
          </h2>
          <div className="landing-stories-inner">
            {stories.map((story) => (
              <figure className="landing-story" key={story.avatar}>
                <img
                  src={landingAsset(`avatar-${story.avatar}`)}
                  alt=""
                  width="62"
                  height="62"
                  loading="lazy"
                />
                <figcaption>
                  <blockquote>
                    “{story.lines[0]}
                    <br />
                    {story.lines[1]}”
                  </blockquote>
                  <p>— 대화 연습 예시</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section
          className="landing-closing"
          aria-labelledby="landing-closing-title"
        >
          <p className="landing-closing-handwriting" lang="en">
            More Conversations
            <br />
            <span>Brighter Tomorrows</span>
            <br />
            <span>– star23sharp ♡</span>
          </p>
          <div className="landing-closing-content">
            <h2 id="landing-closing-title">
              좋은 대화가,
              <br />더 좋은 내일을 만든다.
            </h2>
            <p>지금, star23sharp에서 시작해보세요.</p>
            <StartButton onStart={onStart} />
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-company">
            <Brand compact />
            <p>
              팀명, 회사명&nbsp; star23sharp <span aria-hidden="true">|</span>{" "}
              <a href="mailto:devteam17@star23sharp.com">
                문의 이메일 : devteam17@star23sharp.com
              </a>
            </p>
          </div>
          <a className="landing-footer-about" href="#intro">
            서비스 소개
          </a>
          <p className="landing-footer-motto" lang="en">
            Good People
            <br />
            Brighter Days
            <br />
            +23# ♡
          </p>
        </div>
      </footer>
    </div>
  );
}
