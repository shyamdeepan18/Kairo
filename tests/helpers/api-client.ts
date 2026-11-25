/**
 * API Test Client for Kairo ERP Fastify Backend
 */
export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    isSystemAdmin: boolean;
  };
}

export interface ContextResponse {
  accessToken: string;
  context: {
    companyId: string;
    companyName: string;
    plantId: string;
  };
}

export class ErpApiClient {
  private baseUrl: string;
  private token: string | null = null;
  public user: AuthResponse['user'] | null = null;
  public companyId: string | null = null;
  public plantId: string | null = null;

  constructor(baseUrl: string = process.env.API_URL || 'http://localhost:3000/api') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  setToken(token: string) {
    this.token = token;
  }

  async login(email: string = 'shyam18@kairo.com', password: string = 'Shyam18'): Promise<AuthResponse> {
    const res = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Login failed (${res.status}): ${err}`);
    }

    const data = (await res.json()) as AuthResponse;
    this.token = data.accessToken;
    this.user = data.user;
    return data;
  }

  async selectContext(companyId: string, plantId?: string): Promise<ContextResponse> {
    if (!this.token) {
      await this.login();
    }

    const res = await fetch(`${this.baseUrl}/auth/select-context`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ companyId, plantId }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Select context failed (${res.status}): ${err}`);
    }

    const data = (await res.json()) as ContextResponse;
    this.token = data.accessToken; // Context-scoped token
    this.companyId = data.context.companyId;
    this.plantId = data.context.plantId;
    return data;
  }

  async get<T = any>(endpoint: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    let url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    if (params) {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) sp.append(k, String(v));
      }
      const qs = sp.toString();
      if (qs) url += `?${qs}`;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      let parsed: any = null;
      try { parsed = JSON.parse(errText); } catch {}
      const err: any = new Error(`GET ${endpoint} failed (${res.status}): ${errText}`);
      err.status = res.status;
      err.data = parsed;
      throw err;
    }

    return (await res.json()) as T;
  }

  async post<T = any>(endpoint: string, body?: any): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body ?? {}),
    });

    if (!res.ok) {
      const errText = await res.text();
      let parsed: any = null;
      try { parsed = JSON.parse(errText); } catch {}
      const err: any = new Error(`POST ${endpoint} failed (${res.status}): ${errText}`);
      err.status = res.status;
      err.data = parsed;
      throw err;
    }

    return (await res.json()) as T;
  }

  async put<T = any>(endpoint: string, body?: any): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const errText = await res.text();
      let parsed: any = null;
      try { parsed = JSON.parse(errText); } catch {}
      const err: any = new Error(`PUT ${endpoint} failed (${res.status}): ${errText}`);
      err.status = res.status;
      err.data = parsed;
      throw err;
    }

    return (await res.json()) as T;
  }

  async patch<T = any>(endpoint: string, body?: any): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const errText = await res.text();
      let parsed: any = null;
      try { parsed = JSON.parse(errText); } catch {}
      const err: any = new Error(`PATCH ${endpoint} failed (${res.status}): ${errText}`);
      err.status = res.status;
      err.data = parsed;
      throw err;
    }

    return (await res.json()) as T;
  }

  async delete<T = any>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      let parsed: any = null;
      try { parsed = JSON.parse(errText); } catch {}
      const err: any = new Error(`DELETE ${endpoint} failed (${res.status}): ${errText}`);
      err.status = res.status;
      err.data = parsed;
      throw err;
    }

    return (await res.json()) as T;
  }
}
