# Universe Bulk Event Creator

## Project Overview
Create a tool that reads event data from Airtable and bulk creates events in Universe using their GraphQL API. Based on the actual Universe API structure from your creation payload.

## Architecture
- **Airtable**: Event data repository with columns matching Universe event fields
- **Node.js Script**: Processes Airtable data and creates events via Universe GraphQL API
- **Error Handling**: Robust logging and retry mechanisms for bulk operations

## Setup Instructions

### 1. Initialize Project
```bash
mkdir universe-bulk-creator
cd universe-bulk-creator
npm init -y
npm install graphql-request axios airtable dotenv chalk ora
npm install -D nodemon
```

### 2. Environment Configuration
Create `.env` file:
```env
# Universe API Credentials
UNIVERSE_CLIENT_ID=your_client_id
UNIVERSE_CLIENT_SECRET=your_client_secret
UNIVERSE_HOST_ID=63ea8385a8d65900205da7a4

# Airtable Configuration
AIRTABLE_API_KEY=your_airtable_api_key
AIRTABLE_BASE_ID=your_base_id
AIRTABLE_TABLE_NAME=Events

# Configuration
BATCH_SIZE=5
DELAY_BETWEEN_BATCHES=2000
MAX_RETRIES=3
```

### 3. Airtable Schema
Create an Airtable base with these columns:

**Required Fields:**
- `title` (Single line text)
- `description` (Long text)
- `startDate` (Date)
- `startTime` (Single line text - format: "HH:MM" e.g. "19:30")
- `endDate` (Date) - can be same as startDate or different for multi-day events
- `endTime` (Single line text - format: "HH:MM" e.g. "22:00")
- `address` (Single line text)
- `venueName` (Single line text)
- `cityName` (Single line text)
- `countryCode` (Single line text - default "CA")

**Multi-Day Event Examples:**
- Same day: startDate=2025-07-31, startTime=19:30, endDate=2025-07-31, endTime=23:00
- Overnight: startDate=2025-07-31, startTime=23:00, endDate=2025-08-01, endTime=14:00
- Multi-day: startDate=2025-07-31, startTime=09:00, endDate=2025-08-03, endTime=17:00

**Time Format Notes:**
- Time fields must be in HH:MM format (24-hour time)
- Examples: "09:00", "14:30", "23:59"
- Invalid formats like "9:00", "2:30 PM", or "25:00" will cause validation errors

**Optional Fields:**
- `capacity` (Number)
- `privacy` (Single select: PUBLIC, PRIVATE, UNLISTED - note: PRIVATE maps to "unlisted" in Universe)
- `currency` (Single line text - default "CAD")
- `latitude` (Number)
- `longitude` (Number)
- `categoryId` (Single line text - default "52cc8f6154c5317943000003")
- `virtual` (Checkbox)
- `allowWaitlist` (Checkbox)
- `timedEntry` (Checkbox)

**Rate Fields (for ticket pricing):**
- `rateName` (Single line text)
- `ratePrice` (Number - in dollars, will convert to cents)
- `rateCapacity` (Number)
- `rateDescription` (Long text)

**Publishing Options:**
- `publish` (Checkbox - whether to publish immediately or save as draft)

**Business Seller Fields (optional):**
- `businessEmail` (Single line text)
- `businessPhoneNumber` (Single line text)
- `businessAddress` (Single line text)

**Additional Fields:**
- `contactDetails` (Long text)
- `virtualInfo` (Long text - for virtual events)
- `privateNote` (Long text - internal notes)
- `availableCountries` (Single line text - comma-separated country codes)
- `socialButtons` (Checkbox)
- `hiddenDate` (Checkbox)
- `maxQuantity` (Number)
- `region` (Single line text - state/province, e.g. "Ontario")
- `dateDisplayOption` (Single select: FULL, SHORT, HIDDEN - default "FULL")

**Analytics & Tracking Fields (optional):**
- `tiktokPixelCodes` (Long text - comma-separated pixel codes)
- `facebookPixelCodes` (Long text - comma-separated pixel codes)
- `googleAnalytics4Id` (Single line text)


**Status Fields:**
- `status` (Single select: Pending, Created, Error)
- `universeEventId` (Single line text)
- `universeUrl` (URL - direct link to the created Universe event)
- `clientMutationId` (Single line text - tracks the GraphQL mutation ID)
- `errorMessage` (Long text)
- `createdAt` (Date)
- `lastUpdated` (Date)

