import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  collection,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import {
  CheckSquare,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  User,
  Building,
  Calendar,
  Send,
  SlidersHorizontal,
  RefreshCw,
  Power,
  Layers,
  X,
} from 'lucide-react';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type {
  Task,
  TaskTemplate,
  TaskComment,
  Client,
  UserDoc,
  TaskFrequency,
} from '../types';
import {
  computeMissingDueDatesForTemplate,
  isTaskOverdue,
  toDate,
} from '../utils/recurrence';
import {
  shiftToFridayIfWeekend,
  isWeekend,
  parseInputDate,
  formatNoticeDate,
} from '../utils/dateHelpers';

function formatDisplayDate(val: any): string {
  const d = toDate(val);
  if (!d) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDisplayDateTime(val: any): string {
  const d = toDate(val);
  if (!d) return '—';
  return (
    d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }) +
    ' ' +
    d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })
  );
}

export const TasksPage: React.FC = () => {
  const { user, userDoc } = useAuth();
  const isPrivileged = userDoc?.role === 'tl' || userDoc?.role === 'manager';
  const isManager = userDoc?.role === 'manager';

  const location = useLocation();
  const navigate = useNavigate();
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  // Check for redirect message from route guards (e.g. TL accessing Users/Reports)
  useEffect(() => {
    if (location.state && (location.state as any).message) {
      setBannerMessage((location.state as any).message);
      // Clean up location state so refresh or back navigation doesn't replay the banner
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);

  // Data state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<UserDoc[]>([]);

  // Restrict task assignees strictly to users with role === 'employee' (never tl or manager)
  const employeeUsers = useMemo(() => {
    return users.filter((u) => u.role === 'employee');
  }, [users]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);

  // View filter: 'my' | 'all'
  // Employee defaults to 'my', tl/manager defaults to 'all'
  const [viewFilter, setViewFilter] = useState<'my' | 'all'>(() => {
    return userDoc?.role === 'employee' ? 'my' : 'all';
  });

  // Keep viewFilter synced if userDoc loads after mount
  useEffect(() => {
    if (userDoc?.role === 'employee') {
      setViewFilter('my');
    } else {
      setViewFilter('all');
    }
  }, [userDoc?.role]);

  // Collapsible comments state: { [taskId: string]: boolean }
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  // Comment text input state per task: { [taskId: string]: string }
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<Record<string, boolean>>({});

  // Add Template Modal
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateFormTitle, setTemplateFormTitle] = useState('');
  const [templateFormDescription, setTemplateFormDescription] = useState('');
  const [templateFormClientId, setTemplateFormClientId] = useState('');
  const [templateFormAssignee, setTemplateFormAssignee] = useState('');
  const [templateFormFrequency, setTemplateFormFrequency] = useState<TaskFrequency>('monthly');
  const [templateFormAnchorDate, setTemplateFormAnchorDate] = useState('');
  const [templateFormSemiDate1, setTemplateFormSemiDate1] = useState('');
  const [templateFormSemiDate2, setTemplateFormSemiDate2] = useState('');
  const [submittingTemplate, setSubmittingTemplate] = useState(false);
  const [templateModalError, setTemplateModalError] = useState<string | null>(null);

  // Edit Template Modal
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const [editTemplateTitle, setEditTemplateTitle] = useState('');
  const [editTemplateDescription, setEditTemplateDescription] = useState('');
  const [editTemplateAssignee, setEditTemplateAssignee] = useState('');
  const [editTemplateFrequency, setEditTemplateFrequency] = useState<TaskFrequency>('monthly');
  const [editTemplateAnchorDate, setEditTemplateAnchorDate] = useState('');
  const [editTemplateSemiDate1, setEditTemplateSemiDate1] = useState('');
  const [editTemplateSemiDate2, setEditTemplateSemiDate2] = useState('');
  const [editTemplateActive, setEditTemplateActive] = useState(true);
  const [submittingEditTemplate, setSubmittingEditTemplate] = useState(false);
  const [editTemplateError, setEditTemplateError] = useState<string | null>(null);

  // Add One-Off Task Modal
  const [isOneOffModalOpen, setIsOneOffModalOpen] = useState(false);
  const [oneOffTitle, setOneOffTitle] = useState('');
  const [oneOffDescription, setOneOffDescription] = useState('');
  const [oneOffClientId, setOneOffClientId] = useState('');
  const [oneOffAssignee, setOneOffAssignee] = useState('');
  const [oneOffDueDate, setOneOffDueDate] = useState('');
  const [submittingOneOff, setSubmittingOneOff] = useState(false);
  const [oneOffModalError, setOneOffModalError] = useState<string | null>(null);

  // Edit / Reassign Task Modal (tl/manager)
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskDescription, setEditTaskDescription] = useState('');
  const [editTaskAssignee, setEditTaskAssignee] = useState('');
  const [editTaskDueDate, setEditTaskDueDate] = useState('');
  const [submittingEditTask, setSubmittingEditTask] = useState(false);
  const [editTaskError, setEditTaskError] = useState<string | null>(null);

  // Delete Task Instance Confirmation Dialog (tl/manager)
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [isDeletingTask, setIsDeletingTask] = useState(false);

  const deleteDialogTitle = useMemo(() => {
    if (!taskToDelete) return 'Delete Task';
    return taskToDelete.template_id ? 'Remove Task Occurrence' : 'Delete Task';
  }, [taskToDelete]);

  const deleteDialogMessage = useMemo(() => {
    if (!taskToDelete) return '';
    if (taskToDelete.template_id) {
      return `This will permanently remove this specific occurrence (due ${formatDisplayDate(taskToDelete.due_date)}). Other cycles of this recurring task are not affected and will continue as scheduled.`;
    }
    return 'Are you sure you want to delete this task? This action cannot be undone.';
  }, [taskToDelete]);

  // Real-time weekend shift notices for modals
  const templateFormAnchorWeekendNotice = useMemo(() => {
    if (!templateFormAnchorDate) return null;
    const parsed = parseInputDate(templateFormAnchorDate);
    if (!parsed || !isWeekend(parsed)) return null;
    const shifted = shiftToFridayIfWeekend(parsed);
    return `Note: ${formatNoticeDate(parsed)} is a weekend — due date has been set to ${formatNoticeDate(shifted)} instead.`;
  }, [templateFormAnchorDate]);

  const templateFormSemi1WeekendNotice = useMemo(() => {
    if (!templateFormSemiDate1) return null;
    const parsed = parseInputDate(templateFormSemiDate1);
    if (!parsed || !isWeekend(parsed)) return null;
    const shifted = shiftToFridayIfWeekend(parsed);
    return `Note: ${formatNoticeDate(parsed)} is a weekend — due date has been set to ${formatNoticeDate(shifted)} instead.`;
  }, [templateFormSemiDate1]);

  const templateFormSemi2WeekendNotice = useMemo(() => {
    if (!templateFormSemiDate2) return null;
    const parsed = parseInputDate(templateFormSemiDate2);
    if (!parsed || !isWeekend(parsed)) return null;
    const shifted = shiftToFridayIfWeekend(parsed);
    return `Note: ${formatNoticeDate(parsed)} is a weekend — due date has been set to ${formatNoticeDate(shifted)} instead.`;
  }, [templateFormSemiDate2]);

  const editTemplateAnchorWeekendNotice = useMemo(() => {
    if (!editTemplateAnchorDate) return null;
    const parsed = parseInputDate(editTemplateAnchorDate);
    if (!parsed || !isWeekend(parsed)) return null;
    const shifted = shiftToFridayIfWeekend(parsed);
    return `Note: ${formatNoticeDate(parsed)} is a weekend — due date has been set to ${formatNoticeDate(shifted)} instead.`;
  }, [editTemplateAnchorDate]);

  const editTemplateSemi1WeekendNotice = useMemo(() => {
    if (!editTemplateSemiDate1) return null;
    const parsed = parseInputDate(editTemplateSemiDate1);
    if (!parsed || !isWeekend(parsed)) return null;
    const shifted = shiftToFridayIfWeekend(parsed);
    return `Note: ${formatNoticeDate(parsed)} is a weekend — due date has been set to ${formatNoticeDate(shifted)} instead.`;
  }, [editTemplateSemiDate1]);

  const editTemplateSemi2WeekendNotice = useMemo(() => {
    if (!editTemplateSemiDate2) return null;
    const parsed = parseInputDate(editTemplateSemiDate2);
    if (!parsed || !isWeekend(parsed)) return null;
    const shifted = shiftToFridayIfWeekend(parsed);
    return `Note: ${formatNoticeDate(parsed)} is a weekend — due date has been set to ${formatNoticeDate(shifted)} instead.`;
  }, [editTemplateSemiDate2]);

  const oneOffWeekendNotice = useMemo(() => {
    if (!oneOffDueDate) return null;
    const parsed = parseInputDate(oneOffDueDate);
    if (!parsed || !isWeekend(parsed)) return null;
    const shifted = shiftToFridayIfWeekend(parsed);
    return `Note: ${formatNoticeDate(parsed)} is a weekend — due date has been set to ${formatNoticeDate(shifted)} instead.`;
  }, [oneOffDueDate]);

  const editTaskWeekendNotice = useMemo(() => {
    if (!editTaskDueDate) return null;
    const parsed = parseInputDate(editTaskDueDate);
    if (!parsed || !isWeekend(parsed)) return null;
    const shifted = shiftToFridayIfWeekend(parsed);
    return `Note: ${formatNoticeDate(parsed)} is a weekend — due date has been set to ${formatNoticeDate(shifted)} instead.`;
  }, [editTaskDueDate]);

  // Guard to prevent double execution of client-side recurrence check in same render cycle
  const hasTriggeredRecurrenceRef = useRef(false);

  // 1. Fetch Real-time data
  useEffect(() => {
    // Tasks
    const unsubTasks = onSnapshot(collection(db, 'tasks'), (snapshot) => {
      const list: Task[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          client_id: data.client_id || '',
          template_id: data.template_id || null,
          title: data.title || '',
          description: data.description || '',
          assigned_to: data.assigned_to || '',
          due_date: data.due_date,
          status: data.status || 'pending',
          created_by: data.created_by || '',
          created_at: data.created_at,
          completed_at: data.completed_at || null,
          completed_by: data.completed_by || null,
        };
      });
      setTasks(list);
      setLoading(false);
    });

    // Task Templates
    const unsubTemplates = onSnapshot(collection(db, 'task_templates'), (snapshot) => {
      const list: TaskTemplate[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          client_id: data.client_id || '',
          title: data.title || '',
          description: data.description || '',
          frequency: data.frequency || 'monthly',
          anchor_date: data.anchor_date || null,
          anchor_day_1: data.anchor_day_1 !== undefined ? data.anchor_day_1 : null,
          anchor_day_2: data.anchor_day_2 !== undefined ? data.anchor_day_2 : null,
          assigned_to: data.assigned_to || '',
          active: data.active !== undefined ? Boolean(data.active) : true,
          created_by: data.created_by || '',
          created_at: data.created_at,
        };
      });
      setTemplates(list);
    });

    // Clients (to resolve client names)
    const unsubClients = onSnapshot(collection(db, 'clients'), (snapshot) => {
      const list: Client[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name || '',
          group_id: data.group_id || null,
          status: data.status || 'active',
          contact_info: data.contact_info || '',
          created_at: data.created_at,
          created_by: data.created_by || '',
        };
      });
      setClients(list);
    });

    // Users (to resolve employee/assignee names)
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const list: UserDoc[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name || '',
          email: data.email || '',
          role: data.role || 'employee',
          client_ids: data.client_ids || [],
          created_at: data.created_at,
        };
      });
      setUsers(list);
    });

    // Task Comments
    const unsubComments = onSnapshot(collection(db, 'task_comments'), (snapshot) => {
      const list: TaskComment[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          task_id: data.task_id || '',
          user_id: data.user_id || '',
          text: data.text || '',
          timestamp: data.timestamp,
        };
      });
      setComments(list);
    });

    return () => {
      unsubTasks();
      unsubTemplates();
      unsubClients();
      unsubUsers();
      unsubComments();
    };
  }, []);

  // 2. Client-side Recurrence Generation Logic
  // Runs on Tasks page mount and checks active templates.
  // Generates due task instances based on anchor dates without skipping missed cycles,
  // leaving unresolved/overdue tasks from previous cycles completely intact!
  useEffect(() => {
    if (hasTriggeredRecurrenceRef.current) return;
    hasTriggeredRecurrenceRef.current = true;

    const checkAndGenerateRecurrence = async () => {
      try {
        // Query active templates
        const templatesQuery = query(
          collection(db, 'task_templates'),
          where('active', '==', true)
        );
        const templatesSnap = await getDocs(templatesQuery);
        if (templatesSnap.empty) return;

        // Query existing tasks
        const tasksSnap = await getDocs(collection(db, 'tasks'));
        const existingTasks: Task[] = tasksSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            client_id: data.client_id,
            template_id: data.template_id || null,
            title: data.title || '',
            description: data.description || '',
            assigned_to: data.assigned_to || '',
            due_date: data.due_date,
            status: data.status || 'pending',
            created_by: data.created_by || '',
            created_at: data.created_at,
            completed_at: data.completed_at || null,
            completed_by: data.completed_by || null,
          };
        });

        const now = new Date();

        for (const docSnap of templatesSnap.docs) {
          const templateData = docSnap.data();
          const template: TaskTemplate = {
            id: docSnap.id,
            client_id: templateData.client_id || '',
            title: templateData.title || '',
            description: templateData.description || '',
            frequency: (templateData.frequency || 'monthly') as TaskFrequency,
            anchor_date: templateData.anchor_date || null,
            anchor_day_1: templateData.anchor_day_1 !== undefined ? templateData.anchor_day_1 : null,
            anchor_day_2: templateData.anchor_day_2 !== undefined ? templateData.anchor_day_2 : null,
            assigned_to: templateData.assigned_to || '',
            active: Boolean(templateData.active),
            created_by: templateData.created_by || '',
            created_at: templateData.created_at,
          };

          const missingDueDates = computeMissingDueDatesForTemplate(template, existingTasks, now);

          for (const finalDueDate of missingDueDates) {
            const newTaskRef = await addDoc(collection(db, 'tasks'), {
              client_id: template.client_id,
              template_id: template.id,
              title: template.title,
              description: template.description || '',
              assigned_to: template.assigned_to,
              due_date: Timestamp.fromDate(finalDueDate),
              status: 'pending',
              created_by: 'system-recurrence',
              created_at: serverTimestamp(),
              completed_at: null,
              completed_by: null,
            });

            existingTasks.push({
              id: newTaskRef.id,
              client_id: template.client_id,
              template_id: template.id,
              title: template.title,
              description: template.description || '',
              assigned_to: template.assigned_to,
              due_date: Timestamp.fromDate(finalDueDate),
              status: 'pending',
              created_by: 'system-recurrence',
              created_at: new Date(),
            });
          }
        }
      } catch (err) {
        console.error('Error running client-side recurrence check:', err);
      }
    };

    checkAndGenerateRecurrence();
  }, []);

  // Lookups
  const clientsMap = useMemo(() => {
    const map: Record<string, Client> = {};
    clients.forEach((c) => {
      map[c.id] = c;
    });
    return map;
  }, [clients]);

  const usersMap = useMemo(() => {
    const map: Record<string, UserDoc> = {};
    users.forEach((u) => {
      map[u.id] = u;
    });
    return map;
  }, [users]);

  // Comments mapped by task_id, sorted by timestamp ascending
  const commentsByTaskId = useMemo(() => {
    const map: Record<string, TaskComment[]> = {};
    comments.forEach((c) => {
      if (!map[c.task_id]) {
        map[c.task_id] = [];
      }
      map[c.task_id].push(c);
    });

    Object.keys(map).forEach((taskId) => {
      map[taskId].sort((a, b) => {
        const timeA = toDate(a.timestamp)?.getTime() || 0;
        const timeB = toDate(b.timestamp)?.getTime() || 0;
        return timeA - timeB;
      });
    });

    return map;
  }, [comments]);

  // Filter tasks according to viewFilter ("my" vs "all")
  // Tasks with status "skipped" must be excluded from all default task list views (My Tasks, All Tasks,
  // both recurring-grouped and one-off sections) — treat them as if they don't exist for display purposes,
  // on both employee and tl/manager views.
  const filteredTasks = useMemo(() => {
    const unskippedTasks = tasks.filter((t) => t.status !== 'skipped');
    if (viewFilter === 'my') {
      return unskippedTasks.filter((t) => t.assigned_to === user?.uid);
    }
    return unskippedTasks;
  }, [tasks, viewFilter, user?.uid]);

  // Group recurring tasks by template_id
  const templateGroups = useMemo(() => {
    // Map template_id -> tasks
    const map: Record<string, Task[]> = {};
    filteredTasks.forEach((t) => {
      if (t.template_id) {
        if (!map[t.template_id]) {
          map[t.template_id] = [];
        }
        map[t.template_id].push(t);
      }
    });

    // Create group objects, matching with template definition if available
    const templateDict: Record<string, TaskTemplate> = {};
    templates.forEach((tpl) => {
      templateDict[tpl.id] = tpl;
    });

    const groupsList: {
      template: TaskTemplate | null;
      templateId: string;
      title: string;
      tasks: Task[];
      openCount: number;
      overdueCount: number;
    }[] = [];

    // All template IDs present in filtered tasks
    const templateIdsWithTasks = Object.keys(map);

    // If viewing 'all', also show active templates that currently have 0 tasks if any
    const allTemplateIds =
      viewFilter === 'all'
        ? Array.from(new Set([...templates.map((t) => t.id), ...templateIdsWithTasks]))
        : templateIdsWithTasks;

    allTemplateIds.forEach((tplId) => {
      const tpl = templateDict[tplId] || null;
      const groupTasks = map[tplId] || [];

      // Sort tasks inside group by due_date ascending
      groupTasks.sort((a, b) => {
        const timeA = toDate(a.due_date)?.getTime() || 0;
        const timeB = toDate(b.due_date)?.getTime() || 0;
        return timeA - timeB;
      });

      const openCount = groupTasks.filter((t) => t.status === 'pending').length;
      const overdueCount = groupTasks.filter((t) => isTaskOverdue(t)).length;

      // Only skip empty template group if viewing 'my'
      if (groupTasks.length > 0 || (viewFilter === 'all' && tpl && tpl.active)) {
        groupsList.push({
          template: tpl,
          templateId: tplId,
          title: tpl?.title || groupTasks[0]?.title || 'Recurring Template',
          tasks: groupTasks,
          openCount,
          overdueCount,
        });
      }
    });

    // Sort groups alphabetically by title
    groupsList.sort((a, b) => a.title.localeCompare(b.title));

    return groupsList;
  }, [filteredTasks, templates, viewFilter]);

  // One-off tasks (template_id == null), sorted by due_date ascending
  const oneOffTasks = useMemo(() => {
    const list = filteredTasks.filter((t) => !t.template_id);
    list.sort((a, b) => {
      const timeA = toDate(a.due_date)?.getTime() || 0;
      const timeB = toDate(b.due_date)?.getTime() || 0;
      return timeA - timeB;
    });
    return list;
  }, [filteredTasks]);

  // Total counts for header stats
  const totalOpenCount = useMemo(() => {
    return filteredTasks.filter((t) => t.status === 'pending').length;
  }, [filteredTasks]);

  const totalOverdueCount = useMemo(() => {
    return filteredTasks.filter((t) => isTaskOverdue(t)).length;
  }, [filteredTasks]);

  // Task Actions
  const handleMarkComplete = async (task: Task) => {
    // Only allowed for the assigned user
    if (task.assigned_to !== user?.uid || task.status !== 'pending') return;

    try {
      const taskRef = doc(db, 'tasks', task.id);
      await updateDoc(taskRef, {
        status: 'done',
        completed_at: serverTimestamp(),
        completed_by: user.uid,
      });
    } catch (err) {
      console.error('Failed to mark task complete:', err);
    }
  };

  const toggleComments = (taskId: string) => {
    setExpandedComments((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
  };

  const handleAddComment = async (taskId: string) => {
    const text = (commentInputs[taskId] || '').trim();
    if (!text || !user) return;

    setSubmittingComment((prev) => ({ ...prev, [taskId]: true }));
    try {
      await addDoc(collection(db, 'task_comments'), {
        task_id: taskId,
        user_id: user.uid,
        text,
        timestamp: serverTimestamp(),
      });
      // Clear input
      setCommentInputs((prev) => ({ ...prev, [taskId]: '' }));
    } catch (err) {
      console.error('Failed to add comment:', err);
    } finally {
      setSubmittingComment((prev) => ({ ...prev, [taskId]: false }));
    }
  };

  // Open Add Template with default dates
  const handleOpenAddTemplate = () => {
    setTemplateModalError(null);
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    setTemplateFormAnchorDate(`${y}-${m}-${d}`);
    setTemplateFormSemiDate1(`${y}-${m}-01`);
    setTemplateFormSemiDate2(`${y}-${m}-15`);
    setIsTemplateModalOpen(true);
  };

  // Create Template Submit
  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateFormTitle.trim() || !templateFormClientId || !templateFormAssignee) {
      setTemplateModalError('Please fill out all required fields.');
      return;
    }

    if (templateFormFrequency === 'semi_monthly') {
      if (!templateFormSemiDate1 || !templateFormSemiDate2) {
        setTemplateModalError('Please select both occurrence dates for semi-monthly frequency.');
        return;
      }
    } else {
      if (!templateFormAnchorDate) {
        setTemplateModalError('Please select the first due date.');
        return;
      }
    }

    setSubmittingTemplate(true);
    setTemplateModalError(null);

    try {
      const templatePayload: any = {
        client_id: templateFormClientId,
        title: templateFormTitle.trim(),
        description: templateFormDescription.trim(),
        frequency: templateFormFrequency,
        assigned_to: templateFormAssignee,
        active: true,
        created_by: user?.uid || '',
        created_at: serverTimestamp(),
      };

      if (templateFormFrequency === 'semi_monthly') {
        const p1 = parseInputDate(templateFormSemiDate1);
        const p2 = parseInputDate(templateFormSemiDate2);
        if (!p1 || !p2) {
          setTemplateModalError('Invalid date format for occurrence(s).');
          setSubmittingTemplate(false);
          return;
        }
        const s1 = shiftToFridayIfWeekend(p1);
        const s2 = shiftToFridayIfWeekend(p2);
        templatePayload.anchor_day_1 = s1.getDate();
        templatePayload.anchor_day_2 = s2.getDate();
      } else {
        const p = parseInputDate(templateFormAnchorDate);
        if (!p) {
          setTemplateModalError('Invalid date format for first due date.');
          setSubmittingTemplate(false);
          return;
        }
        const s = shiftToFridayIfWeekend(p);
        templatePayload.anchor_date = Timestamp.fromDate(s);
      }

      const newDocRef = await addDoc(collection(db, 'task_templates'), templatePayload);

      // Immediately generate any tasks for this template that are due today or earlier
      const createdTemplate: TaskTemplate = {
        id: newDocRef.id,
        ...templatePayload,
      };
      const missingDates = computeMissingDueDatesForTemplate(createdTemplate, tasks, new Date());
      for (const d of missingDates) {
        await addDoc(collection(db, 'tasks'), {
          client_id: createdTemplate.client_id,
          template_id: createdTemplate.id,
          title: createdTemplate.title,
          description: createdTemplate.description || '',
          assigned_to: createdTemplate.assigned_to,
          due_date: Timestamp.fromDate(d),
          status: 'pending',
          created_by: 'system-recurrence',
          created_at: serverTimestamp(),
          completed_at: null,
          completed_by: null,
        });
      }

      // Reset & Close
      setIsTemplateModalOpen(false);
      setTemplateFormTitle('');
      setTemplateFormDescription('');
      setTemplateFormClientId('');
      setTemplateFormAssignee('');
      setTemplateFormFrequency('monthly');
      setTemplateFormAnchorDate('');
      setTemplateFormSemiDate1('');
      setTemplateFormSemiDate2('');
    } catch (err: any) {
      console.error('Error creating template:', err);
      setTemplateModalError(err.message || 'Failed to create template.');
    } finally {
      setSubmittingTemplate(false);
    }
  };

  // Edit Template Submit
  const handleOpenEditTemplate = (tpl: TaskTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTemplate(tpl);
    setEditTemplateTitle(tpl.title);
    setEditTemplateDescription(tpl.description || '');
    setEditTemplateAssignee(tpl.assigned_to);
    setEditTemplateFrequency(tpl.frequency);
    setEditTemplateActive(tpl.active);
    setEditTemplateError(null);

    const now = new Date();
    const curY = now.getFullYear();
    const curM = String(now.getMonth() + 1).padStart(2, '0');

    if (tpl.frequency === 'semi_monthly') {
      const d1 = tpl.anchor_day_1 ? String(tpl.anchor_day_1).padStart(2, '0') : '01';
      const d2 = tpl.anchor_day_2 ? String(tpl.anchor_day_2).padStart(2, '0') : '15';
      setEditTemplateSemiDate1(`${curY}-${curM}-${d1}`);
      setEditTemplateSemiDate2(`${curY}-${curM}-${d2}`);
      setEditTemplateAnchorDate('');
    } else {
      const aDate = toDate(tpl.anchor_date);
      if (aDate) {
        const y = aDate.getFullYear();
        const m = String(aDate.getMonth() + 1).padStart(2, '0');
        const d = String(aDate.getDate()).padStart(2, '0');
        setEditTemplateAnchorDate(`${y}-${m}-${d}`);
      } else {
        const d = String(now.getDate()).padStart(2, '0');
        setEditTemplateAnchorDate(`${curY}-${curM}-${d}`);
      }
      setEditTemplateSemiDate1('');
      setEditTemplateSemiDate2('');
    }
  };

  const handleUpdateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate || !editTemplateTitle.trim() || !editTemplateAssignee) {
      setEditTemplateError('Please fill out required fields.');
      return;
    }

    if (editTemplateFrequency === 'semi_monthly') {
      if (!editTemplateSemiDate1 || !editTemplateSemiDate2) {
        setEditTemplateError('Please select both occurrence dates for semi-monthly frequency.');
        return;
      }
    } else {
      if (!editTemplateAnchorDate) {
        setEditTemplateError('Please select the first due date.');
        return;
      }
    }

    setSubmittingEditTemplate(true);
    setEditTemplateError(null);

    try {
      const tplRef = doc(db, 'task_templates', editingTemplate.id);
      const updatePayload: any = {
        title: editTemplateTitle.trim(),
        description: editTemplateDescription.trim(),
        assigned_to: editTemplateAssignee,
        frequency: editTemplateFrequency,
        active: editTemplateActive,
      };

      if (editTemplateFrequency === 'semi_monthly') {
        const p1 = parseInputDate(editTemplateSemiDate1);
        const p2 = parseInputDate(editTemplateSemiDate2);
        if (!p1 || !p2) {
          setEditTemplateError('Invalid date format for occurrence(s).');
          setSubmittingEditTemplate(false);
          return;
        }
        const s1 = shiftToFridayIfWeekend(p1);
        const s2 = shiftToFridayIfWeekend(p2);
        updatePayload.anchor_day_1 = s1.getDate();
        updatePayload.anchor_day_2 = s2.getDate();
        updatePayload.anchor_date = null;
      } else {
        const p = parseInputDate(editTemplateAnchorDate);
        if (!p) {
          setEditTemplateError('Invalid date format for first due date.');
          setSubmittingEditTemplate(false);
          return;
        }
        const s = shiftToFridayIfWeekend(p);
        updatePayload.anchor_date = Timestamp.fromDate(s);
        updatePayload.anchor_day_1 = null;
        updatePayload.anchor_day_2 = null;
      }

      await updateDoc(tplRef, updatePayload);

      // If template is active, check and generate any newly due tasks
      if (editTemplateActive) {
        const updatedTemplate: TaskTemplate = {
          ...editingTemplate,
          ...updatePayload,
        };
        const missingDates = computeMissingDueDatesForTemplate(updatedTemplate, tasks, new Date());
        for (const d of missingDates) {
          await addDoc(collection(db, 'tasks'), {
            client_id: updatedTemplate.client_id,
            template_id: updatedTemplate.id,
            title: updatedTemplate.title,
            description: updatedTemplate.description || '',
            assigned_to: updatedTemplate.assigned_to,
            due_date: Timestamp.fromDate(d),
            status: 'pending',
            created_by: 'system-recurrence',
            created_at: serverTimestamp(),
            completed_at: null,
            completed_by: null,
          });
        }
      }

      setEditingTemplate(null);
    } catch (err: any) {
      console.error('Error updating template:', err);
      setEditTemplateError(err.message || 'Failed to update template.');
    } finally {
      setSubmittingEditTemplate(false);
    }
  };

  const handleDeactivateTemplate = async (tpl: TaskTemplate) => {
    try {
      const tplRef = doc(db, 'task_templates', tpl.id);
      await updateDoc(tplRef, {
        active: false,
      });
      if (editingTemplate?.id === tpl.id) {
        setEditingTemplate(null);
      }
    } catch (err) {
      console.error('Failed to deactivate template:', err);
    }
  };

  // Create One-Off Task Submit
  const handleCreateOneOff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oneOffTitle.trim() || !oneOffClientId || !oneOffAssignee || !oneOffDueDate) {
      setOneOffModalError('Please fill out all required fields.');
      return;
    }

    setSubmittingOneOff(true);
    setOneOffModalError(null);

    try {
      const parsedDate = parseInputDate(oneOffDueDate);
      if (!parsedDate || isNaN(parsedDate.getTime())) {
        setOneOffModalError('Please enter a valid due date.');
        setSubmittingOneOff(false);
        return;
      }

      // If manager-selected due_date falls on Saturday or Sunday, shift to Friday; otherwise unchanged
      const correctedDueDate = shiftToFridayIfWeekend(parsedDate);

      await addDoc(collection(db, 'tasks'), {
        client_id: oneOffClientId,
        template_id: null,
        title: oneOffTitle.trim(),
        description: oneOffDescription.trim(),
        assigned_to: oneOffAssignee,
        due_date: Timestamp.fromDate(correctedDueDate),
        status: 'pending',
        created_by: user?.uid || '',
        created_at: serverTimestamp(),
        completed_at: null,
        completed_by: null,
      });

      // Reset & Close
      setIsOneOffModalOpen(false);
      setOneOffTitle('');
      setOneOffDescription('');
      setOneOffClientId('');
      setOneOffAssignee('');
      setOneOffDueDate('');
    } catch (err: any) {
      console.error('Error creating one-off task:', err);
      setOneOffModalError(err.message || 'Failed to create task.');
    } finally {
      setSubmittingOneOff(false);
    }
  };

  // Edit / Reassign Task Submit (tl/manager)
  const handleOpenEditTask = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTask(task);
    setEditTaskTitle(task.title);
    setEditTaskDescription(task.description || '');
    setEditTaskAssignee(task.assigned_to);
    const d = toDate(task.due_date);
    if (d) {
      // Format as YYYY-MM-DDThh:mm for datetime-local
      const pad = (n: number) => (n < 10 ? '0' + n : String(n));
      const val = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      setEditTaskDueDate(val);
    } else {
      setEditTaskDueDate('');
    }
    setEditTaskError(null);
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editTaskTitle.trim() || !editTaskAssignee || !editTaskDueDate) {
      setEditTaskError('Please fill out all required fields.');
      return;
    }

    setSubmittingEditTask(true);
    setEditTaskError(null);

    try {
      const parsedDate = parseInputDate(editTaskDueDate);
      if (!parsedDate || isNaN(parsedDate.getTime())) {
        setEditTaskError('Invalid date format.');
        setSubmittingEditTask(false);
        return;
      }

      // If manager-selected due_date falls on Saturday or Sunday, shift to Friday; otherwise unchanged
      const correctedDueDate = shiftToFridayIfWeekend(parsedDate);

      const taskRef = doc(db, 'tasks', editingTask.id);
      await updateDoc(taskRef, {
        title: editTaskTitle.trim(),
        description: editTaskDescription.trim(),
        assigned_to: editTaskAssignee,
        due_date: Timestamp.fromDate(correctedDueDate),
      });

      setEditingTask(null);
    } catch (err: any) {
      console.error('Failed to update task:', err);
      setEditTaskError(err.message || 'Failed to update task.');
    } finally {
      setSubmittingEditTask(false);
    }
  };

  // Delete Task Instance (tl/manager)
  const handleOpenDeleteTask = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    setTaskToDelete(task);
  };

  const handleConfirmDeleteTask = async () => {
    if (!taskToDelete) return;
    setIsDeletingTask(true);
    try {
      if (taskToDelete.template_id) {
        // CASE 2 — Recurring task instance (template_id is not null):
        // Do NOT hard-delete the document. Instead, on delete confirmation, update the document:
        // set status to "skipped" (a new allowed value alongside "pending"/"done"), leave completed_at and completed_by as null.
        // Reasoning to preserve in code comments: the recurrence generator checks "does a task document already exist for this template_id + due_date"
        // before creating a new instance for that cycle — if the document still exists (even with status "skipped"),
        // the generator will correctly skip recreating it. If it were hard-deleted instead, the next page load would regenerate
        // that exact cycle again, which defeats the purpose of deleting it.
        const taskRef = doc(db, 'tasks', taskToDelete.id);
        await updateDoc(taskRef, {
          status: 'skipped',
        });
      } else {
        // CASE 1 — One-off task (template_id is null):
        // On delete confirmation (reuse the existing ConfirmDialog component), perform an actual Firestore deleteDoc() on this tasks document. Standard hard delete, no side effects.
        const taskRef = doc(db, 'tasks', taskToDelete.id);
        await deleteDoc(taskRef);
      }
      setTaskToDelete(null);
    } catch (err) {
      console.error('Failed to delete task:', err);
    } finally {
      setIsDeletingTask(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Route Guard Redirect Alert Banner */}
      {bannerMessage && (
        <div className="flex items-center justify-between gap-3 p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-sm shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <span className="font-medium">{bannerMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="p-1 rounded-lg text-amber-700 hover:bg-amber-100 hover:text-amber-900 transition-colors cursor-pointer"
            title="Dismiss message"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
              Tasks
            </h1>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-200 text-neutral-800">
                {totalOpenCount} open
              </span>
              {totalOverdueCount > 0 && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                  {totalOverdueCount} overdue
                </span>
              )}
            </div>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Track recurring client responsibilities, deadlines, and one-off workflows.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Filter Toggle (My Tasks vs All Tasks) */}
          <div className="inline-flex rounded-lg bg-neutral-200 p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setViewFilter('my')}
              className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                viewFilter === 'my'
                  ? 'bg-white text-neutral-900 shadow-xs font-semibold'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              My Tasks
            </button>
            <button
              type="button"
              onClick={() => setViewFilter('all')}
              className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                viewFilter === 'all'
                  ? 'bg-white text-neutral-900 shadow-xs font-semibold'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              All Tasks
            </button>
          </div>

          {/* tl/manager management buttons */}
          {isPrivileged && (
            <>
              <button
                type="button"
                onClick={() => {
                  setOneOffModalError(null);
                  setIsOneOffModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add One-Off Task</span>
              </button>

              <button
                type="button"
                onClick={handleOpenAddTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 rounded-lg transition-opacity shadow-xs cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Add Task Template</span>
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-7 h-7 border-2 border-neutral-300 border-t-neutral-900 rounded-full animate-spin" />
          <span className="text-xs font-medium text-neutral-500">Loading tasks...</span>
        </div>
      ) : filteredTasks.length === 0 && templateGroups.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center shadow-xs">
          <CheckSquare className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-neutral-800">
            {viewFilter === 'my' ? 'No tasks assigned to you' : 'No tasks found'}
          </h3>
          <p className="text-sm text-neutral-500 mt-1 max-w-sm mx-auto">
            {viewFilter === 'my'
              ? 'You have completed all your tasks or no tasks are currently assigned to your account.'
              : 'Add recurring templates or one-off tasks to start tracking team workflows.'}
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {/* SECTION 1: Recurring Tasks (Grouped by Template) */}
          <div className="space-y-6">
            <div className="border-b border-neutral-200 pb-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-neutral-400" />
                <span>Recurring Tasks (by Template)</span>
              </h2>
            </div>

            {templateGroups.length === 0 ? (
              <p className="text-xs text-neutral-400 italic py-2">
                No recurring tasks found for this view filter.
              </p>
            ) : (
              <div className="space-y-6">
                {templateGroups.map((group) => {
                  const tpl = group.template;

                  return (
                    <div
                      key={group.templateId}
                      className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs"
                    >
                      {/* Template Header */}
                      <div className="bg-neutral-50/80 px-4 py-3 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <h3 className="text-sm font-bold text-neutral-900 truncate">
                            {group.title}
                          </h3>

                          {/* Open / Overdue badge indicator e.g. "Monthly Bank Rec (2 overdue)" */}
                          {group.openCount > 1 && (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                                group.overdueCount > 0
                                  ? 'bg-red-100 text-red-700 border border-red-200'
                                  : 'bg-neutral-200 text-neutral-800'
                              }`}
                            >
                              {group.overdueCount > 0
                                ? `${group.overdueCount} overdue`
                                : `${group.openCount} open`}
                            </span>
                          )}

                          {/* Frequency Badge */}
                          {tpl && (
                            <span className="capitalize inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 text-neutral-600 border border-neutral-200">
                              {tpl.frequency === 'semi_monthly' ? 'Semi-Monthly' : tpl.frequency}
                            </span>
                          )}

                          {tpl && !tpl.active && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              Inactive
                            </span>
                          )}
                        </div>

                        {/* Template metadata & privileged management */}
                        <div className="flex items-center gap-3 text-xs text-neutral-500">
                          {tpl && (
                            <div className="hidden sm:flex items-center gap-3">
                              <span className="flex items-center gap-1 truncate max-w-[140px]" title={clientsMap[tpl.client_id]?.name}>
                                <Building className="w-3.5 h-3.5 text-neutral-400" />
                                <span className="truncate">{clientsMap[tpl.client_id]?.name || 'Client'}</span>
                              </span>
                              <span className="flex items-center gap-1 truncate max-w-[140px]" title={usersMap[tpl.assigned_to]?.name}>
                                <User className="w-3.5 h-3.5 text-neutral-400" />
                                <span className="truncate">{usersMap[tpl.assigned_to]?.name || 'Assignee'}</span>
                              </span>
                            </div>
                          )}

                          {isPrivileged && tpl && (
                            <button
                              type="button"
                              onClick={(e) => handleOpenEditTemplate(tpl, e)}
                              title="Edit Template"
                              className="p-1 text-neutral-400 hover:text-neutral-800 rounded-md hover:bg-neutral-200/60 transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Template Description if any */}
                      {tpl?.description && (
                        <div className="px-4 py-2 text-xs text-neutral-500 bg-neutral-50/30 border-b border-neutral-100">
                          {tpl.description}
                        </div>
                      )}

                      {/* Group's Task Instances List */}
                      {group.tasks.length === 0 ? (
                        <div className="p-4 text-xs text-neutral-400 italic text-center">
                          No tasks currently matching your filter for this template.
                        </div>
                      ) : (
                        <div className="divide-y divide-neutral-100">
                          {group.tasks.map((task) => (
                            <TaskRowItem
                              key={task.id}
                              task={task}
                              currentUserId={user?.uid || ''}
                              isPrivileged={isPrivileged}
                              clientName={clientsMap[task.client_id]?.name || 'Unknown Client'}
                              assignedName={usersMap[task.assigned_to]?.name || 'Unassigned'}
                              comments={commentsByTaskId[task.id] || []}
                              isCommentsOpen={!!expandedComments[task.id]}
                              commentInput={commentInputs[task.id] || ''}
                              submittingComment={!!submittingComment[task.id]}
                              usersMap={usersMap}
                              onToggleComments={() => toggleComments(task.id)}
                              onCommentInputChange={(val) =>
                                setCommentInputs((prev) => ({ ...prev, [task.id]: val }))
                              }
                              onAddComment={() => handleAddComment(task.id)}
                              onMarkComplete={() => handleMarkComplete(task)}
                              onEditTask={(e) => handleOpenEditTask(task, e)}
                              onDeleteTask={(e) => handleOpenDeleteTask(task, e)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION 2: One-Off Tasks (template_id == null) */}
          <div className="space-y-4">
            <div className="border-b border-neutral-200 pb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-neutral-400" />
                <span>One-Off Tasks</span>
                <span className="text-xs font-normal text-neutral-400 lowercase">
                  ({oneOffTasks.length})
                </span>
              </h2>
            </div>

            {oneOffTasks.length === 0 ? (
              <div className="bg-white border border-dashed border-neutral-200 rounded-xl p-6 text-center text-xs text-neutral-400">
                No one-off tasks found.
              </div>
            ) : (
              <div className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100 overflow-hidden shadow-xs">
                {oneOffTasks.map((task) => (
                  <TaskRowItem
                    key={task.id}
                    task={task}
                    currentUserId={user?.uid || ''}
                    isPrivileged={isPrivileged}
                    clientName={clientsMap[task.client_id]?.name || 'Unknown Client'}
                    assignedName={usersMap[task.assigned_to]?.name || 'Unassigned'}
                    comments={commentsByTaskId[task.id] || []}
                    isCommentsOpen={!!expandedComments[task.id]}
                    commentInput={commentInputs[task.id] || ''}
                    submittingComment={!!submittingComment[task.id]}
                    usersMap={usersMap}
                    onToggleComments={() => toggleComments(task.id)}
                    onCommentInputChange={(val) =>
                      setCommentInputs((prev) => ({ ...prev, [task.id]: val }))
                    }
                    onAddComment={() => handleAddComment(task.id)}
                    onMarkComplete={() => handleMarkComplete(task)}
                    onEditTask={(e) => handleOpenEditTask(task, e)}
                    onDeleteTask={(e) => handleOpenDeleteTask(task, e)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= MODALS ================= */}

      {/* 1. Add Task Template Modal */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-neutral-200">
            <h3 className="text-lg font-bold text-neutral-900 mb-1">
              Add Task Template
            </h3>
            <p className="text-xs text-neutral-500 mb-5">
              Create a recurring schedule that automatically generates pending tasks for each cycle.
            </p>

            {templateModalError && (
              <div className="p-3 mb-4 rounded-lg bg-red-50 text-red-700 text-xs font-medium border border-red-200">
                {templateModalError}
              </div>
            )}

            <form onSubmit={handleCreateTemplate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  value={templateFormTitle}
                  onChange={(e) => setTemplateFormTitle(e.target.value)}
                  placeholder="e.g. Monthly Bank Reconciliation"
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1">
                  Description (optional)
                </label>
                <textarea
                  rows={2}
                  value={templateFormDescription}
                  onChange={(e) => setTemplateFormDescription(e.target.value)}
                  placeholder="Detailed instructions or expectations..."
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1">
                    Client *
                  </label>
                  <select
                    required
                    value={templateFormClientId}
                    onChange={(e) => setTemplateFormClientId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white"
                  >
                    <option value="">Select a client</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1">
                    Assigned To *
                  </label>
                  <select
                    required
                    value={templateFormAssignee}
                    onChange={(e) => setTemplateFormAssignee(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white"
                  >
                    <option value="">Select an employee</option>
                    {employeeUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1">
                  Frequency *
                </label>
                <select
                  value={templateFormFrequency}
                  onChange={(e) => setTemplateFormFrequency(e.target.value as TaskFrequency)}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="semi_monthly">Semi-Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              {/* Conditional Date Picker(s) based on Frequency */}
              {templateFormFrequency !== 'semi_monthly' ? (
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    First due date — this date sets the recurring pattern going forward *
                  </label>
                  <input
                    type="date"
                    required
                    value={templateFormAnchorDate}
                    onChange={(e) => setTemplateFormAnchorDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white"
                  />
                  {templateFormAnchorWeekendNotice && (
                    <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>{templateFormAnchorWeekendNotice}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-neutral-500">
                    The day-of-month from each date will set the two recurring anchor days.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">
                        First monthly occurrence *
                      </label>
                      <input
                        type="date"
                        required
                        value={templateFormSemiDate1}
                        onChange={(e) => setTemplateFormSemiDate1(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white"
                      />
                      {templateFormSemi1WeekendNotice && (
                        <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <span>{templateFormSemi1WeekendNotice}</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">
                        Second monthly occurrence *
                      </label>
                      <input
                        type="date"
                        required
                        value={templateFormSemiDate2}
                        onChange={(e) => setTemplateFormSemiDate2(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white"
                      />
                      {templateFormSemi2WeekendNotice && (
                        <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <span>{templateFormSemi2WeekendNotice}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingTemplate}
                  className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 rounded-lg transition-opacity cursor-pointer disabled:opacity-50"
                >
                  {submittingTemplate ? 'Creating...' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Edit Task Template Modal */}
      {editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-neutral-200">
            <h3 className="text-lg font-bold text-neutral-900 mb-1">
              Edit Task Template
            </h3>
            <p className="text-xs text-neutral-500 mb-5">
              Update assignee, frequency, or deactivation status. (Templates are never permanently deleted to safeguard historical task integrity).
            </p>

            {editTemplateError && (
              <div className="p-3 mb-4 rounded-lg bg-red-50 text-red-700 text-xs font-medium border border-red-200">
                {editTemplateError}
              </div>
            )}

            <form onSubmit={handleUpdateTemplate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  value={editTemplateTitle}
                  onChange={(e) => setEditTemplateTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={editTemplateDescription}
                  onChange={(e) => setEditTemplateDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1">
                    Assigned To *
                  </label>
                  <select
                    required
                    value={editTemplateAssignee}
                    onChange={(e) => setEditTemplateAssignee(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white"
                  >
                    <option value="">Select an employee</option>
                    {employeeUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1">
                    Frequency *
                  </label>
                  <select
                    value={editTemplateFrequency}
                    onChange={(e) => setEditTemplateFrequency(e.target.value as TaskFrequency)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="semi_monthly">Semi-Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>

              {/* Conditional Date Picker(s) based on Frequency */}
              {editTemplateFrequency !== 'semi_monthly' ? (
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    First due date — this date sets the recurring pattern going forward *
                  </label>
                  <input
                    type="date"
                    required
                    value={editTemplateAnchorDate}
                    onChange={(e) => setEditTemplateAnchorDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white"
                  />
                  {editTemplateAnchorWeekendNotice && (
                    <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>{editTemplateAnchorWeekendNotice}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-neutral-500">
                    The day-of-month from each date will set the two recurring anchor days.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">
                        First monthly occurrence *
                      </label>
                      <input
                        type="date"
                        required
                        value={editTemplateSemiDate1}
                        onChange={(e) => setEditTemplateSemiDate1(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white"
                      />
                      {editTemplateSemi1WeekendNotice && (
                        <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <span>{editTemplateSemi1WeekendNotice}</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">
                        Second monthly occurrence *
                      </label>
                      <input
                        type="date"
                        required
                        value={editTemplateSemiDate2}
                        onChange={(e) => setEditTemplateSemiDate2(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white"
                      />
                      {editTemplateSemi2WeekendNotice && (
                        <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <span>{editTemplateSemi2WeekendNotice}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Active Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-50 border border-neutral-200">
                <div>
                  <span className="text-xs font-semibold text-neutral-800 block">
                    Template Status
                  </span>
                  <span className="text-xs text-neutral-500">
                    {editTemplateActive
                      ? 'Active (generates upcoming cycle tasks automatically)'
                      : 'Deactivated (no further cycle tasks will be generated)'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditTemplateActive(!editTemplateActive)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    editTemplateActive ? 'bg-brand-purple' : 'bg-neutral-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                      editTemplateActive ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
                {editingTemplate.active && (
                  <button
                    type="button"
                    onClick={() => handleDeactivateTemplate(editingTemplate)}
                    className="inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 font-medium cursor-pointer"
                  >
                    <Power className="w-3.5 h-3.5" />
                    Deactivate Template
                  </button>
                )}
                <div className="flex items-center gap-3 ml-auto">
                  <button
                    type="button"
                    onClick={() => setEditingTemplate(null)}
                    className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingEditTemplate}
                    className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 rounded-lg transition-opacity cursor-pointer disabled:opacity-50"
                  >
                    {submittingEditTemplate ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Add One-Off Task Modal */}
      {isOneOffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-neutral-200">
            <h3 className="text-lg font-bold text-neutral-900 mb-1">
              Add One-Off Task
            </h3>
            <p className="text-xs text-neutral-500 mb-5">
              Create a standalone, non-recurring task with a specific due date.
            </p>

            {oneOffModalError && (
              <div className="p-3 mb-4 rounded-lg bg-red-50 text-red-700 text-xs font-medium border border-red-200">
                {oneOffModalError}
              </div>
            )}

            <form onSubmit={handleCreateOneOff} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  value={oneOffTitle}
                  onChange={(e) => setOneOffTitle(e.target.value)}
                  placeholder="e.g. Prepare Tax Audit Dossier"
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1">
                  Description (optional)
                </label>
                <textarea
                  rows={2}
                  value={oneOffDescription}
                  onChange={(e) => setOneOffDescription(e.target.value)}
                  placeholder="Task details and deliverables..."
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1">
                    Client *
                  </label>
                  <select
                    required
                    value={oneOffClientId}
                    onChange={(e) => setOneOffClientId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white"
                  >
                    <option value="">Select a client</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1">
                    Assigned To *
                  </label>
                  <select
                    required
                    value={oneOffAssignee}
                    onChange={(e) => setOneOffAssignee(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white"
                  >
                    <option value="">Select an employee</option>
                    {employeeUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1">
                  Due Date *
                </label>
                <input
                  type="date"
                  required
                  value={oneOffDueDate}
                  onChange={(e) => setOneOffDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white"
                />
                {oneOffWeekendNotice && (
                  <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>{oneOffWeekendNotice}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsOneOffModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingOneOff}
                  className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 rounded-lg transition-opacity cursor-pointer disabled:opacity-50"
                >
                  {submittingOneOff ? 'Creating...' : 'Create One-Off Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Edit / Reassign Task Modal (tl/manager) */}
      {editingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-neutral-200">
            <h3 className="text-lg font-bold text-neutral-900 mb-1">
              Edit / Reassign Task
            </h3>
            <p className="text-xs text-neutral-500 mb-5">
              Modify assignee, deadline, or details for this task.
            </p>

            {editTaskError && (
              <div className="p-3 mb-4 rounded-lg bg-red-50 text-red-700 text-xs font-medium border border-red-200">
                {editTaskError}
              </div>
            )}

            <form onSubmit={handleUpdateTask} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  value={editTaskTitle}
                  onChange={(e) => setEditTaskTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={editTaskDescription}
                  onChange={(e) => setEditTaskDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1">
                    Reassign To *
                  </label>
                  <select
                    required
                    value={editTaskAssignee}
                    onChange={(e) => setEditTaskAssignee(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white"
                  >
                    <option value="">Select an employee</option>
                    {employeeUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1">
                    Due Date & Time *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={editTaskDueDate}
                    onChange={(e) => setEditTaskDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white"
                  />
                  {editTaskWeekendNotice && (
                    <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>{editTaskWeekendNotice}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEditTask}
                  className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 rounded-lg transition-opacity cursor-pointer disabled:opacity-50"
                >
                  {submittingEditTask ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Delete Task Confirmation Dialog (tl/manager) */}
      <ConfirmDialog
        isOpen={taskToDelete !== null}
        title={deleteDialogTitle}
        message={deleteDialogMessage}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isDestructive={true}
        isLoading={isDeletingTask}
        onConfirm={handleConfirmDeleteTask}
        onCancel={() => {
          if (!isDeletingTask) {
            setTaskToDelete(null);
          }
        }}
      />
    </div>
  );
};

// ================= SUBCOMPONENT: TaskRowItem =================

interface TaskRowItemProps {
  task: Task;
  currentUserId: string;
  isPrivileged: boolean;
  clientName: string;
  assignedName: string;
  comments: TaskComment[];
  isCommentsOpen: boolean;
  commentInput: string;
  submittingComment: boolean;
  usersMap: Record<string, UserDoc>;
  onToggleComments: () => void;
  onCommentInputChange: (val: string) => void;
  onAddComment: () => void;
  onMarkComplete: () => void;
  onEditTask: (e: React.MouseEvent) => void;
  onDeleteTask: (e: React.MouseEvent) => void;
}

const TaskRowItem: React.FC<TaskRowItemProps> = ({
  task,
  currentUserId,
  isPrivileged,
  clientName,
  assignedName,
  comments,
  isCommentsOpen,
  commentInput,
  submittingComment,
  usersMap,
  onToggleComments,
  onCommentInputChange,
  onAddComment,
  onMarkComplete,
  onEditTask,
  onDeleteTask,
}) => {
  const isOverdue = isTaskOverdue(task);
  const isDone = task.status === 'done';
  const isAssignedToMe = task.assigned_to === currentUserId;

  return (
    <div className="p-4 hover:bg-neutral-50/50 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Left Column: Title & Metadata */}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4
              className={`text-sm font-semibold truncate ${
                isDone ? 'text-neutral-500 line-through' : 'text-neutral-900'
              }`}
            >
              {task.title}
            </h4>

            {/* Status indicator badge */}
            {isDone ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 text-neutral-600 border border-neutral-200">
                <CheckCircle2 className="w-3 h-3 text-neutral-500" />
                <span>
                  Done {task.completed_at ? `• ${formatDisplayDate(task.completed_at)}` : ''}
                </span>
              </span>
            ) : isOverdue ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                <AlertCircle className="w-3 h-3 text-red-600" />
                <span>Overdue</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Clock className="w-3 h-3 text-emerald-600" />
                <span>Pending</span>
              </span>
            )}
          </div>

          {/* Description snippet if present */}
          {task.description && (
            <p className="text-xs text-neutral-500 line-clamp-2">
              {task.description}
            </p>
          )}

          {/* Metadata badges: Client, Assignee, Due Date */}
          <div className="flex flex-wrap items-center gap-3 pt-0.5 text-xs text-neutral-500">
            <span className="inline-flex items-center gap-1">
              <Building className="w-3.5 h-3.5 text-neutral-400" />
              <span className="font-medium text-neutral-700">{clientName}</span>
            </span>

            <span className="inline-flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-neutral-400" />
              <span className={isAssignedToMe ? 'font-semibold text-neutral-900' : 'text-neutral-600'}>
                {assignedName} {isAssignedToMe ? '(You)' : ''}
              </span>
            </span>

            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-neutral-400" />
              <span className={isOverdue ? 'text-red-600 font-medium' : 'text-neutral-600'}>
                Due {formatDisplayDate(task.due_date)}
              </span>
            </span>
          </div>
        </div>

        {/* Right Column: Actions */}
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          {/* Mark Complete Button (ONLY for user assigned to this pending/overdue task) */}
          {isAssignedToMe && !isDone && (
            <button
              type="button"
              onClick={onMarkComplete}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Mark Complete</span>
            </button>
          )}

          {/* Privileged Edit / Reassign button */}
          {isPrivileged && (
            <button
              type="button"
              onClick={onEditTask}
              title="Edit or reassign task"
              className="p-1.5 text-neutral-400 hover:text-neutral-800 rounded-md hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Privileged Delete button */}
          {isPrivileged && (
            <button
              type="button"
              onClick={onDeleteTask}
              title="Delete task"
              className="p-1.5 text-neutral-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Comments Toggle Button */}
          <button
            type="button"
            onClick={onToggleComments}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
              isCommentsOpen
                ? 'bg-neutral-100 text-neutral-900 border-neutral-300'
                : 'text-neutral-600 hover:text-neutral-900 border-neutral-200 hover:bg-neutral-50'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Comments ({comments.length})</span>
            {isCommentsOpen ? (
              <ChevronUp className="w-3 h-3 text-neutral-400" />
            ) : (
              <ChevronDown className="w-3 h-3 text-neutral-400" />
            )}
          </button>
        </div>
      </div>

      {/* Collapsible Comments Section */}
      {isCommentsOpen && (
        <div className="mt-4 pt-4 border-t border-neutral-200/70 bg-neutral-50/50 rounded-lg p-3 space-y-3">
          <h5 className="text-xs font-semibold text-neutral-700 uppercase tracking-wider flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-neutral-400" />
            <span>Task Comments</span>
          </h5>

          {/* Comment list */}
          {comments.length === 0 ? (
            <p className="text-xs text-neutral-400 italic">No comments yet.</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {comments.map((comment) => {
                const authorName = usersMap[comment.user_id]?.name || 'Team Member';

                return (
                  <div
                    key={comment.id}
                    className="p-2.5 rounded-md bg-white border border-neutral-200 text-xs shadow-2xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2 text-neutral-500">
                      <span className="font-semibold text-neutral-800">
                        {authorName}
                      </span>
                      <span className="text-[11px] text-neutral-400">
                        {formatDisplayDateTime(comment.timestamp)}
                      </span>
                    </div>
                    <p className="text-neutral-700 whitespace-pre-wrap">{comment.text}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add comment input (always available, never required to complete) */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={commentInput}
              onChange={(e) => onCommentInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onAddComment();
                }
              }}
              placeholder="Write a comment..."
              className="flex-1 px-3 py-1.5 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
            <button
              type="button"
              disabled={submittingComment || !commentInput.trim()}
              onClick={onAddComment}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 rounded-lg transition-opacity cursor-pointer disabled:opacity-40"
            >
              <Send className="w-3 h-3" />
              <span>Add</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
