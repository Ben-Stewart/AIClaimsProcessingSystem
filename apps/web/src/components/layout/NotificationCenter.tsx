import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { WS_EVENTS } from '@claims/shared';
import { getSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  type: 'ready_for_review' | 'ai_completed' | 'ai_failed';
  claimId: string;
  claimNumber: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

function relativeTime(d: Date): string {
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function NotificationCenter() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const socket = getSocket();

    const handleReadyForReview = (data: { claimId: string; claimNumber: string }) => {
      setNotifications((prev) => [
        {
          id: crypto.randomUUID(),
          type: 'ready_for_review',
          claimId: data.claimId,
          claimNumber: data.claimNumber,
          message: `Claim ${data.claimNumber} is ready for adjuster review`,
          timestamp: new Date(),
          read: false,
        },
        ...prev.slice(0, 19),
      ]);
    };

    const handleJobCompleted = (data: { claimId: string; claimNumber?: string; stage?: string }) => {
      setNotifications((prev) => [
        {
          id: crypto.randomUUID(),
          type: 'ai_completed',
          claimId: data.claimId,
          claimNumber: data.claimNumber ?? data.claimId.slice(0, 8),
          message: `AI ${data.stage ?? 'processing'} completed${data.claimNumber ? ` for ${data.claimNumber}` : ''}`,
          timestamp: new Date(),
          read: false,
        },
        ...prev.slice(0, 19),
      ]);
    };

    const handleJobFailed = (data: { claimId: string; claimNumber?: string }) => {
      setNotifications((prev) => [
        {
          id: crypto.randomUUID(),
          type: 'ai_failed',
          claimId: data.claimId,
          claimNumber: data.claimNumber ?? data.claimId.slice(0, 8),
          message: `AI processing failed${data.claimNumber ? ` for ${data.claimNumber}` : ''}`,
          timestamp: new Date(),
          read: false,
        },
        ...prev.slice(0, 19),
      ]);
    };

    socket.on(WS_EVENTS.CLAIM_READY_FOR_REVIEW, handleReadyForReview);
    socket.on(WS_EVENTS.AI_JOB_COMPLETED, handleJobCompleted);
    socket.on(WS_EVENTS.AI_JOB_FAILED, handleJobFailed);

    return () => {
      socket.off(WS_EVENTS.CLAIM_READY_FOR_REVIEW, handleReadyForReview);
      socket.off(WS_EVENTS.AI_JOB_COMPLETED, handleJobCompleted);
      socket.off(WS_EVENTS.AI_JOB_FAILED, handleJobFailed);
    };
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markAllRead = () =>
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

  const handleClick = (n: Notification) => {
    setNotifications((prev) =>
      prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
    );
    setOpen(false);
    navigate(`/claims/${n.claimId}`);
  };

  const dismiss = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => { setOpen((o) => !o); if (!open) markAllRead(); }}
        className="relative text-muted-foreground hover:text-foreground transition-colors p-1"
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-50 w-80 rounded-xl border bg-card shadow-lg overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {notifications.length > 0 && (
              <button
                onClick={() => setNotifications([])}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-auto divide-y">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No notifications yet
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors',
                    !n.read && 'bg-primary/5',
                  )}
                >
                  <div className="shrink-0 mt-0.5">
                    {n.type === 'ready_for_review' && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                    {n.type === 'ai_completed' && (
                      <CheckCircle2 className="h-4 w-4 text-purple-500" />
                    )}
                    {n.type === 'ai_failed' && (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-relaxed">{n.message}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{relativeTime(n.timestamp)}</p>
                  </div>
                  <button
                    onClick={(e) => dismiss(e, n.id)}
                    className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors mt-0.5"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
