export interface User {
  _id: string;
  name: string;
  email: string | null;
  role: 'admin' | 'user';
}

export interface AuthResponse {
  access_token: string;
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
