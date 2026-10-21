import { z } from 'zod';
import type { GameAction } from '@detektyw/shared';

/** Walidacja akcji gracza na wejściu API (kształt; reguły gry sprawdza silnik). */
const sid = z.string().min(1).max(64);
const tone = z.enum(['calm', 'press', 'empathetic']);
const coord = z.number().finite();
const accusation = z
  .object({
    suspectId: sid,
    evidence: z.array(sid).max(12),
    motiveId: sid,
    meansId: sid,
    opportunityId: sid,
  })
  .strict();
const proposal = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('decision'), decisionId: sid }).strict(),
  z.object({ kind: z.literal('accusation'), accusation }).strict(),
  z.object({ kind: z.literal('close_case') }).strict(),
]);
const text = (max: number) => z.string().max(max);

export const gameActionSchema: z.ZodType<GameAction> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('open_material'), materialId: sid }).strict(),
  z.object({ type: z.literal('mark_material'), materialId: sid, important: z.boolean() }).strict(),
  z.object({ type: z.literal('share_material'), materialId: sid }).strict(),
  z
    .object({
      type: z.literal('inspect'),
      materialId: sid,
      frame: z.number().int().min(0).max(200).optional(),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      zoom: z.number().min(1).max(10),
    })
    .strict(),
  z.object({ type: z.literal('start_interview'), personId: sid }).strict(),
  z.object({ type: z.literal('ask'), personId: sid, questionId: sid, tone }).strict(),
  z.object({ type: z.literal('confront'), personId: sid, evidence: sid, tone }).strict(),
  z.object({ type: z.literal('end_interview'), personId: sid }).strict(),
  z.object({ type: z.literal('take_decision'), decisionId: sid }).strict(),
  z.object({ type: z.literal('wait') }).strict(),
  z.object({ type: z.literal('propose'), proposal }).strict(),
  z.object({ type: z.literal('vote'), proposalId: sid, approve: z.boolean() }).strict(),
  z.object({ type: z.literal('cancel_proposal'), proposalId: sid }).strict(),
  z.object({ type: z.literal('accuse'), accusation }).strict(),
  z.object({ type: z.literal('close_case') }).strict(),
  z
    .object({
      type: z.literal('note_save'),
      note: z
        .object({
          id: sid.optional(),
          text: text(4000),
          shared: z.boolean(),
          quote: z
            .object({ materialId: sid, text: text(1000) })
            .strict()
            .optional(),
        })
        .strict(),
    })
    .strict(),
  z.object({ type: z.literal('note_delete'), noteId: sid }).strict(),
  z
    .object({
      type: z.literal('board_add'),
      node: z
        .object({
          kind: z.enum(['person', 'material', 'hotspot', 'location', 'note', 'time']),
          ref: sid.optional(),
          label: text(200),
          x: coord,
          y: coord,
        })
        .strict(),
    })
    .strict(),
  z.object({ type: z.literal('board_move'), nodeId: sid, x: coord, y: coord }).strict(),
  z.object({ type: z.literal('board_update'), nodeId: sid, label: text(200) }).strict(),
  z.object({ type: z.literal('board_remove'), nodeId: sid }).strict(),
  z
    .object({ type: z.literal('board_link'), from: sid, to: sid, label: text(200).optional() })
    .strict(),
  z.object({ type: z.literal('board_unlink'), edgeId: sid }).strict(),
  z
    .object({
      type: z.literal('timeline_save'),
      entry: z
        .object({
          id: sid.optional(),
          time: text(40),
          label: text(400),
          refs: z.array(sid).max(10),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('timeline_move'),
      entryId: sid,
      direction: z.union([z.literal(-1), z.literal(1)]),
    })
    .strict(),
  z.object({ type: z.literal('timeline_delete'), entryId: sid }).strict(),
  z.object({ type: z.literal('hint_request') }).strict(),
  z.object({ type: z.literal('assistant_ask'), text: text(500) }).strict(),
  z.object({ type: z.literal('set_role'), role: text(40) }).strict(),
]) as z.ZodType<GameAction>;
