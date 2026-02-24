/**
 * Shared response loading logic.
 *
 * Loads response data for a given request_id, handling both:
 *   - Per-respondent directory format (responses/{id}/{user}.json)
 *   - Legacy flat file format (responses/{id}.json)
 *
 * Used by pact-status and pact-thread to avoid duplicated detection logic.
 */

import type { FilePort } from "./ports.ts";
import { ResponseEnvelopeSchema } from "./schemas.ts";
import { log } from "./logger.ts";

export interface ResponseData {
  response?: unknown;
  responses?: unknown[];
}

/**
 * Load responses for a request.
 *
 * Checks for per-respondent directory first, then falls back to flat file.
 * When `tolerateMissing` is true (default false), returns empty object
 * instead of throwing when no response file exists.
 */
export async function loadResponseData(
  file: FilePort,
  requestId: string,
  tolerateMissing = false,
): Promise<ResponseData> {
  const responseDir = `responses/${requestId}`;
  const hasFlatResponse = await file.fileExists(`${responseDir}.json`);
  const hasResponseDir = await file.fileExists(responseDir);

  if (hasResponseDir && !hasFlatResponse) {
    return loadPerRespondentResponses(file, responseDir, requestId);
  }

  return loadFlatResponse(file, requestId, tolerateMissing);
}

/** Load all response files from a per-respondent directory. */
async function loadPerRespondentResponses(
  file: FilePort,
  responseDir: string,
  requestId: string,
): Promise<ResponseData> {
  const responseFiles = await file.listDirectory(responseDir);
  const responses: unknown[] = [];

  for (const fileName of responseFiles) {
    const rawResponse = await file.readJSON<unknown>(`${responseDir}/${fileName}`);
    const parsed = ResponseEnvelopeSchema.safeParse(rawResponse);
    if (parsed.success) {
      responses.push(parsed.data);
    } else {
      log("warn", "malformed response envelope", { request_id: requestId, file: fileName });
      responses.push(rawResponse);
    }
  }

  return responses.length > 0 ? { responses } : {};
}

/** Load a single flat response file. */
async function loadFlatResponse(
  file: FilePort,
  requestId: string,
  tolerateMissing: boolean,
): Promise<ResponseData> {
  try {
    const rawResponse = await file.readJSON<unknown>(`responses/${requestId}.json`);
    const parsed = ResponseEnvelopeSchema.safeParse(rawResponse);
    if (parsed.success) {
      return { response: parsed.data };
    }
    log("warn", "malformed response envelope", { request_id: requestId });
    return { response: rawResponse };
  } catch {
    if (tolerateMissing) {
      return {};
    }
    throw new Error(`Response file not found for request ${requestId}`);
  }
}
