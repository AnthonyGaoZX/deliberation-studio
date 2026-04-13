import type { DebateTurn } from "@/types/debate";

export function buildCsv(transcript: DebateTurn[]) {
  return [
    ["round", "phase", "speaker", "role", "position", "reason", "evidence", "response", "conclusion"].join(","),
    ...transcript.map((turn) =>
      [
        turn.round,
        turn.phase,
        `"${turn.speaker}"`,
        `"${turn.roleName}"`,
        `"${turn.currentPosition ?? ""}"`,
        `"${turn.keyReason.replaceAll('"', '""')}"`,
        `"${turn.evidence.replaceAll('"', '""')}"`,
        `"${turn.responseToOthers.replaceAll('"', '""')}"`,
        `"${turn.interimConclusion.replaceAll('"', '""')}"`,
      ].join(","),
    ),
  ].join("\n");
}

export function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
