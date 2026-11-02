/**
 * CHAOS ARENA — Netlify Blobs Store Wrapper with Strong Consistency & Conditional Writes
 * Uses `getStore({ name: 'chaos-arena-rooms', consistency: 'strong' })` from `@netlify/blobs`
 * and ETag conditional writes (`onlyIfMatch` / `onlyIfNew`) with automatic conflict retry.
 */

import crypto from 'crypto';
import type { RoomDocument } from './gameTypes';

export interface BlobEntryWithEtag {
  data: RoomDocument | null;
  etag: string | null;
}

export interface RoomBlobStore {
  getWithMetadata(key: string): Promise<BlobEntryWithEtag>;
  setRoomConditional(
    key: string,
    doc: RoomDocument,
    options: { onlyIfMatch?: string; onlyIfNew?: boolean }
  ): Promise<{ modified: boolean; etag: string }>;
}

// Local strongly-consistent fallback store used only during local verification when outside Netlify Edge/Lambda runtime
const localMemoryStore = new Map<string, { raw: string; etag: string }>();

// True when running inside a deployed Netlify Function (Lambda) rather than a local verification harness.
const isNetlifyRuntime = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY_BLOBS_CONTEXT);

export async function getStrongRoomStore(): Promise<RoomBlobStore> {
  try {
    // Dynamically import @netlify/blobs when running on Netlify
    const blobsModule = await import('@netlify/blobs');
    if (blobsModule && typeof blobsModule.getStore === 'function') {
      const store = blobsModule.getStore({
        name: 'chaos-arena-rooms',
        consistency: 'strong',
      });

      return {
        async getWithMetadata(key: string): Promise<BlobEntryWithEtag> {
          const entry = await store.getWithMetadata(key, {
            type: 'json',
            consistency: 'strong',
          });
          if (!entry || !entry.data) {
            return { data: null, etag: null };
          }
          return {
            data: entry.data as RoomDocument,
            etag: entry.etag || null,
          };
        },

        async setRoomConditional(
          key: string,
          doc: RoomDocument,
          options: { onlyIfMatch?: string; onlyIfNew?: boolean }
        ): Promise<{ modified: boolean; etag: string }> {
          const writeOpts: Record<string, any> = {};
          if (options.onlyIfMatch) {
            writeOpts.onlyIfMatch = options.onlyIfMatch;
          }
          if (options.onlyIfNew) {
            writeOpts.onlyIfNew = true;
          }
          const res = await store.setJSON(key, doc, writeOpts);
          // For conditional writes @netlify/blobs reports `modified: true` for every status except 412,
          // including 409/429/5xx under contention. Only a response carrying the new ETag is a real write.
          const etag = (res && res.etag) || '';
          return {
            modified: Boolean(res && res.modified && etag),
            etag,
          };
        },
      };
    }
  } catch (err) {
    // On Netlify an in-memory store would silently split rooms across function instances, so fail loudly instead
    if (isNetlifyRuntime) {
      throw new Error(`BLOBS_UNAVAILABLE: ${(err as Error)?.message || err}`);
    }
    // Fallback to local strongly-consistent conditional-write store when running offline local verification
  }

  return {
    async getWithMetadata(key: string): Promise<BlobEntryWithEtag> {
      const record = localMemoryStore.get(key);
      if (!record) return { data: null, etag: null };
      return {
        data: JSON.parse(record.raw) as RoomDocument,
        etag: record.etag,
      };
    },

    async setRoomConditional(
      key: string,
      doc: RoomDocument,
      options: { onlyIfMatch?: string; onlyIfNew?: boolean }
    ): Promise<{ modified: boolean; etag: string }> {
      const existing = localMemoryStore.get(key);
      if (options.onlyIfNew && existing) {
        return { modified: false, etag: existing.etag };
      }
      if (options.onlyIfMatch && (!existing || existing.etag !== options.onlyIfMatch)) {
        return { modified: false, etag: existing ? existing.etag : '' };
      }
      const raw = JSON.stringify(doc);
      const newEtag = `"${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16)}"`;
      localMemoryStore.set(key, { raw, etag: newEtag });
      return { modified: true, etag: newEtag };
    },
  };
}

/**
 * Atomic Read-Modify-Write transaction using Netlify Blobs strong consistency + `onlyIfMatch` conditional writes.
 * Automatically retries up to `maxRetries` times if a concurrent player write updates the ETag simultaneously.
 */
export async function updateRoomAtomically(
  code: string,
  mutator: (room: RoomDocument) => RoomDocument,
  maxRetries = 8
): Promise<RoomDocument> {
  const store = await getStrongRoomStore();
  const key = `room:${code.trim().toUpperCase()}`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      // Jittered backoff so simultaneous submitters stop colliding on the same ETag
      await new Promise((resolve) => setTimeout(resolve, 40 * attempt + Math.random() * 80));
    }
    const { data: currentRoom, etag } = await store.getWithMetadata(key);
    if (!currentRoom) {
      throw new Error('INVALID_ROOM_CODE: Room code not found or has expired.');
    }
    // `netlify dev`'s local Blobs sandbox omits ETags on reads (production returns them), so only there
    // fall back to an unconditional write; anywhere else a missing ETag would silently drop concurrent updates.
    if (!etag && process.env.NETLIFY_DEV !== 'true') {
      throw new Error('BLOBS_ETAG_MISSING: Storage did not return an ETag for a conditional write.');
    }

    const workingCopy: RoomDocument = JSON.parse(JSON.stringify(currentRoom));
    const updatedRoom = mutator(workingCopy);
    updatedRoom.version = (currentRoom.version || 1) + 1;
    updatedRoom.updatedAt = Date.now();

    const writeResult = await store.setRoomConditional(key, updatedRoom, {
      onlyIfMatch: etag || undefined,
    });

    if (writeResult.modified) {
      return updatedRoom;
    }
  }

  throw new Error('CONCURRENT_WRITE_CONFLICT: Room was busy updating. Please retry.');
}
