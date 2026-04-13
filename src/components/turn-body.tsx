import type { DebateTurn } from "@/types/debate";
import ReactMarkdown from "react-markdown";

export function TurnBody({ turn }: { turn: DebateTurn }) {
  return (
    <div className="markdown-copy">
      <ReactMarkdown>{turn.content}</ReactMarkdown>
    </div>
  );
}
