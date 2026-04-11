import type { Shift, SwapAvailability } from "@/types/domain";

export type MatchStrategy = "exact" | "overlap" | "same_day";

export interface RankedSwapMatch {
  ownShift: Shift;
  targetShift: Shift;
  availability: SwapAvailability;
  strategy: MatchStrategy;
  score: number;
  rationale: string[];
}

function toMillis(value: string): number {
  return new Date(value).getTime();
}

function overlapMinutes(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): number {
  const start = Math.max(toMillis(aStart), toMillis(bStart));
  const end = Math.min(toMillis(aEnd), toMillis(bEnd));
  return Math.max(0, Math.floor((end - start) / 60000));
}

function minutesBetween(a: string, b: string): number {
  return Math.abs(Math.floor((toMillis(a) - toMillis(b)) / 60000));
}

function pickStrategy(
  ownShift: Shift,
  targetShift: Shift,
): {
  strategy: MatchStrategy | null;
  overlapMins: number;
} {
  if (
    ownShift.date === targetShift.date &&
    ownShift.startsAt === targetShift.startsAt &&
    ownShift.endsAt === targetShift.endsAt
  ) {
    return {
      strategy: "exact",
      overlapMins: overlapMinutes(
        ownShift.startsAt,
        ownShift.endsAt,
        targetShift.startsAt,
        targetShift.endsAt,
      ),
    };
  }

  const overlapMins = overlapMinutes(
    ownShift.startsAt,
    ownShift.endsAt,
    targetShift.startsAt,
    targetShift.endsAt,
  );
  if (overlapMins > 0) {
    return { strategy: "overlap", overlapMins };
  }

  if (ownShift.date === targetShift.date) {
    return { strategy: "same_day", overlapMins: 0 };
  }

  return { strategy: null, overlapMins: 0 };
}

function buildScore(input: {
  strategy: MatchStrategy;
  ownShift: Shift;
  targetShift: Shift;
  overlapMins: number;
}): { score: number; rationale: string[] } {
  const ownDuration = Math.max(
    0,
    minutesBetween(input.ownShift.startsAt, input.ownShift.endsAt),
  );
  const targetDuration = Math.max(
    0,
    minutesBetween(input.targetShift.startsAt, input.targetShift.endsAt),
  );
  const durationDelta = Math.abs(ownDuration - targetDuration);
  const startDelta = minutesBetween(
    input.ownShift.startsAt,
    input.targetShift.startsAt,
  );

  let base = 0;
  const rationale: string[] = [];

  if (input.strategy === "exact") {
    base = 100;
    rationale.push("Horario exatamente igual (mesmo dia e horas)");
  } else if (input.strategy === "overlap") {
    base = 70 + Math.min(20, Math.floor(input.overlapMins / 15));
    rationale.push(`Sobreposicao de ${input.overlapMins} minutos`);
  } else {
    base = 45;
    rationale.push("Mesmo dia (fallback)");
  }

  const durationPenalty = Math.min(20, Math.floor(durationDelta / 30));
  const startPenalty = Math.min(20, Math.floor(startDelta / 30));
  const score = Math.max(0, base - durationPenalty - startPenalty);

  if (durationDelta > 0) {
    rationale.push(`Diferenca de duracao: ${durationDelta} min`);
  }
  if (startDelta > 0) {
    rationale.push(`Diferenca de inicio: ${startDelta} min`);
  }

  return { score, rationale };
}

export function buildRankedSwapMatches(input: {
  userId: string;
  ownShifts: Shift[];
  openAvailabilities: Array<{ shift: Shift; availability: SwapAvailability }>;
}): RankedSwapMatch[] {
  const ownActive = input.ownShifts.filter(
    (shift) => shift.userId === input.userId && shift.status !== "deleted",
  );

  const candidates = input.openAvailabilities.filter(
    ({ shift, availability }) => {
      return (
        availability.isOpen &&
        shift.userId !== input.userId &&
        shift.status !== "deleted"
      );
    },
  );

  const matches: RankedSwapMatch[] = [];

  for (const ownShift of ownActive) {
    for (const candidate of candidates) {
      const picked = pickStrategy(ownShift, candidate.shift);
      if (!picked.strategy) {
        continue;
      }

      const scored = buildScore({
        strategy: picked.strategy,
        ownShift,
        targetShift: candidate.shift,
        overlapMins: picked.overlapMins,
      });

      matches.push({
        ownShift,
        targetShift: candidate.shift,
        availability: candidate.availability,
        strategy: picked.strategy,
        score: scored.score,
        rationale: scored.rationale,
      });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}
