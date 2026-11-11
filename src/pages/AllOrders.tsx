import { useState, useEffect } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Edit,
  Trash2,
  Plus,
  X,
  Download,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  Clock,
  Eye,
  MoreVertical,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { format, subWeeks, subMonths, subYears, startOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useUserRole } from "@/hooks/useUserRole";
import { deriveDeliveryStatus, getDeliveryStatusMeta, type DeliveryStatus } from "@/lib/deliveryDisplay";
import { Textarea } from "@/components/ui/textarea";
import { regions, regionsData } from "@/lib/regions";
import DashboardStatCard from "@/components/dashboard/DashboardStatCard";
import DashboardPeriodControl, { DashboardPeriod } from "@/components/dashboard/DashboardPeriodControl";
import CircularProgress from "@/components/dashboard/CircularProgress";
import { getAvatarColor, getInitials } from "@/lib/leadDisplay";

const getPeriodRange = (period: DashboardPeriod, customRange?: DateRange) => {
  const now = new Date();
  switch (period) {
    case "today":
      return { start: startOfDay(now), end: now };
    case "month":
      return { start: subMonths(now, 1), end: now };
    case "year":
      return { start: subYears(now, 1), end: now };
    case "custom":
      if (customRange?.from && customRange?.to) return { start: startOfDay(customRange.from), end: customRange.to };
      return { start: subWeeks(now, 1), end: now };
    default:
      return { start: subWeeks(now, 1), end: now };
  }
};

const pctChange = (current: number, previous: number): number | null => {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
};

interface OrderItem {
  product_name: string;
  quantity: number;
  price: number;
}

interface Order {
  id: string;
  order_number: number;
  order_date: string;
  customer_name: string;
  customer_phone: string;
  total_amount: number;
  advance_payment: number;
  status: string;
  items: OrderItem[];
  seller_id?: string;
  region?: string;
  district?: string;
  notes?: string;
  seller_name?: string;
  seller_phone?: string;
  created_at?: string;
  delivery_status: DeliveryStatus;
}

