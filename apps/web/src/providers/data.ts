/* eslint-disable @typescript-eslint/no-empty-object-type */

// src/providers/data.ts

import type {
  BaseRecord,
  CreateParams,
  DataProvider,
  DeleteOneParams,
  GetListParams,
  GetOneParams,
  UpdateParams,
} from "@refinedev/core";

import { API_URL } from "./constants";
import { UNAUTHORIZED_EVENT, getToken } from "@/auth/session";

// ─────────────────────────────────────────────────────────────────────────────
// Matches the backend envelope: { success, message, data }
// The backend does not currently return a `total` count on list endpoints,
// so pagination "total" falls back to data.length for the current page.
//
// If you later add `total` to the Projects list response, the fallback
// below can use `json.total`.
// ─────────────────────────────────────────────────────────────────────────────

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  total?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Authentication
// ─────────────────────────────────────────────────────────────────────────────

function authHeader(): Record<string, string> {
  const token = getToken();

  return token
    ? { Authorization: `Bearer ${token}` }
    : {};
}

// ─────────────────────────────────────────────────────────────────────────────
// API Request Helper
// ─────────────────────────────────────────────────────────────────────────────

async function request<T>(
  url: string,
  init?: RequestInit,
): Promise<ApiEnvelope<T>> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
      ...(init?.headers ?? {}),
    },
  });

  const json = (await res.json().catch(() => null)) as
    | ApiEnvelope<T>
    | null;

  if (!res.ok) {
    // Session over — see AuthProvider.
    if (res.status === 401 && getToken()) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    const message =
      json?.message ??
      `Request failed with status ${res.status}`;

    throw new Error(message);
  }

  if (!json) {
    throw new Error("Empty or invalid response from server");
  }

  return json;
}

// ─────────────────────────────────────────────────────────────────────────────
// Query Builder
// ─────────────────────────────────────────────────────────────────────────────

function buildQuery(params: GetListParams): string {
  const query = new URLSearchParams();

  // NOTE:
  // This Refine version's Pagination type uses `currentPage`,
  // not `current`.

  const currentPage =
    params.pagination?.currentPage ?? 1;

  const pageSize =
    params.pagination?.pageSize ?? 10;

  if (params.pagination?.mode !== "off") {
    query.set("current", String(currentPage));
    query.set("limit", String(pageSize));
  }

  // Filters
  params.filters?.forEach((filter) => {
    if (
      "field" in filter &&
      filter.value !== undefined &&
      filter.value !== ""
    ) {
      query.set(
        filter.field,
        String(filter.value),
      );
    }
  });

  // Sorters
  params.sorters?.forEach((sorter) => {
    query.set("sort", sorter.field);
    query.set("order", sorter.order);
  });

  return query.toString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Refine Data Provider
// ─────────────────────────────────────────────────────────────────────────────

export const dataProvider: DataProvider = {
  getApiUrl: () => API_URL,

  // ───────────────────────────────────────────────────────────────────────────
  // GET LIST
  // ───────────────────────────────────────────────────────────────────────────

  getList: async <TData extends BaseRecord = BaseRecord>(
    params: GetListParams,
  ) => {
    const qs = buildQuery(params);

    const url = `${API_URL}/${params.resource}${
      qs ? `?${qs}` : ""
    }`;

    const json = await request<TData[]>(url);

    return {
      data: json.data,
      total: json.total ?? json.data.length,
    };
  },

  // ───────────────────────────────────────────────────────────────────────────
  // GET ONE
  // ───────────────────────────────────────────────────────────────────────────

  getOne: async <TData extends BaseRecord = BaseRecord>(
    params: GetOneParams,
  ) => {
    const url =
      `${API_URL}/${params.resource}/${params.id}`;

    const json = await request<TData>(url);

    return {
      data: json.data,
    };
  },

  // ───────────────────────────────────────────────────────────────────────────
  // CREATE
  // ───────────────────────────────────────────────────────────────────────────

  create: async <
    TData extends BaseRecord = BaseRecord,
    TVariables = {},
  >(
    params: CreateParams<TVariables>,
  ) => {
    const url =
      `${API_URL}/${params.resource}`;

    const json = await request<TData>(url, {
      method: "POST",
      body: JSON.stringify(params.variables),
    });

    return {
      data: json.data,
    };
  },

  // ───────────────────────────────────────────────────────────────────────────
  // UPDATE
  // ───────────────────────────────────────────────────────────────────────────

  update: async <
    TData extends BaseRecord = BaseRecord,
    TVariables = {},
  >(
    params: UpdateParams<TVariables>,
  ) => {
    const url =
      `${API_URL}/${params.resource}/${params.id}`;

    const json = await request<TData>(url, {
      method: "PATCH",
      body: JSON.stringify(params.variables),
    });

    return {
      data: json.data,
    };
  },

  // ───────────────────────────────────────────────────────────────────────────
  // DELETE ONE
  // ───────────────────────────────────────────────────────────────────────────

  deleteOne: async <
    TData extends BaseRecord = BaseRecord,
    TVariables = {},
  >(
    params: DeleteOneParams<TVariables>,
  ) => {
    const url =
      `${API_URL}/${params.resource}/${params.id}`;

    const json = await request<TData>(url, {
      method: "DELETE",
    });

    return {
      data: json.data,
    };
  },

  // ───────────────────────────────────────────────────────────────────────────
  // NOT IMPLEMENTED YET
  // ───────────────────────────────────────────────────────────────────────────

  getMany: async () => {
    throw new Error(
      "getMany is not implemented for this data provider yet.",
    );
  },

  createMany: async () => {
    throw new Error(
      "createMany is not implemented for this data provider yet.",
    );
  },

  updateMany: async () => {
    throw new Error(
      "updateMany is not implemented for this data provider yet.",
    );
  },

  deleteMany: async () => {
    throw new Error(
      "deleteMany is not implemented for this data provider yet.",
    );
  },

  custom: async () => {
    throw new Error(
      "custom requests are not implemented for this data provider yet.",
    );
  },
};