# Universe Bulk Event Creator

A Node.js tool that reads event data from Airtable and bulk creates events in Universe using their GraphQL API. Perfect for creating 30-50+ events efficiently with proper error handling and status tracking.

## 🚀 Features

- **Bulk Event Creation**: Create multiple events in Universe from Airtable data
- **OAuth2 Authentication**: Secure integration with Universe API
- **Multi-day Event Support**: Handle events spanning multiple days (e.g., 11 PM to 2 PM next day)
- **Robust Error Handling**: Comprehensive retry logic and error tracking
- **Batch Processing**: Configurable batch sizes to respect rate limits
- **Real-time Status Tracking**: Updates Airtable with creation status and Universe URLs
- **Comprehensive Validation**: Pre-flight validation of all event data
- **Detailed Logging**: File and console logging for monitoring progress
- **Rate/Ticket Creation**: Automatically create ticket rates with events
- **Privacy Mapping**: Intelligent mapping between Airtable and Universe privacy settings

## 📋 Prerequisites

- Node.js (v16 or higher)
- Universe.com account with API access
- Airtable account with API access
- Git

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone git@github.com:anthonydoes/universe-bulk-creator.git
   cd universe-bulk-creator
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and fill in your credentials:
   ```env
   # Universe API Credentials
   UNIVERSE_CLIENT_ID=your_universe_client_id
   UNIVERSE_CLIENT_SECRET=your_universe_client_secret
   UNIVERSE_HOST_ID=your_universe_host_id

   # Airtable Configuration
   AIRTABLE_API_KEY=your_airtable_api_key
   AIRTABLE_BASE_ID=your_airtable_base_id
   AIRTABLE_TABLE_NAME=Events

   # Configuration (optional - defaults shown)
   BATCH_SIZE=5
   DELAY_BETWEEN_BATCHES=2000
   MAX_RETRIES=3
   ```

## 📊 Airtable Setup

Create an Airtable base with the following column structure:

### Required Fields
- `title` (Single line text) - Event title
- `description` (Long text) - Event description (supports HTML)
- `startDate` (Date) - Event start date
- `startTime` (Single line text) - Start time in "HH:MM" format (24-hour)
- `endDate` (Date) - Event end date (can be same as start or different for multi-day)
- `endTime` (Single line text) - End time in "HH:MM" format (24-hour)
- `address` (Single line text) - Event address
- `venueName` (Single line text) - Venue name
- `cityName` (Single line text) - City name

### Optional Fields
- `privacy` (Single select: PUBLIC, PRIVATE, UNLISTED) - Event privacy setting
- `capacity` (Number) - Maximum attendees
- `latitude` (Number) - Venue latitude
- `longitude` (Number) - Venue longitude
- `categoryId` (Single line text) - Universe category ID (default: "52cc8f6154c5317943000003")
- `virtual` (Checkbox) - Virtual event flag
- `allowWaitlist` (Checkbox) - Allow waitlist
- `timedEntry` (Checkbox) - Timed entry
- `socialButtons` (Checkbox) - Show social sharing buttons
- `hiddenDate` (Checkbox) - Hide date from listing
- `maxQuantity` (Number) - Max tickets per order
- `region` (Single line text) - State/province

### Rate/Ticket Fields
- `rateName` (Single line text) - Ticket type name
- `ratePrice` (Number) - Price in dollars (e.g., 33.33)
- `rateCapacity` (Number) - Tickets available for this rate
- `rateDescription` (Long text) - Ticket description

### Publishing Options
- `publish` (Checkbox) - Publish immediately (default: save as draft)

### Status Fields (Auto-populated)
- `status` (Single select: Pending, Created, Error)
- `universeEventId` (Single line text) - Universe event ID
- `universeUrl` (URL) - Direct link to Universe event
- `clientMutationId` (Single line text) - GraphQL mutation tracking
- `errorMessage` (Long text) - Error details if creation fails
- `createdAt` (Date) - Creation timestamp
- `lastUpdated` (Date) - Last update timestamp

