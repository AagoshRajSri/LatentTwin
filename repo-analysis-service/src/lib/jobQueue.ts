import PQueue from 'p-queue';
import { EventEmitter } from 'node:events';

const MAX_JOBS = parseInt(process.env.MAX_CONCURRENT_JOBS ?? '3');

export const jobQueue: InstanceType<typeof PQueue> = new PQueue({ concurrency: MAX_JOBS });

export interface ProgressEvent {
  type: 'stage' | 'done' | 'error' | 'job_error';
  stage?: string;
  pct?: number;
  jobId?: string;
  message?: string;
  graph?: any;
}

export interface JobState {
  id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  result?: unknown;
  error?: string;
  emitter: EventEmitter;
}

const jobs = new Map<string, JobState>();

export function createJob(id: string): JobState {
  const state: JobState = {
    id,
    status: 'queued',
    emitter: new EventEmitter(),
  };
  jobs.set(id, state);
  return state;
}

export function getJob(id: string): JobState | undefined {
  return jobs.get(id);
}

export function emitProgress(state: JobState, event: ProgressEvent): void {
  state.emitter.emit('event', event);
}

export function finishJob(state: JobState, result: unknown): void {
  state.status = 'done';
  state.result = result;
  state.emitter.emit('event', { type: 'done', jobId: state.id } satisfies ProgressEvent);
  state.emitter.emit('close');
  scheduleCleanup(state);
}

export function failJob(state: JobState, message: string): void {
  state.status = 'error';
  state.error = message;
  state.emitter.emit('event', { type: 'job_error', message } satisfies ProgressEvent);
  state.emitter.emit('close');
  scheduleCleanup(state);
}

// Keep completed graphs available briefly for SSE reconnects, then release them.
function scheduleCleanup(state: JobState): void {
  setTimeout(() => {
    if (jobs.get(state.id) === state && state.status !== 'queued' && state.status !== 'running') {
      jobs.delete(state.id);
    }
  }, 15 * 60 * 1000).unref();
}

