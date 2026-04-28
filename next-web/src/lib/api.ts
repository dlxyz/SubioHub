import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { useAuthStore } from '@/store/auth';

function unwrapSuccessEnvelope(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  const record = payload as Record<string, unknown>;
  const hasEnvelope = ('code' in record || 'message' in record) && 'data' in record;
  return hasEnvelope ? record.data : payload;
}

type UnwrappedApiClient = Omit<AxiosInstance, 'get' | 'post' | 'put' | 'patch' | 'delete'> & {
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
  post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
};

// 基础 Axios 实例
export const api = axios.create({
  // 开发环境优先直连后端，兼容 Windows Web 端 + WSL 后端的本地联调方式。
  // 若显式配置 NEXT_PUBLIC_API_URL，则优先使用环境变量覆盖。
  baseURL:
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    (process.env.NODE_ENV === 'development' ? 'http://localhost:8080/api/v1' : '/api/v1'),
  timeout: 30000,
}) as UnwrappedApiClient;

// 拦截器：自动携带 Token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 拦截器：统一错误处理与 401 拦截
api.interceptors.response.use(
  ((response: AxiosResponse) => unwrapSuccessEnvelope(response.data)) as (
    value: AxiosResponse
  ) => AxiosResponse | Promise<AxiosResponse>,
  (error) => {
    if (error.response?.status === 401) {
      // Token 过期或未登录，清理状态并跳转登录
      useAuthStore.getState().logout();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    
    // 可以在这里统一提示错误信息
    const message =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.response?.data?.data?.message ||
      error.message ||
      '网络请求错误';
    console.error('[API Error]:', message);
    
    return Promise.reject(new Error(message));
  }
);
