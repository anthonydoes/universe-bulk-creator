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