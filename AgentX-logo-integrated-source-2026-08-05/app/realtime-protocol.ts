/**
 * Wire-protocol constants for the realtime voice provider.
 *
 * These are values the provider's servers require on the connection itself, so
 * they cannot be renamed or hidden — the browser negotiates the media session
 * directly with the provider. They are isolated here so the rest of the app
 * refers to them only by neutral names, and so swapping providers means editing
 * one file.
 */

/** Name the provider expects for the WebRTC events data channel. */
export const REALTIME_EVENT_CHANNEL = "oai-events";

/** Event names emitted by the provider over the data channel. */
export const REALTIME_EVENTS = {
  userTranscriptDone: "conversation.item.input_audio_transcription.completed",
  agentTranscriptDelta: "response.output_audio_transcript.delta",
  agentTranscriptDone: "response.output_audio_transcript.done",
  agentTranscriptDeltaLegacy: "response.audio_transcript.delta",
  agentTranscriptDoneLegacy: "response.audio_transcript.done",
  toolCallDone: "response.function_call_arguments.done",
  createItem: "conversation.item.create",
  createResponse: "response.create",
  error: "error",
} as const;
