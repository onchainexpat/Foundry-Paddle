import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Clock, Loader2 } from "lucide-react";
import { addDays, format, isSameDay, startOfDay } from "date-fns";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PadelEvent {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_min: number;
  spots_left: number;
  total_spots: number;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

async function fetchEvents(date: string): Promise<PadelEvent[]> {
  const res = await fetch(`/api/events?date=${date}`);
  if (!res.ok) throw new Error("Failed to load events");
  return res.json();
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const today = startOfDay(new Date());
const VISIBLE_DAYS = 9;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function WeekStrip({
  selectedDate,
  onSelect,
  weekStart,
  onShift,
}: {
  selectedDate: Date;
  onSelect: (d: Date) => void;
  weekStart: Date;
  onShift: (dir: -1 | 1) => void;
}) {
  const days = Array.from({ length: VISIBLE_DAYS }, (_, i) =>
    addDays(weekStart, i),
  );

  const monthLabel = format(days[0], "MMMM yyyy");

  return (
    <div className="flex flex-col items-center bg-card px-3 pt-4 pb-3 sm:px-6">
      <span className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {monthLabel}
      </span>
      <div className="flex items-center gap-1 sm:gap-2">
        <button
          onClick={() => onShift(-1)}
          className="p-1 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Previous days"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-1 sm:gap-3 overflow-x-auto">
          {days.map((day) => {
            const isSelected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, today);
            return (
              <button
                key={day.toISOString()}
                onClick={() => onSelect(day)}
                className={`flex flex-col items-center min-w-[3rem] sm:min-w-[3.5rem] px-2 py-2 transition-all ${
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : isToday
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="text-[10px] font-medium uppercase tracking-wider">
                  {format(day, "EEE")}
                </span>
                <span className="text-lg font-semibold leading-tight">
                  {format(day, "d")}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => onShift(1)}
          className="p-1 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Next days"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")} ${period}`;
}

function SpotsIndicator({
  spotsLeft,
  totalSpots,
}: {
  spotsLeft: number;
  totalSpots: number;
}) {
  const pct = totalSpots > 0 ? (spotsLeft / totalSpots) * 100 : 0;
  const isFull = spotsLeft === 0;

  return (
    <div className="flex flex-col items-end gap-1">
      <span
        className={`text-xs font-medium ${isFull ? "text-muted-foreground" : "text-emerald-400"}`}
      >
        {isFull ? "0 spots left" : `${spotsLeft} spots left`}
      </span>
      <div className="h-1.5 w-16 overflow-hidden bg-secondary">
        <div
          className={`h-full transition-all ${isFull ? "bg-muted-foreground" : "bg-emerald-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function EventCard({ event }: { event: PadelEvent }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4 border-b border-border px-4 py-5 sm:px-6 last:border-b-0">
      <div className="flex items-center gap-2 sm:w-36 shrink-0">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">
            {formatTime(event.start_time)} - {formatTime(event.end_time)}
          </p>
          <p className="text-xs text-muted-foreground">
            {event.duration_min} min
          </p>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="font-display text-lg tracking-wide text-foreground truncate">
          {event.title}
        </h4>
      </div>

      <div className="flex items-center gap-4 sm:gap-6 shrink-0">
        <div className="hidden sm:flex flex-col items-end">
          <SpotsIndicator
            spotsLeft={event.spots_left}
            totalSpots={event.total_spots}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

interface EventsModalProps {
  children: React.ReactNode;
}

export default function EventsModal({ children }: EventsModalProps) {
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today);
  const [weekStart, setWeekStart] = useState(today);

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["events", dateStr],
    queryFn: () => fetchEvents(dateStr),
    enabled: open,
    staleTime: 60_000,
  });

  const handleShift = (dir: -1 | 1) => {
    setWeekStart((prev) => addDays(prev, dir * VISIBLE_DAYS));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="font-display text-2xl tracking-widest">
            UPCOMING EVENTS
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Browse clinics and programs. Select a day to see what's on.
          </DialogDescription>
        </DialogHeader>

        <WeekStrip
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
          weekStart={weekStart}
          onShift={handleShift}
        />

        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : events.length > 0 ? (
            events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="font-display text-xl tracking-wide text-muted-foreground">
                NO EVENTS
              </p>
              <p className="mt-2 text-sm text-muted-foreground/70">
                Nothing scheduled for this day. Try another date.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
