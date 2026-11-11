import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";
import { useUserRoles } from "@/hooks/useUserRoles";
import { format } from "date-fns";
import {
  CalendarIcon,
  Phone,
  Facebook,
  Instagram,
  Send,
  Globe,
  CheckCircle2,
  Clock,
  Plus,
  MessageSquare,
  Trash2,
  Truck,
  Package,
  X,
  ChevronRight,
  Pencil,
  Copy,
  Wallet,
  MoreHorizontal,
  Info,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SoldOrderDialog } from "@/components/SoldOrderDialog";

interface LeadDetailsDialogProps {
  lead: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
  sellers: any[];
  stages: any[];
}

const DELIVERY_STATUS_OPTIONS = [
  { value: "Jarayonda", label: "Jarayonda", color: "bg-yellow-500" },
  { value: "Tasdiqlandi", label: "Tasdiqlandi", color: "bg-green-500" },
  { value: "Bekor bo'ldi", label: "Bekor bo'ldi", color: "bg-red-500" }
];

const sourceIcon = (source?: string) => {
  switch (source?.toLowerCase()) {
    case "instagram":
      return Instagram;
    case "facebook":
      return Facebook;
    case "telegram":
      return Send;
    default:
      return Globe;
  }
};

const LeadDetailsDialog = ({ lead, open, onOpenChange, onUpdate, sellers, stages }: LeadDetailsDialogProps) => {
  const { isAdminOrRop } = useUserRoles();
  const [activeTab, setActiveTab] = useState("info");
  const [tasks, setTasks] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [selectedSeller, setSelectedSeller] = useState(lead?.seller_id || "");
  const [selectedStage, setSelectedStage] = useState(lead?.stage || "");
  const [price, setPrice] = useState(lead?.price?.toString() || "");
  const [notes, setNotes] = useState(lead?.notes || "");
  const [deliveryStatus, setDeliveryStatus] = useState(lead?.delivery_status || "");
  const [selectedProducts, setSelectedProducts] = useState<string[]>(lead?.product_names || []);
  const [newProductTag, setNewProductTag] = useState("");
  const [linkedOrder, setLinkedOrder] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<{ product_name: string; quantity: number; price: number }[]>([]);
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(lead?.customer_name || "");
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState(lead?.customer_phone || "");
  const [soldDialogOpen, setSoldDialogOpen] = useState(false);
  const [pendingSoldStageId, setPendingSoldStageId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    due_date: new Date(),
    due_time: "12:00",
    showForm: false
  });

  const sellerName = (id: string) => sellers.find((s) => s.id === id)?.full_name || "Foydalanuvchi";

  const initials = (name: string) =>
    (name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?";

  useEffect(() => {
    if (open && lead) {
      setActiveTab("info");
      fetchTasks();
      fetchComments();
      setSelectedSeller(lead.seller_id);
      setSelectedStage(lead.stage || "");
      setPrice(lead.price?.toString() || "");
      setNotes(lead.notes || "");
      setDeliveryStatus(lead.delivery_status || "");
      setSelectedProducts(lead.product_names || []);
      setNameDraft(lead.customer_name || "");
      setEditingName(false);
      setPhoneDraft(lead.customer_phone || "");
      setEditingPhone(false);

      // A lead auto-creates its order the moment it enters "Sotildi" (see
      // server/src/routes/leads.ts), so by the time this dialog can show the
      // products section, that order already exists — just find and load it.
      if (stages.find((s) => s.id === lead.stage)?.name === "Sotildi") {
        fetchOrderData();
      } else {
        setLinkedOrder(null);
        setOrderItems([]);
      }
    }
  }, [open, lead]);

  const fetchOrderData = async () => {
    try {
      const ordersData = await api.orders.list();
      const order = ordersData.find((o: any) => o.lead_id === lead.id) || null;
      setLinkedOrder(order);
      setOrderItems(
        (order?.order_items || []).map((i: any) => ({
          product_name: i.product_name,
          quantity: i.quantity,
          price: Number(i.price),
        })),
      );
    } catch (error) {
      console.error("Error fetching order products:", error);
    }
  };

  const addOrderItem = () => {
    const name = newItemName.trim();
    if (!name) return;
    setOrderItems((prev) => [...prev, { product_name: name, quantity: 1, price: Number(newItemPrice) || 0 }]);
    setNewItemName("");
    setNewItemPrice("");
  };

  const removeOrderItem = (index: number) => {
    setOrderItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateOrderItem = (index: number, field: "product_name" | "quantity" | "price", value: string) => {
    setOrderItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        if (field === "product_name") return { ...item, product_name: value };
        if (field === "quantity") return { ...item, quantity: Math.max(1, parseInt(value) || 1) };
        return { ...item, price: Number(value) || 0 };
      }),
    );
  };

  const addProductTag = () => {
    const name = newProductTag.trim();
    if (name && !selectedProducts.includes(name)) {
      setSelectedProducts((prev) => [...prev, name]);
    }
    setNewProductTag("");
  };

  const handleSaveOrderProducts = async () => {
    if (!linkedOrder) return;

    try {
      const updated = await api.orders.update(linkedOrder.id, { items: orderItems });
      setLinkedOrder(updated);
      toast.success("Mahsulotlar saqlandi");
    } catch (error) {
      console.error("Error saving order products:", error);
      toast.error(error instanceof ApiError ? error.message : "Mahsulotlarni saqlashda xato");
    }
  };

  const fetchTasks = async () => {
    try {
      const all = await api.tasks.list();
      const leadTasks = all
        .filter((t: any) => t.lead_id === lead.id)
        .sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1));
      setTasks(leadTasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
    }
  };

  const fetchComments = async () => {
    try {
      const data = await api.leads.comments.list(lead.id);
      setComments(data.map((c: any) => ({ ...c, profiles: { full_name: sellerName(c.user_id) } })));
    } catch (error) {
      console.error("Error fetching comments:", error);
    }
  };

  const handleAddTask = async () => {
    if (!taskForm.title) {
      toast.error("Vazifa nomini kiriting");
      return;
    }

    try {
      const [hours, minutes] = taskForm.due_time.split(":");
      const dueDateTime = new Date(taskForm.due_date);
      dueDateTime.setHours(parseInt(hours), parseInt(minutes));

      await api.tasks.create({
        title: taskForm.title.trim(),
        description: taskForm.description?.trim() || null,
        due_date: dueDateTime.toISOString(),
        seller_id: lead.seller_id,
        lead_id: lead.id,
        status: "pending",
      });

      toast.success("Vazifa qo'shildi");
      setTaskForm({ title: "", description: "", due_date: new Date(), due_time: "12:00", showForm: false });
      fetchTasks();
    } catch (error) {
      console.error("Error adding task:", error);
      toast.error(error instanceof ApiError ? error.message : "Vazifa qo'shishda xato");
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    try {
      await api.leads.comments.create(lead.id, newComment);
      toast.success("Izoh qo'shildi");
      setNewComment("");
      fetchComments();
    } catch (error) {
      console.error("Error adding comment:", error);
      toast.error("Izoh qo'shishda xato");
    }
  };

  const handleUpdateSeller = async () => {
    if (!isAdminOrRop || selectedSeller === lead.seller_id) return;

    try {
      await api.leads.update(lead.id, { seller_id: selectedSeller, employee: sellerName(selectedSeller) });
      await Promise.all(tasks.map((t) => api.tasks.update(t.id, { seller_id: selectedSeller })));

      toast.success("Xodim, vazifalar va izohlar o'zgartirildi");
      onUpdate();
      fetchTasks();
    } catch (error) {
      console.error("Error updating seller:", error);
      toast.error("Xodimni o'zgartirishda xato");
    }
  };

  const handleUpdatePrice = async () => {
    const isSoldStage = currentStage?.name === "Sotildi";
    if (isSoldStage && !price) {
      toast.error("Sotildi bosqichida narx kiritish majburiy");
      return;
    }

    try {
      await api.leads.update(lead.id, { price: price ? parseFloat(price) : null });
      toast.success("Narx saqlandi");
      onUpdate();
    } catch (error) {
      console.error("Error updating price:", error);
      toast.error("Narxni saqlashda xato");
    }
  };

  const toggleProduct = (productName: string) => {
    setSelectedProducts((prev) =>
      prev.includes(productName) ? prev.filter((p) => p !== productName) : [...prev, productName],
    );
  };

  const handleSaveLeadProducts = async () => {
    try {
      await api.leads.update(lead.id, { product_names: selectedProducts.length ? selectedProducts : null });
      toast.success("Mahsulotlar saqlandi");
      onUpdate();
    } catch (error) {
      console.error("Error updating products:", error);
      toast.error("Mahsulotlarni saqlashda xato");
    }
  };

  const handleUpdateNotes = async () => {
    try {
      await api.leads.update(lead.id, { notes });
      toast.success("Izoh saqlandi");
      onUpdate();
    } catch (error) {
      console.error("Error updating notes:", error);
      toast.error("Izohni saqlashda xato");
    }
  };

  const handleUpdateDeliveryStatus = async (newStatus: string) => {
    try {
      await api.leads.update(lead.id, { delivery_status: newStatus });
      setDeliveryStatus(newStatus);
      toast.success("Yetkazish holati saqlandi");
      onUpdate();
    } catch (error) {
      console.error("Error updating delivery status:", error);
      toast.error("Yetkazish holatini saqlashda xato");
    }
  };

  const handleToggleTask = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === "completed" ? "pending" : "completed";

    try {
      await api.tasks.update(taskId, { status: newStatus });
      toast.success(newStatus === "completed" ? "Vazifa bajarildi" : "Vazifa qayta ochildi");
      fetchTasks();
    } catch (error) {
      console.error("Error updating task:", error);
      toast.error("Vazifa holatini o'zgartirishda xato");
    }
  };

  const handleDeleteLead = async () => {
    if (!confirm("Haqiqatan ham bu lidni o'chirmoqchimisiz?")) return;

    try {
      await api.leads.remove(lead.id);
      toast.success("Lid muvaffaqiyatli o'chirildi");
      onOpenChange(false);
      onUpdate();
    } catch (error) {
      console.error("Error deleting lead:", error);
      toast.error("Lidni o'chirishda xato: " + (error instanceof ApiError ? error.message : ""));
    }
  };

  const handleUpdateStage = async (newStageId: string) => {
    // "Sotildi" now goes through SoldOrderDialog instead of applying right
    // away, so the order details (and the Telegram notification) are
    // collected in the same action instead of a separate trip to "Barcha
    // zakazlar" afterward. Leaving selectedStage untouched here means the
    // stage <Select> just reverts to its current value if the dialog is cancelled.
    if (stages.find((s) => s.id === newStageId)?.name === "Sotildi") {
      setPendingSoldStageId(newStageId);
      setSoldDialogOpen(true);
      return;
    }

    try {
      await api.leads.update(lead.id, { stage: newStageId });
      setSelectedStage(newStageId);
      toast.success("Bosqich o'zgartirildi");
      onUpdate();
    } catch (error) {
      console.error("Error updating stage:", error);
      toast.error("Bosqichni o'zgartirishda xato");
    }
  };

  const handleSoldOrderSuccess = () => {
    if (pendingSoldStageId) setSelectedStage(pendingSoldStageId);
    setPendingSoldStageId(null);
    onUpdate();
    fetchOrderData();
  };

  const handleSaveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === lead.customer_name) {
      setEditingName(false);
      setNameDraft(lead?.customer_name || "");
      return;
    }

    try {
      await api.leads.update(lead.id, { customer_name: trimmed });
      toast.success("Ism saqlandi");
      setEditingName(false);
      onUpdate();
    } catch (error) {
      console.error("Error updating name:", error);
      toast.error("Ismni saqlashda xato");
    }
  };

  const handleSavePhone = async () => {
    const trimmed = phoneDraft.trim();
    if (trimmed === (lead.customer_phone || "")) {
      setEditingPhone(false);
      return;
    }

    try {
      await api.leads.update(lead.id, { customer_phone: trimmed || null });
      toast.success("Telefon raqami saqlandi");
      setEditingPhone(false);
      onUpdate();
    } catch (error) {
      console.error("Error updating phone:", error);
      toast.error("Telefon raqamini saqlashda xato");
    }
  };

  const handleCopyPhone = async () => {
    if (!lead?.customer_phone) return;
    try {
      await navigator.clipboard.writeText(lead.customer_phone);
      toast.success("Telefon raqami nusxalandi");
    } catch {
      toast.error("Nusxalab bo'lmadi");
    }
  };

  const openScheduleTask = () => {
    setActiveTab("tasks");
    setTaskForm((prev) => ({ ...prev, showForm: true }));
  };

  const currentStage = stages.find(s => s.id === selectedStage);
  const isSoldStage = currentStage?.name === "Sotildi";
  const SourceIcon = sourceIcon(lead?.source);
  const productsDirty = JSON.stringify([...selectedProducts].sort()) !== JSON.stringify([...(lead?.product_names || [])].sort());

  if (!lead) return null;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
        <DialogTitle className="sr-only">{lead.customer_name}</DialogTitle>

        <div className="flex min-h-0 flex-1">
          {/* Sidebar */}
          <div className="flex w-[300px] shrink-0 flex-col overflow-y-auto border-r bg-muted/20 p-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
              {initials(lead.customer_name)}
            </div>

            <div className="mt-3">
              {editingName ? (
                <Input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={handleSaveName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName();
                    if (e.key === "Escape") {
                      setEditingName(false);
                      setNameDraft(lead.customer_name || "");
                    }
                  }}
                  className="h-8 text-lg font-semibold"
                />
              ) : (
                <div className="flex items-center gap-1.5">
                  <h2 className="truncate text-lg font-semibold">{lead.customer_name}</h2>
                  <button
                    type="button"
                    onClick={() => setEditingName(true)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div className="mt-2">
              <Select value={selectedStage} onValueChange={handleUpdateStage}>
                <SelectTrigger className="h-7 w-fit gap-1.5 rounded-full border-none bg-muted px-3 text-xs font-medium focus:ring-0 focus:ring-offset-0">
                  <SelectValue>
                    {currentStage && (
                      <span className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${currentStage.color}`} />
                        {currentStage.name}
                      </span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      <div className="flex items-center gap-2">
                        <div className={`h-3 w-3 rounded-full ${stage.color}`} />
                        {stage.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-4 space-y-2.5 text-sm">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                {editingPhone ? (
                  <Input
                    autoFocus
                    value={phoneDraft}
                    onChange={(e) => setPhoneDraft(e.target.value)}
                    onBlur={handleSavePhone}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSavePhone();
                      if (e.key === "Escape") {
                        setEditingPhone(false);
                        setPhoneDraft(lead.customer_phone || "");
                      }
                    }}
                    placeholder="+998 XX XXX XX XX"
                    className="h-7 flex-1 text-sm"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingPhone(true)}
                    className="flex-1 truncate text-left hover:underline"
                  >
                    {lead.customer_phone || "—"}
                  </button>
                )}
                {lead.customer_phone && !editingPhone && (
                  <button type="button" onClick={handleCopyPhone} className="shrink-0 rounded border p-1 text-muted-foreground hover:text-foreground">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="truncate">{sellerName(lead.seller_id)}</span>
              </div>
              {lead.activity && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>Faoliyat: {lead.activity}</span>
                </div>
              )}
              {lead.lead_type && <Badge variant="outline">{lead.lead_type}</Badge>}
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarIcon className="h-3.5 w-3.5" /> Yaratilgan sana
                </p>
                <p className="font-medium">{format(new Date(lead.created_at), "dd.MM.yyyy HH:mm")}</p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> Oxirgi yangilanish
                </p>
                <p className="font-medium">{format(new Date(lead.updated_at), "dd.MM.yyyy HH:mm")}</p>
              </div>
            </div>

            <div className="my-4 border-t" />

            {lead.source && (
              <div className="flex items-center gap-2.5 py-1.5 text-sm">
                <SourceIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Manba</p>
                  <p className="font-medium">
                    {[lead.source, lead.campaign_name, lead.ad_name].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            )}

            <div className="flex items-center gap-2.5 py-1.5 text-sm">
              <Wallet className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Potensial qiymat</p>
                <p className="font-medium">{Number(price || 0).toLocaleString()} so'm</p>
              </div>
            </div>

            {selectedProducts.length > 0 && (
              <div className="flex items-start gap-2.5 py-1.5 text-sm">
                <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Mahsulot(lar)</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectedProducts.map((name) => (
                      <Badge key={name} variant="secondary">{name}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {['facebook', 'instagram'].includes(lead.source?.toLowerCase()) && (
              <a
                href={`https://www.${lead.source.toLowerCase()}.com`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 block rounded-lg border bg-background p-3 text-sm hover:bg-accent/50"
              >
                <div className="flex items-center gap-2">
                  <SourceIcon className="h-4 w-4 text-primary" />
                  <span className="font-medium">{lead.source} Ads</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Bu lid {lead.source} reklamadan kelgan</p>
              </a>
            )}

            <div className="mt-auto pt-5">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Tezkor amallar</p>
              <div className="grid grid-cols-4 gap-2">
                <a
                  href={lead.customer_phone ? `tel:${lead.customer_phone}` : undefined}
                  className={`flex flex-col items-center gap-1 rounded-lg border bg-background p-2 text-[10px] leading-tight hover:bg-accent/50 ${!lead.customer_phone ? "pointer-events-none opacity-40" : ""}`}
                >
                  <Phone className="h-3.5 w-3.5" />
                  Qo'ng'iroq
                </a>
                <a
                  href={lead.customer_phone ? `sms:${lead.customer_phone}` : undefined}
                  className={`flex flex-col items-center gap-1 rounded-lg border bg-background p-2 text-[10px] leading-tight hover:bg-accent/50 ${!lead.customer_phone ? "pointer-events-none opacity-40" : ""}`}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Xabar
                </a>
                <button
                  type="button"
                  onClick={openScheduleTask}
                  className="flex flex-col items-center gap-1 rounded-lg border bg-background p-2 text-[10px] leading-tight hover:bg-accent/50"
                >
                  <CalendarIcon className="h-3.5 w-3.5" />
                  Uchrashuv
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="flex flex-col items-center gap-1 rounded-lg border bg-background p-2 text-[10px] leading-tight hover:bg-accent/50">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                      Boshqa
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleCopyPhone} disabled={!lead.customer_phone}>
                      <Copy className="mr-2 h-4 w-4" />
                      Telefonni nusxalash
                    </DropdownMenuItem>
                    {isAdminOrRop && (
                      <DropdownMenuItem onClick={handleDeleteLead} className="text-destructive focus:text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Lidni o'chirish
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {/* Main panel */}
          <div className="flex min-w-0 flex-1 flex-col">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center justify-between border-b py-4 pl-6 pr-16">
                <TabsList className="h-auto gap-6 rounded-none bg-transparent p-0">
                  <TabsTrigger
                    value="info"
                    className="gap-1.5 rounded-none border-b-2 border-transparent px-1 pb-3 text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    <Info className="h-4 w-4" />
                    Asosiy ma'lumotlar
                  </TabsTrigger>
                  <TabsTrigger
                    value="tasks"
                    className="gap-1.5 rounded-none border-b-2 border-transparent px-1 pb-3 text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    <Clock className="h-4 w-4" />
                    Vazifalar
                  </TabsTrigger>
                  <TabsTrigger
                    value="comments"
                    className="gap-1.5 rounded-none border-b-2 border-transparent px-1 pb-3 text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Izohlar
                  </TabsTrigger>
                </TabsList>

                {isAdminOrRop && (
                  <Button variant="destructive" size="sm" onClick={handleDeleteLead}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    O'chirish
                  </Button>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <TabsContent value="info" className="mt-0 space-y-6">
                  {/* Price */}
                  <div className={isSoldStage ? "rounded-lg border-2 border-success bg-success/10 p-4" : ""}>
                    <Label className={isSoldStage ? "text-lg font-semibold" : ""}>
                      Narx (so'm) {isSoldStage && <span className="text-destructive">*</span>}
                    </Label>
                    <div className="mt-2 flex gap-2">
                      <Input
                        type="number"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder="Kelishilgan summa"
                        className={isSoldStage ? "text-lg font-semibold" : ""}
                        required={isSoldStage}
                      />
                      {price !== (lead.price?.toString() || "") && (
                        <Button onClick={handleUpdatePrice} size="sm">Saqlash</Button>
                      )}
                    </div>
                    {isSoldStage && !price && (
                      <p className="mt-1 text-sm text-destructive">Sotildi bosqichida narx kiritish majburiy</p>
                    )}
                  </div>

                  {/* Product multi-select */}
                  <div>
                    <Label className="flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Mahsulot
                    </Label>
                    <div className="mt-1 flex gap-2">
                      <Input
                        placeholder="Mahsulot nomini kiriting"
                        value={newProductTag}
                        onChange={(e) => setNewProductTag(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addProductTag();
                          }
                        }}
                      />
                      <Button type="button" variant="outline" onClick={addProductTag}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>

                    {selectedProducts.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {selectedProducts.map((name) => (
                          <Badge key={name} variant="secondary" className="gap-1 pr-1">
                            {name}
                            <button type="button" onClick={() => toggleProduct(name)} className="rounded-full hover:bg-muted-foreground/20">
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}

                    {productsDirty && (
                      <Button onClick={handleSaveLeadProducts} size="sm" className="mt-2">Saqlash</Button>
                    )}
                  </div>

                  {/* Meta (Facebook/Instagram) Ads Data */}
                  {['facebook', 'instagram'].includes(lead.source?.toLowerCase()) && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/20">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <SourceIcon className="h-5 w-5 text-blue-600" />
                          <h3 className="font-semibold text-blue-900 dark:text-blue-100">{lead.source} Ads</h3>
                        </div>
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Reklamadan kelgan</Badge>
                      </div>
                      <p className="text-sm text-blue-700 dark:text-blue-300">Bu lid {lead.source} reklamadan kelgan</p>
                      <p className="mt-1 text-xs text-muted-foreground">Manba: {lead.source}</p>
                      {Array.isArray(lead.facebook_form_answers) && lead.facebook_form_answers.length > 0 && (
                        <div className="mt-3 space-y-2 border-t border-blue-200 pt-3 dark:border-blue-800">
                          {lead.facebook_form_answers.map((item: { question: string; answer: string }, index: number) => (
                            <div key={index} className="text-sm">
                              <p className="text-blue-900/70 dark:text-blue-100/70">{item.question}</p>
                              <p className="font-medium text-blue-900 dark:text-blue-100">{item.answer}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Telegram Mini App order form data */}
                  {lead.source?.toLowerCase() === 'telegram' && (
                    <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 dark:border-sky-800 dark:bg-sky-950/20">
                      <div className="mb-2 flex items-center gap-2">
                        <Send className="h-5 w-5 text-sky-600" />
                        <h3 className="font-semibold text-sky-900 dark:text-sky-100">Telegram buyurtma</h3>
                      </div>
                      <p className="text-sm text-sky-700 dark:text-sky-300">Bu lid Telegram bot orqali kelgan</p>
                      {Array.isArray(lead.telegram_form_answers) && lead.telegram_form_answers.length > 0 && (
                        <div className="mt-3 space-y-2 border-t border-sky-200 pt-3 dark:border-sky-800">
                          {lead.telegram_form_answers.map((item: { question: string; answer: string }, index: number) => (
                            <div key={index} className="text-sm">
                              <p className="text-sky-900/70 dark:text-sky-100/70">{item.question}</p>
                              <p className="font-medium text-sky-900 dark:text-sky-100">{item.answer}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Delivery Status - Only for Sotildi stage */}
                  {isSoldStage && (
                    <div className="rounded-lg bg-muted p-4">
                      <Label className="mb-2 flex items-center gap-2">
                        <Truck className="h-4 w-4" />
                        Yetkazish holati
                      </Label>
                      <Select value={deliveryStatus} onValueChange={handleUpdateDeliveryStatus}>
                        <SelectTrigger>
                          <SelectValue placeholder="Holatni tanlang" />
                        </SelectTrigger>
                        <SelectContent>
                          {DELIVERY_STATUS_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              <div className="flex items-center gap-2">
                                <div className={`h-3 w-3 rounded-full ${option.color}`} />
                                {option.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Sold Products (order line items) - Only for Sotildi stage */}
                  {isSoldStage && (
                    <div className="rounded-lg bg-muted p-4">
                      <Label className="mb-2 flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Sotilgan mahsulotlar
                      </Label>

                      <div className="mb-3 flex gap-2">
                        <Input
                          placeholder="Mahsulot nomi"
                          value={newItemName}
                          onChange={(e) => setNewItemName(e.target.value)}
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          min={0}
                          placeholder="Narxi"
                          value={newItemPrice}
                          onChange={(e) => setNewItemPrice(e.target.value)}
                          className="w-28"
                        />
                        <Button type="button" size="icon" onClick={addOrderItem}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>

                      {orderItems.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Mahsulot qo'shilmagan</p>
                      ) : (
                        <div className="space-y-2">
                          {orderItems.map((item, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <Input
                                value={item.product_name}
                                onChange={(e) => updateOrderItem(index, "product_name", e.target.value)}
                                className="flex-1"
                              />
                              <Input
                                type="number"
                                min={1}
                                value={item.quantity}
                                onChange={(e) => updateOrderItem(index, "quantity", e.target.value)}
                                className="w-20"
                              />
                              <Input
                                type="number"
                                min={0}
                                value={item.price}
                                onChange={(e) => updateOrderItem(index, "price", e.target.value)}
                                className="w-24"
                              />
                              <Button type="button" variant="ghost" size="icon" onClick={() => removeOrderItem(index)}>
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      {linkedOrder && (
                        <Button size="sm" className="mt-3" onClick={handleSaveOrderProducts}>Saqlash</Button>
                      )}
                    </div>
                  )}

                  {/* Seller Selection (Admin/ROP only) */}
                  {isAdminOrRop && (
                    <div>
                      <Label>Xodim</Label>
                      <div className="mt-1 flex gap-2">
                        <Select value={selectedSeller} onValueChange={setSelectedSeller}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {sellers.map((seller) => (
                              <SelectItem key={seller.id} value={seller.id}>{seller.full_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedSeller !== lead.seller_id && (
                          <Button onClick={handleUpdateSeller} size="sm">Saqlash</Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  <div>
                    <Label>Izoh</Label>
                    <div className="mt-1 flex gap-2">
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                        placeholder="Izoh yozing..."
                        rows={3}
                        maxLength={500}
                        className="flex-1"
                      />
                      {notes !== (lead.notes || "") && (
                        <Button onClick={handleUpdateNotes} size="sm">Saqlash</Button>
                      )}
                    </div>
                    <p className="mt-1 text-right text-xs text-muted-foreground">{notes.length}/500</p>
                  </div>
                </TabsContent>

                <TabsContent value="tasks" className="mt-0">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-semibold">Vazifalar</h3>
                    {!taskForm.showForm && (
                      <Button size="sm" variant="outline" onClick={() => setTaskForm({ ...taskForm, showForm: true })}>
                        <Plus className="mr-1 h-4 w-4" />
                        Vazifa qo'shish
                      </Button>
                    )}
                  </div>

                  {taskForm.showForm && (
                    <div className="mb-4 space-y-3 rounded-lg bg-muted p-4">
                      <div>
                        <Label>Vazifa nomi *</Label>
                        <Input
                          value={taskForm.title}
                          onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                          placeholder="Vazifa nomini kiriting"
                        />
                      </div>
                      <div>
                        <Label>Tavsif</Label>
                        <Textarea
                          value={taskForm.description}
                          onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                          placeholder="Vazifa tavsifini kiriting"
                          rows={2}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Muddat (Sana)</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full justify-start">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {format(taskForm.due_date, "dd.MM.yyyy")}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar
                                mode="single"
                                selected={taskForm.due_date}
                                onSelect={(date) => date && setTaskForm({ ...taskForm, due_date: date })}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div>
                          <Label>Vaqt</Label>
                          <Input
                            type="time"
                            value={taskForm.due_time}
                            onChange={(e) => setTaskForm({ ...taskForm, due_time: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setTaskForm({ ...taskForm, showForm: false, title: "", description: "" })}
                        >
                          Bekor qilish
                        </Button>
                        <Button size="sm" onClick={handleAddTask}>Saqlash</Button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {tasks.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">Vazifalar yo'q</p>
                    ) : (
                      tasks.map((task) => (
                        <div key={task.id} className="flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50">
                          <button onClick={() => handleToggleTask(task.id, task.status)} className="mt-1">
                            <CheckCircle2 className={`h-5 w-5 ${task.status === "completed" ? "text-success" : "text-muted-foreground"}`} />
                          </button>
                          <div className="flex-1">
                            <p className={`font-medium ${task.status === "completed" ? "text-muted-foreground line-through" : ""}`}>{task.title}</p>
                            {task.description && <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>}
                            <p className="mt-1 text-xs text-muted-foreground">Muddat: {format(new Date(task.due_date), "dd.MM.yyyy HH:mm")}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="comments" className="mt-0">
                  <h3 className="mb-3 font-semibold">Izohlar</h3>

                  <div className="mb-4 space-y-3">
                    {comments.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">Izohlar yo'q</p>
                    ) : (
                      comments.map((comment) => (
                        <div key={comment.id} className="rounded-lg bg-muted p-3">
                          <div className="mb-1 flex items-center justify-between">
                            <p className="text-sm font-medium">{comment.profiles?.full_name || "Foydalanuvchi"}</p>
                            <p className="text-xs text-muted-foreground">{format(new Date(comment.created_at), "dd.MM.yyyy HH:mm")}</p>
                          </div>
                          <p className="text-sm">{comment.comment}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleAddComment();
                        }
                      }}
                      placeholder="Izoh yozing... (Enter yuborish uchun)"
                      rows={2}
                      className="flex-1"
                    />
                    <Button onClick={handleAddComment} disabled={!newComment.trim()}>Yuborish</Button>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>

      {pendingSoldStageId && (
        <SoldOrderDialog
          open={soldDialogOpen}
          onOpenChange={setSoldDialogOpen}
          lead={lead}
          newStageId={pendingSoldStageId}
          sellerName={sellerName(lead.seller_id)}
          onSuccess={handleSoldOrderSuccess}
        />
      )}
    </>
  );
};

export default LeadDetailsDialog;
