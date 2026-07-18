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
  isOpen?: boolean;
  onClose?: () => void;
  logs: ActivityLog[];
  onClearLogs: () => void;
  inline?: boolean;
}

export default function AuditLogsModal({ isOpen, onClose, logs, onClearLogs, inline = false }: AuditLogsModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [selectedRole, setSelectedRole] = useState<string>('ALL');
  const [confirmClear, setConfirmClear] = useState(false);

  // Filtered log computations
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchSearch = 
        log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.target && log.target.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.userEmail && log.userEmail.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.regNo && log.regNo.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.center && log.center.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchAction = selectedAction === 'ALL' || log.action === selectedAction;
      const matchRole = selectedRole === 'ALL' || log.userRole === selectedRole;

      return matchSearch && matchAction && matchRole;
    });
  }, [logs, searchTerm, selectedAction, selectedRole]);

  if (!inline && !isOpen) return null;

  // Export logs helper (CSV/JSON style)
  const handleExportLogs = () => {
    if (filteredLogs.length === 0) return;
    const header = ['ID', 'Timestamp', 'User Email', 'User Role', 'Action', 'Student RegNo', 'Center', 'Target Student/ID', 'Activity Details'];
    const rows = filteredLogs.map(log => [
      log.id,
      log.timestamp,
      log.userEmail || '',
      log.userRole,
      log.action,
      log.regNo || '',
      log.center || '',
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

  const renderContent = () => (
    <div className={`bg-[#FAF8F5] flex flex-col overflow-hidden w-full ${
      inline 
        ? 'rounded-3xl border-2 border-[#E3DEC3] shadow-sm min-h-[500px]' 
        : 'rounded-3xl border border-[#E3DEC3] shadow-2xl relative z-10 max-w-5xl max-h-[85vh]'
    }`}>
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
              Tracks every database attempt (writes, edits, deletes, resets, imports) with timestamp details, simulated role profiles, and operator emails.
            </p>
            <div className="mt-1 text-[10.5px] text-[#8C764D] bg-[#FBF5EC] px-2 py-1 rounded-md border border-[#ECE0CE] inline-block font-semibold">
              💡 Note: Actions taken prior to the update default to "System" (Legacy). All ongoing & new actions display the active Google Workspace email.
            </div>
          </div>
        </div>
        {!inline && onClose && (
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-stone-200/60 text-stone-600 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
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
              className="bg-white border border-[#E3DEC3] text-stone-700 text-xs font-bold py-1 px-2.5 rounded-xl outline-hidden focus:border-[#5A7060] cursor-pointer"
            >
              <option value="ALL">All Actions</option>
              <option value="CREATE">Create</option>
              <option value="UPDATE">Update</option>
              <option value="DELETE">Delete</option>
              <option value="BULK_DELETE">Bulk Delete</option>
              <option value="IMPORT">Import</option>
              <option value="RESET">Reset</option>
              <option value="CLEAR_ALL">Wipe db</option>
            </select>
          </div>

          {/* Filter Role */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">Role:</span>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="bg-white border border-[#E3DEC3] text-stone-700 text-xs font-bold py-1 px-2.5 rounded-xl outline-hidden focus:border-[#5A7060] cursor-pointer"
            >
              <option value="ALL">All Roles</option>
              <option value="Central">Central</option>
              <option value="RAH">RAH</option>
              <option value="RFH">RFH</option>
              <option value="CH">CH</option>
              <option value="FH">FH</option>
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

      {/* Main Table Body */}
      <div className="flex-1 overflow-y-auto p-0 relative min-h-0">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-stone-400 text-center space-y-2">
            <SlidersHorizontal className="w-10 h-10 text-stone-300 stroke-1" />
            <p className="text-xs font-bold text-stone-500">No matching audit logs found.</p>
            <p className="text-[10px] text-stone-400">Try adjusting your filters or search term.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-200 bg-[#FDFBF9] text-stone-400 text-[10px] uppercase font-bold tracking-wider sticky top-0 z-5 select-none">
                  <th className="p-3 font-semibold">Timestamp</th>
                  <th className="p-3 font-semibold">Operator / Email</th>
                  <th className="p-3 font-semibold">Action</th>
                  <th className="p-3 font-semibold">Context / Scope</th>
                  <th className="p-3 font-semibold">Target Student / ID</th>
                  <th className="p-3 font-semibold">Details</th>
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
                    case 'BULK_DELETE':
                      actionBadge = 'bg-rose-50 text-rose-700 border-rose-200';
                      break;
                    case 'IMPORT':
                      actionBadge = 'bg-purple-50 text-purple-700 border-purple-200';
                      break;
                    case 'RESET':
                      actionBadge = 'bg-amber-50 text-amber-700 border-amber-200';
                      break;
                    case 'CLEAR_ALL':
                    case 'DELETE_FILTERED':
                      actionBadge = 'bg-red-50 text-red-700 border-red-200';
                      break;
                    default:
                      actionBadge = 'bg-stone-50 text-stone-600 border-stone-200';
                  }

                  return (
                    <tr key={log.id} className="hover:bg-stone-50/50">
                      <td className="p-3 font-mono text-[10px] text-stone-400 whitespace-nowrap">
                        {log.timestamp}
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-stone-900 truncate max-w-[170px]" title={log.userEmail}>
                          {log.userEmail || 'System'}
                        </div>
                        <div className="text-[10px] text-stone-400 font-mono">
                          {log.userRole}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`px-1.5 py-0.5 rounded-md border text-[9.5px] font-bold ${actionBadge}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-[11px]">
                        <div className="font-semibold text-stone-700">
                          {log.regNo || <span className="text-stone-300 font-sans">-</span>}
                        </div>
                        <div className="text-[10px] text-stone-400">
                          {log.center || <span className="text-stone-350 font-sans">-</span>}
                        </div>
                      </td>
                      <td className="p-3 text-stone-600 font-semibold truncate max-w-[180px]">
                        {log.target || <span className="text-stone-300 font-sans">-</span>}
                      </td>
                      <td className="p-3 text-stone-600 font-sans leading-relaxed text-[11px] max-w-md break-words">
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
          {!inline && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-[#5A7060] hover:bg-[#4E6052] text-white rounded-xl text-xs font-semibold cursor-pointer transition shadow-xs"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (inline) {
    return renderContent();
  }

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
        className="relative z-10 w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden"
      >
        {renderContent()}
      </motion.div>
    </div>
  );
}
