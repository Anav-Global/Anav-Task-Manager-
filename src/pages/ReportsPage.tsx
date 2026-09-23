import React, { useState, useEffect, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import {
  collection,
  onSnapshot,
} from 'firebase/firestore';
import {
  ChevronDown,
  ChevronUp,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  BarChart3,
  Users,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { toDate } from '../utils/recurrence';
import type { UserDoc, Task, Client } from '../types';

function formatDisplayDate(val: any): string {
  const d = toDate(val);
  if (!d) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getDaysLate(completedAtVal: any, dueDateVal: any): number {
  const completedDate = toDate(completedAtVal);
  const dueDate = toDate(dueDateVal);
  if (!completedDate || !dueDate) return 0;

  const dDue = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime();
  const dComp = new Date(completedDate.getFullYear(), completedDate.getMonth(), completedDate.getDate()).getTime();
  const diffDays = Math.round((dComp - dDue) / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays);
}

function getDaysOverdue(dueDateVal: any): number {
  const dueDate = toDate(dueDateVal);
  if (!dueDate) return 0;

  const today = new Date();
  const dDue = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime();
  const dToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diffDays = Math.round((dToday - dDue) / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays);
}

// Preset range helper
function getDefaultDateRange(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const firstDay = new Date(y, m, 1);
  const lastDay = new Date(y, m + 1, 0);

  const start = `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, '0')}-01`;
  const end = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
  return { start, end };
}

export const ReportsPage: React.FC = () => {
  const { userDoc, user, loading: authLoading } = useAuth();
  const isPrivileged = userDoc?.role === 'tl' || userDoc?.role === 'manager';
  const isManager = userDoc?.role === 'manager';

  // Guard: if non-manager (e.g. TL or employee) hits /dashboard/reports, redirect to tasks with message
  if (!authLoading && !isManager) {
    return (
      <Navigate
        to="/dashboard/tasks"
        state={{ message: 'This section is only available to managers' }}
        replace
      />
    );
  }

  const [users, setUsers] = useState<UserDoc[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // Date Range Filter
  const defaultDates = useMemo(() => getDefaultDateRange(), []);
  const [startDate, setStartDate] = useState(defaultDates.start);
  const [endDate, setEndDate] = useState(defaultDates.end);
  const [preset, setPreset] = useState<'this_month' | 'last_month' | 'last_30_days' | 'custom'>('this_month');

  // Expanded employee IDs
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const toggleRow = (userId: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  // Preset handler
  const handlePresetChange = (type: 'this_month' | 'last_month' | 'last_30_days' | 'custom') => {
    setPreset(type);
    const now = new Date();
    if (type === 'this_month') {
      const y = now.getFullYear();
      const m = now.getMonth();
      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);
      setStartDate(`${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-01`);
      setEndDate(`${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`);
    } else if (type === 'last_month') {
      const y = now.getFullYear();
      const m = now.getMonth() - 1;
      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);
      setStartDate(`${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-01`);
      setEndDate(`${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`);
    } else if (type === 'last_30_days') {
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      setStartDate(`${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`);
      setEndDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
    }
  };

  // Subscribe to users, tasks, clients
  useEffect(() => {
    setLoading(true);

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const list: UserDoc[] = snapshot.docs.map((d) => ({
        id: d.id,
        name: d.data().name || '',
        email: d.data().email || '',
        role: d.data().role || 'employee',
        client_ids: d.data().client_ids || [],
        created_at: d.data().created_at,
      }));
      setUsers(list);
    });

    const unsubTasks = onSnapshot(collection(db, 'tasks'), (snapshot) => {
      const list: Task[] = snapshot.docs.map((d) => ({
        id: d.id,
        client_id: d.data().client_id || '',
        template_id: d.data().template_id || null,
        title: d.data().title || '',
        description: d.data().description || '',
        assigned_to: d.data().assigned_to || '',
        due_date: d.data().due_date,
        status: d.data().status || 'pending',
        created_by: d.data().created_by || '',
        created_at: d.data().created_at,
        completed_at: d.data().completed_at || null,
        completed_by: d.data().completed_by || null,
      }));
      setTasks(list);
    });

    const unsubClients = onSnapshot(collection(db, 'clients'), (snapshot) => {
      const list: Client[] = snapshot.docs.map((d) => ({
        id: d.id,
        name: d.data().name || '',
        group_id: d.data().group_id || null,
        status: d.data().status || 'active',
        contact_info: d.data().contact_info || '',
        created_at: d.data().created_at,
        created_by: d.data().created_by || '',
      }));
      setClients(list);
      setLoading(false);
    });

    return () => {
      unsubUsers();
      unsubTasks();
      unsubClients();
    };
  }, []);

  // Map of client ID to client name
  const clientMap = useMemo(() => {
    const map: Record<string, string> = {};
    clients.forEach((c) => {
      map[c.id] = c.name;
    });
    return map;
  }, [clients]);

  // Date range timestamps (start of day to end of day)
  const rangeBounds = useMemo(() => {
    let startMs = 0;
    let endMs = Infinity;

    if (startDate) {
      const [y, m, d] = startDate.split('-').map(Number);
      startMs = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
    }
    if (endDate) {
      const [y, m, d] = endDate.split('-').map(Number);
      endMs = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
    }

    return { startMs, endMs };
  }, [startDate, endDate]);

  // Filter tasks within the selected date range by due_date
  const tasksInRange = useMemo(() => {
    const { startMs, endMs } = rangeBounds;
    return tasks.filter((t) => {
      if (t.status === 'skipped') return false;
      const dueDate = toDate(t.due_date);
      if (!dueDate) return false;
      const dueTime = dueDate.getTime();
      return dueTime >= startMs && dueTime <= endMs;
    });
  }, [tasks, rangeBounds]);

  // Target users to display in report
  const visibleUsers = useMemo(() => {
    if (!isPrivileged && user) {
      // Employees only see their own performance row
      return users.filter((u) => u.id === user.uid);
    }
    // Managers/TLs see all users (or employees)
    return users.sort((a, b) => a.name.localeCompare(b.name));
  }, [users, isPrivileged, user]);

  // Aggregate stats per employee
  const employeeReports = useMemo(() => {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    return visibleUsers.map((emp) => {
      const empTasks = tasksInRange.filter((t) => t.assigned_to === emp.id);

      const onTimeTasks: Task[] = [];
      const lateTasks: Task[] = [];
      const missedTasks: Task[] = [];

      empTasks.forEach((task) => {
        const dueDate = toDate(task.due_date);
        const completedAt = toDate(task.completed_at);

        if (task.status === 'done') {
          if (!dueDate || !completedAt) {
            onTimeTasks.push(task);
          } else {
            // Compare calendar dates: completed on or before due date?
            const dDue = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime();
            const dComp = new Date(completedAt.getFullYear(), completedAt.getMonth(), completedAt.getDate()).getTime();
            if (dComp <= dDue) {
              onTimeTasks.push(task);
            } else {
              lateTasks.push(task);
            }
          }
        } else if (task.status === 'pending') {
          // Missed if overdue as of today
          if (dueDate) {
            const dDue = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime();
            if (dDue < todayStart) {
              missedTasks.push(task);
            }
          }
        }
      });

      const total = onTimeTasks.length + lateTasks.length + missedTasks.length;
      const onTimeRate = total > 0 ? `${Math.round((onTimeTasks.length / total) * 100)}%` : '—';

      return {
        user: emp,
        total,
        onTimeTasks,
        lateTasks,
        missedTasks,
        onTimeCount: onTimeTasks.length,
        lateCount: lateTasks.length,
        missedCount: missedTasks.length,
        onTimeRate,
      };
    });
  }, [visibleUsers, tasksInRange]);

  // Overall totals across all displayed employees
  const overallTotals = useMemo(() => {
    let total = 0;
    let onTime = 0;
    let late = 0;
    let missed = 0;

    employeeReports.forEach((r) => {
      total += r.total;
      onTime += r.onTimeCount;
      late += r.lateCount;
      missed += r.missedCount;
    });

    const rate = total > 0 ? `${Math.round((onTime / total) * 100)}%` : '—';

    return { total, onTime, late, missed, rate };
  }, [employeeReports]);

  // Extract export data across ALL employees for the selected date range
  const getExportData = () => {
    // 1. Summary rows: one row per employee
    const summaryRows = employeeReports.map((r) => ({
      'Employee Name': r.user.name || 'Unnamed Employee',
      'Total Tasks': r.total,
      'On-Time': r.onTimeCount,
      'Late': r.lateCount,
      'Missed': r.missedCount,
      'On-Time Rate (%)': r.onTimeRate,
    }));

    // 2. Task Detail rows across ALL employees
    const categoryRank: Record<string, number> = {
      'On-Time': 1,
      'Late': 2,
      'Missed': 3,
    };

    interface TaskDetailRow {
      'Employee Name': string;
      Category: 'On-Time' | 'Late' | 'Missed';
      'Task Title': string;
      'Client Name': string;
      'Due Date': string;
      'Completed Date': string;
      'Days Late / Overdue': string;
    }

    const detailRows: TaskDetailRow[] = [];

    employeeReports.forEach((r) => {
      const empName = r.user.name || 'Unnamed Employee';

      // On-time tasks
      r.onTimeTasks.forEach((task) => {
        detailRows.push({
          'Employee Name': empName,
          Category: 'On-Time',
          'Task Title': task.title,
          'Client Name': clientMap[task.client_id] || 'Unknown Client',
          'Due Date': formatDisplayDate(task.due_date),
          'Completed Date': formatDisplayDate(task.completed_at),
          'Days Late / Overdue': '',
        });
      });

      // Late tasks
      r.lateTasks.forEach((task) => {
        const daysLate = getDaysLate(task.completed_at, task.due_date);
        detailRows.push({
          'Employee Name': empName,
          Category: 'Late',
          'Task Title': task.title,
          'Client Name': clientMap[task.client_id] || 'Unknown Client',
          'Due Date': formatDisplayDate(task.due_date),
          'Completed Date': formatDisplayDate(task.completed_at),
          'Days Late / Overdue': `${daysLate} ${daysLate === 1 ? 'day' : 'days'} late`,
        });
      });

      // Missed tasks
      r.missedTasks.forEach((task) => {
        const daysOverdue = getDaysOverdue(task.due_date);
        detailRows.push({
          'Employee Name': empName,
          Category: 'Missed',
          'Task Title': task.title,
          'Client Name': clientMap[task.client_id] || 'Unknown Client',
          'Due Date': formatDisplayDate(task.due_date),
          'Completed Date': '', // blank for Missed tasks
          'Days Late / Overdue': `${daysOverdue} ${daysOverdue === 1 ? 'day' : 'days'} overdue`,
        });
      });
    });

    // Sort by Employee Name then Category
    detailRows.sort((a, b) => {
      const nameComp = a['Employee Name'].localeCompare(b['Employee Name']);
      if (nameComp !== 0) return nameComp;
      return (categoryRank[a.Category] || 99) - (categoryRank[b.Category] || 99);
    });

    return { summaryRows, detailRows };
  };

  // Export to Excel (SheetJS)
  const handleExportExcel = () => {
    const { summaryRows, detailRows } = getExportData();
    const wb = XLSX.utils.book_new();

    const wsSummary = XLSX.utils.json_to_sheet(
      summaryRows.length > 0
        ? summaryRows
        : [
            {
              'Employee Name': '',
              'Total Tasks': '',
              'On-Time': '',
              'Late': '',
              'Missed': '',
              'On-Time Rate (%)': '',
            },
          ]
    );

    const wsDetail = XLSX.utils.json_to_sheet(
      detailRows.length > 0
        ? detailRows
        : [
            {
              'Employee Name': '',
              Category: '',
              'Task Title': '',
              'Client Name': '',
              'Due Date': '',
              'Completed Date': '',
              'Days Late / Overdue': '',
            },
          ]
    );

    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Task Detail');

    const fileName = `task-report_${startDate}_to_${endDate}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // Export to PDF (jsPDF + jspdf-autotable)
  const handleExportPDF = () => {
    const { summaryRows, detailRows } = getExportData();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

    // Title & Metadata
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text('Task Performance Report', 40, 45);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Date Range: ${startDate} to ${endDate}`, 40, 62);
    doc.text(
      `Generated: ${new Date().toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })}`,
      40,
      76
    );

    // 1. Summary Table
    autoTable(doc, {
      startY: 95,
      head: [['Employee Name', 'Total Tasks', 'On-Time', 'Late', 'Missed', 'On-Time Rate (%)']],
      body: summaryRows.map((r) => [
        r['Employee Name'],
        r['Total Tasks'],
        r['On-Time'],
        r['Late'],
        r['Missed'],
        r['On-Time Rate (%)'],
      ]),
      headStyles: {
        fillColor: [109, 40, 217], // Brand purple
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      theme: 'striped',
      styles: {
        fontSize: 9,
        cellPadding: 5,
      },
      columnStyles: {
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'center' },
        4: { halign: 'center' },
        5: { halign: 'right' },
      },
    });

    // Page break before Task Detail
    doc.addPage();

    // 2. Task Detail Header on new page
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Task Detail', 40, 45);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Date Range: ${startDate} to ${endDate}`, 40, 60);

    // Task Detail Table
    autoTable(doc, {
      startY: 75,
      head: [
        [
          'Employee Name',
          'Category',
          'Task Title',
          'Client Name',
          'Due Date',
          'Completed Date',
          'Days Late / Overdue',
        ],
      ],
      body: detailRows.map((t) => [
        t['Employee Name'],
        t.Category,
        t['Task Title'],
        t['Client Name'],
        t['Due Date'],
        t['Completed Date'],
        t['Days Late / Overdue'],
      ]),
      headStyles: {
        fillColor: [37, 99, 235], // Brand blue
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      theme: 'striped',
      styles: {
        fontSize: 8,
        cellPadding: 4,
      },
    });

    const fileName = `task-report_${startDate}_to_${endDate}.pdf`;
    doc.save(fileName);
  };

  return (
    <div className="space-y-6">
      {/* Header and Filter Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-brand-purple" />
            <span>Task Completion Reports</span>
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            Performance metrics and compliance tracking by employee for tasks due in the selected period.
          </p>
        </div>

        {/* Action Bar: Export Buttons & Date Filter */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Export Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 shadow-2xs transition-colors cursor-pointer"
              title="Download Excel workbook with Summary and Task Detail sheets"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Export to Excel</span>
            </button>
            <button
              type="button"
              onClick={handleExportPDF}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 shadow-2xs transition-colors cursor-pointer"
              title="Download PDF report with Summary and Task Detail tables"
            >
              <FileText className="w-4 h-4 text-red-600" />
              <span>Export to PDF</span>
            </button>
          </div>

          {/* Date Filter & Presets */}
          <div className="flex flex-wrap items-center gap-2 bg-white p-1.5 rounded-xl border border-neutral-200 shadow-2xs">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handlePresetChange('this_month')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  preset === 'this_month'
                    ? 'bg-gradient-to-r from-brand-purple to-brand-blue text-white shadow-2xs'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => handlePresetChange('last_month')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  preset === 'last_month'
                    ? 'bg-gradient-to-r from-brand-purple to-brand-blue text-white shadow-2xs'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                Last Month
              </button>
              <button
                type="button"
                onClick={() => handlePresetChange('last_30_days')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  preset === 'last_30_days'
                    ? 'bg-gradient-to-r from-brand-purple to-brand-blue text-white shadow-2xs'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                Last 30 Days
              </button>
            </div>

            <div className="h-4 w-px bg-neutral-200 hidden sm:block" />

            {/* Date Range Inputs */}
            <div className="flex items-center gap-1.5 text-xs text-neutral-600">
              <Calendar className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPreset('custom');
                }}
                className="px-2 py-1 text-xs border border-neutral-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-blue bg-white"
              />
              <span className="text-neutral-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPreset('custom');
                }}
                className="px-2 py-1 text-xs border border-neutral-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-blue bg-white"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-neutral-200 shadow-2xs">
          <div className="text-xs font-medium text-neutral-500">Total Tasks</div>
          <div className="text-xl font-bold text-neutral-900 mt-1">{overallTotals.total}</div>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-neutral-200 shadow-2xs">
          <div className="text-xs font-medium text-emerald-700 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>On-Time</span>
          </div>
          <div className="text-xl font-bold text-emerald-700 mt-1">{overallTotals.onTime}</div>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-neutral-200 shadow-2xs">
          <div className="text-xs font-medium text-amber-700 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Late</span>
          </div>
          <div className="text-xl font-bold text-amber-700 mt-1">{overallTotals.late}</div>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-neutral-200 shadow-2xs">
          <div className="text-xs font-medium text-red-700 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Missed</span>
          </div>
          <div className="text-xl font-bold text-red-700 mt-1">{overallTotals.missed}</div>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-neutral-200 shadow-2xs col-span-2 sm:col-span-1">
          <div className="text-xs font-medium text-neutral-500">On-Time Rate</div>
          <div className="text-xl font-bold text-neutral-900 mt-1">{overallTotals.rate}</div>
        </div>
      </div>

      {/* Summary Table with Expandable Drill-Down */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-neutral-500 text-sm">
            <div className="w-6 h-6 border-2 border-neutral-300 border-t-neutral-800 rounded-full animate-spin mx-auto mb-2" />
            <span>Loading performance reports...</span>
          </div>
        ) : employeeReports.length === 0 ? (
          <div className="p-12 text-center text-neutral-500 text-sm">
            <Users className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
            <span>No employee records found.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-xs font-semibold text-neutral-600">
                  <th className="py-3 px-4 w-8"></th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4 text-center">Total</th>
                  <th className="py-3 px-4 text-center text-emerald-700">On-Time</th>
                  <th className="py-3 px-4 text-center text-amber-700">Late</th>
                  <th className="py-3 px-4 text-center text-red-700">Missed</th>
                  <th className="py-3 px-4 text-right">On-Time Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 text-sm">
                {employeeReports.map((report) => {
                  const emp = report.user;
                  const isExpanded = !!expandedRows[emp.id];

                  return (
                    <React.Fragment key={emp.id}>
                      {/* Summary Row */}
                      <tr
                        onClick={() => toggleRow(emp.id)}
                        className="hover:bg-neutral-50/80 transition-colors cursor-pointer select-none"
                      >
                        <td className="py-3 px-4 text-neutral-400">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-neutral-600" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-neutral-400" />
                          )}
                        </td>
                        <td className="py-3 px-4 font-medium text-neutral-900">
                          <div className="flex items-center gap-2">
                            <span>{emp.name || 'Unnamed Employee'}</span>
                            <span className="text-xs text-neutral-400 font-normal">({emp.email})</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-medium text-neutral-700">
                          {report.total}
                        </td>
                        <td className="py-3 px-4 text-center font-semibold text-emerald-700">
                          {report.onTimeCount}
                        </td>
                        <td className="py-3 px-4 text-center font-semibold text-amber-700">
                          {report.lateCount}
                        </td>
                        <td className="py-3 px-4 text-center font-semibold text-red-700">
                          {report.missedCount}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-neutral-900">
                          {report.onTimeRate}
                        </td>
                      </tr>

                      {/* Expandable Drill-Down Row */}
                      {isExpanded && (
                        <tr className="bg-neutral-50/60 border-b border-neutral-200">
                          <td colSpan={7} className="px-6 py-5">
                            <div className="space-y-6 max-w-4xl">
                              {/* 1. On-Time Sub-Section */}
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                                  <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
                                    On-Time ({report.onTimeTasks.length})
                                  </h4>
                                </div>
                                {report.onTimeTasks.length === 0 ? (
                                  <p className="text-xs text-neutral-400 italic pl-4">None</p>
                                ) : (
                                  <div className="space-y-2 pl-4">
                                    {report.onTimeTasks.map((task) => (
                                      <div
                                        key={task.id}
                                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-white rounded-lg border border-neutral-200 shadow-2xs text-xs"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <span className="font-semibold text-neutral-900 block truncate">
                                            {task.title}
                                          </span>
                                          <span className="text-neutral-500">
                                            Client:{' '}
                                            <span className="text-neutral-700 font-medium">
                                              {clientMap[task.client_id] || 'Unknown Client'}
                                            </span>
                                          </span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-3 text-neutral-500 shrink-0">
                                          <span>Due: {formatDisplayDate(task.due_date)}</span>
                                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                            Completed: {formatDisplayDate(task.completed_at)}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* 2. Late Sub-Section */}
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                                  <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
                                    Late ({report.lateTasks.length})
                                  </h4>
                                </div>
                                {report.lateTasks.length === 0 ? (
                                  <p className="text-xs text-neutral-400 italic pl-4">None</p>
                                ) : (
                                  <div className="space-y-2 pl-4">
                                    {report.lateTasks.map((task) => {
                                      const daysLate = getDaysLate(task.completed_at, task.due_date);
                                      return (
                                        <div
                                          key={task.id}
                                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-white rounded-lg border border-neutral-200 shadow-2xs text-xs"
                                        >
                                          <div className="min-w-0 flex-1">
                                            <span className="font-semibold text-neutral-900 block truncate">
                                              {task.title}
                                            </span>
                                            <span className="text-neutral-500">
                                              Client:{' '}
                                              <span className="text-neutral-700 font-medium">
                                                {clientMap[task.client_id] || 'Unknown Client'}
                                              </span>
                                            </span>
                                          </div>
                                          <div className="flex flex-wrap items-center gap-3 text-neutral-500 shrink-0">
                                            <span>Due: {formatDisplayDate(task.due_date)}</span>
                                            <span>Completed: {formatDisplayDate(task.completed_at)}</span>
                                            <span className="inline-flex items-center text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                              {daysLate} {daysLate === 1 ? 'day' : 'days'} late
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {/* 3. Missed Sub-Section */}
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                                  <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
                                    Missed ({report.missedTasks.length})
                                  </h4>
                                </div>
                                {report.missedTasks.length === 0 ? (
                                  <p className="text-xs text-neutral-400 italic pl-4">None</p>
                                ) : (
                                  <div className="space-y-2 pl-4">
                                    {report.missedTasks.map((task) => {
                                      const daysOverdue = getDaysOverdue(task.due_date);
                                      return (
                                        <div
                                          key={task.id}
                                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-white rounded-lg border border-neutral-200 shadow-2xs text-xs"
                                        >
                                          <div className="min-w-0 flex-1">
                                            <span className="font-semibold text-neutral-900 block truncate">
                                              {task.title}
                                            </span>
                                            <span className="text-neutral-500">
                                              Client:{' '}
                                              <span className="text-neutral-700 font-medium">
                                                {clientMap[task.client_id] || 'Unknown Client'}
                                              </span>
                                            </span>
                                          </div>
                                          <div className="flex flex-wrap items-center gap-3 text-neutral-500 shrink-0">
                                            <span>Due: {formatDisplayDate(task.due_date)}</span>
                                            <span className="inline-flex items-center text-red-700 font-semibold bg-red-50 px-2 py-0.5 rounded border border-red-200">
                                              {daysOverdue} {daysOverdue === 1 ? 'day' : 'days'} overdue
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
