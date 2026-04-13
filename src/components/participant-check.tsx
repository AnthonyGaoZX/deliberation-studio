import type { Locale, ParticipantConfig, RunStatus } from "@/types/debate";
import type { ParticipantCheckState } from "@/types/ui";
import { text } from "@/lib/text-helpers";

export function ParticipantCheckControls({
  participant,
  locale,
  status,
  checkState,
  onCheck,
}: {
  participant: ParticipantConfig;
  locale: Locale;
  status: RunStatus;
  checkState?: ParticipantCheckState;
  onCheck: (participantId: string, mode: "output" | "search") => void;
}) {
  const isLoading = checkState?.status === "loading";

  return (
    <div className="mini-actions">
      <button
        type="button"
        className="button button-secondary"
        disabled={status === "running" || isLoading}
        onClick={() => onCheck(participant.id, "output")}
      >
        {text(locale, "测试输出", "Test output")}
      </button>
      <button
        type="button"
        className="button button-secondary"
        disabled={status === "running" || isLoading}
        onClick={() => onCheck(participant.id, "search")}
      >
        {text(locale, "测试联网", "Test web search")}
      </button>
      {checkState ? (
        <p className={checkState.status === "error" ? "score-note" : "search-note"}>
          {checkState.message}
        </p>
      ) : null}
    </div>
  );
}
