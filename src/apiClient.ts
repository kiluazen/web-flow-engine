import axios, { AxiosInstance } from 'axios';

export class ApiClient {
  private baseUrl: string;
  private client: AxiosInstance;
  private apiKey: string;
  
  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey
      }
    });
  }
  
  /**
   * Get a cursor flow by ID
   */
  async getRecording(id: string): Promise<any> {
    try {
      const response = await this.client.get(`/api/recordings/${id}`);
      return response.data; // The flow data is returned directly now
    } catch (error) {
      console.error('Failed to fetch flow:', error);
      throw error;
    }
  }
  
  /**
   * Get list of available flows
   */
  async getRecordings(searchQuery?: string): Promise<any> {
    try {
      const params: any = {};
      if (searchQuery) {
        params.searchQuery = searchQuery;
      }
      
      const response = await this.client.get('/api/recordings', {
        params
      });
      return response.data.flows;
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
      const response = await this.client.get(`/api/recordings/${id}/validate`);
      return response.data.valid;
    } catch (error) {
      return false;
    }
  }

  /**
   * Perform semantic search for flows
   * @param query - The user's natural language query
   * @returns - The potential match { id: string, name: string } or null
   */
  async semanticSearch(query: string): Promise<{ id: string, name: string } | null> {
    try {
      console.log(`[API Client] Performing semantic search for query: "${query}"`);
      const response = await this.client.post('/api/flows/semantic-search', {
        query: query
      });

      // The endpoint returns { match: { id, name } | null }
      console.log('[API Client] Semantic search response:', response.data);
      return response.data.match; 
    } catch (error) {
      console.error('Failed semantic search:', error);
      // Check if the error is specific, e.g., function not found
      if (axios.isAxiosError(error) && error.response?.status === 501) {
        console.error("Semantic search functionality might not be configured on the backend.");
        // Optionally re-throw a more specific error or return a specific indicator
      }
      // For other errors, return null to indicate no match found due to error
      return null; 
    }
  }

  /**
   * Fetch organization theme settings
   * @returns - The theme object { brand_color, cursor_company_label, logo_url } or null
   */
  async getOrganizationTheme(): Promise<{ brand_color: string, cursor_company_label: string | null, logo_url: string | null } | null> {
    try {
      console.log(`[API Client] Fetching theme for current organization (via API Key)`);
      const response = await this.client.get(`/api/sdk/theme`);
      
      // The endpoint returns { theme: { ... } } or an error
      console.log('[API Client] Organization theme response:', response.data);
      return response.data.theme;
    } catch (error) {
      console.error('Failed to fetch organization theme:', error);
      // Check for 404 explicitly
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        console.warn(`[API Client] Theme not found for organization.`);
      } else {
        // Log other errors
        console.error('Error fetching theme details:', error);
      }
      // Return null if theme is not found or any other error occurs
      return null;
    }
  }
}