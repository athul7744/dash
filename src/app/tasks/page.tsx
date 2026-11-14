"use client";

import { useQuery } from '@powersync/react';

import { useCachedQuery } from '@/hooks/use-cached-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Plus, Tag as TagIcon, X, ListTodo, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Task } from '@/lib/powersync/AppSchema';
import { TaskCard } from '@/components/tasks/TaskCard';
import { ManageTagsDialog } from '@/components/tasks/ManageTagsDialog';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '@/lib/shared/utils';
import { DURATION, EASE } from '@/lib/shared/motion';
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AppHeader } from "@/components/AppHeader";
import { MobileBottomFabs } from "@/components/MobileBottomFabs";
import { TasksContentSkeleton, TasksFilterRowSkeleton } from "../../components/tasks/TasksPageSkeleton";
import { getApp, HEADER_ACTION_BASE } from "@/lib/shared/apps";
import { useNewItemParam } from "@/hooks/use-new-item-param";
import { useEntityTags } from "@/hooks/use-entity-tags";
import { hasPendingWrites, flushAllUpdates } from "@/lib/shared/debounced-update";
import { buildTaskOrderBy, isTaskSort, type TaskSort } from "@/lib/tasks/tasks";
import { TaskFilterBar } from "@/components/tasks/TaskFilterBar";
import { useAllTags } from '@/hooks/use-tags';

const tasksApp = getApp("tasks");

