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