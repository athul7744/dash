import { column, Schema, Table } from '@powersync/web';

export const tasksTable = new Table({
  user_id: column.text,
  parent_id: column.text,
  title: column.text,
  due_date: column.text,
  priority: column.text,
  link: column.text,
  state: column.text,
  created_at: column.text,
  updated_at: column.text
});

export const tagsTable = new Table({
  user_id: column.text,
  name: column.text,
  color: column.text,
  created_at: column.text
});

export const timeLogsTable = new Table({
  user_id: column.text,
  activity_name: column.text,
  start_timestamp: column.text,
  duration_minutes: column.integer,
  created_at: column.text
});

export const activityTypesTable = new Table({
  user_id: column.text,
  name: column.text,
  color: column.text,
  category: column.text, // one of ACTIVITY_CATEGORIES; drives tracker widget semantics
  created_at: column.text
});

export const dailyRatingsTable = new Table({
  user_id: column.text,
  rating_date: column.text,
  score: column.integer,
  created_at: column.text
});

export const moodsTable = new Table({
  user_id: column.text,
  label: column.text,
  color: column.text, // a color name from ACTIVITY_COLORS
  value: column.integer, // ordinal (worst→best); this is the number stored in daily_ratings.score
  created_at: column.text
});

export const pagesTable = new Table({
  user_id: column.text,
  title: column.text,
  properties: column.text, // stored as JSON string
  created_at: column.text,
  updated_at: column.text
});

export const blocksTable = new Table(
  {
    user_id: column.text,
    page_id: column.text,
    parent_block_id: column.text,
    type: column.text,
    content: column.text, // stored as JSON string
    sort_rank: column.text,
    updated_at: column.text
  },
  // Hot path: "all items of one app" (WHERE page_id = ? AND type = ?) and note-block loads by page.
  { indexes: { page_type: ['page_id', 'type'] } }
);

export const edgesTable = new Table(
  {
    source_block_id: column.text, // generic source entity id (block id or task id)
    target_id: column.text, // generic target entity id
    user_id: column.text,
    type: column.text // 'page_ref' (legacy note wikilink) | 'ref' (id-bound any-entity link)
  },
  // Outbound links (WHERE source_block_id = ?) and backlinks (WHERE target_id = ?).
  { indexes: { source: ['source_block_id'], target: ['target_id'] } }
);

export const entityTagsTable = new Table(
  {
    user_id: column.text,
    entity_id: column.text, // a task, block, or page id (all global uuids)
    entity_kind: column.text, // 'task' | 'bookmark' | 'event' | 'note'
    tag_id: column.text
  },
  // "entities under a tag" (WHERE tag_id = ?) and "tags of an entity" (WHERE entity_id = ?).
  { indexes: { by_tag: ['tag_id'], by_entity: ['entity_id'] } }
);

export const attachmentsTable = new Table({
  user_id: column.text,
  page_id: column.text,
  block_id: column.text,
  file_path: column.text,
  sync_state: column.text,
  mime_type: column.text,
  file_name: column.text
});

export const propertyDefinitionsTable = new Table({
  user_id: column.text,
  name: column.text,
  type: column.text, // 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'url'
  config: column.text, // stored as JSON string (e.g. select options)
  created_at: column.text
});

export const AppSchema = new Schema({
  tasks: tasksTable,
  tags: tagsTable,
  time_logs: timeLogsTable,
  activity_types: activityTypesTable,
  daily_ratings: dailyRatingsTable,
  moods: moodsTable,
  pages: pagesTable,
  blocks: blocksTable,
  edges: edgesTable,
  entity_tags: entityTagsTable,
  attachments: attachmentsTable,
  property_definitions: propertyDefinitionsTable
});

export type Database = (typeof AppSchema)['types'];
export type Task = Database['tasks'];
export type Tag = Database['tags'];
export type TimeLog = Database['time_logs'];
export type ActivityType = Database['activity_types'];
export type DailyRating = Database['daily_ratings'];
export type PageRecord = Database['pages'];
export type BlockRecord = Database['blocks'];
export type EntityTagRecord = Database['entity_tags'];
export type AttachmentRecord = Database['attachments'];
export type PropertyDefinitionRecord = Database['property_definitions'];
