import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Task } from "@/lib/powersync/AppSchema";
import { usePowerSync } from "@powersync/react";
import { Check, Trash2, CornerDownRight, Undo2, Plus, Tag as TagIcon } from "lucide-react";
import { DURATION, EASE, SPRING_SOFT } from "@/lib/shared/motion";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { v4 as uuidv4 } from "uuid";
import { getCurrentUserId } from "@/lib/shared/auth";
import { debouncedUpdate, debouncedExecute, flushUpdate, cancelExecute, cancelUpdate } from "@/lib/shared/debounced-update";
import { autoResizeTextarea, cn } from "@/lib/shared/utils";
import { PRIORITY_COLORS, PRIORITY_LEVELS } from "@/lib/tasks/tasks";
import { TaskMetadataEditor } from "@/components/tasks/TaskMetadataEditor";
import { TaskLink } from "@/components/tasks/TaskLink";
import { TagSelector } from "@/components/tags/TagSelector";
import { SelectedTagPills } from "@/components/tags/SelectedTagPills";

interface TaskCardProps {
  task: Task;
  subtasks: Task[];
  isNew?: boolean;
  onNewCancel?: () => void;
}

export function TaskCard({ task, subtasks, isNew, onNewCancel }: TaskCardProps) {
  const db = usePowerSync();
  const persistedTaskState = task.state ?? "pending";
  const [title, setTitle] = React.useState(task.title || "");
  const [priority, setPriority] = React.useState(task.priority || "medium");
  const [link, setLink] = React.useState(task.link || "");

  const [dueDate, setDueDate] = React.useState<Date | undefined>(
    task.due_date ? new Date(task.due_date) : undefined
  );
  const [isCalendarOpen, setIsCalendarOpen] = React.useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = React.useState("");

  // Tags Logic
  const [selectedTagIds, setSelectedTagIds] = React.useState<string[]>(() => {
    try { return JSON.parse(task.tags || "[]"); } catch { return []; }
  });
  const [isSaving, setIsSaving] = React.useState(false);

  // Optimistic UI state
  const [optimisticSubtasks, setOptimisticSubtasks] = React.useState<Task[]>([]);
  const [optimisticState, setOptimisticState] = React.useState(persistedTaskState);
  const [optimisticSubtaskStates, setOptimisticSubtaskStates] = React.useState<Record<string, string>>({});
  const reduce = useReducedMotion();

  React.useEffect(() => { setOptimisticState(persistedTaskState); }, [persistedTaskState]);
  React.useEffect(() => { setTitle(task.title || ""); }, [task.title]);
  React.useEffect(() => { setPriority(task.priority || "medium"); }, [task.priority]);
  React.useEffect(() => { setLink(task.link || ""); }, [task.link]);
  React.useEffect(() => {
    setDueDate(task.due_date ? new Date(task.due_date) : undefined);
  }, [task.due_date]);
  React.useEffect(() => {
    try { setSelectedTagIds(JSON.parse(task.tags || "[]")); } catch { setSelectedTagIds([]); }
  }, [task.tags]);

  // Sync optimistic subtasks with real data
  React.useEffect(() => {
    if (optimisticSubtasks.length > 0 && subtasks.length > 0) {
      setOptimisticSubtasks(prev => {
        const filtered = prev.filter(opt => !subtasks.some(st => st.id === opt.id));
        return filtered.length !== prev.length ? filtered : prev;
      });
    }
  }, [subtasks, optimisticSubtasks.length]);

  const combinedSubtasks = [
    ...subtasks,
    ...optimisticSubtasks.filter(opt => !subtasks.some(st => st.id === opt.id))
  ].sort((a, b) => {
    // Parse dates robustly — SQLite uses 'YYYY-MM-DD HH:MM:SS', Supabase uses ISO 8601
    const parse = (d: string | null | undefined) => {
      if (!d) return Infinity;
      const t = new Date(d.replace(' ', 'T')).getTime();
      return isNaN(t) ? Infinity : t;
    };
    return parse(a.created_at) - parse(b.created_at);
  });

  // --- Task Actions ---

  const handleUpdate = (field: string, value: string | null) => {
    if (isNew) return;
    debouncedUpdate(task.id, field, value);
  };

  const persistStateChange = React.useCallback((record: Task, nextState: string) => {
    const persistedState = record.state ?? "pending";
    if (nextState === persistedState) {
      cancelUpdate(record.id, "state");
      return;
    }
    debouncedUpdate(record.id, "state", nextState);
  }, []);

  const handleSaveNew = async () => {
    if (!title.trim()) { onNewCancel?.(); return; }
    setIsSaving(true);
    const userId = await getCurrentUserId();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO tasks (id, user_id, title, priority, link, state, due_date, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      [task.id, userId, title.trim(), priority, link.trim() || null, dueDate ? dueDate.toISOString() : null, JSON.stringify(selectedTagIds), now, now]
    );
  };

  const handleAddSubtask = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newSubtaskTitle.trim()) {
      const newSubtaskId = uuidv4();
      const subtaskTitle = newSubtaskTitle.trim();
      const now = new Date().toISOString();

      // Optimistic update first — no awaits before this
      setNewSubtaskTitle("");
      setOptimisticSubtasks(prev => [...prev, {
        id: newSubtaskId, parent_id: task.id, title: subtaskTitle,
        priority: 'low', state: 'pending', tags: "[]", created_at: now,
      } as Task]);

      // Debounced persist
      const userId = await getCurrentUserId();
      debouncedExecute(
        `INSERT INTO tasks (id, user_id, parent_id, title, priority, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'low', 'pending', ?, ?)`,
        [newSubtaskId, userId, task.id, subtaskTitle, now, now],
        newSubtaskId
      );
    }
  };

  const toggleTaskState = async (t: Task) => {
    const persistedState = t.state ?? "pending";
    const currentState = t.parent_id ? (optimisticSubtaskStates[t.id] ?? persistedState) : optimisticState;
    const newState = currentState === 'completed' ? 'pending' : 'completed';

    if (!t.parent_id) {
      setOptimisticState(newState);
      if (newState === 'completed') {
        const updates: Record<string, string> = {};
        subtasks.forEach(st => updates[st.id] = 'completed');
        setOptimisticSubtaskStates(prev => ({ ...prev, ...updates }));
      } else if (currentState !== persistedState) {
        const updates: Record<string, string> = {};
        subtasks.forEach(st => updates[st.id] = st.state ?? 'pending');
        setOptimisticSubtaskStates(prev => ({ ...prev, ...updates }));
      }
    } else {
      setOptimisticSubtaskStates(prev => ({ ...prev, [t.id]: newState }));
    }

    // Debounced writes — merge with any pending field edits for this task
    persistStateChange(t, newState);
    if (newState === 'completed' && !t.parent_id) {
      subtasks.forEach(st => persistStateChange(st, 'completed'));
    } else if (!t.parent_id && currentState !== persistedState) {
      subtasks.forEach(st => persistStateChange(st, st.state ?? 'pending'));
    }
  };

  const trashTask = async (t: Task) => {
    const isSubtask = !!t.parent_id;

    if (isSubtask) {
      // Subtasks are deleted directly — no trash state
      setOptimisticSubtasks(prev => prev.filter(opt => opt.id !== t.id));
      // Cancel any pending INSERT and flush any pending UPDATE before deleting
      cancelExecute(t.id);
      await flushUpdate(t.id, 'tasks');
      await db.execute(`DELETE FROM tasks WHERE id = ?`, [t.id]);
      return;
    }

    // Parent task logic
    if (optimisticState === 'trashed') {
      // Permanently delete — cancel/flush pending writes first, then delete immediately
      cancelExecute(t.id);
      await flushUpdate(t.id, 'tasks');
      // Delete immediately; the card animates out via AnimatePresence as it
      // unmounts (the watched query drops it from the list).
      await db.execute(`DELETE FROM tasks WHERE id = ?`, [t.id]);
      await db.execute(`DELETE FROM tasks WHERE parent_id = ?`, [t.id]);
    } else {
      // Move to trash — debounced
      setOptimisticState('trashed');
      persistStateChange(t, 'trashed');
      subtasks.forEach(st => persistStateChange(st, 'trashed'));
    }
  };

  const restoreTask = () => {
    const restoredTaskState = task.state === 'trashed' ? 'pending' : persistedTaskState;
    setOptimisticState(restoredTaskState);
    persistStateChange(task, restoredTaskState);
    if (!task.parent_id) {
      const restoredSubtaskState = task.state === 'trashed' ? 'pending' : null;
      const updates: Record<string, string> = {};
      subtasks.forEach(st => {
        const nextState = restoredSubtaskState ?? st.state ?? 'pending';
        updates[st.id] = nextState;
        persistStateChange(st, nextState);
      });
      setOptimisticSubtaskStates(prev => ({ ...prev, ...updates }));
    }
  };

  // --- Derived UI State ---

  const isTrashed = optimisticState === 'trashed';

  return (
    <motion.div
      layout={false}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: optimisticState === 'completed' ? 0.6 : 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }}
      transition={{ duration: DURATION.base, ease: EASE.standard }}
      className={cn(
      "group relative flex flex-col rounded-xl border shadow-sm hover:shadow-md mb-4 overflow-hidden break-inside-avoid",
      "transition-[background-color,border-color] duration-500 ease-out",
      optimisticState === 'trashed'
        ? "bg-rose-50/40 dark:bg-rose-950/15 border-rose-200/40 dark:border-rose-800/30"
        : "bg-background border-border",
      optimisticState === 'completed' ? "bg-muted/50" : ""
    )}>
      {/* Main Task Header */}
      <div className="flex items-start gap-3 p-4">
        {!isNew && !isTrashed && (
          <button
            onClick={() => toggleTaskState(task)}
            className={cn(
              "h-5 w-5 rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-all duration-300 ease-out mt-0.5",
              optimisticState === 'completed'
                ? "bg-emerald-500 border-emerald-500 text-white"
                : "border-muted-foreground/30 hover:border-emerald-500/50"
            )}
          >
            <AnimatePresence>
              {optimisticState === 'completed' && (
                <motion.span
                  initial={reduce ? false : { scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { scale: 0, opacity: 0 }}
                  transition={SPRING_SOFT}
                  className="flex items-center justify-center"
                >
                  <Check className="h-3.5 w-3.5 stroke-[3]" />
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        )}

        <div className="flex flex-col flex-1 gap-2 min-w-0">
          {/* Title */}
          <textarea
            ref={autoResizeTextarea}
            maxLength={250}
            rows={1}
            className={`bg-transparent text-[15px] font-semibold focus:outline-none placeholder:text-muted-foreground/50 w-full resize-none overflow-hidden block min-h-[24px] ${task.state === 'completed' || isTrashed ? 'line-through text-muted-foreground' : 'text-card-foreground'}`}
            placeholder="Task Title..."
            value={title}
            readOnly={isTrashed}
            onChange={(e) => { if (!isTrashed) { autoResizeTextarea(e.target); setTitle(e.target.value); } }}
            onBlur={() => { if (!isNew && !isTrashed) handleUpdate("title", title); }}
            onKeyDown={(e) => {
              if (isTrashed) return;
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (isNew) handleSaveNew(); else e.currentTarget.blur();
              }
            }}
            autoFocus={isNew}
          />

          {/* Metadata Row — hidden for trashed tasks. Tags live in the top action
              bar (add) + a pill row below (display), mirroring the bookmark card. */}
          {!isTrashed && (
            <TaskMetadataEditor
              dueDate={dueDate}
              onDueDateChange={(date) => {
                setDueDate(date);
                if (!isNew) handleUpdate("due_date", date ? date.toISOString() : null);
              }}
              selectedTagIds={selectedTagIds}
              onSelectedTagIdsChange={setSelectedTagIds}
              density="compact"
              showTags={false}
            />
          )}

          {!isTrashed && <SelectedTagPills tagIds={selectedTagIds} className="mt-0.5" />}
        </div>

        {/* Actions: Link + Tag + Priority + Restore + Trash */}
        <div className="flex items-center gap-1.5 ml-auto pl-2">
          {!isTrashed && (
            <TaskLink
              link={link}
              onLinkChange={(value) => {
                setLink(value);
                if (!isNew) handleUpdate("link", value.trim() || null);
              }}
            />
          )}

          {!isTrashed && (
            <TagSelector
              selectedTagIds={selectedTagIds}
              onSelectedTagIdsChange={(tagIds) => {
                setSelectedTagIds(tagIds);
                if (!isNew) handleUpdate("tags", JSON.stringify(tagIds));
              }}
              showSelectedTags={false}
              triggerContent={<TagIcon className="h-4 w-4" />}
              triggerClassName="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-accent hover:text-foreground transition-colors"
            />
          )}

          {!isTrashed && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex h-6 w-6 items-center justify-center focus:outline-none rounded-md ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                title={`Priority: ${priority}`}
              >
                <div
                  className={cn(
                    "h-3 w-3 rounded-full shadow-sm ring-2 ring-offset-1 ring-offset-background transition-colors",
                    PRIORITY_COLORS[priority]?.bg || PRIORITY_COLORS.medium.bg,
                    PRIORITY_COLORS[priority]?.ring || PRIORITY_COLORS.medium.ring
                  )}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32">
                {PRIORITY_LEVELS.map((p) => (
                  <DropdownMenuItem
                    key={p}
                    onClick={() => { setPriority(p); if (!isNew) handleUpdate("priority", p); }}
                    className="flex items-center gap-2 cursor-pointer capitalize"
                  >
                    <div className={cn("h-2.5 w-2.5 rounded-full", PRIORITY_COLORS[p].bg)} />
                    {p}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {isTrashed && !isNew && (
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground/50 hover:text-emerald-600 shrink-0 transition-colors" onClick={restoreTask} title="Restore task">
              <Undo2 className="h-4 w-4" />
            </Button>
          )}

          {!isNew && (
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground/50 hover:text-destructive shrink-0 transition-colors" onClick={() => trashTask(task)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Subtasks Section */}
      {!isNew && (
        <div className="bg-black/20 border-t border-border p-3 pl-4 flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
          {combinedSubtasks.map((st: any) => {
            const currentState = optimisticSubtaskStates[st.id] || st.state;
            return (
              <motion.div
                key={st.id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: currentState === 'completed' ? 0.6 : 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
                transition={{ duration: DURATION.base, ease: EASE.standard }}
                className="flex items-center gap-2 group/subtask"
              >
                <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 ml-1 mt-0.5" />
                {!isTrashed && (
                  <button
                    onClick={() => toggleTaskState(st)}
                    className={cn(
                      "h-4 w-4 rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-all duration-300 ease-out mt-0.5",
                      currentState === 'completed'
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "border-muted-foreground/30 hover:border-emerald-500/50"
                    )}
                  >
                    <AnimatePresence>
                      {currentState === 'completed' && (
                        <motion.span
                          initial={reduce ? false : { scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={reduce ? { opacity: 0 } : { scale: 0, opacity: 0 }}
                          transition={SPRING_SOFT}
                          className="flex items-center justify-center"
                        >
                          <Check className="h-2.5 w-2.5 stroke-[3]" />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>
                )}

                <textarea
                  key={st.updated_at || st.id}
                  ref={autoResizeTextarea}
                  maxLength={250}
                  rows={1}
                  className={`bg-transparent text-[13px] focus:outline-none flex-1 resize-none overflow-hidden block min-h-[20px] pt-0.5 ${currentState === 'completed' || isTrashed ? 'line-through text-muted-foreground' : 'text-card-foreground'}`}
                  defaultValue={st.title || ""}
                  readOnly={isTrashed}
                  onChange={(e) => { if (!isTrashed) autoResizeTextarea(e.target); }}
                  onBlur={(e) => { if (!isTrashed) debouncedUpdate(st.id, 'title', e.target.value); }}
                  onKeyDown={(e) => {
                    if (isTrashed) return;
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); }
                  }}
                />

                {!isTrashed && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground/50 hover:text-destructive transition-all shrink-0" onClick={() => trashTask(st)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </motion.div>
            );
          })}
          </AnimatePresence>

          {/* Add Subtask — hidden for trashed */}
          {!isTrashed && (
            <div className="flex items-start gap-3 mt-1 p-1">
              <Plus className="h-3.5 w-3.5 text-primary ml-1.5 shrink-0 mt-0.5" />
              <textarea
                maxLength={250}
                rows={1}
                placeholder="Add subtask"
                className="bg-transparent text-[13px] focus:outline-none flex-1 text-muted-foreground placeholder:text-muted-foreground/50 resize-none overflow-hidden block min-h-[20px]"
                value={newSubtaskTitle}
                onChange={(e) => {
                  autoResizeTextarea(e.target);
                  setNewSubtaskTitle(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAddSubtask(e as any);
                    e.currentTarget.style.height = 'auto';
                  }
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Save/Cancel for Drafts */}
      {isNew && (
        <div className="bg-muted/10 border-t border-border p-2 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onNewCancel} disabled={isSaving}>Cancel</Button>
          <Button size="sm" onClick={handleSaveNew} disabled={!title.trim() || isSaving}>
            {isSaving ? "Saving..." : "Save Task"}
          </Button>
        </div>
      )}
    </motion.div>
  );
}
