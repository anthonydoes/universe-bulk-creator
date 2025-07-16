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

    // Date and time validation
    if (eventData.startDate && eventData.startTime && eventData.endDate && eventData.endTime) {
      // Validate time format (HH:MM)
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      
      if (!timeRegex.test(eventData.startTime)) {
        errors.push('Start time must be in HH:MM format (e.g., 19:30)');
      }
      
      if (!timeRegex.test(eventData.endTime)) {
        errors.push('End time must be in HH:MM format (e.g., 22:00)');
      }
      
      // Validate that end datetime is after start datetime (supports multi-day events)
      if (timeRegex.test(eventData.startTime) && timeRegex.test(eventData.endTime)) {
        const startDate = new Date(eventData.startDate);
        const endDate = new Date(eventData.endDate);
        
        const [startHour, startMin] = eventData.startTime.split(':').map(Number);
        const [endHour, endMin] = eventData.endTime.split(':').map(Number);
        
        // Create full datetime objects for comparison
        const startDateTime = new Date(startDate);
        startDateTime.setHours(startHour, startMin, 0, 0);
        
        const endDateTime = new Date(endDate);
        endDateTime.setHours(endHour, endMin, 0, 0);
        
        if (startDateTime >= endDateTime) {
          errors.push('Event end must be after event start (supports multi-day events)');
        }
        
        // Calculate event duration and warn if very long
        const durationHours = (endDateTime - startDateTime) / (1000 * 60 * 60);
        if (durationHours > 168) { // More than 7 days
          warnings.push('Event duration is longer than 7 days');
        }
      }
      
      // Check if start date is in the past
      const startDate = new Date(eventData.startDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Set to beginning of day for comparison
      
      if (startDate < today) {
        warnings.push('Event start date is in the past');
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

    // Date display option validation
    if (eventData.dateDisplayOption && !['FULL', 'SHORT', 'HIDDEN'].includes(eventData.dateDisplayOption)) {
      errors.push('Date display option must be FULL, SHORT, or HIDDEN');
    }

    // Privacy validation
    if (eventData.privacy && !['PUBLIC', 'PRIVATE', 'UNLISTED', 'public', 'private', 'unlisted'].includes(eventData.privacy)) {
      errors.push('Privacy must be PUBLIC, PRIVATE, or UNLISTED (case insensitive)');
    }

    // Analytics fields validation
    if (eventData.tiktokPixelCodes && typeof eventData.tiktokPixelCodes === 'string') {
      const codes = eventData.tiktokPixelCodes.split(',').map(c => c.trim());
      if (codes.some(code => code.length === 0)) {
        warnings.push('TikTok pixel codes should not contain empty values');
      }
    }

    if (eventData.facebookPixelCodes && typeof eventData.facebookPixelCodes === 'string') {
      const codes = eventData.facebookPixelCodes.split(',').map(c => c.trim());
      if (codes.some(code => code.length === 0)) {
        warnings.push('Facebook pixel codes should not contain empty values');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
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