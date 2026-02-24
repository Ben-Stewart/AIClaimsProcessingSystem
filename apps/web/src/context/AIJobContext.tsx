import { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { WS_EVENTS, AIJobStartedEvent, AIJobProgressEvent, AIJobCompletedEvent, AIJobFailedEvent } from '@claims/shared';
import { getSocket } from '@/lib/socket';

export interface AIJob {
  jobId: string;
  claimId: string;
  type: string;
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  stage: string;
  resultSummary?: string;
  error?: string;
}

type JobsState = Record<string, AIJob>;

type JobAction =
  | { type: 'JOB_STARTED'; payload: AIJobStartedEvent }
  | { type: 'JOB_PROGRESS'; payload: AIJobProgressEvent }
  | { type: 'JOB_COMPLETED'; payload: AIJobCompletedEvent }
  | { type: 'JOB_FAILED'; payload: AIJobFailedEvent };

function jobsReducer(state: JobsState, action: JobAction): JobsState {
  switch (action.type) {
    case 'JOB_STARTED':
      return {
        ...state,
        [action.payload.jobId]: {
          jobId: action.payload.jobId,
          claimId: action.payload.claimId,
          type: action.payload.type,
          status: 'processing',
          progress: 0,
          stage: 'Starting...',
        },
      };
    case 'JOB_PROGRESS':
      return {
        ...state,
        [action.payload.jobId]: {
          ...state[action.payload.jobId],
          progress: action.payload.progress,
          stage: action.payload.stage,
        },
      };
    case 'JOB_COMPLETED':
      return {
        ...state,
        [action.payload.jobId]: {
          ...state[action.payload.jobId],
          status: 'completed',
          progress: 100,
          resultSummary: action.payload.resultSummary,
        },
      };
    case 'JOB_FAILED':
      return {
        ...state,
        [action.payload.jobId]: {
          ...state[action.payload.jobId],
          status: 'failed',
          error: action.payload.error,
        },
      };
    default:
      return state;
  }
}

interface AIJobContextValue {
  jobs: JobsState;
  getJobsForClaim: (claimId: string) => AIJob[];
  hasActiveJobsForClaim: (claimId: string) => boolean;
}

const AIJobContext = createContext<AIJobContextValue | null>(null);

export function AIJobProvider({ children }: { children: ReactNode }) {
  const [jobs, dispatch] = useReducer(jobsReducer, {});

  useEffect(() => {
    const socket = getSocket();

    socket.on(WS_EVENTS.AI_JOB_STARTED, (data: AIJobStartedEvent) =>
      dispatch({ type: 'JOB_STARTED', payload: data }),
    );
    socket.on(WS_EVENTS.AI_JOB_PROGRESS, (data: AIJobProgressEvent) =>
      dispatch({ type: 'JOB_PROGRESS', payload: data }),
    );
    socket.on(WS_EVENTS.AI_JOB_COMPLETED, (data: AIJobCompletedEvent) =>
      dispatch({ type: 'JOB_COMPLETED', payload: data }),
    );
    socket.on(WS_EVENTS.AI_JOB_FAILED, (data: AIJobFailedEvent) =>
      dispatch({ type: 'JOB_FAILED', payload: data }),
    );

    return () => {
      socket.off(WS_EVENTS.AI_JOB_STARTED);
      socket.off(WS_EVENTS.AI_JOB_PROGRESS);
      socket.off(WS_EVENTS.AI_JOB_COMPLETED);
      socket.off(WS_EVENTS.AI_JOB_FAILED);
    };
  }, []);

  const getJobsForClaim = (claimId: string) =>
    Object.values(jobs).filter((j) => j.claimId === claimId);

  const hasActiveJobsForClaim = (claimId: string) =>
    getJobsForClaim(claimId).some((j) => j.status === 'processing');

  return (
    <AIJobContext.Provider value={{ jobs, getJobsForClaim, hasActiveJobsForClaim }}>
      {children}
    </AIJobContext.Provider>
  );
}

export function useAIJobs() {
  const ctx = useContext(AIJobContext);
  if (!ctx) throw new Error('useAIJobs must be used within AIJobProvider');
  return ctx;
}
