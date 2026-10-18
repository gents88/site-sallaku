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

/** Canali da cui il backend può inviare il codice in questo momento (GET /auth/otp/channels). */
export interface OtpChannels {
  email: boolean;
  sms: boolean;
}

/** Returned by /auth/register: the account exists but is unverified — no tokens yet. */
export interface RegisterResponse {
  message: string;
  email: string;
}
