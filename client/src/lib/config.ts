export const config = {
    // Use relative URLs by default (works with Vite proxy in dev, same-origin in prod)
    // Only use absolute URL if explicitly set via VITE_API_BASE_URL
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '',
  };