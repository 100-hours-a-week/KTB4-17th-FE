import { PixelIcon } from "../../shared/ui/pixel.jsx";
import { STYLE_DETAIL_LABELS, STYLE_LIST_LABELS } from "./model.js";

export function PersonaConversationStyle({ style, source }) {
  if (!style) return null;
  const expressions = Object.entries(STYLE_LIST_LABELS).filter(
    ([field]) => style[field].length,
  );
  const details = Object.entries(STYLE_DETAIL_LABELS).filter(
    ([field]) => style[field],
  );
  return (
    <section className="persona-style" aria-labelledby="persona-style-title">
      <div className="persona-style-heading">
        <PixelIcon name="chat" scale={3} />
        <div>
          <h2 id="persona-style-title" tabIndex={-1}>
            나의 말투와 대화 습관
          </h2>
          <p>
            {source === "kakao"
              ? "카카오톡 대화에서 반영된 말투예요."
              : "실제 대화에서 관찰된 표현과 습관이에요."}
          </p>
        </div>
      </div>
      {style.summary && (
        <p className="persona-style-summary">{style.summary}</p>
      )}
      {expressions.map(([field, label]) => (
        <div className="persona-style-expressions" key={field}>
          <h3>{label}</h3>
          <ul>
            {style[field].map((text) => (
              <li key={text}>
                {field === "frequentPhrases" ? <q>{text}</q> : text}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {details.length > 0 && (
        <dl className="persona-style-details">
          {details.map(([field, label]) => (
            <div key={field}>
              <dt>{label}</dt>
              <dd>{style[field]}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
