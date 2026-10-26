import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardStatCard from "@/components/dashboard/DashboardStatCard";
import LeadsViewTabs, { LeadsViewMode } from "@/components/leads/LeadsViewTabs";
import LeadsListView from "@/components/leads/LeadsListView";
import LeadsTableView from "@/components/leads/LeadsTableView";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, SlidersHorizontal, Search, Calendar as CalendarIcon, Users2, Phone, Target, ShoppingBag, Wallet, RefreshCcw, MoreVertical } from "lucide-react";
import { format, subDays, parseISO } from "date-fns";
import { toast } from "sonner";
import { useUserRoles } from "@/hooks/useUserRoles";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import LeadColumn from "@/components/LeadColumn";
import LeadCard from "@/components/LeadCard";
import LeadDetailsDialog from "@/components/LeadDetailsDialog";
import StageManagement from "@/components/StageManagement";
import SortableStageColumn from "@/components/SortableStageColumn";
import AddStageColumn from "@/components/AddStageColumn";
import { StageChangeDialog } from "@/components/StageChangeDialog";
import { SoldOrderDialog } from "@/components/SoldOrderDialog";
import { LEAD_SOURCE_OPTIONS } from "@/lib/leadDisplay";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LEAD_TYPE_OPTIONS = ["Yangi lid", "Baza"];

const TIME_FILTER_OPTIONS = [
  { value: "all", label: "Barchasi" },
  { value: "daily", label: "Bugun" },
  { value: "1week", label: "1 haftalik" },
  { value: "10days", label: "10 kunlik" },
  { value: "20days", label: "20 kunlik" },
  { value: "monthly", label: "Oylik" },
  { value: "yearly", label: "Yillik" },
];

// Returns null (not a sentinel 100%) when there's no previous-period baseline
// to compare against — a "growth rate from zero" isn't a real percentage.
const pctChange = (current: number, previous: number): number | null => {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
};

