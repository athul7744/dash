import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Task } from "@/lib/powersync/AppSchema";
import { usePowerSync } from "@powersync/react";
import { Check, Trash2, CornerDownRight, Undo2, Plus, Tag as TagIcon, Ellipsis } from "lucide-react";
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
import { useDerivedState } from "@/hooks/use-derived-state";
import { debouncedUpdate, debouncedExecute, flushUpdate, cancelExecute, cancelUpdate } from "@/lib/shared/debounced-update";
import { cn } from "@/lib/shared/utils";
import { PRIORITY_COLORS, PRIORITY_LEVELS } from "@/lib/tasks/tasks";
import { LinkedFrom } from "@/components/links/LinkedFrom";
import { RefField } from "@/components/links/RefField";
import { reconcileEntityRefs } from "@/lib/links/links";
import { setEntityTags, deleteEntityTags } from "@/lib/tags/entity-tags";
import { cascadeOccurrences, purgeEntity } from "@/lib/shared/trash";
import { useTaskTrashToast } from "@/hooks/use-trash-action";
import { useOptimisticTagIds } from "@/hooks/use-entity-tags";
import { parseRefTokens } from "@/lib/links/tokens";
import { logOccurrence, deleteSubjectOccurrences } from "@/lib/events/events";
import { TaskMetadataEditor } from "@/components/tasks/TaskMetadataEditor";
import { TaskLink } from "@/components/tasks/TaskLink";
import { TagSelector } from "@/components/tags/TagSelector";
import { SelectedTagPills } from "@/components/tags/SelectedTagPills";

interface TaskCardProps {
  task: Task;
  subtasks: Task[];
  /** Tag ids from entity_tags (batched by the list); membership's source of truth. */
  tagIds?: string[];
  isNew?: boolean;
  onNewCancel?: () => void;
}

