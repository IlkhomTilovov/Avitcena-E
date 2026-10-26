const API_URL = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "daraja_erp_token";

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = tokenStorage.get();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

const get = <T>(path: string) => request<T>(path, { method: "GET" });
const post = <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined });
const patch = <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined });
const del = <T>(path: string) => request<T>(path, { method: "DELETE" });

// Wire format matches the original Supabase column naming (snake_case) so that
// pages written against Supabase need minimal changes beyond the fetch call itself.
export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  company_id: string | null;
  profile_role: "admin" | "seller";
  roles: Array<"admin" | "rop" | "sotuvchi" | "super_admin">;
}

export const api = {
  auth: {
    signUp: (data: { email: string; password: string; fullName: string }) =>
      post<{ token: string; user: AuthUser }>("/auth/signup", data),
    signIn: (data: { email: string; password: string }) => post<{ token: string; user: AuthUser }>("/auth/signin", data),
    me: () => get<{ user: AuthUser }>("/auth/me"),
  },
  profiles: {
    list: () => get<any[]>("/profiles"),
    get: (id: string) => get<any>(`/profiles/${id}`),
    update: (id: string, data: any) => patch<any>(`/profiles/${id}`, data),
  },
  products: {
    list: () => get<any[]>("/products"),
    create: (data: any) => post<any>("/products", data),
    update: (id: string, data: any) => patch<any>(`/products/${id}`, data),
    remove: (id: string) => del<void>(`/products/${id}`),
  },
  stages: {
    list: () => get<any[]>("/stages"),
    create: (data: any) => post<any>("/stages", data),
    update: (id: string, data: any) => patch<any>(`/stages/${id}`, data),
    remove: (id: string) => del<void>(`/stages/${id}`),
  },
  deliveryStatuses: {
    list: () => get<any[]>("/delivery-statuses"),
    create: (data: any) => post<any>("/delivery-statuses", data),
    update: (id: string, data: any) => patch<any>(`/delivery-statuses/${id}`, data),
    remove: (id: string) => del<void>(`/delivery-statuses/${id}`),
  },
  couriers: {
    list: () => get<any[]>("/couriers"),
    create: (data: any) => post<any>("/couriers", data),
    update: (id: string, data: any) => patch<any>(`/couriers/${id}`, data),
    remove: (id: string) => del<void>(`/couriers/${id}`),
  },
  leads: {
    list: () => get<any[]>("/leads"),
    get: (id: string) => get<any>(`/leads/${id}`),
    create: (data: any) => post<any>("/leads", data),
    update: (id: string, data: any) => patch<any>(`/leads/${id}`, data),
    remove: (id: string) => del<void>(`/leads/${id}`),
    comments: {
      list: (leadId: string) => get<any[]>(`/leads/${leadId}/comments`),
      create: (leadId: string, comment: string) => post<any>(`/leads/${leadId}/comments`, { comment }),
    },
  },
  orders: {
    list: () => get<any[]>("/orders"),
    get: (id: string) => get<any>(`/orders/${id}`),
    create: (data: any) => post<any>("/orders", data),
    update: (id: string, data: any) => patch<any>(`/orders/${id}`, data),
    remove: (id: string) => del<void>(`/orders/${id}`),
  },
  tasks: {
    list: () => get<any[]>("/tasks"),
    create: (data: any) => post<any>("/tasks", data),
    update: (id: string, data: any) => patch<any>(`/tasks/${id}`, data),
    remove: (id: string) => del<void>(`/tasks/${id}`),
  },
  admin: {
    listUsers: () => get<any[]>("/admin/users"),
    createUser: (data: {
      email: string;
      password: string;
      full_name: string;
      phone?: string;
      role: "admin" | "rop" | "sotuvchi";
    }) => post<{ success: boolean; user: { id: string; email: string } }>("/admin/users", data),
    deleteUser: (id: string) => del<{ success: boolean }>(`/admin/users/${id}`),
  },
  employees: {
    list: (params?: { from?: string; to?: string; role?: string; department?: string; status?: string; search?: string }) => {
      const qs = new URLSearchParams(Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== "") as [string, string][]);
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      return get<any[]>(`/employees${suffix}`);
    },
    get: (id: string, params?: { from?: string; to?: string }) => {
      const qs = new URLSearchParams(Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== "") as [string, string][]);
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      return get<any>(`/employees/${id}${suffix}`);
    },
  },
  kpiTargets: {
    list: () => get<any[]>("/kpi-targets"),
    create: (data: { role: string; user_id?: string | null; metric_key: string; target_value: number; weight?: number; period?: string }) =>
      post<any>("/kpi-targets", data),
    update: (id: string, data: Partial<{ target_value: number; weight: number; period: string; is_active: boolean }>) =>
      patch<any>(`/kpi-targets/${id}`, data),
    remove: (id: string) => del<void>(`/kpi-targets/${id}`),
  },
  deliveries: {
    list: () => get<any[]>("/deliveries"),
    history: (id: string) => get<any[]>(`/deliveries/${id}/history`),
    updateByOrder: (
      orderId: string,
      data: Partial<{
        // A built-in DeliveryStatus or a custom delivery_statuses row's id.
        status: string;
        courier_name: string | null;
        courier_phone: string | null;
        delivery_fee: number | null;
        delivery_date: string | null;
        rejection_reason: string | null;
        rejection_note: string | null;
        followup_reason: string | null;
        followup_note: string | null;
        followup_date: string | null;
        notes: string | null;
      }>,
    ) => patch<any>(`/deliveries/order/${orderId}`, data),
  },
  uploads: {
    upload: async (file: File): Promise<{ url: string }> => {
      const token = tokenStorage.get();
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_URL}/uploads`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new ApiError(data?.error || "Upload failed", res.status);
      return data;
    },
  },
  integrations: {
    telegramOrder: (body: unknown) => post<any>("/integrations/telegram/order", body),
    telegramTaskReminder: (body: unknown) => post<any>("/integrations/telegram/task-reminder", body),
    triggerSheetsSync: () => post<any>("/integrations/sheets/trigger-sync"),
  },
};
