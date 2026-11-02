"use client";

import { FIELD_ORDER, type FieldKey } from "./call-script";
import { toolRowText } from "./transcript-panel";
import c from "./console.module.css";

export type CapturedField = { value: string; pending?: boolean; seq?: number };
export type Outcome = {
  id: string;
  tool: string;
  state: "running" | "done" | "failed";
  detail: string;
};

type CapturePanelProps = {
  fields: Partial<Record<FieldKey, CapturedField>>;
  outcomes: Outcome[];
  /** "Waiting", "Listening…" etc. for fields not yet heard. */
  placeholder: string;
  actionsLabel: string;
  emptyActions: string;
  footnote: string;
};

function Arrow() {
  return (
    <svg className={c.arrow} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

export default function CapturePanel({
  fields,
  outcomes,
  placeholder,
  actionsLabel,
  emptyActions,
  footnote,
}: CapturePanelProps) {
  const filled = FIELD_ORDER.filter(({ key }) => fields[key] && !fields[key]?.pending).length;

  return (
    <>
      <div className={c.captureBody}>
        <div>
          <div className={c.colHead}>
            <span>Captured details</span>
            <b aria-label={`${filled} of ${FIELD_ORDER.length} details captured`}>
              {filled}/{FIELD_ORDER.length}
            </b>
          </div>
          <dl className={c.fields}>
            {FIELD_ORDER.map(({ key, label }) => {
              const field = fields[key];
              return (
                <div
                  className={field ? `${c.field} ${c.fresh}` : c.field}
                  data-empty={!field}
                  data-pending={Boolean(field?.pending)}
                  // A new key restarts the highlight exactly once per update.
                  key={`${key}-${field?.seq ?? "empty"}-${field?.value ?? ""}`}
                >
                  <dt>{label}</dt>
                  <dd>{field ? field.value : placeholder}</dd>
                </div>
              );
            })}
          </dl>
        </div>
        <div>
          <div className={`${c.colHead} ${c.actionsHead}`}>
            <span>{actionsLabel}</span>
            <b>{outcomes.filter((item) => item.state === "done").length}</b>
          </div>
          <div className={c.outcomes} aria-live="polite">
            {outcomes.length === 0 ? (
              <p className={c.outcomesEmpty}>{emptyActions}</p>
            ) : (
              outcomes.map((outcome) => (
                <div className={c.outcome} data-state={outcome.state} key={outcome.id}>
                  <div className={c.outcomeTop}>
                    <code>{outcome.tool}</code>
                    <span className={c.status} aria-hidden="true">
                      {outcome.state === "running" ? (
                        <span className={c.spinner} />
                      ) : outcome.state === "done" ? (
                        <svg className={c.check} viewBox="0 0 16 16">
                          <path d="m3.5 8.5 3 3 6-7" />
                        </svg>
                      ) : null}
                    </span>
                  </div>
                  <strong className={c.outcomeResult}>
                    <Arrow />
                    {toolRowText(outcome.tool, outcome.state)}
                  </strong>
                  {outcome.detail ? <small>{outcome.detail}</small> : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      <p className={c.footnote}>{footnote}</p>
    </>
  );
}