export function TaskCard({ task, subtasks, tagIds = [], isNew, onNewCancel }: TaskCardProps) {
  const db = usePowerSync();
  const persistedTaskState = task.state ?? "pending";
  // Local, editable copies of the persisted fields; each re-syncs when its prop
  // changes (adjust-during-render, so no setState-in-effect). Local edits win
  // until the saved value changes.
  const [title, setTitle] = useDerivedState(task.title, (t) => t || "");
  const [priority, setPriority] = useDerivedState(task.priority, (p) => p || "medium");
  const [link, setLink] = useDerivedState(task.link, (l) => l || "");
  const [dueDate, setDueDate] = useDerivedState(task.due_date, (d) => (d ? new Date(d) : undefined));
  const [selectedTagIds, setSelectedTagIds] = useOptimisticTagIds(tagIds);
  const [optimisticState, setOptimisticState] = useDerivedState(persistedTaskState, (s) => s);
  const taskTrashToast = useTaskTrashToast();

  const [newSubtaskTitle, setNewSubtaskTitle] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  // Optimistic UI state
  const [optimisticSubtasks, setOptimisticSubtasks] = React.useState<Task[]>([]);
  const [optimisticSubtaskStates, setOptimisticSubtaskStates] = React.useState<Record<string, string>>({});
  const reduce = useReducedMotion();

  // Reference edges roll up to the root task: recompute from the saved parent
  // title + all saved subtask titles whenever any of them change (deduped in
  // reconcileEntityRefs). Derived from persisted props, so edges track saved
  // state and never race in-flight edits.
  const subtaskTitlesKey = subtasks.map((st) => st.title ?? "").join("");
  React.useEffect(() => {
    if (isNew) return;
    void reconcileEntityRefs(task.id, [task.title ?? "", ...subtasks.map((st) => st.title ?? "")]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, task.title, subtaskTitlesKey, isNew]);

  // Drop optimistic subtasks once their real rows arrive. Keyed on the set of
  // ids (a stable string) so it adjusts only when membership changes — not on
  // every render, which the query array's churning identity would otherwise
  // cause (and would loop if done here on the array ref).
  const subtaskIdsKey = subtasks.map((st) => st.id).join(",");
  const [prevSubtaskIdsKey, setPrevSubtaskIdsKey] = React.useState(subtaskIdsKey);
  if (prevSubtaskIdsKey !== subtaskIdsKey) {
    setPrevSubtaskIdsKey(subtaskIdsKey);
    setOptimisticSubtasks((prev) => {
      if (prev.length === 0) return prev;
      const filtered = prev.filter((opt) => !subtasks.some((st) => st.id === opt.id));
      return filtered.length !== prev.length ? filtered : prev;
    });
  }

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
      // Tag membership goes to entity_tags below.
      `INSERT INTO tasks (id, user_id, title, priority, link, state, due_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [task.id, userId, title.trim(), priority, link.trim() || null, dueDate ? dueDate.toISOString() : null, now, now]
    );
    if (selectedTagIds.length) await setEntityTags(task.id, "task", selectedTagIds);
  };

  const commitNewSubtask = async () => {
    const subtaskTitle = newSubtaskTitle.trim();
    if (!subtaskTitle) return;
    const newSubtaskId = uuidv4();
    const now = new Date().toISOString();

    // Optimistic update first — no awaits before this
    setNewSubtaskTitle("");
    setOptimisticSubtasks(prev => [...prev, {
      id: newSubtaskId, parent_id: task.id, title: subtaskTitle,
      priority: 'low', state: 'pending', created_at: now,
    } as Task]);

    // Debounced persist
    const userId = await getCurrentUserId();
    debouncedExecute(
      `INSERT INTO tasks (id, user_id, parent_id, title, priority, state, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'low', 'pending', ?, ?)`,
      [newSubtaskId, userId, task.id, subtaskTitle, now, now],
      newSubtaskId
    );
  };

  const toggleTaskState = async (t: Task) => {
    const persistedState = t.state ?? "pending";
    const currentState = t.parent_id ? (optimisticSubtaskStates[t.id] ?? persistedState) : optimisticState;
    const newState = currentState === 'completed' ? 'pending' : 'completed';

    // Cross-app tie: completing a task that links an Event logs an occurrence.
    if (newState === 'completed') {
      for (const tok of parseRefTokens(t.title ?? "")) {
        if (tok.kind === "event" && tok.id) void logOccurrence(tok.id, { source: "task" });
      }
    }

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
      await deleteSubjectOccurrences(t.id);
      await deleteEntityTags(t.id);
      return;
    }

    // Parent task logic
    if (optimisticState === 'trashed') {
      // Permanently delete — cancel/flush pending writes first, then delete via the
      // shared purge (children + full relationship fan-out). The card animates out
      // via AnimatePresence as the watched query drops it from the list.
      cancelExecute(t.id);
      await flushUpdate(t.id, 'tasks');
      await purgeEntity('task', t.id);
    } else {
      // Move to trash — debounced state flip, plus the shared undo toast and the
      // occurrence-log cascade (hidden while trashed, restored on undo).
      setOptimisticState('trashed');
      persistStateChange(t, 'trashed');
      subtasks.forEach(st => persistStateChange(st, 'trashed'));
      taskTrashToast(t.id, t.title ?? undefined, () => restoreTask());
    }
  };

  const restoreTask = () => {
    const restoredTaskState = task.state === 'trashed' ? 'pending' : persistedTaskState;
    setOptimisticState(restoredTaskState);
    persistStateChange(task, restoredTaskState);
    void cascadeOccurrences(task.id, false);
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
      {/* Main Task Header — roomy vertical padding, tighter side padding on mobile */}
      <div className="flex flex-col gap-1 px-3 py-4 sm:p-4">
        {/* Checkbox + title + actions share the top line; checkbox centered to the title */}
        <div className="flex items-center gap-3 min-w-0">
          {!isNew && !isTrashed && (
            <button
              onClick={() => toggleTaskState(task)}
              className={cn(
                "h-5 w-5 rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-all duration-300 ease-out",
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
            <RefField
              value={title}
              autoFocus={isNew}
              singleLine
              readOnly={isTrashed}
              maxLength={250}
              excludeId={task.id}
              ariaLabel="Task title"
              placeholder="Task Title..."
              onChange={(v) => { if (!isTrashed) setTitle(v); }}
              onBlur={() => { if (!isNew && !isTrashed) handleUpdate("title", title); }}
              onCommit={() => { if (isNew) void handleSaveNew(); }}
              className={`flex-1 block bg-transparent text-[15px] font-semibold leading-snug ${task.state === 'completed' || isTrashed ? 'line-through text-muted-foreground' : 'text-card-foreground'}`}
            />

            {/* Actions: Link + Tag + Priority + Restore + Trash */}
            <div className="flex items-center gap-1.5 shrink-0">
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
                  onSelectedTagIdsChange={(ids) => {
                    setSelectedTagIds(ids);
                    if (!isNew) void setEntityTags(task.id, "task", ids);
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
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label="More actions"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground focus:outline-none"
                  >
                    <Ellipsis className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem variant="destructive" onClick={() => trashTask(task)}>
                      <Trash2 className="h-4 w-4" />
                      {isTrashed ? "Delete permanently" : "Move to trash"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Meta line — due date, due badge, and tag pills share one wrapping row,
              now on their own full-width line below the title/actions so tags stretch
              the whole card. Hidden for trashed tasks. */}
        {!isTrashed && (
          <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", !isNew && "pl-8")}>
            <TaskMetadataEditor
              completed={optimisticState === 'completed'}
              dueDate={dueDate}
              onDueDateChange={(date) => {
                setDueDate(date);
                if (!isNew) handleUpdate("due_date", date ? date.toISOString() : null);
              }}
              selectedTagIds={selectedTagIds}
              onSelectedTagIdsChange={setSelectedTagIds}
              density="compact"
              dueDateFormat="MMM d, yyyy"
              showTags={false}
              className="mt-0 pb-0"
            />
            <SelectedTagPills tagIds={selectedTagIds} />
          </div>
        )}
        {!isTrashed && !isNew ? <LinkedFrom targetId={task.id} className="ml-8 self-start" /> : null}
      </div>

      {/* Subtasks Section */}
      {!isNew && (
        <div className="bg-black/20 border-t border-border px-2.5 py-3 pl-3 sm:p-3 sm:pl-4 flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
          {combinedSubtasks.map((st) => {
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

                <RefField
                  value={st.title || ""}
                  singleLine
                  readOnly={isTrashed}
                  maxLength={250}
                  excludeId={st.id}
                  ariaLabel="Subtask title"
                  onChange={(v) => { if (!isTrashed) debouncedUpdate(st.id, 'title', v); }}
                  className={`flex-1 block bg-transparent text-[13px] min-h-[20px] pt-0.5 ${currentState === 'completed' || isTrashed ? 'line-through text-muted-foreground' : 'text-card-foreground'}`}
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
              <RefField
                value={newSubtaskTitle}
                singleLine
                clearOnCommit
                maxLength={250}
                excludeId={task.id}
                ariaLabel="Add subtask"
                placeholder="Add subtask"
                onChange={setNewSubtaskTitle}
                onCommit={() => void commitNewSubtask()}
                className="flex-1 block bg-transparent text-[13px] text-muted-foreground min-h-[20px]"
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