### 4. Core Files Structure
```
universe-bulk-creator/
├── src/
│   ├── services/
│   │   ├── universe.js
│   │   ├── airtable.js
│   │   └── validator.js
│   ├── utils/
│   │   └── logger.js
│   ├── config/
│   │   └── schema.js
│   └── index.js
├── logs/
├── .env
├── .gitignore
└── package.json
```

## Implementation

### 5. Universe Service (src/services/universe.js)
```javascript
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
    // Build the nested event structure according to Universe API
    const eventInput = {
      clientMutationId: this.generateClientMutationId('event-create', airtableData.airtableId),
      publish: airtableData.publish === true,
      event: {
        title: airtableData.title,
        descriptionHtml: this.formatDescription(airtableData.description),
        address: airtableData.address,
        latitude: airtableData.latitude ? parseFloat(airtableData.latitude) : 0,
        longitude: airtableData.longitude ? parseFloat(airtableData.longitude) : 0,
        venueName: airtableData.venueName,
        privacy: airtableData.privacy || 'PRIVATE',
        virtual: airtableData.virtual === true,
        transactionCurrency: airtableData.currency || 'CAD',
        settlementCurrency: airtableData.currency || 'CAD',
        socialButtons: airtableData.socialButtons === true,
        hiddenDate: airtableData.hiddenDate === true,
        maxQuantity: airtableData.maxQuantity ? parseInt(airtableData.maxQuantity) : null,
        category: {
          id: airtableData.categoryId || '52cc8f6154c5317943000003' // Music category
        },
        timeSlots: [],
        rates: []
      }
    };

    // Add time slots
    if (airtableData.startDate && airtableData.startTime && airtableData.endDate && airtableData.endTime) {
      eventInput.event.timeSlots.push({
        startAt: this.combineDateAndTime(airtableData.startDate, airtableData.startTime),
        endAt: this.combineDateAndTime(airtableData.endDate, airtableData.endTime)
      });
    }

    // Add ticket rates if provided
    if (airtableData.rateName && airtableData.ratePrice) {
      eventInput.event.rates.push({
        name: airtableData.rateName,
        price: Math.round(parseFloat(airtableData.ratePrice) * 100), // Convert to cents
        capacity: airtableData.rateCapacity ? parseInt(airtableData.rateCapacity) : null,
        description: airtableData.rateDescription || '',
        state: 'ACTIVE',
        minTickets: parseInt(airtableData.rateMinTickets) || 1,
        maxTickets: airtableData.rateMaxTickets ? parseInt(airtableData.rateMaxTickets) : null,
        sortIndex: 0
      });
    }

    // Add optional fields if provided
    if (airtableData.contactDetails) {
      eventInput.event.contactDetails = airtableData.contactDetails;
    }

    if (airtableData.virtualInfo && airtableData.virtual) {
      eventInput.event.virtualInfo = airtableData.virtualInfo;
    }

    if (airtableData.privateNote) {
      eventInput.event.privateNote = airtableData.privateNote;
    }

    if (airtableData.availableCountries) {
      eventInput.event.availableCountries = airtableData.availableCountries.split(',').map(c => c.trim());
    }

    if (airtableData.businessEmail) {
      eventInput.event.isBusinessSeller = true;
      eventInput.event.businessEmail = airtableData.businessEmail;
      eventInput.event.businessPhoneNumber = airtableData.businessPhoneNumber;
      eventInput.event.businessAddress = airtableData.businessAddress;
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

  formatDateTime(dateTime) {
    // Universe expects TimeWithoutTz format
    if (typeof dateTime === 'string') {
      return dateTime.replace('T', ' ').replace('Z', '');
    }
    
    const date = new Date(dateTime);
    return date.toISOString().replace('T', ' ').replace('Z', '');
  }

  combineDateAndTime(date, time) {
    // Combines separate date and time fields into a datetime string
    // date: YYYY-MM-DD format from Airtable Date field
    // time: HH:MM format from Airtable Single line text field
    
    if (!date || !time) {
      throw new Error('Both date and time are required');
    }

    // Parse the date (YYYY-MM-DD)
    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    
    // Validate time format (HH:MM)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
      throw new Error(`Invalid time format: ${time}. Expected HH:MM format (e.g., "19:30")`);
    }

    // Combine date and time into ISO format, then convert to Universe format
    const combinedDateTime = `${dateStr}T${time}:00`;
    const date_obj = new Date(combinedDateTime);
    
    // Return in Universe's expected format (TimeWithoutTz)
    return date_obj.toISOString().replace('T', ' ').replace('Z', '');
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
```

