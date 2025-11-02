const cron = require('node-cron');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const TelegramBot = require('node-telegram-bot-api');
const { OpenAI } = require('openai');
const RSSParser = require('rss-parser');
const path = require('path');
const config = require('./config');

require('dotenv').config();
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || config.openai.apiKey
});

// Logging utility
class Logger {
  constructor(logFile) {
    this.logFile = logFile;
  }

  async log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data
    };
    
    const logLine = `[${timestamp}] ${level.toUpperCase()}: ${message}${data ? ` | Data: ${JSON.stringify(data)}` : ''}\n`;
    
    // Console output
    console.log(logLine.trim());
    
    // File output
    try {
      await fs.appendFile(this.logFile, logLine);
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }
  }

  async info(message, data = null) {
    await this.log('info', message, data);
  }

  async error(message, data = null) {
    await this.log('error', message, data);
  }

  async warn(message, data = null) {
    await this.log('warn', message, data);
  }

  async debug(message, data = null) {
    await this.log('debug', message, data);
  }
}

const logger = new Logger(config.files.logFile);

// Initialize services
const bot = new TelegramBot(config.telegram.botToken, { polling: true });
// const openai = new OpenAI({ apiKey: config.openai.apiKey });
const parser = new RSSParser();

// Handle callback queries for summarize buttons
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data;

  try {
    if (data.startsWith('summarize_')) {
      // Show loading message
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'Generating summary...' });
      
      // Get article from cache
      const article = global.articleCache?.get(data);
      if (!article) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Article not found. Please try again.' });
        return;
      }

      // Generate summary
      console.log('Summarizing article', { article });
      const summary = await summarizeArticle(article);
      console.log('Summary', { summary });
      // Send new message with summary
      const summaryMessage = `📝 *AI Summary for:*\n*${article.title}*\n\n${summary}\n\n🔗 [Read Full Article](${article.link})`;
      
      await bot.sendMessage(chatId, summaryMessage, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });
      
      await logger.info('Summary generated and sent for article', { title: article.title });
    }
  } catch (error) {
    await logger.error('Error handling callback query', { error: error.message });
    await bot.answerCallbackQuery(callbackQuery.id, { text: 'Error generating summary. Please try again.' });
  }
});

// Ensure data file exists
async function initializeDataFile() {
  try {
    await fs.ensureFile(config.files.newsData);
    const exists = await fs.pathExists(config.files.newsData);
    if (!exists || (await fs.readFile(config.files.newsData, 'utf8')).trim() === '') {
      await fs.writeJson(config.files.newsData, { articles: [], lastUpdated: new Date().toISOString() });
    }
  } catch (error) {
    console.error('Error initializing data file:', error);
  }
}

// Load existing news data
async function loadNewsData() {
  try {
    const data = await fs.readJson(config.files.newsData);
    return data.articles || [];
  } catch (error) {
    console.error('Error loading news data:', error);
    return [];
  }
}