### Multi-Day Event Examples
```
Same day event:
startDate=2025-07-31, startTime=19:30, endDate=2025-07-31, endTime=23:00

Overnight event:
startDate=2025-07-31, startTime=23:00, endDate=2025-08-01, endTime=14:00

Multi-day festival:
startDate=2025-07-31, startTime=09:00, endDate=2025-08-03, endTime=17:00
```

## 🔧 Usage

1. **Test your connection**
   ```bash
   npm run test
   ```

2. **Add events to your Airtable** with required fields populated

3. **Run the bulk creator**
   ```bash
   npm start
   ```

4. **Monitor progress** in the console and check logs in the `logs/` directory

## 📝 Privacy Settings

The tool automatically maps privacy settings between Airtable and Universe:

| Airtable Value | Universe Result | Description |
|---------------|----------------|-------------|
| `PUBLIC` | `public` | Publicly visible and searchable |
| `PRIVATE` | `unlisted` | Not publicly listed but accessible via direct link |
| `UNLISTED` | `unlisted` | Not publicly listed but accessible via direct link |

## 🔍 Validation

The tool validates events before creation:

- **Required fields**: Title, dates, times, address, venue
- **Date/time format**: Validates HH:MM format and logical date ranges
- **Multi-day events**: Ensures end is after start (supports overnight/multi-day)
- **Pricing**: Validates positive pricing values
- **Data integrity**: Checks for valid category IDs and privacy settings

## 📊 Logging & Monitoring

- **Console output**: Real-time progress with color-coded status
- **File logging**: Detailed logs saved to `logs/universe-bulk-YYYY-MM-DD.log`
- **Airtable tracking**: Status updates with error messages and Universe URLs
- **Progress indicators**: Beautiful progress bars and batch completion status

## ⚙️ Configuration

Customize behavior via environment variables:

- `BATCH_SIZE`: Number of events to process simultaneously (default: 5)
- `DELAY_BETWEEN_BATCHES`: Milliseconds to wait between batches (default: 2000)
- `MAX_RETRIES`: Number of retry attempts for failed events (default: 3)

## 🚨 Error Handling

The tool includes robust error handling:

- **Validation errors**: Pre-flight validation prevents invalid API calls
- **API errors**: Detailed error messages with retry logic
- **Rate limiting**: Configurable delays to respect Universe API limits
- **Status tracking**: Failed events marked in Airtable with error details
- **Partial failures**: Successfully created events are tracked even if batch partially fails

## 📁 Project Structure

```
universe-bulk-creator/
├── src/
│   ├── services/
│   │   ├── universe.js      # Universe API integration
│   │   ├── airtable.js      # Airtable API integration
│   │   └── validator.js     # Event validation logic
│   ├── utils/
│   │   └── logger.js        # Logging utilities
│   ├── index.js             # Main application entry point
│   └── test.js              # Connection testing
├── logs/                    # Log files (auto-created)
├── .env.example             # Environment variable template
├── .gitignore              # Git ignore rules
├── package.json            # Node.js dependencies
└── README.md              # This file
```

## 🔑 API Credentials

### Universe API
1. Log into your Universe account
2. Go to Settings > API
3. Create a new API application
4. Copy the Client ID and Client Secret
5. Note your Host ID from your Universe URL

### Airtable API
1. Go to https://airtable.com/api
2. Select your base
3. Copy the Base ID from the URL
4. Create a Personal Access Token in your Airtable account settings
5. Use the token as your API key

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Commit with clear messages
5. Push to your branch: `git push origin feature-name`
6. Create a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

If you encounter issues:

1. Check the logs in the `logs/` directory
2. Verify your API credentials in `.env`
3. Ensure your Airtable schema matches the required fields
4. Review validation errors in the console output
5. Check Universe API status at https://status.universe.com

## 🙏 Acknowledgments

- Built with [Universe.com API](https://www.universe.com/api)
- Powered by [Airtable API](https://airtable.com/api)
- Created with assistance from [Claude Code](https://claude.ai/code)

---

**Ready to bulk create events?** Set up your Airtable, configure your `.env`, and run `npm start`! 🚀