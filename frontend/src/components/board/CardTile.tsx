import React, { useState } from "react";
import {
  AlertOctagon,
  Bookmark,
  Loader2,
  Pencil,
  ShieldCheck,
} from "lucide-react";
import type { BoardLayoutMetrics } from "../../layout/boardLayout";
import type {
  CellData,
  PlayerNote,
  VerdictAssessmentType,
} from "../../types";

export interface CardTileProps {
  cell: CellData;
  layout: BoardLayoutMetrics;
  dealDelayMs?: number;
  isSelected: boolean;
  isReferenced: boolean;
  isHinted: boolean;
  isPending: boolean;
  isStampAnimating: boolean;
  isRejected: boolean;
  rejectedAssessment?: VerdictAssessmentType | null;
  rejectRunId?: number;
  note?: PlayerNote;
  actionsDisabled?: boolean;
  tabIndex: number;
  buttonRef?: (el: HTMLButtonElement | null) => void;
  onSelect: (coord: string) => void;
  onFocusCell?: (coord: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
}

function getNoteBadge(note: PlayerNote | undefined): {
  shortText: string;
  toneClass: string;
  ariaText: string;
  isFlagOnly: boolean;
} | null {
  if (!note) return null;
  const trimmedText = note.text.trim();
  const hasAny = Boolean(note.hypothesis || note.flagReview || trimmedText);
  if (!hasAny) return null;

  const parts: string[] = [];
  if (note.flagReview) parts.push("marked for review");
  if (note.hypothesis === "CRIMINAL") parts.push("marked Criminal?");
  if (note.hypothesis === "INNOCENT") parts.push("marked Innocent?");
  if (trimmedText) parts.push(`note "${trimmedText}"`);

  if (note.hypothesis === "CRIMINAL") {
    return {
      shortText: "C?",
      toneClass: "text-[#8C2820] border-[#8C2820]/45 bg-[#8C2820]/10",
      ariaText: parts.join(", "),
      isFlagOnly: false,
    };
  }
  if (note.hypothesis === "INNOCENT") {
    return {
      shortText: "I?",
      toneClass: "text-[#1B594C] border-[#1B594C]/45 bg-[#1B594C]/10",
      ariaText: parts.join(", "),
      isFlagOnly: false,
    };
  }
  return {
    shortText: "",
    toneClass: "text-[#6B5842] border-[#6B5842]/40 bg-[#6B5842]/10",
    ariaText: parts.join(", "),
    isFlagOnly: note.flagReview && !trimmedText,
  };
}

function getInitials(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "?";
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return `${tokens[0][0]}${tokens[tokens.length - 1][0]}`.toUpperCase();
}

export const CardTile: React.FC<CardTileProps> = ({
  cell,
  layout,
  dealDelayMs = 0,
  isSelected,
  isReferenced,
  isHinted,
  isPending,
  isStampAnimating,
  isRejected,
  rejectedAssessment = null,
  rejectRunId = 0,
  note,
  actionsDisabled = false,
  tabIndex,
  buttonRef,
  onSelect,
  onFocusCell,
  onKeyDown,
}) => {
  const [avatarFailed, setAvatarFailed] = useState(false);

  // Strict public-data invariant: never read status/clue fields unless server-revealed
  const isRevealed = cell.is_revealed;
  const confirmedStatus = isRevealed ? cell.status : null;
  const isInnocent = confirmedStatus === "INNOCENT";
  const isCriminal = confirmedStatus === "CRIMINAL";
  const clueText = isRevealed ? cell.clue_text : null;

  const isCompact = layout.compact || layout.cardWidth < 116;
  const isMicro = layout.cardWidth < 76 || layout.cardHeight < 86;
  const isUltraTiny = layout.cardWidth < 58 || layout.cardHeight < 58;

  const noteBadge = getNoteBadge(note);

  const statusAriaLabel = isInnocent
    ? "Confirmed Innocent"
    : isCriminal
      ? "Confirmed Criminal"
      : "Unconfirmed suspect";

  const ariaSegments = [`${cell.coord}, ${cell.name}`, statusAriaLabel];
  if (isRevealed && clueText) ariaSegments.push("Clue available");
  if (isReferenced) ariaSegments.push("Highlighted by active clue");
  if (isHinted) ariaSegments.push("Suggested by hint");
  if (noteBadge) ariaSegments.push(noteBadge.ariaText);
  if (isPending) ariaSegments.push("Verifying verdict");

  const handleClick = () => {
    if (isPending) return;
    onSelect(cell.coord);
  };

  const avatarPx = isUltraTiny
    ? 0
    : isMicro
      ? Math.max(24, Math.min(36, Math.floor(layout.cardHeight * 0.36)))
      : isCompact
        ? Math.max(34, Math.min(50, Math.floor(layout.cardHeight * 0.39)))
        : Math.max(48, Math.min(68, Math.floor(layout.cardHeight * 0.39)));

  const isContradictedReject =
    rejectedAssessment === "CONTRADICTED" ||
    rejectedAssessment === "INCONSISTENT";

  const borderToneClass = isRejected
    ? isContradictedReject
      ? "border-[#8C2820]"
      : "border-[#A65A16]"
    : isSelected
      ? "border-[#D1A45D]"
      : isInnocent
        ? "border-[#1B594C]/50"
        : isCriminal
          ? "border-[#8C2820]/50"
          : "border-[#52473A]/32";

  const rejectNudgeClass = isRejected
    ? rejectRunId % 2 === 0
      ? "animate-reject-nudge-a"
      : "animate-reject-nudge-b"
    : "";

  const surfaceShadowClass = isSelected
    ? "lamp-card-shadow-lifted"
    : "lamp-card-shadow";

  const cardStyle = {
    width: layout.cardWidth,
    height: layout.cardHeight,
    minWidth: 44,
    minHeight: 44,
    "--deal-delay": `${dealDelayMs}ms`,
  } as React.CSSProperties;

  return (
    <button
      ref={buttonRef}
      type="button"
      tabIndex={tabIndex}
      data-selected={isSelected ? "true" : "false"}
      aria-label={ariaSegments.join(", ")}
      aria-pressed={isSelected}
      aria-busy={isPending}
      disabled={actionsDisabled && !isRevealed && !isSelected}
      onClick={handleClick}
      onFocus={() => onFocusCell?.(cell.coord)}
      onKeyDown={onKeyDown}
      style={cardStyle}
      className={`dossier-card animate-card-deal group relative rounded-[8px] text-left select-none focus-ring-amber overflow-visible ${
        isPending ? "cursor-wait" : "cursor-pointer"
      } ${rejectNudgeClass}`}
    >
      {/* Hinted outer spotlight halo */}
      {isHinted && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-[3px] rounded-[11px] hint-pulse-ring z-0"
        />
      )}

      {/* Selected crisp amber rim */}
      {isSelected && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-[2px] rounded-[10px] border-2 border-[#E5BC74] z-20"
        />
      )}

      {/* Aged Archival Paper Surface */}
      <div
        className={`relative w-full h-full rounded-[8px] border paper-fiber text-[#1F1B16] overflow-hidden flex flex-col justify-between ${borderToneClass} ${surfaceShadowClass} ${
          isCompact ? (isMicro ? "p-1" : "p-1.5") : "p-2"
        }`}
      >
        {/* Subtle confirmed ink wash */}
        {isInnocent && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[#1B594C]/[0.055]"
          />
        )}
        {isCriminal && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[#8C2820]/[0.055]"
          />
        )}

        {/* Active clue reference highlight wash */}
        {isReferenced && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[#D1A45D]/[0.13] z-10"
          />
        )}

        {/* Transient ink wash when a rejected verdict stamps onto the card */}
        {isRejected && !isRevealed && (
          <div
            key={`wash-${rejectRunId}`}
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 z-20 animate-reject-wash ${
              isContradictedReject
                ? "bg-[#8C2820]/[0.15]"
                : "bg-[#B86314]/[0.15]"
            }`}
          />
        )}

        {/* Top row: Coordinate + Optional Minimal Pencil Mark / Spinner (NO redundant ? or doc clutter) */}
        <div className="relative z-20 w-full flex items-center justify-between gap-1 leading-none shrink-0 min-h-[14px]">
          <span
            className={`font-mono font-bold tracking-tight ${
              isSelected || isRevealed ? "text-[#1F1B16]" : "text-[#52473A]"
            } ${
              isMicro ? "text-[9px]" : isCompact ? "text-[10px]" : "text-[10.5px]"
            }`}
          >
            {cell.coord}
          </span>

          {isPending ? (
            <Loader2
              aria-hidden="true"
              className="w-3 h-3 text-[#52473A] animate-spin shrink-0"
            />
          ) : noteBadge ? (
            <span
              aria-hidden="true"
              className={`inline-flex items-center gap-0.5 rounded px-1 py-[1px] border font-mono font-bold leading-none ${noteBadge.toneClass} ${
                isMicro ? "text-[8px]" : "text-[9px]"
              }`}
              title={noteBadge.ariaText}
            >
              {noteBadge.shortText ? (
                <span>{noteBadge.shortText}</span>
              ) : noteBadge.isFlagOnly ? (
                <Bookmark className="w-2.5 h-2.5 fill-current" />
              ) : (
                <Pencil className="w-2.5 h-2.5" />
              )}
            </span>
          ) : null}
        </div>

        {/* Center: Suspect Portrait + Official Angled Ink Stamp */}
        <div className="relative z-10 flex-1 min-h-0 flex items-center justify-center my-0.5">
          {avatarPx > 0 && (
            <div
              style={{ width: avatarPx, height: avatarPx }}
              className={`relative rounded-[6px] overflow-hidden border bg-[#DED0B4] shrink-0 ${
                isSelected ? "border-[#9B6E2A]" : "border-[#52473A]/30"
              }`}
            >
              {!avatarFailed && cell.avatar_url ? (
                <img
                  src={cell.avatar_url}
                  alt=""
                  onError={() => setAvatarFailed(true)}
                  decoding="async"
                  className={`dossier-portrait w-full h-full object-cover ${
                    isRevealed ? "opacity-100" : "opacity-92 sepia-[0.06]"
                  }`}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-serif font-bold text-[11px] text-[#52473A]">
                  {getInitials(cell.name)}
                </div>
              )}
            </div>
          )}

          {/* Physical Angled Ink Stamp (ONLY when server proven) */}
          {isRevealed && confirmedStatus && (
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 flex items-center justify-center z-20 ${
                avatarPx > 0 ? "bottom-0" : "inset-y-0"
              } ${isStampAnimating ? "animate-stamp-slam" : "-rotate-4"}`}
            >
              <span
                className={`inline-flex items-center gap-0.5 rounded-[3px] border-[1.5px] font-mono font-extrabold uppercase tracking-wider shadow-[0_1px_2px_rgba(33,29,24,0.2)] ${
                  isInnocent
                    ? "border-[#1B594C] text-[#1B594C] bg-[#ECE0C8]/94"
                    : "border-[#8C2820] text-[#8C2820] bg-[#ECE0C8]/94"
                } ${
                  isUltraTiny
                    ? "px-1 py-0.5 text-[7.5px]"
                    : isMicro
                      ? "px-1 py-[1px] text-[7.5px]"
                      : isCompact
                        ? "px-1.5 py-[1px] text-[8px]"
                        : "px-2 py-0.5 text-[9px]"
                }`}
              >
                {isInnocent ? (
                  <ShieldCheck
                    className={
                      isMicro ? "w-2.5 h-2.5 shrink-0" : "w-3 h-3 shrink-0"
                    }
                  />
                ) : (
                  <AlertOctagon
                    className={
                      isMicro ? "w-2.5 h-2.5 shrink-0" : "w-3 h-3 shrink-0"
                    }
                  />
                )}
                {!isUltraTiny && (
                  <span>
                    {isMicro
                      ? isInnocent
                        ? "INNO"
                        : "CRIM"
                      : confirmedStatus}
                  </span>
                )}
              </span>
            </div>
          )}

