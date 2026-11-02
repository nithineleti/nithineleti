/**
 * CHAOS ARENA — Standard Netlify Function (`/.netlify/functions/game`)
 * Uses Netlify Blobs with strong consistency (`consistency: 'strong'`) and conditional ETag writes (`onlyIfMatch` / `onlyIfNew`).
 * Note: Does NOT export `config.path` so it is served at the standard `/.netlify/functions/game` endpoint.
 * Uses the Functions v2 signature (`export default (req: Request) => Response`): only v2 functions receive the
 * full Netlify Blobs context (including the uncached edge URL that `consistency: 'strong'` reads require).
 */

import {
  advanceNextRoundInBlobs,
  createRoomInBlobs,
  finalizeRoundInBlobs,
  getRoomStateFromBlobs,
  joinRoomInBlobs,
  setReadyInBlobs,
  startTournamentInBlobs,
  submitRoundActionInBlobs,
} from '../../src/lib/gameEngine';

export interface NetlifyEvent {
  httpMethod: string;
  headers: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
  body?: string | null;
}

export interface NetlifyResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handleGameEvent = async (event: NetlifyEvent): Promise<NetlifyResponse> => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: JSON_HEADERS,
      body: '',
    };
  }

  try {
    if (event.httpMethod === 'GET') {
      const code = event.queryStringParameters?.code || '';
      if (!code) {
        return {
          statusCode: 200,
          headers: JSON_HEADERS,
          body: JSON.stringify({
            status: 'ok',
            endpoint: '/.netlify/functions/game',
            storage: 'netlify-blobs-strong-consistency',
          }),
        };
      }
      const room = await getRoomStateFromBlobs(code);
      return {
        statusCode: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify({ ok: true, room }),
      };
    }

    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: JSON_HEADERS,
        body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
      };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const action = (body.action || '').toString().toUpperCase();

    switch (action) {
      case 'CREATE_ROOM': {
        const result = await createRoomInBlobs({
          sessionToken: body.sessionToken,
          nickname: body.nickname,
          avatarId: body.avatarId,
          totalRounds: body.totalRounds,
        });
        return {
          statusCode: 200,
          headers: JSON_HEADERS,
          body: JSON.stringify({ ok: true, ...result }),
        };
      }

      case 'JOIN_ROOM': {
        const result = await joinRoomInBlobs({
          code: body.code,
          sessionToken: body.sessionToken,
          nickname: body.nickname,
          avatarId: body.avatarId,
        });
        return {
          statusCode: 200,
          headers: JSON_HEADERS,
          body: JSON.stringify({ ok: true, ...result }),
        };
      }

      case 'GET_ROOM': {
        const room = await getRoomStateFromBlobs(body.code);
        return {
          statusCode: 200,
          headers: JSON_HEADERS,
          body: JSON.stringify({ ok: true, room }),
        };
      }

      case 'SET_READY': {
        const room = await setReadyInBlobs({
          code: body.code,
          playerId: body.playerId,
          ready: Boolean(body.ready),
        });
        return {
          statusCode: 200,
          headers: JSON_HEADERS,
          body: JSON.stringify({ ok: true, room }),
        };
      }

      case 'START_TOURNAMENT': {
        const room = await startTournamentInBlobs({
          code: body.code,
          playerId: body.playerId,
          totalRounds: body.totalRounds,
          customGameOrder: body.customGameOrder,
          customModifiers: body.customModifiers,
        });
        return {
          statusCode: 200,
          headers: JSON_HEADERS,
          body: JSON.stringify({ ok: true, room }),
        };
      }

      case 'SUBMIT_ACTION': {
        const room = await submitRoundActionInBlobs({
          code: body.code,
          playerId: body.playerId,
          roundId: body.roundId,
          actionId: body.actionId,
          payload: body.payload || {},
        });
        return {
          statusCode: 200,
          headers: JSON_HEADERS,
          body: JSON.stringify({ ok: true, room }),
        };
      }

      case 'FINALIZE_ROUND': {
        const room = await finalizeRoundInBlobs({
          code: body.code,
          playerId: body.playerId,
        });
        return {
          statusCode: 200,
          headers: JSON_HEADERS,
          body: JSON.stringify({ ok: true, room }),
        };
      }

      case 'NEXT_ROUND': {
        const room = await advanceNextRoundInBlobs({
          code: body.code,
          playerId: body.playerId,
        });
        return {
          statusCode: 200,
          headers: JSON_HEADERS,
          body: JSON.stringify({ ok: true, room }),
        };
      }

      default:
        return {
          statusCode: 400,
          headers: JSON_HEADERS,
          body: JSON.stringify({ ok: false, error: `Unknown action: ${action}` }),
        };
    }
  } catch (err: any) {
    const message = err?.message || 'Internal Server Error';
    const statusCode = message.startsWith('INVALID_ROOM_CODE') ? 404 : 400;
    return {
      statusCode,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        ok: false,
        error: message,
      }),
    };
  }
};

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const result = await handleGameEvent({
    httpMethod: req.method,
    headers: Object.fromEntries(req.headers.entries()),
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    body: req.method === 'GET' || req.method === 'HEAD' ? null : await req.text(),
  });
  return new Response(result.statusCode === 204 ? null : result.body, {
    status: result.statusCode,
    headers: result.headers,
  });
};
