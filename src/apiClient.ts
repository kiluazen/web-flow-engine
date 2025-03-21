import axios, { AxiosInstance } from 'axios';

export class ApiClient {
  private baseUrl: string;
  private client: AxiosInstance;
  private organizationId: string;
  
  constructor(baseUrl: string, organizationId: string) {
    this.baseUrl = baseUrl;
    this.organizationId = organizationId;
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  
  /**
   * Get a cursor flow by ID
   */
  async getRecording(id: string): Promise<any> {
    try {
      const response = await this.client.get(`/api/recordings/${id}`, {
        params: { organizationId: this.organizationId }
      });
      return response.data; // The flow data is returned directly now
    } catch (error) {
      console.error('Failed to fetch flow:', error);
      throw error;
    }
  }
  
  /**
   * Get list of available flows
   */
  async getRecordings(): Promise<any> {
    try {
      const response = await this.client.get('/api/recordings', {
        params: { organizationId: this.organizationId }
      });
      return response.data.flows; // API now returns 'flows' instead of 'recordings'
    } catch (error) {
      console.error('Failed to fetch flows list:', error);
      throw error;
    }
  }
  
  /**
   * Get annotations for steps (backward compatibility)
   * Note: This is now redundant as annotations are included in the flow data,
   * but kept for backward compatibility
   */
  async getTexts(id: string): Promise<any> {
    try {
      // First get the full flow data
      const flowData = await this.getRecording(id);
      
      // Convert steps to customization format for backward compatibility
      return flowData.steps.map((step: any) => ({
        stepIndex: step.position, // Use position as stepIndex
        popupText: step.annotation,
        isHidden: false
      }));
    } catch (error) {
      console.error('Failed to extract annotations:', error);
      throw error;
    }
  }
  
  /**
   * Check if the API is available
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/health');
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
      const response = await this.client.get(`/api/recordings/${id}/validate`, {
        params: { organizationId: this.organizationId }
      });
      return response.data.valid;
    } catch (error) {
      return false;
    }
  }
}