### 6. Airtable Service (src/services/airtable.js)
```javascript
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
        filterByFormula: "AND({status} != 'Created', {status} != 'Error', {title} != '')",
        sort: [{ field: 'Created Time', direction: 'asc' }]
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
        lastUpdated: new Date().toISOString()
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
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
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
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      logger.error(`Failed to mark record ${recordId} as error:`, error.message);
    }
  }
}

export default AirtableService;
```

### 7. Validator Service (src/services/validator.js)
```javascript
import { logger } from '../utils/logger.js';

class ValidatorService {
  validateEvent(eventData) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!eventData.title?.trim()) {
      errors.push('Title is required');
    }

    if (!eventData.startDate) {
      errors.push('Start date is required');
    }

    if (!eventData.startTime) {
      errors.push('Start time is required');
    }

    if (!eventData.endDate) {
      errors.push('End date is required');
    }

    if (!eventData.endTime) {
      errors.push('End time is required');
    }

    if (!eventData.address?.trim()) {
      errors.push('Address is required');
    }

    if (!eventData.venueName?.trim()) {
      errors.push('Venue name is required');
    }

    if (!eventData.cityName?.trim()) {
      errors.push('City name is required');
    }

    // Date validation
    if (eventData.startDate && eventData.startTime && eventData.endDate && eventData.endTime) {
      const startDateTime = this.combineDateAndTime(eventData.startDate, eventData.startTime);
      const endDateTime = this.combineDateAndTime(eventData.endDate, eventData.endTime);
      const startDate = new Date(startDateTime);
      const endDate = new Date(endDateTime);
      
      if (startDate >= endDate) {
        errors.push('Start date must be before end date');
      }

      if (startDate < new Date()) {
        warnings.push('Start date is in the past');
      }
    }

    // Rate validation
    if (eventData.ratePrice && eventData.ratePrice < 0) {
      errors.push('Rate price cannot be negative');
    }

    if (eventData.capacity && eventData.capacity < 1) {
      errors.push('Capacity must be at least 1');
    }

    // Country code validation
    if (eventData.countryCode && eventData.countryCode.length !== 2) {
      errors.push('Country code must be 2 characters (e.g., CA, US)');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  combineDateAndTime(date, time) {
    // Combines separate date and time fields into a datetime string
    // date: YYYY-MM-DD format from Airtable Date field
    // time: HH:MM format from Airtable Single line text field
    
    if (!date || !time) {
      throw new Error('Both date and time are required');
    }

    // Parse the date (YYYY-MM-DD)
    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    
    // Validate time format (HH:MM)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
      throw new Error(`Invalid time format: ${time}. Expected HH:MM format (e.g., "19:30")`);
    }

    // Combine date and time into ISO format
    const combinedDateTime = `${dateStr}T${time}:00`;
    return new Date(combinedDateTime).toISOString();
  }

  validateBatch(events) {
    const results = events.map(event => ({
      airtableId: event.airtableId,
      title: event.title,
      validation: this.validateEvent(event)
    }));

    const validEvents = results.filter(r => r.validation.isValid);
    const invalidEvents = results.filter(r => !r.validation.isValid);

    logger.info(`Validation complete: ${validEvents.length} valid, ${invalidEvents.length} invalid events`);

    if (invalidEvents.length > 0) {
      logger.warn('Invalid events found:');
      invalidEvents.forEach(event => {
        logger.warn(`- ${event.title}: ${event.validation.errors.join(', ')}`);
      });
    }

    return {
      valid: validEvents,
      invalid: invalidEvents,
      totalCount: events.length
    };
  }
}

export default ValidatorService;
```

### 8. Logger Utility (src/utils/logger.js)
```javascript
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

class Logger {
  constructor() {
    this.logDir = 'logs';
    this.ensureLogDir();
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  getLogFilename() {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `universe-bulk-${date}.log`);
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logData = data ? ` | Data: ${JSON.stringify(data)}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${logData}\n`;
  }

  writeToFile(formattedMessage) {
    fs.appendFileSync(this.getLogFilename(), formattedMessage);
  }

  info(message, data = null) {
    const formatted = this.formatMessage('info', message, data);
    console.log(chalk.blue(formatted.trim()));
    this.writeToFile(formatted);
  }

  success(message, data = null) {
    const formatted = this.formatMessage('success', message, data);
    console.log(chalk.green(formatted.trim()));
    this.writeToFile(formatted);
  }

  warn(message, data = null) {
    const formatted = this.formatMessage('warn', message, data);
    console.log(chalk.yellow(formatted.trim()));
    this.writeToFile(formatted);
  }

  error(message, data = null) {
    const formatted = this.formatMessage('error', message, data);
    console.log(chalk.red(formatted.trim()));
    this.writeToFile(formatted);
  }
}

export const logger = new Logger();
```

