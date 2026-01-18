# congress-to-insta
Code files used in my full pipeline in Google AppsScript that is bound to [a Google Sheet](https://docs.google.com/spreadsheets/d/1jR7iJsgD7mwk7vSgY7B_MoUBu9G6OgYscF13t-SD_4g/edit?usp=sharing). 
Automated Instagram account ([@yea.or.nay_USA](https://www.instagram.com/yea.or.nay_usa/))that posts summaries of newly passed US laws with visualized congressional voting records.

## Purpose
Educational tool for young Americans to stay informed about new legislation. Full motivation can be found in (drafted write-up)[https://docs.google.com/document/d/1Y43Ke7RZ8xVA0rX_uyYEeHsEKPS6bSW7CdWJpClqZNU/edit?usp=sharing].

## Data Source
All legislative data is pulled from [congress.gov](https://congress.gov) using the [Congress.gov API] (https://github.com/LibraryOfCongress/api.congress.gov/blob/main/Documentation/BillEndpoint.md)

## Technology Stack
- **Google Apps Script** - Automation engine
- **Google Sheets** - Data storage and processing
- **Google Slides** - Visual template generation
- **ImgBB API** - Image hosting
- **Instagram Graph API** - Publishing to Instagram
- **Congress.gov API** - Scraping from Law, Bill and House Roll Call Vote endpoints
- **Anthropic API** - Summarizing with Claude

## Files
- `scrapingScript.gs` - Collects data
- `claudeSummarization.gs` - Claude API integration
- `imageUrlCreation.gs` - Slide generation and image export
- `toInstagram.gs` - Instagram API integration

## Setup (CLASP integration for local development coming soon)
1. Copy Google Sheet template [link](https://docs.google.com/spreadsheets/d/1jR7iJsgD7mwk7vSgY7B_MoUBu9G6OgYscF13t-SD_4g/edit?usp=sharing)
2. Add Apps Script files to sheet (Extensions → Apps Script)
3. Configure API keys in CONFIG object
4. Set up daily time-based trigger

## Features
- ✅ Automated daily scraping & posting
- ✅ Prompt engineered summarization with Claude
- ✅ Transfers summary to Google Slides
- ✅ Creates public Image URL by uploading Slide 
- ✅ Two-step Instagram publishing (container creation + publishing)
- ✅ Rate limit protection
- ✅ Error handling and logging
- ✅ Tracks posting status in spreadsheet

## API Keys Required
- ImgBB API key (free)
- Instagram Graph API key (recommended [setup tutorial](https://www.youtube.com/watch?v=gkpmMEqcn4Q))
- Claude API key (purchase access tokens, <$5)
- Congress.gov API key

## Credits
Created by Elena Cura
Data from congress.gov