const Leads = () => {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterLeadType, setFilterLeadType] = useState<string>("all");
  const [filterTimeRange, setFilterTimeRange] = useState<string>("all");
  const [filterSeller, setFilterSeller] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [startDateFilter, setStartDateFilter] = useState<Date | undefined>(undefined);
  const [endDateFilter, setEndDateFilter] = useState<Date | undefined>(undefined);
  const [sellers, setSellers] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<LeadsViewMode>("kanban");
  const { isAdminOrRop } = useUserRoles();
  const [activeLead, setActiveLead] = useState<any>(null);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const filtersRowRef = useRef<HTMLDivElement>(null);
  const [kanbanColHeight, setKanbanColHeight] = useState<number | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [isPanningBoard, setIsPanningBoard] = useState(false);
  const panStateRef = useRef({ startX: 0, scrollLeft: 0 });
  const [pendingStageChange, setPendingStageChange] = useState<{
    leadId: string;
    leadName: string;
    newStageId: string;
    newStageName: string;
    sellerId: string;
  } | null>(null);
  const [pendingSoldOrder, setPendingSoldOrder] = useState<{ lead: any; newStageId: string } | null>(null);

  // Stages where a drag/select change skips the mandatory comment dialog.
  // "Sotildi" goes through SoldOrderDialog instead (see below), which collects
  // order details and sends the Telegram notification in that same step.
  // Matched by name since stage ids are generated per-environment.
  const EXEMPT_STAGE_NAMES = ["Sotildi"];

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const { user } = useAuth();
  const currentUserId = user?.id || "";

  // New leads default to the "Muhim" stage, looked up by name once stages are loaded.
  const muhimStage = stages.find((s) => s.name === "Muhim");

  const [formData, setFormData] = useState({
    customer_name: "",
    customer_phone: "",
    employee: "",
    lead_type: "Yangi lid",
    activity: "",
    notes: "",
    stage: "",
    source: "",
  });

  useEffect(() => {
    fetchLeads();
    fetchSellers();
    fetchStages();
  }, []);

  useEffect(() => {
    if (muhimStage && !formData.stage) {
      setFormData((prev) => ({ ...prev, stage: muhimStage.id }));
    }
  }, [muhimStage]);

  // Kanban columns size themselves to whatever vertical space is actually left below the
  // filters row, instead of a fixed guess — keeps all cards reachable without the column
  // cutting off before the real viewport edge whenever the filters row wraps to extra lines.
  useLayoutEffect(() => {
    if (viewMode !== "kanban") return;
    const filtersEl = filtersRowRef.current;
    if (!filtersEl) return;

    const MAIN_BOTTOM_PADDING = 64; // <main> py-8 + the board's own pb-4, plus a little breathing room

    const recompute = () => {
      const bottom = filtersEl.getBoundingClientRect().bottom;
      const available = window.innerHeight - bottom - MAIN_BOTTOM_PADDING;
      setKanbanColHeight(Math.max(available, 280));
    };

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(filtersEl);
    window.addEventListener("resize", recompute);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [viewMode]);

  // Lets users click-and-drag empty board space (not a card or a column's drag
  // handle — those stay owned by dnd-kit) to pan the Kanban board horizontally,
  // like a scrollable canvas, instead of requiring the scrollbar/trackpad.
  const handleBoardMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest(".cursor-grab") || target.closest("[data-sortable-lead]")) return;
    const board = boardRef.current;
    if (!board) return;
    panStateRef.current = { startX: e.clientX, scrollLeft: board.scrollLeft };
    setIsPanningBoard(true);
  };

  useEffect(() => {
    if (!isPanningBoard) return;
    const board = boardRef.current;
    if (!board) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      board.scrollLeft = panStateRef.current.scrollLeft - (e.clientX - panStateRef.current.startX);
    };
    const stopPanning = () => setIsPanningBoard(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopPanning);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopPanning);
    };
  }, [isPanningBoard]);

  // Handle opening specific lead from URL parameter
  useEffect(() => {
    const openLeadId = searchParams.get('openLead');
    if (openLeadId && leads.length > 0) {
      const leadToOpen = leads.find(l => l.id === openLeadId);
      if (leadToOpen) {
        setSelectedLead(leadToOpen);
        setDetailsDialogOpen(true);
        // Clear the URL parameter after opening
        searchParams.delete('openLead');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [leads, searchParams, setSearchParams]);

  const fetchLeads = async () => {
    try {
      const data = await api.leads.list();
      setLeads(data.sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1)));
    } catch (error) {
      console.error("Error fetching leads:", error);
      toast.error("Lidlarni yuklashda xato");
    } finally {
      setLoading(false);
    }
  };

  const fetchSellers = async () => {
    try {
      const data = await api.profiles.list();
      setSellers(data.sort((a: any, b: any) => a.full_name.localeCompare(b.full_name)));
    } catch (error) {
      console.error("Error fetching sellers:", error);
    }
  };

  const fetchStages = async () => {
    try {
      const data = await api.stages.list();
      setStages(data.sort((a: any, b: any) => a.display_order - b.display_order));
    } catch (error) {
      console.error("Error fetching stages:", error);
    }
  };

  // Leads enriched with the seller's name, the way the old Supabase embedded select used to shape them.
  const leadsWithProfiles = leads.map((l) => ({
    ...l,
    profiles: { full_name: sellers.find((s) => s.id === l.seller_id)?.full_name },
  }));

  const getFilteredLeads = () => {
    let filtered = [...leadsWithProfiles];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(lead =>
        lead.customer_name?.toLowerCase().includes(query) ||
        lead.customer_phone?.toLowerCase().includes(query) ||
        lead.customer_email?.toLowerCase().includes(query) ||
        lead.employee?.toLowerCase().includes(query) ||
        lead.notes?.toLowerCase().includes(query) ||
        lead.activity?.toLowerCase().includes(query) ||
        lead.lead_type?.toLowerCase().includes(query)
      );
    }

    if (filterLeadType !== "all") {
      filtered = filtered.filter(lead => lead.lead_type === filterLeadType);
    }

    if (filterSource !== "all") {
      filtered = filtered.filter(lead => lead.source === filterSource);
    }

    if (filterTimeRange !== "all") {
      const now = new Date();
      let startDate = new Date();

      switch (filterTimeRange) {
        case "daily": {
          // Sellers go home around 19:00 and don't pick leads back up until
          // the next morning, so "Bugun" means the current business day —
          // yesterday 19:00 through today 19:00 — not calendar midnight.
          const boundary = new Date(now);
          boundary.setHours(19, 0, 0, 0);
          if (now < boundary) boundary.setDate(boundary.getDate() - 1);
          startDate = boundary;
          break;
        }
        case "1week":
          startDate.setDate(now.getDate() - 7);
          break;
        case "10days":
          startDate.setDate(now.getDate() - 10);
          break;
        case "20days":
          startDate.setDate(now.getDate() - 20);
          break;
        case "monthly":
          startDate.setMonth(now.getMonth() - 1);
          break;
        case "yearly":
          startDate.setFullYear(now.getFullYear() - 1);
          break;
      }

      filtered = filtered.filter(lead => new Date(lead.created_at) >= startDate);
    }

    // Custom date range filter
    if (startDateFilter) {
      const start = new Date(startDateFilter);
      start.setHours(0, 0, 0, 0);
      filtered = filtered.filter(lead => new Date(lead.created_at) >= start);
    }

    if (endDateFilter) {
      const end = new Date(endDateFilter);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter(lead => new Date(lead.created_at) <= end);
    }

    // Seller filter
    if (filterSeller !== "all") {
      filtered = filtered.filter(lead => lead.seller_id === filterSeller);
    }

    return filtered;
  };

  const filteredLeads = useMemo(getFilteredLeads, [
    leadsWithProfiles,
    searchQuery,
    filterLeadType,
    filterSource,
    filterTimeRange,
    startDateFilter,
    endDateFilter,
    filterSeller,
  ]);

  const getLeadsByStage = (stage: string) => {
    return filteredLeads.filter(lead => lead.stage === stage);
  };

  // --- Summary stats -------------------------------------------------
  const soldStage = stages.find((s) => s.name === "Sotildi");
  const firstStage = stages[0];
  const soldIndex = soldStage ? stages.findIndex((s) => s.id === soldStage.id) : -1;
  const closeStage = soldIndex > 0 ? stages[soldIndex - 1] : undefined;

  const weekAgo = subDays(new Date(), 7);
  const twoWeeksAgo = subDays(new Date(), 14);
  const inLastWeek = (l: any) => {
    const d = parseISO(l.created_at);
    return d >= weekAgo;
  };
  const inPrevWeek = (l: any) => {
    const d = parseISO(l.created_at);
    return d >= twoWeeksAgo && d < weekAgo;
  };

  const newCount = firstStage ? filteredLeads.filter((l) => l.stage === firstStage.id).length : 0;
  const closeCount = closeStage ? filteredLeads.filter((l) => l.stage === closeStage.id).length : 0;
  const soldCount = soldStage ? filteredLeads.filter((l) => l.stage === soldStage.id).length : 0;
  const potentialRevenue = filteredLeads
    .filter((l) => l.stage !== soldStage?.id)
    .reduce((sum, l) => sum + (Number(l.price) || 0), 0);

  const totalTrend = pctChange(filteredLeads.filter(inLastWeek).length, filteredLeads.filter(inPrevWeek).length);
  const newTrend = pctChange(
    filteredLeads.filter((l) => l.stage === firstStage?.id && inLastWeek(l)).length,
    filteredLeads.filter((l) => l.stage === firstStage?.id && inPrevWeek(l)).length,
  );
  const closeTrend = pctChange(
    filteredLeads.filter((l) => l.stage === closeStage?.id && inLastWeek(l)).length,
    filteredLeads.filter((l) => l.stage === closeStage?.id && inPrevWeek(l)).length,
  );
  const soldTrend = pctChange(
    filteredLeads.filter((l) => l.stage === soldStage?.id && inLastWeek(l)).length,
    filteredLeads.filter((l) => l.stage === soldStage?.id && inPrevWeek(l)).length,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // For sellers, auto-assign to themselves
    const employeeId = isAdminOrRop ? formData.employee : currentUserId;

    if (!employeeId) {
      toast.error("Iltimos, xodimni tanlang");
      return;
    }

    try {
      await api.leads.create({
        seller_id: employeeId,
        customer_name: formData.customer_name,
        customer_phone: formData.customer_phone,
        employee: sellers.find(s => s.id === employeeId)?.full_name || "",
        lead_type: formData.lead_type,
        notes: formData.notes || null,
        activity: formData.activity || null,
        stage: formData.stage,
        source: formData.source || null,
      });

      toast.success("Lid muvaffaqiyatli qo'shildi!");
      setDialogOpen(false);
      setFormData({
        customer_name: "",
        customer_phone: "",
        employee: "",
        lead_type: "Yangi lid",
        activity: "",
        notes: "",
        stage: muhimStage?.id || "",
        source: "",
      });
      fetchLeads();
    } catch (error) {
      console.error("Error creating lead:", error);
      toast.error(error instanceof ApiError ? error.message : "Lid qo'shishda xato");
    }
  };

  const openAddLeadDialog = (stageId?: string) => {
    setFormData((prev) => ({ ...prev, stage: stageId || muhimStage?.id || prev.stage }));
    setDialogOpen(true);
  };

  const handleStageDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = stages.findIndex((s) => s.id === active.id);
    const newIndex = stages.findIndex((s) => s.id === over.id);

    const newStages = arrayMove(stages, oldIndex, newIndex);
    setStages(newStages);

    // Update display order in database
    try {
      const updates = newStages.map((stage, index) => ({
        id: stage.id,
        display_order: index + 1
      }));

      for (const update of updates) {
        await api.stages.update(update.id, { display_order: update.display_order });
      }

      toast.success("Bosqichlar tartibi yangilandi!");
    } catch (error) {
      console.error("Error updating stage order:", error);
      toast.error("Bosqichlar tartibini yangilashda xato");
      fetchStages(); // Revert on error
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const lead = leads.find(l => l.id === event.active.id);
    setActiveLead(lead);
  };

  // The drop target can be the column's own droppable zone (over.id is a stage id,
  // e.g. dropping on empty space) or another card being hovered (over.id is a lead
  // id, e.g. dropping near a card inside a different column) — resolve either to
  // the destination stage.
  const resolveDropStageId = (overId: string) => {
    if (stages.some((s) => s.id === overId)) return overId;
    return leads.find((l) => l.id === overId)?.stage;
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveLead(null);

    if (!over) return;

    const leadId = active.id as string;
    const newStageId = resolveDropStageId(over.id as string);
    if (!newStageId) return;

    const lead = leads.find(l => l.id === leadId);
    if (!lead || lead.stage === newStageId) return;

    const newStage = stages.find(s => s.id === newStageId);

    // Check if exempt stage
    if (EXEMPT_STAGE_NAMES.includes(newStage?.name || "")) {
      // "Sotildi": collect order details (and send the Telegram notification)
      // in the same step, instead of applying the stage change right away.
      setPendingSoldOrder({ lead, newStageId });
    } else {
      // Open dialog for mandatory comment and task
      setPendingStageChange({
        leadId: lead.id,
        leadName: lead.customer_name,
        newStageId: newStageId,
        newStageName: newStage?.name || "",
        sellerId: lead.seller_id,
      });
    }
  };

  // Stage columns and lead cards now share one DndContext (see render below) so a
  // card can be dropped into a different column, not just reordered within its own —
  // dispatch to whichever drag this is by checking what active.id belongs to.
  const handleBoardDragEnd = (event: DragEndEvent) => {
    if (stages.some((s) => s.id === event.active.id)) {
      return handleStageDragEnd(event);
    }
    return handleDragEnd(event);
  };

  const handleStageChange = async (leadId: string, newStageId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead || lead.stage === newStageId) return;

    const newStage = stages.find(s => s.id === newStageId);

    // Check if exempt stage
    if (EXEMPT_STAGE_NAMES.includes(newStage?.name || "")) {
      setPendingSoldOrder({ lead, newStageId });
    } else {
      // Open dialog for mandatory comment and task
      setPendingStageChange({
        leadId: lead.id,
        leadName: lead.customer_name,
        newStageId: newStageId,
        newStageName: newStage?.name || "",
        sellerId: lead.seller_id,
      });
    }
  };

  const hasCustomDateFilter = !!startDateFilter || !!endDateFilter;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-64">
          <div className="text-lg">Yuklanmoqda...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Lidlar Voronkasi</h1>
          <p className="text-sm text-muted-foreground sm:text-base">Lidlarni boshqarish va kuzatish</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => openAddLeadDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Yangi lid
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Yangi lid qo'shish</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="customer_name">Mijoz ismi *</Label>
                  <Input
                    id="customer_name"
                    value={formData.customer_name}
                    onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="customer_phone">Telefon raqami *</Label>
                  <Input
                    id="customer_phone"
                    value={formData.customer_phone}
                    onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {isAdminOrRop ? (
                  <div>
                    <Label htmlFor="employee">Xodim *</Label>
                    <Select
                      value={formData.employee}
                      onValueChange={(value) => setFormData({ ...formData, employee: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Xodimni tanlang" />
                      </SelectTrigger>
                      <SelectContent>
                        {sellers.map((seller) => (
                          <SelectItem key={seller.id} value={seller.id}>
                            {seller.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <Label>Xodim</Label>
                    <Input
                      value={sellers.find(s => s.id === currentUserId)?.full_name || "Siz"}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                )}

                <div>
                  <Label htmlFor="lead_type">Lead turi *</Label>
                  <Select
                    value={formData.lead_type}
                    onValueChange={(value) => setFormData({ ...formData, lead_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_TYPE_OPTIONS.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="stage">Bosqich</Label>
                  <Select
                    value={formData.stage}
                    onValueChange={(value) => setFormData({ ...formData, stage: value })}
                  >
                    <SelectTrigger>
                      <SelectValue>
                        {(() => {
                          const currentStage = stages.find(s => s.id === formData.stage);
                          return currentStage ? (
                            <div className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full ${currentStage.color}`} />
                              {currentStage.name}
                            </div>
                          ) : "Muhim";
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${stage.color}`} />
                            {stage.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="source">Qayerdan? *</Label>
                  <Select
                    value={formData.source}
                    onValueChange={(value) => setFormData({ ...formData, source: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Manbani tanlang" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_SOURCE_OPTIONS.map((source) => (
                        <SelectItem key={source} value={source}>
                          {source}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="activity">Faoliyat turi</Label>
                <Input
                  id="activity"
                  type="text"
                  value={formData.activity}
                  onChange={(e) => setFormData({ ...formData, activity: e.target.value })}
                  placeholder="Masalan: Konsultatsiya, Savdo"
                />
              </div>

              <div>
                <Label htmlFor="notes">Izoh</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Bekor qilish
                </Button>
                <Button type="submit">Saqlash</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <DashboardStatCard
          id="leads-total"
          title="Jami lidlar"
          value={String(filteredLeads.length)}
          description="O'tgan haftaga nisbatan"
          icon={Users2}
          iconClassName="bg-blue-500/10 text-blue-600"
          trend={totalTrend !== null ? { value: totalTrend, isPositive: totalTrend >= 0 } : undefined}
          sparkline={[]}
          sparklineColor="#3b82f6"
        />
        <DashboardStatCard
          id="leads-new"
          title="Yangi lidlar"
          value={String(newCount)}
          description={firstStage ? `${firstStage.name} bosqichida` : "Joriy hafta"}
          icon={Phone}
          iconClassName="bg-teal-500/10 text-teal-600"
          trend={newTrend !== null ? { value: newTrend, isPositive: newTrend >= 0 } : undefined}
          sparkline={[]}
          sparklineColor="#14b8a6"
        />
        <DashboardStatCard
          id="leads-close"
          title="Sotuvga yaqin"
          value={String(closeCount)}
          description={closeStage ? `${closeStage.name} bosqichida` : "Ma'lumot berildi bosqichida"}
          icon={Target}
          iconClassName="bg-rose-500/10 text-rose-600"
          trend={closeTrend !== null ? { value: closeTrend, isPositive: closeTrend >= 0 } : undefined}
          sparkline={[]}
          sparklineColor="#f43f5e"
        />
        <DashboardStatCard
          id="leads-sold"
          title="Sotilgan"
          value={String(soldCount)}
          description="Joriy haftada"
          icon={ShoppingBag}
          iconClassName="bg-green-500/10 text-green-600"
          trend={soldTrend !== null ? { value: soldTrend, isPositive: soldTrend >= 0 } : undefined}
          sparkline={[]}
          sparklineColor="#22c55e"
        />
        <DashboardStatCard
          id="leads-potential"
          title="Potensial daromad"
          value={`${potentialRevenue.toLocaleString()} so'm`}
          description="Barcha faol lidlar bo'yicha"
          icon={Wallet}
          iconClassName="bg-slate-500/10 text-slate-600"
          sparkline={[]}
          sparklineColor="#64748b"
        />
      </div>

      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Mijoz, telefon, email yoki izoh bo'yicha qidirish..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div ref={filtersRowRef} className="mb-6 flex flex-wrap items-center gap-2">
        <LeadsViewTabs value={viewMode} onChange={setViewMode} />

        {isAdminOrRop && (
          <Select value={filterSeller} onValueChange={setFilterSeller}>
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue placeholder="Barcha sotuvchilar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha sotuvchilar</SelectItem>
              {sellers.map((seller) => (
                <SelectItem key={seller.id} value={seller.id}>
                  {seller.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={filterSource} onValueChange={setFilterSource}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="Barcha manbalar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha manbalar</SelectItem>
            {LEAD_SOURCE_OPTIONS.map((source) => (
              <SelectItem key={source} value={source}>
                {source}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterLeadType} onValueChange={setFilterLeadType}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue placeholder="Barcha lidlar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha lidlar</SelectItem>
            {LEAD_TYPE_OPTIONS.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterTimeRange} onValueChange={(value) => {
          setFilterTimeRange(value);
          if (value !== "all") {
            setStartDateFilter(undefined);
            setEndDateFilter(undefined);
          }
        }}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="Yaratilgan sana" />
          </SelectTrigger>
          <SelectContent>
            {TIME_FILTER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={`h-9 gap-1.5 ${hasCustomDateFilter ? "border-primary text-primary" : ""}`}>
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filtrlar
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto space-y-3 p-4" align="start">
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">Boshlanish sanasi</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start gap-2 font-normal">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {startDateFilter ? format(startDateFilter, "dd.MM.yyyy") : "Tanlash"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDateFilter}
                    onSelect={(date) => {
                      setStartDateFilter(date);
                      setFilterTimeRange("all");
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">Tugash sanasi</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start gap-2 font-normal">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {endDateFilter ? format(endDateFilter, "dd.MM.yyyy") : "Tanlash"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDateFilter}
                    onSelect={(date) => {
                      setEndDateFilter(date);
                      setFilterTimeRange("all");
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {hasCustomDateFilter && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  setStartDateFilter(undefined);
                  setEndDateFilter(undefined);
                }}
              >
                Tozalash
              </Button>
            )}
          </PopoverContent>
        </Popover>

        {isAdminOrRop && <StageManagement onUpdate={fetchStages} />}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-9 w-9">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => fetchLeads()}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Yangilash
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {viewMode === "kanban" && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleBoardDragEnd}
        >
          <SortableContext items={stages.map(s => s.id)} strategy={horizontalListSortingStrategy}>
            <div
              ref={boardRef}
              className={`flex gap-4 overflow-x-auto pb-4 ${isPanningBoard ? "cursor-grabbing select-none" : "cursor-grab"}`}
              style={kanbanColHeight ? ({ "--kanban-col-h": `${kanbanColHeight}px` } as React.CSSProperties) : undefined}
              onMouseDown={handleBoardMouseDown}
            >
              {stages.map((stage) => (
                <SortableStageColumn
                  key={stage.id}
                  stage={stage}
                  leads={getLeadsByStage(stage.id)}
                  onLeadClick={(lead) => {
                    setSelectedLead(lead);
                    setDetailsDialogOpen(true);
                  }}
                  stages={stages}
                  onStageChange={handleStageChange}
                  onAddLead={openAddLeadDialog}
                  canManage={isAdminOrRop}
                  onStageDeleted={fetchStages}
                />
              ))}
              {isAdminOrRop && (
                <AddStageColumn
                  nextDisplayOrder={stages.length + 1}
                  onAdded={fetchStages}
                />
              )}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {viewMode === "list" && (
        <LeadsListView
          leads={filteredLeads}
          stages={stages}
          onLeadClick={(lead) => {
            setSelectedLead(lead);
            setDetailsDialogOpen(true);
          }}
        />
      )}

      {viewMode === "table" && (
        <LeadsTableView
          leads={filteredLeads}
          stages={stages}
          onLeadClick={(lead) => {
            setSelectedLead(lead);
            setDetailsDialogOpen(true);
          }}
        />
      )}

      {selectedLead && (
        <LeadDetailsDialog
          lead={selectedLead}
          open={detailsDialogOpen}
          onOpenChange={setDetailsDialogOpen}
          onUpdate={fetchLeads}
          sellers={sellers}
          stages={stages}
        />
      )}

      {/* Stage Change Dialog with mandatory comment and task */}
      {pendingStageChange && (
        <StageChangeDialog
          open={!!pendingStageChange}
          onOpenChange={(open) => !open && setPendingStageChange(null)}
          leadId={pendingStageChange.leadId}
          leadName={pendingStageChange.leadName}
          newStageId={pendingStageChange.newStageId}
          newStageName={pendingStageChange.newStageName}
          sellerId={pendingStageChange.sellerId}
          onSuccess={() => {
            setPendingStageChange(null);
            fetchLeads();
          }}
        />
      )}

      {pendingSoldOrder && (
        <SoldOrderDialog
          open={!!pendingSoldOrder}
          onOpenChange={(open) => !open && setPendingSoldOrder(null)}
          lead={pendingSoldOrder.lead}
          newStageId={pendingSoldOrder.newStageId}
          sellerName={sellers.find((s) => s.id === pendingSoldOrder.lead.seller_id)?.full_name || "Noma'lum"}
          onSuccess={() => {
            setPendingSoldOrder(null);
            fetchLeads();
          }}
        />
      )}

    </DashboardLayout>
  );
};

export default Leads;
