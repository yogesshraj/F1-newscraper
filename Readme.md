# F1 News Scraper & Telegram Bot

An automated F1 news aggregator that scrapes Formula 1 news from multiple sources, sends updates to Telegram, and provides AI-powered article summaries using OpenAI's GPT models.

## 🏁 Features

- **Multi-Source News Aggregation**: Fetches F1 news from:
  - RSS feeds (Autosport, Motorsport, ESPN, etc.)
  - F1 Official website (web scraping)
  
- **Intelligent Duplicate Detection**: Uses unique ID generation to prevent duplicate articles

- **Full Article Content Extraction**: Scrapes complete article text from source URLs for better summarization

- **Telegram Integration**: 
  - Sends formatted news updates to your Telegram chat
  - Interactive "Summarize with AI" buttons for each article
  - Real-time callback handling for on-demand summaries

- **AI-Powered Summaries**: 
  - Uses OpenAI GPT-4o-mini for article summarization
  - Generates concise 2-3 sentence summaries optimized for social media
  - Fallback mechanism if primary model fails

- **Automated Scheduling**: Runs on a configurable cron schedule (default: every 10 minutes)

- **Comprehensive Logging**: Detailed logging system with timestamps and structured data

## 📋 Prerequisites

- Node.js (v14 or higher)
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- OpenAI API Key
- Telegram Chat ID

## 🚀 Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd F1-newscraper
```

2. Install dependencies:
```bash
npm install
```

3. Configure the application by editing `config.js`:
   - Add your Telegram bot token and chat ID
   - Add your OpenAI API key
   - Customize RSS feeds and scraping settings
   - Adjust cron schedule if needed

## ⚙️ Configuration

Edit `config.js` to customize:

```javascript
{
  telegram: {
    botToken: 'YOUR_BOT_TOKEN',
    chatId: 'YOUR_CHAT_ID'
  },
  openai: {
    apiKey: 'YOUR_OPENAI_API_KEY',
    model: 'gpt-4o-mini'
  },
  scraping: {
    fetchFullContent: true,  // Set to false to use only RSS descriptions
    timeout: 30000,
    retries: 3
  },
  rssFeeds: [
    'https://www.autosport.com/rss/feed/f1',
    // Add more RSS feeds here
  ],
  cronSchedule: '*/10 * * * *'  // Every 10 minutes
}
```

## 🎯 Usage

### Run with Cron Job (Production)
```bash
npm run cron
```

### Run with Auto-Restart (Development)
```bash
npm run cron-dev
```

### Manual Testing
Uncomment the test function in `cronJob.js` to test summarization:
```javascript
testSummarization().catch(console.error);
```

## 📦 Dependencies

- **axios**: HTTP client for making requests
- **cheerio**: HTML parsing and web scraping
- **node-cron**: Task scheduling
- **node-telegram-bot-api**: Telegram bot integration
- **openai**: OpenAI API client
- **rss-parser**: RSS feed parsing
- **fs-extra**: Enhanced file system operations
- **dotenv**: Environment variable management

## 📁 Project Structure

```
F1-newscraper/
├── config.js           # Configuration file
├── cronJob.js          # Main application logic
├── news_data.json      # Stored articles database
├── scraper.log         # Application logs
├── package.json        # Dependencies and scripts
└── Readme.md          # This file
```

## 🔄 How It Works

1. **Initialization**: 
   - Loads existing articles from `news_data.json`
   - Sets up Telegram bot with callback handlers
   - Initializes OpenAI client

2. **News Fetching**:
   - Fetches articles from configured RSS feeds
   - Scrapes F1 official website for additional content
   - Combines all sources

3. **Duplicate Filtering**:
   - Generates unique IDs for each article
   - Compares against existing articles
   - Filters out duplicates

4. **Telegram Delivery**:
   - Sends new articles to configured Telegram chat
   - Includes article title, link, and publication date
   - Adds interactive "Summarize with AI" button

5. **AI Summarization** (On-Demand):
   - User clicks "Summarize with AI" button
   - Fetches full article content from source URL
   - Sends to OpenAI for summarization
   - Returns concise 2-3 sentence summary

6. **Data Persistence**:
   - Saves all articles to `news_data.json`
   - Maintains scraping logs in `scraper.log`

## 📊 Logging

The application includes comprehensive logging:
- **INFO**: General operational messages
- **DEBUG**: Detailed debugging information
- **WARN**: Warning messages for non-critical issues
- **ERROR**: Error messages with stack traces

Logs are written to both console and `scraper.log` file.

## 🛠️ Troubleshooting

### No articles being fetched
- Check if RSS feeds are accessible
- Verify network connectivity
- Check `scraper.log` for error messages

### Telegram messages not sending
- Verify bot token and chat ID in `config.js`
- Ensure bot has permission to send messages to the chat
- Check Telegram API rate limits

### AI summaries not working
- Verify OpenAI API key is valid
- Check API quota and billing status
- Review logs for OpenAI API errors

### Duplicate articles appearing
- Clear `news_data.json` to reset the database
- Check if article URLs are changing (e.g., tracking parameters)

## 🔒 Security Notes

- **Never commit `config.js` with real credentials** to version control
- Use environment variables for sensitive data (`.env` file)
- Keep your API keys secure and rotate them regularly

## 📝 License

ISC

## 👤 Author

Your Name

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

## ⭐ Show Your Support

Give a ⭐️ if this project helped you!