export default function Home() {
  const reduce = useReducedMotion();

  // Warn user and flush pending writes if they try to leave during debounce window
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasPendingWrites()) {
        flushAllUpdates();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);
  
  const [filterStates, setFilterStates] = useState<string[]>(['pending']);
  const [filterPriorities, setFilterPriorities] = useState<string[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [isManageTagsOpen, setIsManageTagsOpen] = useState(false);
  
  // Infinite scroll: how many top-level tasks are loaded. Grows by PAGE_SIZE as
  // the sentinel nears the viewport; resets when filters change.
  const PAGE_SIZE = 20;
  const [loadedCount, setLoadedCount] = useState(PAGE_SIZE);

  const [newTasks, setNewTasks] = useState<Task[]>([]);

  // Order lives in the URL so it survives a reload, the back button, and opening
  // a task and returning. `?sort=` is the whole state — an unknown value falls
  // back to the default rather than reaching SQL.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const sortParam = searchParams.get('sort');
  const sort: TaskSort = isTaskSort(sortParam) ? sortParam : 'due';
  const setSort = useCallback((next: TaskSort) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'due') params.delete('sort');
    else params.set('sort', next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  // The skeleton waits on the tags as well as the tasks, so this has to be
  // cached too or the flash comes back.
  const { tags: allTags, isLoading: loadingTags } = useAllTags();

  // Dynamic filter builder — applied to TOP-LEVEL tasks only (subtasks are loaded
  // per visible parent below). The stable `id` tiebreaker keeps the ordering
  // deterministic so growing the LIMIT never reshuffles, skips, or dupes a row.
  const parentConditions: string[] = ['parent_id IS NULL'];
  const filterArgs: (string | number)[] = [];

  if (filterStates.length > 0) {
    parentConditions.push(`state IN (${filterStates.map(() => '?').join(',')})`);
    filterArgs.push(...filterStates);
  } else {
    parentConditions.push(`state != 'trashed'`);
  }
  if (filterPriorities.length > 0) {
    parentConditions.push(`priority IN (${filterPriorities.map(() => '?').join(',')})`);
    filterArgs.push(...filterPriorities);
  }
  // Tag filter via the indexed entity_tags join (AND semantics: a task must
  // carry every selected tag — one membership subquery per tag).
  filterTags.forEach(tagId => {
    parentConditions.push(`id IN (SELECT entity_id FROM entity_tags WHERE entity_kind = 'task' AND tag_id = ?)`);
    filterArgs.push(tagId);
  });

  const whereClause = parentConditions.join(' AND ');
  const orderBy = `ORDER BY ${buildTaskOrderBy(sort)}`;

  // One page of top-level tasks (the DB does the paging — only these rows land in JS).
  const { data: topLevelTasks, isLoading: loadingTasks } = useCachedQuery<Task>(
    `SELECT * FROM tasks WHERE ${whereClause} ${orderBy} LIMIT ?`,
    [...filterArgs, loadedCount],
  );

  // Total matching top-level tasks — drives "load more?" without counting in JS.
  const { data: countRows = [] } = useQuery<{ c: number }>(
    `SELECT COUNT(*) AS c FROM tasks WHERE ${whereClause}`,
    filterArgs,
  );
  const totalTopLevel = countRows[0]?.c ?? 0;
  const hasMore = topLevelTasks.length < totalTopLevel;

  // Subtasks for the loaded parents only (scoped, not the whole table).
  const parentIds = topLevelTasks.map((t) => t.id);
  const { data: subtaskRows = [] } = useQuery<Task>(
    parentIds.length
      ? `SELECT * FROM tasks WHERE parent_id IN (${parentIds.map(() => '?').join(',')})`
      : `SELECT * FROM tasks WHERE 0`,
    parentIds,
  );

  // Reset the scroll window whenever the filters change (adjust-during-render, so
  // no setState-in-effect).
  const filterKey = `${filterStates.join()}|${filterPriorities.join()}|${filterTags.join()}|${sort}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setLoadedCount(PAGE_SIZE);
  }

  // Drop a draft once its real row arrives in the query, so the card doesn't jump
  // (also during render — converges once lengths match).
  if (newTasks.length > 0 && topLevelTasks.length > 0) {
    const stillDrafts = newTasks.filter(nt => !topLevelTasks.some(t => t.id === nt.id));
    if (stillDrafts.length !== newTasks.length) setNewTasks(stillDrafts);
  }

  const handleAddNewTask = () => {
    const tempTask = {
      id: uuidv4(),
      title: "",
      priority: "medium",
      link: "",
      state: "pending",
      due_date: "",
    } as Task;
    setNewTasks(prev => [tempTask, ...prev]);
    // Drafts always render at the top, so no need to move the scroll window.
    // If we add a task while viewing 'completed' or 'trashed' and NOT 'pending', ensure 'pending' is selected
    if (!filterStates.includes('pending')) {
      setFilterStates(prev => [...prev, 'pending']);
    }
  };

  const handleCancelNewTask = (id: string) => {
    setNewTasks(prev => prev.filter(t => t.id !== id));
  };

  const resetFilters = () => {
    // Not `['pending']`: clearing from a view that had no matches would land on
    // another one whenever the account holds no pending tasks. Everything but
    // the trash is the only state guaranteed to show something.
    setFilterStates([]);
    setFilterPriorities([]);
    setFilterTags([]);
  };

  // Command-palette "New task" (/tasks?new=1) opens a fresh draft on arrival.
  useNewItemParam(handleAddNewTask, true);

  // Whether the account holds any task at all, trashed ones included. The empty
  // state says something different when the list is empty because nothing
  // exists than when filters (or the trash) are hiding what does.
  const { data: anyTaskCount = [] } = useCachedQuery<{ c: number }>(
    `SELECT COUNT(*) AS c FROM tasks`,
  );
  const hasAnyTask = (anyTaskCount[0]?.c ?? 0) > 0;

  // Subtasks grouped by parent (scoped query, so only loaded parents' children).
  const getSubtasks = (parentId: string) => subtaskRows.filter(t => t.parent_id === parentId);

  // Drafts first, then the query rows, so a fresh draft renders at the top.
  const combinedTasks = [
    ...newTasks.filter(nt => !topLevelTasks.some((t) => t.id === nt.id)),
    ...topLevelTasks,
  ];

  // Tags for the visible parent cards, batched into one query (entity_tags).
  const taskTags = useEntityTags(topLevelTasks.map((t) => t.id));

  // Infinite scroll — grow the window when the sentinel nears the viewport.
  const mainRef = useRef<HTMLElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMore = useCallback(() => {
    if (hasMore && !loadingTasks) setLoadedCount((n) => n + PAGE_SIZE);
  }, [hasMore, loadingTasks]);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { root: mainRef.current, rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  const isInitialLoading = loadingTags || (loadingTasks && topLevelTasks.length === 0);

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden min-w-0">
      
      {/* Shared Header with App Switcher */}
      <AppHeader
        app={tasksApp}
        mobileMenuItems={
          <DropdownMenuItem onClick={() => setIsManageTagsOpen(true)}>
            <span>Manage Tags</span>
            <TagIcon className="ml-auto h-4 w-4 text-muted-foreground" />
          </DropdownMenuItem>
        }
        actions={
          <>
            <ManageTagsDialog />
            <button
              type="button"
              onClick={handleAddNewTask}
              className={cn(HEADER_ACTION_BASE, tasksApp.accent.hoverText)}
            >
              <Plus className="h-4 w-4" />
              New task
            </button>
          </>
        }
      >
        {isInitialLoading ? (
          <TasksFilterRowSkeleton />
        ) : (
          <TaskFilterBar
            filterStates={filterStates}
            onFilterStatesChange={setFilterStates}
            filterPriorities={filterPriorities}
            onFilterPrioritiesChange={setFilterPriorities}
            filterTags={filterTags}
            onFilterTagsChange={setFilterTags}
            allTags={allTags}
            sort={sort}
            onSortChange={setSort}
          />
        )}
      </AppHeader>

      <ManageTagsDialog open={isManageTagsOpen} onOpenChange={setIsManageTagsOpen} hideTrigger />

      {isInitialLoading ? <TasksContentSkeleton /> : <motion.main
        ref={mainRef}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DURATION.base, ease: EASE.standard }}
        className="flex-1 overflow-y-auto overflow-x-hidden px-[var(--app-gutter-x)] py-4 pb-[var(--mobile-bottom-fab-clearance)] sm:pb-4 md:py-8 md:pb-8">
        <div className="max-w-7xl mx-auto h-full flex flex-col">
          
          {/* Task List */}
          {topLevelTasks.length === 0 && newTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 py-24 text-center animate-fade-slide-in">
              <ListTodo className="h-8 w-8 text-muted-foreground/40 mb-4" />
              {hasAnyTask ? (
                <>
                  <p className="text-muted-foreground text-sm">No tasks match your filters</p>
                  <Button onClick={resetFilters} variant="ghost" className="gap-2 mt-4 text-primary">
                    <X className="h-4 w-4" />
                    Clear filters
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground text-sm">No tasks yet</p>
                  <p className="text-muted-foreground/70 text-xs mt-1">Add your first one to get started.</p>
                  <Button onClick={handleAddNewTask} variant="ghost" className="gap-2 mt-4 text-primary">
                    <Plus className="h-4 w-4" />
                    New task
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="columns-1 gap-6 space-y-6 px-0.5 pb-24 sm:px-1 sm:pb-4 md:columns-2 xl:columns-3">
                <AnimatePresence>
                  {combinedTasks.map((task) => {
                    const isDraft = newTasks.some(nt => nt.id === task.id);
                    return (
                      // content-visibility skips layout/paint for off-screen
                      // cards, so DOM cost stays flat however many are loaded;
                      // the remembered intrinsic size keeps the scrollbar stable.
                      <div key={task.id} className="break-inside-avoid [content-visibility:auto] [contain-intrinsic-size:auto_240px]">
                        <TaskCard
                          task={task}
                          subtasks={isDraft ? [] : getSubtasks(task.id)}
                          tagIds={taskTags.get(task.id) ?? []}
                          isNew={isDraft}
                          onNewCancel={() => handleCancelNewTask(task.id)}
                        />
                      </div>
                    );
                  })}
                </AnimatePresence>
              </div>

              {/* Infinite-scroll sentinel + status */}
              {hasMore ? (
                <div ref={sentinelRef} className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading more…
                </div>
              ) : totalTopLevel > PAGE_SIZE ? (
                <div className="py-8 text-center text-xs text-muted-foreground/70">All {totalTopLevel} tasks loaded</div>
              ) : null}
            </div>
          )}
        </div>
      </motion.main>}

      <MobileBottomFabs
        app={tasksApp}
        centerContent={
          <button
            type="button"
            onClick={handleAddNewTask}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground"
          >
            <Plus className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            New task
          </button>
        }
      />
    </div>
  );
}
