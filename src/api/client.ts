import axios from 'axios';

/**
 * API Client for communicating with the Cursor Flow backend
 */
export class ApiClient {
  private baseUrl: string;
  
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }
  
  /**
   * Get a recording by ID
   */
  async getRecording(id: string): Promise<any> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/recordings/${id}`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch recording:', error);
      throw error;
    }
  }
  
  /**
   * Get customizations for a recording
   */
  async getCustomizations(id: string): Promise<any> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/recordings/${id}/customizations`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch customizations:', error);
      throw error;
    }
  }
  
  /**
   * Get list of available recordings
   */
  async getRecordings(): Promise<any> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/recordings`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch recordings list:', error);
      throw error;
    }
  }
  
  /**
   * Check if the API is available
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/health`);
      return response.data.status === 'ok';
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Validate a recording
   */
  async validateRecording(id: string): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/recordings/${id}/validate`);
      return response.data.valid;
    } catch (error) {
      return false;
    }
  }
} 