import { asset } from "../assets.js";
import { profilePhotoUrls } from "../utils.js";

export function Icon({ name, className = "" }) {
  return (
    <img
      className={`icon ${className}`}
      src={asset(name)}
      alt=""
      aria-hidden="true"
    />
  );
}

export function PixelButton({
  children,
  onClick,
  disabled = false,
  secondary = false,
  quiet = false,
  className = "",
  type = "button",
}) {
  return (
    <button
      type={type}
      className={`pixel-button ${secondary ? "secondary" : ""} ${quiet ? "quiet" : ""} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function ScreenHeader({ title, onBack, right, className = "" }) {
  return (
    <header className={`screen-header ${className}`}>
      <button
        type="button"
        className="header-back"
        onClick={onBack}
        aria-label="뒤로가기"
      >
        ‹
      </button>
      <strong>{title}</strong>
      <div className="header-right">{right}</div>
    </header>
  );
}

const tabItems = [
  ["HOME", "/home", "nav-home.svg"],
  ["LIKES", "/likes", "nav-heart.svg"],
  ["CHAT", "/chats", "nav-chat.svg"],
  ["MY", "/my", "nav-person.svg"],
];

export function BottomNav({ path, navigate, onRefreshHome }) {
  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      {tabItems.map(([label, href, icon]) => {
        const disabled = href === "/my";
        return (
          <button
            type="button"
            key={href}
            className={path.startsWith(href) ? "active" : ""}
            onClick={() => {
              if (href === "/home") {
                navigate(href);
                onRefreshHome?.();
                return;
              }
              navigate(href);
            }}
            disabled={disabled}
            aria-current={path.startsWith(href) ? "page" : undefined}
          >
            <Icon name={icon} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function Field({ label, children, hint, error }) {
  return (
    <fieldset className="field">
      <legend className="field-label">{label}</legend>
      {children}
      {hint && <small className="hint">{hint}</small>}
      {error && <small className="field-error">{error}</small>}
    </fieldset>
  );
}

export function ChoiceGroup({ options, value, onChange, className = "" }) {
  return (
    <div className={`choice-group ${className}`}>
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          className={`choice ${value === key ? "selected" : ""}`}
          onClick={() => onChange(key)}
          aria-pressed={value === key}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon = "♡", title, description, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function PersonAvatar({ person, size = "medium" }) {
  return person?.photo || person?.image ? (
    <img
      className={`person-avatar ${size}`}
      src={person.photo || person.image}
      alt=""
    />
  ) : (
    <span className={`person-avatar generated ${size}`} aria-hidden="true">
      ♥
    </span>
  );
}

export function ProfilePhoto({ person, index = 0, className = "" }) {
  const source = profilePhotoUrls(person)[index] || "";
  const [failedSources, setFailedSources] = useState(() => new Set());

  if (!source || failedSources.has(source)) {
    return (
      <div
        className={`${className} recommendation-placeholder`}
        role="img"
        aria-label={`${person?.nickname || "프로필"}님의 사진이 없어요`}
      >
        <span aria-hidden="true">♥</span>
      </div>
    );
  }

  return (
    <img
      className={className}
      src={source}
      alt={`${person?.nickname || "프로필"}님의 프로필 사진`}
      onError={() =>
        setFailedSources((previous) => new Set(previous).add(source))
      }
    />
  );
}

export function PhotoSegments({ person, index, onSelect, className = "" }) {
  const photos = profilePhotoUrls(person);
  if (!photos.length) return null;

  return (
    <nav className={`photo-steps ${className}`} aria-label="프로필 사진">
      {photos.map((photo, photoIndex) => (
        <button
          key={`${person.id}-${photo}`}
          type="button"
          className={photoIndex === index ? "active" : ""}
          aria-label={`사진 ${photoIndex + 1} 보기`}
          aria-pressed={photoIndex === index}
          onClick={() => onSelect(photoIndex)}
        />
      ))}
    </nav>
  );
}
