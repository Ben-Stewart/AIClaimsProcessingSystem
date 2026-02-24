import { type AIJob } from '@/context/AIJobContext';

export function AIJobProgressPanel({ jobs }: { jobs: AIJob[] }) {
  const activeJobs = jobs.filter((j) => j.status === 'processing');
  if (activeJobs.length === 0) return null;

  return (
    <div className="space-y-2">
      {activeJobs.map((job) => (
        <div key={job.jobId} className="flex items-center gap-4">
          <span className="text-xs font-medium text-purple-700 w-40 shrink-0">{job.stage}</span>
          <div className="flex-1 h-1.5 bg-purple-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-full transition-all duration-500"
              style={{ width: `${job.progress}%` }}
            />
          </div>
          <span className="text-xs text-purple-600 w-8 text-right shrink-0">{job.progress}%</span>
        </div>
      ))}
    </div>
  );
}