          {/* Transient Archival Rejection Stamp Imprinted Directly onto Card */}
          {isRejected && !isRevealed && (
            <div
              key={`reject-stamp-${rejectRunId}`}
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 inset-y-0 flex items-center justify-center z-30 animate-reject-imprint"
            >
              <span
                className={`inline-flex items-center justify-center rounded-[3px] border-[1.75px] font-mono font-extrabold uppercase tracking-wider whitespace-nowrap shadow-[0_3px_10px_rgba(20,12,6,0.28)] outline-1 -outline-offset-[3px] outline-dashed ${
                  isContradictedReject
                    ? "border-[#8C2820] text-[#8C2820] bg-[#F6E1DD]/96 outline-[#8C2820]/45"
                    : "border-[#9A4E12] text-[#8A430D] bg-[#F5E8CE]/96 outline-[#9A4E12]/45"
                } ${
                  isUltraTiny
                    ? "px-1 py-0.5 text-[7px]"
                    : isMicro
                      ? "px-1.5 py-[2px] text-[7.5px]"
                      : isCompact
                        ? "px-1.5 py-0.5 text-[8.5px]"
                        : "px-2 py-1 text-[9.5px]"
                }`}
              >
                {isContradictedReject
                  ? layout.cardWidth < 112
                    ? "INVALID"
                    : "CONTRADICTED"
                  : layout.cardWidth < 112
                    ? "UNPROVEN"
                    : "NOT PROVABLE"}
              </span>
            </div>
          )}
        </div>

        {/* Bottom: Suspect Name + Profession or Clue Preview */}
        <div className="relative z-20 w-full text-center min-w-0 shrink-0">
          <div
            className={`font-serif font-bold text-[#1F1B16] truncate leading-tight ${
              isMicro
                ? "text-[9.5px]"
                : isCompact
                  ? "text-[11px]"
                  : "text-[12.5px]"
            }`}
            title={cell.name}
          >
            {cell.name}
          </div>

          {!isCompact && (
            <p
              className={`text-[10px] truncate leading-snug mt-0.5 ${
                isRevealed && clueText
                  ? "font-medium text-[#3D3429]"
                  : "italic text-[#5B4F40]"
              }`}
              title={isRevealed && clueText ? clueText : cell.profession}
            >
              {isRevealed && clueText ? clueText : cell.profession}
            </p>
          )}
        </div>

        {/* Pending subtle scrim */}
        {isPending && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[#ECE0C8]/35 z-30"
          />
        )}
      </div>
    </button>
  );
};