### 9. Main Script (src/index.js)
```javascript
import dotenv from 'dotenv';
import ora from 'ora';
import chalk from 'chalk';
import UniverseService from './services/universe.js';
import AirtableService from './services/airtable.js';
import ValidatorService from './services/validator.js';
import { logger } from './utils/logger.js';

dotenv.config();

class BulkEventCreator {
  constructor() {
    this.universe = new UniverseService();
    this.airtable = new AirtableService();
    this.validator = new ValidatorService();
    this.batchSize = parseInt(process.env.BATCH_SIZE) || 5;
    this.delayBetweenBatches = parseInt(process.env.DELAY_BETWEEN_BATCHES) || 2000;
    this.maxRetries = parseInt(process.env.MAX_RETRIES) || 3;
  }

  async run() {
    console.log(chalk.bold.blue('\n🚀 Universe Bulk Event Creator\n'));
    
    try {
      // Fetch unprocessed events
      const spinner = ora('Fetching events from Airtable...').start();
      const events = await this.airtable.getUnprocessedEvents();
      spinner.succeed(`Found ${events.length} events to process`);

      if (events.length === 0) {
        console.log(chalk.yellow('No events to process. Exiting.'));
        return;
      }

      // Validate events
      spinner.start('Validating events...');
      const validation = this.validator.validateBatch(events);
      spinner.succeed(`Validation complete: ${validation.valid.length} valid events`);

      if (validation.invalid.length > 0) {
        console.log(chalk.yellow(`\n⚠️  ${validation.invalid.length} invalid events found:`));
        for (const invalid of validation.invalid) {
          console.log(chalk.red(`   • ${invalid.title}: ${invalid.validation.errors.join(', ')}`));
          await this.airtable.markAsError(
            invalid.airtableId, 
            invalid.validation.errors.join('; ')
          );
        }
      }

      // Process valid events in batches
      const validEvents = validation.valid.map(v => 
        events.find(e => e.airtableId === v.airtableId)
      );

      if (validEvents.length === 0) {
        console.log(chalk.red('No valid events to process. Exiting.'));
        return;
      }

      await this.processBatches(validEvents);

    } catch (error) {
      logger.error('Failed to run bulk creator:', error.message);
      console.log(chalk.red(`\n❌ Error: ${error.message}`));
    }
  }

  async processBatches(events) {
    const batches = this.createBatches(events);
    let successCount = 0;
    let errorCount = 0;

    console.log(chalk.blue(`\n📦 Processing ${events.length} events in ${batches.length} batches...\n`));

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const spinner = ora(`Processing batch ${i + 1}/${batches.length} (${batch.length} events)`).start();

      try {
        const results = await this.processBatch(batch);
        successCount += results.success;
        errorCount += results.errors;
        
        spinner.succeed(`Batch ${i + 1} complete: ${results.success} created, ${results.errors} errors`);

        // Delay between batches (except for the last one)
        if (i < batches.length - 1) {
          await this.delay(this.delayBetweenBatches);
        }

      } catch (error) {
        spinner.fail(`Batch ${i + 1} failed: ${error.message}`);
        errorCount += batch.length;
        
        // Mark all events in failed batch as errors
        for (const event of batch) {
          await this.airtable.markAsError(event.airtableId, `Batch processing failed: ${error.message}`);
        }
      }
    }

    // Final summary
    console.log(chalk.bold.green(`\n✅ Processing complete!`));
    console.log(chalk.green(`   Success: ${successCount} events created`));
    if (errorCount > 0) {
      console.log(chalk.red(`   Errors: ${errorCount} events failed`));
    }
  }

  async processBatch(events) {
    const promises = events.map(event => this.processEvent(event));
    const results = await Promise.allSettled(promises);
    
    let success = 0;
    let errors = 0;

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        success++;
      } else {
        errors++;
        logger.error(`Event ${events[index].title} failed:`, result.reason.message);
      }
    });

    return { success, errors };
  }

  async processEvent(event, retryCount = 0) {
    try {
      // Create the event in Universe
      const universeEvent = await this.universe.createEvent(event);
      
      // Optionally publish the event if requested
      if (event.publish === true && universeEvent.state !== 'POSTED') {
        try {
          await this.universe.publishEvent(universeEvent.id);
          logger.info(`Event published: ${event.title}`);
        } catch (publishError) {
          logger.warn(`Event created but failed to publish: ${event.title}`, publishError.message);
        }
      }

      // Get the event URL
      const eventUrl = this.universe.getEventUrl(universeEvent.slug);

      // Update Airtable with success
      await this.airtable.markAsCreated(
        event.airtableId, 
        universeEvent.id, 
        eventUrl,
        universeEvent.clientMutationId
      );

      logger.success(`Event created: ${event.title} -> ${eventUrl}`);
      return universeEvent;

    } catch (error) {
      if (retryCount < this.maxRetries) {
        logger.warn(`Retrying event ${event.title} (attempt ${retryCount + 1}/${this.maxRetries + 1})`);
        await this.delay(1000 * (retryCount + 1)); // Exponential backoff
        return this.processEvent(event, retryCount + 1);
      }

      // Mark as error in Airtable
      await this.airtable.markAsError(event.airtableId, error.message);
      throw error;
    }
  }

  createBatches(events) {
    const batches = [];
    for (let i = 0; i < events.length; i += this.batchSize) {
      batches.push(events.slice(i, i + this.batchSize));
    }
    return batches;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the bulk creator
if (import.meta.url === `file://${process.argv[1]}`) {
  const creator = new BulkEventCreator();
  creator.run().catch(console.error);
}

