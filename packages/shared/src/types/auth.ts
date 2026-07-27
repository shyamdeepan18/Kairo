// Shared auth types used by both API (response shaping) and Web (state management)

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  isSystemAdmin: boolean;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface RefreshResponse {
  accessToken: string;
  user: AuthUser;
}

// JWT payload shape — access token claims
export interface JwtPayload {
  sub: string;         // userId
  sessionId: string;
  email: string;
  fullName: string;
  isSystemAdmin: boolean;
  activeCompanyId?: string;
  activePlantId?: string | null;
  iat: number;
  exp: number;
}

export interface ContextOption {
  id: string;
  name: string;
}

export interface ContextOptionsResponse {
  companies: ContextOption[];
}

export interface SelectContextResponse {
  accessToken: string;
  context: {
    companyId: string;
    companyName: string;
    plantId: string | null;
  };
}

