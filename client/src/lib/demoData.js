/**
 * Static demo dataset for LatentTwin demo mode.
 * Conforms exactly to the rawAnalysisRef shape used by toReactFlowGraph().
 * No external API calls. No premium gates unlocked.
 */

export const DEMO_NODES = [
  {
    id: 'auth-service/index.ts',
    label: 'index.ts',
    file: 'auth-service/index.ts',
    tier: 'entrypoint',
    role: 'Auth Entry',
    status: 'impacted',
    lines: [
      { id: 'al1', lineNumber: 12, code: "const payload = { user_id: user.id, email: user.email };", before: "const payload = { user_id: user.id, email: user.email };", after: "const payload = { userId: user.id, email: user.email };", hint: 'Field renamed from user_id → userId breaking consumers downstream.', error: true },
      { id: 'al2', lineNumber: 15, code: "queue.publish('user.login', payload);", error: false },
    ],
  },
  {
    id: 'auth-service/tokenValidator.ts',
    label: 'tokenValidator.ts',
    file: 'auth-service/tokenValidator.ts',
    tier: 'core',
    role: 'Token Validation',
    status: 'healthy',
    lines: [
      { id: 'tl1', lineNumber: 4, code: "export function validateToken(jwt: string): boolean {", error: false },
      { id: 'tl2', lineNumber: 7, code: "  return verify(jwt, process.env.JWT_SECRET);", error: false },
    ],
  },
  {
    id: 'auth-service/userModel.ts',
    label: 'userModel.ts',
    file: 'auth-service/userModel.ts',
    tier: 'data',
    role: 'User Model',
    status: 'healthy',
    lines: [
      { id: 'ul1', lineNumber: 2, code: "export interface User { id: string; email: string; role: string; }", error: false },
    ],
  },
  {
    id: 'event-queue/queue.ts',
    label: 'queue.ts',
    file: 'event-queue/queue.ts',
    tier: 'infrastructure',
    role: 'Event Queue',
    status: 'affected-downstream',
    lines: [
      { id: 'ql1', lineNumber: 8, code: "const event = JSON.parse(message);", error: false },
      { id: 'ql2', lineNumber: 9, code: "if (!event.user_id) throw new Error('Missing user_id');", before: "if (!event.user_id) throw new Error('Missing user_id');", after: "if (!event.userId) throw new Error('Missing userId');", hint: 'Still expects old field name user_id — now undefined after rename.', error: true },
    ],
  },
  {
    id: 'event-queue/schema.ts',
    label: 'schema.ts',
    file: 'event-queue/schema.ts',
    tier: 'data',
    role: 'Event Schema',
    status: 'affected-downstream',
    lines: [
      { id: 'sl1', lineNumber: 3, code: "export type UserLoginEvent = { user_id: string; email: string; };", before: "export type UserLoginEvent = { user_id: string; email: string; };", after: "export type UserLoginEvent = { userId: string; email: string; };", hint: 'Schema type still uses user_id.', error: true },
    ],
  },
  {
    id: 'worker-service/processor.ts',
    label: 'processor.ts',
    file: 'worker-service/processor.ts',
    tier: 'consumer',
    role: 'Event Processor',
    status: 'affected-downstream',
    lines: [
      { id: 'wl1', lineNumber: 14, code: "const userId = event.user_id;", before: "const userId = event.user_id;", after: "const userId = event.userId;", hint: 'Destructuring old field — results in undefined at runtime.', error: true },
      { id: 'wl2', lineNumber: 18, code: "await db.recordActivity(userId, event.type);", error: false },
    ],
  },
  {
    id: 'worker-service/notifier.ts',
    label: 'notifier.ts',
    file: 'worker-service/notifier.ts',
    tier: 'consumer',
    role: 'Notification Service',
    status: 'healthy',
    lines: [
      { id: 'nl1', lineNumber: 6, code: "export async function sendAlert(userId: string, msg: string) {", error: false },
    ],
  },
  {
    id: 'shared/logger.ts',
    label: 'logger.ts',
    file: 'shared/logger.ts',
    tier: 'utility',
    role: 'Shared Logger',
    status: 'healthy',
    lines: [
      { id: 'll1', lineNumber: 1, code: "export const log = (msg: string) => console.log(`[LT] ${msg}`);", error: false },
    ],
  },
];

export const DEMO_EDGES = [
  { source: 'auth-service/index.ts',       target: 'event-queue/queue.ts',           type: 'publishes',   relationshipType: 'explicit' },
  { source: 'auth-service/index.ts',       target: 'auth-service/tokenValidator.ts', type: 'calls',       relationshipType: 'explicit' },
  { source: 'auth-service/index.ts',       target: 'auth-service/userModel.ts',      type: 'imports',     relationshipType: 'explicit' },
  { source: 'event-queue/queue.ts',        target: 'event-queue/schema.ts',          type: 'validates',   relationshipType: 'explicit' },
  { source: 'event-queue/queue.ts',        target: 'worker-service/processor.ts',    type: 'subscribes',  relationshipType: 'implicit_queue' },
  { source: 'worker-service/processor.ts', target: 'worker-service/notifier.ts',     type: 'calls',       relationshipType: 'explicit' },
  { source: 'auth-service/index.ts',       target: 'shared/logger.ts',              type: 'imports',     relationshipType: 'explicit' },
  { source: 'worker-service/processor.ts', target: 'shared/logger.ts',              type: 'imports',     relationshipType: 'explicit' },
];

export const DEMO_META = {
  repository: 'demo/latent-twin-sample',
  generatedAt: new Date().toISOString(),
  description: 'Pre-analyzed demo: auth-service renamed user_id → userId, breaking downstream consumers.',
};