// Save news data
async function saveNewsData(articles) {
  try {
    await fs.writeJson(config.files.newsData, {
      articles,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error saving news data:', error);
  }
}

// Fetch news from RSS feeds
async function fetchRSSNews() {
  const allArticles = [];
  
  for (const feedUrl of config.rssFeeds) {
    try {
      await logger.info(`Fetching RSS from: ${feedUrl}`);
      const feed = await parser.parseURL(feedUrl);
      
      let feedArticleCount = 0;
      for (const item of feed.items) {
        if (item.title && item.link) {
          allArticles.push({
            title: item.title.trim(),
            link: item.link,
            pubDate: item.pubDate,
            description: (item.contentSnippet || item.description || '').trim(),
            source: feedUrl,
            id: item.guid || item.link
          });
          feedArticleCount++;
        }
      }
      
      await logger.info(`Fetched ${feedArticleCount} articles from RSS feed`, { source: feedUrl });
    } catch (error) {
      await logger.error(`Error fetching RSS from ${feedUrl}`, { error: error.message });
    }
  }
  
  await logger.info(`Total RSS articles fetched: ${allArticles.length}`);
  return allArticles;
}

// Scrape F1 official website
async function scrapeF1Official() {
  try {
    await logger.info('Scraping F1 official website...');
    const response = await axios.get('https://www.formula1.com/en/latest/all.html', {
      headers: { 'User-Agent': config.scraping.userAgent },
      timeout: config.scraping.timeout
    });
    
    const $ = cheerio.load(response.data);
    const articles = [];
    
    $('.f1-latest-listing--item').each((index, element) => {
      const title = $(element).find('.f1-latest-listing--item-title').text().trim();
      const link = $(element).find('a').attr('href');
      const description = $(element).find('.f1-latest-listing--item-excerpt').text().trim();
      const date = $(element).find('.f1-latest-listing--item-date').text().trim();
      
      if (title && link) {
        articles.push({
          title,
          link: link.startsWith('http') ? link : `https://www.formula1.com${link}`,
          description,
          pubDate: date,
          source: 'F1 Official',
          id: link
        });
      }
    });
    
    await logger.info(`Scraped ${articles.length} articles from F1 official website`);
    return articles;
  } catch (error) {
    await logger.error('Error scraping F1 official website', { error: error.message });
    return [];
  }
}

// Fetch full article content from URL
async function fetchFullArticleContent(url) {
  try {
    await logger.debug(`Fetching full content from: ${url}`);
    
    const response = await axios.get(url, {
      headers: { 
        'User-Agent': config.scraping.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
      },
      timeout: config.scraping.timeout,
      maxRedirects: 5
    });
    
    const $ = cheerio.load(response.data);
    
    // Remove unwanted elements
    $('script, style, nav, header, footer, .advertisement, .ads, .social-share, .comments').remove();
    
    let content = '';
    
    // Try different selectors based on common article structures
    const contentSelectors = [
      'article p',
      '.article-content p',
      '.post-content p', 
      '.entry-content p',
      '.content p',
      'main p',
      '.article-body p',
      '.story-body p',
      '.article-text p',
      'p' // fallback
    ];
    
    for (const selector of contentSelectors) {
      const paragraphs = $(selector);
      if (paragraphs.length > 2) { // Need at least 3 paragraphs for substantial content
        paragraphs.each((i, elem) => {
          const text = $(elem).text().trim();
          if (text.length > 50) { // Only include substantial paragraphs
            content += text + '\n\n';
          }
        });
        break;
      }
    }
    
    // Clean up the content
    content = content
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\n\s*\n/g, '\n\n') // Clean up line breaks
      .trim();
    
    // Limit content length (GPT has token limits)
    if (content.length > 4000) {
      content = content.substring(0, 4000) + '...';
    }
    
    if (content.length < 100) {
      await logger.warn(`Insufficient content extracted from: ${url}`);
      return null;
    }
    
    await logger.debug(`Successfully extracted ${content.length} characters from article`);
    return content;
    
  } catch (error) {
    await logger.error(`Error fetching full article content from ${url}`, { error: error.message });
    return null;
  }
}

// Generate unique article ID
function generateArticleId(article) {
  // Create a more robust unique identifier
  const titleHash = Buffer.from(article.title.toLowerCase().trim()).toString('base64').slice(0, 20);
  const linkHash = Buffer.from(article.link).toString('base64').slice(0, 20);
  return `${titleHash}_${linkHash}`;
}

// Filter new articles with enhanced duplicate checking
async function filterNewArticles(allArticles, existingArticles) {
  const existingIds = new Set(existingArticles.map(article => article.uniqueId || article.id));
  const newArticles = [];
  
  for (const article of allArticles) {
    // Generate unique ID for better duplicate detection
    article.uniqueId = generateArticleId(article);
    article.scrapedAt = new Date().toISOString();
    
    if (!existingIds.has(article.uniqueId) && !existingIds.has(article.id)) {
      newArticles.push(article);
      await logger.debug('New article found', { 
        title: article.title, 
        uniqueId: article.uniqueId,
        source: article.source 
      });
    } else {
      await logger.debug('Duplicate article skipped', { 
        title: article.title, 
        uniqueId: article.uniqueId 
      });
    }
  }
  
  await logger.info(`Filtered articles: ${newArticles.length} new out of ${allArticles.length} total`);
  return newArticles;
}

// Summarize article with OpenAI using full content
async function summarizeArticle(article) {
  try {
    await logger.info(`Starting summarization for: ${article.title}`);
    
    // Try to fetch full article content if enabled
    let contentToSummarize = article.description || '';
    
    if (config.scraping.fetchFullContent) {
      const fullContent = await fetchFullArticleContent(article.link);
      
      if (fullContent && fullContent.length > contentToSummarize.length) {
        contentToSummarize = fullContent;
        await logger.info(`Using full article content (${fullContent.length} chars) for summarization`);
      } else {
        await logger.warn(`Using fallback description for summarization: ${article.link}`);
      }
    } else {
      await logger.info(`Using RSS description for summarization (full content fetching disabled)`);
    }
    
    const prompt = `Please summarize this F1 news article. This is for posting the content in X platform for f1 related contents.
    create in 2-3 sentences and try to contain the most important information, Don't make the content incomplete.:

Title: ${article.title}
Content: ${contentToSummarize}

Summary:`;

    await logger.debug(`Making OpenAI API call with model: ${config.openai.model || 'gpt-3.5-turbo'}`, {
      promptLength: prompt.length,
      contentLength: contentToSummarize.length,
      title: article.title
    });
    
    const response = await client.chat.completions.create({
      model: config.openai.model || 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: 100,
      temperature: 0.3,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0
    });

    await logger.debug(`OpenAI API response received`, { 
      choices: response.choices?.length,
      hasContent: !!response.choices?.[0]?.message?.content,
      fullResponse: JSON.stringify(response, null, 2)
    });

    const summary = response.choices[0].message.content?.trim() || '';
    
    await logger.debug(`Raw summary content`, { 
      rawContent: response.choices[0].message.content,
      trimmedContent: summary,
      contentLength: summary.length
    });
    
    if (!summary) {
      await logger.warn(`Empty summary received from OpenAI for: ${article.title}. Trying fallback model...`);
      
      // Try with a fallback model
      try {
        const fallbackResponse = await client.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_completion_tokens: 150,
          temperature: 0.7
        });
        
        const fallbackSummary = fallbackResponse.choices[0].message.content?.trim() || '';
        if (fallbackSummary) {
          await logger.info(`Fallback model succeeded for: ${article.title}`);
          return fallbackSummary;
        }
      } catch (fallbackError) {
        await logger.error(`Fallback model also failed`, { error: fallbackError.message });
      }
      
      return article.description || "No summary available.";
    }
    
    await logger.info(`Successfully generated summary for: ${article.title}`, { 
      summaryLength: summary.length 
    });
    return summary;
    
  } catch (error) {
    await logger.error("Error summarizing article", { 
      title: article.title, 
      error: error.message 
    });
    return article.description || "No summary available.";
  }
}

