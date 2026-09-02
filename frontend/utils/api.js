import axios from "axios";
import * as SecureStore from 'expo-secure-store';

const BASE_URL = "https://node2.samtech.qzz.io";

const api = axios.create({
  baseURL: BASE_URL,
});

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // If data is FormData, let Axios set the Content-Type automatically
  if (config.data instanceof FormData) {
    config.headers['Content-Type'] = 'multipart/form-data';
  }
  // For other data types, set Content-Type to application/json if not already set
  if (!config.headers['Content-Type']) {
    config.headers['Content-Type'] = 'application/json';
  }
  return config;
});

export default api;