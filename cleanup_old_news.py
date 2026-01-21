import json
from datetime import datetime, timedelta
import os

def cleanup_old_news():
    json_file = os.path.join(os.path.dirname(__file__), 'news_data.json')

    # Read the JSON file
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Calculate the cutoff date (today minus 1 day, so anything older gets deleted)
    # This means entries from yesterday and today are kept
    cutoff_date = datetime.now() - timedelta(days=1)

    original_count = len(data.get('articles', []))

    # Filter articles to keep only those within the last day
    filtered_articles = []
    for article in data.get('articles', []):
        scraped_at = article.get('scrapedAt')
        if scraped_at:
            try:
                # Parse ISO format date (handles both with and without 'Z')
                article_date = datetime.fromisoformat(scraped_at.replace('Z', '+00:00'))
                # Convert to naive datetime for comparison
                article_date = article_date.replace(tzinfo=None)

                if article_date >= cutoff_date:
                    filtered_articles.append(article)
            except (ValueError, TypeError):
                # Keep articles with unparseable dates
                filtered_articles.append(article)
        else:
            # Keep articles without scrapedAt field
            filtered_articles.append(article)

    # Update the data
    data['articles'] = filtered_articles

    # Write back to file
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    deleted_count = original_count - len(filtered_articles)
    print(f"Cleanup complete!")
    print(f"Original articles: {original_count}")
    print(f"Remaining articles: {len(filtered_articles)}")
    print(f"Deleted articles: {deleted_count}")

if __name__ == "__main__":
    cleanup_old_news()
