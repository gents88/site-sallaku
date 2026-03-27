export interface User {
  _id: string;
  name: string;
  email: string | null;
  role: 'admin' | 'user';
}

export interface AuthResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  user: User;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

export interface OtpRequestResponse {
  message: string;
}
