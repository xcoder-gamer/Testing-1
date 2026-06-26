import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  X, 
  Search, 
  Trash2, 
  FileClock, 
  SlidersHorizontal, 
  Download,
  Database,
  Trash,
  Check,
  UserCheck
} from 'lucide-react';
import { ActivityLog } from './types';

interface AuditLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: ActivityLog[];
  onClearLogs: () => void;
}

export default function AuditLogsModal({ isOpen, onClose, logs, onClearLogs }: AuditLogsModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [selectedRole, setSelectedRole] = useState<string>('ALL');
  const [confirmClear, setConfirmClear] = useState(false);

  // Filtered log computations
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchSearch = 
        log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.target && log.target.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchAction = selectedAction === 'ALL' || log.action === selectedAction;
      const matchRole = selectedRole === 'ALL' || log.userRole === selectedRole;

      return matchSearch && matchAction && matchRole;
    });
  }, [logs, searchTerm, selectedAction, selectedRole]);

  if (!isOpen) return null;

  // Export logs helper (CSV/JSON style)
  const handleExportLogs = () => {
    if (filteredLogs.length === 0) return;
    const header = ['ID', 'Timestamp', 'User Role', 'Action', 'Target Student/ID', 'Activity Details'];
    const rows = filteredLogs.map(log => [
      log.id,
      log.timestamp,
      log.userRole,
      log.action,
      log.target || '',
      log.details.replace(/"/g, '""')
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [header.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `PW_Audit_Logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-55 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-stone-900/50 backdrop-blur-xs" 
        onClick={onClose}
      />
      
      {/* Container */}
      <motion.div 
        initial={{ scale: 0.96, y: 12, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, y: 12, opacity: 0 }}
        className="bg-[#FAF8F5] rounded-3xl border border-[#E3DEC3] shadow-2xl relative z-10 w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#FAF8F5] border-b border-[#E3DEC3] flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#5A7060]/10 flex items-center justify-center text-[#5A7060]">
              <FileClock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-serif font-bold text-stone-900 flex items-center gap-2">
                System Audit Trail & History Logs
              </h3>
              <p className="text-xs text-stone-500 font-medium">
                Tracks every database attempt (writes, edits, deletes, resets, imports) with timestamp details and simulated role profiles.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-stone-200/60 text-stone-600 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar & Filters */}
        <div className="px-6 py-3 bg-[#FAF8F5] border-b border-[#ECEAE1] flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between shrink-0">
          {/* Left search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-stone-400" />
            <input
              type="text"
              placeholder="Search actions, targets, details..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-white border border-[#E3DEC3] rounded-xl focus:ring-1 focus:ring-[#5A7060] focus:border-[#5A7060] outline-hidden placeholder-stone-400 font-medium"
            />
          </div>

          {/* Action, Role filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Action */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">Action:</span>
              <select
                value={selectedAction}
                onChange={(e) => setSelectedAction(e.target.value)}
                className="bg-white border border-[#E3DEC3] rounded-lg px-2 py-1 text-xs font-semibold text-stone-700 outline-hidden focus:border-[#5A7060]"
              >
                <option value="ALL">All Actions</option>
                <option value="CREATE">Create</option>
                <option value="UPDATE">Update</option>
                <option value="DELETE">Delete</option>
                <option value="IMPORT">Import</option>
                <option value="RESET">Reset</option>
              </select>
            </div>

            {/* Filter Role */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">Role:</span>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="bg-white border border-[#E3DEC3] rounded-lg px-2 py-1 text-xs font-semibold text-stone-700 outline-hidden focus:border-[#5A7060]"
              >
                <option value="ALL">All Roles</option>
                <option value="Central">Central</option>
                <option value="RAH">Regional Academic Head</option>
                <option value="RFH">Regional Finance Head</option>
                <option value="CH">Center Head</option>
                <option value="FH">Finance Head</option>
                <option value="Mentor">Mentor</option>
                <option value="Counselor">Counselor</option>
              </select>
            </div>

            <div className="h-5 w-[1px] bg-stone-200 mx-1"></div>

            {/* Clear Logs confirmation block */}
            {!confirmClear ? (
              <button
                type="button"
                disabled={logs.length === 0}
                onClick={() => setConfirmClear(true)}
                className="p-1.5 hover:bg-red-50 hover:text-red-600 rounded-lg text-stone-400 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition"
                title="Clear Logs Database"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex items-center gap-1.5 bg-red-50 px-2 py-1 rounded-lg border border-red-200">
                <span className="text-[10px] text-red-700 font-bold">Wipe Logs?</span>
                <button
                  type="button"
                  onClick={() => {
                    onClearLogs();
                    setConfirmClear(false);
                  }}
                  className="px-1.5 py-0.5 bg-red-600 text-white hover:bg-red-700 rounded text-[9px] font-bold cursor-pointer transition"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="px-1.5 py-0.5 bg-stone-200 hover:bg-stone-300 rounded text-[9px] font-bold text-stone-700 cursor-pointer transition"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Logs Listing / Table */}
        <div className="flex-1 overflow-y-auto p-6 min-h-[250px]">
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-400">
                <FileClock className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-stone-700">No logs found</h4>
                <p className="text-xs text-stone-400 max-w-sm mt-0.5">
                  {logs.length === 0 
                    ? "Start creating, updating or editing student scholarship records to view real-time audit logs."
                    : "No log records match your current search queries or filters."
                  }
                </p>
              </div>
            </div>
          ) : (
            <div className="border border-[#E3DEC3] rounded-2xl overflow-hidden bg-white shadow-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#FAF8F5] border-b border-[#E3DEC3] text-[10px] font-bold uppercase tracking-wider text-stone-500 sticky top-0">
                    <th className="p-3 w-40">Timestamp</th>
                    <th className="p-3 w-32">Action</th>
                    <th className="p-3 w-32">Simulated Role</th>
                    <th className="p-3 w-44">Target student / ID</th>
                    <th className="p-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-[11.5px] font-medium text-stone-700">
                  {filteredLogs.map((log) => {
                    // Accent tags for actions
                    let actionBadge = '';
                    switch (log.action) {
                      case 'CREATE':
                        actionBadge = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                        break;
                      case 'UPDATE':
                        actionBadge = 'bg-sky-50 text-sky-700 border-sky-200';
                        break;
                      case 'DELETE':
                        actionBadge = 'bg-rose-50 text-rose-700 border-rose-200';
                        break;
                      case 'IMPORT':
                        actionBadge = 'bg-purple-50 text-purple-700 border-purple-200';
                        break;
                      case 'RESET':
                        actionBadge = 'bg-amber-50 text-amber-700 border-amber-200';
                        break;
                    }

                    return (
                      <tr key={log.id} className="hover:bg-stone-50/50">
                        <td className="p-3 font-mono text-[10.5px] text-stone-400 whitespace-nowrap">
                          {log.timestamp}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${actionBadge}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-[11px] font-semibold text-stone-600">
                          {log.userRole}
                        </td>
                        <td className="p-3 truncate font-mono text-[11px] max-w-[150px]" title={log.target}>
                          {log.target || <span className="text-stone-300 font-sans">-</span>}
                        </td>
                        <td className="p-3 leading-relaxed font-semibold text-stone-800 break-words">
                          {log.details}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#FAF8F5] border-t border-[#E3DEC3] flex justify-between items-center shrink-0">
          <div className="text-[10px] text-stone-400 font-semibold">
            Showing {filteredLogs.length} of {logs.length} logged attempts
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={filteredLogs.length === 0}
              onClick={handleExportLogs}
              className="px-3.5 py-1.5 bg-white hover:bg-stone-100 border border-[#E3DEC3] text-stone-700 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed flex items-center gap-1.5 transition"
            >
              <Download className="w-3.5 h-3.5" /> Export filtered to CSV
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-[#5A7060] hover:bg-[#4E6052] text-white rounded-xl text-xs font-semibold cursor-pointer transition shadow-xs"
            >
              Dismiss
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
