import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Plus, Pencil, Trash2, LogIn } from "lucide-react";

function toTimeHHMM(t: string): string {
  return t.slice(0, 5);
}

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
  created_at: string;
  updated_at: string;
}

interface EventPayload {
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_min: number;
  spots_left: number;
  total_spots: number;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

function authHeaders(password: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${password}`,
  };
}

async function fetchAdminEvents(password: string): Promise<PadelEvent[]> {
  const res = await fetch("/api/admin/events", {
    headers: authHeaders(password),
  });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error("Failed to load events");
  return res.json();
}

async function createEvent(
  password: string,
  payload: EventPayload,
): Promise<PadelEvent> {
  const res = await fetch("/api/admin/events", {
    method: "POST",
    headers: authHeaders(password),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Create failed");
  }
  return res.json();
}

async function updateEvent(
  password: string,
  id: string,
  payload: EventPayload,
): Promise<PadelEvent> {
  const res = await fetch(`/api/admin/events/${id}`, {
    method: "PUT",
    headers: authHeaders(password),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Update failed");
  }
  return res.json();
}

async function deleteEvent(
  password: string,
  id: string,
): Promise<void> {
  const res = await fetch(`/api/admin/events/${id}`, {
    method: "DELETE",
    headers: authHeaders(password),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Delete failed");
  }
}

// ---------------------------------------------------------------------------
// Login Gate
// ---------------------------------------------------------------------------

function LoginGate({ onLogin }: { onLogin: (pw: string) => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await fetchAdminEvents(pw);
      onLogin(pw);
    } catch {
      setError("Invalid password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-6 border border-border p-8"
      >
        <div className="text-center">
          <h1 className="font-display text-3xl tracking-widest">ADMIN</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the admin password to continue.
          </p>
        </div>
        <div className="space-y-2">
          <Input
            type="password"
            placeholder="Password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoFocus
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={loading || !pw}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <LogIn className="h-4 w-4" />
              Sign In
            </>
          )}
        </Button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event Form (used for create & edit)
// ---------------------------------------------------------------------------

const EMPTY_FORM: EventPayload = {
  title: "",
  date: "",
  start_time: "",
  end_time: "",
  duration_min: 60,
  spots_left: 0,
  total_spots: 8,
};

function EventForm({
  initial,
  onSubmit,
  loading,
}: {
  initial: EventPayload;
  onSubmit: (data: EventPayload) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<EventPayload>(initial);

  const set = (field: keyof EventPayload, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Title
        </label>
        <Input
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Date
          </label>
          <Input
            type="date"
            value={form.date}
            onChange={(e) => set("date", e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Duration (min)
          </label>
          <Input
            type="number"
            min={1}
            value={form.duration_min}
            onChange={(e) => set("duration_min", parseInt(e.target.value) || 0)}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Start Time
          </label>
          <Input
            type="time"
            value={form.start_time}
            onChange={(e) => set("start_time", e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            End Time
          </label>
          <Input
            type="time"
            value={form.end_time}
            onChange={(e) => set("end_time", e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Spots Left
          </label>
          <Input
            type="number"
            min={0}
            value={form.spots_left}
            onChange={(e) => set("spots_left", parseInt(e.target.value) || 0)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Total Spots
          </label>
          <Input
            type="number"
            min={0}
            value={form.total_spots}
            onChange={(e) => set("total_spots", parseInt(e.target.value) || 0)}
          />
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Event"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Admin Dashboard
// ---------------------------------------------------------------------------

function Dashboard({ password }: { password: string }) {
  const queryClient = useQueryClient();

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["admin-events"],
    queryFn: () => fetchAdminEvents(password),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PadelEvent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PadelEvent | null>(null);

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["admin-events"] }),
    [queryClient],
  );

  const createMut = useMutation({
    mutationFn: (payload: EventPayload) => createEvent(password, payload),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: EventPayload }) =>
      updateEvent(password, id, payload),
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteEvent(password, id),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
    },
  });

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (ev: PadelEvent) => {
    setEditing(ev);
    setFormOpen(true);
  };

  const handleFormSubmit = (data: EventPayload) => {
    if (editing) {
      updateMut.mutate({ id: editing.id, payload: data });
    } else {
      createMut.mutate(data);
    }
  };

  const formatDate = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    const date = new Date(y, m - 1, day);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatTimeShort = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 || 12;
    return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-display text-3xl tracking-widest">
            EVENTS ADMIN
          </h1>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add Event
          </Button>
        </div>

        {events.length === 0 ? (
          <div className="border border-border p-12 text-center">
            <p className="font-display text-xl tracking-wide text-muted-foreground">
              NO EVENTS YET
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Click "Add Event" to create your first event.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card text-left">
                  <th className="px-4 py-3 font-medium uppercase tracking-wider text-muted-foreground text-xs">
                    Date
                  </th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wider text-muted-foreground text-xs">
                    Time
                  </th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wider text-muted-foreground text-xs">
                    Title
                  </th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wider text-muted-foreground text-xs">
                    Spots
                  </th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wider text-muted-foreground text-xs w-24">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr
                    key={ev.id}
                    className="border-b border-border last:border-b-0 hover:bg-card/50 transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDate(ev.date)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatTimeShort(ev.start_time)} –{" "}
                      {formatTimeShort(ev.end_time)}
                    </td>
                    <td className="px-4 py-3 font-display tracking-wide">
                      {ev.title}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {ev.spots_left} / {ev.total_spots}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(ev)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(ev)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit dialog */}
      <Dialog
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditing(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl tracking-widest">
              {editing ? "EDIT EVENT" : "NEW EVENT"}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {editing
                ? "Update the event details below."
                : "Fill in the details to create a new event."}
            </DialogDescription>
          </DialogHeader>
          <EventForm
            key={editing?.id ?? "new"}
            initial={
              editing
                ? {
                    title: editing.title,
                    date: editing.date,
                    start_time: toTimeHHMM(editing.start_time),
                    end_time: toTimeHHMM(editing.end_time),
                    duration_min: editing.duration_min,
                    spots_left: editing.spots_left,
                    total_spots: editing.total_spots,
                  }
                : EMPTY_FORM
            }
            onSubmit={handleFormSubmit}
            loading={createMut.isPending || updateMut.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Event</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.title}"? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export
// ---------------------------------------------------------------------------

export default function Admin() {
  const [password, setPassword] = useState<string | null>(() =>
    sessionStorage.getItem("admin_password"),
  );

  const handleLogin = (pw: string) => {
    sessionStorage.setItem("admin_password", pw);
    setPassword(pw);
  };

  if (!password) {
    return <LoginGate onLogin={handleLogin} />;
  }

  return <Dashboard password={password} />;
}