const AllOrders = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSeller, setFilterSeller] = useState<string>("all");
  const [filterRegion, setFilterRegion] = useState<string>("all");
  const [sellers, setSellers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editFormData, setEditFormData] = useState({
    customer_name: "",
    customer_phone: "",
    customer_phone2: "",
    region: "",
    district: "",
    advance_payment: 0,
    total_amount: 0,
    status: "",
    notes: "",
    items: [] as Array<{ product_name: string; quantity: number; price: number }>
  });
  const [editAvailableDistricts, setEditAvailableDistricts] = useState<string[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createFormData, setCreateFormData] = useState({
    customer_name: '',
    customer_phone: '',
    customer_phone2: '',
    region: '',
    district: '',
    advance_payment: 0,
    total_amount: 0,
    notes: '',
    items: [{ product_name: '', quantity: 1 }] as Array<{ product_name: string; quantity: number }>
  });
  const [availableDistricts, setAvailableDistricts] = useState<string[]>([]);
  const { isAdmin, isRop, loading: rolesLoading } = useUserRoles();
  const { isSotuvchi } = useUserRole();
  const { user } = useAuth();

  const [period, setPeriod] = useState<DashboardPeriod>("week");
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    if (!rolesLoading && user) {
      fetchOrders();
      fetchSellers();
    }
  }, [rolesLoading, isAdmin, isRop, user]);

  useEffect(() => {
    const { start, end } = getPeriodRange(period, customRange);
    setStartDate(start);
    setEndDate(end);
  }, [period, customRange]);

  useEffect(() => {
    filterOrders();
  }, [orders, startDate, endDate, searchQuery, filterStatus, filterSeller, filterRegion]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [startDate, endDate, searchQuery, filterStatus, filterSeller, filterRegion]);

  useEffect(() => {
    if (createFormData.region) {
      setAvailableDistricts(regionsData[createFormData.region] || []);
      setCreateFormData(prev => ({ ...prev, district: '' }));
    } else {
      setAvailableDistricts([]);
    }
  }, [createFormData.region]);

  const calculateItemPrice = () => {
    const totalQuantity = createFormData.items.reduce((sum, item) => sum + item.quantity, 0);
    return totalQuantity > 0 ? createFormData.total_amount / totalQuantity : 0;
  };

  const fetchOrders = async () => {
    try {
      if (!user) return;

      const [ordersData, profiles] = await Promise.all([api.orders.list(), api.profiles.list()]);
      const profileById = new Map(profiles.map((p: any) => [p.id, p]));

      // If not admin or rop, the backend already scopes the list to the caller's own orders.
      const ordersWithItems = ordersData.map((order: any) => {
        const sellerProfile = profileById.get(order.seller_id);
        return {
          ...order,
          items: order.order_items || [],
          seller_name: sellerProfile?.full_name || "Noma'lum",
          seller_phone: sellerProfile?.phone || "",
          delivery_status: deriveDeliveryStatus(order.status),
        };
      });

      setOrders(ordersWithItems);
    } catch (error) {
      toast.error("Xatolik: " + (error instanceof ApiError ? error.message : ""));
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

  const filterOrders = () => {
    let filtered = [...orders];

    if (startDate) {
      filtered = filtered.filter(order => 
        new Date(order.order_date) >= startDate
      );
    }

    if (endDate) {
      filtered = filtered.filter(order => 
        new Date(order.order_date) <= endDate
      );
    }

    if (filterStatus !== "all") {
      filtered = filtered.filter(order => order.status === filterStatus);
    }

    if (filterSeller !== "all") {
      filtered = filtered.filter(order => {
        const seller = sellers.find(s => s.id === filterSeller);
        return seller && order.seller_name === seller.full_name;
      });
    }

    if (filterRegion !== "all") {
      filtered = filtered.filter(order => order.region === filterRegion);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(order =>
        order.customer_name.toLowerCase().includes(query) ||
        order.customer_phone?.toLowerCase().includes(query) ||
        order.order_number.toString().includes(query) ||
        order.seller_name?.toLowerCase().includes(query)
      );
    }

    setFilteredOrders(filtered);
  };

  const calculateTotalSales = () => {
    return filteredOrders.reduce((total, order) => total + Number(order.total_amount), 0);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size} ta zakazni o'chirmoqchimisiz?`)) return;
    try {
      await Promise.all(Array.from(selectedIds).map((id) => api.orders.remove(id)));
      toast.success(`${selectedIds.size} ta zakaz o'chirildi`);
      setSelectedIds(new Set());
      fetchOrders();
    } catch (error) {
      toast.error("Xatolik: " + (error instanceof ApiError ? error.message : ""));
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedOrders.length && paginatedOrders.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedOrders.map((o) => o.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportToExcel = (ordersToExport: Order[] = filteredOrders) => {
    const exportData = ordersToExport.map((order, index) => {
      const products = order.items.map(item => 
        `${item.product_name} (${item.quantity} dona)`
      ).join(", ");
      
      const remaining = Number(order.total_amount) - Number(order.advance_payment || 0);
      
      const statusLabels: Record<string, string> = {
        pending: "Jarayonda",
        delivered: "Yetkazildi",
        cancelled: "Bekor qilindi"
      };

      return {
        "#": index + 1,
        "Buyurtma ID": order.order_number,
        "Mijoz": order.customer_name,
        "Telefon": order.customer_phone || "",
        "Manzil": `${order.region || ""} ${order.district || ""}`.trim(),
        "Mahsulotlar": products,
        "Jami summa (so'm)": Number(order.total_amount),
        "Oldindan to'lov": Number(order.advance_payment || 0),
        "Qoldiq": remaining,
        "To'lov turi / Izoh": order.notes || "",
        "Sotuvchi": order.seller_name || "",
        "Status": statusLabels[order.status] || order.status
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Zakazlar");
    
    // Auto-size columns
    const colWidths = [
      { wch: 5 },   // #
      { wch: 12 },  // Buyurtma ID
      { wch: 20 },  // Mijoz
      { wch: 15 },  // Telefon
      { wch: 25 },  // Manzil
      { wch: 40 },  // Mahsulotlar
      { wch: 18 },  // Jami summa
      { wch: 18 },  // Oldindan to'lov
      { wch: 15 },  // Qoldiq
      { wch: 25 },  // To'lov turi / Izoh
      { wch: 20 },  // Sotuvchi
      { wch: 15 },  // Status
    ];
    ws['!cols'] = colWidths;
    
    const fileName = `Zakazlar_${format(new Date(), "yyyy-MM-dd_HH-mm")}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success("Zakazlar muvaffaqiyatli yuklandi!");
  };

  const removeOrderItem = (index: number) => {
    const newItems = createFormData.items.filter((_, i) => i !== index);
    if (newItems.length === 0) {
      newItems.push({ product_name: '', quantity: 1 });
    }
    setCreateFormData({
      ...createFormData,
      items: newItems
    });
  };

  const handleEdit = (order: Order) => {
    setEditingOrder(order);
    setEditFormData({
      customer_name: order.customer_name,
      customer_phone: order.customer_phone || "",
      customer_phone2: (order as any).customer_phone2 || "",
      region: order.region || "",
      district: order.district || "",
      advance_payment: order.advance_payment || 0,
      total_amount: order.total_amount,
      status: order.status,
      notes: order.notes || "",
      items: order.items.map(item => ({ 
        product_name: item.product_name, 
        quantity: item.quantity, 
        price: item.price 
      }))
    });
    if (order.region) {
      setEditAvailableDistricts(regionsData[order.region] || []);
    }
    setEditDialogOpen(true);
  };

  const handleQuickStatusUpdate = async (orderId: string, newStatus: string) => {
    try {
      // Find the order to get seller info
      const orderToUpdate = orders.find(o => o.id === orderId);

      await api.orders.update(orderId, { status: newStatus });

      // Sync status change to Google Sheets
      try {
        await api.integrations.triggerSheetsSync();
      } catch (sheetsError) {
        console.error('Google Sheets sync error:', sheetsError);
      }

      // Send notification to seller for cancelled or delivered status
      if (orderToUpdate && (newStatus === 'cancelled' || newStatus === 'delivered')) {
        try {
          await api.integrations.telegramOrder({
            action: 'status_change',
            statusChange: {
              order_number: orderToUpdate.order_number,
              customer_name: orderToUpdate.customer_name,
              new_status: newStatus,
              seller_id: orderToUpdate.seller_id,
              seller_name: orderToUpdate.seller_name || "Noma'lum"
            }
          });
        } catch (notifyError) {
          console.error('Telegram xabar yuborishda xatolik:', notifyError);
        }
      }

      toast.success("Status yangilandi!");
      fetchOrders();
    } catch (error) {
      toast.error("Xatolik: " + (error instanceof ApiError ? error.message : ""));
    }
  };

  const handleUpdateOrder = async () => {
    if (!editingOrder) return;

    try {
      const updateData: any = {
        notes: editFormData.notes,
      };

      const validItems = editFormData.items.filter(item => item.product_name);
      let itemPrice = 0;

      if (isAdmin) {
        updateData.status = editFormData.status;
        updateData.customer_name = editFormData.customer_name;
        updateData.customer_phone = editFormData.customer_phone;
        updateData.customer_phone2 = editFormData.customer_phone2;
        updateData.region = editFormData.region;
        updateData.district = editFormData.district;
        updateData.advance_payment = editFormData.advance_payment;
        updateData.total_amount = editFormData.total_amount;

        const totalQuantity = validItems.reduce((sum, item) => sum + item.quantity, 0);
        itemPrice = totalQuantity > 0 ? editFormData.total_amount / totalQuantity : 0;
        updateData.items = validItems.map(item => ({
          product_name: item.product_name,
          price: itemPrice,
          quantity: item.quantity,
        }));
      }

      await api.orders.update(editingOrder.id, updateData);

      if (isAdmin) {
        // Send Telegram notification for edited order
        try {
          await api.integrations.telegramOrder({
            order: {
              order_id: editingOrder.id,
              order_number: editingOrder.order_number,
              customer_name: editFormData.customer_name,
              customer_phone: editFormData.customer_phone,
              customer_phone2: editFormData.customer_phone2,
              region: editFormData.region,
              district: editFormData.district,
              products: validItems.map(item => ({
                product_name: item.product_name,
                quantity: item.quantity,
                price: itemPrice
              })),
              total_amount: editFormData.total_amount,
              advance_payment: editFormData.advance_payment,
              notes: editFormData.notes,
              seller_name: editingOrder.seller_name || "Noma'lum",
              status: editFormData.status
            },
            action: 'edit'
          });
        } catch (telegramError) {
          console.error('Telegram yuborishda xatolik:', telegramError);
        }

        // Send status change notification to seller if status changed to cancelled or delivered
        const oldStatus = editingOrder.status;
        const newStatus = editFormData.status;
        if (oldStatus !== newStatus && (newStatus === 'cancelled' || newStatus === 'delivered')) {
          try {
            await api.integrations.telegramOrder({
              action: 'status_change',
              statusChange: {
                order_number: editingOrder.order_number,
                customer_name: editFormData.customer_name,
                new_status: newStatus,
                seller_id: editingOrder.seller_id,
                seller_name: editingOrder.seller_name || "Noma'lum"
              }
            });
          } catch (notifyError) {
            console.error('Status o\'zgarish xabari yuborishda xatolik:', notifyError);
          }
        }
      }

      toast.success("Zakaz muvaffaqiyatli yangilandi!");
      setEditDialogOpen(false);
      fetchOrders();
    } catch (error) {
      toast.error("Xatolik: " + (error instanceof ApiError ? error.message : ""));
    }
  };

  const addEditOrderItem = () => {
    setEditFormData({
      ...editFormData,
      items: [...editFormData.items, { product_name: '', quantity: 1, price: 0 }]
    });
  };

  const removeEditOrderItem = (index: number) => {
    const newItems = editFormData.items.filter((_, i) => i !== index);
    if (newItems.length === 0) {
      newItems.push({ product_name: '', quantity: 1, price: 0 });
    }
    setEditFormData({ ...editFormData, items: newItems });
  };

  const updateEditOrderItem = (index: number, field: string, value: any) => {
    const newItems = [...editFormData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setEditFormData({ ...editFormData, items: newItems });
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!confirm("Haqiqatan ham bu zakazni o'chirmoqchimisiz?")) return;

    try {
      // Deleting the order cascades to its order_items on the backend.
      await api.orders.remove(orderId);

      toast.success("Zakaz muvaffaqiyatli o'chirildi!");
      fetchOrders();
    } catch (error) {
      toast.error("Xatolik: " + (error instanceof ApiError ? error.message : ""));
    }
  };

  const handleCreateOrder = async () => {
    try {
      if (!user) {
        toast.error("Tizimga kiring");
        return;
      }

      if (!createFormData.customer_name.trim()) {
        toast.error("Mijoz ismini kiriting");
        return;
      }

      if (!createFormData.total_amount || createFormData.total_amount <= 0) {
        toast.error("Umumiy summani kiriting");
        return;
      }

      const validItems = createFormData.items.filter(item => item.product_name && item.quantity > 0);

      if (validItems.length === 0) {
        toast.error("Kamida bitta mahsulot tanlang");
        return;
      }

      const itemPrice = calculateItemPrice();

      const orderData = await api.orders.create({
        customer_name: createFormData.customer_name,
        customer_phone: createFormData.customer_phone,
        customer_phone2: createFormData.customer_phone2,
        region: createFormData.region,
        district: createFormData.district,
        advance_payment: createFormData.advance_payment,
        notes: createFormData.notes,
        total_amount: createFormData.total_amount,
        seller_id: user.id,
        status: 'pending',
        items: validItems.map(item => ({
          product_name: item.product_name,
          price: itemPrice,
          quantity: item.quantity,
        })),
      });

      // Send order to Telegram
      try {
        await api.integrations.telegramOrder({
          order: {
            order_number: orderData.order_number,
            customer_name: createFormData.customer_name,
            customer_phone: createFormData.customer_phone,
            customer_phone2: createFormData.customer_phone2,
            region: createFormData.region,
            district: createFormData.district,
            products: validItems.map(item => ({
              product_name: item.product_name,
              quantity: item.quantity,
              price: itemPrice
            })),
            total_amount: createFormData.total_amount,
            advance_payment: createFormData.advance_payment,
            notes: createFormData.notes,
            seller_name: user.full_name || "Noma'lum"
          }
        });
      } catch (telegramError) {
        console.error('Telegram yuborishda xatolik:', telegramError);
        // Don't fail the order creation if Telegram fails
      }

      // Sync to Google Sheets via Apps Script
      try {
        await api.integrations.triggerSheetsSync();
      } catch (sheetsError) {
        console.error('Google Sheets sync error:', sheetsError);
        // Don't fail if sheets sync fails
      }

      toast.success("Buyurtma muvaffaqiyatli yaratildi");
      setCreateDialogOpen(false);
      setCreateFormData({
        customer_name: '',
        customer_phone: '',
        customer_phone2: '',
        region: '',
        district: '',
        advance_payment: 0,
        total_amount: 0,
        notes: '',
        items: [{ product_name: '', quantity: 1 }]
      });
      fetchOrders();
    } catch (error) {
      console.error('Error creating order:', error);
      toast.error("Buyurtma yaratishda xatolik: " + (error instanceof ApiError ? error.message : ""));
    }
  };

  const updateOrderItem = (index: number, field: string, value: any) => {
    const newItems = [...createFormData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setCreateFormData({ ...createFormData, items: newItems });
  };

  // Date/seller/region/search filters, but deliberately excluding status — this
  // is the base set the status tab counts and the top summary cards are drawn
  // from, so switching tabs doesn't change "Jami zakazlar" itself.
  const inDateRange = (order: Order, start?: Date, end?: Date) => {
    const d = new Date(order.order_date);
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  };
  const matchesSellerRegionSearch = (order: Order) => {
    if (filterSeller !== "all") {
      const seller = sellers.find((s) => s.id === filterSeller);
      if (!seller || order.seller_name !== seller.full_name) return false;
    }
    if (filterRegion !== "all" && order.region !== filterRegion) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matches =
        order.customer_name.toLowerCase().includes(q) ||
        order.customer_phone?.toLowerCase().includes(q) ||
        order.order_number.toString().includes(q) ||
        order.seller_name?.toLowerCase().includes(q);
      if (!matches) return false;
    }
    return true;
  };

  const statsBaseOrders = orders.filter((o) => inDateRange(o, startDate, endDate) && matchesSellerRegionSearch(o));
  const totalCount = statsBaseOrders.length;
  const pendingCount = statsBaseOrders.filter((o) => o.status === "pending").length;
  const deliveredCount = statsBaseOrders.filter((o) => o.status === "delivered").length;
  const cancelledCount = statsBaseOrders.filter((o) => o.status === "cancelled").length;
  const totalSalesAll = statsBaseOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const avgCheck = totalCount > 0 ? totalSalesAll / totalCount : 0;
  const deliveredPercent = totalCount > 0 ? (deliveredCount / totalCount) * 100 : 0;

  const spanMs = startDate && endDate ? Math.max(endDate.getTime() - startDate.getTime(), 86400000) : 7 * 86400000;
  const prevEnd = startDate ? new Date(startDate.getTime() - 1) : new Date();
  const prevStart = new Date(prevEnd.getTime() - spanMs);
  const prevOrders = orders.filter((o) => inDateRange(o, prevStart, prevEnd) && matchesSellerRegionSearch(o));
  const prevTotalCount = prevOrders.length;
  const prevTotalSales = prevOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const prevAvgCheck = prevTotalCount > 0 ? prevTotalSales / prevTotalCount : 0;
  const prevDeliveredCount = prevOrders.filter((o) => o.status === "delivered").length;

  const totalTrend = pctChange(totalCount, prevTotalCount);
  const salesTrend = pctChange(totalSalesAll, prevTotalSales);
  const avgTrend = pctChange(avgCheck, prevAvgCheck);
  const deliveredTrend = pctChange(deliveredCount, prevDeliveredCount);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedOrders = filteredOrders.slice((safePage - 1) * pageSize, safePage * pageSize);

  const dateRangeLabel =
    startDate && endDate
      ? format(startDate, "yyyy-MM-dd") === format(endDate, "yyyy-MM-dd")
        ? format(startDate, "dd MMM yyyy")
        : `${format(startDate, "dd MMM yyyy")} - ${format(endDate, "dd MMM yyyy")}`
      : "Barcha davr";

  if (loading || rolesLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Yuklanmoqda...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      headerExtra={
        <DashboardPeriodControl
          period={period}
          onPeriodChange={setPeriod}
          dateRangeLabel={dateRangeLabel}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
        />
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Barcha zakazlar</h1>
            <p className="text-muted-foreground">Barcha buyurtmalar ro'yxati va ularning holati</p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Yangi zakaz
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DashboardStatCard
            id="orders-total"
            title="Jami zakazlar"
            value={String(totalCount)}
            description={`Oldingi davr: ${prevTotalCount} ta`}
            icon={ShoppingCart}
            iconClassName="bg-blue-500/10 text-blue-600"
            trend={totalTrend !== null ? { value: totalTrend, isPositive: totalTrend >= 0 } : undefined}
            sparkline={[]}
            sparklineColor="#3b82f6"
          />
          <DashboardStatCard
            id="orders-sales"
            title="Jami savdo"
            value={`${totalSalesAll.toLocaleString()} so'm`}
            description={`Oldingi davr: ${prevTotalSales.toLocaleString()} so'm`}
            icon={DollarSign}
            iconClassName="bg-emerald-500/10 text-emerald-600"
            trend={salesTrend !== null ? { value: salesTrend, isPositive: salesTrend >= 0 } : undefined}
            sparkline={[]}
            sparklineColor="#22c55e"
          />
          <DashboardStatCard
            id="orders-avg"
            title="O'rtacha chek"
            value={`${Math.round(avgCheck).toLocaleString()} so'm`}
            description={`Oldingi davr: ${Math.round(prevAvgCheck).toLocaleString()} so'm`}
            icon={TrendingUp}
            iconClassName="bg-amber-500/10 text-amber-600"
            trend={avgTrend !== null ? { value: avgTrend, isPositive: avgTrend >= 0 } : undefined}
            sparkline={[]}
            sparklineColor="#f59e0b"
          />
          <Card>
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <p className="text-sm text-muted-foreground">Tugallangan zakazlar</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{deliveredCount}</span>
                  {deliveredTrend !== null && (
                    <span className={`text-xs font-semibold ${deliveredTrend >= 0 ? "text-success" : "text-destructive"}`}>
                      {deliveredTrend >= 0 ? "↑" : "↓"} {Math.abs(deliveredTrend)}%
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Jarayondagi: {pendingCount}, Bekor qilingan: {cancelledCount}
                </p>
              </div>
              <CircularProgress value={deliveredPercent} color="#3b82f6" />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Tabs value={filterStatus} onValueChange={setFilterStatus}>
            <TabsList className="h-10">
              <TabsTrigger value="all" className="gap-1.5 px-3">
                <ShoppingCart className="h-3.5 w-3.5" />
                Barchasi ({totalCount})
              </TabsTrigger>
              <TabsTrigger value="pending" className="gap-1.5 px-3">
                <Clock className="h-3.5 w-3.5" />
                Jarayonda ({pendingCount})
              </TabsTrigger>
              <TabsTrigger value="delivered" className="gap-1.5 px-3">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Tugallangan ({deliveredCount})
              </TabsTrigger>
              <TabsTrigger value="cancelled" className="gap-1.5 px-3">
                <X className="h-3.5 w-3.5" />
                Bekor qilingan ({cancelledCount})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={`gap-1.5 ${
                    filterSeller !== "all" || filterRegion !== "all" || searchQuery ? "border-primary text-primary" : ""
                  }`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Filtrlar
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 space-y-3 p-4" align="end">
                <div>
                  <Label className="mb-1.5 block text-xs text-muted-foreground">Qidiruv</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Mijoz, telefon, mahsulot yoki ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                {(isAdmin || isRop) && (
                  <div>
                    <Label className="mb-1.5 block text-xs text-muted-foreground">Sotuvchi</Label>
                    <Select value={filterSeller} onValueChange={setFilterSeller}>
                      <SelectTrigger>
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
                  </div>
                )}
                <div>
                  <Label className="mb-1.5 block text-xs text-muted-foreground">Viloyat</Label>
                  <Select value={filterRegion} onValueChange={setFilterRegion}>
                    <SelectTrigger>
                      <SelectValue placeholder="Barcha viloyatlar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Barcha viloyatlar</SelectItem>
                      {regions.map((region) => (
                        <SelectItem key={region} value={region}>
                          {region}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(filterSeller !== "all" || filterRegion !== "all" || searchQuery) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setFilterSeller("all");
                      setFilterRegion("all");
                      setSearchQuery("");
                    }}
                  >
                    Tozalash
                  </Button>
                )}
              </PopoverContent>
            </Popover>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Eksport
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportToExcel()}>Barchasini eksport qilish ({filteredOrders.length})</DropdownMenuItem>
                {selectedIds.size > 0 && (
                  <DropdownMenuItem onClick={() => exportToExcel(filteredOrders.filter((o) => selectedIds.has(o.id)))}>
                    Tanlanganlarni eksport qilish ({selectedIds.size})
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={fetchOrders}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Yangilash
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between rounded-lg border bg-muted/50 px-4 py-2.5">
            <span className="text-sm font-medium">{selectedIds.size} ta tanlandi</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => exportToExcel(filteredOrders.filter((o) => selectedIds.has(o.id)))}>
                <Download className="mr-2 h-3.5 w-3.5" />
                Eksport
              </Button>
              {isAdmin && (
                <Button size="sm" variant="destructive" onClick={handleBulkDelete}>
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  O'chirish
                </Button>
              )}
            </div>
          </div>
        )}

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={paginatedOrders.length > 0 && selectedIds.size === paginatedOrders.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Sana</TableHead>
                    <TableHead>Mijoz</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead>Manzil / Mahsulotlar</TableHead>
                    <TableHead>Summa</TableHead>
                    <TableHead>To'lov</TableHead>
                    <TableHead>Qarz</TableHead>
                    <TableHead>Holat</TableHead>
                    {(isAdmin || isRop) && <TableHead>Mas'ul</TableHead>}
                    <TableHead className="text-right">Amallar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={(isAdmin || isRop) ? 11 : 10} className="py-10 text-center text-muted-foreground">
                        Zakazlar topilmadi
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedOrders.map((order, idx) => {
                      const debt = Number(order.total_amount) - Number(order.advance_payment || 0);
                      return (
                        <TableRow key={order.id} className="cursor-pointer" onClick={() => handleEdit(order)}>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={selectedIds.has(order.id)} onCheckedChange={() => toggleSelectOne(order.id)} />
                          </TableCell>
                          <TableCell className="text-muted-foreground">{(safePage - 1) * pageSize + idx + 1}</TableCell>
                          <TableCell className="text-sm">
                            <div>{format(new Date(order.order_date), "dd.MM.yyyy")}</div>
                            {order.created_at && <div className="text-xs text-muted-foreground">{format(new Date(order.created_at), "HH:mm")}</div>}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className={`text-xs font-semibold ${getAvatarColor(order.customer_name)}`}>
                                  {getInitials(order.customer_name)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium">{order.customer_name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{order.customer_phone || "—"}</TableCell>
                          <TableCell className="text-sm">
                            {order.region && order.district && (
                              <div>
                                {order.region}, {order.district}
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground">{order.items.length} ta mahsulot</div>
                          </TableCell>
                          <TableCell className="font-semibold">{Number(order.total_amount).toLocaleString()} so'm</TableCell>
                          <TableCell className="font-medium text-emerald-600">{Number(order.advance_payment || 0).toLocaleString()} so'm</TableCell>
                          <TableCell className={`font-medium ${debt > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            {debt.toLocaleString()} so'm
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={getDeliveryStatusMeta(order.delivery_status).badgeClassName}>
                              {getDeliveryStatusMeta(order.delivery_status).label}
                            </Badge>
                          </TableCell>
                          {(isAdmin || isRop) && (
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Avatar className="h-7 w-7">
                                  <AvatarFallback className={`text-[10px] font-semibold ${getAvatarColor(order.seller_name || "")}`}>
                                    {getInitials(order.seller_name)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="truncate text-sm">{order.seller_name}</span>
                              </div>
                            </TableCell>
                          )}
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(order)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleEdit(order)}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Tahrirlash
                                  </DropdownMenuItem>
                                  {isAdmin && order.status !== "pending" && (
                                    <DropdownMenuItem onClick={() => handleQuickStatusUpdate(order.id, "pending")}>Jarayonga qaytarish</DropdownMenuItem>
                                  )}
                                  {isAdmin && order.status !== "delivered" && (
                                    <DropdownMenuItem onClick={() => handleQuickStatusUpdate(order.id, "delivered")}>Tugallandi deb belgilash</DropdownMenuItem>
                                  )}
                                  {isAdmin && order.status !== "cancelled" && (
                                    <DropdownMenuItem onClick={() => handleQuickStatusUpdate(order.id, "cancelled")}>Bekor qilish</DropdownMenuItem>
                                  )}
                                  {isAdmin && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        onClick={() => handleDeleteOrder(order.id)}
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        O'chirish
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {filteredOrders.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span className="mr-1">Sahifada:</span>
              {[10, 25, 50, 100].map((size) => (
                <button
                  key={size}
                  onClick={() => {
                    setPageSize(size);
                    setCurrentPage(1);
                  }}
                  className={`rounded-md px-2 py-1 ${pageSize === size ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  {size}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .map((p, idx, arr) => (
                  <span key={p} className="flex items-center">
                    {idx > 0 && p - arr[idx - 1] > 1 && <span className="px-1 text-muted-foreground">...</span>}
                    <Button variant={p === safePage ? "default" : "outline"} size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p)}>
                      {p}
                    </Button>
                  </span>
                ))}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className={isAdmin ? "max-w-2xl max-h-[90vh] overflow-y-auto" : "max-w-md"}>
          <DialogHeader>
            <DialogTitle>Zakazni tahrirlash</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {isAdmin && (
              <>
                {/* Customer Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit_customer_name">Mijoz ismi *</Label>
                    <Input
                      id="edit_customer_name"
                      value={editFormData.customer_name}
                      onChange={(e) => setEditFormData({ ...editFormData, customer_name: e.target.value })}
                      placeholder="Ism Familiya"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="edit_customer_phone">Telefon 1</Label>
                      <Input
                        id="edit_customer_phone"
                        value={editFormData.customer_phone}
                        onChange={(e) => setEditFormData({ ...editFormData, customer_phone: e.target.value })}
                        placeholder="+998 XX XXX XX XX"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit_customer_phone2">Telefon 2</Label>
                      <Input
                        id="edit_customer_phone2"
                        value={editFormData.customer_phone2}
                        onChange={(e) => setEditFormData({ ...editFormData, customer_phone2: e.target.value })}
                        placeholder="+998 XX XXX XX XX"
                      />
                    </div>
                  </div>
                </div>

                {/* Region and District */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit_region">Viloyat</Label>
                    <Select
                      value={editFormData.region}
                      onValueChange={(value) => {
                        setEditFormData({ ...editFormData, region: value, district: '' });
                        setEditAvailableDistricts(regionsData[value] || []);
                      }}
                    >
                      <SelectTrigger id="edit_region">
                        <SelectValue placeholder="Viloyatni tanlang" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(regionsData).map((regionName) => (
                          <SelectItem key={regionName} value={regionName}>
                            {regionName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="edit_district">Tuman</Label>
                    <Select
                      value={editFormData.district}
                      onValueChange={(value) => setEditFormData({ ...editFormData, district: value })}
                      disabled={!editFormData.region}
                    >
                      <SelectTrigger id="edit_district">
                        <SelectValue placeholder="Tumanni tanlang" />
                      </SelectTrigger>
                      <SelectContent>
                        {editAvailableDistricts.map((district) => (
                          <SelectItem key={district} value={district}>
                            {district}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Products */}
                <div className="space-y-2">
                  <Label>Mahsulotlar</Label>
                  {editFormData.items.map((item, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <Input
                        placeholder="Mahsulot nomi"
                        value={item.product_name}
                        onChange={(e) => updateEditOrderItem(index, 'product_name', e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        placeholder="Soni"
                        value={item.quantity}
                        onChange={(e) => updateEditOrderItem(index, 'quantity', parseInt(e.target.value) || 1)}
                        className="w-20"
                        min={1}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeEditOrderItem(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addEditOrderItem}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Mahsulot qo'shish
                  </Button>
                </div>

                {/* Amounts */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit_total_amount">Umumiy summa *</Label>
                    <Input
                      id="edit_total_amount"
                      type="number"
                      value={editFormData.total_amount}
                      onChange={(e) => setEditFormData({ ...editFormData, total_amount: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit_advance_payment">Oldindan to'lov</Label>
                    <div className="flex gap-2">
                      <Input
                        id="edit_advance_payment"
                        type="number"
                        value={editFormData.advance_payment}
                        onChange={(e) => setEditFormData({ ...editFormData, advance_payment: parseFloat(e.target.value) || 0 })}
                        placeholder="0"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setEditFormData({ ...editFormData, advance_payment: editFormData.total_amount })}
                      >
                        To'landi
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Status */}
                <div className="space-y-2">
                  <Label htmlFor="edit-status">Status</Label>
                  <Select
                    value={editFormData.status}
                    onValueChange={(value) => setEditFormData({ ...editFormData, status: value })}
                  >
                    <SelectTrigger id="edit-status">
                      <SelectValue placeholder="Statusni tanlang" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Jarayonda</SelectItem>
                      <SelectItem value="delivered" className="bg-green-500 text-white focus:bg-green-600 focus:text-white">Tugallandi</SelectItem>
                      <SelectItem value="cancelled" className="bg-red-500 text-white focus:bg-red-600 focus:text-white">Bekor qilindi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Izoh</Label>
              <Textarea
                id="edit-notes"
                value={editFormData.notes}
                onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                placeholder="Qo'shimcha izoh..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Bekor qilish
            </Button>
            <Button onClick={handleUpdateOrder}>
              Saqlash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Order Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Yangi buyurtma yaratish</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="create_customer_name">Mijoz ismi *</Label>
                <Input
                  id="create_customer_name"
                  value={createFormData.customer_name}
                  onChange={(e) => setCreateFormData({ ...createFormData, customer_name: e.target.value })}
                  placeholder="Ism Familiya"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="create_customer_phone">Telefon 1</Label>
                  <Input
                    id="create_customer_phone"
                    value={createFormData.customer_phone}
                    onChange={(e) => setCreateFormData({ ...createFormData, customer_phone: e.target.value })}
                    placeholder="+998 XX XXX XX XX"
                  />
                </div>
                <div>
                  <Label htmlFor="create_customer_phone2">Telefon 2</Label>
                  <Input
                    id="create_customer_phone2"
                    value={createFormData.customer_phone2}
                    onChange={(e) => setCreateFormData({ ...createFormData, customer_phone2: e.target.value })}
                    placeholder="+998 XX XXX XX XX"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="create_region">Viloyat</Label>
                <Select
                  value={createFormData.region}
                  onValueChange={(value) => setCreateFormData({ ...createFormData, region: value, district: '' })}
                >
                  <SelectTrigger id="create_region">
                    <SelectValue placeholder="Viloyatni tanlang" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(regionsData).map((regionName) => (
                      <SelectItem key={regionName} value={regionName}>
                        {regionName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="create_district">Tuman</Label>
                <Select
                  value={createFormData.district}
                  onValueChange={(value) => setCreateFormData({ ...createFormData, district: value })}
                  disabled={!createFormData.region}
                >
                  <SelectTrigger id="create_district">
                    <SelectValue placeholder="Tumanni tanlang" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDistricts.map((district) => (
                      <SelectItem key={district} value={district}>
                        {district}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4 border-t pt-4">
              <div>
                <Label>Mahsulotlarni kiriting *</Label>
              </div>

              {createFormData.items.length > 0 && (
                <div className="space-y-2 border-t pt-4">
                  <Label>Tanlangan mahsulotlar</Label>
                  {createFormData.items.map((item, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <div className="flex-1">
                        <Input
                          placeholder="Mahsulot nomi"
                          value={item.product_name}
                          onChange={(e) => updateOrderItem(index, 'product_name', e.target.value)}
                        />
                      </div>
                      <div className="w-24">
                        <Input
                          type="number"
                          placeholder="Soni"
                          value={item.quantity}
                          onChange={(e) => updateOrderItem(index, 'quantity', parseInt(e.target.value) || 1)}
                          min="1"
                        />
                      </div>
                      {createFormData.items.length > 1 && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          onClick={() => removeOrderItem(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCreateFormData({
                      ...createFormData,
                      items: [...createFormData.items, { product_name: '', quantity: 1 }]
                    })}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Mahsulot qo'shish
                  </Button>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="total_amount">Umumiy summa (so'm) *</Label>
              <Input
                id="total_amount"
                type="number"
                value={createFormData.total_amount}
                onChange={(e) => setCreateFormData({ ...createFormData, total_amount: parseFloat(e.target.value) || 0 })}
                placeholder="Umumiy summani kiriting"
                min="0"
                required
              />
              {createFormData.total_amount > 0 && createFormData.items.filter(i => i.product_name).length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Har bir mahsulot narxi: {calculateItemPrice().toLocaleString()} so'm
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="advance_payment">Oldindan to'lov</Label>
              <Input
                id="advance_payment"
                type="number"
                value={createFormData.advance_payment}
                onChange={(e) => setCreateFormData({ ...createFormData, advance_payment: Number(e.target.value) })}
                placeholder="0"
              />
            </div>

            {createFormData.total_amount > 0 && (
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm font-medium">
                  Jami: {createFormData.total_amount.toLocaleString()} so'm
                </p>
                {createFormData.advance_payment > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Qoldiq: {(createFormData.total_amount - createFormData.advance_payment).toLocaleString()} so'm
                  </p>
                )}
              </div>
            )}

            <div>
              <Label htmlFor="notes">Izoh</Label>
              <Textarea
                id="notes"
                value={createFormData.notes}
                onChange={(e) => setCreateFormData({ ...createFormData, notes: e.target.value })}
                placeholder="Qo'shimcha ma'lumot"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Bekor qilish
            </Button>
            <Button type="button" onClick={handleCreateOrder}>
              Yaratish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AllOrders;
