import Airtable from 'airtable';
import { logger } from '../utils/logger.js';

class AirtableService {
  constructor() {
    this.base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
      .base(process.env.AIRTABLE_BASE_ID);
    this.table = this.base(process.env.AIRTABLE_TABLE_NAME);
  }

  async getUnprocessedEvents() {
    try {
      const records = await this.table.select({
        filterByFormula: "AND({status} != 'Created', {status} != 'Error', {title} != '')"
      }).all();

      const events = records.map(record => ({
        airtableId: record.id,
        ...record.fields
      }));

      logger.info(`Found ${events.length} unprocessed events in Airtable`);
      return events;
    } catch (error) {
      logger.error('Failed to fetch events from Airtable:', error.message);
      throw error;
    }
  }

  async updateEventStatus(recordId, status, universeEventId = null, errorMessage = null, clientMutationId = null) {
    try {
      const updateData = {
        status,
        lastUpdated: new Date().toISOString().split('T')[0]
      };

      if (universeEventId) {
        updateData.universeEventId = universeEventId;
      }

      if (errorMessage) {
        updateData.errorMessage = errorMessage;
      }

      if (clientMutationId) {
        updateData.clientMutationId = clientMutationId;
      }

      await this.table.update(recordId, updateData);
      logger.info(`Updated Airtable record ${recordId} with status: ${status}`);
    } catch (error) {
      logger.error(`Failed to update Airtable record ${recordId}:`, error.message);
      throw error;
    }
  }

  async markAsCreated(recordId, universeEventId, universeUrl, clientMutationId = null) {
    try {
      const updateData = {
        status: 'Created',
        universeEventId,
        universeUrl,
        createdAt: new Date().toISOString().split('T')[0],
        lastUpdated: new Date().toISOString().split('T')[0]
      };

      if (clientMutationId) {
        updateData.clientMutationId = clientMutationId;
      }

      await this.table.update(recordId, updateData);
    } catch (error) {
      logger.error(`Failed to mark record ${recordId} as created:`, error.message);
      throw error;
    }
  }

  async markAsError(recordId, errorMessage) {
    try {
      await this.table.update(recordId, {
        status: 'Error',
        errorMessage: errorMessage.substring(0, 1000), // Limit error message length
        lastUpdated: new Date().toISOString().split('T')[0]
      });
    } catch (error) {
      logger.error(`Failed to mark record ${recordId} as error:`, error.message);
    }
  }
}

export default AirtableService;