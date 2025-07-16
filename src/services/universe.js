import { GraphQLClient, gql } from 'graphql-request';
import axios from 'axios';
import { logger } from '../utils/logger.js';

class UniverseService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiration = null;
    this.client = null;
  }

  async getAccessToken() {
    if (this.accessToken && this.tokenExpiration > Date.now()) {
      return this.accessToken;
    }

    try {
      const response = await axios.post('https://www.universe.com/oauth/token', {
        grant_type: 'client_credentials',
        client_id: process.env.UNIVERSE_CLIENT_ID,
        client_secret: process.env.UNIVERSE_CLIENT_SECRET,
      });

      this.accessToken = response.data.access_token;
      this.tokenExpiration = Date.now() + response.data.expires_in * 1000;
      
      this.client = new GraphQLClient('https://www.universe.com/graphql', {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      logger.info('Universe access token obtained');
      return this.accessToken;
    } catch (error) {
      logger.error('Failed to get Universe access token:', error.response?.data || error.message);
      throw error;
    }
  }

  async createEvent(eventData) {
    await this.getAccessToken();

    // Using the official Universe GraphQL API structure
    const mutation = gql`
      mutation EventCreate($input: EventCreateInput!) {
        eventCreate(input: $input) {
          clientMutationId
          errors
          event {
            id
            title
            slug
            state
            privacy
            virtual
            venueName
            address
            latitude
            longitude
            timeSlots {
              nodes {
                id
                startAt
                endAt
              }
            }
            rates {
              nodes {
                id
                name
                price
                displayPrice
                state
              }
            }
          }
        }
      }
    `;

    try {
      const input = this.transformToEventCreateInput(eventData);
      logger.info(`Creating event: ${eventData.title} (ClientMutationId: ${input.clientMutationId})`);
      
      const result = await this.client.request(mutation, { input });
      
      if (result.eventCreate.errors && result.eventCreate.errors.length > 0) {
        throw new Error(`Universe API errors: ${result.eventCreate.errors.join(', ')}`);
      }

      const event = result.eventCreate.event;
      const returnedMutationId = result.eventCreate.clientMutationId;
      
      logger.info(`Event created successfully: ${event.title} (ID: ${event.id}, MutationId: ${returnedMutationId})`);
      return { ...event, clientMutationId: returnedMutationId };
    } catch (error) {
      logger.error(`Failed to create event: ${eventData.title}`, error.message);
      if (error.response?.errors) {
        logger.error('GraphQL errors:', error.response.errors);
      }
      throw error;
    }
  }

  generateClientMutationId(operation, identifier = null) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const id = identifier ? `-${identifier}` : '';
    return `${operation}-${timestamp}-${random}${id}`;
  }

  transformToEventCreateInput(airtableData) {
    // Build the minimal event structure matching the network payload examples
    const eventInput = {
      clientMutationId: this.generateClientMutationId('event-create', airtableData.airtableId),
      publish: airtableData.publish === true,
      event: {
        title: airtableData.title,
        descriptionHtml: this.formatDescription(airtableData.description),
        address: airtableData.address,
        latitude: airtableData.latitude ? parseFloat(airtableData.latitude) : 43.653226,
        longitude: airtableData.longitude ? parseFloat(airtableData.longitude) : -79.3831843,
        category: {
          id: airtableData.categoryId || '52cc8f6154c5317943000003'
        },
        timeSlots: [],
        rates: []
      }
    };

    // Add time slots with exact format from network payload
    if (airtableData.startDate && airtableData.startTime && airtableData.endDate && airtableData.endTime) {
      const startDateTime = this.combineDateAndTime(airtableData.startDate, airtableData.startTime);
      const endDateTime = this.combineDateAndTime(airtableData.endDate, airtableData.endTime);
      
      eventInput.event.timeSlots.push({
        startAt: startDateTime,
        endAt: endDateTime
      });
    }

    // Add ticket rates with attributes wrapper (required by Universe API)
    if (airtableData.rateName && airtableData.ratePrice) {
      eventInput.event.rates.push({
        attributes: {
          name: airtableData.rateName,
          price: parseFloat(airtableData.ratePrice), // Keep as dollars, not cents
          capacity: airtableData.rateCapacity ? parseInt(airtableData.rateCapacity) : null,
          description: airtableData.rateDescription || '',
          state: 'ACTIVE'
        }
      });
    }

    // Add privacy field with correct mapping
    if (airtableData.privacy) {
      // Map Airtable values to Universe values
      let privacyValue = airtableData.privacy.toLowerCase();
      if (privacyValue === 'private') {
        privacyValue = 'unlisted'; // Map "private" to "unlisted"
      }
      eventInput.event.privacy = privacyValue;
    }

    if (airtableData.virtual === true) {
      eventInput.event.virtual = true;
    }

    if (airtableData.venueName) {
      eventInput.event.venueName = airtableData.venueName;
    }

    if (airtableData.region) {
      eventInput.event.region = airtableData.region;
    }

    if (airtableData.allowWaitlist === true) {
      eventInput.event.allowWaitlist = true;
    }

    if (airtableData.socialButtons === true) {
      eventInput.event.socialButtons = true;
    }

    if (airtableData.hiddenDate === true) {
      eventInput.event.hiddenDate = true;
    }

    if (airtableData.timedEntry === true) {
      eventInput.event.timedEntry = true;
    }

    if (airtableData.maxQuantity) {
      eventInput.event.maxQuantity = parseInt(airtableData.maxQuantity);
    }

    if (airtableData.transactionCurrency) {
      eventInput.event.transactionCurrency = airtableData.transactionCurrency;
    }

    if (airtableData.availableCountries) {
      eventInput.event.availableCountries = airtableData.availableCountries.split(',').map(c => c.trim());
    }

    // countryCode is not supported in Event_EventCreate - removed

    // Analytics fields
    if (airtableData.tiktokPixelCodes) {
      eventInput.event.tiktokPixelCodes = airtableData.tiktokPixelCodes.split(',').map(c => c.trim());
    }

    if (airtableData.facebookPixelCodes) {
      eventInput.event.facebookPixelCodes = airtableData.facebookPixelCodes.split(',').map(c => c.trim());
    }

    if (airtableData.googleAnalytics4Id) {
      eventInput.event.googleAnalytics4Id = airtableData.googleAnalytics4Id;
    }

    return eventInput;
  }

  formatDescription(description) {
    if (!description) return '';
    
    // Simple HTML formatting - convert line breaks to <p> tags
    return description
      .split('\n\n')
      .map(paragraph => paragraph.trim())
      .filter(paragraph => paragraph.length > 0)
      .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  combineDateAndTime(date, time) {
    // Combine date (YYYY-MM-DD) with time (HH:MM) to create ISO datetime
    let dateStr;
    
    if (typeof date === 'string') {
      // If date is already a string, use it directly
      dateStr = date.split('T')[0]; // Take only date part if datetime string
    } else {
      // If date is a Date object, format it
      dateStr = new Date(date).toISOString().split('T')[0];
    }
    
    // Ensure time is in HH:MM format
    const timeStr = time.padStart(5, '0'); // Pad to ensure HH:MM format
    
    // Return in ISO format like "2025-07-31T01:00:00"
    return `${dateStr}T${timeStr}:00`;
  }

  formatDateTime(dateTime) {
    // Universe expects TimeWithoutTz format
    if (typeof dateTime === 'string') {
      return dateTime.replace('T', ' ').replace('Z', '');
    }
    
    const date = new Date(dateTime);
    return date.toISOString().replace('T', ' ').replace('Z', '');
  }

  async publishEvent(eventId) {
    await this.getAccessToken();

    const mutation = gql`
      mutation EventPublish($input: EventPublishInput!) {
        eventPublish(input: $input) {
          clientMutationId
          errors
          event {
            id
            state
            privacy
          }
        }
      }
    `;

    try {
      const input = {
        clientMutationId: this.generateClientMutationId('event-publish', eventId),
        id: eventId
      };

      logger.info(`Publishing event: ${eventId} (ClientMutationId: ${input.clientMutationId})`);
      const result = await this.client.request(mutation, { input });

      if (result.eventPublish.errors && result.eventPublish.errors.length > 0) {
        throw new Error(`Publish errors: ${result.eventPublish.errors.join(', ')}`);
      }

      const returnedMutationId = result.eventPublish.clientMutationId;
      logger.info(`Event published: ${eventId} (MutationId: ${returnedMutationId})`);
      return { ...result.eventPublish.event, clientMutationId: returnedMutationId };
    } catch (error) {
      logger.error(`Failed to publish event ${eventId}:`, error.message);
      throw error;
    }
  }

  async updateEvent(eventId, updateData) {
    await this.getAccessToken();

    const mutation = gql`
      mutation EventUpdate($input: EventUpdateInput!) {
        eventUpdate(input: $input) {
          clientMutationId
          errors
          event {
            id
            title
            state
          }
        }
      }
    `;

    try {
      const input = {
        clientMutationId: this.generateClientMutationId('event-update', eventId),
        id: eventId,
        attributes: updateData
      };

      logger.info(`Updating event: ${eventId} (ClientMutationId: ${input.clientMutationId})`);
      const result = await this.client.request(mutation, { input });

      if (result.eventUpdate.errors && result.eventUpdate.errors.length > 0) {
        throw new Error(`Update errors: ${result.eventUpdate.errors.join(', ')}`);
      }

      const returnedMutationId = result.eventUpdate.clientMutationId;
      logger.info(`Event updated: ${eventId} (MutationId: ${returnedMutationId})`);
      return { ...result.eventUpdate.event, clientMutationId: returnedMutationId };
    } catch (error) {
      logger.error(`Failed to update event ${eventId}:`, error.message);
      throw error;
    }
  }

  async getEventDetails(eventId) {
    await this.getAccessToken();

    const query = gql`
      query GetEvent($eventId: ID!) {
        event(id: $eventId) {
          id
          title
          slug
          state
          privacy
          virtual
          venueName
          address
          latitude
          longitude
          timeSlots {
            nodes {
              id
              startAt
              endAt
              state
            }
          }
          rates {
            nodes {
              id
              name
              price
              displayPrice
              state
              capacity
            }
          }
        }
      }
    `;

    try {
      const result = await this.client.request(query, { eventId });
      return result.event;
    } catch (error) {
      logger.error(`Failed to get event details for ${eventId}:`, error.message);
      throw error;
    }
  }

  // Helper method to get event URL
  getEventUrl(eventSlug) {
    return `https://www.universe.com/${eventSlug}`;
  }
}

export default UniverseService;