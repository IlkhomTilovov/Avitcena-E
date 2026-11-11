import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { regionsData } from "@/lib/regions";

interface OrderItemDraft {
  product_name: string;
  quantity: number;
}

interface SoldOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: any;
  newStageId: string;
  sellerName: string;
  onSuccess: () => void;
}

// Moving a lead to "Sotildi" used to be two separate actions for the seller:
// change the stage, then separately open "Barcha zakazlar" and fill in a new
// order by hand to get a Telegram notification out. This dialog folds both
// into the one action: it only touches the lead's stage (and the order the
// backend auto-creates for it, see server/src/routes/leads.ts) once this form
// is submitted, so cancelling leaves the lead exactly where it was.
export function SoldOrderDialog({ open, onOpenChange, lead, newStageId, sellerName, onSuccess }: SoldOrderDialogProps) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerPhone2, setCustomerPhone2] = useState("");
  const [region, setRegion] = useState("");
  const [district, setDistrict] = useState("");
  const [items, setItems] = useState<OrderItemDraft[]>([{ product_name: "", quantity: 1 }]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [advancePayment, setAdvancePayment] = useState(0);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availableDistricts: string[] = region ? regionsData[region] || [] : [];

  useEffect(() => {
    if (!open || !lead) return;
    setCustomerName(lead.customer_name || "");
    setCustomerPhone(lead.customer_phone || "");
    setCustomerPhone2("");
    setRegion("");
    setDistrict("");
    setItems(
      Array.isArray(lead.product_names) && lead.product_names.length > 0
        ? lead.product_names.map((name: string) => ({ product_name: name, quantity: 1 }))
        : [{ product_name: "", quantity: 1 }],
    );
    setTotalAmount(Number(lead.price) || 0);
    setAdvancePayment(0);
    setNotes("");
  }, [open, lead]);

  const calculateItemPrice = () => {
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    return totalQuantity > 0 ? totalAmount / totalQuantity : 0;
  };

  const updateOrderItem = (index: number, field: "product_name" | "quantity", value: any) => {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    setItems(next);
  };

  const removeOrderItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleClose = () => onOpenChange(false);

  const handleSubmit = async () => {
    if (!customerName.trim()) {
      toast.error("Mijoz ismini kiriting");
      return;
    }

    const validItems = items.filter((item) => item.product_name && item.quantity > 0);
    if (validItems.length === 0) {
      toast.error("Kamida bitta mahsulot tanlang");
      return;
    }

    if (!totalAmount || totalAmount <= 0) {
      toast.error("Umumiy summani kiriting");
      return;
    }

    setIsSubmitting(true);

    try {
      const itemPrice = calculateItemPrice();

      // 1. Move the lead into "Sotildi". The backend auto-creates a bare
      // order for it right here (see leads.ts), and syncs totalAmount since
      // price is included in the same request.
      await api.leads.update(lead.id, {
        stage: newStageId,
        price: totalAmount,
        product_names: validItems.map((i) => i.product_name),
      });

      // 2. Find the order the stage change just created, then fill in the
      // details this form collected that the bare auto-created order doesn't have.
      const orders = await api.orders.list();
      const order = orders.find((o: any) => o.lead_id === lead.id);
      if (!order) throw new Error("Buyurtma topilmadi");

      const updatedOrder = await api.orders.update(order.id, {
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_phone2: customerPhone2,
        region,
        district,
        notes,
        advance_payment: advancePayment,
        total_amount: totalAmount,
        items: validItems.map((item) => ({
          product_name: item.product_name,
          quantity: item.quantity,
          price: itemPrice,
        })),
      });

      // 3. Notify Telegram, same as a manually created order would.
      try {
        await api.integrations.telegramOrder({
          order: {
            order_id: updatedOrder.id,
            order_number: updatedOrder.order_number,
            customer_name: customerName,
            customer_phone: customerPhone,
            customer_phone2: customerPhone2,
            region,
            district,
            products: validItems.map((item) => ({
              product_name: item.product_name,
              quantity: item.quantity,
              price: itemPrice,
            })),
            total_amount: totalAmount,
            advance_payment: advancePayment,
            notes,
            seller_name: sellerName || "Noma'lum",
          },
          action: "create",
        });
      } catch (telegramError) {
        console.error("Telegram yuborishda xatolik:", telegramError);
      }

      toast.success('Lid "Sotildi" bosqichiga o\'tkazildi va buyurtma yaratildi!');
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("Error creating sold order:", error);
      toast.error(error instanceof ApiError ? error.message : "Xatolik yuz berdi");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Buyurtmani yakunlash: {lead.customer_name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <p className="text-sm text-muted-foreground">
            "Sotildi" bosqichiga o'tkazish uchun buyurtma ma'lumotlarini to'ldiring — shu bilan birga Telegramga xabar yuboriladi.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sold_customer_name">Mijoz ismi *</Label>
              <Input
                id="sold_customer_name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ism Familiya"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="sold_customer_phone">Telefon 1</Label>
                <Input
                  id="sold_customer_phone"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+998 XX XXX XX XX"
                />
              </div>
              <div>
                <Label htmlFor="sold_customer_phone2">Telefon 2</Label>
                <Input
                  id="sold_customer_phone2"
                  value={customerPhone2}
                  onChange={(e) => setCustomerPhone2(e.target.value)}
                  placeholder="+998 XX XXX XX XX"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sold_region">Viloyat</Label>
              <Select value={region} onValueChange={(value) => { setRegion(value); setDistrict(""); }}>
                <SelectTrigger id="sold_region">
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
              <Label htmlFor="sold_district">Tuman</Label>
              <Select value={district} onValueChange={setDistrict} disabled={!region}>
                <SelectTrigger id="sold_district">
                  <SelectValue placeholder="Tumanni tanlang" />
                </SelectTrigger>
                <SelectContent>
                  {availableDistricts.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
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

            {items.length > 0 && (
              <div className="space-y-2 border-t pt-4">
                <Label>Tanlangan mahsulotlar</Label>
                {items
                  .map((item, index) => ({ item, index }))
                  .map(({ item, index }) => (
                    <div key={index} className="flex items-center gap-2">
                      <div className="flex-1">
                        <Input
                          placeholder="Mahsulot nomi"
                          value={item.product_name}
                          onChange={(e) => updateOrderItem(index, "product_name", e.target.value)}
                        />
                      </div>
                      <div className="w-24">
                        <Input
                          type="number"
                          placeholder="Soni"
                          value={item.quantity}
                          onChange={(e) => updateOrderItem(index, "quantity", parseInt(e.target.value) || 1)}
                          min="1"
                        />
                      </div>
                      {items.length > 1 && (
                        <Button type="button" variant="destructive" size="icon" onClick={() => removeOrderItem(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setItems([...items, { product_name: "", quantity: 1 }])}
                  className="w-full"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Mahsulot qo'shish
                </Button>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="sold_total_amount">Umumiy summa (so'm) *</Label>
            <Input
              id="sold_total_amount"
              type="number"
              value={totalAmount}
              onChange={(e) => setTotalAmount(parseFloat(e.target.value) || 0)}
              placeholder="Umumiy summani kiriting"
              min="0"
              required
            />
            {totalAmount > 0 && items.filter((i) => i.product_name).length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">Har bir mahsulot narxi: {calculateItemPrice().toLocaleString()} so'm</p>
            )}
          </div>

          <div>
            <Label htmlFor="sold_advance_payment">Oldindan to'lov</Label>
            <Input
              id="sold_advance_payment"
              type="number"
              value={advancePayment}
              onChange={(e) => setAdvancePayment(Number(e.target.value))}
              placeholder="0"
            />
          </div>

          {totalAmount > 0 && (
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm font-medium">Jami: {totalAmount.toLocaleString()} so'm</p>
              {advancePayment > 0 && (
                <p className="text-sm text-muted-foreground">Qoldiq: {(totalAmount - advancePayment).toLocaleString()} so'm</p>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="sold_notes">Izoh</Label>
            <Textarea
              id="sold_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Qo'shimcha ma'lumot"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Bekor qilish
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Saqlanmoqda..." : "Sotildi va yuborish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
