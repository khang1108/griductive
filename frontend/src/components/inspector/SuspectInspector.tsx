import React, { useEffect, useId, useState } from "react";
import {
  AlertOctagon,
  Bookmark,
  Eraser,
  Loader2,
  Pencil,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { soundEngine } from "../../audio/soundEngine";
import type { NotePatch } from "../../hooks/usePlayerNotes";
import type {
  CellData,
  PlayerNote,
  VerdictAssessmentType,
  VerdictStatus,
} from "../../types";
import { ModalFrame } from "../modals/ModalFrame";

export interface SuspectInspectorProps {
  cell: CellData | null;
  note: PlayerNote | null;
  isPending: boolean;
  actionsDisabled: boolean;
  isMobile: boolean;
  isTablet: boolean;
  rejectedAssessment?: VerdictAssessmentType | null;
  rejectRunId?: number;
  isClueHighlighted?: boolean;
  onSubmitVerdict: (coord: string, status: VerdictStatus) => void | Promise<void>;
  onHighlightClue?: (cell: CellData) => void;
  onUpdateNote: (coord: string, patch: NotePatch) => void;
  onClearNote: (coord: string) => void;
  onClose: () => void;
}

export const SuspectInspector: React.FC<SuspectInspectorProps> = ({
  cell,
  note,
  isPending,
  actionsDisabled,
  isMobile,
  isTablet,
  rejectedAssessment = null,
  rejectRunId = 0,
  isClueHighlighted = false,
  onSubmitVerdict,
  onHighlightClue,
  onUpdateNote,
  onClearNote,
  onClose,
}) => {
  const titleId = useId();
  const noteInputId = useId();
  const [submittingStatus, setSubmittingStatus] =
    useState<VerdictStatus | null>(null);
  const [noteInputOpen, setNoteInputOpen] = useState(false);

  useEffect(() => {
    setSubmittingStatus(null);
    setNoteInputOpen(Boolean(note?.text?.trim()));
  }, [cell?.coord]);

  useEffect(() => {
    if (!isPending) {
      setSubmittingStatus(null);
    }
  }, [isPending]);

  if (!cell) return null;

  const isSheetMode = isMobile || isTablet;
  const flagReview = note?.flagReview ?? false;
  const hypothesis = note?.hypothesis ?? null;
  const noteText = note?.text ?? "";
  const hasAnyNote = Boolean(
    flagReview || hypothesis !== null || noteText.trim().length > 0
  );
  const verdictDisabled = isPending || actionsDisabled;

  const isRejectedActive = Boolean(
    !cell.is_revealed &&
      rejectedAssessment &&
      rejectedAssessment !== "PROVABLE" &&
      rejectedAssessment !== "ALREADY_SOLVED"
  );
  const isContradictedReject =
    rejectedAssessment === "CONTRADICTED" ||
    rejectedAssessment === "INCONSISTENT";

  const cardNudgeClass = isRejectedActive
    ? rejectRunId % 2 === 0
      ? "animate-reject-nudge-a"
      : "animate-reject-nudge-b"
    : "";

  const handleVerdictClick = (status: VerdictStatus) => {
    if (verdictDisabled) return;
    setSubmittingStatus(status);
    void Promise.resolve(onSubmitVerdict(cell.coord, status)).finally(() => {
      setSubmittingStatus((prev) => (prev === status ? null : prev));
    });
  };

  const cardBody = (
    <div
      key={cell.coord}
      className={`animate-panel-in relative flex flex-col max-h-full overflow-hidden rounded-t-2xl sm:rounded-2xl border paper-fiber text-[#1F1B16] lamp-panel-shadow ${
        isRejectedActive
          ? isContradictedReject
            ? "border-[#8C2820]"
            : "border-[#A65A16]"
          : "border-[#B5A284]/65"
      }`}
    >
      {/* Transient Ink Wash + Rubber Stamp Printed Directly onto Card (Zero Notification Box) */}
      {isRejectedActive && (
        <div
          key={`inspector-reject-${rejectRunId}`}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-30 flex items-start justify-end p-3 pt-4"
        >
          <div
            className={`absolute inset-0 animate-reject-wash ${
              isContradictedReject
                ? "bg-[#8C2820]/[0.11]"
                : "bg-[#B86314]/[0.11]"
            }`}
          />
          <span
            className={`relative mr-7 mt-1 inline-flex items-center justify-center rounded-[4px] border-2 px-2.5 py-1 font-mono text-[10.5px] font-extrabold uppercase tracking-[0.12em] shadow-[0_4px_12px_rgba(20,12,6,0.28)] outline-1 -outline-offset-[3px] outline-dashed animate-reject-imprint ${
              isContradictedReject
                ? "border-[#8C2820] text-[#8C2820] bg-[#F6E1DD]/96 outline-[#8C2820]/45"
                : "border-[#9A4E12] text-[#8A430D] bg-[#F5E8CE]/96 outline-[#9A4E12]/45"
            }`}
          >
            {isContradictedReject ? "CONTRADICTED" : "NOT PROVABLE"}
          </span>
        </div>
      )}

      {/* Compact Dossier Identity Header */}
      <div className="relative z-10 p-3.5 pb-3 flex items-start justify-between gap-3 border-b border-[#52473A]/16">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-13 h-13 shrink-0 rounded-xl overflow-hidden border border-[#7A6751]/65 bg-[#D9C9A9] shadow-xs">
            <img
              src={cell.avatar_url}
              alt={cell.name}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-[#211B16] text-[#E5BC74]">
                {cell.coord}
              </span>
              {cell.is_revealed && cell.status && (
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-mono text-[10px] font-extrabold uppercase tracking-wider ${
                    cell.status === "INNOCENT"
                      ? "border-[#1B594C] bg-[#1B594C]/10 text-[#1B594C]"
                      : "border-[#8C2820] bg-[#8C2820]/10 text-[#8C2820]"
                  }`}
                >
                  {cell.status === "INNOCENT" ? (
                    <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                  ) : (
                    <AlertOctagon className="w-3 h-3" aria-hidden="true" />
                  )}
                  <span>{cell.status}</span>
                </span>
              )}
            </div>

            <h2
              id={titleId}
              className="font-serif text-lg font-bold leading-tight text-[#1F1B16] truncate"
            >
              {cell.name}
            </h2>
            <p className="text-xs italic text-[#52473A] truncate">
              {cell.profession}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close suspect card"
          className="btn-tactile relative z-40 inline-flex items-center justify-center w-7 h-7 rounded-full text-[#52473A] hover:text-[#1F1B16] hover:bg-black/[0.07] cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Body: Either Confirmed Statement OR Crisp Two-Button Verdict + Compact Pencil Row */}
      <div className="relative z-10 p-3.5 flex flex-col gap-3 overflow-y-auto">
        {cell.is_revealed ? (
          <div className="flex flex-col gap-2.5">
            <p className="text-[14px] leading-relaxed font-medium text-[#1F1B16] bg-[#F6EFE0]/85 rounded-xl border border-[#B5A284]/55 p-3">
              &ldquo;{cell.clue_text || "No statement recorded."}&rdquo;
            </p>

            {cell.referenced_coords.length > 0 && onHighlightClue && (
              <button
                type="button"
                onClick={() => onHighlightClue(cell)}
                aria-pressed={isClueHighlighted}
                className={`btn-tactile w-full inline-flex items-center justify-center gap-1.5 h-[38px] px-3 rounded-xl border text-xs font-bold cursor-pointer ${
                  isClueHighlighted
                    ? "bg-[#2C2319] border-[#D1A45D] text-[#E5BC74]"
                    : "bg-[#211B16] border-[#3A2E25] text-[#F4ECDD] hover:bg-[#2C241D]"
                }`}
              >
                <Sparkles
                  className="w-3.5 h-3.5 text-[#E5BC74]"
                  aria-hidden="true"
                />
                <span>
                  {isClueHighlighted
                    ? "Highlighted on Board"
                    : "Highlight on Board"}
                </span>
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className={`grid grid-cols-2 gap-2 ${cardNudgeClass}`}>
              <button
                type="button"
                onClick={() => handleVerdictClick("INNOCENT")}
                disabled={verdictDisabled}
                aria-busy={isPending && submittingStatus === "INNOCENT"}
                className="btn-tactile inline-flex items-center justify-center gap-1.5 h-[42px] px-3 rounded-xl border border-[#134238] bg-[#1B594C] hover:bg-[#16493E] text-[#F4ECDD] text-xs font-bold tracking-wide cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
              >
                {isPending &&
                (submittingStatus === "INNOCENT" ||
                  submittingStatus === null) ? (
                  <Loader2
                    className="w-3.5 h-3.5 animate-spin shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>Innocent</span>
              </button>

              <button
                type="button"
                onClick={() => handleVerdictClick("CRIMINAL")}
                disabled={verdictDisabled}
                aria-busy={isPending && submittingStatus === "CRIMINAL"}
                className="btn-tactile inline-flex items-center justify-center gap-1.5 h-[42px] px-3 rounded-xl border border-[#611B15] bg-[#8C2820] hover:bg-[#76211A] text-[#F4ECDD] text-xs font-bold tracking-wide cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
              >
                {isPending &&
                (submittingStatus === "CRIMINAL" ||
                  submittingStatus === null) ? (
                  <Loader2
                    className="w-3.5 h-3.5 animate-spin shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <AlertOctagon
                    className="w-3.5 h-3.5 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <span>Criminal</span>
              </button>
            </div>

            {/* Quiet Single-Row Pencil Scratchpad */}
            <div className="pt-2 border-t border-[#52473A]/15 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-semibold text-[#5B4F40]">
                  Mark
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playPencilTick();
                      onUpdateNote(cell.coord, {
                        hypothesis:
                          hypothesis === "INNOCENT" ? null : "INNOCENT",
                      });
                    }}
                    aria-pressed={hypothesis === "INNOCENT"}
                    className={`btn-tactile h-[28px] px-2 rounded-lg border text-[11px] font-bold cursor-pointer ${
                      hypothesis === "INNOCENT"
                        ? "bg-[#1B594C] border-[#134238] text-[#F4ECDD]"
                        : "bg-[#E5D8BD] border-[#9B8D7A]/60 text-[#3B3227] hover:bg-[#DDD0B2]"
                    }`}
                  >
                    Inno?
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playPencilTick();
                      onUpdateNote(cell.coord, {
                        hypothesis:
                          hypothesis === "CRIMINAL" ? null : "CRIMINAL",
                      });
                    }}
                    aria-pressed={hypothesis === "CRIMINAL"}
                    className={`btn-tactile h-[28px] px-2 rounded-lg border text-[11px] font-bold cursor-pointer ${
                      hypothesis === "CRIMINAL"
                        ? "bg-[#8C2820] border-[#611B15] text-[#F4ECDD]"
                        : "bg-[#E5D8BD] border-[#9B8D7A]/60 text-[#3B3227] hover:bg-[#DDD0B2]"
                    }`}
                  >
                    Crim?
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playPencilTick();
                      onUpdateNote(cell.coord, { flagReview: !flagReview });
                    }}
                    aria-pressed={flagReview}
                    aria-label="Bookmark suspect"
                    title="Bookmark suspect"
                    className={`btn-tactile inline-flex items-center justify-center w-[28px] h-[28px] rounded-lg border cursor-pointer ${
                      flagReview
                        ? "bg-[#352A1D] border-[#D1A45D] text-[#E5BC74]"
                        : "bg-[#E5D8BD] border-[#9B8D7A]/60 text-[#52473A] hover:bg-[#DDD0B2]"
                    }`}
                  >
                    <Bookmark className="w-3 h-3" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setNoteInputOpen((v) => !v)}
                    aria-pressed={noteInputOpen || Boolean(noteText.trim())}
                    aria-label="Toggle note input"
                    title="Write short note"
                    className={`btn-tactile inline-flex items-center justify-center w-[28px] h-[28px] rounded-lg border cursor-pointer ${
                      noteInputOpen || noteText.trim()
                        ? "bg-[#352A1D] border-[#D1A45D] text-[#E5BC74]"
                        : "bg-[#E5D8BD] border-[#9B8D7A]/60 text-[#52473A] hover:bg-[#DDD0B2]"
                    }`}
                  >
                    <Pencil className="w-3 h-3" aria-hidden="true" />
                  </button>

                  {hasAnyNote && (
                    <button
                      type="button"
                      onClick={() => {
                        onClearNote(cell.coord);
                        setNoteInputOpen(false);
                      }}
                      aria-label="Clear personal mark"
                      title="Clear mark"
                      className="btn-tactile inline-flex items-center justify-center w-[28px] h-[28px] rounded-lg border border-[#9B8D7A]/60 bg-[#E5D8BD] text-[#52473A] hover:text-[#1F1B16] cursor-pointer"
                    >
                      <Eraser className="w-3 h-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>

              {(noteInputOpen || noteText.length > 0) && (
                <div>
                  <label htmlFor={noteInputId} className="sr-only">
                    Note for {cell.coord}
                  </label>
                  <input
                    id={noteInputId}
                    type="text"
                    maxLength={90}
                    value={noteText}
                    onChange={(e) =>
                      onUpdateNote(cell.coord, { text: e.target.value })
                    }
                    placeholder="Short pencil note…"
                    className="w-full rounded-lg border border-[#8A7963]/70 bg-[#F6EFE0] px-2.5 py-1.5 text-xs text-[#1F1B16] placeholder:text-[#6B5D4B]"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (isSheetMode) {
    return (
      <ModalFrame
        isOpen={true}
        onClose={onClose}
        labelledBy={titleId}
        variant="sheet"
        backdropClassName="bg-black/60"
        containerClassName="w-full sm:max-w-[360px] max-h-[82vh] flex flex-col"
      >
        {cardBody}
      </ModalFrame>
    );
  }

  return (
    <aside
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
      className="fixed left-4 top-[66px] z-30 w-[284px] max-h-[calc(100vh-9.5rem)] flex flex-col"
    >
      {cardBody}
    </aside>
  );
};