export default BulkEventCreator;
```

### 10. Package.json Scripts
```json
{
  "name": "universe-bulk-creator",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "test": "node src/test.js"
  },
  "dependencies": {
    "graphql-request": "^6.1.0",
    "axios": "^1.6.0",
    "airtable": "^0.12.2",
    "dotenv": "^16.3.1",
    "chalk": "^5.3.0",
    "ora": "^7.0.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}
```

### 11. Test Script (src/test.js)
```javascript
import dotenv from 'dotenv';
import UniverseService from './services/universe.js';
import { logger } from './utils/logger.js';

dotenv.config();

async function testConnection() {
  console.log('Testing Universe API connection...');
  
  try {
    const universe = new UniverseService();
    const token = await universe.getAccessToken();
    
    if (token) {
      logger.success('✅ Universe API connection successful!');
      console.log('Access token obtained:', token.substring(0, 20) + '...');
    }
  } catch (error) {
    logger.error('❌ Universe API connection failed:', error.message);
  }
}

testConnection();
```

### 12. Git Configuration (.gitignore)
```
node_modules/
.env
logs/
*.log
.DS_Store
```

## Usage Instructions

### 1. Setup Environment
1. Create Airtable base with the schema above
2. Get Universe API credentials
3. Get Airtable API key and base ID
4. Fill in `.env` file

### 2. Test Connection
```bash
npm run test
```

### 3. Add Events to Airtable
- Fill in your events in the Airtable base
- Ensure all required fields are populated
- Set status to "Pending" or leave blank

### 4. Run Bulk Creation
```bash
npm start
```

### 5. Monitor Progress
- Watch console output for real-time progress
- Check `logs/` directory for detailed logs
- Monitor Airtable for status updates

## Features

- ✅ **Batch Processing**: Configurable batch sizes to avoid rate limits
- ✅ **Error Handling**: Comprehensive error catching and retry logic
- ✅ **Validation**: Pre-flight validation of all event data
- ✅ **Logging**: Detailed file and console logging
- ✅ **Status Tracking**: Real-time status updates in Airtable
- ✅ **Rate Creation**: Automatic ticket rate creation with events
- ✅ **Retry Logic**: Automatic retries for failed requests
- ✅ **Progress Indicators**: Beautiful console progress indicators

## Customization

### Adding More Fields
1. Add columns to Airtable
2. Update `transformEventData()` in `universe.js`
3. Update validation rules in `validator.js`

### Changing Batch Behavior
- Modify `BATCH_SIZE` in `.env`
- Adjust `DELAY_BETWEEN_BATCHES` for rate limiting
- Update `MAX_RETRIES` for error handling

This tool will efficiently create 30-50 events at once while maintaining proper error handling and status tracking!








