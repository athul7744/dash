import { column, Schema, Table } from '@powersync/web';

export const tasksTable = new Table({
  user_id: column.text,
  parent_id: column.text,
  title: column.text,
  due_date: column.text,
  tags: column.text, // stored as JSON array string
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
  created_at: column.text
});

export const dailyRatingsTable = new Table({
  user_id: column.text,
  rating_date: column.text,
  score: column.integer,
  created_at: column.text
});

export const pagesTable = new Table({
  user_id: column.text,
  title: column.text,
  properties: column.text, // stored as JSON string
  created_at: column.text,
  updated_at: column.text
});

export const blocksTable = new Table({
  user_id: column.text,
  page_id: column.text,
  parent_block_id: column.text,
  type: column.text,
  content: column.text, // stored as JSON string
  sort_rank: column.text,
  updated_at: column.text
});

export const edgesTable = new Table({
  source_block_id: column.text,
  target_id: column.text,
  user_id: column.text,
  type: column.text
});

export const attachmentsTable = new Table({
  user_id: column.text,
  page_id: column.text,
  block_id: column.text,
  file_path: column.text,
  sync_state: column.text
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
  pages: pagesTable,
  blocks: blocksTable,
  edges: edgesTable,
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
export type EdgeRecord = Database['edges'];
export type AttachmentRecord = Database['attachments'];
export type PropertyDefinitionRecord = Database['property_definitions'];
