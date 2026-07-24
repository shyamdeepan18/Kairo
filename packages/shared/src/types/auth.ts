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
  iat: number;
  exp: number;
}
