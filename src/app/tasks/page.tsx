"use client";

import { useQuery } from '@powersync/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Plus, CheckCircle2, Filter, Tag as TagIcon, X, ListTodo, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Task, Tag } from '@/lib/powersync/AppSchema';
import { TaskCard } from '@/components/tasks/TaskCard';
import { ManageTagsDialog } from '@/components/tasks/ManageTagsDialog';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '@/lib/shared/utils';
import { DURATION, EASE } from '@/lib/shared/motion';
import { getTagColorClasses, getTagDotClass } from '@/lib/tasks/colors';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AppHeader } from "@/components/AppHeader";
import { MobileBottomFabs } from "@/components/MobileBottomFabs";
import { TasksContentSkeleton, TasksFilterRowSkeleton } from "../../components/tasks/TasksPageSkeleton";
import { getApp, HEADER_ACTION_BASE } from "@/lib/shared/apps";
import { useNewItemParam } from "@/hooks/use-new-item-param";
import { useEntityTags } from "@/hooks/use-entity-tags";
import { hasPendingWrites, flushAllUpdates } from "@/lib/shared/debounced-update";

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
  const [isTagFilterOpen, setIsTagFilterOpen] = useState(false);
  const [isManageTagsOpen, setIsManageTagsOpen] = useState(false);
  
  // Infinite scroll: how many top-level tasks are loaded. Grows by PAGE_SIZE as
  // the sentinel nears the viewport; resets when filters change.
  const PAGE_SIZE = 20;
  const [loadedCount, setLoadedCount] = useState(PAGE_SIZE);

  const [newTasks, setNewTasks] = useState<Task[]>([]);

  // Fetch Tags for the Filter
  const { data: allTags = [], isLoading: loadingTags } = useQuery("SELECT * FROM tags ORDER BY name ASC");

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
  const orderBy = `ORDER BY CASE WHEN due_date IS NULL OR due_date = '' THEN 1 ELSE 0 END, due_date ASC, CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ASC, id ASC`;

  // One page of top-level tasks (the DB does the paging — only these rows land in JS).
  const { data: topLevelTasks = [], isLoading: loadingTasks } = useQuery<Task>(
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
  const filterKey = `${filterStates.join()}|${filterPriorities.join()}|${filterTags.join()}`;
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

  // Command-palette "New task" (/tasks?new=1) opens a fresh draft on arrival.
  useNewItemParam(handleAddNewTask, true);

  // Subtasks grouped by parent (scoped query, so only loaded parents' children).
  const getSubtasks = (parentId: string) => subtaskRows.filter(t => t.parent_id === parentId);

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
        {/* Filter Row */}
        {isInitialLoading ? <TasksFilterRowSkeleton /> : <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 px-1 -mx-1">
          <div className="flex items-center text-muted-foreground shrink-0 mr-1">
            <Filter className="h-4 w-4" />
          </div>

          {/* Unified sorted pills */}
          {(() => {
            type Pill = { id: string; type: string; label: string; isActive: boolean; activeClass: string; onClick: () => void };
            const pills: Pill[] = [];

            // State pills
            (['pending', 'completed', 'trashed'] as const).forEach(state => {
              const isActive = filterStates.includes(state);
              
              let activeClass = "bg-indigo-100 text-indigo-700 dark:bg-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-700";
              if (state === 'completed') activeClass = "bg-emerald-100 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-700";
              if (state === 'trashed') activeClass = "bg-rose-100 text-rose-700 dark:bg-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-700";

              pills.push({
                id: `state-${state}`,
                type: 'state',
                label: state,
                isActive,
                activeClass,
                onClick: () => {
                  if (isActive) {
                    setFilterStates(filterStates.filter(s => s !== state));
                  } else {
                    setFilterStates([...filterStates, state]);
                  }
                }
              });
            });

            // Priority pills
            (['low', 'medium', 'high', 'urgent'] as const).forEach(p => {
              const isActive = filterPriorities.includes(p);
              
              let activeClass = "bg-sky-100 text-sky-700 dark:bg-sky-800 dark:text-sky-200 border border-sky-200 dark:border-sky-700";
              if (p === 'medium') activeClass = "bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-700";
              if (p === 'high') activeClass = "bg-orange-100 text-orange-700 dark:bg-orange-800 dark:text-orange-200 border border-orange-200 dark:border-orange-700";
              if (p === 'urgent') activeClass = "bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-200 border border-red-200 dark:border-red-700";
              
              pills.push({
                id: `priority-${p}`,
                type: 'priority',
                label: p,
                isActive,
                activeClass,
                onClick: () => {
                  if (isActive) {
                    setFilterPriorities(filterPriorities.filter(pr => pr !== p));
                  } else {
                    setFilterPriorities([...filterPriorities, p]);
                  }
                }
              });
            });

            // Tag pills
            filterTags.forEach(tagId => {
              const tag = allTags.find((t: Tag) => t.id === tagId);
              if (tag) {
                pills.push({
                  id: `tag-${tag.id}`,
                  type: 'tag',
                  label: tag.name,
                  isActive: true,
                  activeClass: getTagColorClasses(tag.color || 'slate'),
                  onClick: () => setFilterTags(filterTags.filter(id => id !== tag.id))
                });
              }
            });

            // Sort so active pills are always at the front
            pills.sort((a, b) => {
              if (a.isActive && !b.isActive) return -1;
              if (!a.isActive && b.isActive) return 1;
              return 0;
            });

            return pills.map(pill => (
              <button
                key={pill.id}
                onClick={pill.onClick}
                className={cn(
                  "px-4 py-1.5 font-heading text-sm font-medium rounded-full transition-all capitalize shrink-0 flex items-center gap-1.5",
                  pill.isActive 
                    ? pill.activeClass
                    : "bg-muted text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent"
                )}
              >
                {pill.label}
                {pill.type === 'tag' && (
                  <X className="h-3.5 w-3.5 ml-0.5 opacity-70" />
                )}
              </button>
            ));
          })()}

          {/* Tags Add Button */}
          <Popover open={isTagFilterOpen} onOpenChange={setIsTagFilterOpen}>
            <PopoverTrigger className="inline-flex items-center justify-center whitespace-nowrap font-heading font-medium bg-muted text-muted-foreground hover:text-foreground hover:bg-accent h-[32px] rounded-full px-4 text-sm gap-2 transition-colors shrink-0 ml-1 border border-transparent">
              <TagIcon className="h-3.5 w-3.5" />
              {filterTags.length > 0 ? `${filterTags.length}/3 Tags` : "Tags"}
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search tags..." className="h-9" />
                <CommandList>
                  <CommandEmpty>No tags found.</CommandEmpty>
                  <CommandGroup>
                    {allTags.map((tag) => {
                      const isSelected = filterTags.includes(tag.id);
                      const isMaxReached = filterTags.length >= 3 && !isSelected;
                      
                      return (
                        <CommandItem
                          key={tag.id}
                          disabled={isMaxReached}
                          className={isMaxReached ? "opacity-50 cursor-not-allowed" : ""}
                          onSelect={() => {
                            if (isSelected) {
                              setFilterTags(filterTags.filter(id => id !== tag.id));
                            } else if (!isMaxReached) {
                              setFilterTags([...filterTags, tag.id]);
                            }
                          }}
                        >
                          <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", isSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible")}>
                            <CheckCircle2 className="h-3 w-3" />
                          </div>
                          <div className={cn("h-2.5 w-2.5 rounded-full mr-2", getTagDotClass(tag.color || 'slate'))} />
                          <span>{tag.name}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>}
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
              <p className="text-muted-foreground text-sm">No tasks match your filters</p>
              <Button onClick={handleAddNewTask} variant="ghost" className="gap-2 mt-4 text-primary hidden sm:inline-flex">
                <Plus className="h-4 w-4" />
                New task
              </Button>
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="columns-1 md:columns-2 xl:columns-3 gap-6 space-y-6 px-0.5 pb-24 sm:px-1 sm:pb-4">
                {/* Render Combined Tasks to Prevent Layout Jumps */}
                <AnimatePresence>
                {(() => {
                  const combinedTasks = [
                    ...newTasks.filter(nt => !topLevelTasks.some((t) => t.id === nt.id)),
                    ...topLevelTasks
                  ];

                  return combinedTasks.map((task) => {
                    const isDraft = newTasks.some(nt => nt.id === task.id);
                    return (
                      // content-visibility skips layout/paint for off-screen cards,
                      // so DOM cost stays flat however many are loaded; the remembered
                      // intrinsic size keeps the scrollbar stable.
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
                  });
                })()}
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
