import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'employee' | 'tl' | 'manager';

export interface UserDoc {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  client_ids?: string[];
  created_at: Timestamp | string | Date;
}

export interface ClientGroup {
  id: string;
  name: string;
  created_at: Timestamp | string | Date;
  created_by: string;
}

export interface Client {
  id: string;
  name: string;
  group_id: string | null;
  status: 'active' | 'inactive';
  contact_info?: string;
  created_at: Timestamp | string | Date;
  created_by: string;
}

export interface SOP {
  id: string;
  client_id: string;
  title: string;
  content: string;
  order?: number | null;
  last_updated_by: string;
  last_updated_at: Timestamp | string | Date;
}

export type TaskFrequency = 'daily' | 'weekly' | 'monthly' | 'semi_monthly' | 'quarterly' | 'yearly';

export interface TaskTemplate {
  id: string;
  client_id: string;
  title: string;
  description?: string;
  frequency: TaskFrequency;
  anchor_date?: Timestamp | string | Date | null;
  anchor_day_1?: number | null;
  anchor_day_2?: number | null;
  assigned_to: string; // user ID
  active: boolean;
  created_by: string;
  created_at: Timestamp | string | Date;
}

export type TaskStatus = 'pending' | 'done' | 'skipped';

export interface Task {
  id: string;
  client_id: string;
  template_id: string | null;
  title: string;
  description?: string;
  assigned_to: string; // user ID
  due_date: Timestamp | string | Date;
  status: TaskStatus;
  created_by: string;
  created_at: Timestamp | string | Date;
  completed_at?: Timestamp | string | Date | null;
  completed_by?: string | null;
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  text: string;
  timestamp: Timestamp | string | Date;
}

