'use client';

import { useState, useEffect } from 'react';
import { Target, Trash2, Plus, Pencil, Check, X, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { PLAN_LIMITS } from '@/lib/planLimits';
import type { PlanType } from '@/types/auth';

interface DomainEntry {
  domainId: string;
  domainName: string;
  verified: boolean;
}

interface Campaign {
  id: string;
  googleCampaignId: string;
  slotNumber: number;
  name: string | null;
  domainId: string;
  domainName: string;
  status: string;
  avgCpc: number;
}

interface WorkspaceData {
  tenantId: string;
  ownerEmail: string;
  role: 'editor' | 'visitor';
  domains: { domainId: string; domainName: string }[];
  campaigns: Campaign[];
  maxCampaigns: number;
  loading: boolean;
}

interface DeleteTarget {
  id: string;
  workspaceTenantId: string | null;
  name: string;
}

interface CampaignStepProps {
  onComplete: (campaigns: any[]) => void;
  onBack: () => void;
}

export function CampaignStep({ onComplete, onBack }: CampaignStepProps) {
  const { data: session } = useSession();

  // Own workspace
  const [ownDomains, setOwnDomains]           = useState<DomainEntry[]>([]);
  const [ownCampaigns, setOwnCampaigns]       = useState<Campaign[]>([]);
  const [ownMaxCampaigns, setOwnMaxCampaigns] = useState(3);

  // Invited workspaces
  const [invitedWorkspaces, setInvitedWorkspaces] = useState<WorkspaceData[]>([]);

  // Accordion: set of domainIds currently open
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Add campaign form
  const [addingFor, setAddingFor] = useState<{ domainId: string; workspaceTenantId: string | null } | null>(null);
  const [addId,     setAddId]     = useState('');
  const [addName,   setAddName]   = useState('');
  const [addCpc,    setAddCpc]    = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError,   setAddError]  = useState('');

  // Edit CPC
  const [editCpcId,        setEditCpcId]        = useState<string | null>(null);
  const [editCpcWorkspace, setEditCpcWorkspace] = useState<string | null>(null);
  const [editCpcValue,     setEditCpcValue]     = useState('');
  const [cpcSaving,        setCpcSaving]        = useState(false);
  const [cpcError,         setCpcError]         = useState('');

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState<DeleteTarget | null>(null);

  // Global fetch
  const [isFetching, setIsFetching] = useState(true);
  const [pageError,  setPageError]  = useState('');

  // Instructions accordion
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setIsFetching(true);
    try {
      const [domainsRes, campaignsRes] = await Promise.all([
        fetch('/api/domain'),
        fetch('/api/campaigns'),
      ]);
      if (domainsRes.ok) {
        const d = await domainsRes.json();
        setOwnDomains(d.domains ?? []);
      }
      if (campaignsRes.ok) {
        const c = await campaignsRes.json();
        setOwnCampaigns(c.campaigns ?? []);
        setOwnMaxCampaigns(c.maxAllowed ?? PLAN_LIMITS[((session?.user?.planType ?? 'starter') as PlanType)].campaignsPerDomain);
      }

      // Build invited workspace list from session
      const allAccessible = (session?.user?.allAccessibleDomains ?? []) as Array<{
        tenantId: string; domainId: string; domainName: string;
        role: string; tenantOwnerEmail: string;
      }>;
      const ownTenantId = session?.user?.tenantId;

      const tenantMap = new Map<string, { ownerEmail: string; role: 'editor' | 'visitor'; domains: { domainId: string; domainName: string }[] }>();
      for (const d of allAccessible) {
        if (d.tenantId === ownTenantId) continue;
        if (!tenantMap.has(d.tenantId)) {
          tenantMap.set(d.tenantId, { ownerEmail: d.tenantOwnerEmail, role: d.role as 'editor' | 'visitor', domains: [] });
        }
        tenantMap.get(d.tenantId)!.domains.push({ domainId: d.domainId, domainName: d.domainName });
      }

      const workspaces: WorkspaceData[] = Array.from(tenantMap.entries()).map(([tenantId, info]) => ({
        tenantId,
        ownerEmail: info.ownerEmail,
        role:       info.role,
        domains:    info.domains,
        campaigns:  [],
        maxCampaigns: 3,
        loading:    true,
      }));
      setInvitedWorkspaces(workspaces);

      // Fetch campaigns for each invited workspace in parallel
      await Promise.all(workspaces.map(async (ws) => {
        try {
          const res = await fetch(`/api/campaigns?workspace=${ws.tenantId}`);
          if (res.ok) {
            const data = await res.json();
            setInvitedWorkspaces(prev => prev.map(w =>
              w.tenantId === ws.tenantId
                ? { ...w, campaigns: data.campaigns ?? [], maxCampaigns: data.maxAllowed ?? PLAN_LIMITS['starter'].campaignsPerDomain, loading: false }
                : w
            ));
          } else {
            setInvitedWorkspaces(prev => prev.map(w => w.tenantId === ws.tenantId ? { ...w, loading: false } : w));
          }
        } catch {
          setInvitedWorkspaces(prev => prev.map(w => w.tenantId === ws.tenantId ? { ...w, loading: false } : w));
        }
      }));
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setIsFetching(false);
    }
  }

  function toggleExpand(domainId: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(domainId)) next.delete(domainId); else next.add(domainId);
      return next;
    });
  }

  function openAddForm(domainId: string, workspaceTenantId: string | null) {
    setAddingFor({ domainId, workspaceTenantId });
    setAddId(''); setAddName(''); setAddCpc(''); setAddError('');
    setExpanded(prev => new Set([...prev, domainId]));
  }

  async function handleAddCampaign() {
    if (!addingFor) return;
    setAddError('');
    const { domainId, workspaceTenantId } = addingFor;

    if (!addId.trim()) { setAddError('Campaign ID is required'); return; }
    if (!addCpc || parseFloat(addCpc) <= 0) { setAddError('Enter a valid CPC greater than £0'); return; }

    const maxC = workspaceTenantId
      ? (invitedWorkspaces.find(w => w.tenantId === workspaceTenantId)?.maxCampaigns ?? 3)
      : ownMaxCampaigns;
    const currentCount = workspaceTenantId
      ? (invitedWorkspaces.find(w => w.tenantId === workspaceTenantId)?.campaigns.filter(c => c.domainId === domainId).length ?? 0)
      : ownCampaigns.filter(c => c.domainId === domainId).length;
    if (currentCount >= maxC) { setAddError(`Campaign limit reached for this domain (${maxC} max)`); return; }

    setAddLoading(true);
    try {
      const body: Record<string, any> = {
        googleCampaignId: addId.trim(),
        avgCpc:           parseFloat(addCpc),
        domainId,
      };
      if (addName.trim())      body.name = addName.trim();
      if (workspaceTenantId)   body.workspaceTenantId = workspaceTenantId;

      const res  = await fetch('/api/campaigns', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error || 'Failed to register campaign'); return; }

      if (workspaceTenantId) {
        const ws     = invitedWorkspaces.find(w => w.tenantId === workspaceTenantId);
        const domain = ws?.domains.find(d => d.domainId === domainId);
        setInvitedWorkspaces(prev => prev.map(w =>
          w.tenantId === workspaceTenantId
            ? { ...w, campaigns: [...w.campaigns, { ...data.campaign, domainName: domain?.domainName ?? '' }] }
            : w
        ));
      } else {
        const domain = ownDomains.find(d => d.domainId === domainId);
        setOwnCampaigns(prev => [...prev, { ...data.campaign, domainName: domain?.domainName ?? '' }]);
      }
      setAddingFor(null);
    } catch {
      setAddError('Network error. Please try again.');
    } finally {
      setAddLoading(false);
    }
  }

  async function handleUpdateCpc() {
    if (!editCpcId) return;
    setCpcError('');
    const parsed = parseFloat(editCpcValue);
    if (isNaN(parsed) || parsed < 0.01 || parsed > 1000) {
      setCpcError('Enter a valid CPC between £0.01 and £1000'); return;
    }
    setCpcSaving(true);
    try {
      const body: Record<string, any> = { campaignId: editCpcId, avgCpc: parsed };
      if (editCpcWorkspace) body.workspaceTenantId = editCpcWorkspace;

      const res = await fetch('/api/campaigns', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (res.ok) {
        if (editCpcWorkspace) {
          setInvitedWorkspaces(prev => prev.map(w =>
            w.tenantId === editCpcWorkspace
              ? { ...w, campaigns: w.campaigns.map(c => c.id === editCpcId ? { ...c, avgCpc: parsed } : c) }
              : w
          ));
        } else {
          setOwnCampaigns(prev => prev.map(c => c.id === editCpcId ? { ...c, avgCpc: parsed } : c));
        }
        setEditCpcId(null); setEditCpcWorkspace(null); setEditCpcValue('');
      } else {
        const d = await res.json();
        setCpcError(d.error || 'Failed to update CPC');
      }
    } catch {
      setCpcError('Network error. Please try again.');
    } finally {
      setCpcSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const { id, workspaceTenantId } = confirmDelete;
    const url = workspaceTenantId
      ? `/api/campaigns?id=${id}&workspace=${workspaceTenantId}`
      : `/api/campaigns?id=${id}`;
    setPageError('');
    try {
      const res = await fetch(url, { method: 'DELETE' });
      if (res.ok) {
        if (workspaceTenantId) {
          setInvitedWorkspaces(prev => prev.map(w =>
            w.tenantId === workspaceTenantId
              ? { ...w, campaigns: w.campaigns.filter(c => c.id !== id) }
              : w
          ));
        } else {
          setOwnCampaigns(prev => prev.filter(c => c.id !== id));
        }
      } else {
        // e.g. a revoked/downgraded member — surface the server's reason instead
        // of silently closing the modal with no visible effect.
        const data = await res.json().catch(() => ({}));
        setPageError(data.error || 'You no longer have access to remove this campaign.');
      }
    } catch (err) {
      console.error('Failed to delete campaign:', err);
      setPageError('Network error. Please try again.');
    } finally {
      setConfirmDelete(null);
    }
  }

  const handleContinue = () => {
    onComplete(ownCampaigns);
  };

  // ---------------------------------------------------------------------------
  // Domain accordion renderer (shared between own and invited sections)
  // ---------------------------------------------------------------------------
  function renderDomain(
    domain: { domainId: string; domainName: string },
    domainCampaigns: Campaign[],
    maxCampaigns: number,
    isReadOnly: boolean,
    workspaceTenantId: string | null,
  ) {
    const isOpen       = expanded.has(domain.domainId);
    const count        = domainCampaigns.length;
    const atLimit      = count >= maxCampaigns;
    const isAddingHere = addingFor?.domainId === domain.domainId && addingFor?.workspaceTenantId === workspaceTenantId;

    return (
      <div key={domain.domainId} className="border border-gray-200 rounded-lg overflow-hidden mb-3">
        {/* Header */}
        <button
          type="button"
          onClick={() => toggleExpand(domain.domainId)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        >
          <span className="text-sm font-semibold text-gray-700">{domain.domainName}</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">{count}/{maxCampaigns} campaigns</span>
            {isOpen
              ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
              : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
          </div>
        </button>

        {/* Body */}
        {isOpen && (
          <div className="p-4 space-y-3 bg-white">
            {domainCampaigns.length === 0 && (
              <p className="text-sm text-gray-400 italic">No campaigns yet</p>
            )}

            {domainCampaigns.map(campaign => (
              <div key={campaign.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {campaign.name ?? `Campaign ${campaign.slotNumber}`}
                    </p>
                    <p className="text-xs text-gray-500">ID: {campaign.googleCampaignId}</p>
                  </div>
                  {!isReadOnly && (
                    <button
                      onClick={() => setConfirmDelete({ id: campaign.id, workspaceTenantId, name: campaign.name ?? `Campaign ${campaign.slotNumber}` })}
                      className="flex-shrink-0 text-red-400 hover:text-red-600 p-1 transition-colors"
                      title="Remove campaign"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {editCpcId === campaign.id ? (
                  <div className="mt-2">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-2 text-gray-500 text-sm">£</span>
                        <input
                          type="number" step="0.01" min="0.01" max="1000"
                          value={editCpcValue}
                          onChange={e => { if (/^\d*\.?\d{0,2}$/.test(e.target.value)) setEditCpcValue(e.target.value); }}
                          className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          autoFocus disabled={cpcSaving}
                        />
                      </div>
                      <button onClick={handleUpdateCpc} disabled={cpcSaving || !editCpcValue}
                        className="p-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg" title="Save">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => { setEditCpcId(null); setEditCpcWorkspace(null); setEditCpcValue(''); setCpcError(''); }}
                        disabled={cpcSaving} className="p-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg" title="Cancel">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {cpcError && <p className="mt-1 text-xs text-red-600">{cpcError}</p>}
                  </div>
                ) : (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">
                      Avg. CPC: {campaign.avgCpc ? `£${campaign.avgCpc.toFixed(2)}` : 'Not set'}
                    </span>
                    {!isReadOnly && (
                      <button
                        onClick={() => {
                          setEditCpcId(campaign.id);
                          setEditCpcWorkspace(workspaceTenantId);
                          setEditCpcValue(campaign.avgCpc ? campaign.avgCpc.toString() : '');
                          setCpcError('');
                        }}
                        className="text-blue-500 hover:text-blue-700 p-0.5 transition-colors" title="Edit CPC"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Add campaign form / button */}
            {!isReadOnly && !atLimit && (
              isAddingHere ? (
                <div className="border border-green-200 rounded-lg p-3 bg-green-50 space-y-2">
                  <input
                    type="text" placeholder="Campaign name (optional)" value={addName}
                    onChange={e => setAddName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                    disabled={addLoading}
                  />
                  <input
                    type="text" placeholder="Google Ads Campaign ID *" value={addId}
                    onChange={e => setAddId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                    disabled={addLoading}
                  />
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-500 text-sm">£</span>
                    <input
                      type="number" step="0.01" min="0.01" max="1000" placeholder="Avg. CPC *"
                      value={addCpc}
                      onChange={e => { if (/^\d*\.?\d{0,2}$/.test(e.target.value)) setAddCpc(e.target.value); }}
                      className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                      disabled={addLoading}
                    />
                  </div>
                  {addError && <p className="text-xs text-red-600">{addError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button" onClick={handleAddCampaign}
                      disabled={addLoading || !addId.trim() || !addCpc}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {addLoading ? 'Adding…' : 'Add campaign'}
                    </button>
                    <button
                      type="button" onClick={() => setAddingFor(null)} disabled={addLoading}
                      className="px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-600 text-xs font-medium rounded-lg border border-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openAddForm(domain.domainId, workspaceTenantId)}
                  className="flex items-center gap-1.5 text-xs text-green-700 hover:text-green-900 font-medium transition-colors py-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add campaign to {domain.domainName}
                </button>
              )
            )}

            {!isReadOnly && atLimit && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                Campaign limit reached ({maxCampaigns} max).
                {workspaceTenantId ? ' The workspace owner needs to upgrade their plan.' : ' Upgrade your plan to add more.'}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  const canContinue = !isFetching && (ownDomains.length > 0 || invitedWorkspaces.length > 0);

  return (
    <>
      <div className="bg-white rounded-lg shadow-lg p-8 relative">
        {/* Loading overlay */}
        {isFetching && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-lg flex items-center justify-center z-10">
            <div className="text-center">
              <svg className="animate-spin h-12 w-12 text-green-600 mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-gray-600 font-medium">Loading campaigns…</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
            <Target className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Campaigns</h2>
            <p className="text-gray-600 mt-1">Register your Google Ads campaigns per domain</p>
          </div>
        </div>

        {/* Collapsible instructions */}
        <div className="mb-6 border border-blue-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setInstructionsOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-3 bg-blue-50 hover:bg-blue-100 transition-colors text-left"
          >
            <span className="text-sm font-semibold text-blue-900">📋 How to find your Campaign ID in Google Ads</span>
            {instructionsOpen
              ? <ChevronUp className="w-4 h-4 text-blue-600 flex-shrink-0" />
              : <ChevronDown className="w-4 h-4 text-blue-600 flex-shrink-0" />}
          </button>
          {instructionsOpen && (
            <div className="px-5 py-4 bg-blue-50 border-t border-blue-200">
              <ol className="text-sm text-blue-800 space-y-3 list-none">
                <li className="flex gap-2">
                  <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center font-bold">1</span>
                  <span>Go to <strong>ads.google.com</strong> and sign in to your account.</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center font-bold">2</span>
                  <span>In the left sidebar, click <strong>Campaigns</strong> then select <strong>Campaigns</strong> from the submenu.</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center font-bold">3</span>
                  <span>
                    The Campaign ID column is <strong>hidden by default</strong>. To add it:
                    <ol className="mt-1.5 ml-1 space-y-1 list-none">
                      <li className="flex gap-1.5 text-blue-700"><span>→</span><span>Click the <strong>columns icon</strong> at the top right of the table.</span></li>
                      <li className="flex gap-1.5 text-blue-700"><span>→</span><span>Click <strong>"Modify columns"</strong>.</span></li>
                      <li className="flex gap-1.5 text-blue-700"><span>→</span><span>Search <strong>"Campaign ID"</strong> and add it.</span></li>
                      <li className="flex gap-1.5 text-blue-700"><span>→</span><span>Click <strong>"Apply"</strong>.</span></li>
                    </ol>
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center font-bold">4</span>
                  <span>Copy the full number next to your campaign — typically 8–13 digits (e.g., <span className="font-mono bg-blue-100 px-1 rounded">23698216554</span>).</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center font-bold">5</span>
                  <span>Also note your <strong>Avg. CPC</strong> — add it via Modify columns → search "Avg. CPC".</span>
                </li>
              </ol>
            </div>
          )}
        </div>

        {/* ── Own domains section ─────────────────────────────────────────── */}
        {ownDomains.length > 0 && (
          <div className="mb-8">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Your domains
            </h3>
            {ownDomains.map(domain =>
              renderDomain(
                domain,
                ownCampaigns.filter(c => c.domainId === domain.domainId),
                ownMaxCampaigns,
                false,
                null,
              )
            )}
          </div>
        )}

        {/* ── Invited workspaces section ──────────────────────────────────── */}
        {invitedWorkspaces.length > 0 && (
          <div className="mb-8">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Invited workspaces
            </h3>
            {invitedWorkspaces.map(ws => (
              <div key={ws.tenantId} className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-gray-700">{ws.ownerEmail}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    ws.role === 'editor' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {ws.role === 'editor' ? 'Editor' : 'Viewer'}
                  </span>
                </div>
                {ws.loading ? (
                  <div className="h-12 bg-gray-50 rounded-lg animate-pulse" />
                ) : (
                  ws.domains.map(domain =>
                    renderDomain(
                      domain,
                      ws.campaigns.filter(c => c.domainId === domain.domainId),
                      ws.maxCampaigns,
                      ws.role === 'visitor',
                      ws.tenantId,
                    )
                  )
                )}
              </div>
            ))}
          </div>
        )}

        {pageError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-red-600">{pageError}</p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-4 mt-2">
          <button onClick={onBack} disabled={isFetching}
            className="flex-1 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-300 text-gray-700 font-semibold py-3 px-6 rounded-lg transition-colors">
            ← Back
          </button>
          <button onClick={handleContinue} disabled={!canContinue || isFetching}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors">
            Continue to Setup →
          </button>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-8">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-100 mx-auto mb-5">
              <Trash2 className="w-7 h-7 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 text-center mb-2">Remove campaign?</h2>
            <p className="text-sm text-gray-600 text-center mb-6">
              <strong>{confirmDelete.name}</strong> will be removed along with all its tracking history.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors">
                <Trash2 className="w-4 h-4" />
                Yes, remove it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
