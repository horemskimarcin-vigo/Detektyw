import type { Tone } from '@detektyw/shared';
import type { CaseDef, Cond, Range } from './schema.js';
import type { GameState } from './state.js';

export interface InterviewCtx {
  personId: string;
  tone: Tone;
  stress: number;
  trust: number;
  session: number;
}

export interface EndingCtx {
  accusedCorrect: boolean;
  accused?: string;
  strength: number;
  reasoning: number;
  hints: number;
  timeout: boolean;
  closedCase: boolean;
}

export interface EvalCtx {
  def: CaseDef;
  state: GameState;
  interview?: InterviewCtx;
  ending?: EndingCtx;
}

export function inRange(value: number, r: Range): boolean {
  if (r.gte !== undefined && value < r.gte) return false;
  if (r.lte !== undefined && value > r.lte) return false;
  if (r.lt !== undefined && value >= r.lt) return false;
  return true;
}

export function evaluate(cond: Cond | undefined, ctx: EvalCtx): boolean {
  if (cond === undefined) return true;
  if (typeof cond === 'boolean') return cond;
  const s = ctx.state;
  if ('all' in cond) return cond.all.every((c) => evaluate(c, ctx));
  if ('any' in cond) return cond.any.some((c) => evaluate(c, ctx));
  if ('not' in cond) return !evaluate(cond.not, ctx);
  if ('flag' in cond) return s.flags[cond.flag] === true;
  if ('has' in cond) return cond.has in s.materials;
  if ('read' in cond) return (s.materials[cond.read]?.readBy.length ?? 0) > 0;
  if ('hotspot' in cond) return cond.hotspot in s.hotspots;
  if ('decision' in cond) return cond.decision in s.decisions;
  if ('asked' in cond) {
    return Object.values(s.interviews).some((i) => i.asked.includes(cond.asked));
  }
  if ('interviewed' in cond) return (s.interviews[cond.interviewed]?.sessions ?? 0) > 0;
  if ('onBoard' in cond) return s.board.nodes.some((n) => n.ref === cond.onBoard);
  if ('locked' in cond) return s.lockedMaterials.includes(cond.locked);
  if ('known' in cond) return s.knownPeople.includes(cond.known);
  if ('time' in cond) return inRange(s.time, cond.time);
  if ('counter' in cond)
    return inRange(s.counters[cond.counter] ?? 0, { gte: cond.gte, lte: cond.lte });
  if ('mode' in cond) return s.mode === cond.mode;
  if ('tone' in cond) return ctx.interview?.tone === cond.tone;
  if ('stress' in cond) return ctx.interview ? inRange(ctx.interview.stress, cond.stress) : false;
  if ('trust' in cond) return ctx.interview ? inRange(ctx.interview.trust, cond.trust) : false;
  if ('session' in cond)
    return ctx.interview ? inRange(ctx.interview.session, cond.session) : false;
  if ('accusedCorrect' in cond)
    return ctx.ending ? ctx.ending.accusedCorrect === cond.accusedCorrect : false;
  if ('accused' in cond) return ctx.ending?.accused === cond.accused;
  if ('strength' in cond) return ctx.ending ? inRange(ctx.ending.strength, cond.strength) : false;
  if ('reasoning' in cond)
    return ctx.ending ? inRange(ctx.ending.reasoning, cond.reasoning) : false;
  if ('hints' in cond) return inRange(ctx.ending?.hints ?? s.assistant.hintsUsed, cond.hints);
  if ('timeout' in cond) return ctx.ending ? ctx.ending.timeout === cond.timeout : false;
  if ('closedCase' in cond) return ctx.ending ? ctx.ending.closedCase === cond.closedCase : false;
  const never: never = cond;
  throw new Error(`Nieznany warunek: ${JSON.stringify(never)}`);
}

/** Wszystkie identyfikatory, do których odwołuje się warunek (dla walidatora). */
export function condRefs(cond: Cond | undefined, out: { kind: string; id: string }[] = []) {
  if (cond === undefined || typeof cond === 'boolean') return out;
  if ('all' in cond) cond.all.forEach((c) => condRefs(c, out));
  else if ('any' in cond) cond.any.forEach((c) => condRefs(c, out));
  else if ('not' in cond) condRefs(cond.not, out);
  else {
    for (const kind of [
      'has',
      'read',
      'hotspot',
      'decision',
      'asked',
      'interviewed',
      'onBoard',
      'locked',
      'known',
      'accused',
    ] as const) {
      if (kind in cond) out.push({ kind, id: (cond as Record<string, string>)[kind]! });
    }
    if ('flag' in cond) out.push({ kind: 'flag', id: cond.flag });
  }
  return out;
}
