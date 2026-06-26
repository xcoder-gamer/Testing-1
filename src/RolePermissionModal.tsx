import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  X, 
  ShieldCheck, 
  UserPlus, 
  Trash2, 
  Mail, 
  Globe, 
  Building, 
  Info,
  ShieldAlert,
  Sliders,
  Upload,
  Download,
  CheckCircle,
  FileSpreadsheet
} from 'lucide-react';
import { UserRoleMapping } from './types';
import { 
  getUserRolesFromFirestore, 
  saveUserRolesToFirestore,
  deleteUserRoleInFirestore 
} from './firebaseUtils';

interface RolePermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeEmail: string;
  setActiveEmail: (email: string) => void;
  availableRegions: string[];
  availableCenters: string[];
  availableMentors: string[];
  triggerBanner: (message: string, type: 'success' | 'error' | 'info') => void;
  onRolesUpdated: () => void;
}

export default function RolePermissionModal({
  isOpen,
  onClose,
  activeEmail,
  setActiveEmail,
  availableRegions,
  availableCenters,
  availableMentors,
  triggerBanner,
  onRolesUpdated
}: RolePermissionModalProps) {
  // Local role mappings list
  const [roleMappings, setRoleMappings] = useState<UserRoleMapping[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // New row form state
  const [newRegion, setNewRegion] = useState('');
  const [newCenter, setNewCenter] = useState('');
  const [newBuilding, setNewBuilding] = useState('');
  const [newRegno, setNewRegno] = useState('');
  const [newRahMailid, setNewRahMailid] = useState('');
  const [newRfhMailid, setNewRfhMailid] = useState('');
  const [newChMailid, setNewChMailid] = useState('');
  const [newFhMailid, setNewFhMailid] = useState('');
  const [newMentorId, setNewMentorId] = useState('');
  const [newCounselorId, setNewCounselorId] = useState('');

  // Bulk copy-paste state
  const [pasteContent, setPasteContent] = useState('');
  const [showPasteBox, setShowPasteBox] = useState(false);

  // Search/filter mapping
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [filterCenter, setFilterCenter] = useState('');

  // Fetch all mappings from Firestore when modal opens
  const fetchMappings = async () => {
    setIsLoading(true);
    try {
      const data = await getUserRolesFromFirestore();
      setRoleMappings(data);
    } catch (err) {
      console.error("Failed to fetch role mappings", err);
      triggerBanner("Failed to fetch role mappings from database.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMappings();
      // Reset form
      setNewRegion(availableRegions[0] || 'PB + JK');
      setNewCenter(availableCenters[0] || 'Anantnag Vidyapeeth');
      setNewBuilding(availableCenters[0] || 'Anantnag Vidyapeeth');
      setNewRegno('');
      setNewRahMailid('');
      setNewRfhMailid('');
      setNewChMailid('');
      setNewFhMailid('');
      setNewMentorId('');
      setNewCounselorId('');
      setPasteContent('');
      setShowPasteBox(false);
      setFilterRegion('');
      setFilterCenter('');
    }
  }, [isOpen, availableRegions, availableCenters]);

  if (!isOpen) return null;

  // Add new role mapping row to Firestore
  const handleAddMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRegion.trim() || !newCenter.trim()) {
      triggerBanner("Region and Center are required.", "error");
      return;
    }

    const mapping: UserRoleMapping = {
      region: newRegion.trim(),
      center: newCenter.trim(),
      building: newBuilding.trim() || newCenter.trim(),
      regno: newRegno.trim(),
      rahMailid: newRahMailid.trim().toLowerCase(),
      rfhMailid: newRfhMailid.trim().toLowerCase(),
      chMailid: newChMailid.trim().toLowerCase(),
      fhMailid: newFhMailid.trim().toLowerCase(),
      mentorId: newMentorId.trim().toLowerCase(),
      counselorId: newCounselorId.trim().toLowerCase()
    };

    try {
      // Check for existing row key
      const duplicateIndex = roleMappings.findIndex(r => 
        r.region.toLowerCase().trim() === mapping.region.toLowerCase().trim() &&
        r.center.toLowerCase().trim() === mapping.center.toLowerCase().trim() &&
        r.building.toLowerCase().trim() === mapping.building.toLowerCase().trim() &&
        r.regno.trim() === mapping.regno.trim()
      );

      let updatedMappings = [...roleMappings];
      if (duplicateIndex !== -1) {
        updatedMappings[duplicateIndex] = mapping;
      } else {
        updatedMappings.push(mapping);
      }

      await saveUserRolesToFirestore(updatedMappings);
      triggerBanner(`Role configuration saved successfully!`, "success");
      
      // Reset input fields except Region & Center for convenience
      setNewRegno('');
      setNewRahMailid('');
      setNewRfhMailid('');
      setNewChMailid('');
      setNewFhMailid('');
      setNewMentorId('');
      setNewCounselorId('');

      fetchMappings();
      onRolesUpdated();
    } catch (err) {
      console.error("Failed to save role mapping", err);
      triggerBanner("Failed to save role configuration to database.", "error");
    }
  };

  // Delete entire role mapping row
  const handleDeleteMapping = async (mapping: UserRoleMapping) => {
    if (window.confirm(`Are you sure you want to remove permissions for ${mapping.center} (Regno: ${mapping.regno || 'All'})?`)) {
      try {
        await deleteUserRoleInFirestore(mapping.region, mapping.center, mapping.building, mapping.regno);
        triggerBanner(`Removed configuration row successfully.`, "success");
        fetchMappings();
        onRolesUpdated();
      } catch (err) {
        console.error("Failed to delete role mapping", err);
        triggerBanner("Failed to delete role mapping from database.", "error");
      }
    }
  };

  // Export role mappings as JSON file
  const handleExportRoles = () => {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(roleMappings, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", "pw_user_roles_backup.json");
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      triggerBanner("User roles exported to JSON successfully!", "success");
    } catch (err) {
      console.error(err);
      triggerBanner("Failed to export user roles to JSON.", "error");
    }
  };

  // Export role mappings as TSV file (excel and text-editor friendly copy-paste format)
  const handleExportRolesTSV = () => {
    try {
      const headers = ['Region', 'center', 'building', 'regno', 'RAH Mailid', 'RFH MailID', 'CH Mailid', 'FH MailId', 'Mentor ID', 'Councellor ID'];
      const rows = roleMappings.map(m => [
        m.region,
        m.center,
        m.building,
        m.regno,
        m.rahMailid,
        m.rfhMailid,
        m.chMailid,
        m.fhMailid,
        m.mentorId,
        m.counselorId
      ]);
      const content = [headers.join('\t'), ...rows.map(row => row.join('\t'))].join('\n');
      const dataStr = "data:text/tab-separated-values;charset=utf-8," + encodeURIComponent(content);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", "pw_user_roles.tsv");
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      triggerBanner("User roles exported successfully!", "success");
    } catch (err) {
      console.error(err);
      triggerBanner("Failed to export user roles.", "error");
    }
  };

  // Download Sample TSV template file
  const handleDownloadSampleCSV = () => {
    try {
      const headers = ['Region', 'center', 'building', 'regno', 'RAH Mailid', 'RFH MailID', 'CH Mailid', 'FH MailId', 'Mentor ID', 'Councellor ID'];
      const samples = [
        ['PB + JK', 'Anantnag VIdyapeeth', 'Anantnag VIdyapeeth', '101', 'rahul@pw.live', 'shivam@pw.live', 'simran@pw.live', 'sumit@pw.live', 'simran@pw.live', 'sumit@pw.live']
      ];
      const content = [headers.join('\t'), ...samples.map(row => row.join('\t'))].join('\n');
      const dataStr = "data:text/tab-separated-values;charset=utf-8," + encodeURIComponent(content);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", "pw_user_roles_sample.tsv");
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      triggerBanner("Sample TSV template downloaded successfully!", "success");
    } catch (err) {
      console.error(err);
      triggerBanner("Failed to download template.", "error");
    }
  };

  // Clean and parse text content (tab-separated or comma-separated)
  const parseRows = (text: string): UserRoleMapping[] => {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length <= 1) return [];

    const firstLine = lines[0];
    const separator = firstLine.includes('\t') ? '\t' : ',';

    const headers = firstLine.split(separator).map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase().replace(/[\s\t\-_]/g, ''));
    
    const regionIdx = headers.indexOf('region');
    const centerIdx = headers.indexOf('center');
    const buildingIdx = headers.indexOf('building');
    const regnoIdx = headers.indexOf('regno');
    const rahIdx = headers.indexOf('rahmailid');
    const rfhIdx = headers.indexOf('rfhmailid');
    const chIdx = headers.indexOf('chmailid');
    const fhIdx = headers.indexOf('fhmailid');
    const mentorIdx = headers.indexOf('mentorid');
    const counselorIdx = headers.indexOf('counselorid') !== -1 ? headers.indexOf('counselorid') : headers.indexOf('councellorid');

    const result: UserRoleMapping[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      let columns: string[] = [];
      if (separator === '\t') {
        columns = line.split('\t').map(col => col.trim().replace(/^["']|["']$/g, ''));
      } else {
        columns = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(col => col.trim().replace(/^["']|["']$/g, '').replace(/""/g, '"'));
      }

      if (columns.length === 0) continue;

      const regionVal = regionIdx !== -1 ? columns[regionIdx]?.trim() || '' : '';
      const centerVal = centerIdx !== -1 ? columns[centerIdx]?.trim() || '' : '';

      if (!regionVal && !centerVal) continue;

      const mapping: UserRoleMapping = {
        region: regionVal,
        center: centerVal,
        building: buildingIdx !== -1 ? columns[buildingIdx]?.trim() || centerVal : centerVal,
        regno: regnoIdx !== -1 ? columns[regnoIdx]?.trim() || '' : '',
        rahMailid: rahIdx !== -1 ? columns[rahIdx]?.trim().toLowerCase() || '' : '',
        rfhMailid: rfhIdx !== -1 ? columns[rfhIdx]?.trim().toLowerCase() || '' : '',
        chMailid: chIdx !== -1 ? columns[chIdx]?.trim().toLowerCase() || '' : '',
        fhMailid: fhIdx !== -1 ? columns[fhIdx]?.trim().toLowerCase() || '' : '',
        mentorId: mentorIdx !== -1 ? columns[mentorIdx]?.trim().toLowerCase() || '' : '',
        counselorId: counselorIdx !== -1 ? columns[counselorIdx]?.trim().toLowerCase() || '' : '',
      };

      result.push(mapping);
    }

    return result;
  };

  // Import role mappings via uploaded file
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result;
        if (typeof text !== 'string') return;

        const importedRows = parseRows(text);
        if (importedRows.length === 0) {
          triggerBanner("Could not find any valid mapping rows in the file.", "error");
          return;
        }

        await saveUserRolesToFirestore(importedRows);
        triggerBanner(`Successfully imported ${importedRows.length} configurations!`, "success");
        fetchMappings();
        onRolesUpdated();
      } catch (err) {
        console.error(err);
        triggerBanner("Failed to parse and import spreadsheet file.", "error");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Bulk paste action
  const handleBulkPasteImport = async () => {
    if (!pasteContent.trim()) {
      triggerBanner("Please paste some valid spreadsheet columns first.", "error");
      return;
    }

    try {
      const importedRows = parseRows(pasteContent);
      if (importedRows.length === 0) {
        triggerBanner("Could not detect any valid spreadsheet header rows. Check formatting.", "error");
        return;
      }

      await saveUserRolesToFirestore(importedRows);
      triggerBanner(`Bulk pasted and imported ${importedRows.length} rows directly!`, "success");
      setPasteContent('');
      setShowPasteBox(false);
      fetchMappings();
      onRolesUpdated();
    } catch (err) {
      console.error(err);
      triggerBanner("Failed to import pasted data.", "error");
    }
  };

  // Extract unique regions and centers in the active database for the dropdown filters
  const uniqueRegions = Array.from(new Set(roleMappings.map(m => m.region).filter(Boolean))).sort();
  const uniqueCenters = Array.from(new Set(roleMappings.map(m => m.center).filter(Boolean))).sort();

  // Reset / Clear entire database mapping list
  const handleClearAllMappings = async () => {
    const totalCount = roleMappings.length;
    if (totalCount === 0) {
      triggerBanner("No records found in database to clear.", "info");
      return;
    }
    
    if (window.confirm(`⚠️ WARNING: Are you sure you want to permanently delete ALL ${totalCount} database mapping rows? This cannot be undone.`)) {
      try {
        await saveUserRolesToFirestore([]);
        triggerBanner("All database configuration rows have been deleted.", "success");
        fetchMappings();
        onRolesUpdated();
      } catch (err) {
        console.error("Failed to clear database mappings", err);
        triggerBanner("Failed to clear database configuration.", "error");
      }
    }
  };

  // Delete only the filtered rows matching current search/dropdown criteria
  const handleDeleteFilteredMappings = async () => {
    const count = filteredMappings.length;
    if (count === 0) {
      triggerBanner("No rows match the active filter criteria.", "info");
      return;
    }
    
    const filterInfo = [
      filterRegion ? `Region: "${filterRegion}"` : null,
      filterCenter ? `Center: "${filterCenter}"` : null,
      searchTerm ? `Search Term: "${searchTerm}"` : null
    ].filter(Boolean).join(', ');

    const confirmMsg = `Are you sure you want to delete only the ${count} rows matching the active filters (${filterInfo || 'all'})?`;
    
    if (window.confirm(confirmMsg)) {
      try {
        // We keep any mapping that is NOT in the filtered list
        const updated = roleMappings.filter(m => !filteredMappings.some(f => 
          f.region.toLowerCase().trim() === m.region.toLowerCase().trim() &&
          f.center.toLowerCase().trim() === m.center.toLowerCase().trim() &&
          (f.building || '').toLowerCase().trim() === (m.building || '').toLowerCase().trim() &&
          f.regno.trim() === m.regno.trim()
        ));
        
        await saveUserRolesToFirestore(updated);
        triggerBanner(`Successfully deleted ${count} matching rows from database.`, "success");
        fetchMappings();
        onRolesUpdated();
      } catch (err) {
        console.error("Failed to delete filtered mappings", err);
        triggerBanner("Failed to delete filtered configuration rows.", "error");
      }
    }
  };

  const filteredMappings = roleMappings.filter(m => {
    if (filterRegion && m.region !== filterRegion) return false;
    if (filterCenter && m.center !== filterCenter) return false;
    
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      m.region.toLowerCase().includes(searchLower) ||
      m.center.toLowerCase().includes(searchLower) ||
      m.building.toLowerCase().includes(searchLower) ||
      m.regno.toLowerCase().includes(searchLower) ||
      m.rahMailid.toLowerCase().includes(searchLower) ||
      m.rfhMailid.toLowerCase().includes(searchLower) ||
      m.chMailid.toLowerCase().includes(searchLower) ||
      m.fhMailid.toLowerCase().includes(searchLower) ||
      m.mentorId.toLowerCase().includes(searchLower) ||
      m.counselorId.toLowerCase().includes(searchLower)
    );
  });

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
        className="bg-[#FAF8F5] rounded-3xl border border-[#E3DEC3] shadow-2xl relative z-10 w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#FAF8F5] border-b border-[#E3DEC3] flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#5A7060]/10 flex items-center justify-center text-[#5A7060]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-serif font-bold text-stone-900 flex items-center gap-2">
                Matrix User Roles & Permission Management
              </h3>
              <p className="text-xs text-stone-500 font-medium">
                Configure Region, Center, Building maps with designated RAH, RFH, CH, FH, Mentor, and Counselor accounts.
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

        {/* Outer Split Content */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT PANEL: 4 cols */}
          <div className="lg:col-span-4 space-y-5 flex flex-col">
            
            {/* Active User Setting Card */}
            <div className="bg-[#FFFDFB] border border-[#E3DEC3] rounded-2xl p-4 shadow-sm space-y-3">
              <h4 className="text-[11px] font-extrabold text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-[#5A7060]" /> Active Email simulation
              </h4>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-stone-500">Your Current Session Email:</label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-stone-400" />
                  <input
                    type="email"
                    value={activeEmail}
                    onChange={(e) => setActiveEmail(e.target.value.trim())}
                    placeholder="Type email address..."
                    className="pl-8.5 pr-3 py-2 w-full text-xs font-bold bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl focus:ring-1 focus:ring-[#5A7060]/80 focus:border-[#5A7060]/80 outline-hidden text-stone-800"
                  />
                </div>
                <p className="text-[10px] text-stone-400">
                  Changing this simulates role scopes in real-time. Unmapped emails default to <span className="font-bold">Central</span>.
                </p>
              </div>
            </div>

            {/* Role Assignment Form Card */}
            <div className="bg-[#FFFDFB] border border-[#E3DEC3] rounded-2xl p-4 shadow-sm flex-1">
              <h4 className="text-[11px] font-extrabold text-stone-500 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                <UserPlus className="w-3.5 h-3.5 text-[#5A7060]" /> Add New Mapping Row
              </h4>
              
              <form onSubmit={handleAddMapping} className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] font-bold text-stone-500 mb-0.5">Region</label>
                    <input
                      type="text"
                      required
                      value={newRegion}
                      onChange={(e) => setNewRegion(e.target.value)}
                      placeholder="e.g. PB + JK"
                      className="w-full p-2 text-xs bg-white border border-[#E3DEC3] rounded-xl font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-stone-500 mb-0.5">Center</label>
                    <input
                      type="text"
                      required
                      value={newCenter}
                      onChange={(e) => setNewCenter(e.target.value)}
                      placeholder="e.g. Anantnag Vidyapeeth"
                      className="w-full p-2 text-xs bg-white border border-[#E3DEC3] rounded-xl font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] font-bold text-stone-500 mb-0.5">Building</label>
                    <input
                      type="text"
                      value={newBuilding}
                      onChange={(e) => setNewBuilding(e.target.value)}
                      placeholder="Same as center"
                      className="w-full p-2 text-xs bg-white border border-[#E3DEC3] rounded-xl font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-stone-500 mb-0.5">Reg No</label>
                    <input
                      type="text"
                      value={newRegno}
                      onChange={(e) => setNewRegno(e.target.value)}
                      placeholder="e.g. 101"
                      className="w-full p-2 text-xs bg-white border border-[#E3DEC3] rounded-xl font-medium"
                    />
                  </div>
                </div>

                <div className="border-t border-stone-200/60 my-2 pt-2 space-y-2">
                  <h5 className="text-[9px] font-extrabold text-[#5A7060] uppercase tracking-wider">Assigned Role Emails:</h5>
                  
                  <div>
                    <label className="block text-[9px] font-bold text-stone-500 mb-0.5">RAH Mailid</label>
                    <input
                      type="email"
                      value={newRahMailid}
                      onChange={(e) => setNewRahMailid(e.target.value)}
                      placeholder="rahul@pw.live"
                      className="w-full p-1.5 text-xs bg-white border border-[#E3DEC3] rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-stone-500 mb-0.5">RFH MailID</label>
                    <input
                      type="email"
                      value={newRfhMailid}
                      onChange={(e) => setNewRfhMailid(e.target.value)}
                      placeholder="shivam@pw.live"
                      className="w-full p-1.5 text-xs bg-white border border-[#E3DEC3] rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-stone-500 mb-0.5">CH Mailid</label>
                    <input
                      type="email"
                      value={newChMailid}
                      onChange={(e) => setNewChMailid(e.target.value)}
                      placeholder="simran@pw.live"
                      className="w-full p-1.5 text-xs bg-white border border-[#E3DEC3] rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-stone-500 mb-0.5">FH MailId</label>
                    <input
                      type="email"
                      value={newFhMailid}
                      onChange={(e) => setNewFhMailid(e.target.value)}
                      placeholder="sumit@pw.live"
                      className="w-full p-1.5 text-xs bg-white border border-[#E3DEC3] rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-stone-500 mb-0.5">Mentor ID</label>
                    <input
                      type="email"
                      value={newMentorId}
                      onChange={(e) => setNewMentorId(e.target.value)}
                      placeholder="simran@pw.live"
                      className="w-full p-1.5 text-xs bg-white border border-[#E3DEC3] rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-stone-500 mb-0.5">Counselor ID</label>
                    <input
                      type="email"
                      value={newCounselorId}
                      onChange={(e) => setNewCounselorId(e.target.value)}
                      placeholder="sumit@pw.live"
                      className="w-full p-1.5 text-xs bg-white border border-[#E3DEC3] rounded-lg"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-[#2B3A2C] hover:bg-[#1E2B1F] text-[#FDFBF9] font-bold text-xs rounded-xl shadow-xs transition cursor-pointer flex justify-center items-center gap-2 mt-2"
                >
                  <UserPlus className="w-4 h-4" /> Save Configuration Row
                </button>
              </form>
            </div>
          </div>

          {/* RIGHT PANEL: 8 cols */}
          <div className="lg:col-span-8 flex flex-col space-y-4">
            
            {/* Top Toolbar */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-[#FFFDFB] border border-[#E3DEC3] p-4 rounded-2xl shadow-xs">
              <div>
                <h4 className="text-[11px] font-extrabold text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-[#5A7060]" /> Configured Access Control Matrices ({filteredMappings.length})
                </h4>
                <p className="text-[10px] text-stone-400 font-medium">Granular role-scoping mapping rows in active database</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Search by center, mail..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-3 pr-3 py-1.5 w-36 text-xs bg-white border border-[#E3DEC3] rounded-xl focus:ring-1 focus:ring-[#5A7060]/80 focus:border-[#5A7060]/80 outline-hidden text-stone-800"
                />

                {/* Direct Excel Paste Trigger */}
                <button
                  onClick={() => setShowPasteBox(!showPasteBox)}
                  className="px-2.5 py-1.5 text-[10px] font-extrabold text-stone-700 bg-white border border-[#E3DEC3] rounded-xl hover:bg-stone-50 flex items-center gap-1"
                  title="Directly paste rows copied from Excel / Google Sheets"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[#217346]" />
                  <span>Paste Sheet</span>
                </button>

                {/* Import / Export Options */}
                <div className="flex items-center bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl p-0.5">
                  <label className="px-2 py-1 text-[10px] font-bold text-stone-700 hover:bg-stone-200/50 rounded-lg transition cursor-pointer border-r border-stone-200">
                    Import File
                    <input type="file" accept=".tsv,.csv,.txt" onChange={handleImportFile} className="hidden" />
                  </label>
                  <button onClick={handleExportRolesTSV} className="px-2 py-1 text-[10px] font-bold text-stone-700 hover:bg-stone-200/50 rounded-lg transition cursor-pointer border-r border-stone-200" title="Export to standard spreadsheet format">Export TSV</button>
                  <button onClick={handleExportRoles} className="px-2 py-1 text-[10px] font-bold text-stone-700 hover:bg-stone-200/50 rounded-lg transition cursor-pointer" title="Export as raw JSON backup">JSON</button>
                </div>
              </div>
            </div>

            {/* Filter & Advanced Bulk Operations Sub-bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#FFFDFB] border border-[#E3DEC3] p-3 rounded-2xl shadow-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-extrabold text-stone-500 uppercase tracking-wider">Quick Filters:</span>
                
                {/* Region filter dropdown */}
                <select
                  value={filterRegion}
                  onChange={(e) => setFilterRegion(e.target.value)}
                  className="bg-white border border-[#E3DEC3] px-2 py-1 text-xs font-semibold rounded-xl text-stone-700 outline-hidden focus:ring-1 focus:ring-[#5A7060] cursor-pointer"
                >
                  <option value="">All Regions ({uniqueRegions.length})</option>
                  {uniqueRegions.map(reg => (
                    <option key={reg} value={reg}>{reg}</option>
                  ))}
                </select>

                {/* Center filter dropdown */}
                <select
                  value={filterCenter}
                  onChange={(e) => setFilterCenter(e.target.value)}
                  className="bg-white border border-[#E3DEC3] px-2 py-1 text-xs font-semibold rounded-xl text-stone-700 outline-hidden focus:ring-1 focus:ring-[#5A7060] cursor-pointer"
                >
                  <option value="">All Centers ({uniqueCenters.length})</option>
                  {uniqueCenters.map(cnt => (
                    <option key={cnt} value={cnt}>{cnt}</option>
                  ))}
                </select>

                {(filterRegion || filterCenter || searchTerm) && (
                  <button
                    onClick={() => {
                      setFilterRegion('');
                      setFilterCenter('');
                      setSearchTerm('');
                    }}
                    className="text-[10px] text-[#5A7060] font-bold hover:underline cursor-pointer"
                  >
                    Clear Filters
                  </button>
                )}
              </div>

              {/* Advanced Destructive Actions */}
              <div className="flex items-center gap-2 self-end sm:self-auto">
                {/* Delete Filtered Rows */}
                <button
                  onClick={handleDeleteFilteredMappings}
                  className="px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 font-bold text-[10px] rounded-xl flex items-center gap-1 transition cursor-pointer"
                  title="Delete all currently filtered configuration rows from the database"
                >
                  <Trash2 className="w-3 h-3 text-rose-600" />
                  <span>Delete Filtered ({filteredMappings.length})</span>
                </button>

                {/* Clear All Database Data */}
                <button
                  onClick={handleClearAllMappings}
                  className="px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 font-extrabold text-[10px] rounded-xl flex items-center gap-1 transition cursor-pointer shadow-xs"
                  title="Completely clear all mappings in the database"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear All DB ({roleMappings.length})</span>
                </button>
              </div>
            </div>

            {/* Direct Paste Area */}
            {showPasteBox && (
              <motion.div 
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[#FFFDFB] border border-[#217346]/30 rounded-2xl p-4 shadow-sm space-y-3"
              >
                <div className="flex justify-between items-center">
                  <h4 className="text-[11px] font-extrabold text-[#217346] uppercase tracking-wider flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4" /> Copy & Paste Directly from Excel / Google Sheets
                  </h4>
                  <button 
                    onClick={() => handleDownloadSampleCSV()}
                    className="text-[10px] font-bold text-[#5A7060] hover:underline"
                  >
                    Download Template
                  </button>
                </div>
                
                <p className="text-[10px] text-stone-500 leading-normal">
                  Copy rows from your spreadsheet containing the columns <code className="bg-stone-100 px-1 py-0.5 rounded text-stone-800">Region, center, building, regno, RAH Mailid, RFH MailID, CH Mailid, FH MailId, Mentor ID, Councellor ID</code> and paste them below:
                </p>

                <textarea
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  placeholder={`Region\tcenter\tbuilding\tregno\tRAH Mailid\tRFH MailID\tCH Mailid\tFH MailId\tMentor ID\tCouncellor ID\nPB + JK\tAnantnag VIdyapeeth\tAnantnag VIdyapeeth\t101\trahul@pw.live\tshivam@pw.live\tsimran@pw.live\tsumit@pw.live\tsimran@pw.live\tsumit@pw.live`}
                  rows={6}
                  className="w-full text-xs font-mono p-3 bg-white border border-stone-200 rounded-xl focus:ring-1 focus:ring-[#217346] focus:border-[#217346] outline-hidden"
                />

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setShowPasteBox(false); setPasteContent(''); }}
                    className="px-3 py-1.5 text-xs text-stone-500 hover:bg-stone-100 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBulkPasteImport}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-[#217346] hover:bg-[#1a5c38] rounded-xl flex items-center gap-1.5 shadow-sm"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Process & Sync pasted rows</span>
                  </button>
                </div>
              </motion.div>
            )}

            {/* Matrix Table */}
            <div className="border border-[#E3DEC3] rounded-2xl bg-[#FFFDFB] flex-1 overflow-x-auto shadow-xs">
              {isLoading ? (
                <div className="p-12 text-center text-xs text-stone-500 font-semibold flex flex-col items-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-stone-500 border-t-transparent" />
                  Loading Firestore master list...
                </div>
              ) : filteredMappings.length === 0 ? (
                <div className="p-12 text-center text-xs text-stone-400 font-medium flex flex-col items-center gap-2">
                  <ShieldAlert className="w-8 h-8 text-stone-300" />
                  No configurations mapped in database.
                  <p className="text-[10px] text-stone-400">All users will default to Central head access permissions.</p>
                </div>
              ) : (
                <div className="min-w-[1200px]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#FAF8F5] border-b border-[#E3DEC3] sticky top-0 text-stone-500 uppercase font-extrabold text-[9px] tracking-wider">
                        <th className="p-3 pl-4 w-28">Region</th>
                        <th className="p-3 w-40">Center</th>
                        <th className="p-3 w-40">Building</th>
                        <th className="p-3 w-16">Reg No</th>
                        <th className="p-3">RAH Mailid</th>
                        <th className="p-3">RFH MailID</th>
                        <th className="p-3">CH Mailid</th>
                        <th className="p-3">FH MailId</th>
                        <th className="p-3">Mentor ID</th>
                        <th className="p-3">Counselor ID</th>
                        <th className="p-3 text-center w-12 sticky right-0 bg-[#FAF8F5] shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.1)]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 text-[11px] font-sans">
                      {filteredMappings.map((mapping, idx) => {
                        // Check if any email matches activeEmail
                        const isActiveRow = 
                          activeEmail.toLowerCase().trim() === mapping.rahMailid?.toLowerCase().trim() ||
                          activeEmail.toLowerCase().trim() === mapping.rfhMailid?.toLowerCase().trim() ||
                          activeEmail.toLowerCase().trim() === mapping.chMailid?.toLowerCase().trim() ||
                          activeEmail.toLowerCase().trim() === mapping.fhMailid?.toLowerCase().trim() ||
                          activeEmail.toLowerCase().trim() === mapping.mentorId?.toLowerCase().trim() ||
                          activeEmail.toLowerCase().trim() === mapping.counselorId?.toLowerCase().trim();

                        return (
                          <tr 
                            key={`${mapping.region}_${mapping.center}_${mapping.building}_${mapping.regno}_${idx}`} 
                            className={`hover:bg-stone-50/60 transition ${isActiveRow ? 'bg-[#5A7060]/5 border-l-2 border-l-[#5A7060]' : ''}`}
                          >
                            {/* Region */}
                            <td className="p-3 pl-4 font-bold text-stone-800 truncate max-w-[110px]" title={mapping.region}>
                              {mapping.region}
                            </td>
                            {/* Center */}
                            <td className="p-3 font-semibold text-stone-700 truncate max-w-[150px]" title={mapping.center}>
                              {mapping.center}
                            </td>
                            {/* Building */}
                            <td className="p-3 text-stone-600 truncate max-w-[150px]" title={mapping.building}>
                              {mapping.building || '-'}
                            </td>
                            {/* Reg No */}
                            <td className="p-3 text-stone-600 font-mono font-bold">
                              {mapping.regno || '-'}
                            </td>
                            {/* RAH */}
                            <td className="p-3 truncate max-w-[130px]" title={mapping.rahMailid}>
                              {mapping.rahMailid ? (
                                <span className={`px-1.5 py-0.5 rounded font-medium ${activeEmail.toLowerCase().trim() === mapping.rahMailid.toLowerCase().trim() ? 'bg-amber-100 text-amber-800 font-bold border border-amber-300' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
                                  {mapping.rahMailid}
                                </span>
                              ) : <span className="text-stone-300">-</span>}
                            </td>
                            {/* RFH */}
                            <td className="p-3 truncate max-w-[130px]" title={mapping.rfhMailid}>
                              {mapping.rfhMailid ? (
                                <span className={`px-1.5 py-0.5 rounded font-medium ${activeEmail.toLowerCase().trim() === mapping.rfhMailid.toLowerCase().trim() ? 'bg-blue-100 text-blue-800 font-bold border border-blue-300' : 'bg-blue-50 text-blue-700 border border-blue-100'}`}>
                                  {mapping.rfhMailid}
                                </span>
                              ) : <span className="text-stone-300">-</span>}
                            </td>
                            {/* CH */}
                            <td className="p-3 truncate max-w-[130px]" title={mapping.chMailid}>
                              {mapping.chMailid ? (
                                <span className={`px-1.5 py-0.5 rounded font-medium ${activeEmail.toLowerCase().trim() === mapping.chMailid.toLowerCase().trim() ? 'bg-emerald-100 text-emerald-800 font-bold border border-emerald-300' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                                  {mapping.chMailid}
                                </span>
                              ) : <span className="text-stone-300">-</span>}
                            </td>
                            {/* FH */}
                            <td className="p-3 truncate max-w-[130px]" title={mapping.fhMailid}>
                              {mapping.fhMailid ? (
                                <span className={`px-1.5 py-0.5 rounded font-medium ${activeEmail.toLowerCase().trim() === mapping.fhMailid.toLowerCase().trim() ? 'bg-purple-100 text-purple-800 font-bold border border-purple-300' : 'bg-purple-50 text-purple-700 border border-purple-100'}`}>
                                  {mapping.fhMailid}
                                </span>
                              ) : <span className="text-stone-300">-</span>}
                            </td>
                            {/* Mentor */}
                            <td className="p-3 truncate max-w-[130px]" title={mapping.mentorId}>
                              {mapping.mentorId ? (
                                <span className={`px-1.5 py-0.5 rounded font-medium ${activeEmail.toLowerCase().trim() === mapping.mentorId.toLowerCase().trim() ? 'bg-orange-100 text-orange-800 font-bold border border-orange-300' : 'bg-orange-50 text-orange-700 border border-orange-100'}`}>
                                  {mapping.mentorId}
                                </span>
                              ) : <span className="text-stone-300">-</span>}
                            </td>
                            {/* Counselor */}
                            <td className="p-3 truncate max-w-[130px]" title={mapping.counselorId}>
                              {mapping.counselorId ? (
                                <span className={`px-1.5 py-0.5 rounded font-medium ${activeEmail.toLowerCase().trim() === mapping.counselorId.toLowerCase().trim() ? 'bg-stone-100 text-stone-800 font-bold border border-stone-300' : 'bg-stone-50 text-stone-700 border border-stone-100'}`}>
                                  {mapping.counselorId}
                                </span>
                              ) : <span className="text-stone-300">-</span>}
                            </td>
                            {/* Actions */}
                            <td className="p-2 text-center sticky right-0 bg-[#FFFDFB] shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.1)]">
                              <button
                                onClick={() => handleDeleteMapping(mapping)}
                                className="p-1.5 text-stone-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition cursor-pointer"
                                title="Delete permission configuration row"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Helper Info footer */}
            <div className="bg-[#FAF8F5] border border-[#E3DEC3] rounded-2xl p-4 text-[11px] text-stone-600 flex gap-3 leading-relaxed">
              <Info className="w-4 h-4 text-[#5A7060] shrink-0 mt-0.5" />
              <div>
                <strong className="text-stone-800">Direct Paste Tutorial:</strong> You can copy cells directly from any Excel sheet or Google sheet and paste them using the <span className="text-[#217346] font-bold">Paste Sheet</span> button. The system handles tab-separated columns seamlessly and reconciles data formats automatically.
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#FAF8F5] border-t border-[#E3DEC3] flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-xl font-bold text-xs text-stone-700 transition cursor-pointer"
          >
            Close Settings
          </button>
        </div>
      </motion.div>
    </div>
  );
}
