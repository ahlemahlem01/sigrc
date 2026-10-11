import axios from 'axios';
import { ACTION_PLAN_API_URL } from '../config/apiEnv';

export const actionPlanApi = axios.create({
  baseURL: ACTION_PLAN_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Single interceptor handling token injection for all Action Plan requests
actionPlanApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});