// Send news to Telegram with summarize buttons
async function sendToTelegram(articles) {
  if (articles.length === 0) {
    console.log('No new articles to send');
    return;
  }

  try {
    console.log(`Sending ${articles.length} articles to Telegram`);
    
    // Send each article as a separate message with its own summarize button
    for (const article of articles.slice(0, 10)) { // Limit to 10 articles
      const message = `🏁 *F1 News Update*\n\n📰 *${article.title}*\n\n🔗 [Read Full Article](${article.link})\n📅 ${article.pubDate || 'Date not available'}`;
      
      const keyboard = {
        inline_keyboard: [[
          {
            text: '📝 Summarize with AI',
            callback_data: `summarize_${Buffer.from(article.id).toString('base64').slice(0, 50)}`
          }
        ]]
      };

      await bot.sendMessage(config.telegram.chatId, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: keyboard
      });

      // Store article data for callback reference
      global.articleCache = global.articleCache || new Map();
      global.articleCache.set(`summarize_${Buffer.from(article.id).toString('base64').slice(0, 50)}`, article);
      
      // Small delay between messages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    await logger.info(`Successfully sent ${articles.slice(0, 10).length} articles to Telegram`);
  } catch (error) {
    await logger.error('Error sending to Telegram', { error: error.message });
  }
}

// Main scraping function
async function scrapeNews() {
  const startTime = new Date();
  try {
    await logger.info('🏁 Starting F1 news scraping session');
    
    // Load existing articles
    const existingArticles = await loadNewsData();
    await logger.info(`Loaded ${existingArticles.length} existing articles from database`);
    
    // Fetch from all sources
    const rssArticles = await fetchRSSNews();
    const f1Articles = await scrapeF1Official();
    
    // Combine all articles
    const allArticles = [...rssArticles, ...f1Articles];
    await logger.info(`Total articles collected: ${allArticles.length} (RSS: ${rssArticles.length}, F1 Official: ${f1Articles.length})`);
    
    // Filter new articles
    const newArticles = await filterNewArticles(allArticles, existingArticles);
    
    if (newArticles.length > 0) {
      await logger.info(`Found ${newArticles.length} new articles to process`);
      
      // Send to Telegram
      await sendToTelegram(newArticles);
      
      // Save updated data
      const updatedArticles = [...existingArticles, ...newArticles];
      await saveNewsData(updatedArticles);
      
      const duration = new Date() - startTime;
      await logger.info(`✅ News scraping completed successfully in ${duration}ms`, {
        newArticles: newArticles.length,
        totalArticles: updatedArticles.length,
        duration: `${duration}ms`
      });
    } else {
      const duration = new Date() - startTime;
      await logger.info(`No new articles found. Scraping completed in ${duration}ms`);
    }
    
  } catch (error) {
    await logger.error('❌ Error in scraping process', { 
      error: error.message, 
      stack: error.stack 
    });
  }
}

// Initialize and start cron job
async function start() {
  await logger.info('🚀 Initializing F1 News Scraper...');
  
  await initializeDataFile();
  
  // Run immediately on start
  await logger.info('Running initial scraping...');
  await scrapeNews();
  
  // Schedule cron job
  cron.schedule(config.cronSchedule, async () => {
    await logger.info('⏰ Cron job triggered');
    await scrapeNews();
  });
  
  await logger.info(`📅 Cron job scheduled: ${config.cronSchedule}`);
  await logger.info('🎯 F1 News Scraper is running and ready!');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down F1 News Scraper...');
  process.exit(0);
});

// Test function for debugging summarization
async function testSummarization() {
  const testArticle = {
    title: "Test F1 Article",
    description: "This is a test F1 article about racing and drivers.",
    link: "https://example.com"
  };
  
  console.log("Testing summarization...");
  const summary = await summarizeArticle(testArticle);
  console.log("Result:", summary);
}

// Start the application
if (require.main === module) {
  // Uncomment the line below to test summarization
  // testSummarization().catch(console.error);
  start().catch(console.error);
}

module.exports = { scrapeNews, start, testSummarization };
