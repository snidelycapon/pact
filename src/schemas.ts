/**
 * Zod schemas for GARP protocol envelopes and team configuration.
 *
 * These schemas define the rigid contract for request/response data
 * flowing through the GARP system. The context_bundle and response_bundle
 * fields are intentionally flexible (any object) -- the skill contract
 * defines their structure, not the server.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

const UserRefSchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
});

// ---------------------------------------------------------------------------
// Request Envelope
// ---------------------------------------------------------------------------

export const RequestEnvelopeSchema = z.object({
  request_id: z.string(),
  request_type: z.string(),
  sender: UserRefSchema,
  recipient: UserRefSchema,
  status: z.string(),
  created_at: z.string(),
  deadline: z.string().nullable().optional(),
  context_bundle: z.record(z.string(), z.unknown()),
  expected_response: z.record(z.string(), z.unknown()).optional(),
});

export type RequestEnvelope = z.infer<typeof RequestEnvelopeSchema>;

// ---------------------------------------------------------------------------
// Response Envelope
// ---------------------------------------------------------------------------

export const ResponseEnvelopeSchema = z.object({
  request_id: z.string(),
  responder: UserRefSchema,
  responded_at: z.string(),
  response_bundle: z.record(z.string(), z.unknown()),
});

export type ResponseEnvelope = z.infer<typeof ResponseEnvelopeSchema>;

// ---------------------------------------------------------------------------
// Team Configuration
// ---------------------------------------------------------------------------

const TeamMemberSchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
});

export const TeamConfigSchema = z.object({
  team_name: z.string(),
  version: z.number(),
  members: z.array(TeamMemberSchema),
});

export type TeamConfig = z.infer<typeof TeamConfigSchema>;
export type TeamMember = z.infer<typeof TeamMemberSchema>;
