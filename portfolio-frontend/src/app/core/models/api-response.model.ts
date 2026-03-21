export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ContactPayload {
  name: string;
  email: string;
  subject: string;
  message: string;
}
